namespace CloudFactory.ProductionScheduling;

page 91310 CF_EditDraftStart
{
    Caption = 'Edit Draft Start';
    PageType = StandardDialog;
    layout
    {
        area(Content)
        {
            field(StartDateTime; StartValue)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Draft Start';
                ToolTip = 'Specifies the requested start. Working calendars and preceding steps determine the earliest valid start. Following steps are recalculated only in this scenario.';
            }
        }
    }
    procedure SetStart(Value: DateTime)
    begin
        StartValue := Value;
    end;
    procedure GetStart(): DateTime
    begin
        exit(StartValue);
    end;
    var
        StartValue: DateTime;
}
