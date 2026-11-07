namespace CloudFactory.ProductionScheduling;

table 91300 CF_ProductionSchedulerSetup
{
    Caption = 'Production Scheduler Setup';
    DataClassification = CustomerContent;
    LookupPageId = CF_ProductionSchedulerSetup;
    DrillDownPageId = CF_ProductionSchedulerSetup;

    fields
    {
        field(1; PrimaryKey; Code[10])
        {
            Caption = 'Primary Key';
        }
        field(2; DefaultViewDays; Integer)
        {
            Caption = 'Default View Days';
            InitValue = 14;
            MinValue = 1;
            MaxValue = 366;
        }
        field(3; IncludePlanned; Boolean)
        {
            Caption = 'Include Planned';
        }
        field(4; IncludeFirmPlanned; Boolean)
        {
            Caption = 'Include Firm Planned';
            InitValue = true;
        }
        field(5; IncludeReleased; Boolean)
        {
            Caption = 'Include Released';
            InitValue = true;
        }
        field(6; IncludeSimulated; Boolean)
        {
            Caption = 'Include Simulated';
        }
        field(7; OverloadPolicy; Enum CF_SchedulerOverloadPolicy)
        {
            Caption = 'Overload Policy';
        }
        field(8; DefaultViewMode; Enum CF_SchedulerViewMode)
        {
            Caption = 'Default View';
            InitValue = Day;
        }
        field(9; AutoScheduleMethod; Enum CF_AutoScheduleMethod)
        {
            Caption = 'Auto Schedule Method';
        }
        field(10; AutoSchedulePriority; Enum CF_AutoSchedulePriority)
        {
            Caption = 'Auto Schedule Priority';
        }
        field(11; MaximumScheduleDays; Integer)
        {
            Caption = 'Maximum Schedule Days';
            InitValue = 90;
            MinValue = 1;
            MaxValue = 365;
        }
        field(12; MondayStartTime; Time) { Caption = 'Monday Start Time'; InitValue = 070000T; }
        field(13; MondayEndTime; Time) { Caption = 'Monday End Time'; InitValue = 180000T; }
        field(14; TuesdayStartTime; Time) { Caption = 'Tuesday Start Time'; InitValue = 070000T; }
        field(15; TuesdayEndTime; Time) { Caption = 'Tuesday End Time'; InitValue = 180000T; }
        field(16; WednesdayStartTime; Time) { Caption = 'Wednesday Start Time'; InitValue = 070000T; }
        field(17; WednesdayEndTime; Time) { Caption = 'Wednesday End Time'; InitValue = 180000T; }
        field(18; ThursdayStartTime; Time) { Caption = 'Thursday Start Time'; InitValue = 070000T; }
        field(19; ThursdayEndTime; Time) { Caption = 'Thursday End Time'; InitValue = 180000T; }
        field(20; FridayStartTime; Time) { Caption = 'Friday Start Time'; InitValue = 070000T; }
        field(21; FridayEndTime; Time) { Caption = 'Friday End Time'; InitValue = 180000T; }
        field(22; SaturdayStartTime; Time) { Caption = 'Saturday Start Time'; InitValue = 070000T; }
        field(23; SaturdayEndTime; Time) { Caption = 'Saturday End Time'; InitValue = 180000T; }
        field(24; SundayStartTime; Time) { Caption = 'Sunday Start Time'; InitValue = 070000T; }
        field(25; SundayEndTime; Time) { Caption = 'Sunday End Time'; InitValue = 180000T; }
        field(26; DefaultScenarioCode; Code[20])
        {
            Caption = 'Default Scenario';
            TableRelation = CF_ScheduleScenario.Code;
        }
        field(27; ExcludeNonWorkingHours; Boolean)
        {
            Caption = 'Exclude Non-working Hours';
        }
        field(28; AutoScheduleBypassCapacity; Boolean)
        {
            Caption = 'Auto Schedule Bypass Capacity';
        }
        field(29; FirmPlannedOnCommit; Boolean)
        {
            Caption = 'Convert Planned to Firm Planned on Commit';
            InitValue = true;
        }
        field(30; DragSnapMinutes; Integer)
        {
            Caption = 'Drag Snap Minutes';
            InitValue = 15;
            MinValue = 1;
            MaxValue = 1440;
        }
    }
    keys
    {
        key(PK; PrimaryKey) { Clustered = true; }
    }

    procedure LoadDefaults()
    begin
        if Get('') then
            exit;
        Init();
        PrimaryKey := '';
        DefaultViewDays := 14;
        IncludeFirmPlanned := true;
        IncludeReleased := true;
    end;

    procedure ValidateStatuses()
    begin
        if not (IncludePlanned or IncludeFirmPlanned or IncludeReleased or IncludeSimulated) then
            Error(SelectStatusErr);
    end;

    procedure ValidateHorizon()
    begin
        if (MaximumScheduleDays < 1) or (MaximumScheduleDays > 365) then
            Error(HorizonErr);
        if (DragSnapMinutes < 1) or (DragSnapMinutes > 1440) then
            Error(DragSnapErr);
    end;

    trigger OnInsert()
    begin
        ValidateStatuses();
        ValidateHorizon();
    end;

    trigger OnModify()
    begin
        ValidateStatuses();
        ValidateHorizon();
    end;

    var
        SelectStatusErr: Label 'Select at least one production order status.';
        HorizonErr: Label 'Set Maximum Schedule Days to a value from 1 to 365 in Production Scheduler Setup.';
        DragSnapErr: Label 'Set Drag Snap Minutes to a value from 1 to 1440 in Production Scheduler Setup.';
}
