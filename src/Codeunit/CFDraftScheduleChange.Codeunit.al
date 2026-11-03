namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Capacity;
using Microsoft.Manufacturing.Document;

codeunit 91308 CF_DraftScheduleChange
{
    trigger OnRun()
    begin
        ApplyChange();
    end;

    [CommitBehavior(CommitBehavior::Error)]
    local procedure ApplyChange()
    var
        Setup: Record CF_ProductionSchedulerSetup;
        DraftOrder: Record CF_ScheduleDraftOrder;
        Draft: Record CF_ScheduleDraftOperation;
        Following: Record CF_ScheduleDraftOperation;
        Allocation: Record CF_ScheduleDraftAllocation;
        Routing: Record "Prod. Order Routing Line";
        TempBefore: Record CF_SchedulerCapacityBuffer temporary;
        TempAfter: Record CF_SchedulerCapacityBuffer temporary;
        Capacity: Codeunit CF_SchedulerCapacity;
        Warning: Text;
        Cursor: DateTime;
    begin
        Setup.LoadDefaults();
        Setup.ValidateHorizon();
        Drafts.LockScenario(ScenarioCode);
        Drafts.GetOperation(ScenarioCode, OperationText, Draft);
        Drafts.CheckVersion(Draft, ExpectedVersion);
        DraftOrder.Get(ScenarioCode, Draft.Status, Draft.OrderNo);
        Drafts.CheckBaseline(DraftOrder);
        ValidateOperation(Draft);
        Routing.GetBySystemId(Draft.OperationId);
        Capacity.SetScenario(ScenarioCode);
        Capacity.Snapshot(TempBefore, Routing);
        ChangedCount := 0;
        ScannedIntervals := 0;
        if ConfirmOnly then begin
            if (Draft.StartDateTime = 0DT) or (Draft.EndDateTime <= Draft.StartDateTime) then
                Error(DatesErr);
            Draft.Confirmed := true;
            Draft.Changed := true;
            Draft.Modify();
        end else begin
            if RequestedStart = 0DT then
                Error(DatesErr);
            if Automatic then begin
                if (FirstDate = 0D) or (LastDate < FirstDate) or
                   (LastDate - FirstDate + 1 > Setup.MaximumScheduleDays) or
                   (Setup.AutoScheduleMethod <> Method)
                then
                    Error(HorizonErr);
            end else begin
                FirstDate := DT2Date(RequestedStart);
                LastDate := FirstDate + Setup.MaximumScheduleDays - 1;
            end;
            Following.SetCurrentKey(ScenarioCode, Status, OrderNo, RoutingReferenceNo, RoutingNo, SequenceNo, OperationNo);
            Following.SetRange(ScenarioCode, ScenarioCode);
            Following.SetRange(Status, Draft.Status);
            Following.SetRange(OrderNo, Draft.OrderNo);
            Following.SetRange(RoutingReferenceNo, Draft.RoutingReferenceNo);
            Following.SetRange(RoutingNo, Draft.RoutingNo);
            Following.SetFilter(SequenceNo, '>=%1', Draft.SequenceNo);
            if Following.FindSet() then
                repeat
                    ValidateOperation(Following);
                    Allocation.Reset();
                    Allocation.SetRange(ScenarioCode, ScenarioCode);
                    Allocation.SetRange(OperationId, Following.OperationId);
                    Allocation.DeleteAll();
                until Following.Next() = 0;
            Cursor := RequestedStart;
            if Following.FindSet() then
                repeat
                    if Following.SequenceNo = Draft.SequenceNo then
                        if Following.OperationId <> Draft.OperationId then
                            Error(DependencyErr);
                    Cursor := EarliestStart(Following, Cursor);
                    Calculate(Following, Cursor);
                    Cursor := Following.EndDateTime;
                    if Following.OperationId = Draft.OperationId then
                        Following.Confirmed := true;
                    Following.Changed := true;
                    Following.Modify();
                    ChangedCount += 1;
                until Following.Next() = 0;
        end;
        Capacity.Snapshot(TempAfter, Routing);
        Warning := Capacity.OverloadReport(TempBefore, TempAfter, Setup.OverloadPolicy = Setup.OverloadPolicy::Block);
        if Warning <> '' then begin
            if (Setup.OverloadPolicy = Setup.OverloadPolicy::Block) or
               (Automatic and (Method = Method::FiniteCapacity))
            then
                Error(OverloadErr, Warning);
            if Warning <> AcceptedWarning then
                Error('%1%2', ConfirmationPrefix(), Warning);
        end;
        DraftOrder.Revision += 1;
        ResultRevision := DraftOrder.Revision;
        DraftOrder.Changed := true;
        DraftOrder.Modify();
    end;

    local procedure ValidateOperation(Draft: Record CF_ScheduleDraftOperation)
    var
        Routing: Record "Prod. Order Routing Line";
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        Issue: Text;
    begin
        if Draft.Restriction <> '' then
            Error('%1: %2', Draft.OperationNo, Draft.Restriction);
        if Draft.Finished or (Draft.WorkMinutes <= 0) then
            Error(DatesErr);
        Routing.GetBySystemId(Draft.OperationId);
        Issue := Mgt.EditIssue(Routing);
        if Issue <> '' then
            Error('%1: %2', Draft.OperationNo, Issue);
    end;

    local procedure EarliestStart(Draft: Record CF_ScheduleDraftOperation; Cursor: DateTime): DateTime
    var
        Previous: Record CF_ScheduleDraftOperation;
    begin
        if Draft.PreviousOperationNo = '' then
            exit(Cursor);
        Previous.SetRange(ScenarioCode, ScenarioCode);
        Previous.SetRange(Status, Draft.Status);
        Previous.SetRange(OrderNo, Draft.OrderNo);
        Previous.SetRange(RoutingReferenceNo, Draft.RoutingReferenceNo);
        Previous.SetRange(RoutingNo, Draft.RoutingNo);
        Previous.SetFilter(OperationNo, Draft.PreviousOperationNo);
        if not Previous.FindSet() then
            Error(DependencyErr);
        repeat
            if (Previous.SequenceNo >= Draft.SequenceNo) or (Previous.EndDateTime = 0DT) then
                Error(DependencyErr);
            if Previous.EndDateTime > Cursor then
                Cursor := Previous.EndDateTime;
        until Previous.Next() = 0;
        exit(Cursor);
    end;

    local procedure Calculate(var Draft: Record CF_ScheduleDraftOperation; Cursor: DateTime)
    var
        Calendar: Record "Calendar Entry";
        Allocation: Record CF_ScheduleDraftAllocation;
        Remaining: Decimal;
        Work: Decimal;
        Rate: Decimal;
        SlotStart: DateTime;
        SlotEnd: DateTime;
        FreeEnd: DateTime;
        BusyEnd: DateTime;
        PriorEnd: DateTime;
        Finish: DateTime;
        EntryNo: Integer;
        Count: Integer;
    begin
        Remaining := Draft.WorkMinutes;
        PriorEnd := 0DT;
        Draft.StartDateTime := 0DT;
        Calendar.SetCurrentKey("Capacity Type", "No.", Date, "Starting Time");
        Calendar.SetRange("Capacity Type", Draft.ResourceType);
        Calendar.SetRange("No.", Draft.ResourceNo);
        Calendar.SetRange(Date, DT2Date(Cursor), LastDate);
        Calendar.SetFilter("Capacity (Effective)", '>0');
        if Calendar.FindSet() then
            repeat
                Count += 1;
                if Count > 6000 then
                    Error(HorizonErr);
                SlotStart := CreateDateTime(Calendar.Date, Calendar."Starting Time");
                SlotEnd := Drafts.IntervalEnd(Calendar.Date, Calendar."Starting Time", Calendar."Ending Time");
                if (SlotEnd <= SlotStart) or (SlotStart < PriorEnd) or
                   (Calendar.Capacity - Calendar."Absence Capacity" < 1) or (Calendar.Efficiency <= 0)
                then
                    Error(CalendarErr);
                PriorEnd := SlotEnd;
                if Cursor > SlotStart then
                    SlotStart := Cursor;
                Rate := Calendar.Efficiency / 100;
                while (SlotStart < SlotEnd) and (Remaining > 0.000001) do begin
                    FreeEnd := SlotEnd;
                    BusyEnd := SlotStart;
                    if Automatic and (Method = Method::FiniteCapacity) then
                        FindFreeWindow(Draft, Calendar.Date, SlotStart, FreeEnd, BusyEnd);
                    if BusyEnd > SlotStart then
                        SlotStart := BusyEnd
                    else begin
                        Work := (FreeEnd - SlotStart) / 60000 * Rate;
                        if Work > Remaining then
                            Work := Remaining;
                        Finish := SlotStart + Round(Work / Rate * 60000, 1, '>');
                        if Finish > FreeEnd then
                            Finish := FreeEnd;
                        if Draft.StartDateTime = 0DT then
                            Draft.StartDateTime := SlotStart;
                        Draft.EndDateTime := Finish;
                        EntryNo += 1;
                        Allocation.Init();
                        Allocation.ScenarioCode := ScenarioCode;
                        Allocation.OperationId := Draft.OperationId;
                        Allocation.EntryNo := EntryNo;
                        Allocation.Status := Draft.Status;
                        Allocation.OrderNo := Draft.OrderNo;
                        Allocation.ResourceType := Draft.ResourceType;
                        Allocation.ResourceNo := Draft.ResourceNo;
                        Allocation.WorkCenterNo := Draft.WorkCenterNo;
                        Allocation.CapacityDate := Calendar.Date;
                        Allocation.StartDateTime := SlotStart;
                        Allocation.EndDateTime := Finish;
                        Allocation.Minutes := Work;
                        Allocation.Insert();
                        Remaining -= Work;
                        SlotStart := Finish;
                    end;
                end;
            until (Calendar.Next() = 0) or (Remaining <= 0.000001);
        if (Remaining > 0.000001) or (Draft.StartDateTime = 0DT) or
           (Draft.StartDateTime < CreateDateTime(FirstDate, 0T)) or
           (Draft.EndDateTime > CreateDateTime(LastDate + 1, 0T))
        then
            Error(HorizonErr);
    end;

    local procedure FindFreeWindow(Draft: Record CF_ScheduleDraftOperation; Day: Date; Cursor: DateTime; var FreeEnd: DateTime; var BusyEnd: DateTime)
    var
        Need: Record "Prod. Order Capacity Need";
        Allocation: Record CF_ScheduleDraftAllocation;
        Capacity: Codeunit CF_SchedulerCapacity;
    begin
        Capacity.SetCommittedFilter(Need);
        Need.SetRange("Work Center No.", Draft.WorkCenterNo);
        Need.SetRange(Date, Day);
        Need.SetFilter("Allocated Time", '>0');
        if Need.FindSet() then
            repeat
                if not Drafts.ReplacesNeed(ScenarioCode, Need) then
                    ConsiderBusy(CreateDateTime(Need.Date, Need."Starting Time"),
                        Drafts.IntervalEnd(Need.Date, Need."Starting Time", Need."Ending Time"), Cursor, FreeEnd, BusyEnd);
            until Need.Next() = 0;
        Allocation.SetRange(ScenarioCode, ScenarioCode);
        Allocation.SetRange(WorkCenterNo, Draft.WorkCenterNo);
        Allocation.SetRange(CapacityDate, Day);
        Allocation.SetRange(Status, Allocation.Status::Planned, Allocation.Status::Released);
        if Allocation.FindSet() then
            repeat
                ConsiderBusy(Allocation.StartDateTime, Allocation.EndDateTime, Cursor, FreeEnd, BusyEnd);
            until Allocation.Next() = 0;
    end;

    local procedure ConsiderBusy(StartValue: DateTime; EndValue: DateTime; Cursor: DateTime; var FreeEnd: DateTime; var BusyEnd: DateTime)
    begin
        ScannedIntervals += 1;
        if ScannedIntervals > 50000 then
            Error(ScanErr);
        if (StartValue = 0DT) or (EndValue <= StartValue) then
            Error(CalendarErr);
        if (StartValue <= Cursor) and (EndValue > BusyEnd) then
            BusyEnd := EndValue
        else
            if (StartValue > Cursor) and (StartValue < FreeEnd) then
                FreeEnd := StartValue;
    end;

    procedure SetRequest(NewScenarioCode: Code[20]; OperationId: Text; NewVersion: Text; NewStart: DateTime; NewConfirmOnly: Boolean; NewAcceptedWarning: Text)
    begin
        ScenarioCode := NewScenarioCode;
        OperationText := OperationId;
        ExpectedVersion := NewVersion;
        RequestedStart := NewStart;
        ConfirmOnly := NewConfirmOnly;
        AcceptedWarning := NewAcceptedWarning;
        Automatic := false;
    end;

    procedure SetAutomaticOptions(NewMethod: Enum CF_AutoScheduleMethod; FromDate: Date; ToDate: Date)
    begin
        Automatic := true;
        Method := NewMethod;
        FirstDate := FromDate;
        LastDate := ToDate;
    end;

    procedure ConfirmationPrefix(): Text
    begin
        exit('CF_DRAFT_CAPACITY_CONFIRM:');
    end;

    procedure GetChangedCount(): Integer
    begin
        exit(ChangedCount);
    end;

    procedure GetOrderRevision(): Integer
    begin
        exit(ResultRevision);
    end;

    var
        Drafts: Codeunit CF_ScheduleDraftMgt;
        ScenarioCode: Code[20];
        OperationText: Text;
        ExpectedVersion: Text;
        RequestedStart: DateTime;
        ConfirmOnly: Boolean;
        Automatic: Boolean;
        Method: Enum CF_AutoScheduleMethod;
        FirstDate: Date;
        LastDate: Date;
        AcceptedWarning: Text;
        ChangedCount: Integer;
        ResultRevision: Integer;
        ScannedIntervals: Integer;
        DatesErr: Label 'This draft step needs valid dates and positive remaining capacity demand.';
        HorizonErr: Label 'The selected step and following routing steps cannot fit within Maximum Schedule Days. No draft changes were saved.';
        DependencyErr: Label 'The routing dependency is missing, cyclic or inconsistent with the forward sequence. Review the routing in BC and reset this draft.';
        CalendarErr: Label 'Draft calculation requires non-overlapping positive calendar intervals, capacity of at least one, positive efficiency and valid allocation times.';
        OverloadErr: Label 'Draft capacity would be overloaded. No changes were saved.\%1', Comment = '%1 = overload report';
        ScanErr: Label 'Finite draft scheduling exceeded 50,000 interval comparisons. Narrow the planning horizon.';
}
