namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Capacity;
using Microsoft.Manufacturing.Document;
using Microsoft.Manufacturing.MachineCenter;
using Microsoft.Manufacturing.WorkCenter;

codeunit 91301 CF_SchedulerCapacity
{
    procedure SetScenario(Value: Code[20])
    begin
        ScenarioCode := Value;
    end;

    procedure Minutes(Value: Decimal; WorkCenterNo: Code[20]): Decimal
    var
        WorkCenter: Record "Work Center";
        CalendarMgt: Codeunit "Shop Calendar Management";
    begin
        WorkCenter.Get(WorkCenterNo);
        WorkCenter.TestField("Unit of Measure Code");
        exit(Value * CalendarMgt.TimeFactor(WorkCenter."Unit of Measure Code") / 60000);
    end;

    procedure Available(ResourceType: Enum "Capacity Type"; ResourceNo: Code[20]; CapacityDate: Date): Decimal
    var
        Calendar: Record "Calendar Entry";
        Machine: Record "Machine Center";
        WorkCenterNo: Code[20];
    begin
        WorkCenterNo := ResourceNo;
        if ResourceType = ResourceType::"Machine Center" then begin
            Machine.Get(ResourceNo);
            WorkCenterNo := Machine."Work Center No.";
        end;
        Calendar.SetRange("Capacity Type", ResourceType);
        Calendar.SetRange("No.", ResourceNo);
        Calendar.SetRange(Date, CapacityDate);
        Calendar.CalcSums("Capacity (Effective)");
        exit(Minutes(Calendar."Capacity (Effective)", WorkCenterNo));
    end;

    procedure DayLoad(ResourceType: Enum "Capacity Type"; ResourceNo: Code[20]; CapacityDate: Date; DirectOnly: Boolean): Decimal
    var
        Need: Record "Prod. Order Capacity Need";
        Allocation: Record CF_ScheduleDraftAllocation;
        Machine: Record "Machine Center";
        Drafts: Codeunit CF_ScheduleDraftMgt;
        WorkCenterNo: Code[20];
        Total: Decimal;
        Count: Integer;
    begin
        SetCommittedFilter(Need);
        Need.SetRange(Date, CapacityDate);
        WorkCenterNo := ResourceNo;
        if ResourceType = ResourceType::"Machine Center" then begin
            Need.SetRange(Type, ResourceType);
            Need.SetRange("No.", ResourceNo);
            Machine.Get(ResourceNo);
            WorkCenterNo := Machine."Work Center No.";
        end else begin
            Need.SetRange("Work Center No.", ResourceNo);
            if DirectOnly then
                Need.SetRange(Type, ResourceType::"Work Center");
        end;
        if ScenarioCode = '' then begin
            Need.CalcSums("Allocated Time");
            exit(Minutes(Need."Allocated Time", WorkCenterNo));
        end;
        if Need.FindSet() then
            repeat
                Count += 1;
                if Count > 50000 then
                    Error(SnapshotLimitErr);
                if not Drafts.ReplacesNeed(ScenarioCode, Need) then
                    Total += Minutes(Need."Allocated Time", WorkCenterNo);
            until Need.Next() = 0;
        Drafts.FilterAllocations(Allocation, ScenarioCode, ResourceType, ResourceNo, DirectOnly);
        Allocation.SetRange(CapacityDate, CapacityDate);
        Allocation.CalcSums(Minutes);
        exit(Total + Allocation.Minutes);
    end;

    procedure Snapshot(var Buffer: Record CF_SchedulerCapacityBuffer temporary; Operation: Record "Prod. Order Routing Line")
    var
        Need: Record "Prod. Order Capacity Need";
        Allocation: Record CF_ScheduleDraftAllocation;
        Drafts: Codeunit CF_ScheduleDraftMgt;
        Selected: Boolean;
        Count: Integer;
        LoadMinutes: Decimal;
    begin
        Buffer.Reset();
        Buffer.DeleteAll();
        SetCommittedFilter(Need);
        if Need.FindSet() then
            repeat
                Count += 1;
                if Count > 50000 then
                    Error(SnapshotLimitErr);
                Selected :=
                    (Need.Status = Operation.Status) and
                    (Need."Prod. Order No." = Operation."Prod. Order No.") and
                    (Need."Routing Reference No." = Operation."Routing Reference No.") and
                    (Need."Routing No." = Operation."Routing No.") and
                    (Need."Operation No." = Operation."Operation No.");
                if not Drafts.ReplacesNeed(ScenarioCode, Need) then begin
                    LoadMinutes := Minutes(Need."Allocated Time", Need."Work Center No.");
                    AddLoad(Buffer, "Capacity Type"::"Work Center", Need."Work Center No.", Need.Date, LoadMinutes, Selected);
                    if Need.Type = Need.Type::"Machine Center" then
                        AddLoad(Buffer, Need.Type, Need."No.", Need.Date, LoadMinutes, Selected);
                end;
            until Need.Next() = 0;
        if ScenarioCode <> '' then begin
            Allocation.SetRange(ScenarioCode, ScenarioCode);
            Allocation.SetRange(Status, Allocation.Status::Planned, Allocation.Status::Released);
            if Allocation.FindSet() then
                repeat
                    Count += 1;
                    if Count > 50000 then
                        Error(SnapshotLimitErr);
                    Selected := (Allocation.Status = Operation.Status) and (Allocation.OrderNo = Operation."Prod. Order No.");
                    AddLoad(Buffer, "Capacity Type"::"Work Center", Allocation.WorkCenterNo, Allocation.CapacityDate, Allocation.Minutes, Selected);
                    if Allocation.ResourceType = Allocation.ResourceType::"Machine Center" then
                        AddLoad(Buffer, Allocation.ResourceType, Allocation.ResourceNo, Allocation.CapacityDate, Allocation.Minutes, Selected);
                until Allocation.Next() = 0;
        end;
        Buffer.Reset();
    end;

    procedure OperationProblems(Routing: Record "Prod. Order Routing Line"; var Need: Record "Prod. Order Capacity Need"; var TempDays: Record CF_SchedulerCapacityBuffer temporary; var ScannedNeeds: Integer; var Problems: List of [Text])
    var
        WorkCenter: Record "Work Center";
        Machine: Record "Machine Center";
        Calendar: Record "Calendar Entry";
        Reported: Dictionary of [Text, Boolean];
        HasAllocation: Boolean;
        LastDate: Date;
    begin
        if not WorkCenter.Get(Routing."Work Center No.") then
            exit;
        if WorkCenter."Unit of Measure Code" = '' then
            exit;
        if Routing.Type = Routing.Type::"Machine Center" then begin
            if not Machine.Get(Routing."No.") then
                exit;
            if Machine."Work Center No." <> WorkCenter."No." then
                exit;
        end else
            if Routing."No." <> WorkCenter."No." then
                exit;
        if Need.FindSet() then
            repeat
                ScannedNeeds += 1;
                if ScannedNeeds > 50000 then
                    Error(ProblemScanLimitErr);
                if Need."Allocated Time" > 0 then begin
                    HasAllocation := true;
                    if (Need.Type <> Routing.Type) or (Need."No." <> Routing."No.") or
                       (Need."Work Center No." <> Routing."Work Center No.")
                    then
                        AddProblem(Problems, NeedResourceLbl);
                    if Need.Date = 0D then
                        AddProblem(Problems, NeedDateLbl)
                    else begin
                        CheckProblemDay(Routing.Type, Routing."No.", Need.Date, TempDays, Reported, Problems);
                        if Routing.Type = Routing.Type::"Machine Center" then
                            CheckProblemDay("Capacity Type"::"Work Center", Routing."Work Center No.", Need.Date, TempDays, Reported, Problems);
                    end;
                end;
            until Need.Next() = 0;
        if not HasAllocation and (Routing."Starting Date" <> 0D) and (Routing."Ending Date" >= Routing."Starting Date") then begin
            LastDate := Routing."Ending Date";
            if (Routing."Ending Time" = 0T) and (LastDate > Routing."Starting Date") then
                LastDate -= 1;
            Calendar.SetRange("Capacity Type", Routing.Type);
            Calendar.SetRange("No.", Routing."No.");
            Calendar.SetRange(Date, Routing."Starting Date", LastDate);
            Calendar.SetFilter("Capacity (Effective)", '>0');
            if Calendar.IsEmpty() then
                AddProblem(Problems, StrSubstNo(NoCalendarLbl, Routing.Type, Routing."No."));
        end;
    end;

    procedure CheckProblemDay(ResourceType: Enum "Capacity Type"; ResourceNo: Code[20]; CapacityDate: Date; var TempDays: Record CF_SchedulerCapacityBuffer temporary; var Reported: Dictionary of [Text, Boolean]; var Problems: List of [Text])
    var
        ProblemKey: Text;
        Problem: Text;
    begin
        if not TempDays.Get(ResourceType, ResourceNo, CapacityDate) then begin
            TempDays.Init();
            TempDays.ResourceType := ResourceType;
            TempDays.ResourceNo := ResourceNo;
            TempDays.CapacityDate := CapacityDate;
            TempDays.AvailableMinutes := Available(ResourceType, ResourceNo, CapacityDate);
            TempDays.AllocatedMinutes := DayLoad(ResourceType, ResourceNo, CapacityDate, false);
            TempDays.Insert();
        end;
        ProblemKey := Format(ResourceType.AsInteger()) + ':' + ResourceNo;
        if TempDays.AvailableMinutes <= 0 then begin
            ProblemKey := 'none:' + ProblemKey;
            Problem := StrSubstNo(NoCapacityLbl, ResourceType, ResourceNo, CapacityDate);
        end else
            if TempDays.AllocatedMinutes > TempDays.AvailableMinutes + 0.001 then begin
                ProblemKey := 'over:' + ProblemKey;
                Problem := StrSubstNo(ProblemOverloadLbl, ResourceType, ResourceNo, CapacityDate,
                    Round(TempDays.AllocatedMinutes / 60, 0.01), Round(TempDays.AvailableMinutes / 60, 0.01));
            end;
        if (Problem <> '') and not Reported.ContainsKey(ProblemKey) then begin
            Reported.Add(ProblemKey, true);
            AddProblem(Problems, Problem);
        end;
    end;

    procedure AddProblem(var Problems: List of [Text]; Problem: Text)
    begin
        if (Problem <> '') and not Problems.Contains(Problem) then
            Problems.Add(Problem);
    end;

    procedure OverloadReport(var Before: Record CF_SchedulerCapacityBuffer temporary; var After: Record CF_SchedulerCapacityBuffer temporary; Block: Boolean): Text
    var
        OldLoad: Decimal;
        OldExcess: Decimal;
        NewExcess: Decimal;
        Report: TextBuilder;
        Count: Integer;
    begin
        After.Reset();
        if After.FindSet() then
            repeat
                OldLoad := 0;
                if Before.Get(After.ResourceType, After.ResourceNo, After.CapacityDate) then
                    OldLoad := Before.AllocatedMinutes;
                if (After.AllocatedMinutes <> OldLoad) or After.SelectedOperation then begin
                    After.AvailableMinutes := Available(After.ResourceType, After.ResourceNo, After.CapacityDate);
                    OldExcess := OldLoad - After.AvailableMinutes;
                    if OldExcess < 0 then
                        OldExcess := 0;
                    NewExcess := After.AllocatedMinutes - After.AvailableMinutes;
                    if (NewExcess > 0.001) and ((not Block) or (NewExcess > OldExcess + 0.001)) then begin
                        Count += 1;
                        if Count > 30 then
                            Error(TooManyOverloadsErr);
                        Report.AppendLine(StrSubstNo(OverloadLineLbl, After.ResourceType, After.ResourceNo,
                            After.CapacityDate, Round(After.AvailableMinutes / 60, 0.01),
                            Round(After.AllocatedMinutes / 60, 0.01), Round(NewExcess / 60, 0.01),
                            Format(After.AvailableMinutes, 0, 9), Format(After.AllocatedMinutes, 0, 9)));
                    end;
                end;
            until After.Next() = 0;
        exit(Report.ToText());
    end;

    procedure SetCommittedFilter(var Need: Record "Prod. Order Capacity Need")
    begin
        Need.SetRange(Status, Need.Status::Planned, Need.Status::Released);
        Need.SetRange("Requested Only", false);
    end;

    local procedure AddLoad(var Buffer: Record CF_SchedulerCapacityBuffer temporary; ResourceType: Enum "Capacity Type"; ResourceNo: Code[20]; CapacityDate: Date; Value: Decimal; Selected: Boolean)
    begin
        if not Buffer.Get(ResourceType, ResourceNo, CapacityDate) then begin
            Buffer.Init();
            Buffer.ResourceType := ResourceType;
            Buffer.ResourceNo := ResourceNo;
            Buffer.CapacityDate := CapacityDate;
            Buffer.Insert();
        end;
        Buffer.AllocatedMinutes += Value;
        Buffer.SelectedOperation := Buffer.SelectedOperation or Selected;
        Buffer.Modify();
    end;

    var
        ScenarioCode: Code[20];
        SnapshotLimitErr: Label 'Scheduling validation exceeds 50,000 capacity-need entries. No changes were saved. Review the planning data before scheduling with this basic scheduler.';
        ProblemScanLimitErr: Label 'Problem detection exceeds 50,000 operation capacity-need entries. Narrow the scheduler filters. No partial problem classification is displayed.';
        NeedResourceLbl: Label 'Calculated capacity needs do not match the assigned routing resource. Refresh the production order.';
        NeedDateLbl: Label 'A calculated capacity allocation has no date. Refresh the production order.';
        NoCalendarLbl: Label 'No working calendar capacity exists for %1 %2 in the operation date range.', Comment = '%1 = resource type, %2 = resource number';
        NoCapacityLbl: Label 'No working capacity: %1 %2 on %3.', Comment = '%1 = resource type, %2 = resource number, %3 = affected date';
        ProblemOverloadLbl: Label 'Overloaded capacity: %1 %2 on %3, allocated %4 h / available %5 h. Includes competing orders.', Comment = '%1 = resource type, %2 = resource number, %3 = affected date, %4 = allocated hours, %5 = available hours';
        TooManyOverloadsErr: Label 'More than 30 resource-days are overloaded by this change. No changes were saved. Resolve the overload in the standard routing and load pages first.';
        OverloadLineLbl: Label '%1 %2, %3: available %4 h, allocated %5 h, excess %6 h. Exact available/allocated minutes: %7 / %8.', Comment = '%1 = resource type, %2 = resource number, %3 = date, %4 = available hours, %5 = allocated hours, %6 = excess hours, %7 = exact available minutes, %8 = exact allocated minutes';
}
