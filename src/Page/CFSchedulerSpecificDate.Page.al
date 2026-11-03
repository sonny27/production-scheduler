namespace CloudFactory.ProductionScheduling;

page 91307 CF_SchedulerSpecificDate
{
    Caption = 'Specific Date';
    PageType = StandardDialog;
    ApplicationArea = Manufacturing;
    layout
    {
        area(Content)
        {
            field(StartingDate; StartingDate)
            {
                ApplicationArea = Manufacturing;
                Caption = 'Starting Date';
                ToolTip = 'Specifies the first visible date. The current period length and filters are retained.';
            }
        }
    }
    trigger OnQueryClosePage(CloseAction: Action): Boolean
    begin
        if (CloseAction = Action::OK) and (StartingDate = 0D) then
            Error(DateErr);
        exit(true);
    end;

    procedure SetDate(Value: Date)
    begin
        StartingDate := Value;
    end;

    procedure GetDate(): Date
    begin
        exit(StartingDate);
    end;

    var
        StartingDate: Date;
        DateErr: Label 'Enter a starting date.';
}
