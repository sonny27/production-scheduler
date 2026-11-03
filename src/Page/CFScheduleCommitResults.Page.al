namespace CloudFactory.ProductionScheduling;

page 91311 CF_ScheduleCommitResults
{
    Caption = 'Commit to BC Results';
    PageType = List;
    UsageCategory = None;
    ApplicationArea = Manufacturing;
    SourceTable = CF_AutoScheduleBuffer;
    SourceTableTemporary = true;
    Editable = false;
    layout
    {
        area(Content)
        {
            repeater(ResultLines)
            {
                field(Status; Rec.Status) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the production order status.'; }
                field(OrderNo; Rec.OrderNo) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the production order.'; }
                field(Scheduled; Rec.Scheduled) { ApplicationArea = Manufacturing; Caption = 'Committed'; ToolTip = 'Specifies whether the entire order was committed successfully.'; }
                field(Result; Rec.Result) { ApplicationArea = Manufacturing; Style = Attention; StyleExpr = Failed; ToolTip = 'Specifies the outcome. A failed order was rolled back; other orders can succeed.'; }
            }
        }
    }
    trigger OnAfterGetRecord()
    begin
        Failed := not Rec.Scheduled;
    end;
    procedure SetResults(var Results: Record CF_AutoScheduleBuffer temporary)
    begin
        Rec.Copy(Results, true);
    end;
    var
        Failed: Boolean;
}
