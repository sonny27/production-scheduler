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
                field(ExcludeNonWorkingHours; Rec.ExcludeNonWorkingHours)
                {
                    ApplicationArea = Manufacturing;
                    ToolTip = 'Specifies whether operation bars show only their working-calendar portions, leaving non-working gaps empty. Off by default: bars include elapsed non-working hours. This changes display only, not routing dates, required work or capacity. Hour windows and hidden-day filters still apply.';
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
                field(AutoScheduleBypassCapacity; Rec.AutoScheduleBypassCapacity)
                {
                    ApplicationArea = Manufacturing;
                    ToolTip = 'Specifies whether Schedule Unscheduled, Replan Unlocked Operations and Import and Auto Schedule ignore occupied capacity and allow daily overload without per-chain warnings. Working calendars, routing restrictions, locked positions and the horizon still apply. Manual moves and Commit to BC keep their normal capacity checks. Off by default.';
                }
                field(MaximumScheduleDays; Rec.MaximumScheduleDays)
                {
                    ApplicationArea = Manufacturing;
                    ToolTip = 'Specifies the scheduling and navigation horizon, from 1 to 365 days. The bottom ruler moves the visible window within this range. Auto Schedule never saves an operation outside the remaining range.';
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
