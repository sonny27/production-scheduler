namespace CloudFactory.ProductionScheduling;

page 91305 CF_SchedulerDatePresets
{
    Caption = 'My Scheduler Date Presets';
    PageType = List;
    SourceTable = CF_SchedulerDatePreset;
    SourceTableView = sorting(OwnerId, DisplayOrder, Code);
    UsageCategory = None;
    ApplicationArea = Manufacturing;
    DelayedInsert = true;
    layout
    {
        area(Content)
        {
            repeater(Presets)
            {
                field(DisplayOrder; Rec.DisplayOrder) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the order in which your presets appear.'; }
                field(Code; Rec.Code) { ApplicationArea = Manufacturing; ToolTip = 'Specifies your unique preset code in this company.'; }
                field(Name; Rec.Name) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the name of the relative date preset.'; }
                field(StartFormula; Rec.StartFormula) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the start relative to today. For example, 0D starts today and -1W starts a week ago.'; }
                field(EndFormula; Rec.EndFormula) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the exclusive end relative to today. For example, 6M shows through the day before six months from today. Ranges must contain 1 to 366 days.'; }
                field(ViewMode; Rec.ViewMode) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the timeline scale applied by this preset.'; }
                field(FitToWindow; Rec.FitToWindow) { ApplicationArea = Manufacturing; ToolTip = 'Specifies whether the entire period fits horizontally in the timeline. Change the view afterwards to inspect it at normal scale.'; }
                field(ExampleStart; ExampleStart) { ApplicationArea = Manufacturing; Caption = 'Example Start'; Editable = false; ToolTip = 'Shows the start if the preset is applied today.'; }
                field(ExampleEnd; ExampleEnd) { ApplicationArea = Manufacturing; Caption = 'Example Last Day'; Editable = false; ToolTip = 'Shows the last included date if the preset is applied today.'; }
            }
        }
    }
    trigger OnOpenPage()
    begin
        Rec.EnsureDefaults();
        Rec.FilterGroup(2);
        Rec.SetRange(OwnerId, UserSecurityId());
        Rec.FilterGroup(0);
    end;

    trigger OnNewRecord(BelowxRec: Boolean)
    begin
        Rec.SetDefaults();
    end;

    trigger OnAfterGetRecord()
    begin
        ExampleStart := CalcDate(Rec.StartFormula, Today());
        ExampleEnd := CalcDate(Rec.EndFormula, Today()) - 1;
    end;

    var
        ExampleStart: Date;
        ExampleEnd: Date;
}
