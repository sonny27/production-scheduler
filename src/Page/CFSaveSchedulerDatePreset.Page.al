namespace CloudFactory.ProductionScheduling;

page 91306 CF_SaveSchedulerDatePreset
{
    Caption = 'Save My Date Preset';
    PageType = StandardDialog;
    ApplicationArea = Manufacturing;
    layout
    {
        area(Content)
        {
            group(Preset)
            {
                ShowCaption = false;
                field(Code; TempPreset.Code) { ApplicationArea = Manufacturing; Caption = 'Code'; ToolTip = 'Specifies a new unique code for your personal preset.'; }
                field(Name; TempPreset.Name) { ApplicationArea = Manufacturing; Caption = 'Name'; ToolTip = 'Specifies the name shown in My Scheduler Date Presets.'; }
                field(DisplayOrder; TempPreset.DisplayOrder) { ApplicationArea = Manufacturing; Caption = 'Display Order'; ToolTip = 'Specifies the position in your preset list.'; }
                field(StartFormula; TempPreset.StartFormula) { ApplicationArea = Manufacturing; Caption = 'Start Formula'; ToolTip = 'Specifies the starting date relative to today. Adjust this formula if needed.'; }
                field(EndFormula; TempPreset.EndFormula) { ApplicationArea = Manufacturing; Caption = 'End Formula (Exclusive)'; ToolTip = 'Specifies the end relative to today, excluding that date. Use 6M for a six-month period starting today.'; }
                field(ViewMode; TempPreset.ViewMode) { ApplicationArea = Manufacturing; Caption = 'View'; ToolTip = 'Specifies the scale saved in this preset.'; }
                field(FitToWindow; TempPreset.FitToWindow) { ApplicationArea = Manufacturing; Caption = 'Fit Timeline to Window'; ToolTip = 'Specifies whether the complete period fits horizontally.'; }
            }
        }
    }

    trigger OnOpenPage()
    begin
        TempPreset.EnsureDefaults();
    end;

    trigger OnQueryClosePage(CloseAction: Action): Boolean
    var
        Existing: Record CF_SchedulerDatePreset;
    begin
        if CloseAction = Action::OK then begin
            TempPreset.ValidatePreset();
            if Existing.Get(UserSecurityId(), TempPreset.Code) then
                Error(ExistsErr, TempPreset.Code);
        end;
        exit(true);
    end;

    procedure SetPreset(StartDateFormula: DateFormula; EndDateFormula: DateFormula; Mode: Enum CF_SchedulerViewMode; FitTimeline: Boolean)
    begin
        TempPreset.SetDefaults();
        TempPreset.StartFormula := StartDateFormula;
        TempPreset.EndFormula := EndDateFormula;
        TempPreset.ViewMode := Mode;
        TempPreset.FitToWindow := FitTimeline;
    end;

    procedure GetPreset(var TargetPreset: Record CF_SchedulerDatePreset)
    begin
        TargetPreset := TempPreset;
    end;

    var
        TempPreset: Record CF_SchedulerDatePreset temporary;
        ExistsErr: Label 'Preset %1 already exists. Enter another code or edit the existing preset in My Scheduler Date Presets.', Comment = '%1 = preset code';
}
