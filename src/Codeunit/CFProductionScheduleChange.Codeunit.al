namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Capacity;
using Microsoft.Manufacturing.Document;

codeunit 91302 CF_ProductionScheduleChange
{
    trigger OnRun()
    begin
        CommitOrder();
    end;

    [CommitBehavior(CommitBehavior::Error)]
    local procedure CommitOrder()
    var
        Setup: Record CF_ProductionSchedulerSetup;
        DraftOrder: Record CF_ScheduleDraftOrder;
        Draft: Record CF_ScheduleDraftOperation;
        Order: Record "Production Order";
        Line: Record "Prod. Order Line";
        Component: Record "Prod. Order Component";
        Routing: Record "Prod. Order Routing Line";
        Need: Record "Prod. Order Capacity Need";
        Calendar: Record "Calendar Entry";
        State: Record CF_ProductionScheduleState;
        TempBefore: Record CF_SchedulerCapacityBuffer temporary;
        TempAfter: Record CF_SchedulerCapacityBuffer temporary;
        Drafts: Codeunit CF_ScheduleDraftMgt;
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        Capacity: Codeunit CF_SchedulerCapacity;
        Issue: Text;
        Warning: Text;
    begin
        Drafts.LockScenario(ScenarioCode);
        Setup.LockTable();
        Setup.LoadDefaults();
        Order.LockTable();
        Line.LockTable();
        Routing.LockTable();
        Component.LockTable();
        Need.LockTable();
        Calendar.LockTable();
        State.LockTable();
        if not Routing.WritePermission() or not State.WritePermission() then
            Error(PermissionErr);
        DraftOrder.Get(ScenarioCode, Status, OrderNo);
        if DraftOrder.Revision <> ExpectedRevision then
            Error(StaleErr);
        DraftOrder.TestField(Changed, true);
        Drafts.CheckBaseline(DraftOrder);
        Order.Get(Status, OrderNo);
        Draft.SetCurrentKey(ScenarioCode, Status, OrderNo, RoutingReferenceNo, RoutingNo, SequenceNo, OperationNo);
        Draft.SetRange(ScenarioCode, ScenarioCode);
        Draft.SetRange(Status, Status);
        Draft.SetRange(OrderNo, OrderNo);
        Draft.FindFirst();
        Routing.GetBySystemId(Draft.OperationId);
        Capacity.Snapshot(TempBefore, Routing);
        if Draft.FindSet() then
            repeat
                if Draft.Changed then begin
                    if Draft.Restriction <> '' then
                        Error('%1', Draft.Restriction);
                    Routing.GetBySystemId(Draft.OperationId);
                    Issue := Mgt.EditIssue(Routing);
                    if Issue <> '' then
                        Error('%1', Issue);
                    if (Draft.StartDateTime = 0DT) or (Draft.EndDateTime <= Draft.StartDateTime) then
                        Error(DatesErr);
                    if (Routing."Starting Date-Time" <> Draft.StartDateTime) or
                       (Routing."Ending Date-Time" <> Draft.EndDateTime)
                    then begin
                        Routing.Validate("Starting Date-Time", Draft.StartDateTime);
                        Routing.Modify(true);
                    end;
                end;
            until Draft.Next() = 0;
        if Draft.FindSet() then
            repeat
                Routing.GetBySystemId(Draft.OperationId);
                if (Routing."Starting Date-Time" <> Draft.StartDateTime) or
                   (Routing."Ending Date-Time" <> Draft.EndDateTime)
                then
                    Error(DifferenceErr, Draft.OperationNo, Draft.StartDateTime, Draft.EndDateTime,
                        Routing."Starting Date-Time", Routing."Ending Date-Time");
                VerifyAllocations(Draft, Routing);
            until Draft.Next() = 0;
        Capacity.Snapshot(TempAfter, Routing);
        Warning := Capacity.OverloadReport(TempBefore, TempAfter, Setup.OverloadPolicy = Setup.OverloadPolicy::Block);
        if Warning <> '' then begin
            if Setup.OverloadPolicy = Setup.OverloadPolicy::Block then
                Error(OverloadErr, Warning);
            if Warning <> AcceptedWarning then
                Error('%1%2', ConfirmationPrefix(), Warning);
        end;
        if Draft.FindSet() then
            repeat
                if Draft.Confirmed and not Draft.Finished then begin
                    Routing.GetBySystemId(Draft.OperationId);
                    if not State.Get(Draft.OperationId) then begin
                        State.Init();
                        State.OperationId := Draft.OperationId;
                        State.Insert();
                    end;
                    State.PlannerConfirmed := true;
                    State.RoutingVersion := Routing.SystemRowVersion;
                    State.LineVersion := CopyStr(Mgt.LineVersion(Routing), 1, MaxStrLen(State.LineVersion));
                    State.ConfirmedAt := CurrentDateTime();
                    State.ConfirmedBy := UserSecurityId();
                    State.Modify();
                end;
            until Draft.Next() = 0;
        Drafts.ImportOrder(ScenarioCode, Status, OrderNo, true);
    end;

    local procedure VerifyAllocations(Draft: Record CF_ScheduleDraftOperation; Routing: Record "Prod. Order Routing Line")
    var
        Need: Record "Prod. Order Capacity Need";
        Allocation: Record CF_ScheduleDraftAllocation;
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        Capacity: Codeunit CF_SchedulerCapacity;
        Totals: Dictionary of [Date, Decimal];
        Day: Date;
        Total: Decimal;
        Count: Integer;
    begin
        Mgt.SetNeeds(Need, Routing);
        Need.SetFilter("Allocated Time", '>0');
        if Need.FindSet() then
            repeat
                Count += 1;
                if Count > 50000 then
                    Error(AllocationErr, Draft.OperationNo);
                if (Need.Type <> Draft.ResourceType) or (Need."No." <> Draft.ResourceNo) or (Need."Work Center No." <> Draft.WorkCenterNo) then
                    Error(AllocationErr, Draft.OperationNo);
                Total := 0;
                if Totals.ContainsKey(Need.Date) then
                    Total := Totals.Get(Need.Date);
                if Totals.ContainsKey(Need.Date) then
                    Totals.Set(Need.Date, Total + Capacity.Minutes(Need."Allocated Time", Need."Work Center No."))
                else
                    Totals.Add(Need.Date, Capacity.Minutes(Need."Allocated Time", Need."Work Center No."));
            until Need.Next() = 0;
        Allocation.SetRange(ScenarioCode, ScenarioCode);
        Allocation.SetRange(OperationId, Draft.OperationId);
        if Allocation.FindSet() then
            repeat
                Total := 0;
                if Totals.ContainsKey(Allocation.CapacityDate) then
                    Total := Totals.Get(Allocation.CapacityDate);
                if Totals.ContainsKey(Allocation.CapacityDate) then
                    Totals.Set(Allocation.CapacityDate, Total - Allocation.Minutes)
                else
                    Totals.Add(Allocation.CapacityDate, -Allocation.Minutes);
            until Allocation.Next() = 0;
        foreach Day in Totals.Keys() do
            if Abs(Totals.Get(Day)) > 0.001 then
                Error(AllocationErr, Draft.OperationNo);
    end;

    procedure SetOrderRequest(NewScenarioCode: Code[20]; NewStatus: Enum "Production Order Status"; NewOrderNo: Code[20]; Revision: Integer; Warning: Text)
    begin
        ScenarioCode := NewScenarioCode;
        Status := NewStatus;
        OrderNo := NewOrderNo;
        ExpectedRevision := Revision;
        AcceptedWarning := Warning;
    end;

    procedure ConfirmationPrefix(): Text
    begin
        exit('CF_BC_CAPACITY_CONFIRM:');
    end;

    var
        ScenarioCode: Code[20];
        Status: Enum "Production Order Status";
        OrderNo: Code[20];
        ExpectedRevision: Integer;
        AcceptedWarning: Text;
        PermissionErr: Label 'Commit requires scheduler commit permissions and standard manufacturing write permissions.';
        StaleErr: Label 'The draft order changed after confirmation. Refresh and retry Commit to BC.';
        DatesErr: Label 'The draft contains invalid dates. The whole order was rolled back.';
        DifferenceErr: Label 'Operation %1 differs after BC recalculation. Draft: %2 to %3. BC: %4 to %5. The whole order was rolled back; review the routing and replan.', Comment = '%1 = operation, %2 = draft start, %3 = draft end, %4 = BC start, %5 = BC end';
        AllocationErr: Label 'BC capacity allocation differs from draft operation %1. The whole order was rolled back; review calendars and replan.', Comment = '%1 = operation';
        OverloadErr: Label 'Commit would increase daily overload. The whole order was rolled back.\%1', Comment = '%1 = overload report';
}
