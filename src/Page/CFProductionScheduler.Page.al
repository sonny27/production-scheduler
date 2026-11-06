namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Document;

page 91300 CF_ProductionScheduler
{
    Caption = 'Production Scheduler';
    PageType = Card;
    ApplicationArea = Manufacturing;
    UsageCategory = Tasks;
    AdditionalSearchTerms = 'production planning,manufacturing capacity,work centre schedule';

    layout
    {
        area(Content)
        {
            usercontrol(Schedule; CF_ProductionSchedulerAddIn)
            {
                ApplicationArea = Manufacturing;
                trigger ControlReady()
                begin
                    Ready := true;
                    RefreshSchedule();
                end;
                trigger ViewModeChanged(ViewMode: Text)
                begin
                    RememberDates();
                    case ViewMode of
                        'hour': ViewSetup.DefaultViewMode := CF_SchedulerViewMode::Hour;
                        'day': ViewSetup.DefaultViewMode := CF_SchedulerViewMode::Day;
                        'week': ViewSetup.DefaultViewMode := CF_SchedulerViewMode::Week;
                        'month': ViewSetup.DefaultViewMode := CF_SchedulerViewMode::Month;
                        else
                            Error(ViewModeErr);
                    end;
                    FitToWindow := false;
                    CurrPage.Update(false);
                    RefreshSchedule();
                end;
                trigger CurrentTimeRequested()
                begin
                    CurrPage.Schedule.SetCurrentTime(Mgt.CurrentTimeText());
                end;
                trigger DateWindowChanged(OffsetDays: Integer)
                begin
                    if (OffsetDays < 0) or (OffsetDays > DisplayRangeDays - ViewDays) then
                        Error(NavigationErr);
                    RememberDates();
                    ViewStartDate := RangeStartDate + OffsetDays;
                    ClearPresetFormulas();
                    RefreshSchedule();
                end;
                trigger OperationSelected(OperationId: Text)
                begin
                    SelectedOperationId := OperationId;
                end;
                trigger OperationOpenRequested(OperationId: Text; Routing: Boolean)
                begin
                    if Routing then
                        OpenDraftDetails(OperationId)
                    else
                        Mgt.OpenOperation(OperationId, false);
                end;
                trigger OperationContextRequested(OperationId: Text; Version: Text; Command: Text)
                begin
                    HandleContext(OperationId, Version, Command);
                end;
                trigger OperationStartChangeRequested(OperationId: Text; Version: Text; StartText: Text)
                var
                    NewStart: DateTime;
                begin
                    if not TryParseStart(StartText, NewStart) then begin
                        CurrPage.Schedule.ShowError(GetLastErrorText());
                        exit;
                    end;
                    SelectedOperationId := OperationId;
                    ApplyChange(OperationId, Version, NewStart, false);
                end;
                trigger OperationConfirmRequested(OperationId: Text; Version: Text)
                begin
                    ApplyChange(OperationId, Version, 0DT, true);
                end;
                trigger OperationsLockRequested(OperationsJson: Text; Locked: Boolean)
                begin
                    SetPositionLocks(OperationsJson, Locked);
                end;
            }
        }
    }

    actions
    {
        area(Processing)
        {
            action(SelectScenario)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Scenarios';
                Image = SelectEntries;
                ToolTip = 'Create or select a named, company-shared draft scenario. Each scenario is independent of BC and other scenarios.';
                trigger OnAction()
                var
                    Scenario: Record CF_ScheduleScenario;
                    Picker: Page CF_ScheduleScenarios;
                begin
                    Picker.LookupMode(true);
                    if Picker.RunModal() = Action::LookupOK then begin
                        SaveSessionView();
                        Clear(DraftActions);
                        Picker.GetRecord(Scenario);
                        ActiveScenarioCode := Scenario.Code;
                        Clear(SelectedOperationId);
                        HasPreviousView := false;
                        HasDateUndo := false;
                        LoadDefaults();
                        RestoreSessionView();
                        ViewChange := 'scenario';
                        Commit();
                        RefreshSchedule();
                    end;
                end;
            }
            action(ImportOrders)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Import Orders';
                Image = Import;
                AccessByPermission = tabledata CF_ScheduleDraftOperation = I;
                ToolTip = 'Copy new orders matching Schedule Options into this scenario, including every routing step for each matched order. Existing drafts are not overwritten.';
                trigger OnAction()
                begin
                    ImportNewOrders(false);
                end;
            }
            action(ImportAndSchedule)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Import and Auto Schedule';
                Image = CalculateCalendar;
                AccessByPermission = tabledata CF_ScheduleDraftOperation = I;
                ToolTip = 'Import new orders from BC and offer to schedule their unscheduled routing chains. Existing drafts and BC are not overwritten.';
                trigger OnAction()
                begin
                    ImportNewOrders(true);
                end;
            }
            action(ResetScheduler)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Reset Scheduler to BC Dates';
                Image = Restore;
                AccessByPermission = tabledata CF_ScheduleDraftOperation = D;
                ToolTip = 'Discard draft changes and position locks for every order already in the active scenario, including hidden orders, and reload current BC routing dates and allocations. BC and other scenarios are unchanged.';
                trigger OnAction()
                begin
                    ResetScenario();
                end;
            }
            action(SelectRoutingChain)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Select Routing Chain';
                Image = SelectEntries;
                ToolTip = 'Select all routing steps in the active operation chain, including steps outside the visible dates. Selection does not enable group dragging.';
                trigger OnAction()
                begin
                    CurrPage.Schedule.SelectOperations('chain');
                end;
            }
            action(SelectFollowingSteps)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Select Following Steps';
                Image = SelectEntries;
                ToolTip = 'Select the active step and its following linked steps.';
                trigger OnAction()
                begin
                    CurrPage.Schedule.SelectOperations('following');
                end;
            }
            action(ClearOperationSelection)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Clear Operation Selection';
                Image = ClearFilter;
                ToolTip = 'Clear the multiple-operation selection.';
                trigger OnAction()
                begin
                    CurrPage.Schedule.SelectOperations('clear');
                end;
            }
            action(LockSelectedPositions)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Lock Selected Positions';
                Image = Lock;
                AccessByPermission = tabledata CF_ScheduleDraftOperation = M;
                ToolTip = 'Fix the selected scheduled operations at their current draft dates. Linked moves and Auto Schedule must respect these reservations.';
                trigger OnAction()
                begin
                    CurrPage.Schedule.LockSelectedOperations(true);
                end;
            }
            action(UnlockSelectedPositions)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Unlock Selected Positions';
                Image = ReleaseDoc;
                AccessByPermission = tabledata CF_ScheduleDraftOperation = M;
                ToolTip = 'Allow selected positions to be changed by planning again.';
                trigger OnAction()
                begin
                    CurrPage.Schedule.LockSelectedOperations(false);
                end;
            }
            action(UndoDraftChange)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Undo Last Draft Change';
                Image = Undo;
                AccessByPermission = tabledata CF_ScheduleDraftOperation = M;
                ToolTip = 'Undo the last successful manual move, confirmation or lock change in this open scheduler, including its affected routing steps. Concurrent edits or changed BC baselines block undo.';
                trigger OnAction()
                begin
                    UndoDraft();
                end;
            }
            action(ScheduleDetails)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Schedule Details';
                Image = RoutingVersions;
                ToolTip = 'Show routing steps and dates from the selected scenario, not the live BC routing.';
                trigger OnAction()
                begin
                    OpenDraftDetails(SelectedOperationId);
                end;
            }
            action(CommitToBC)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Commit Entire Schedule to BC';
                Image = Post;
                AccessByPermission = codeunit CF_ProductionScheduleChange = X;
                ToolTip = 'Apply the entire active draft schedule to BC in one batch after confirmation, including all changed orders hidden by display filters. Each order is atomic; a failed order rolls back while the remaining orders continue. Review the results for every order.';
                trigger OnAction()
                begin
                    CommitDraftOrders('', '');
                end;
            }
            action(ScheduleOptions)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Schedule Options';
                Image = Filter;
                ToolTip = 'Change the current view, date range, statuses, work centre and production order. Choose OK to apply and refresh without changing company defaults.';
                trigger OnAction()
                var
                    Options: Page CF_SchedulerOptions;
                begin
                    Options.SetOptions(ViewSetup, ViewStartDate, ViewDays, WorkCenterNo, ProductionOrderNo, IncludeProblemSteps);
                    Options.SetDisplayOptions(ShowSearch, ShowDisplayRange, ShowStepDetails);
                    if Options.RunModal() = Action::OK then begin
                        RememberDates();
                        Options.GetOptions(ViewSetup, ViewStartDate, ViewDays, WorkCenterNo, ProductionOrderNo, IncludeProblemSteps);
                        Options.GetDisplayOptions(ShowSearch, ShowDisplayRange, ShowStepDetails);
                        RangeStartDate := ViewStartDate;
                        CustomRange := false;
                        DocumentFocused := false;
                        FitToWindow := false;
                        Clear(FocusNotice);
                        ClearPresetFormulas();
                        RefreshSchedule();
                    end;
                end;
            }
            action(HowToUseScheduler)
            {
                ApplicationArea = Manufacturing;
                Caption = 'How to Use Scheduler';
                Image = Help;
                ToolTip = 'Show instructions for scenarios, dragging, routing links, capacity colours and optional display panels.';
                trigger OnAction()
                begin
                    Mgt.ShowHelp();
                end;
            }
            action(HideWeekends)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Hide Weekends';
                Image = Calendar;
                Visible = not WeekendsHidden;
                ToolTip = 'Hide Saturdays and Sundays from the timeline, even when they have working capacity. This changes the display only.';
                trigger OnAction()
                begin
                    WeekendsHidden := true;
                    RefreshSchedule();
                end;
            }
            action(ShowWeekends)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Show Weekends';
                Image = Calendar;
                Visible = WeekendsHidden;
                ToolTip = 'Show Saturdays and Sundays again. Hide Non-working Days still applies independently if enabled.';
                trigger OnAction()
                begin
                    WeekendsHidden := false;
                    RefreshSchedule();
                end;
            }
            action(HideNonWorkingDays)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Hide Non-working Days';
                Image = Calendar;
                Visible = not NonWorkingDaysHidden;
                ToolTip = 'Hide days with no calendar capacity across any resource in the current Schedule Options scope. This changes the display only, not production dates or scheduling.';
                trigger OnAction()
                begin
                    NonWorkingDaysHidden := true;
                    CurrPage.Update(false);
                    RefreshSchedule();
                end;
            }
            action(ShowAllDays)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Show All Days';
                Image = Calendar;
                Visible = NonWorkingDaysHidden;
                ToolTip = 'Restore all calendar days, including days without working capacity. Hour view shows a full day and shades non-working intervals from each resource calendar.';
                trigger OnAction()
                begin
                    NonWorkingDaysHidden := false;
                    CurrPage.Update(false);
                    RefreshSchedule();
                end;
            }
            action(HideUnscheduled)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Hide Unscheduled';
                Image = Hide;
                Visible = not UnscheduledHidden;
                ToolTip = 'Hide the Unscheduled rows under each work centre. This changes the display only.';
                trigger OnAction()
                begin
                    UnscheduledHidden := true;
                    RefreshSchedule();
                end;
            }
            action(ShowUnscheduled)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Show Unscheduled';
                Image = ShowList;
                Visible = UnscheduledHidden;
                ToolTip = 'Show the Unscheduled rows under each work centre.';
                trigger OnAction()
                begin
                    UnscheduledHidden := false;
                    RefreshSchedule();
                end;
            }
            action(AutoSchedule)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Schedule Unscheduled';
                Image = CalculateCalendar;
                AccessByPermission = tabledata CF_ScheduleDraftOperation = M;
                ToolTip = 'Schedule unscheduled routing chains around existing scheduled and locked reservations, using the configured capacity method and due-date priority. BC remains unchanged.';
                trigger OnAction()
                var
                    TempImported: Record CF_ScheduleDraftOrder temporary;
                begin
                    RunAutoSchedule(false, false, TempImported);
                end;
            }
            action(ReplanUnlocked)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Replan Unlocked Operations';
                Image = CalculateCalendar;
                AccessByPermission = tabledata CF_ScheduleDraftOperation = M;
                ToolTip = 'Explicitly rebuild unlocked routing chains matching Schedule Options using due-date priority. Locked steps and unrelated orders stay fixed. Review the results, including late finishes.';
                trigger OnAction()
                var
                    TempImported: Record CF_ScheduleDraftOrder temporary;
                begin
                    RunAutoSchedule(true, false, TempImported);
                end;
            }
            action(Refresh)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Refresh';
                Image = Refresh;
                ToolTip = 'Reload operations and capacity using the current view options.';
                trigger OnAction()
                begin
                    RefreshSchedule();
                end;
            }
            action(Today)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Today';
                Image = Calendar;
                ToolTip = 'Show today using the one-day Hour preset without changing company defaults.';
                trigger OnAction()
                begin
                    ApplyBuiltIn('<1D>', CF_SchedulerViewMode::Hour);
                end;
            }
            action(Previous)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Previous';
                Image = PreviousRecord;
                ToolTip = 'Move back by the current visible period.';
                trigger OnAction()
                begin
                    ShiftPeriod(-ViewDays);
                end;
            }
            action(Next)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Next';
                Image = NextRecord;
                ToolTip = 'Move forward by the current visible period.';
                trigger OnAction()
                begin
                    ShiftPeriod(ViewDays);
                end;
            }
            group(DateActions)
            {
                Caption = 'Date View';
                action(ZoomToDocument)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Zoom to Document';
                    Image = View;
                    ToolTip = 'Show only the selected production order and all its routing steps, across their resources, fitted to their full date range.';
                    trigger OnAction()
                    begin
                        FocusDocument();
                    end;
                }
                action(RestorePreviousView)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Restore Previous View';
                    Image = Restore;
                    Enabled = HasPreviousView;
                    ToolTip = 'Restore dates, filters, scale, search and expanded resources from before Zoom to Document.';
                    trigger OnAction()
                    begin
                        if not HasPreviousView then
                            exit;
                        RestoreView(TempPreviousView);
                        HasPreviousView := false;
                        HasDateUndo := false;
                        ViewChange := 'restore';
                        RefreshSchedule();
                    end;
                }
                action(ChangePreset)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Change Preset';
                    Image = Calendar;
                    ToolTip = 'Choose a personal relative date preset. Dates are calculated from today; the complete range is displayed.';
                    trigger OnAction()
                    var
                        Preset: Record CF_SchedulerDatePreset;
                        Picker: Page CF_SchedulerDatePresets;
                    begin
                        Picker.LookupMode(true);
                        if Picker.RunModal() = Action::LookupOK then begin
                            Picker.GetRecord(Preset);
                            ApplyPreset(Preset.StartFormula, Preset.EndFormula, Preset.ViewMode, Preset.FitToWindow);
                        end;
                    end;
                }
                action(Next2Weeks)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Next 2 Weeks';
                    Image = Calendar;
                    ToolTip = 'Display the complete two weeks starting today.';
                    trigger OnAction()
                    begin
                        ApplyBuiltIn('<2W>', CF_SchedulerViewMode::Day);
                    end;
                }
                action(Next3Months)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Next 3 Months';
                    Image = Calendar;
                    ToolTip = 'Display three calendar months starting today.';
                    trigger OnAction()
                    begin
                        ApplyBuiltIn('<3M>', CF_SchedulerViewMode::Month);
                    end;
                }
                action(Next6Months)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Next 6 Months';
                    Image = Calendar;
                    ToolTip = 'Display six complete calendar months starting today, independent of the Auto Schedule horizon.';
                    trigger OnAction()
                    begin
                        ApplyBuiltIn('<6M>', CF_SchedulerViewMode::Month);
                    end;
                }
                action(UpcomingYear)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Upcoming Year';
                    Image = Calendar;
                    ToolTip = 'Display one complete calendar year starting today, including leap days.';
                    trigger OnAction()
                    begin
                        ApplyBuiltIn('<1Y>', CF_SchedulerViewMode::Month);
                    end;
                }
                action(SpecificDate)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Specific Date';
                    Image = Calendar;
                    ToolTip = 'Move the current period to a specific starting date without changing its length or filters.';
                    trigger OnAction()
                    var
                        Picker: Page CF_SchedulerSpecificDate;
                        NewDate: Date;
                    begin
                        Picker.SetDate(ViewStartDate);
                        if Picker.RunModal() <> Action::OK then
                            exit;
                        NewDate := Picker.GetDate();
                        Dates.ValidateWindow(NewDate, ViewDays);
                        RememberDates();
                        ViewStartDate := NewDate;
                        RangeStartDate := NewDate;
                        ClearPresetFormulas();
                        RefreshSchedule();
                    end;
                }
                action(UndoDateChange)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Undo Date Change';
                    Image = Undo;
                    Enabled = HasDateUndo;
                    ToolTip = 'Undo the last date or scale change. Current document and resource filters are retained.';
                    trigger OnAction()
                    begin
                        if not HasDateUndo then
                            exit;
                        RestoreDates(TempDateUndo);
                        HasDateUndo := false;
                        RefreshSchedule();
                    end;
                }
                action(SaveDatePreset)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Save Date Preset';
                    Image = Save;
                    ToolTip = 'Save the current period and scale as a personal preset relative to today, not as fixed dates.';
                    trigger OnAction()
                    begin
                        SavePreset();
                    end;
                }
                action(ManageDatePresets)
                {
                    ApplicationArea = Manufacturing;
                    Caption = 'Manage My Date Presets';
                    Image = Setup;
                    ToolTip = 'Create, edit, order or delete your relative date presets for this company.';
                    trigger OnAction()
                    begin
                        Page.RunModal(Page::CF_SchedulerDatePresets);
                    end;
                }
            }
            action(OpenRouting)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Selected Routing';
                Image = Route;
                ToolTip = 'Open the standard routing for the selected operation.';
                trigger OnAction()
                begin
                    Mgt.OpenOperation(SelectedOperationId, true);
                end;
            }
            action(Setup)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Setup';
                Image = Setup;
                ToolTip = 'Edit company defaults and the overload policy. Current view options are not overwritten.';
                trigger OnAction()
                begin
                    Page.RunModal(Page::CF_ProductionSchedulerSetup);
                    RefreshSchedule();
                end;
            }
            action(RestoreDefaults)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Load Defaults';
                Image = Restore;
                ToolTip = 'Replace the current view, status selection and period length with company defaults.';
                trigger OnAction()
                begin
                    RememberDates();
                    LoadDefaults();
                    CurrPage.Update(false);
                    RefreshSchedule();
                end;
            }
        }
        area(Promoted)
        {
            group(Scheduling)
            {
                Caption = 'Schedule';
                actionref(ScenariosPromoted; SelectScenario) { }
                actionref(ImportOrdersPromoted; ImportOrders) { }
                actionref(ImportAndSchedulePromoted; ImportAndSchedule) { }
                actionref(ResetSchedulerPromoted; ResetScheduler) { }
                actionref(UndoDraftChangePromoted; UndoDraftChange) { }
                actionref(SelectRoutingChainPromoted; SelectRoutingChain) { }
                actionref(SelectFollowingStepsPromoted; SelectFollowingSteps) { }
                actionref(LockSelectedPositionsPromoted; LockSelectedPositions) { }
                actionref(UnlockSelectedPositionsPromoted; UnlockSelectedPositions) { }
                actionref(ScheduleDetailsPromoted; ScheduleDetails) { }
                actionref(CommitToBCPromoted; CommitToBC) { }
                actionref(ScheduleOptionsPromoted; ScheduleOptions) { }
                actionref(HideNonWorkingDaysPromoted; HideNonWorkingDays) { }
                actionref(ShowAllDaysPromoted; ShowAllDays) { }
                actionref(HideUnscheduledPromoted; HideUnscheduled) { }
                actionref(ShowUnscheduledPromoted; ShowUnscheduled) { }
                actionref(AutoSchedulePromoted; AutoSchedule) { }
                actionref(ReplanUnlockedPromoted; ReplanUnlocked) { }
                actionref(RefreshPromoted; Refresh) { }
                actionref(TodayPromoted; Today) { }
                actionref(PreviousPromoted; Previous) { }
                actionref(NextPromoted; Next) { }
                actionref(SetupPromoted; Setup) { }
            }
            group(DateView)
            {
                Caption = 'Date View';
                actionref(HideWeekendsPromoted; HideWeekends) { }
                actionref(ShowWeekendsPromoted; ShowWeekends) { }
                actionref(ZoomToDocumentPromoted; ZoomToDocument) { }
                actionref(RestorePreviousViewPromoted; RestorePreviousView) { }
                actionref(ChangePresetPromoted; ChangePreset) { }
                actionref(Next2WeeksPromoted; Next2Weeks) { }
                actionref(Next3MonthsPromoted; Next3Months) { }
                actionref(Next6MonthsPromoted; Next6Months) { }
                actionref(UpcomingYearPromoted; UpcomingYear) { }
                actionref(SpecificDatePromoted; SpecificDate) { }
                actionref(UndoDateChangePromoted; UndoDateChange) { }
                actionref(SaveDatePresetPromoted; SaveDatePreset) { }
                actionref(ManageDatePresetsPromoted; ManageDatePresets) { }
            }
        }
    }

    trigger OnOpenPage()
    var
        Scenario: Record CF_ScheduleScenario;
    begin
        ViewStartDate := WorkDate();
        RangeStartDate := ViewStartDate;
        LoadDefaults();
        ActiveScenarioCode := ViewSetup.DefaultScenarioCode;
        if ActiveScenarioCode <> '' then
            Scenario.Get(ActiveScenarioCode)
        else
            if Scenario.FindFirst() then
                ActiveScenarioCode := Scenario.Code;
        if ProductionOrderNo = '' then
            RestoreSessionView();
    end;

    trigger OnClosePage()
    begin
        SaveSessionView();
    end;

    procedure SetOrder(OrderNo: Code[20])
    begin
        ProductionOrderNo := OrderNo;
    end;

    local procedure SaveSessionView()
    var
        TempState: Record CF_SchedulerViewState temporary;
        SessionState: Codeunit CF_SchedulerSessionState;
    begin
        CaptureView(TempState);
        SessionState.Save(ActiveScenarioCode, TempState, TempPreviousView, HasPreviousView);
    end;

    local procedure RestoreSessionView()
    var
        TempState: Record CF_SchedulerViewState temporary;
        SessionState: Codeunit CF_SchedulerSessionState;
    begin
        if SessionState.Restore(ActiveScenarioCode, TempState, TempPreviousView, HasPreviousView) then
            RestoreView(TempState);
    end;

    local procedure LoadDefaults()
    begin
        NonWorkingDaysHidden := false;
        UnscheduledHidden := false;
        IncludeProblemSteps := true;
        ViewSetup.LoadDefaults();
        ViewSetup.ValidateHorizon();
        ViewDays := ViewSetup.DefaultViewDays;
        CustomRange := false;
        DocumentFocused := false;
        FitToWindow := false;
        Clear(FocusNotice);
        ClearPresetFormulas();
        RangeStartDate := ViewStartDate;
    end;

    local procedure RefreshSchedule()
    var
        Payload: JsonObject;
    begin
        if not Ready then
            exit;
        if TryBuildPayload(Payload) then begin
            CurrPage.Schedule.LoadSchedule(Payload);
            Clear(ViewChange);
        end
        else
            CurrPage.Schedule.ShowError(GetLastErrorText());
        CurrPage.Update(false);
    end;

    [TryFunction]
    local procedure TryBuildPayload(var Payload: JsonObject)
    begin
        ReloadPlanningSettings();
        NormaliseRange();
        Mgt.SetScenario(ActiveScenarioCode);
        Payload := Mgt.BuildPayload(ViewSetup, ViewStartDate, ViewDays, WorkCenterNo, ProductionOrderNo, DocumentFocused);
        Mgt.AddNavigation(Payload, RangeStartDate, DisplayRangeDays, ViewStartDate, ViewDays);
        Payload.Add('hideNonWorkingDays', NonWorkingDaysHidden);
        Payload.Add('hideWeekends', WeekendsHidden);
        Payload.Add('hideUnscheduled', UnscheduledHidden);
        Payload.Add('includeProblemSteps', IncludeProblemSteps);
        Payload.Add('showSearch', ShowSearch);
        Payload.Add('showDisplayRange', ShowDisplayRange);
        Payload.Add('showStepDetails', ShowStepDetails);
        Payload.Add('documentFocus', DocumentFocused);
        Payload.Add('fitToWindow', FitToWindow);
        Payload.Add('viewChange', ViewChange);
        Payload.Add('selectedOperationId', SelectedOperationId);
        Payload.Add('focusNotice', FocusNotice);
        Payload.Add('viewStateKey', CompanyName() + ':' + Format(UserSecurityId(), 0, 4) + ':' + ActiveScenarioCode);
    end;

    local procedure ReloadPlanningSettings()
    var
        CompanySetup: Record CF_ProductionSchedulerSetup;
    begin
        CompanySetup.LoadDefaults();
        CompanySetup.ValidateHorizon();
        CompanySetup.DefaultViewMode := ViewSetup.DefaultViewMode;
        CompanySetup.IncludeSimulated := ViewSetup.IncludeSimulated;
        CompanySetup.IncludePlanned := ViewSetup.IncludePlanned;
        CompanySetup.IncludeFirmPlanned := ViewSetup.IncludeFirmPlanned;
        CompanySetup.IncludeReleased := ViewSetup.IncludeReleased;
        ViewSetup := CompanySetup;
    end;

    local procedure NormaliseRange()
    begin
        ViewSetup.ValidateHorizon();
        Dates.ValidateWindow(ViewStartDate, ViewDays);
        if CustomRange then
            DisplayRangeDays := ViewDays
        else begin
            DisplayRangeDays := ViewSetup.MaximumScheduleDays;
            if DisplayRangeDays < ViewDays then
                DisplayRangeDays := ViewDays;
        end;
        Dates.ValidateWindow(RangeStartDate, DisplayRangeDays);
        if ViewStartDate > RangeStartDate + DisplayRangeDays - ViewDays then
            ViewStartDate := RangeStartDate + DisplayRangeDays - ViewDays;
        if ViewStartDate < RangeStartDate then
            ViewStartDate := RangeStartDate;
    end;

    local procedure ApplyBuiltIn(EndText: Text; Mode: Enum CF_SchedulerViewMode)
    var
        StartFormula: DateFormula;
        EndFormula: DateFormula;
    begin
        Evaluate(StartFormula, '<0D>');
        Evaluate(EndFormula, EndText);
        ApplyPreset(StartFormula, EndFormula, Mode, true);
    end;

    local procedure ApplyPreset(StartFormula: DateFormula; EndFormula: DateFormula; Mode: Enum CF_SchedulerViewMode; FitTimeline: Boolean)
    var
        NewStart: Date;
        NewDays: Integer;
    begin
        Dates.PresetWindow(StartFormula, EndFormula, Today(), NewStart, NewDays);
        RememberDates();
        ViewStartDate := NewStart;
        RangeStartDate := NewStart;
        ViewDays := NewDays;
        CustomRange := true;
        FitToWindow := FitTimeline;
        ViewSetup.DefaultViewMode := Mode;
        PresetStartFormula := StartFormula;
        PresetEndFormula := EndFormula;
        RefreshSchedule();
    end;

    local procedure SavePreset()
    var
        Preset: Record CF_SchedulerDatePreset;
        Dialog: Page CF_SaveSchedulerDatePreset;
        StartFormula: DateFormula;
        EndFormula: DateFormula;
        FormulaStart: Date;
        FormulaDays: Integer;
    begin
        StartFormula := PresetStartFormula;
        EndFormula := PresetEndFormula;
        if Format(EndFormula) <> '' then
            Dates.PresetWindow(StartFormula, EndFormula, Today(), FormulaStart, FormulaDays);
        if (FormulaStart <> ViewStartDate) or (FormulaDays <> ViewDays) then begin
            Evaluate(StartFormula, '<' + Format(ViewStartDate - Today(), 0, 9) + 'D>');
            Evaluate(EndFormula, '<' + Format(ViewStartDate + ViewDays - Today(), 0, 9) + 'D>');
        end;
        Dialog.SetPreset(StartFormula, EndFormula, ViewSetup.DefaultViewMode, FitToWindow);
        if Dialog.RunModal() <> Action::OK then
            exit;
        Dialog.GetPreset(Preset);
        Preset.Insert(true);
    end;

    local procedure ShiftPeriod(Delta: Integer)
    var
        NewStart: Date;
    begin
        NewStart := ViewStartDate + Delta;
        if not CustomRange then begin
            if NewStart < RangeStartDate then
                NewStart := RangeStartDate;
            if NewStart > RangeStartDate + DisplayRangeDays - ViewDays then
                NewStart := RangeStartDate + DisplayRangeDays - ViewDays;
        end;
        Dates.ValidateWindow(NewStart, ViewDays);
        if NewStart = ViewStartDate then
            exit;
        RememberDates();
        ViewStartDate := NewStart;
        if CustomRange then
            RangeStartDate := NewStart;
        ClearPresetFormulas();
        RefreshSchedule();
    end;

    local procedure FocusDocument()
    var
        Status: Enum "Production Order Status";
        OrderNo: Code[20];
        NewStart: Date;
        NewDays: Integer;
        NoDates: Boolean;
    begin
        Dates.DocumentWindow(ActiveScenarioCode, SelectedOperationId, ViewStartDate, ViewDays, OrderNo, Status, NewStart, NewDays, NoDates);
        if not HasPreviousView then begin
            CaptureView(TempPreviousView);
            HasPreviousView := true;
            ViewChange := 'focus';
        end else
            ViewChange := 'refocus';
        RememberDates();
        ProductionOrderNo := OrderNo;
        WorkCenterNo := '';
        ViewSetup.IncludeSimulated := Status = Status::Simulated;
        ViewSetup.IncludePlanned := Status = Status::Planned;
        ViewSetup.IncludeFirmPlanned := Status = Status::"Firm Planned";
        ViewSetup.IncludeReleased := Status = Status::Released;
        ViewStartDate := NewStart;
        RangeStartDate := NewStart;
        ViewDays := NewDays;
        ViewSetup.DefaultViewMode := Dates.SuggestedView(NewDays);
        CustomRange := true;
        DocumentFocused := true;
        FitToWindow := true;
        NonWorkingDaysHidden := false;
        WeekendsHidden := false;
        IncludeProblemSteps := true;
        ClearPresetFormulas();
        FocusNotice := StrSubstNo(DocumentFocusLbl, Status, OrderNo);
        if NoDates then
            FocusNotice += ' ' + NoDocumentDatesLbl;
        RefreshSchedule();
    end;

    local procedure RememberDates()
    begin
        CaptureView(TempDateUndo);
        HasDateUndo := true;
    end;

    local procedure ClearPresetFormulas()
    begin
        Clear(PresetStartFormula);
        Clear(PresetEndFormula);
    end;

    local procedure CaptureView(var State: Record CF_SchedulerViewState temporary)
    begin
        State.ViewStart := ViewStartDate;
        State.RangeStart := RangeStartDate;
        State.ViewDays := ViewDays;
        State.RangeDays := DisplayRangeDays;
        State.ViewMode := ViewSetup.DefaultViewMode;
        State.CustomRange := CustomRange;
        State.FitToWindow := FitToWindow;
        State.StartFormula := PresetStartFormula;
        State.EndFormula := PresetEndFormula;
        State.WorkCenterNo := WorkCenterNo;
        State.OrderNo := ProductionOrderNo;
        State.IncludeSimulated := ViewSetup.IncludeSimulated;
        State.IncludePlanned := ViewSetup.IncludePlanned;
        State.IncludeFirmPlanned := ViewSetup.IncludeFirmPlanned;
        State.IncludeReleased := ViewSetup.IncludeReleased;
        State.HideNonWorkingDays := NonWorkingDaysHidden;
        State.HideWeekends := WeekendsHidden;
        State.HideUnscheduled := UnscheduledHidden;
        State.IncludeProblemSteps := IncludeProblemSteps;
        State.DocumentFocused := DocumentFocused;
        State.SelectedOperationId := CopyStr(SelectedOperationId, 1, MaxStrLen(State.SelectedOperationId));
        State.FocusNotice := CopyStr(FocusNotice, 1, MaxStrLen(State.FocusNotice));
        State.ShowSearch := ShowSearch;
        State.ShowDisplayRange := ShowDisplayRange;
        State.ShowStepDetails := ShowStepDetails;
    end;

    local procedure RestoreDates(State: Record CF_SchedulerViewState temporary)
    begin
        ViewStartDate := State.ViewStart;
        RangeStartDate := State.RangeStart;
        ViewDays := State.ViewDays;
        DisplayRangeDays := State.RangeDays;
        ViewSetup.DefaultViewMode := State.ViewMode;
        CustomRange := State.CustomRange;
        FitToWindow := State.FitToWindow;
        PresetStartFormula := State.StartFormula;
        PresetEndFormula := State.EndFormula;
    end;

    local procedure RestoreView(State: Record CF_SchedulerViewState temporary)
    begin
        RestoreDates(State);
        WorkCenterNo := State.WorkCenterNo;
        ProductionOrderNo := State.OrderNo;
        ViewSetup.IncludeSimulated := State.IncludeSimulated;
        ViewSetup.IncludePlanned := State.IncludePlanned;
        ViewSetup.IncludeFirmPlanned := State.IncludeFirmPlanned;
        ViewSetup.IncludeReleased := State.IncludeReleased;
        NonWorkingDaysHidden := State.HideNonWorkingDays;
        WeekendsHidden := State.HideWeekends;
        UnscheduledHidden := State.HideUnscheduled;
        IncludeProblemSteps := State.IncludeProblemSteps;
        DocumentFocused := State.DocumentFocused;
        SelectedOperationId := State.SelectedOperationId;
        FocusNotice := State.FocusNotice;
        ShowSearch := State.ShowSearch;
        ShowDisplayRange := State.ShowDisplayRange;
        ShowStepDetails := State.ShowStepDetails;
    end;

    [TryFunction]
    local procedure TryParseStart(Value: Text; var Result: DateTime)
    begin
        Result := Mgt.ParseCivilDateTime(Value);
    end;

    local procedure ImportNewOrders(ScheduleAfterImport: Boolean)
    var
        Existing: Record CF_ScheduleDraftOrder;
        TempExisting: Record CF_ScheduleDraftOrder temporary;
        TempImported: Record CF_ScheduleDraftOrder temporary;
        Count: Integer;
    begin
        RequireScenario();
        ReloadPlanningSettings();
        if not Confirm(ImportQst, false, ActiveScenarioCode) then
            exit;
        Drafts.LockScenario(ActiveScenarioCode);
        Existing.SetRange(ScenarioCode, ActiveScenarioCode);
        if Existing.FindSet() then
            repeat
                TempExisting := Existing;
                TempExisting.Insert();
            until Existing.Next() = 0;
        Count := Drafts.ImportScope(ActiveScenarioCode, ViewSetup, WorkCenterNo, ProductionOrderNo);
        if Existing.FindSet() then
            repeat
                if not TempExisting.Get(ActiveScenarioCode, Existing.Status, Existing.OrderNo) then begin
                    TempImported := Existing;
                    TempImported.Insert();
                end;
            until Existing.Next() = 0;
        Commit();
        DraftActions.ClearUndo();
        RefreshSchedule();
        CurrPage.Schedule.SetDraftStatus('saved', StrSubstNo(ImportedLbl, Count));
        if ScheduleAfterImport and (Count > 0) then
            RunAutoSchedule(false, true, TempImported)
        else
            Message(ImportedLbl, Count);
    end;

    local procedure RunAutoSchedule(Replan: Boolean; ImportedOnly: Boolean; var TempImported: Record CF_ScheduleDraftOrder temporary)
    var
        TempResults: Record CF_AutoScheduleBuffer temporary;
        AutoScheduler: Codeunit CF_AutoSchedule;
        ResultsPage: Page CF_AutoScheduleResults;
        LastDate: Date;
        ModeCaption: Text;
    begin
        RequireScenario();
        ReloadPlanningSettings();
        NormaliseRange();
        AutoScheduler.SetReplan(Replan);
        if ImportedOnly then
            AutoScheduler.SetImportedOrders(TempImported);
        AutoScheduler.Prepare(TempResults, ActiveScenarioCode, ViewSetup, WorkCenterNo, ProductionOrderNo);
        TempResults.Reset();
        TempResults.SetCurrentKey(PriorityDate, OrderNo, Status, RoutingReferenceNo, RoutingNo, SequenceNo, OperationNo);
        if TempResults.IsEmpty() then begin
            Message(NoCandidatesLbl);
            exit;
        end;
        LastDate := ViewStartDate + ViewSetup.MaximumScheduleDays - 1;
        if Replan then
            ModeCaption := ReplanModeLbl
        else
            ModeCaption := UnscheduledModeLbl;
        if not Confirm(AutoScheduleQst, false, TempResults.Count(), ViewSetup.AutoScheduleMethod,
            ViewSetup.AutoSchedulePriority, ViewStartDate, LastDate, ModeCaption, ViewSetup.AutoScheduleBypassCapacity)
        then
            exit;
        DraftActions.ClearUndo();
        CurrPage.Schedule.SetDraftStatus('saving', SavingLbl);
        Commit();
        AutoScheduler.Execute(TempResults, ActiveScenarioCode, ViewSetup, ViewStartDate, LastDate, WorkCenterNo);
        RefreshSchedule();
        CurrPage.Schedule.SetDraftStatus('saved', BatchSavedLbl);
        ResultsPage.SetResults(TempResults, ActiveScenarioCode);
        ResultsPage.RunModal();
        RefreshSchedule();
    end;

    local procedure ResetScenario()
    var
        Scenario: Record CF_ScheduleScenario;
        Orders: Record CF_ScheduleDraftOrder;
        ExpectedRevision: Integer;
        Failure: Text;
    begin
        RequireScenario();
        Scenario.Get(ActiveScenarioCode);
        ExpectedRevision := Scenario.Revision;
        Orders.SetRange(ScenarioCode, ActiveScenarioCode);
        if Orders.IsEmpty() then begin
            Message(NoOrdersLbl);
            exit;
        end;
        if not Confirm(ResetScenarioQst, false, Orders.Count(), ActiveScenarioCode) then
            exit;
        DraftActions.SetResetRequest(ActiveScenarioCode, ExpectedRevision);
        CurrPage.Schedule.SetDraftStatus('saving', SavingLbl);
        Commit();
        ClearLastError();
        if not DraftActions.Run() then begin
            Failure := GetLastErrorText();
            RefreshSchedule();
            CurrPage.Schedule.ShowError(Failure);
            exit;
        end;
        Clear(SelectedOperationId);
        CurrPage.Schedule.SelectOperations('clear');
        RefreshSchedule();
        CurrPage.Schedule.SetDraftStatus('saved', ResetSavedLbl);
    end;

    local procedure SetPositionLocks(OperationsJson: Text; Locked: Boolean)
    var
        Failure: Text;
    begin
        RequireScenario();
        DraftActions.SetLockRequest(ActiveScenarioCode, OperationsJson, Locked);
        CurrPage.Schedule.SetDraftStatus('saving', SavingLbl);
        Commit();
        ClearLastError();
        if not DraftActions.Run() then begin
            Failure := GetLastErrorText();
            RefreshSchedule();
            CurrPage.Schedule.ShowError(Failure);
            exit;
        end;
        RefreshSchedule();
        CurrPage.Schedule.SetDraftStatus('saved', DraftSavedLbl);
    end;

    local procedure UndoDraft()
    var
        Failure: Text;
    begin
        RequireScenario();
        if not DraftActions.CanUndo(ActiveScenarioCode) then begin
            Message(NoUndoLbl);
            exit;
        end;
        DraftActions.SetUndoRequest(ActiveScenarioCode);
        CurrPage.Schedule.SetDraftStatus('saving', SavingLbl);
        Commit();
        ClearLastError();
        if not DraftActions.Run() then begin
            Failure := GetLastErrorText();
            RefreshSchedule();
            CurrPage.Schedule.ShowError(Failure);
            exit;
        end;
        RefreshSchedule();
        CurrPage.Schedule.SetDraftStatus('saved', UndoSavedLbl);
    end;

    local procedure ApplyChange(OperationId: Text; Version: Text; NewStart: DateTime; ConfirmOnly: Boolean)
    var
        Change: Codeunit CF_DraftScheduleChange;
        Failure: Text;
        Warning: Text;
        Saved: Boolean;
    begin
        ClearLastError();
        RequireScenario();
        if not TryCaptureUndo(OperationId, Version) then begin
            Failure := GetLastErrorText();
            RefreshSchedule();
            CurrPage.Schedule.ShowError(Failure);
            exit;
        end;
        Change.SetRequest(ActiveScenarioCode, OperationId, Version, NewStart, ConfirmOnly, '');
        CurrPage.Schedule.SetDraftStatus('saving', SavingLbl);
        Commit();
        Saved := Change.Run();
        if not Saved then begin
            Failure := GetLastErrorText();
            if StrPos(Failure, Change.ConfirmationPrefix()) = 1 then begin
                Warning := CopyStr(Failure, StrLen(Change.ConfirmationPrefix()) + 1);
                if Confirm(OverloadQst, false, Warning) then begin
                    ClearLastError();
                    Change.SetRequest(ActiveScenarioCode, OperationId, Version, NewStart, ConfirmOnly, Warning);
                    Saved := Change.Run();
                    if not Saved then begin
                        Failure := GetLastErrorText();
                        if StrPos(Failure, Change.ConfirmationPrefix()) = 1 then
                            Failure := CapacityChangedLbl;
                    end;
                end else
                    Failure := CancelledLbl;
            end;
        end;
        if Saved then
            DraftActions.AcceptUndoRevision(Change.GetOrderRevision());
        RefreshSchedule();
        if not Saved then
            CurrPage.Schedule.ShowError(Failure)
        else
            CurrPage.Schedule.SetDraftStatus('saved', DraftSavedLbl);
    end;

    [TryFunction]
    local procedure TryCaptureUndo(OperationId: Text; Version: Text)
    begin
        DraftActions.CaptureUndoForOperation(ActiveScenarioCode, OperationId, Version);
    end;

    local procedure RequireScenario()
    var
        Scenario: Record CF_ScheduleScenario;
    begin
        if ActiveScenarioCode = '' then
            Error(SelectScenarioErr);
        Scenario.Get(ActiveScenarioCode);
    end;

    local procedure OpenDraftDetails(OperationId: Text)
    var
        Draft: Record CF_ScheduleDraftOperation;
    begin
        Drafts.GetOperation(ActiveScenarioCode, OperationId, Draft);
        Draft.SetRange(ScenarioCode, ActiveScenarioCode);
        Draft.SetRange(Status, Draft.Status);
        Draft.SetRange(OrderNo, Draft.OrderNo);
        Page.RunModal(Page::CF_ScheduleDraftRouting, Draft);
    end;

    local procedure HandleContext(OperationId: Text; Version: Text; Command: Text)
    var
        Draft: Record CF_ScheduleDraftOperation;
        Editor: Page CF_EditDraftStart;
    begin
        Drafts.GetOperation(ActiveScenarioCode, OperationId, Draft);
        SelectedOperationId := OperationId;
        case Command of
            'details': OpenDraftDetails(OperationId);
            'edit':
                begin
                    Drafts.CheckVersion(Draft, Version);
                    Editor.SetStart(Draft.StartDateTime);
                    if Editor.RunModal() = Action::OK then
                        ApplyChange(OperationId, Version, Editor.GetStart(), false);
                end;
            'zoom': FocusDocument();
            'reset':
                begin
                    if not Confirm(ResetQst, false, Draft.OrderNo, ActiveScenarioCode) then
                        exit;
                    Drafts.LockScenario(ActiveScenarioCode);
                    Drafts.GetOperation(ActiveScenarioCode, OperationId, Draft);
                    Drafts.CheckVersion(Draft, Version);
                    Drafts.ImportOrder(ActiveScenarioCode, Draft.Status, Draft.OrderNo, false);
                    Commit();
                    DraftActions.ClearUndo();
                    RefreshSchedule();
                end;
            'commit': CommitDraftOrders(OperationId, Version);
            'order': Mgt.OpenOperation(OperationId, false);
            'bcRouting': Mgt.OpenOperation(OperationId, true);
            else
                Error(ContextErr);
        end;
    end;

    local procedure CommitDraftOrders(OperationId: Text; Version: Text)
    var
        Draft: Record CF_ScheduleDraftOperation;
        DraftOrder: Record CF_ScheduleDraftOrder;
        TempOrders: Record CF_ScheduleDraftOrder temporary;
        TempResults: Record CF_AutoScheduleBuffer temporary;
        Worker: Codeunit CF_ProductionScheduleChange;
        Results: Page CF_ScheduleCommitResults;
        Failure: Text;
        Warning: Text;
    begin
        RequireScenario();
        DraftOrder.SetRange(ScenarioCode, ActiveScenarioCode);
        DraftOrder.SetRange(Changed, true);
        if OperationId <> '' then begin
            Drafts.GetOperation(ActiveScenarioCode, OperationId, Draft);
            DraftOrder.SetRange(Status, Draft.Status);
            DraftOrder.SetRange(OrderNo, Draft.OrderNo);
        end;
        if DraftOrder.FindSet() then
            repeat
                TempOrders := DraftOrder;
                TempOrders.Insert();
            until DraftOrder.Next() = 0;
        if OperationId <> '' then
            Drafts.CheckVersion(Draft, Version);
        if TempOrders.IsEmpty() then begin
            Message(NoChangesLbl);
            exit;
        end;
        if not Confirm(CommitQst, false, TempOrders.Count(), ActiveScenarioCode) then
            exit;
        DraftActions.ClearUndo();
        Commit();
        if TempOrders.FindSet() then
            repeat
                Clear(Worker);
                TempResults.Init();
                TempResults.OperationId := CreateGuid();
                TempResults.Status := TempOrders.Status;
                TempResults.OrderNo := TempOrders.OrderNo;
                Worker.SetOrderRequest(ActiveScenarioCode, TempOrders.Status, TempOrders.OrderNo, TempOrders.Revision, '');
                ClearLastError();
                TempResults.Scheduled := Worker.Run();
                Failure := '';
                if not TempResults.Scheduled then begin
                    Failure := GetLastErrorText();
                    if StrPos(Failure, Worker.ConfirmationPrefix()) = 1 then begin
                        Warning := CopyStr(Failure, StrLen(Worker.ConfirmationPrefix()) + 1);
                        if Confirm(CommitOverloadQst, false, TempOrders.OrderNo, Warning) then begin
                            Worker.SetOrderRequest(ActiveScenarioCode, TempOrders.Status, TempOrders.OrderNo, TempOrders.Revision, Warning);
                            ClearLastError();
                            TempResults.Scheduled := Worker.Run();
                            if not TempResults.Scheduled then begin
                                Failure := GetLastErrorText();
                                if StrPos(Failure, Worker.ConfirmationPrefix()) = 1 then
                                    Failure := CapacityChangedLbl;
                            end;
                        end else
                            Failure := CancelledLbl;
                    end;
                end;
                if TempResults.Scheduled then
                    TempResults.Result := CommittedLbl
                else begin
                    if StrLen(Failure) > MaxStrLen(TempResults.Result) then
                        Failure := CopyStr(Failure, 1, MaxStrLen(TempResults.Result) - StrLen(TruncatedLbl)) + TruncatedLbl;
                    TempResults.Result := CopyStr(Failure, 1, MaxStrLen(TempResults.Result));
                end;
                TempResults.Insert();
            until TempOrders.Next() = 0;
        RefreshSchedule();
        Results.SetResults(TempResults);
        Results.RunModal();
    end;

    var
        ViewSetup: Record CF_ProductionSchedulerSetup;
        TempPreviousView: Record CF_SchedulerViewState temporary;
        TempDateUndo: Record CF_SchedulerViewState temporary;
        Drafts: Codeunit CF_ScheduleDraftMgt;
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        Dates: Codeunit CF_SchedulerDateMgt;
        DraftActions: Codeunit CF_SchedulerDraftActions;
        PresetStartFormula: DateFormula;
        PresetEndFormula: DateFormula;
        ActiveScenarioCode: Code[20];
        ViewStartDate: Date;
        RangeStartDate: Date;
        ViewDays: Integer;
        DisplayRangeDays: Integer;
        CustomRange: Boolean;
        DocumentFocused: Boolean;
        FitToWindow: Boolean;
        HasPreviousView: Boolean;
        HasDateUndo: Boolean;
        ViewChange: Text;
        FocusNotice: Text;
        WorkCenterNo: Code[20];
        ProductionOrderNo: Code[20];
        SelectedOperationId: Text;
        NonWorkingDaysHidden: Boolean;
        WeekendsHidden: Boolean;
        UnscheduledHidden: Boolean;
        IncludeProblemSteps: Boolean;
        ShowSearch: Boolean;
        ShowDisplayRange: Boolean;
        ShowStepDetails: Boolean;
        Ready: Boolean;
        ViewModeErr: Label 'Select Hour, Day, Week or Month.';
        NavigationErr: Label 'The selected window is outside the current display range.';
        DocumentFocusLbl: Label 'Document view: %1 %2. All routing resources are included; capacity still includes competing orders.', Comment = '%1 = status, %2 = order number';
        NoDocumentDatesLbl: Label 'No valid routing dates were found; the previous period is retained. Undated steps remain in the unplanned list.';
        NoCandidatesLbl: Label 'No eligible unlocked routing chains match this action and the Schedule Options filters.';
        AutoScheduleQst: Label 'Schedule %1 routing chains?\Method: %2\Priority: %3\Range: %4 to %5\Mode: %6\Bypass occupied capacity and daily overload checks: %7\When bypass is enabled, operations may overlap and overload resources without per-chain capacity warnings. Working calendars, routing restrictions, locks and the horizon still apply. Manual moves and Commit to BC retain normal checks.\The work-centre and order filters select complete routing chains. Text search and problem visibility are display-only.\\Locked steps stay fixed. Schedule Unscheduled also keeps existing scheduled steps fixed. Replan recalculates unlocked work. Each chain is atomic; failures do not undo earlier successful chains. Review every result, including late finishes. BC is not changed. Continue?', Comment = '%1 = count, %2 = method, %3 = priority, %4 = first date, %5 = last date, %6 = scheduling mode, %7 = bypass capacity enabled';
        OverloadQst: Label 'This schedule has daily overload:\%1\Save despite this overload? Related operations may also move.', Comment = '%1 = overload report';
        CapacityChangedLbl: Label 'Capacity changed while you were confirming. No changes were saved. Review the refreshed schedule and retry.';
        CancelledLbl: Label 'Scheduling cancelled. No changes were saved.';
        SelectScenarioErr: Label 'Choose or create a scenario first.';
        ImportQst: Label 'Import new orders matching Schedule Options into scenario %1? All routing steps for each matching order are copied. Existing drafts are preserved. BC will not change.', Comment = '%1 = scenario';
        ImportedLbl: Label '%1 new orders imported. Existing drafts were not overwritten.', Comment = '%1 = count';
        ResetQst: Label 'Discard all draft changes for order %1 in scenario %2 and copy its current BC routing? Other scenarios and BC will not change.', Comment = '%1 = order, %2 = scenario';
        CommitQst: Label 'Commit %1 changed orders from scenario %2 to BC? Each order is committed atomically. Conflicts or date/capacity differences roll back that order; other orders continue. Display filters do not limit this commit.', Comment = '%1 = count, %2 = scenario';
        CommitOverloadQst: Label 'Committing order %1 causes daily overload:\%2\Commit this order despite the overload?', Comment = '%1 = order, %2 = overload';
        CommittedLbl: Label 'Committed to BC. Draft dates and daily capacity allocations verified; the baseline was refreshed.';
        TruncatedLbl: Label ' [message truncated]';
        NoChangesLbl: Label 'There are no uncommitted changes in the selected scope.';
        ContextErr: Label 'Unknown scheduler context action. Refresh the page.';
        UnscheduledModeLbl: Label 'Schedule Unscheduled';
        ReplanModeLbl: Label 'Replan Unlocked Operations';
        SavingLbl: Label 'Saving draft...';
        DraftSavedLbl: Label 'Draft saved. BC is unchanged.';
        BatchSavedLbl: Label 'Scheduling batch finished. Review each chain result; failed chains were not saved. BC is unchanged.';
        NoOrdersLbl: Label 'There are no imported orders in the active scenario.';
        ResetScenarioQst: Label 'Reset all %1 imported orders in scenario %2 to their current BC dates and capacity allocations? Hidden and filtered orders are included. Draft changes and position locks are discarded. No new orders are imported. BC and other scenarios are unchanged. This reset cannot be undone. Continue?', Comment = '%1 = order count, %2 = scenario code';
        ResetSavedLbl: Label 'Scheduler reset to current BC dates. Draft changes and locks were cleared; BC is unchanged.';
        NoUndoLbl: Label 'There is no draft change available to undo in this open scheduler. Import, reset, Auto Schedule and BC commit clear the manual undo history.';
        UndoSavedLbl: Label 'Last draft change undone. BC is unchanged.';
}
