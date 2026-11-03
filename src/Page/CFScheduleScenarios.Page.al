namespace CloudFactory.ProductionScheduling;

page 91308 CF_ScheduleScenarios
{
    Caption = 'Schedule Scenarios';
    PageType = List;
    SourceTable = CF_ScheduleScenario;
    ApplicationArea = Manufacturing;
    UsageCategory = Lists;
    DelayedInsert = true;
    layout
    {
        area(Content)
        {
            repeater(Scenarios)
            {
                field(Code; Rec.Code) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the unique company-shared scenario code.'; }
                field(Description; Rec.Description) { ApplicationArea = Manufacturing; ToolTip = 'Specifies a description of this independent draft scenario.'; }
            }
        }
    }
}
