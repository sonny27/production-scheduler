namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Capacity;
using Microsoft.Manufacturing.Document;
using Microsoft.Manufacturing.MachineCenter;
using Microsoft.Manufacturing.WorkCenter;

codeunit 91300 CF_ProductionSchedulerMgt
{
    procedure SetScenario(Value: Code[20])
    begin
        ScenarioCode := Value;
    end;

    procedure OperationSnapshot(Routing: Record "Prod. Order Routing Line"): JsonObject
    var
        TempDays: Record CF_SchedulerCapacityBuffer temporary;
        Resources: Dictionary of [Text, Boolean];
        Item: JsonObject;
        Scanned: Integer;
    begin
        Resources.Add(ResourceId(Routing.Type, Routing."No."), true);
        Item := OperationJson(Routing, Resources, TempDays, Scanned);
        Item.Add('orderScheduled', false);
        exit(Item);
    end;

    procedure StatusCaption(Setup: Record CF_ProductionSchedulerSetup): Text
    var
        Status: Enum "Production Order Status";
        Parts: List of [Text];
        Result: Text;
        Part: Text;
    begin
        if Setup.IncludeSimulated then
            Parts.Add(Format(Status::Simulated));
        if Setup.IncludePlanned then
            Parts.Add(Format(Status::Planned));
        if Setup.IncludeFirmPlanned then
            Parts.Add(Format(Status::"Firm Planned"));
        if Setup.IncludeReleased then
            Parts.Add(Format(Status::Released));
        foreach Part in Parts do begin
            if Result <> '' then
                Result += ', ';
            Result += Part;
        end;
        exit(Result);
    end;

    procedure BuildPayload(Setup: Record CF_ProductionSchedulerSetup; StartDate: Date; ViewDays: Integer; WorkCenterFilter: Code[20]; OrderFilter: Code[20]; DocumentFocus: Boolean): JsonObject
    var
        WorkCenter: Record "Work Center";
        Machine: Record "Machine Center";
        Scenario: Record CF_ScheduleScenario;
        TempProblemDays: Record CF_SchedulerCapacityBuffer temporary;
        Drafts: Codeunit CF_ScheduleDraftMgt;
        Resources: JsonArray;
        Operations: JsonArray;
        Warnings: JsonArray;
        Payload: JsonObject;
        ResourceIds: Dictionary of [Text, Boolean];
        UsedResources: Dictionary of [Text, Boolean];
        EndDate: Date;
    begin
        Setup.ValidateStatuses();
        if (StartDate = 0D) or (ViewDays < 1) or (ViewDays > 366) then
            Error(WindowErr);
        EndDate := StartDate + ViewDays;
        if DocumentFocus then
            Drafts.DocumentResources(ScenarioCode, Setup, OrderFilter, UsedResources);
        if WorkCenterFilter <> '' then
            WorkCenter.SetRange("No.", WorkCenterFilter);
        if WorkCenter.FindSet() then
            repeat
                if not DocumentFocus or UsedResources.ContainsKey('W:' + WorkCenter."No.") then begin
                    AddResource(Resources, ResourceIds, "Capacity Type"::"Work Center", WorkCenter."No.", '', WorkCenter.Name, true, StartDate, ViewDays, WorkCenter.Blocked, WorkCenter."Consolidated Calendar", TempProblemDays);
                    if not DocumentFocus or UsedResources.ContainsKey(ResourceId("Capacity Type"::"Work Center", WorkCenter."No.")) then
                        AddResource(Resources, ResourceIds, "Capacity Type"::"Work Center", WorkCenter."No.", 'W:' + WorkCenter."No.", DirectLbl, false, StartDate, ViewDays, WorkCenter.Blocked, WorkCenter."Consolidated Calendar", TempProblemDays);
                    Machine.SetRange("Work Center No.", WorkCenter."No.");
                    if Machine.FindSet() then
                        repeat
                            if not DocumentFocus or UsedResources.ContainsKey(ResourceId("Capacity Type"::"Machine Center", Machine."No.")) then
                                AddResource(Resources, ResourceIds, "Capacity Type"::"Machine Center", Machine."No.", 'W:' + WorkCenter."No.", Machine.Name, false, StartDate, ViewDays, Machine.Blocked or WorkCenter.Blocked, false, TempProblemDays);
                        until Machine.Next() = 0;
                end;
                if Resources.Count() > 200 then
                    Error(ResourceLimitErr);
            until WorkCenter.Next() = 0;

        if ScenarioCode = '' then
            Warnings.Add(SelectScenarioLbl)
        else begin
            Scenario.Get(ScenarioCode);
            Drafts.AddOperations(ScenarioCode, Setup, StartDate, EndDate, WorkCenterFilter, OrderFilter, DocumentFocus, ResourceIds, TempProblemDays, Operations);
            Drafts.AddScenarioWarnings(ScenarioCode, Warnings);
        end;
        if Resources.Count() = 0 then
            Warnings.Add(NoResourcesLbl);
        Payload.Add('resources', Resources);
        Payload.Add('operations', Operations);
        Payload.Add('warnings', Warnings);
        Payload.Add('start', CivilDateTime(StartDate, 0T));
        Payload.Add('end', CivilDateTime(EndDate, 0T));
        Payload.Add('today', Format(Today(), 0, 9));
        Payload.Add('currentTime', CurrentTimeText());
        Payload.Add('labels', Labels());
        Payload.Add('scope', ScopeLbl);
        Payload.Add('scenario', ScenarioCode);
        Payload.Add('scenarioName', Scenario.Description);
        Payload.Add('timeZone', TimeZoneLbl);
        Payload.Add('viewMode', ViewModeKey(Setup.DefaultViewMode));
        Payload.Add('excludeNonWorkingHours', Setup.ExcludeNonWorkingHours);
        exit(Payload);
    end;

    local procedure ViewModeKey(ViewMode: Enum CF_SchedulerViewMode): Text
    begin
        case ViewMode of
            ViewMode::Hour: exit('hour');
            ViewMode::Day: exit('day');
            ViewMode::Week: exit('week');
            ViewMode::Month: exit('month');
        end;
    end;

    local procedure AddResource(var Resources: JsonArray; var ResourceIds: Dictionary of [Text, Boolean]; ResourceType: Enum "Capacity Type"; ResourceNo: Code[20]; ParentId: Text; Name: Text; Summary: Boolean; StartDate: Date; ViewDays: Integer; Blocked: Boolean; Consolidated: Boolean; var TempProblemDays: Record CF_SchedulerCapacityBuffer temporary)
    var
        Calendar: Record "Calendar Entry";
        Need: Record "Prod. Order Capacity Need";
        Allocation: Record CF_ScheduleDraftAllocation;
        Machine: Record "Machine Center";
        Capacity: Codeunit CF_SchedulerCapacity;
        Drafts: Codeunit CF_ScheduleDraftMgt;
        Resource: JsonObject;
        Cell: JsonObject;
        Window: JsonObject;
        Days: JsonArray;
        Windows: JsonArray;
        LoadWindows: JsonArray;
        Id: Text;
        Day: Date;
        Index: Integer;
        CalendarCount: Integer;
        NeedCount: Integer;
        WorkCenterNo: Code[20];
        MinuteFactor: Decimal;
        AvailableByDate: Dictionary of [Date, Decimal];
        AllocatedByDate: Dictionary of [Date, Decimal];
        AvailableMinutes: Decimal;
        AllocatedMinutes: Decimal;
        IsDirect: Boolean;
    begin
        if Resources.Count() >= 200 then
            Error(ResourceLimitErr);
        Id := ResourceId(ResourceType, ResourceNo);
        IsDirect := (ResourceType = ResourceType::"Work Center") and not Summary;
        if Summary then
            Id := 'W:' + ResourceNo;
        ResourceIds.Add(Id, true);
        Resource.Add('id', Id);
        Resource.Add('parent', ParentId);
        Resource.Add('name', ResourceNo + ' - ' + Name);
        Resource.Add('summary', Summary);
        Resource.Add('direct', IsDirect);
        Resource.Add('blocked', Blocked);
        Resource.Add('consolidated', Consolidated);
        WorkCenterNo := ResourceNo;
        if ResourceType = ResourceType::"Machine Center" then begin
            Machine.Get(ResourceNo);
            WorkCenterNo := Machine."Work Center No.";
        end;
        MinuteFactor := Capacity.Minutes(1, WorkCenterNo);
        Calendar.SetRange("Capacity Type", ResourceType);
        Calendar.SetRange("No.", ResourceNo);
        Calendar.SetRange(Date, StartDate, StartDate + ViewDays - 1);
        if Calendar.FindSet() then
            repeat
                CalendarCount += 1;
                if CalendarCount > 6000 then
                    Error(CalendarLimitErr, ResourceNo);
                if not IsDirect then
                    AccumulateMinutes(AvailableByDate, Calendar.Date, Calendar."Capacity (Effective)" * MinuteFactor);
                if Calendar."Capacity (Effective)" > 0 then begin
                    Clear(Window);
                    Window.Add('start', CivilDateTime(Calendar.Date, Calendar."Starting Time"));
                    if (Calendar."Ending Time" = 0T) and (Calendar."Starting Time" <> 0T) then
                        Window.Add('end', CivilDateTime(Calendar.Date + 1, 0T))
                    else
                        Window.Add('end', CivilDateTime(Calendar.Date, Calendar."Ending Time"));
                    Window.Add('minutes', Calendar."Capacity (Effective)" * MinuteFactor);
                    Windows.Add(Window);
                end;
            until Calendar.Next() = 0;
        Resource.Add('missingCalendar', CalendarCount = 0);
        Resource.Add('windows', Windows);
        Capacity.SetCommittedFilter(Need);
        Need.SetRange(Date, StartDate, StartDate + ViewDays - 1);
        if ResourceType = ResourceType::"Machine Center" then begin
            Need.SetRange(Type, ResourceType);
            Need.SetRange("No.", ResourceNo);
        end else begin
            Need.SetRange("Work Center No.", ResourceNo);
            if IsDirect then
                Need.SetRange(Type, ResourceType::"Work Center");
        end;
        if Need.FindSet() then
            repeat
                NeedCount += 1;
                if NeedCount > 50000 then
                    Error(DisplayNeedsLimitErr, ResourceNo);
                if not Drafts.ReplacesNeed(ScenarioCode, Need) then begin
                    AccumulateMinutes(AllocatedByDate, Need.Date, Need."Allocated Time" * MinuteFactor);
                    AddLoadWindow(LoadWindows, CreateDateTime(Need.Date, Need."Starting Time"),
                        IntervalEnd(Need.Date, Need."Starting Time", Need."Ending Time"), Need."Allocated Time" * MinuteFactor);
                end;
            until Need.Next() = 0;
        if ScenarioCode <> '' then begin
            Drafts.FilterAllocations(Allocation, ScenarioCode, ResourceType, ResourceNo, IsDirect);
            Allocation.SetRange(CapacityDate, StartDate, StartDate + ViewDays - 1);
            if Allocation.FindSet() then
                repeat
                    NeedCount += 1;
                    if NeedCount > 50000 then
                        Error(DisplayNeedsLimitErr, ResourceNo);
                    AccumulateMinutes(AllocatedByDate, Allocation.CapacityDate, Allocation.Minutes);
                    AddLoadWindow(LoadWindows, Allocation.StartDateTime, Allocation.EndDateTime, Allocation.Minutes);
                until Allocation.Next() = 0;
        end;
        for Index := 0 to ViewDays - 1 do begin
            Day := StartDate + Index;
            AllocatedMinutes := 0;
            AvailableMinutes := 0;
            if AllocatedByDate.ContainsKey(Day) then
                AllocatedMinutes := AllocatedByDate.Get(Day);
            if AvailableByDate.ContainsKey(Day) then
                AvailableMinutes := AvailableByDate.Get(Day);
            if not IsDirect then begin
                TempProblemDays.Init();
                TempProblemDays.ResourceType := ResourceType;
                TempProblemDays.ResourceNo := ResourceNo;
                TempProblemDays.CapacityDate := Day;
                TempProblemDays.AvailableMinutes := AvailableMinutes;
                TempProblemDays.AllocatedMinutes := AllocatedMinutes;
                TempProblemDays.Insert();
            end;
            Clear(Cell);
            Cell.Add('date', Format(Day, 0, 9));
            Cell.Add('available', AvailableMinutes);
            Cell.Add('allocated', AllocatedMinutes);
            Days.Add(Cell);
        end;
        Resource.Add('days', Days);
        Resource.Add('loadWindows', LoadWindows);
        Resources.Add(Resource);
    end;

    local procedure IntervalEnd(ValueDate: Date; StartTime: Time; EndTime: Time): DateTime
    begin
        if (EndTime = 0T) and (StartTime <> 0T) then
            exit(CreateDateTime(ValueDate + 1, 0T));
        exit(CreateDateTime(ValueDate, EndTime));
    end;

    local procedure AddLoadWindow(var Windows: JsonArray; StartDateTime: DateTime; EndDateTime: DateTime; Minutes: Decimal)
    var
        Window: JsonObject;
    begin
        if Minutes = 0 then
            exit;
        Window.Add('start', CivilDateTime(DT2Date(StartDateTime), DT2Time(StartDateTime)));
        Window.Add('end', CivilDateTime(DT2Date(EndDateTime), DT2Time(EndDateTime)));
        Window.Add('minutes', Minutes);
        Windows.Add(Window);
    end;

    local procedure AccumulateMinutes(var Totals: Dictionary of [Date, Decimal]; CapacityDate: Date; Value: Decimal)
    var
        Existing: Decimal;
    begin
        if Totals.Get(CapacityDate, Existing) then
            Totals.Set(CapacityDate, Existing + Value)
        else
            Totals.Add(CapacityDate, Value);
    end;

    local procedure OperationJson(Routing: Record "Prod. Order Routing Line"; ResourceIds: Dictionary of [Text, Boolean]; var TempProblemDays: Record CF_SchedulerCapacityBuffer temporary; var ScannedProblemNeeds: Integer): JsonObject
    var
        Order: Record "Production Order";
        Line: Record "Prod. Order Line";
        Need: Record "Prod. Order Capacity Need";
        State: Record CF_ProductionScheduleState;
        Capacity: Codeunit CF_SchedulerCapacity;
        Item: JsonObject;
        LineItem: JsonObject;
        Lines: JsonArray;
        ProblemTexts: JsonArray;
        Problems: List of [Text];
        Problem: Text;
        Quantity: Decimal;
        ItemNos: Text;
        Issue: Text;
        EditingIssue: Text;
        Id: Text;
        Finished: Boolean;
        Late: Boolean;
    begin
        Order.Get(Routing.Status, Routing."Prod. Order No.");
        SetLines(Line, Routing);
        if Line.FindSet() then
            repeat
                Quantity += Line.Quantity;
                if ItemNos <> '' then
                    ItemNos += ', ';
                ItemNos += Line."Item No.";
                Clear(LineItem);
                LineItem.Add('lineNo', Line."Line No.");
                LineItem.Add('item', Line."Item No.");
                LineItem.Add('description', Line.Description);
                LineItem.Add('quantity', Line.Quantity);
                LineItem.Add('unit', Line."Unit of Measure Code");
                Lines.Add(LineItem);
            until Line.Next() = 0;
        Id := ResourceId(Routing.Type, Routing."No.");
        EditingIssue := EditIssue(Routing);
        Issue := EditingIssue;
        Finished := Routing."Routing Status" = Routing."Routing Status"::Finished;
        if (EditingIssue <> SimulatedLbl) and (EditingIssue <> FinishedLbl) then
            Capacity.AddProblem(Problems, EditingIssue);
        if not ResourceIds.ContainsKey(Id) then begin
            Issue := MissingResourceLbl;
            Capacity.AddProblem(Problems, MissingResourceLbl);
        end;
        if (Routing."Starting Date" = 0D) or (Routing."Ending Date" = 0D) then begin
            Issue := MissingDatesLbl;
            Capacity.AddProblem(Problems, MissingDatesLbl);
        end;
        if (Routing."Starting Date" <> 0D) and (Routing."Ending Date" <> 0D) and
           (Routing."Ending Date-Time" <= Routing."Starting Date-Time")
        then begin
            Issue := MissingDatesLbl;
            Capacity.AddProblem(Problems, MissingDatesLbl);
        end;
        SetNeeds(Need, Routing);
        if Need.IsEmpty() and (Issue = '') then
            Issue := MissingNeedsLbl;
        if not Finished and (Routing.Status <> Routing.Status::Simulated) then begin
            Need.SetFilter("Allocated Time", '>0');
            if Need.IsEmpty() then
                Capacity.AddProblem(Problems, MissingNeedsLbl);
            Capacity.OperationProblems(Routing, Need, TempProblemDays, ScannedProblemNeeds, Problems);
        end;
        if not Finished then begin
            if (Order."Due Date" <> 0D) and (Order."Ending Date" > Order."Due Date") then begin
                Late := true;
                Capacity.AddProblem(Problems, PastDueLbl);
            end;
            if (Routing."Ending Date" <> 0D) and (Routing."Ending Date" < Today()) then begin
                Late := true;
                Capacity.AddProblem(Problems, PastEndLbl);
            end;
        end;
        foreach Problem in Problems do
            ProblemTexts.Add(Problem);
        Item.Add('id', Format(Routing.SystemId, 0, 4));
        Item.Add('version', Version(Routing));
        Item.Add('resource', Id);
        Item.Add('order', Routing."Prod. Order No.");
        Item.Add('operation', Routing."Operation No.");
        Item.Add('previousOperation', Routing."Previous Operation No.");
        Item.Add('nextOperation', Routing."Next Operation No.");
        Item.Add('routingReference', Routing."Routing Reference No.");
        Item.Add('routingNo', Routing."Routing No.");
        Item.Add('successors', RelatedOperationIds(Routing, Routing."Next Operation No."));
        Item.Add('predecessors', RelatedOperationIds(Routing, Routing."Previous Operation No."));
        Item.Add('lines', Lines);
        Item.Add('description', Routing.Description);
        Item.Add('status', Format(Routing.Status));
        Item.Add('statusId', Routing.Status.AsInteger());
        Item.Add('finished', Finished);
        Item.Add('item', ItemNos);
        Item.Add('quantity', Quantity);
        Item.Add('start', CivilDateTime(Routing."Starting Date", Routing."Starting Time"));
        Item.Add('end', CivilDateTime(Routing."Ending Date", Routing."Ending Time"));
        Item.Add('due', Format(Order."Due Date", 0, 9));
        Item.Add('confirmed', IsConfirmed(Routing));
        Item.Add('issue', Issue);
        Item.Add('problems', ProblemTexts);
        Item.Add('editable', (EditingIssue = '') and Routing.WritePermission() and State.WritePermission());
        Item.Add('canConfirm', (Issue = '') and Routing.WritePermission() and State.WritePermission());
        Item.Add('late', Late);
        Item.Add('effort', StrSubstNo(EffortLbl, Routing."Setup Time", Routing."Setup Time Unit of Meas. Code",
            Routing."Run Time", Routing."Run Time Unit of Meas. Code", Routing."Lot Size", Routing."Concurrent Capacities"));
        exit(Item);
    end;

    local procedure RelatedOperationIds(Routing: Record "Prod. Order Routing Line"; OperationFilter: Code[30]): JsonArray
    var
        Related: Record "Prod. Order Routing Line";
        Result: JsonArray;
    begin
        if OperationFilter = '' then
            exit(Result);
        Related.SetRange(Status, Routing.Status);
        Related.SetRange("Prod. Order No.", Routing."Prod. Order No.");
        Related.SetRange("Routing Reference No.", Routing."Routing Reference No.");
        Related.SetRange("Routing No.", Routing."Routing No.");
        Related.SetFilter("Operation No.", OperationFilter);
        if Related.FindSet() then
            repeat
                if Result.Count() >= 1000 then
                    Error(OperationLimitErr);
                Result.Add(Format(Related.SystemId, 0, 4));
            until Related.Next() = 0;
        exit(Result);
    end;

    procedure ResourceId(ResourceType: Enum "Capacity Type"; ResourceNo: Code[20]): Text
    begin
        if ResourceType = ResourceType::"Machine Center" then
            exit('M:' + ResourceNo);
        exit('D:' + ResourceNo);
    end;

    procedure AddNavigation(var Payload: JsonObject; FirstDate: Date; MaximumDays: Integer; ViewStart: Date; ViewDays: Integer)
    var
        Navigation: JsonObject;
        RangeNavigationLbl: Label 'Display range';
    begin
        Navigation.Add('start', CivilDateTime(FirstDate, 0T));
        Navigation.Add('days', MaximumDays);
        Navigation.Add('viewDays', ViewDays);
        Navigation.Add('offset', ViewStart - FirstDate);
        Navigation.Add('caption', RangeNavigationLbl);
        Payload.Add('navigation', Navigation);
    end;

    procedure EditIssue(Routing: Record "Prod. Order Routing Line"): Text
    var
        WorkCenter: Record "Work Center";
        Machine: Record "Machine Center";
        Line: Record "Prod. Order Line";
        Related: Record "Prod. Order Routing Line";
    begin
        if Routing.Status = Routing.Status::Simulated then
            exit(SimulatedLbl);
        if not (Routing.Status in [Routing.Status::Planned, Routing.Status::"Firm Planned", Routing.Status::Released]) or
           (Routing."Routing Status" = Routing."Routing Status"::Finished)
        then
            exit(FinishedLbl);
        if not WorkCenter.Get(Routing."Work Center No.") then
            exit(MissingResourceLbl);
        if WorkCenter.Blocked then
            exit(BlockedLbl);
        if Routing.Type = Routing.Type::"Machine Center" then begin
            if not Machine.Get(Routing."No.") then
                exit(MissingResourceLbl);
            if Machine.Blocked then
                exit(BlockedLbl);
            if Machine."Work Center No." <> WorkCenter."No." then
                exit(MissingResourceLbl);
        end else
            if Routing."No." <> WorkCenter."No." then
                exit(MissingResourceLbl);
        if (WorkCenter."Unit of Measure Code" = '') then
            exit(UnitLbl);
        if (Routing."Setup Time" = 0) and (Routing."Run Time" = 0) then
            exit(ZeroEffortLbl);
        SetLines(Line, Routing);
        if Line.IsEmpty() then
            exit(MissingLineLbl);
        Line.Reset();
        Line.SetRange(Status, Routing.Status);
        Line.SetRange("Prod. Order No.", Routing."Prod. Order No.");
        Line.SetRange("Routing Type", Line."Routing Type"::Parallel);
        if not Line.IsEmpty() then
            exit(ComplexLbl);
        Related.SetRange(Status, Routing.Status);
        Related.SetRange("Prod. Order No.", Routing."Prod. Order No.");
        if Related.FindSet() then
            repeat
                if Related."Send-Ahead Quantity" <> 0 then
                    exit(ComplexLbl);
                if Related."Schedule Manually" then
                    exit(ManualLbl);
                if WorkCenter.Get(Related."Work Center No.") then
                    if WorkCenter."Subcontractor No." <> '' then
                        exit(ComplexLbl);
            until Related.Next() = 0;
        exit('');
    end;

    procedure LineVersion(Routing: Record "Prod. Order Routing Line"): Text
    var
        Line: Record "Prod. Order Line";
        Result: Text;
    begin
        SetLines(Line, Routing);
        if Line.FindSet() then
            repeat
                Result += Format(Line.SystemId, 0, 4) + ':' + Format(Line.SystemRowVersion, 0, 9) + ';';
            until Line.Next() = 0;
        if StrLen(Result) > 2048 then
            Error(LineLimitErr);
        exit(Result);
    end;

    procedure Version(Routing: Record "Prod. Order Routing Line"): Text
    var
        Order: Record "Production Order";
    begin
        Order.Get(Routing.Status, Routing."Prod. Order No.");
        exit(Format(Routing.SystemRowVersion, 0, 9) + ':' + Format(Order.SystemRowVersion, 0, 9) + ':' + LineVersion(Routing));
    end;

    procedure IsConfirmed(Routing: Record "Prod. Order Routing Line"): Boolean
    var
        State: Record CF_ProductionScheduleState;
    begin
        if not State.Get(Routing.SystemId) then
            exit(false);
        exit(State.PlannerConfirmed and (State.RoutingVersion = Routing.SystemRowVersion) and (State.LineVersion = LineVersion(Routing)));
    end;

    procedure SetLines(var Line: Record "Prod. Order Line"; Routing: Record "Prod. Order Routing Line")
    begin
        Line.SetRange(Status, Routing.Status);
        Line.SetRange("Prod. Order No.", Routing."Prod. Order No.");
        Line.SetRange("Routing Reference No.", Routing."Routing Reference No.");
        Line.SetRange("Routing No.", Routing."Routing No.");
    end;

    procedure SetNeeds(var Need: Record "Prod. Order Capacity Need"; Routing: Record "Prod. Order Routing Line")
    begin
        Need.SetRange(Status, Routing.Status);
        Need.SetRange("Prod. Order No.", Routing."Prod. Order No.");
        Need.SetRange("Routing Reference No.", Routing."Routing Reference No.");
        Need.SetRange("Routing No.", Routing."Routing No.");
        Need.SetRange("Operation No.", Routing."Operation No.");
        Need.SetRange("Requested Only", false);
    end;

    procedure CurrentTimeText(): Text
    var
        CurrentInstant: DateTime;
    begin
        CurrentInstant := CurrentDateTime();
        exit(CivilDateTime(DT2Date(CurrentInstant), DT2Time(CurrentInstant)));
    end;

    procedure ShowHelp()
    begin
        Message(HelpLbl + '\\' + WorkingDisplayHelpLbl + '\\' + SelectionHelpLbl, ScopeLbl, TimeZoneLbl, LegendLbl, DropHelpLbl);
    end;

    procedure CivilDateTime(ValueDate: Date; ValueTime: Time): Text
    begin
        if ValueDate = 0D then
            exit('');
        if ValueTime = 0T then
            exit(Format(ValueDate, 0, 9) + 'T00:00:00');
        exit(Format(ValueDate, 0, 9) + 'T' + ConvertStr(Format(ValueTime, 0, '<Hours24,2>:<Minutes,2>:<Seconds,2>'), ' ', '0'));
    end;

    procedure ParseCivilDateTime(Value: Text): DateTime
    var
        ValueDate: Date;
        ValueTime: Time;
    begin
        if (StrLen(Value) <> 19) or (CopyStr(Value, 11, 1) <> 'T') then
            Error(DateTimeErr);
        if not Evaluate(ValueDate, CopyStr(Value, 1, 10), 9) or not Evaluate(ValueTime, CopyStr(Value, 12, 8), 9) then
            Error(DateTimeErr);
        if (ValueDate = 0D) or (CivilDateTime(ValueDate, ValueTime) <> Value) then
            Error(DateTimeErr);
        exit(CreateDateTime(ValueDate, ValueTime));
    end;

    procedure GetOperation(Id: Text; var Routing: Record "Prod. Order Routing Line")
    var
        OperationId: Guid;
    begin
        if not Evaluate(OperationId, Id) then
            Error(OperationErr);
        if not Routing.GetBySystemId(OperationId) then
            Error(OperationErr);
    end;

    procedure OpenOperation(Id: Text; OpenRouting: Boolean)
    var
        Routing: Record "Prod. Order Routing Line";
        Order: Record "Production Order";
    begin
        GetOperation(Id, Routing);
        if OpenRouting then begin
            Routing.SetRange(Status, Routing.Status);
            Routing.SetRange("Prod. Order No.", Routing."Prod. Order No.");
            Routing.SetRange("Routing Reference No.", Routing."Routing Reference No.");
            Routing.SetRange("Routing No.", Routing."Routing No.");
            Page.Run(Page::"Prod. Order Routing", Routing);
        end else begin
            Order.Get(Routing.Status, Routing."Prod. Order No.");
            case Order.Status of
                Order.Status::Simulated:
                    Page.Run(Page::"Simulated Production Order", Order);
                Order.Status::Planned:
                    Page.Run(Page::"Planned Production Order", Order);
                Order.Status::"Firm Planned":
                    Page.Run(Page::"Firm Planned Prod. Order", Order);
                Order.Status::Released:
                    Page.Run(Page::"Released Production Order", Order);
                else
                    Error(FinishedLbl);
            end;
        end;
    end;

    procedure SetRoutingFilters(var Routing: Record "Prod. Order Routing Line"; WorkCenterFilter: Code[20]; OrderFilter: Code[20])
    begin
        Routing.SetRange(Status, Routing.Status::Simulated, Routing.Status::Released);
        Routing.SetFilter("Routing Status", '<>%1', Routing."Routing Status"::Finished);
        if WorkCenterFilter <> '' then
            Routing.SetRange("Work Center No.", WorkCenterFilter);
        if OrderFilter <> '' then
            Routing.SetRange("Prod. Order No.", OrderFilter);
    end;

    procedure Included(Setup: Record CF_ProductionSchedulerSetup; Status: Enum "Production Order Status"): Boolean
    begin
        case Status of
            Status::Simulated: exit(Setup.IncludeSimulated);
            Status::Planned: exit(Setup.IncludePlanned);
            Status::"Firm Planned": exit(Setup.IncludeFirmPlanned);
            Status::Released: exit(Setup.IncludeReleased);
        end;
        exit(false);
    end;

    local procedure Labels(): JsonObject
    var
        Routing: Record "Prod. Order Routing Line";
        Line: Record "Prod. Order Line";
        Result: JsonObject;
    begin
        Result.Add('operationDetails', Routing.TableCaption());
        Result.Add('operationNo', Routing.FieldCaption("Operation No."));
        Result.Add('description', Routing.FieldCaption(Description));
        Result.Add('startingDateTime', Routing.FieldCaption("Starting Date-Time"));
        Result.Add('endingDateTime', Routing.FieldCaption("Ending Date-Time"));
        Result.Add('status', Routing.FieldCaption(Status));
        Result.Add('orderNo', Routing.FieldCaption("Prod. Order No."));
        Result.Add('previousOperation', Routing.FieldCaption("Previous Operation No."));
        Result.Add('nextOperation', Routing.FieldCaption("Next Operation No."));
        Result.Add('productionLine', Line.TableCaption());
        Result.Add('lineNo', Line.FieldCaption("Line No."));
        Result.Add('itemNo', Line.FieldCaption("Item No."));
        Result.Add('quantity', Line.FieldCaption(Quantity));
        Result.Add('unit', Line.FieldCaption("Unit of Measure Code"));
        Result.Add('resource', ResourceLbl);
        Result.Add('confirmation', ConfirmationLbl);
        Result.Add('finished', Format(Routing."Routing Status"::Finished));
        Result.Add('routingScope', RoutingScopeLbl);
        Result.Add('routingUnscheduled', RoutingUnscheduledLbl);
        Result.Add('unscheduled', UnscheduledLbl);
        Result.Add('dropHelp', DropHelpLbl);
        Result.Add('dropInvalid', DropInvalidLbl);
        Result.Add('nonWorkingScope', NonWorkingScopeLbl);
        Result.Add('noWorkingDays', NoWorkingDaysLbl);
        Result.Add('hiddenClippedStart', HiddenClippedStartLbl);
        Result.Add('hiddenDragRange', HiddenDragRangeLbl);
        Result.Add('title', TitleLbl);
        Result.Add('currentTime', CurrentTimeLbl);
        Result.Add('unconfirmed', UnconfirmedLbl);
        Result.Add('empty', EmptyLbl);
        Result.Add('schedule', ScheduleLbl);
        Result.Add('confirm', ConfirmLbl);
        Result.Add('order', OrderLbl);
        Result.Add('openBCRouting', OpenBCRoutingLbl);
        Result.Add('routing', RoutingLbl);
        Result.Add('draftDetails', RoutingLbl);
        Result.Add('editDraft', EditDraftLbl);
        Result.Add('zoomDocument', ZoomDocumentLbl);
        Result.Add('resetDraft', ResetDraftLbl);
        Result.Add('commitOrder', CommitOrderLbl);
        Result.Add('draftScenario', DraftScenarioLbl);
        Result.Add('start', StartLbl);
        Result.Add('end', EndLbl);
        Result.Add('due', DueLbl);
        Result.Add('day', DayLbl);
        Result.Add('week', WeekLbl);
        Result.Add('hour', HourLbl);
        Result.Add('hourScope', HourScopeLbl);
        Result.Add('hourDragRange', HourDragRangeLbl);
        Result.Add('hourClippedStart', HourClippedStartLbl);
        Result.Add('month', MonthLbl);
        Result.Add('busy', BusyLbl);
        Result.Add('failed', FailedLbl);
        Result.Add('capacity', CapacityLbl);
        Result.Add('noCapacity', NoCapacityLbl);
        Result.Add('missingCalendar', MissingCalendarLbl);
        Result.Add('blocked', BlockedLbl);
        Result.Add('direct', DirectCapacityLbl);
        Result.Add('legend', LegendLbl);
        Result.Add('noWorkingPortion', NoWorkingPortionLbl);
        Result.Add('hiddenDaysScope', HiddenDaysScopeLbl);
        Result.Add('problem', ProblemLbl);
        Result.Add('problemScope', ProblemScopeLbl);
        Result.Add('minutes', MinutesLbl);
        Result.Add('available', AvailableLbl);
        Result.Add('allocated', AllocatedLbl);
        Result.Add('remaining', RemainingLbl);
        Result.Add('select', SelectLbl);
        Result.Add('late', LateLbl);
        Result.Add('pending', PendingLbl);
        Result.Add('confirmed', ConfirmedLbl);
        Result.Add('invalidDate', DateTimeErr);
        Result.Add('search', SearchLbl);
        Result.Add('selectionToolbar', SelectionToolbarLbl);
        Result.Add('selectedCount', SelectedCountLbl);
        Result.Add('selectChain', SelectChainLbl);
        Result.Add('selectFollowing', SelectFollowingLbl);
        Result.Add('clearSelection', ClearSelectionLbl);
        Result.Add('lockSelected', LockSelectedLbl);
        Result.Add('unlockSelected', UnlockSelectedLbl);
        Result.Add('lockStep', LockStepLbl);
        Result.Add('unlockStep', UnlockStepLbl);
        Result.Add('positionLocked', PositionLockedLbl);
        Result.Add('lockedNoEdit', LockedNoEditLbl);
        Result.Add('noSelection', NoSelectionLbl);
        Result.Add('noLockChange', NoLockChangeLbl);
        Result.Add('selectionUnavailable', SelectionUnavailableLbl);
        Result.Add('invalidSelectionCommand', InvalidSelectionCommandLbl);
        Result.Add('saving', SavingLbl);
        Result.Add('saved', SavedLbl);
        Result.Add('saveFailed', SaveFailedLbl);
        Result.Add('viewStateFailed', ViewStateFailedLbl);
        exit(Result);
    end;

    var
        ScenarioCode: Code[20];
        NoWorkingPortionLbl: Label 'No working-calendar portion of this operation is visible. This marker is not its duration. Check resource calendars, dates and display filters, or disable Exclude Non-working Hours in setup.';
        WorkingDisplayHelpLbl: Label 'Operation bars include elapsed non-working hours by default. Enable Exclude Non-working Hours in Production Scheduler Setup and refresh to show separate working-calendar portions with gaps. Selecting or dragging any piece refers to the same draft operation. A small dashed red marker means no working portion is visible; hover for guidance. This option changes display only, not routing dates or required capacity.';
        HiddenDaysScopeLbl: Label '%1 days hidden by weekend or non-working-day filters. %2 matching operations fall entirely on hidden days. %3 hidden days contain allocated capacity. Use Date View > Show Weekends and, if enabled, Show All Days to inspect them. Scheduling and capacity are unchanged.', Comment = '%1 = hidden days, %2 = operations, %3 = hidden days with load; substituted in the control';
        HelpLbl: Label '%1\\%2\\%3\\%4\\Right-click a step for Schedule Details, Edit Draft Start, Zoom to Document, Reset Order Draft from BC, Commit This Order to BC, Open Production Order or Open BC Routing. Open BC Routing opens the standard routing for that operation''s production order and routing reference. Some actions depend on permissions and step eligibility.\\Search, the bottom display-range slider and selected-step details are hidden by default. Enable them under Schedule Options > Display Options. Hiding search clears its text filter. Date View actions remain available without the slider. Unscheduled rows appear under work centres when matching steps exist; use Hide Unscheduled to hide them. Overlapping operation bars stack vertically and rows expand automatically, including short minimum-width bars in overview views. Stacking changes only the display, not dates or capacity.\\Click a scheduled step to highlight its routing links. Links to steps outside the visible dates, filters or expanded resource rows are not drawn.\\Use Auto Schedule to plan eligible unscheduled steps in this scenario. In Auto Schedule Results, Override and Save to Draft keeps an unchanged imported order''s existing dates and allocations and marks its unfinished steps scheduled, after confirming capacity overload including competing orders. Invalid demand and stale drafts cannot be overridden. Unsupported routing remains protected from recalculation and BC commit. Use Commit Entire Schedule to BC to apply all changed orders, including hidden orders; review the per-order results.', Comment = '%1 = draft scope, %2 = time zone, %3 = colour legend, %4 = drag instructions';
        SelectScenarioLbl: Label 'Choose or create a scenario, then use Import Orders to copy the orders matching Schedule Options. BC is not changed until Commit to BC.';
        EditDraftLbl: Label 'Edit Draft Start';
        ZoomDocumentLbl: Label 'Zoom to Document';
        ResetDraftLbl: Label 'Reset Order Draft from BC';
        CommitOrderLbl: Label 'Commit This Order to BC';
        DraftScenarioLbl: Label 'Draft scenario';
        WindowErr: Label 'Select a starting date and a window from 1 to 366 days.';
        DisplayNeedsLimitErr: Label 'More than 50,000 capacity-need entries were found for resource %1 in the display period. Narrow the date range.', Comment = '%1 = resource number';
        ResourceLimitErr: Label 'More than 200 resource rows were found. Select a work centre to narrow the schedule.';
        OperationLimitErr: Label 'Too many production operations or orders were found. Select a work centre or production order to narrow the schedule. No partial schedule is displayed.';
        CalendarLimitErr: Label 'More than 6,000 calendar intervals were found for resource %1. Narrow the date window.', Comment = '%1 = resource number';
        LineLimitErr: Label 'This operation references too many production order lines for the basic scheduler.';
        NoResourcesLbl: Label 'No work centres match this view.';
        DirectLbl: Label 'Direct work centre operations';
        MissingResourceLbl: Label 'The assigned work or machine centre is missing, inconsistent, or outside this view.';
        MissingDatesLbl: Label 'Missing routing dates. Use Schedule to request a start after correcting any routing setup issues.';
        MissingNeedsLbl: Label 'No calculated capacity needs. Refresh the production order before confirming.';
        EffortLbl: Label 'Setup: %1 %2; run: %3 %4; lot size: %5; concurrent capacity: %6.', Comment = '%1 = setup, %2 = setup unit, %3 = run, %4 = run unit, %5 = lot, %6 = concurrency';
        SimulatedLbl: Label 'Simulated operations are view-only; their capacity is not committed load.';
        FinishedLbl: Label 'Finished operations or orders cannot be scheduled.';
        BlockedLbl: Label 'The resource is blocked.';
        UnitLbl: Label 'The work centre needs a capacity unit of measure.';
        ZeroEffortLbl: Label 'The operation has no setup or run effort. Review it in the standard routing page.';
        MissingLineLbl: Label 'No matching production order line exists.';
        ComplexLbl: Label 'Parallel, send-ahead or subcontracting orders are view-only in phase one. Use the standard routing page.';
        ManualLbl: Label 'Orders containing manually fixed routing operations are view-only. Use the standard routing page.';
        DateTimeErr: Label 'Enter a valid start date and time in the Business Central session time zone.';
        OperationErr: Label 'The operation no longer exists or its identifier is invalid. Refresh the scheduler.';
        ScopeLbl: Label 'Draft only: edits and Auto Schedule do not update BC. Capacity replaces this scenario''s imported orders with draft allocations and includes competing BC orders. Other scenarios are excluded. Use Commit to BC to apply changes.';
        TimeZoneLbl: Label 'All times use the Business Central session time zone, not the browser time zone.';
        TitleLbl: Label 'Production Scheduler';
        CurrentTimeLbl: Label 'Current time';
        UnconfirmedLbl: Label 'Unscheduled / awaiting planner confirmation';
        UnscheduledLbl: Label 'Unscheduled';
        EmptyLbl: Label 'No operations in this view.';
        ScheduleLbl: Label 'Save draft start';
        ConfirmLbl: Label 'Schedule existing draft dates';
        OrderLbl: Label 'Open production order';
        OpenBCRoutingLbl: Label 'Open BC Routing';
        RoutingLbl: Label 'Schedule Details';
        StartLbl: Label 'Start';
        EndLbl: Label 'Finish';
        DueLbl: Label 'Due';
        DayLbl: Label 'Day';
        WeekLbl: Label 'Week';
        HourLbl: Label 'Hour';
        HourScopeLbl: Label 'Hour view shows the full day. Light-blue intervals are non-working hours. Days without working calendar capacity are pale blue on weekends and near-white on weekdays.';
        HourDragRangeLbl: Label 'Drop within the visible timeline, or right-click the step and choose Edit Draft Start.';
        HourClippedStartLbl: Label 'The actual start is outside the visible timeline. Right-click and choose Edit Draft Start instead of dragging this clipped bar.';
        MonthLbl: Label 'Month';
        BusyLbl: Label 'Working...';
        FailedLbl: Label 'The request failed. The displayed dates have not been accepted. Refresh before retrying.';
        CapacityLbl: Label 'Daily capacity in hours: allocated / available';
        NoCapacityLbl: Label 'No capacity';
        MissingCalendarLbl: Label 'No calculated calendar entries in this window. Calculate the resource calendar in Business Central.';
        DirectCapacityLbl: Label 'Direct load only; fill compares direct demand with the parent work-centre capacity, not an additional capacity pool. Parent totals include both direct and machine demand.';
        LegendLbl: Label 'Unscheduled steps appear under each work centre; their base width represents work duration. Days without working calendar capacity are pale blue on weekends and near-white on weekdays in every view; missing calendars remain unshaded. Hour view shows partial non-working hours in light blue. Red operation border: scheduling problem. Bottom meters show utilisation: muted green below 100%, solid light red at 100%, red stripes above 100% or for load without capacity. Hover an hour in the capacity strip for its percentage and allocated/available minutes; Hour view has no visible percentage labels. Other views show percentages at the top. No capacity means a percentage cannot be calculated. Hour view uses timed allocations and effective calendar capacity for each hour; other views use daily totals. Narrow Month and fitted overview cells omit percentage text; hover daily totals for details. Parent totals already include child load. Competing BC orders are included; search and problem filters do not change capacity meters.';
        ProblemLbl: Label 'Scheduling problem';
        ProblemScopeLbl: Label '%1 problem steps are hidden. Capacity totals and Auto Schedule still include their load and eligible operations. Enable Include Problem Steps in Schedule Options to show them.', Comment = '%1 = hidden problem count';
        PastDueLbl: Label 'The production order finishes after its due date.';
        PastEndLbl: Label 'This unfinished operation has an ending date before today.';
        MinutesLbl: Label 'minutes';
        AvailableLbl: Label 'Available';
        AllocatedLbl: Label 'Allocated';
        RemainingLbl: Label 'Remaining';
        SelectLbl: Label 'Select an operation to view details or schedule it.';
        LateLbl: Label 'Late';
        PendingLbl: Label 'Awaiting confirmation';
        ConfirmedLbl: Label 'Confirmed';
        SearchLbl: Label 'Find order, item or operation (capacity totals do not change)';
        ResourceLbl: Label 'Resource';
        ConfirmationLbl: Label 'Planner confirmation';
        RoutingScopeLbl: Label 'Routing links for order %1: %2 visible; %3 hidden by the current view, filters or collapsed rows.', Comment = '%1 = order number, %2 = visible links, %3 = hidden links; substituted in the control';
        RoutingUnscheduledLbl: Label 'Schedule or confirm at least one step in this order to show routing links.';
        DropHelpLbl: Label 'Drag an unscheduled step onto its assigned resource row to schedule it. Drag an individual timeline step horizontally to adjust its draft start. Click a step to highlight its routing links.';
        DropInvalidLbl: Label 'Drop an editable unplanned step onto its assigned resource row within the displayed dates and hours. Resource reassignment is not supported.';
        NonWorkingScopeLbl: Label '%1 non-working days hidden. %2 matching operations fall entirely on hidden days. %3 hidden days still contain allocated capacity. Use Show All Days to inspect them. Scheduling and daily capacity values are unchanged.', Comment = '%1 = hidden days, %2 = operations, %3 = hidden days with load; substituted in the control';
        NoWorkingDaysLbl: Label 'No visible days in this date range. Use Date View > Show Weekends, Show All Days or change Schedule Options. Check resource calendars if non-working days are hidden.';
        HiddenClippedStartLbl: Label 'The actual start is outside the visible periods. Right-click and choose Edit Draft Start instead of dragging this clipped bar.';
        HiddenDragRangeLbl: Label 'Drop within the visible dates and hours, or right-click the step and choose Edit Draft Start.';
        SelectionHelpLbl: Label 'Ctrl+click (Cmd+click on Mac) steps to add or remove them from the selection. The last clicked step is shown in the details. Use Select Routing Chain or Select Following Steps to select related steps of the same production order routing, then Lock Selected or Unlock Selected. Locked steps show a lock icon, cannot be dragged or edited manually and keep their draft position. Right-click a step to lock or unlock it. Dragging always moves one step only.';
        SelectionToolbarLbl: Label 'Step selection';
        SelectedCountLbl: Label '%1 selected', Comment = '%1 = number of selected steps, substituted in the control';
        SelectChainLbl: Label 'Select Routing Chain';
        SelectFollowingLbl: Label 'Select Following Steps';
        ClearSelectionLbl: Label 'Clear Selection';
        LockSelectedLbl: Label 'Lock Selected';
        UnlockSelectedLbl: Label 'Unlock Selected';
        LockStepLbl: Label 'Lock Position';
        UnlockStepLbl: Label 'Unlock Position';
        PositionLockedLbl: Label 'Position locked';
        LockedNoEditLbl: Label 'This step''s position is locked. Unlock it before dragging or editing its start.';
        NoSelectionLbl: Label 'Select at least one step first. Click a step, or Ctrl+click to select several.';
        NoLockChangeLbl: Label 'The selected steps already have this lock state. Nothing was changed.';
        SelectionUnavailableLbl: Label 'Selection actions are unavailable while the scheduler is busy or must be refreshed.';
        InvalidSelectionCommandLbl: Label 'Unsupported selection command.';
        SavingLbl: Label 'Saving draft...';
        SavedLbl: Label 'Draft saved.';
        SaveFailedLbl: Label 'The draft change was not saved. Refresh before retrying.';
        ViewStateFailedLbl: Label 'The scroll position and selection could not be remembered for this session. The schedule is unaffected.';
}
