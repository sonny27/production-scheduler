namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Document;

page 91302 CF_SchedulerStatuses
{
    Caption = 'Select Production Order Statuses';
    PageType = List;
    UsageCategory = None;
    ApplicationArea = Manufacturing;
    SourceTable = CF_SchedulerStatusBuffer;
    InsertAllowed = false;
    DeleteAllowed = false;

    layout
    {
        area(Content)
        {
            repeater(Statuses)
            {
                field(Selected; Rec.Selected)
                {
                    ApplicationArea = Manufacturing;
                    ToolTip = 'Specifies whether this status is included in the schedule.';
                }
                field(Status; Rec.Status)
                {
                    ApplicationArea = Manufacturing;
                    Editable = false;
                    ToolTip = 'Specifies the production order status.';
                }
            }
        }
    }

    procedure SetSelection(Setup: Record CF_ProductionSchedulerSetup)
    begin
        LookupMode(true);
        Rec.Reset();
        Rec.DeleteAll();
        AddStatus("Production Order Status"::Simulated, Setup.IncludeSimulated);
        AddStatus("Production Order Status"::Planned, Setup.IncludePlanned);
        AddStatus("Production Order Status"::"Firm Planned", Setup.IncludeFirmPlanned);
        AddStatus("Production Order Status"::Released, Setup.IncludeReleased);
    end;

    procedure GetSelection(var Setup: Record CF_ProductionSchedulerSetup)
    begin
        Rec.Get("Production Order Status"::Simulated);
        Setup.IncludeSimulated := Rec.Selected;
        Rec.Get("Production Order Status"::Planned);
        Setup.IncludePlanned := Rec.Selected;
        Rec.Get("Production Order Status"::"Firm Planned");
        Setup.IncludeFirmPlanned := Rec.Selected;
        Rec.Get("Production Order Status"::Released);
        Setup.IncludeReleased := Rec.Selected;
        Setup.ValidateStatuses();
    end;

    trigger OnOpenPage()
    begin
        Rec.FindFirst();
    end;

    trigger OnQueryClosePage(CloseAction: Action): Boolean
    begin
        if CloseAction = Action::LookupOK then begin
            Rec.SetRange(Selected, true);
            if Rec.IsEmpty() then
                Error(SelectStatusErr);
            Rec.SetRange(Selected);
        end;
        exit(true);
    end;

    local procedure AddStatus(NewStatus: Enum "Production Order Status"; NewSelected: Boolean)
    begin
        Rec.Init();
        Rec.Status := NewStatus;
        Rec.Selected := NewSelected;
        Rec.Insert();
    end;

    var
        SelectStatusErr: Label 'Select at least one production order status.';
}
