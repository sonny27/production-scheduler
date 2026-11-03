namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Document;

codeunit 91306 CF_SchedulerDateMgt
{
    procedure ValidateWindow(FirstDate: Date; Days: Integer)
    var
        EndDate: Date;
    begin
        if (FirstDate = 0D) or (Days < 1) or (Days > 366) then
            Error(WindowErr);
        EndDate := FirstDate + Days;
        if EndDate <= FirstDate then
            Error(WindowErr);
    end;

    procedure PresetWindow(StartFormula: DateFormula; EndFormula: DateFormula; BaseDate: Date; var FirstDate: Date; var Days: Integer)
    var
        EndDate: Date;
    begin
        if BaseDate = 0D then
            Error(WindowErr);
        if Format(StartFormula) = '' then
            FirstDate := BaseDate
        else
            FirstDate := CalcDate(StartFormula, BaseDate);
        if Format(EndFormula) = '' then
            Error(EndFormulaErr);
        EndDate := CalcDate(EndFormula, BaseDate);
        Days := EndDate - FirstDate;
        ValidateWindow(FirstDate, Days);
    end;

    procedure SuggestedView(Days: Integer): Enum CF_SchedulerViewMode
    begin
        if Days <= 14 then
            exit(CF_SchedulerViewMode::Day);
        if Days <= 62 then
            exit(CF_SchedulerViewMode::Week);
        exit(CF_SchedulerViewMode::Month);
    end;

    procedure DocumentWindow(ScenarioCode: Code[20]; OperationId: Text; FallbackStart: Date; FallbackDays: Integer; var OrderNo: Code[20]; var Status: Enum "Production Order Status"; var FirstDate: Date; var Days: Integer; var NoDates: Boolean)
    var
        Draft: Record CF_ScheduleDraftOperation;
        Drafts: Codeunit CF_ScheduleDraftMgt;
        LastDate: Date;
        OperationLastDate: Date;
        Count: Integer;
    begin
        Drafts.GetOperation(ScenarioCode, OperationId, Draft);
        if Draft.Status = Draft.Status::Finished then
            Error(FinishedErr);
        OrderNo := Draft.OrderNo;
        Status := Draft.Status;
        Draft.SetRange(ScenarioCode, ScenarioCode);
        Draft.SetRange(Status, Status);
        Draft.SetRange(OrderNo, OrderNo);
        FirstDate := 0D;
        LastDate := 0D;
        if Draft.FindSet() then
            repeat
                Count += 1;
                if Count > 1000 then
                    Error(DocumentLimitErr);
                if (Draft.StartDateTime <> 0DT) and (Draft.EndDateTime >= Draft.StartDateTime) then begin
                    if (FirstDate = 0D) or (DT2Date(Draft.StartDateTime) < FirstDate) then
                        FirstDate := DT2Date(Draft.StartDateTime);
                    OperationLastDate := DT2Date(Draft.EndDateTime);
                    if (DT2Time(Draft.EndDateTime) = 0T) and (OperationLastDate > DT2Date(Draft.StartDateTime)) then
                        OperationLastDate -= 1;
                    if OperationLastDate > LastDate then
                        LastDate := OperationLastDate;
                end;
            until Draft.Next() = 0;
        NoDates := FirstDate = 0D;
        if NoDates then begin
            FirstDate := FallbackStart;
            Days := FallbackDays;
        end else
            Days := LastDate - FirstDate + 1;
        ValidateWindow(FirstDate, Days);
    end;

    var
        WindowErr: Label 'Select a display range from 1 to 366 calendar days. The full range must fit within supported dates; no partial document or preset range is displayed.';
        EndFormulaErr: Label 'Enter an end formula relative to today. The end date is exclusive; use 1D to display today.';
        FinishedErr: Label 'This production order is finished. Refresh the scheduler and select an active order.';
        DocumentLimitErr: Label 'The selected production order has more than 1,000 routing steps and cannot be displayed in the basic scheduler.';
}
