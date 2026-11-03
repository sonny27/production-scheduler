namespace CloudFactory.ProductionScheduling;

page 91301 CF_ProductionSchedulerSetup
{
    Caption = 'Production Scheduler Setup';
    PageType = Card;
    SourceTable = CF_ProductionSchedulerSetup;
    ApplicationArea = Manufacturing;
    UsageCategory = Administration;
    InsertAllowed = false;
    DeleteAllowed = false;

    layout
    {
        area(Content)
        {
            group(Defaults)
            {
                Caption = 'Defaults';
                field(DefaultScenarioCode; Rec.DefaultScenarioCode)
                {
                    ApplicationArea = Manufacturing;
                    ToolTip = 'Specifies the shared draft scenario opened initially. If blank, the first available scenario is selected. Use Scenarios and Import Orders to create and populate a draft.';
                }
                field(DefaultViewMode; Rec.DefaultViewMode)
                {
                    ApplicationArea = Manufacturing;
                    ToolTip = 'Specifies the initial timeline scale: Hour, Day, Week or Month. Users can change the current view without changing this default.';
                }
                field(DefaultViewDays; Rec.DefaultViewDays)
                {
                    ApplicationArea = Manufacturing;
                    ToolTip = 'Specifies the default number of days shown, from 1 to 366. Date presets can replace this display range without changing the Auto Schedule horizon.';
                }
                field(DefaultStatuses; StatusText)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Default Statuses';
                    Editable = false;
                    AssistEdit = true;
                    ToolTip = 'Select the default production order statuses. Scheduler screen overrides do not change these defaults.';

                    trigger OnAssistEdit()
                    var
                        Picker: Page CF_SchedulerStatuses;
                    begin
                        Picker.SetSelection(Rec);
                        if Picker.RunModal() = Action::LookupOK then begin
                            Picker.GetSelection(Rec);
                            Rec.Modify(true);
                            UpdateStatusText();
                        end;
                    end;
                }
                field(OverloadPolicy; Rec.OverloadPolicy)
                {
                    ApplicationArea = Manufacturing;
                    ToolTip = 'Specifies whether new or increased daily overload is blocked or requires confirmation. This is not interval-level finite scheduling.';
                }
            }
            group(AutomaticScheduling)
            {
                Caption = 'Automatic Scheduling';
                field(AutoScheduleMethod; Rec.AutoScheduleMethod)
                {
                    ApplicationArea = Manufacturing;
                    ToolTip = 'Specifies forward calendar scheduling or finite serial slots in the draft only. Finite mode reserves the parent work centre across its machines. BC recalculation runs only at Commit to BC; differing results roll back the order.';
                }
                field(AutoSchedulePriority; Rec.AutoSchedulePriority)
                {
                    ApplicationArea = Manufacturing;
                    ToolTip = 'Specifies whether orders are processed by earliest due date (undated last) or order number. Operations within a routing follow the forward sequence.';
                }
                field(MaximumScheduleDays; Rec.MaximumScheduleDays)
                {
                    ApplicationArea = Manufacturing;
                    ToolTip = 'Specifies the scheduling and navigation horizon, from 1 to 365 days. The bottom ruler moves the visible window within this range. Auto Schedule never saves an operation outside the remaining range.';
                }
            }
            group(HourViewTimes)
            {
                Caption = 'Hour View Display Times';
                InstructionalText = 'Visible hours only. These times do not change resource calendars, capacity or Auto Schedule. End time must be later than start time on the same day.';
                group(Monday)
                {
                    Caption = 'Monday';
                    field(MondayStartTime; Rec.MondayStartTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the first visible time on Mondays in Hour view. The default is 7:00 AM.'; }
                    field(MondayEndTime; Rec.MondayEndTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the end of the visible Monday window in Hour view. The default is 6:00 PM.'; }
                }
                group(Tuesday)
                {
                    Caption = 'Tuesday';
                    field(TuesdayStartTime; Rec.TuesdayStartTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the first visible time on Tuesdays in Hour view. The default is 7:00 AM.'; }
                    field(TuesdayEndTime; Rec.TuesdayEndTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the end of the visible Tuesday window in Hour view. The default is 6:00 PM.'; }
                }
                group(Wednesday)
                {
                    Caption = 'Wednesday';
                    field(WednesdayStartTime; Rec.WednesdayStartTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the first visible time on Wednesdays in Hour view. The default is 7:00 AM.'; }
                    field(WednesdayEndTime; Rec.WednesdayEndTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the end of the visible Wednesday window in Hour view. The default is 6:00 PM.'; }
                }
                group(Thursday)
                {
                    Caption = 'Thursday';
                    field(ThursdayStartTime; Rec.ThursdayStartTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the first visible time on Thursdays in Hour view. The default is 7:00 AM.'; }
                    field(ThursdayEndTime; Rec.ThursdayEndTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the end of the visible Thursday window in Hour view. The default is 6:00 PM.'; }
                }
                group(Friday)
                {
                    Caption = 'Friday';
                    field(FridayStartTime; Rec.FridayStartTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the first visible time on Fridays in Hour view. The default is 7:00 AM.'; }
                    field(FridayEndTime; Rec.FridayEndTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the end of the visible Friday window in Hour view. The default is 6:00 PM.'; }
                }
                group(Saturday)
                {
                    Caption = 'Saturday';
                    field(SaturdayStartTime; Rec.SaturdayStartTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the first visible time on Saturdays in Hour view. The default is 7:00 AM.'; }
                    field(SaturdayEndTime; Rec.SaturdayEndTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the end of the visible Saturday window in Hour view. The default is 6:00 PM.'; }
                }
                group(Sunday)
                {
                    Caption = 'Sunday';
                    field(SundayStartTime; Rec.SundayStartTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the first visible time on Sundays in Hour view. The default is 7:00 AM.'; }
                    field(SundayEndTime; Rec.SundayEndTime) { ApplicationArea = Manufacturing; ToolTip = 'Specifies the end of the visible Sunday window in Hour view. The default is 6:00 PM.'; }
                }
            }
        }
    }

    trigger OnOpenPage()
    begin
        if not Rec.Get('') then begin
            Rec.LoadDefaults();
            Rec.Insert(true);
        end;
        UpdateStatusText();
    end;

    local procedure UpdateStatusText()
    var
        Mgt: Codeunit CF_ProductionSchedulerMgt;
    begin
        StatusText := Mgt.StatusCaption(Rec);
    end;

    var
        StatusText: Text;
}
