namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Capacity;
using Microsoft.Manufacturing.Document;
using Microsoft.Manufacturing.MachineCenter;
using Microsoft.Manufacturing.WorkCenter;

codeunit 91307 CF_ScheduleDraftMgt
{
    procedure LockScenario(ScenarioCode: Code[20])
    var
        Scenario: Record CF_ScheduleScenario;
    begin
        Scenario.LockTable();
        Scenario.Get(ScenarioCode);
        Scenario.Revision += 1;
        Scenario.Modify();
    end;

    procedure GetOperation(ScenarioCode: Code[20]; OperationText: Text; var Draft: Record CF_ScheduleDraftOperation)
    var
        OperationId: Guid;
    begin
        if (ScenarioCode = '') or not Evaluate(OperationId, OperationText) then
            Error(SelectErr);
        if not Draft.Get(ScenarioCode, OperationId) then
            Error(MissingErr);
    end;

    procedure Version(Draft: Record CF_ScheduleDraftOperation): Text
    var
        DraftOrder: Record CF_ScheduleDraftOrder;
    begin
        DraftOrder.Get(Draft.ScenarioCode, Draft.Status, Draft.OrderNo);
        exit(Draft.ScenarioCode + ':' + Format(DraftOrder.Revision, 0, 9) + ':' + Format(Draft.SystemRowVersion, 0, 9));
    end;

    procedure CheckVersion(Draft: Record CF_ScheduleDraftOperation; Expected: Text)
    begin
        if Version(Draft) <> Expected then
            Error(StaleErr);
    end;

    procedure CheckBaseline(var DraftOrder: Record CF_ScheduleDraftOrder)
    begin
        if DraftOrder.GetBaseline() <> LiveVersion(DraftOrder.Status, DraftOrder.OrderNo) then
            Error(ConflictErr, DraftOrder.OrderNo);
    end;

    [CommitBehavior(CommitBehavior::Error)]
    procedure OverrideImportedOrder(ScenarioCode: Code[20]; OperationId: Guid; ExpectedRevision: Integer; var Warning: Text): Boolean
    var
        DraftOrder: Record CF_ScheduleDraftOrder;
        Draft: Record CF_ScheduleDraftOperation;
        Allocation: Record CF_ScheduleDraftAllocation;
        Routing: Record "Prod. Order Routing Line";
        Before: Record CF_SchedulerCapacityBuffer temporary;
        After: Record CF_SchedulerCapacityBuffer temporary;
        Capacity: Codeunit CF_SchedulerCapacity;
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        TotalMinutes: Decimal;
        AcceptedWarning: Text;
        Issue: Text;
    begin
        if not Draft.WritePermission() or not DraftOrder.WritePermission() then
            Error(OverridePermissionErr);
        GetOperation(ScenarioCode, Format(OperationId), Draft);
        DraftOrder.Get(ScenarioCode, Draft.Status, Draft.OrderNo);
        CheckBaseline(DraftOrder);
        if DraftOrder.Revision <> ExpectedRevision then
            Error(StaleErr);
        if DraftOrder.Changed or Draft.Finished or
           (Draft.Status = Draft.Status::Simulated) or (Draft.Status = Draft.Status::Finished)
        then
            Error(OverrideImportedErr);
        Draft.SetRange(ScenarioCode, ScenarioCode);
        Draft.SetRange(Status, Draft.Status);
        Draft.SetRange(OrderNo, Draft.OrderNo);
        if Draft.FindSet() then
            repeat
                if not Draft.Finished then begin
                    Routing.GetBySystemId(Draft.OperationId);
                    Issue := Mgt.EditIssue(Routing);
                    if Issue <> '' then
                        Error('%1: %2', Draft.OperationNo, Issue);
                    if ((Draft.Restriction <> '') and (Draft.Restriction <> ComplexErr)) or
                       (Draft.StartDateTime = 0DT) or (Draft.EndDateTime <= Draft.StartDateTime) or
                       (Draft.StartDateTime <> Draft.BaselineStart) or (Draft.EndDateTime <> Draft.BaselineEnd)
                    then
                        Error(OverrideImportedErr);
                    Allocation.Reset();
                    Allocation.SetRange(ScenarioCode, ScenarioCode);
                    Allocation.SetRange(OperationId, Draft.OperationId);
                    TotalMinutes := 0;
                    if Allocation.FindSet() then
                        repeat
                            if (Allocation.Minutes <= 0) or (Allocation.CapacityDate = 0D) or
                               (Allocation.StartDateTime = 0DT) or (Allocation.EndDateTime <= Allocation.StartDateTime) or
                               (Allocation.Status <> Draft.Status) or (Allocation.OrderNo <> Draft.OrderNo) or
                               (Allocation.ResourceType <> Draft.ResourceType) or (Allocation.ResourceNo <> Draft.ResourceNo) or
                               (Allocation.WorkCenterNo <> Draft.WorkCenterNo)
                            then
                                Error(OverrideImportedErr);
                            TotalMinutes += Allocation.Minutes;
                        until Allocation.Next() = 0;
                    if (TotalMinutes <= 0) or (Abs(TotalMinutes - Draft.WorkMinutes) > 0.00001) then
                        Error(OverrideImportedErr);
                end;
            until Draft.Next() = 0;
        Routing.GetBySystemId(OperationId);
        Capacity.SetScenario(ScenarioCode);
        Capacity.Snapshot(After, Routing);
        Before.Copy(After, true);
        Warning := Capacity.OverloadReport(Before, After, false);
        if Warning <> '' then
            if not Confirm(OverrideOverloadQst, false, Warning) then
                exit(false);
        AcceptedWarning := Warning;
        LockScenario(ScenarioCode);
        DraftOrder.Get(ScenarioCode, DraftOrder.Status, DraftOrder.OrderNo);
        CheckBaseline(DraftOrder);
        if DraftOrder.Revision <> ExpectedRevision then
            Error(StaleErr);
        Capacity.Snapshot(After, Routing);
        Before.Copy(After, true);
        Warning := Capacity.OverloadReport(Before, After, false);
        if Warning <> AcceptedWarning then
            Error(StaleErr);
        Draft.SetRange(Finished, false);
        Draft.ModifyAll(Confirmed, true);
        Draft.ModifyAll(Changed, true);
        DraftOrder.Revision += 1;
        DraftOrder.Changed := true;
        DraftOrder.Modify();
        exit(true);
    end;

    procedure LiveVersion(Status: Enum "Production Order Status"; OrderNo: Code[20]): Text
    var
        Order: Record "Production Order";
        Line: Record "Prod. Order Line";
        Routing: Record "Prod. Order Routing Line";
        Component: Record "Prod. Order Component";
        Need: Record "Prod. Order Capacity Need";
        Value: TextBuilder;
        Count: Integer;
    begin
        if not Order.Get(Status, OrderNo) then
            exit('MISSING');
        AppendVersion(Value, Order.SystemId, Order.SystemRowVersion, Count);
        Line.SetRange(Status, Status);
        Line.SetRange("Prod. Order No.", OrderNo);
        if Line.FindSet() then
            repeat
                AppendVersion(Value, Line.SystemId, Line.SystemRowVersion, Count);
            until Line.Next() = 0;
        Routing.SetRange(Status, Status);
        Routing.SetRange("Prod. Order No.", OrderNo);
        if Routing.FindSet() then
            repeat
                AppendVersion(Value, Routing.SystemId, Routing.SystemRowVersion, Count);
            until Routing.Next() = 0;
        Component.SetRange(Status, Status);
        Component.SetRange("Prod. Order No.", OrderNo);
        if Component.FindSet() then
            repeat
                AppendVersion(Value, Component.SystemId, Component.SystemRowVersion, Count);
            until Component.Next() = 0;
        Need.SetRange(Status, Status);
        Need.SetRange("Prod. Order No.", OrderNo);
        if Need.FindSet() then
            repeat
                AppendVersion(Value, Need.SystemId, Need.SystemRowVersion, Count);
            until Need.Next() = 0;
        exit(Value.ToText());
    end;

    procedure LiveCalendarVersion(Status: Enum "Production Order Status"; OrderNo: Code[20]): Text
    var
        CalendarVersions: Dictionary of [Text, Text];
        Count: Integer;
    begin
        exit(CalendarVersion(Status, OrderNo, CalendarVersions, Count));
    end;

    local procedure CalendarVersion(Status: Enum "Production Order Status"; OrderNo: Code[20]; var CalendarVersions: Dictionary of [Text, Text]; var Count: Integer): Text
    var
        Routing: Record "Prod. Order Routing Line";
        Seen: Dictionary of [Text, Boolean];
        Value: TextBuilder;
    begin
        Routing.SetRange(Status, Status);
        Routing.SetRange("Prod. Order No.", OrderNo);
        if Routing.FindSet() then
            repeat
                AppendCalendarVersion(Routing.Type, Routing."No.", Seen, CalendarVersions, Count, Value);
                if Routing.Type = Routing.Type::"Machine Center" then
                    AppendCalendarVersion("Capacity Type"::"Work Center", Routing."Work Center No.", Seen, CalendarVersions, Count, Value);
            until Routing.Next() = 0;
        exit(Value.ToText());
    end;

    local procedure AppendCalendarVersion(ResourceType: Enum "Capacity Type"; ResourceNo: Code[20]; var Seen: Dictionary of [Text, Boolean]; var CalendarVersions: Dictionary of [Text, Text]; var Count: Integer; var Value: TextBuilder)
    var
        Calendar: Record "Calendar Entry";
        ResourceVersion: TextBuilder;
        ResourceKey: Text;
    begin
        ResourceKey := Format(ResourceType.AsInteger(), 0, 9) + ':' + ResourceNo;
        if Seen.ContainsKey(ResourceKey) then
            exit;
        Seen.Add(ResourceKey, true);
        Value.Append(ResourceKey + ';');
        if not CalendarVersions.ContainsKey(ResourceKey) then begin
            Calendar.SetRange("Capacity Type", ResourceType);
            Calendar.SetRange("No.", ResourceNo);
            if Calendar.FindSet() then
                repeat
                    AppendVersion(ResourceVersion, Calendar.SystemId, Calendar.SystemRowVersion, Count);
                until Calendar.Next() = 0;
            CalendarVersions.Add(ResourceKey, ResourceVersion.ToText());
        end;
        Value.Append(CalendarVersions.Get(ResourceKey));
    end;

    procedure AddScenarioWarnings(ScenarioCode: Code[20]; var Warnings: JsonArray)
    var
        DraftOrder: Record CF_ScheduleDraftOrder;
        Conflicts: Integer;
        CalendarsChanged: Integer;
        CalendarsUnknown: Integer;
        Scanned: Integer;
        CalendarCount: Integer;
        CalendarVersions: Dictionary of [Text, Text];
    begin
        DraftOrder.SetRange(ScenarioCode, ScenarioCode);
        if DraftOrder.FindSet() then
            repeat
                Scanned += 1;
                if Scanned > 3000 then
                    Error(LimitErr);
                if DraftOrder.GetBaseline() <> LiveVersion(DraftOrder.Status, DraftOrder.OrderNo) then
                    Conflicts += 1;
                if DraftOrder.GetCalendarBaseline() = '' then
                    CalendarsUnknown += 1
                else
                    if DraftOrder.GetCalendarBaseline() <> CalendarVersion(DraftOrder.Status, DraftOrder.OrderNo, CalendarVersions, CalendarCount) then
                        CalendarsChanged += 1;
            until DraftOrder.Next() = 0;
        if Conflicts > 0 then
            Warnings.Add(StrSubstNo(ScenarioConflictLbl, Conflicts));
        if CalendarsChanged > 0 then
            Warnings.Add(StrSubstNo(CalendarChangedLbl, CalendarsChanged));
        if CalendarsUnknown > 0 then
            Warnings.Add(StrSubstNo(CalendarUnknownLbl, CalendarsUnknown));
    end;

    local procedure AppendVersion(var Value: TextBuilder; Id: Guid; RowVersion: BigInteger; var Count: Integer)
    begin
        Count += 1;
        if Count > 50000 then
            Error(LimitErr);
        Value.Append(Format(Id, 0, 4) + ':' + Format(RowVersion, 0, 9) + ';');
    end;

    procedure ImportScope(ScenarioCode: Code[20]; Setup: Record CF_ProductionSchedulerSetup; WorkCenterNo: Code[20]; OrderNo: Code[20]): Integer
    var
        Routing: Record "Prod. Order Routing Line";
        DraftOrder: Record CF_ScheduleDraftOrder;
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        Count: Integer;
        Scanned: Integer;
    begin
        Setup.ValidateStatuses();
        LockScenario(ScenarioCode);
        Mgt.SetRoutingFilters(Routing, WorkCenterNo, OrderNo);
        if Routing.FindSet() then
            repeat
                Scanned += 1;
                if Scanned > 3000 then
                    Error(LimitErr);
                if Mgt.Included(Setup, Routing.Status) then
                    if not DraftOrder.Get(ScenarioCode, Routing.Status, Routing."Prod. Order No.") then begin
                        ImportOrder(ScenarioCode, Routing.Status, Routing."Prod. Order No.", false);
                        Count += 1;
                    end;
            until Routing.Next() = 0;
        exit(Count);
    end;

    procedure ImportOrder(ScenarioCode: Code[20]; Status: Enum "Production Order Status"; OrderNo: Code[20]; Committed: Boolean)
    var
        Order: Record "Production Order";
        Routing: Record "Prod. Order Routing Line";
        Need: Record "Prod. Order Capacity Need";
        DraftOrder: Record CF_ScheduleDraftOrder;
        Draft: Record CF_ScheduleDraftOperation;
        Allocation: Record CF_ScheduleDraftAllocation;
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        Capacity: Codeunit CF_SchedulerCapacity;
        Baseline: Text;
        OrderRestriction: Text;
        Count: Integer;
        NeedCount: Integer;
        Exists: Boolean;
        LockedIds: List of [Guid];
    begin
        Order.Get(Status, OrderNo);
        Clear(CachedScenarioCode);
        Clear(ReplacedOperations);
        Baseline := LiveVersion(Status, OrderNo);
        Exists := DraftOrder.Get(ScenarioCode, Status, OrderNo);
        if not Exists then begin
            DraftOrder.Init();
            DraftOrder.ScenarioCode := ScenarioCode;
            DraftOrder.Status := Status;
            DraftOrder.OrderNo := OrderNo;
        end;
        DraftOrder.Revision += 1;
        DraftOrder.Changed := false;
        DraftOrder.ImportedAt := CurrentDateTime();
        if Committed then
            DraftOrder.CommittedAt := CurrentDateTime();
        DraftOrder.SetBaseline(Baseline);
        DraftOrder.SetCalendarBaseline(LiveCalendarVersion(Status, OrderNo));
        if Exists then
            DraftOrder.Modify()
        else
            DraftOrder.Insert();
        Draft.SetRange(ScenarioCode, ScenarioCode);
        Draft.SetRange(Status, Status);
        Draft.SetRange(OrderNo, OrderNo);
        if Committed then begin
            Draft.SetRange(PositionLocked, true);
            if Draft.FindSet() then
                repeat
                    LockedIds.Add(Draft.OperationId);
                until Draft.Next() = 0;
            Draft.SetRange(PositionLocked);
        end;
        Draft.DeleteAll();
        Allocation.SetRange(ScenarioCode, ScenarioCode);
        Allocation.SetRange(Status, Status);
        Allocation.SetRange(OrderNo, OrderNo);
        Allocation.DeleteAll();
        Routing.SetRange(Status, Status);
        Routing.SetRange("Prod. Order No.", OrderNo);
        if Routing.IsEmpty() then
            Error(NoRoutingErr, OrderNo);
        OrderRestriction := DraftRestriction(Routing);
        if Routing.FindSet() then
            repeat
                Count += 1;
                if Count > 1000 then
                    Error(LimitErr);
                Draft.Init();
                Draft.ScenarioCode := ScenarioCode;
                Draft.OperationId := Routing.SystemId;
                Draft.Status := Status;
                Draft.OrderNo := OrderNo;
                Draft.RoutingReferenceNo := Routing."Routing Reference No.";
                Draft.RoutingNo := Routing."Routing No.";
                Draft.OperationNo := Routing."Operation No.";
                Draft.SequenceNo := Routing."Sequence No. (Forward)";
                Draft.ResourceType := Routing.Type;
                Draft.ResourceNo := Routing."No.";
                Draft.WorkCenterNo := Routing."Work Center No.";
                Draft.Description := Routing.Description;
                Draft.StartDateTime := Routing."Starting Date-Time";
                Draft.EndDateTime := Routing."Ending Date-Time";
                Draft.BaselineStart := Draft.StartDateTime;
                Draft.BaselineEnd := Draft.EndDateTime;
                Draft.DueDate := Order."Due Date";
                Draft.PreviousOperationNo := Routing."Previous Operation No.";
                Draft.NextOperationNo := Routing."Next Operation No.";
                Draft.Finished := Routing."Routing Status" = Routing."Routing Status"::Finished;
                Draft.Confirmed := Mgt.IsConfirmed(Routing);
                Draft.PositionLocked := Committed and LockedIds.Contains(Routing.SystemId);
                Draft.Restriction := CopyStr(OrderRestriction, 1, MaxStrLen(Draft.Restriction));
                Draft.SetSnapshot(Mgt.OperationSnapshot(Routing));
                Need.Reset();
                Mgt.SetNeeds(Need, Routing);
                if Need.FindSet() then
                    repeat
                        NeedCount += 1;
                        if NeedCount > 50000 then
                            Error(LimitErr);
                        if not Draft.Finished and (Status <> Status::Simulated) and
                           (Abs(Need."Allocated Time" - Need."Needed Time") > 0.00001)
                        then
                            Draft.Restriction := InvalidNeedErr;
                        if Need."Allocated Time" > 0 then begin
                            Allocation.Init();
                            Allocation.ScenarioCode := ScenarioCode;
                            Allocation.OperationId := Draft.OperationId;
                            Allocation.EntryNo := NeedCount;
                            Allocation.Status := Status;
                            Allocation.OrderNo := OrderNo;
                            Allocation.ResourceType := Need.Type;
                            Allocation.ResourceNo := Need."No.";
                            Allocation.WorkCenterNo := Need."Work Center No.";
                            Allocation.CapacityDate := Need.Date;
                            if Need.Date <> 0D then begin
                                Allocation.StartDateTime := CreateDateTime(Need.Date, Need."Starting Time");
                                Allocation.EndDateTime := IntervalEnd(Need.Date, Need."Starting Time", Need."Ending Time");
                            end;
                            Allocation.Minutes := Capacity.Minutes(Need."Allocated Time", Need."Work Center No.");
                            Draft.WorkMinutes += Allocation.Minutes;
                            if (Need.Date = 0D) or (Allocation.EndDateTime <= Allocation.StartDateTime) or
                               (Need.Type <> Draft.ResourceType) or (Need."No." <> Draft.ResourceNo) or
                               (Need."Work Center No." <> Draft.WorkCenterNo)
                            then
                                Draft.Restriction := InvalidNeedErr;
                            Allocation.Insert();
                        end;
                    until Need.Next() = 0;
                if (Draft.WorkMinutes <= 0) and (Draft.Restriction = '') and
                   not Draft.Finished and (Status <> Status::Simulated)
                then
                    Draft.Restriction := NoNeedErr;
                Draft.Insert();
            until Routing.Next() = 0;
        Draft.Reset();
        Draft.SetRange(ScenarioCode, ScenarioCode);
        if Draft.Count() > 3000 then
            Error(LimitErr);
        if Baseline <> LiveVersion(Status, OrderNo) then
            Error(ConflictErr, OrderNo);
    end;

    local procedure DraftRestriction(var Routing: Record "Prod. Order Routing Line"): Text
    var
        WorkCenter: Record "Work Center";
        Machine: Record "Machine Center";
    begin
        if Routing.FindSet() then
            repeat
                if Routing."Routing Status" <> Routing."Routing Status"::Finished then begin
                    if (Routing."Wait Time" <> 0) or (Routing."Move Time" <> 0) or
                       (Routing."Concurrent Capacities" <> 1)
                    then
                        exit(ComplexErr);
                    if Routing.Type = Routing.Type::"Machine Center" then begin
                        if Machine.Get(Routing."No.") then
                            if Machine."Queue Time" <> 0 then
                                exit(ComplexErr);
                    end else
                        if WorkCenter.Get(Routing."Work Center No.") then
                            if WorkCenter."Queue Time" <> 0 then
                                exit(ComplexErr);
                end;
            until Routing.Next() = 0;
        exit('');
    end;

    procedure IntervalEnd(Day: Date; StartTime: Time; EndTime: Time): DateTime
    begin
        if (Day <> 0D) and (EndTime = 0T) and (StartTime <> 0T) then
            exit(CreateDateTime(Day + 1, 0T));
        exit(CreateDateTime(Day, EndTime));
    end;

    procedure ReplacesNeed(ScenarioCode: Code[20]; Need: Record "Prod. Order Capacity Need"): Boolean
    var
        Draft: Record CF_ScheduleDraftOperation;
    begin
        if ScenarioCode = '' then
            exit(false);
        if CachedScenarioCode <> ScenarioCode then begin
            Clear(ReplacedOperations);
            Draft.SetRange(ScenarioCode, ScenarioCode);
            if Draft.FindSet() then
                repeat
                    if ReplacedOperations.Count() >= 3000 then
                        Error(LimitErr);
                    ReplacedOperations.Add(RoutingKey(Draft.Status, Draft.OrderNo, Draft.RoutingReferenceNo, Draft.RoutingNo, Draft.OperationNo), true);
                until Draft.Next() = 0;
            CachedScenarioCode := ScenarioCode;
        end;
        exit(ReplacedOperations.ContainsKey(RoutingKey(Need.Status, Need."Prod. Order No.", Need."Routing Reference No.", Need."Routing No.", Need."Operation No.")));
    end;

    local procedure RoutingKey(Status: Enum "Production Order Status"; OrderNo: Code[20]; ReferenceNo: Integer; RoutingNo: Code[20]; OperationNo: Code[10]): Text
    var
        Parts: JsonArray;
        Value: Text;
    begin
        Parts.Add(Status.AsInteger());
        Parts.Add(OrderNo);
        Parts.Add(ReferenceNo);
        Parts.Add(RoutingNo);
        Parts.Add(OperationNo);
        Parts.WriteTo(Value);
        exit(Value);
    end;

    procedure FilterAllocations(var Allocation: Record CF_ScheduleDraftAllocation; ScenarioCode: Code[20]; ResourceType: Enum "Capacity Type"; ResourceNo: Code[20]; DirectOnly: Boolean)
    begin
        Allocation.SetRange(ScenarioCode, ScenarioCode);
        Allocation.SetRange(Status, Allocation.Status::Planned, Allocation.Status::Released);
        if ResourceType = ResourceType::"Machine Center" then begin
            Allocation.SetRange(ResourceType, ResourceType);
            Allocation.SetRange(ResourceNo, ResourceNo);
        end else begin
            Allocation.SetRange(WorkCenterNo, ResourceNo);
            if DirectOnly then
                Allocation.SetRange(ResourceType, ResourceType);
        end;
    end;

    procedure AddOperations(ScenarioCode: Code[20]; Setup: Record CF_ProductionSchedulerSetup; StartDate: Date; EndDate: Date; WorkCenterNo: Code[20]; OrderNo: Code[20]; Focus: Boolean; ResourceIds: Dictionary of [Text, Boolean]; var TempProblemDays: Record CF_SchedulerCapacityBuffer temporary; var Operations: JsonArray)
    var
        Draft: Record CF_ScheduleDraftOperation;
        DraftOrder: Record CF_ScheduleDraftOrder;
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        Conflicts: Dictionary of [Text, Boolean];
        OrderKey: Text;
        ScannedAllocations: Integer;
    begin
        Draft.SetRange(ScenarioCode, ScenarioCode);
        if WorkCenterNo <> '' then
            Draft.SetRange(WorkCenterNo, WorkCenterNo);
        if OrderNo <> '' then
            Draft.SetRange(OrderNo, OrderNo);
        if not Focus then
            Draft.SetRange(Finished, false);
        if Draft.FindSet() then
            repeat
                if Mgt.Included(Setup, Draft.Status) then
                    if Focus or not Draft.Confirmed or
                       ((Draft.StartDateTime < CreateDateTime(EndDate, 0T)) and (Draft.EndDateTime >= CreateDateTime(StartDate, 0T)))
                    then begin
                        OrderKey := Format(Draft.Status.AsInteger()) + ':' + Draft.OrderNo;
                        if not Conflicts.ContainsKey(OrderKey) then begin
                            DraftOrder.Get(ScenarioCode, Draft.Status, Draft.OrderNo);
                            Conflicts.Add(OrderKey, DraftOrder.GetBaseline() <> LiveVersion(Draft.Status, Draft.OrderNo));
                        end;
                        Operations.Add(OperationJson(Draft, ResourceIds, Conflicts.Get(OrderKey), TempProblemDays, ScannedAllocations));
                        if Operations.Count() > 1000 then
                            Error(LimitErr);
                    end;
            until Draft.Next() = 0;
    end;

    local procedure OperationJson(Draft: Record CF_ScheduleDraftOperation; ResourceIds: Dictionary of [Text, Boolean]; Conflict: Boolean; var TempProblemDays: Record CF_SchedulerCapacityBuffer temporary; var ScannedAllocations: Integer): JsonObject
    var
        Related: Record CF_ScheduleDraftOperation;
        DraftOrder: Record CF_ScheduleDraftOrder;
        Allocation: Record CF_ScheduleDraftAllocation;
        Routing: Record "Prod. Order Routing Line";
        State: Record CF_ProductionScheduleState;
        WorkCenter: Record "Work Center";
        Machine: Record "Machine Center";
        Capacity: Codeunit CF_SchedulerCapacity;
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        Item: JsonObject;
        Problems: List of [Text];
        ProblemArray: JsonArray;
        Problem: Text;
        Issue: Text;
        ResourceId: Text;
        Late: Boolean;
        ValidResource: Boolean;
        ValidDates: Boolean;
        Approved: Boolean;
        Reported: Dictionary of [Text, Boolean];
    begin
        Item := Draft.GetSnapshot();
        if Routing.GetBySystemId(Draft.OperationId) then
            Approved := Mgt.IsConfirmed(Routing);
        Item.Remove('approved');
        Item.Add('approved', Approved);
        Issue := Draft.Restriction;
        if (Issue = '') and not Conflict then
            if Routing.GetBySystemId(Draft.OperationId) then
                Issue := Mgt.EditIssue(Routing)
            else
                Issue := MissingErr;
        if Conflict then
            Issue := StrSubstNo(ConflictErr, Draft.OrderNo);
        if Conflict or (not Draft.Finished and (Draft.Status <> Draft.Status::Simulated)) then
            Capacity.AddProblem(Problems, Issue);
        ResourceId := Mgt.ResourceId(Draft.ResourceType, Draft.ResourceNo);
        ValidResource := WorkCenter.Get(Draft.WorkCenterNo);
        if ValidResource then
            if WorkCenter.Blocked then begin
                Issue := BlockedErr;
                Capacity.AddProblem(Problems, Issue);
            end;
        if ValidResource and (Draft.ResourceType = Draft.ResourceType::"Machine Center") then begin
            ValidResource := Machine.Get(Draft.ResourceNo);
            if ValidResource then begin
                ValidResource := Machine."Work Center No." = Draft.WorkCenterNo;
                if Machine.Blocked then begin
                    Issue := BlockedErr;
                    Capacity.AddProblem(Problems, Issue);
                end;
            end;
        end;
        if not ValidResource or not ResourceIds.ContainsKey(ResourceId) then begin
            Issue := ResourceErr;
            Capacity.AddProblem(Problems, Issue);
        end;
        ValidDates := (Draft.StartDateTime <> 0DT) and (Draft.EndDateTime > Draft.StartDateTime);
        if not ValidDates then
            Capacity.AddProblem(Problems, DatesLbl);
        Capacity.SetScenario(Draft.ScenarioCode);
        if not Draft.Finished and (Draft.Status <> Draft.Status::Simulated) and ValidResource then begin
            Allocation.SetRange(ScenarioCode, Draft.ScenarioCode);
            Allocation.SetRange(OperationId, Draft.OperationId);
            if Allocation.FindSet() then
                repeat
                    ScannedAllocations += 1;
                    if ScannedAllocations > 50000 then
                        Error(LimitErr);
                    Capacity.CheckProblemDay(Draft.ResourceType, Draft.ResourceNo, Allocation.CapacityDate, TempProblemDays, Reported, Problems);
                    if Draft.ResourceType = Draft.ResourceType::"Machine Center" then
                        Capacity.CheckProblemDay("Capacity Type"::"Work Center", Draft.WorkCenterNo, Allocation.CapacityDate, TempProblemDays, Reported, Problems);
                until Allocation.Next() = 0
            else
                Capacity.AddProblem(Problems, NoNeedErr);
        end;
        Late := not Draft.Finished and (Draft.EndDateTime <> 0DT) and
            (((Draft.DueDate <> 0D) and (DT2Date(Draft.EndDateTime) > Draft.DueDate)) or (DT2Date(Draft.EndDateTime) < Today()));
        if Late then
            Capacity.AddProblem(Problems, LateLbl);
        foreach Problem in Problems do
            ProblemArray.Add(Problem);
        DraftOrder.Get(Draft.ScenarioCode, Draft.Status, Draft.OrderNo);
        Related.SetRange(ScenarioCode, Draft.ScenarioCode);
        Related.SetRange(Status, Draft.Status);
        Related.SetRange(OrderNo, Draft.OrderNo);
        Related.SetRange(Confirmed, true);
        Item.Replace('orderScheduled', not Related.IsEmpty());
        Item.Replace('version', Version(Draft));
        Item.Replace('start', Mgt.CivilDateTime(DT2Date(Draft.StartDateTime), DT2Time(Draft.StartDateTime)));
        Item.Replace('end', Mgt.CivilDateTime(DT2Date(Draft.EndDateTime), DT2Time(Draft.EndDateTime)));
        Item.Add('workCenter', 'W:' + Draft.WorkCenterNo);
        Item.Add('workMinutes', Draft.WorkMinutes);
        Item.Replace('confirmed', Draft.Confirmed);
        Item.Replace('issue', Issue);
        Item.Replace('problems', ProblemArray);
        Item.Replace('editable', (Issue = '') and not Draft.PositionLocked and Draft.WritePermission());
        Item.Replace('canConfirm', (Issue = '') and ValidDates and Draft.WritePermission());
        Item.Replace('late', Late);
        Item.Add('draftChanged', Draft.Changed);
        Item.Add('positionLocked', Draft.PositionLocked);
        Item.Add('canLock', (Issue = '') and Draft.Confirmed and not Draft.Finished and ValidDates and Draft.WritePermission());
        Item.Add('canUnlock', Draft.PositionLocked and Draft.WritePermission());
        Item.Add('canReset', Draft.WritePermission());
        Item.Add('canCommit', DraftOrder.Changed and not Conflict and Routing.WritePermission() and State.WritePermission());
        exit(Item);
    end;

    procedure DocumentResources(ScenarioCode: Code[20]; Setup: Record CF_ProductionSchedulerSetup; OrderNo: Code[20]; var Used: Dictionary of [Text, Boolean])
    var
        Draft: Record CF_ScheduleDraftOperation;
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        Id: Text;
    begin
        Draft.SetRange(ScenarioCode, ScenarioCode);
        Draft.SetRange(OrderNo, OrderNo);
        if Draft.FindSet() then
            repeat
                if Mgt.Included(Setup, Draft.Status) then begin
                    Id := 'W:' + Draft.WorkCenterNo;
                    if not Used.ContainsKey(Id) then
                        Used.Add(Id, true);
                    Id := Mgt.ResourceId(Draft.ResourceType, Draft.ResourceNo);
                    if not Used.ContainsKey(Id) then
                        Used.Add(Id, true);
                end;
            until Draft.Next() = 0;
    end;

    var
        CachedScenarioCode: Code[20];
        ReplacedOperations: Dictionary of [Text, Boolean];
        SelectErr: Label 'Select a schedule scenario and a draft routing step.';
        MissingErr: Label 'This step is no longer in the scenario. Refresh the scheduler.';
        StaleErr: Label 'Another planner changed this draft order. Refresh before editing, resetting or committing.';
        ConflictErr: Label 'BC order %1 changed since import. Its draft is blocked. Use Reset Order Draft from BC and replan.', Comment = '%1 = order number';
        ScenarioConflictLbl: Label '%1 orders in this scenario have changed in BC since import, including orders outside the current view. Draft dates have not been overwritten. Review conflicts and reset affected orders before editing or committing.', Comment = '%1 = order count';
        CalendarChangedLbl: Label 'Working calendars changed since import for %1 orders. Saved draft dates are retained; review capacity and explicitly replan before committing.', Comment = '%1 = order count';
        CalendarUnknownLbl: Label '%1 orders were imported before calendar snapshots were available. Saved dates are retained, but historical calendar changes cannot be checked. Reset affected orders from BC to record a calendar baseline.', Comment = '%1 = order count';
        LimitErr: Label 'Draft safety limit exceeded (3,000 operations per scenario, 1,000 per order/view, or 50,000 related records). Use a smaller scenario.';
        NoRoutingErr: Label 'Order %1 has no routing. Refresh it in BC before importing.', Comment = '%1 = order number';
        ComplexErr: Label 'Draft recalculation currently supports serial routing with one concurrent capacity and no queue, wait or move time. This order remains view-only.';
        OverridePermissionErr: Label 'You do not have permission to save draft scheduling confirmations.';
        OverrideImportedErr: Label 'Override requires an unchanged imported order with valid BC dates and complete allocations. Invalid or partially consumed demand, simulated/finished orders and modified drafts cannot be overridden. Reset the order from BC and review its routing.';
        OverrideOverloadQst: Label 'The retained allocations exceed capacity, including competing orders:\%1\Keep the existing dates and allocations and mark this order scheduled in the draft anyway? BC will not be changed.', Comment = '%1 = overload report';
        InvalidNeedErr: Label 'Partially consumed, distributed, undated or inconsistent capacity demand is view-only. Review and refresh the order in BC.';
        NoNeedErr: Label 'No positive calculated capacity demand. Refresh the production order in BC and reset its draft.';
        ResourceErr: Label 'The assigned draft resource is missing, inconsistent, or outside this view.';
        BlockedErr: Label 'The assigned resource is blocked.';
        LateLbl: Label 'The draft step is past its planned finish or order due date.';
        DatesLbl: Label 'The draft has missing or invalid dates. Enter a start after correcting any scheduling restrictions.';
}
