namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Capacity;
using Microsoft.Manufacturing.Document;
using Microsoft.Manufacturing.Routing;

codeunit 91304 CF_SchedulerFiniteScope
{
    EventSubscriberInstance = Manual;

    procedure Configure(Operation: Record "Prod. Order Routing Line"; Method: Enum CF_AutoScheduleMethod; FirstDate: Date; LastDate: Date)
    begin
        OrderStatus := Operation.Status;
        OrderNo := Operation."Prod. Order No.";
        UseFinite := Method = Method::FiniteCapacity;
        HorizonStart := FirstDate;
        HorizonEnd := LastDate;
    end;

    [EventSubscriber(ObjectType::Codeunit, Codeunit::"Calculate Routing Line", 'OnBeforeGetConstrainedSetup', '', false, false)]
    local procedure ConstrainResources(ProdOrderRoutingLine: Record "Prod. Order Routing Line"; var ConstrainedCapacity: Record "Capacity Constrained Resource"; var ResourceIsConstrained: Boolean; var ParentWorkCenter: Record "Capacity Constrained Resource"; var ParentIsConstrained: Boolean; var IsHandled: Boolean)
    begin
        if not InScope(ProdOrderRoutingLine) or not UseFinite then
            exit;
        if IsHandled then
            Error(SubscriberErr);
        // These are calculation parameters, not persisted constrained-resource setup.
        ConfigureResource(ConstrainedCapacity, ProdOrderRoutingLine.Type, ProdOrderRoutingLine."No.", ProdOrderRoutingLine."Work Center No.");
        ConfigureResource(ParentWorkCenter, ProdOrderRoutingLine.Type::"Work Center", ProdOrderRoutingLine."Work Center No.", ProdOrderRoutingLine."Work Center No.");
        ResourceIsConstrained := true;
        ParentIsConstrained := true;
        IsHandled := true;
    end;

    [EventSubscriber(ObjectType::Codeunit, Codeunit::"Calculate Routing Line", 'OnBeforeProdOrderCapNeedInsert', '', false, false)]
    local procedure CheckNeedHorizon(ProdOrderCapNeed: Record "Prod. Order Capacity Need"; ProdOrderRoutingLine: Record "Prod. Order Routing Line"; ProdOrder: Record "Production Order"; var CalendarEntry: Record "Calendar Entry")
    begin
        if InScope(ProdOrderRoutingLine) then
            if ProdOrderCapNeed.Date > HorizonEnd then
                Error(HorizonErr, HorizonStart, HorizonEnd);
    end;

    local procedure InScope(Operation: Record "Prod. Order Routing Line"): Boolean
    begin
        exit((Operation.Status = OrderStatus) and (Operation."Prod. Order No." = OrderNo));
    end;

    local procedure ConfigureResource(var Resource: Record "Capacity Constrained Resource"; CapacityType: Enum "Capacity Type"; CapacityNo: Code[20]; WorkCenterNo: Code[20])
    begin
        Resource.Reset();
        if not Resource.Get(CapacityType, CapacityNo) then begin
            Resource.Init();
            Resource."Capacity Type" := CapacityType;
            Resource."Capacity No." := CapacityNo;
            Resource."Work Center No." := WorkCenterNo;
            Resource."Critical Load %" := 100;
        end;
        Resource."Dampener (% of Total Capacity)" := 0;
    end;

    var
        OrderStatus: Enum "Production Order Status";
        OrderNo: Code[20];
        UseFinite: Boolean;
        HorizonStart: Date;
        HorizonEnd: Date;
        SubscriberErr: Label 'Another extension has overridden constrained-resource calculation. Auto Schedule cannot safely apply its finite-capacity policy.';
        HorizonErr: Label 'The routing cannot fit within the scheduling range %1 to %2. This operation and its related changes were rolled back.', Comment = '%1 = first date, %2 = last date';
}
