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
        MustMove: Boolean;
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
        Clear(ExcludedOperations);
        Clear(Slots);
        if ConfirmOnly then begin
            if (Draft.StartDateTime = 0DT) or (Draft.EndDateTime <= Draft.StartDateTime) then
                Error(DatesErr);
            Draft.Confirmed := true;
            Draft.Changed := true;
            Draft.Modify();
        end else begin
            if Draft.PositionLocked then
                Error(LockedErr, Draft.OperationNo);
            if RequestedStart = 0DT then
                Error(DatesErr);
            if Automatic then begin
                if (FirstDate = 0D) or (LastDate < FirstDate) or
                   (LastDate - FirstDate + 1 > Setup.MaximumScheduleDays)
                then
                    Error(HorizonErr);
                if (Setup.AutoScheduleMethod <> Method) or
                   (Setup.AutoScheduleBypassCapacity <> BypassCapacity)
                then
                    Error(PlanningChangedErr);
            end else begin
                Method := Setup.AutoScheduleMethod;
                FirstDate := DT2Date(RequestedStart);
                LastDate := FirstDate + Setup.MaximumScheduleDays - 1;
            end;
            ValidateChain(Draft);
            Following.SetCurrentKey(ScenarioCode, Status, OrderNo, RoutingReferenceNo, RoutingNo, SequenceNo, OperationNo);
            Following.SetRange(ScenarioCode, ScenarioCode);
            Following.SetRange(Status, Draft.Status);
            Following.SetRange(OrderNo, Draft.OrderNo);
            Following.SetRange(RoutingReferenceNo, Draft.RoutingReferenceNo);
            Following.SetRange(RoutingNo, Draft.RoutingNo);
            Following.SetFilter(SequenceNo, '>=%1', Draft.SequenceNo);
            if Following.FindSet() then
                repeat
                    if Automatic and CanMove(Following) then
                        ExcludedOperations.Add(Following.OperationId);
                until Following.Next() = 0;
            if Following.FindSet() then
                repeat
                    if Following.OperationId = Draft.OperationId then
                        Cursor := RequestedStart
                    else
                        if Automatic and CanMove(Following) then
                            Cursor := CreateDateTime(FirstDate, 0T)
                        else
                            Cursor := Following.StartDateTime;
                    Cursor := EarliestStart(Following, Cursor);
                    MustMove := (Following.OperationId = Draft.OperationId) or
                        (Automatic and CanMove(Following)) or (Cursor > Following.StartDateTime);
                    if MustMove then begin
                        if not CanMove(Following) then
                            Error(LockedErr, Following.OperationNo);
                        ValidateOperation(Following);
                        Allocation.Reset();
                        Allocation.SetRange(ScenarioCode, ScenarioCode);
                        Allocation.SetRange(OperationId, Following.OperationId);
                        Allocation.DeleteAll();
                        Calculate(Following, Cursor);
                        Following.Confirmed := Following.Confirmed or Automatic or (Following.OperationId = Draft.OperationId);
                        Following.Changed := true;
                        Following.Modify();
                        ChangedCount += 1;
                    end;
                    if ExcludedOperations.Contains(Following.OperationId) then
                        ExcludedOperations.Remove(Following.OperationId);
                until Following.Next() = 0;
        end;
        Capacity.Snapshot(TempAfter, Routing);
        Warning := Capacity.OverloadReport(TempBefore, TempAfter, Setup.OverloadPolicy = Setup.OverloadPolicy::Block);
        if (Warning <> '') and not (Automatic and BypassCapacity) then begin
            if (Setup.OverloadPolicy = Setup.OverloadPolicy::Block) or
               (not ConfirmOnly and (Method = Method::FiniteCapacity))
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

    local procedure CanMove(Draft: Record CF_ScheduleDraftOperation): Boolean
    begin
        exit(not Draft.PositionLocked and not Draft.Finished and
            (not Automatic or Replan or not Draft.Confirmed));
    end;

    local procedure ValidateChain(Selected: Record CF_ScheduleDraftOperation)
    var
        Step: Record CF_ScheduleDraftOperation;
        Previous: Record CF_ScheduleDraftOperation;
        First: Boolean;
    begin
        Step.SetCurrentKey(ScenarioCode, Status, OrderNo, RoutingReferenceNo, RoutingNo, SequenceNo, OperationNo);
        Step.SetRange(ScenarioCode, ScenarioCode);
        Step.SetRange(Status, Selected.Status);
        Step.SetRange(OrderNo, Selected.OrderNo);
        Step.SetRange(RoutingReferenceNo, Selected.RoutingReferenceNo);
        Step.SetRange(RoutingNo, Selected.RoutingNo);
        First := true;
        if Step.FindSet() then
            repeat
                if First then begin
                    if Step.PreviousOperationNo <> '' then
                        Error(DependencyErr);
                    First := false;
                end else
                    if (Step.PreviousOperationNo <> Previous.OperationNo) or
                       (Previous.NextOperationNo <> Step.OperationNo) or
                       (Step.SequenceNo <= Previous.SequenceNo)
                    then
                        Error(DependencyErr);
                Previous := Step;
            until Step.Next() = 0;
        if First or (Previous.NextOperationNo <> '') then
            Error(DependencyErr);
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
        Previous.SetRange(OperationNo, Draft.PreviousOperationNo);
        if not Previous.FindSet() then
            Error(DependencyErr);
        repeat
            if (Previous.SequenceNo >= Draft.SequenceNo) or (Previous.EndDateTime = 0DT) or
               (Previous.NextOperationNo <> Draft.OperationNo)
            then
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
        WorkLimit: Decimal;
        Rate: Decimal;
        SlotStart: DateTime;
        SlotEnd: DateTime;
        FreeEnd: DateTime;
        PriorEnd: DateTime;
        Finish: DateTime;
        EntryNo: Integer;
        Count: Integer;
    begin
        Remaining := Draft.WorkMinutes;
        PriorEnd := 0DT;
        Draft.StartDateTime := 0DT;
        Draft.EndDateTime := 0DT;
        Slots.Initialize(Draft, ScenarioCode, DT2Date(Cursor), LastDate,
            (Method = Method::FiniteCapacity) and not BypassCapacity, ExcludedOperations);
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
                   (Calendar.Capacity - Calendar."Absence Capacity" <= 0) or (Calendar.Efficiency <= 0)
                then
                    Error(CalendarErr);
                PriorEnd := SlotEnd;
                if Cursor > SlotStart then
                    SlotStart := Cursor;
                Rate := Calendar.Efficiency / 100;
                while (SlotStart < SlotEnd) and (Remaining > 0.000001) do begin
                    FreeEnd := SlotEnd;
                    if not Slots.Window(Calendar, SlotStart, FreeEnd, WorkLimit) then
                        SlotStart := FreeEnd
                    else begin
                        Work := (FreeEnd - SlotStart) / 60000 * Rate;
                        if Work > Remaining then
                            Work := Remaining;
                        if (Method = Method::FiniteCapacity) and not BypassCapacity and (Work > WorkLimit) then
                            Work := WorkLimit;
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
                        Slots.Consume(Calendar.Date, Work);
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

    procedure SetRequest(NewScenarioCode: Code[20]; OperationId: Text; NewVersion: Text; NewStart: DateTime; NewConfirmOnly: Boolean; NewAcceptedWarning: Text)
    begin
        ScenarioCode := NewScenarioCode;
        OperationText := OperationId;
        ExpectedVersion := NewVersion;
        RequestedStart := NewStart;
        ConfirmOnly := NewConfirmOnly;
        AcceptedWarning := NewAcceptedWarning;
        Automatic := false;
        Replan := false;
        BypassCapacity := false;
    end;

    procedure SetReplan(Value: Boolean)
    begin
        Replan := Value;
    end;

    procedure SetAutomaticOptions(NewMethod: Enum CF_AutoScheduleMethod; FromDate: Date; ToDate: Date; NewBypassCapacity: Boolean)
    begin
        Automatic := true;
        Method := NewMethod;
        FirstDate := FromDate;
        LastDate := ToDate;
        BypassCapacity := NewBypassCapacity;
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
        Slots: Codeunit CF_DraftFiniteSlots;
        ScenarioCode: Code[20];
        OperationText: Text;
        ExpectedVersion: Text;
        RequestedStart: DateTime;
        ConfirmOnly: Boolean;
        Automatic: Boolean;
        BypassCapacity: Boolean;
        Replan: Boolean;
        Method: Enum CF_AutoScheduleMethod;
        FirstDate: Date;
        LastDate: Date;
        AcceptedWarning: Text;
        ChangedCount: Integer;
        ResultRevision: Integer;
        ExcludedOperations: List of [Guid];
        DatesErr: Label 'This draft step needs valid dates and positive remaining capacity demand.';
        PlanningChangedErr: Label 'Automatic scheduling settings changed after this batch was confirmed. No changes were saved for this chain. Refresh and retry.';
        HorizonErr: Label 'The selected step and following routing steps cannot fit within Maximum Schedule Days. No draft changes were saved.';
        DependencyErr: Label 'The routing dependency is missing, cyclic or inconsistent with the forward sequence. Review the routing in BC and reset this draft.';
        CalendarErr: Label 'Draft calculation requires non-overlapping positive calendar intervals, capacity of at least one, positive efficiency and valid allocation times.';
        OverloadErr: Label 'Draft capacity would be overloaded. No changes were saved.\%1', Comment = '%1 = overload report';
        LockedErr: Label 'Operation %1 is fixed or position-locked and cannot move to satisfy this routing dependency. No draft changes were saved.', Comment = '%1 = operation number';
}
