namespace CloudFactory.ProductionScheduling;

table 91306 CF_SchedulerViewState
{
    Caption = 'Scheduler View State';
    TableType = Temporary;
    DataClassification = SystemMetadata;
    fields
    {
        field(1; EntryNo; Integer) { Caption = 'Entry No.'; }
        field(2; ViewStart; Date) { Caption = 'View Start'; }
        field(3; RangeStart; Date) { Caption = 'Range Start'; }
        field(4; ViewDays; Integer) { Caption = 'View Days'; }
        field(5; RangeDays; Integer) { Caption = 'Range Days'; }
        field(6; ViewMode; Enum CF_SchedulerViewMode) { Caption = 'View'; }
        field(7; WorkCenterNo; Code[20]) { Caption = 'Work Centre'; }
        field(8; OrderNo; Code[20]) { Caption = 'Production Order'; }
        field(9; IncludeSimulated; Boolean) { Caption = 'Include Simulated'; }
        field(10; IncludePlanned; Boolean) { Caption = 'Include Planned'; }
        field(11; IncludeFirmPlanned; Boolean) { Caption = 'Include Firm Planned'; }
        field(12; IncludeReleased; Boolean) { Caption = 'Include Released'; }
        field(13; HideNonWorkingDays; Boolean) { Caption = 'Hide Non-working Days'; }
        field(14; DocumentFocused; Boolean) { Caption = 'Document Focused'; }
        field(15; FitToWindow; Boolean) { Caption = 'Fit Timeline'; }
        field(16; CustomRange; Boolean) { Caption = 'Custom Range'; }
        field(17; StartFormula; DateFormula) { Caption = 'Start Formula'; }
        field(18; EndFormula; DateFormula) { Caption = 'End Formula'; }
        field(19; SelectedOperationId; Text[50]) { Caption = 'Selected Operation ID'; }
        field(20; FocusNotice; Text[2048]) { Caption = 'Focus Notice'; }
        field(21; IncludeProblemSteps; Boolean) { Caption = 'Include Problem Steps'; }
    }
    keys { key(PK; EntryNo) { Clustered = true; } }
}
