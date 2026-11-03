namespace CloudFactory.ProductionScheduling;

page 91304 CF_AutoScheduleResults
{
    Caption = 'Auto Schedule Results';
    PageType = List;
    UsageCategory = None;
    SourceTable = CF_AutoScheduleBuffer;
    Editable = false;
    ApplicationArea = Manufacturing;
    layout
    {
        area(Content)
        {
            repeater(ResultLines)
            {
                field(OrderNo; Rec.OrderNo) { ApplicationArea = Manufacturing; Style = Attention; StyleExpr = NeedsAttention; ToolTip = 'Specifies the production order.'; }
                field(Status; Rec.Status) { ApplicationArea = Manufacturing; Style = Attention; StyleExpr = NeedsAttention; ToolTip = 'Specifies the production order status.'; }
                field(OperationNo; Rec.OperationNo) { ApplicationArea = Manufacturing; Style = Attention; StyleExpr = NeedsAttention; ToolTip = 'Specifies the routing operation.'; }
                field(Scheduled; Rec.Scheduled) { ApplicationArea = Manufacturing; ToolTip = 'Specifies whether this attempt was saved to the draft. BC was not changed.'; }
                field(Confirmed; Rec.Confirmed) { ApplicationArea = Manufacturing; Caption = 'Scheduled in Draft'; ToolTip = 'Specifies whether the final draft step is marked scheduled. Review its final dates after downstream recalculation.'; }
                field(StartDateTime; Rec.StartDateTime) { ApplicationArea = Manufacturing; Style = Attention; StyleExpr = NeedsAttention; ToolTip = 'Specifies the operation start after the entire batch.'; }
                field(EndDateTime; Rec.EndDateTime) { ApplicationArea = Manufacturing; Style = Attention; StyleExpr = NeedsAttention; ToolTip = 'Specifies the operation finish after the entire batch.'; }
                field(Result; Rec.Result) { ApplicationArea = Manufacturing; Style = Attention; StyleExpr = NeedsAttention; ToolTip = 'Specifies the scheduling result, failure or reason for skipping this operation.'; }
            }

        }
    }

    trigger OnAfterGetRecord()
    begin
        NeedsAttention := not Rec.Scheduled;
    end;

    procedure SetResults(var Results: Record CF_AutoScheduleBuffer temporary)
    begin
        Rec.Copy(Results, true);
        Rec.SetCurrentKey(PriorityDate, OrderNo, Status, RoutingReferenceNo, RoutingNo, SequenceNo, OperationNo);
    end;

    var
        NeedsAttention: Boolean;
}
