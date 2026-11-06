namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Document;
using Microsoft.Manufacturing.WorkCenter;

page 91303 CF_SchedulerOptions
{
    Caption = 'Schedule Options';
    PageType = StandardDialog;
    ApplicationArea = Manufacturing;

    layout
    {
        area(Content)
        {
            group(Options)
            {
                ShowCaption = false;
                field(ViewMode; ViewSetup.DefaultViewMode)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'View';
                    ToolTip = 'Specifies the current Hour, Day, Week or Month timeline scale without changing the company default.';
                }
                field(ViewStartDate; ViewStartDate)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Starting Date';
                    ToolTip = 'Specifies the first visible date. Choose OK to apply the options and refresh.';
                }
                field(ViewDays; ViewDays)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Days';
                    MinValue = 1;
                    MaxValue = 366;
                    ToolTip = 'Specifies the visible period, from 1 to 366 days. This does not extend the Auto Schedule horizon.';
                }
                field(Statuses; StatusText)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Statuses';
                    Editable = false;
                    AssistEdit = true;
                    ToolTip = 'Select the statuses for this view without changing company defaults. Capacity still includes all planned, firm planned and released orders.';
                    trigger OnAssistEdit()
                    var
                        Picker: Page CF_SchedulerStatuses;
                    begin
                        Picker.SetSelection(ViewSetup);
                        if Picker.RunModal() = Action::LookupOK then begin
                            Picker.GetSelection(ViewSetup);
                            StatusText := Mgt.StatusCaption(ViewSetup);
                        end;
                    end;
                }
                field(IncludeProblemSteps; IncludeProblemSteps)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Include Problem Steps';
                    ToolTip = 'Specifies whether steps with scheduling problems are shown with a red border. Excluding them changes the display only; capacity totals and Auto Schedule are unchanged.';
                }
                field(WorkCenterNo; WorkCenterNo)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Work Centre';
                    TableRelation = "Work Center";
                    ToolTip = 'Specifies the department to show. Leave blank for all departments within the row limit.';
                }
                field(ProductionOrderNo; ProductionOrderNo)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Production Order No.';
                    TableRelation = "Production Order"."No.";
                    ToolTip = 'Specifies an exact production order number to show. Hidden orders still contribute to capacity.';
                }
            }
            group(DisplayOptions)
            {
                Caption = 'Display Options';
                field(ShowSearch; ShowSearch)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Show Search';
                    ToolTip = 'Specifies whether the text search box is displayed. Hiding it clears the text search so no invisible search filter remains. Off by default for each scheduler session.';
                }
                field(ShowDisplayRange; ShowDisplayRange)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Show Display Range';
                    ToolTip = 'Specifies whether the bottom date-range slider is displayed. Date View actions remain available when it is hidden. Off by default for each scheduler session.';
                }
                field(ShowStepDetails; ShowStepDetails)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Show Selected Step Details';
                    ToolTip = 'Specifies whether the selected-step panel is displayed below the timeline. Hover details and right-click actions remain available when it is hidden. Off by default for each scheduler session.';
                }
            }
        }
    }

    trigger OnQueryClosePage(CloseAction: Action): Boolean
    var
        Dates: Codeunit CF_SchedulerDateMgt;
    begin
        if CloseAction = Action::OK then begin
            if ViewStartDate = 0D then
                Error(StartDateErr);
            if (ViewDays < 1) or (ViewDays > 366) then
                Error(ViewDaysErr);
            Dates.ValidateWindow(ViewStartDate, ViewDays);
            ViewSetup.ValidateHorizon();
            ViewSetup.ValidateStatuses();
        end;
        exit(true);
    end;

    procedure SetOptions(Setup: Record CF_ProductionSchedulerSetup; StartDate: Date; Days: Integer; WorkCenter: Code[20]; OrderNo: Code[20]; ShowProblems: Boolean)
    begin
        ViewSetup := Setup;
        ViewStartDate := StartDate;
        ViewDays := Days;
        WorkCenterNo := WorkCenter;
        ProductionOrderNo := OrderNo;
        IncludeProblemSteps := ShowProblems;
        StatusText := Mgt.StatusCaption(ViewSetup);
    end;

    procedure GetOptions(var Setup: Record CF_ProductionSchedulerSetup; var StartDate: Date; var Days: Integer; var WorkCenter: Code[20]; var OrderNo: Code[20]; var ShowProblems: Boolean)
    begin
        Setup := ViewSetup;
        StartDate := ViewStartDate;
        Days := ViewDays;
        WorkCenter := WorkCenterNo;
        OrderNo := ProductionOrderNo;
        ShowProblems := IncludeProblemSteps;
    end;

    procedure SetDisplayOptions(SearchVisible: Boolean; RangeVisible: Boolean; DetailsVisible: Boolean)
    begin
        ShowSearch := SearchVisible;
        ShowDisplayRange := RangeVisible;
        ShowStepDetails := DetailsVisible;
    end;

    procedure GetDisplayOptions(var SearchVisible: Boolean; var RangeVisible: Boolean; var DetailsVisible: Boolean)
    begin
        SearchVisible := ShowSearch;
        RangeVisible := ShowDisplayRange;
        DetailsVisible := ShowStepDetails;
    end;

    var
        ViewSetup: Record CF_ProductionSchedulerSetup;
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        ViewStartDate: Date;
        ViewDays: Integer;
        WorkCenterNo: Code[20];
        ProductionOrderNo: Code[20];
        StatusText: Text;
        IncludeProblemSteps: Boolean;
        ShowSearch: Boolean;
        ShowDisplayRange: Boolean;
        ShowStepDetails: Boolean;
        StartDateErr: Label 'Enter a starting date.';
        ViewDaysErr: Label 'Enter a number of days from 1 to 366.';
}
