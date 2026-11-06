namespace CloudFactory.ProductionScheduling;

page 91309 CF_ScheduleDraftRouting
{
    Caption = 'Schedule Details - Draft Routing';
    PageType = List;
    UsageCategory = None;
    ApplicationArea = Manufacturing;
    SourceTable = CF_ScheduleDraftOperation;
    SourceTableView = sorting(ScenarioCode, Status, OrderNo, RoutingReferenceNo, RoutingNo, SequenceNo, OperationNo);
    Editable = false;
    layout
    {
        area(Content)
        {
            repeater(Routing)
            {
                field(ScenarioCode; Rec.ScenarioCode) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the scenario containing these draft routing steps.'; }
                field(Status; Rec.Status) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the production order status at import.'; }
                field(OrderNo; Rec.OrderNo) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the production order.'; }
                field(RoutingReferenceNo; Rec.RoutingReferenceNo) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the routing reference.'; }
                field(RoutingNo; Rec.RoutingNo) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the routing number.'; }
                field(OperationNo; Rec.OperationNo) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the routing operation.'; }
                field(Description; Rec.Description) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the operation description captured from BC.'; }
                field(ResourceType; Rec.ResourceType) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the assigned resource type.'; }
                field(ResourceNo; Rec.ResourceNo) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the assigned resource.'; }
                field(StartDateTime; Rec.StartDateTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the start in this draft, not the live BC routing.'; }
                field(EndDateTime; Rec.EndDateTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the finish in this draft.'; }
                field(BaselineStart; Rec.BaselineStart) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the BC start captured at import or the last successful commit.'; }
                field(BaselineEnd; Rec.BaselineEnd) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the BC finish captured at import or the last successful commit.'; }
                field(WorkMinutes; Rec.WorkMinutes) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the calculated setup and run capacity demand captured from BC, in minutes.'; }
                field(Confirmed; Rec.Confirmed) { ApplicationArea = Manufacturing; ToolTip = 'Specifies whether the step has been scheduled in this draft.'; }
                field(Changed; Rec.Changed) { ApplicationArea = Manufacturing; ToolTip = 'Specifies whether this step has uncommitted changes.'; }
                field(PositionLocked; Rec.PositionLocked) { ApplicationArea = Manufacturing; ToolTip = 'Specifies whether the planner locked this step''s draft position. Locked steps cannot be dragged or edited manually and stay fixed when the draft is recalculated. Unlock the step in the scheduler first.'; }
                field(Restriction; Rec.Restriction) { ApplicationArea = Manufacturing; ToolTip = 'Specifies a draft calculation limitation captured at import. The scheduler also rechecks current BC restrictions, blocked resources and conflicts.'; }
            }
        }
    }
}
