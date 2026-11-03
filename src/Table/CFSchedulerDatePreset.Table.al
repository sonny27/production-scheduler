namespace CloudFactory.ProductionScheduling;

table 91305 CF_SchedulerDatePreset
{
    Caption = 'Scheduler Date Preset';
    DataClassification = CustomerContent;
    LookupPageId = CF_SchedulerDatePresets;
    DrillDownPageId = CF_SchedulerDatePresets;
    fields
    {
        field(1; OwnerId; Guid) { Caption = 'Owner ID'; DataClassification = EndUserPseudonymousIdentifiers; }
        field(2; Code; Code[20]) { Caption = 'Date Preset Code'; NotBlank = true; }
        field(3; Name; Text[100]) { Caption = 'Name'; }
        field(4; DisplayOrder; Integer) { Caption = 'Display Order'; InitValue = 100; }
        field(5; StartFormula; DateFormula) { Caption = 'Start Formula'; }
        field(6; EndFormula; DateFormula) { Caption = 'End Formula (Exclusive)'; }
        field(7; ViewMode; Enum CF_SchedulerViewMode) { Caption = 'View'; }
        field(8; FitToWindow; Boolean) { Caption = 'Fit Timeline to Window'; InitValue = true; }
    }
    keys
    {
        key(PK; OwnerId, Code) { Clustered = true; }
        key(Display; OwnerId, DisplayOrder, Code) { }
    }

    trigger OnInsert()
    begin
        if IsNullGuid(OwnerId) then
            OwnerId := UserSecurityId();
        ValidatePreset();
    end;

    trigger OnModify()
    begin
        ValidatePreset();
    end;

    trigger OnDelete()
    begin
        CheckOwner();
    end;

    trigger OnRename()
    begin
        if xRec.OwnerId <> UserSecurityId() then
            Error(OwnerErr);
        ValidatePreset();
    end;

    procedure SetDefaults()
    begin
        Init();
        OwnerId := UserSecurityId();
        Evaluate(StartFormula, '<0D>');
        Evaluate(EndFormula, '<1D>');
    end;

    procedure GetWindow(var FirstDate: Date; var Days: Integer)
    var
        Dates: Codeunit CF_SchedulerDateMgt;
    begin
        CheckOwner();
        Dates.PresetWindow(StartFormula, EndFormula, Today(), FirstDate, Days);
    end;

    procedure ValidatePreset()
    var
        FirstDate: Date;
        Days: Integer;
    begin
        CheckOwner();
        TestField(Code);
        TestField(Name);
        GetWindow(FirstDate, Days);
    end;

    procedure EnsureDefaults()
    var
        Preset: Record CF_SchedulerDatePreset;
    begin
        Preset.SetRange(OwnerId, UserSecurityId());
        if not Preset.IsEmpty() then
            exit;
        InsertDefault('TODAY', TodayLbl, 10, '<1D>', CF_SchedulerViewMode::Hour);
        InsertDefault('NEXT2WEEKS', TwoWeeksLbl, 20, '<2W>', CF_SchedulerViewMode::Day);
        InsertDefault('NEXT3MONTHS', ThreeMonthsLbl, 30, '<3M>', CF_SchedulerViewMode::Month);
        InsertDefault('NEXT6MONTHS', SixMonthsLbl, 40, '<6M>', CF_SchedulerViewMode::Month);
        InsertDefault('UPCOMINGYEAR', YearLbl, 50, '<1Y>', CF_SchedulerViewMode::Month);
    end;

    local procedure InsertDefault(PresetCode: Code[20]; PresetName: Text[100]; SortOrder: Integer; EndText: Text; Mode: Enum CF_SchedulerViewMode)
    var
        Preset: Record CF_SchedulerDatePreset;
    begin
        Preset.SetDefaults();
        Preset.Code := PresetCode;
        Preset.Name := PresetName;
        Preset.DisplayOrder := SortOrder;
        Evaluate(Preset.EndFormula, EndText);
        Preset.ViewMode := Mode;
        Preset.Insert(true);
    end;

    local procedure CheckOwner()
    begin
        if OwnerId <> UserSecurityId() then
            Error(OwnerErr);
    end;

    var
        OwnerErr: Label 'You can manage only your own scheduler date presets.';
        TodayLbl: Label 'Today';
        TwoWeeksLbl: Label 'Next 2 Weeks';
        ThreeMonthsLbl: Label 'Next 3 Months';
        SixMonthsLbl: Label 'Next 6 Months';
        YearLbl: Label 'Upcoming Year';
}
