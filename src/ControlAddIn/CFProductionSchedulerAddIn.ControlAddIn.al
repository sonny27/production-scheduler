namespace CloudFactory.ProductionScheduling;

controladdin CF_ProductionSchedulerAddIn
{
    Scripts = 'src/ControlAddIn/schedulerCore.js', 'src/ControlAddIn/scheduler.js';
    StyleSheets = 'src/ControlAddIn/scheduler.css';
    StartupScript = 'src/ControlAddIn/startup.js';
    RecreateScript = 'src/ControlAddIn/startup.js';
    RefreshScript = 'src/ControlAddIn/startup.js';
    HorizontalStretch = true;
    HorizontalShrink = true;
    VerticalStretch = true;
    VerticalShrink = true;
    RequestedHeight = 760;
    MinimumHeight = 420;

    event ControlReady();
    event CurrentTimeRequested();
    event ViewModeChanged(ViewMode: Text);
    event DateWindowChanged(OffsetDays: Integer);
    event OperationSelected(OperationId: Text);
    event OperationOpenRequested(OperationId: Text; Routing: Boolean);
    event OperationStartChangeRequested(OperationId: Text; Version: Text; StartText: Text);
    event OperationConfirmRequested(OperationId: Text; Version: Text);
    event OperationContextRequested(OperationId: Text; Version: Text; Command: Text);

    procedure LoadSchedule(Payload: JsonObject);
    procedure SetCurrentTime(CurrentTimeText: Text);
    procedure ShowError(MessageText: Text);
}
