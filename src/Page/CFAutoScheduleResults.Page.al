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

    actions
    {
        area(Processing)
        {
            action(OverrideSaveDraft)
            {
                Caption = 'Override and Save to Draft';
                ApplicationArea = Manufacturing;
                Image = Approve;
                Enabled = (ScenarioCode <> '') and not Rec.Scheduled and (Rec.OrderNo <> '');
                ToolTip = 'Keep the unchanged imported BC dates and allocations for this order and mark its unfinished steps scheduled in the draft. Confirms any capacity overload. Unsupported routing remains protected from recalculation and BC commit.';
                trigger OnAction()
                var
                    Drafts: Codeunit CF_ScheduleDraftMgt;
                    Draft: Record CF_ScheduleDraftOperation;
                    DraftOrder: Record CF_ScheduleDraftOrder;
                    Results: Record CF_AutoScheduleBuffer temporary;
                    Warning: Text;
                begin
                    if not Confirm(OverrideQst, false, Rec.OrderNo) then
                        exit;
                    if not Drafts.OverrideImportedOrder(ScenarioCode, Rec.OperationId, Rec.DraftRevision, Warning) then
                        exit;
                    DraftOrder.Get(ScenarioCode, Rec.Status, Rec.OrderNo);
                    Results.Copy(Rec, true);
                    Results.Reset();
                    Results.SetRange(Status, Rec.Status);
                    Results.SetRange(OrderNo, Rec.OrderNo);
                    if Results.FindSet() then
                        repeat
                            Draft.Get(ScenarioCode, Results.OperationId);
                            Results.Scheduled := true;
                            Results.Confirmed := Draft.Confirmed;
                            Results.StartDateTime := Draft.StartDateTime;
                            Results.EndDateTime := Draft.EndDateTime;
                            Results.DraftRevision := DraftOrder.Revision;
                            Results.Result := CopyStr(OverrideSavedLbl + ' ' + Warning, 1, MaxStrLen(Results.Result));
                            Results.Modify();
                        until Results.Next() = 0;
                    Commit();
                    CurrPage.Update(false);
                    Message(OverrideSavedLbl);
                end;
            }
        }
        area(Promoted)
        {
            actionref(OverrideSaveDraftPromoted; OverrideSaveDraft) { }
        }
    }

    trigger OnAfterGetRecord()
    begin
        NeedsAttention := not Rec.Scheduled;
    end;

    procedure SetResults(var Results: Record CF_AutoScheduleBuffer temporary; ActiveScenarioCode: Code[20])
    begin
        ScenarioCode := ActiveScenarioCode;
        Rec.Copy(Results, true);
        Rec.SetCurrentKey(PriorityDate, OrderNo, Status, RoutingReferenceNo, RoutingNo, SequenceNo, OperationNo);
    end;

    var
        NeedsAttention: Boolean;
        ScenarioCode: Code[20];
        OverrideQst: Label 'Keep the existing imported dates and capacity allocations for order %1 and mark all unfinished steps scheduled in this draft? No recalculation or BC update will occur. Unsupported routing remains protected from recalculation and BC commit.', Comment = '%1 = production order';
        OverrideSavedLbl: Label 'Existing imported dates and allocations retained. Order marked scheduled in draft only; BC unchanged. Routing restrictions still apply.';
}
