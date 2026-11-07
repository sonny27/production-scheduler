namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Document;

codeunit 91314 CF_SchedulerOrderPromotion
{
    EventSubscriberInstance = Manual;

    [CommitBehavior(CommitBehavior::Error)]
    procedure Promote(Order: Record "Production Order"; var PromotedOrder: Record "Production Order")
    var
        Subscriber: Codeunit CF_SchedulerOrderPromotion;
        StatusMgt: Codeunit "Prod. Order Status Management";
    begin
        Order.TestField(Status, Order.Status::Planned);
        Subscriber.SetRequest(Order."No.");
        BindSubscription(Subscriber);
        StatusMgt.ChangeProdOrderStatus(Order, Order.Status::"Firm Planned", WorkDate(), false);
        UnbindSubscription(Subscriber);
        Subscriber.GetResult(PromotedOrder);
        PromotedOrder.TestField(Status, PromotedOrder.Status::"Firm Planned");
    end;

    internal procedure SetRequest(OrderNo: Code[20])
    begin
        RequestedOrderNo := OrderNo;
    end;

    internal procedure GetResult(var Order: Record "Production Order")
    begin
        if not Converted then
            Error(ConversionErr);
        Order.Get(Result.Status, Result."No.");
    end;

    [EventSubscriber(ObjectType::Codeunit, Codeunit::"Prod. Order Status Management", 'OnAfterChangeStatusOnProdOrder', '', false, false)]
    local procedure CapturePromotion(var ProdOrder: Record "Production Order"; var ToProdOrder: Record "Production Order"; NewStatus: Enum "Production Order Status"; NewPostingDate: Date; NewUpdateUnitCost: Boolean; var SuppressCommit: Boolean; xProductionOrder: Record "Production Order")
    begin
        if (xProductionOrder.Status <> xProductionOrder.Status::Planned) or
           (xProductionOrder."No." <> RequestedOrderNo) or
           (NewStatus <> NewStatus::"Firm Planned")
        then
            exit;
        // Suppress only this bound conversion's internal commit; the scheduler owns the transaction.
        SuppressCommit := true;
        Result := ToProdOrder;
        Converted := true;
    end;

    var
        RequestedOrderNo: Code[20];
        Result: Record "Production Order";
        Converted: Boolean;
        ConversionErr: Label 'BC did not complete the Planned to Firm Planned conversion. The whole scheduler commit was rolled back.';
}
