namespace CloudFactory.ProductionScheduling;

codeunit 91313 CF_SchedulerSessionState
{
    SingleInstance = true;

    procedure Save(ScenarioCode: Code[20]; State: Record CF_SchedulerViewState temporary; Previous: Record CF_SchedulerViewState temporary; HasPrevious: Boolean)
    var
        EntryNo: Integer;
        StateKey: Text;
    begin
        if ScenarioCode = '' then
            exit;
        StateKey := CompanyName() + ':' + ScenarioCode;
        if not Entries.Get(StateKey, EntryNo) then begin
            EntryNo := Entries.Count() + 1;
            Entries.Add(StateKey, EntryNo);
        end;
        if TempStored.Get(EntryNo) then begin
            TempStored := State;
            TempStored.EntryNo := EntryNo;
            TempStored.Modify();
        end else begin
            TempStored := State;
            TempStored.EntryNo := EntryNo;
            TempStored.Insert();
        end;
        if TempPrevious.Get(EntryNo) then
            TempPrevious.Delete();
        if HasPrevious then begin
            TempPrevious := Previous;
            TempPrevious.EntryNo := EntryNo;
            TempPrevious.Insert();
        end;
    end;

    procedure Restore(ScenarioCode: Code[20]; var State: Record CF_SchedulerViewState temporary; var Previous: Record CF_SchedulerViewState temporary; var HasPrevious: Boolean): Boolean
    var
        EntryNo: Integer;
    begin
        if not Entries.Get(CompanyName() + ':' + ScenarioCode, EntryNo) then
            exit(false);
        TempStored.Get(EntryNo);
        State := TempStored;
        State.EntryNo := 0;
        HasPrevious := TempPrevious.Get(EntryNo);
        if HasPrevious then begin
            Previous := TempPrevious;
            Previous.EntryNo := 0;
        end;
        exit(true);
    end;

    var
        TempStored: Record CF_SchedulerViewState temporary;
        TempPrevious: Record CF_SchedulerViewState temporary;
        Entries: Dictionary of [Text, Integer];
}
