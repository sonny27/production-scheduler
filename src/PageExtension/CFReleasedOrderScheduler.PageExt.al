namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Document;

pageextension 91300 CF_ReleasedOrderScheduler extends "Released Production Order"
{
    actions
    {
        addlast(Processing)
        {
            action(CF_ProductionScheduler)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Production Scheduler';
                Image = Planning;
                ToolTip = 'Show this production order in the production scheduler.';
                trigger OnAction()
                var
                    Scheduler: Page CF_ProductionScheduler;
                begin
                    Scheduler.SetOrder(Rec."No.");
                    Scheduler.Run();
                end;
            }
        }
        addlast(Promoted)
        {
            actionref(CF_SchedulerPromoted; CF_ProductionScheduler) { }
        }
    }
}
