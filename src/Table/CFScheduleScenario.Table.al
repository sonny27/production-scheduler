namespace CloudFactory.ProductionScheduling;

table 91307 CF_ScheduleScenario
{
    Caption = 'Schedule Scenario';
    DataClassification = CustomerContent;
    LookupPageId = CF_ScheduleScenarios;
    DrillDownPageId = CF_ScheduleScenarios;
    fields
    {
        field(1; Code; Code[20]) { Caption = 'Code'; NotBlank = true; }
        field(2; Description; Text[100]) { Caption = 'Description'; }
        field(3; Revision; Integer) { Caption = 'Revision'; Editable = false; }
    }
    keys { key(PK; Code) { Clustered = true; } }

    trigger OnRename()
    begin
        Error(RenameErr);
    end;

    trigger OnDelete()
    var
        DraftOrder: Record CF_ScheduleDraftOrder;
    begin
        DraftOrder.SetRange(ScenarioCode, Code);
        if not DraftOrder.IsEmpty() then
            Error(DeleteErr);
    end;

    var
        RenameErr: Label 'Scenario codes cannot be renamed.';
        DeleteErr: Label 'A scenario containing draft orders cannot be deleted.';
}
