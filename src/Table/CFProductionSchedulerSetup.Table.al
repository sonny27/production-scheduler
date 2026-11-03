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
    end;

    procedure HourWindows(): JsonArray
    var
        Windows: JsonArray;
    begin
        AddHourWindow(Windows, MondayStartTime, MondayEndTime, FieldCaption(MondayEndTime));
        AddHourWindow(Windows, TuesdayStartTime, TuesdayEndTime, FieldCaption(TuesdayEndTime));
        AddHourWindow(Windows, WednesdayStartTime, WednesdayEndTime, FieldCaption(WednesdayEndTime));
        AddHourWindow(Windows, ThursdayStartTime, ThursdayEndTime, FieldCaption(ThursdayEndTime));
        AddHourWindow(Windows, FridayStartTime, FridayEndTime, FieldCaption(FridayEndTime));
        AddHourWindow(Windows, SaturdayStartTime, SaturdayEndTime, FieldCaption(SaturdayEndTime));
        AddHourWindow(Windows, SundayStartTime, SundayEndTime, FieldCaption(SundayEndTime));
        exit(Windows);
    end;

    local procedure AddHourWindow(var Windows: JsonArray; StartTime: Time; EndTime: Time; EndCaption: Text)
    var
        Window: JsonObject;
        StartMilliseconds: Decimal;
        EndMilliseconds: Decimal;
    begin
        if EndTime <= StartTime then
            Error(HourWindowErr, EndCaption);
        StartMilliseconds := StartTime - 000000T;
        EndMilliseconds := EndTime - 000000T;
        Window.Add('start', StartMilliseconds);
        Window.Add('end', EndMilliseconds);
        Windows.Add(Window);
    end;

    procedure InitialiseHourlyDefaults()
    begin
        InitialiseHourWindow(MondayStartTime, MondayEndTime);
        InitialiseHourWindow(TuesdayStartTime, TuesdayEndTime);
        InitialiseHourWindow(WednesdayStartTime, WednesdayEndTime);
        InitialiseHourWindow(ThursdayStartTime, ThursdayEndTime);
        InitialiseHourWindow(FridayStartTime, FridayEndTime);
        InitialiseHourWindow(SaturdayStartTime, SaturdayEndTime);
        InitialiseHourWindow(SundayStartTime, SundayEndTime);
    end;

    local procedure InitialiseHourWindow(var StartTime: Time; var EndTime: Time)
    begin
        if (StartTime = 0T) and (EndTime = 0T) then begin
            StartTime := 070000T;
            EndTime := 180000T;
        end;
    end;

    trigger OnInsert()
    begin
        ValidateStatuses();
        ValidateHorizon();
        HourWindows();
    end;

    trigger OnModify()
    begin
        ValidateStatuses();
        ValidateHorizon();
        HourWindows();
    end;

    var
        SelectStatusErr: Label 'Select at least one production order status.';
        HorizonErr: Label 'Set Maximum Schedule Days to a value from 1 to 365 in Production Scheduler Setup.';
        HourWindowErr: Label '%1 must be later than the start time on the same day. Hour-view display windows cannot cross midnight.', Comment = '%1 = weekday end-time field caption';
}
