namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Document;

codeunit 91303 CF_AutoSchedule
{
    procedure Prepare(var Results: Record CF_AutoScheduleBuffer temporary; ScenarioCode: Code[20]; Setup: Record CF_ProductionSchedulerSetup; WorkCenter: Code[20]; OrderNo: Code[20])
    var
        Draft: Record CF_ScheduleDraftOperation;
        DraftOrder: Record CF_ScheduleDraftOrder;
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        Scanned: Integer;
    begin
        Setup.ValidateStatuses();
        Setup.ValidateHorizon();
        Results.Reset();
        Results.DeleteAll();
        Draft.SetRange(ScenarioCode, ScenarioCode);
        Draft.SetRange(Finished, false);
        if WorkCenter <> '' then
            Draft.SetRange(WorkCenterNo, WorkCenter);
        if OrderNo <> '' then
            Draft.SetRange(OrderNo, OrderNo);
        if Draft.FindSet() then
            repeat
                Scanned += 1;
                if Scanned > 3000 then
                    Error(ScanLimitErr);
                if Mgt.Included(Setup, Draft.Status) and not Draft.Confirmed then begin
                    if Results.Count() >= 100 then
                        Error(BatchLimitErr);
                    Results.Init();
                    Results.OperationId := Draft.OperationId;
                    Results.Status := Draft.Status;
                    Results.OrderNo := Draft.OrderNo;
                    Results.RoutingReferenceNo := Draft.RoutingReferenceNo;
                    Results.RoutingNo := Draft.RoutingNo;
                    Results.SequenceNo := Draft.SequenceNo;
                    Results.OperationNo := Draft.OperationNo;
                    DraftOrder.Get(ScenarioCode, Draft.Status, Draft.OrderNo);
                    Results.DraftRevision := DraftOrder.Revision;
                    Results.PriorityDate := 0D;
                    if Setup.AutoSchedulePriority = Setup.AutoSchedulePriority::DueDate then begin
                        Results.PriorityDate := Draft.DueDate;
                        if Results.PriorityDate = 0D then
                            Results.PriorityDate := DMY2Date(31, 12, 9999);
                    end;
                    Results.Insert();
                end;
            until Draft.Next() = 0;
        Results.SetCurrentKey(PriorityDate, OrderNo, Status, RoutingReferenceNo, RoutingNo, SequenceNo, OperationNo);
    end;

    procedure Execute(var Results: Record CF_AutoScheduleBuffer temporary; ScenarioCode: Code[20]; Setup: Record CF_ProductionSchedulerSetup; FirstDate: Date; LastDate: Date; WorkCenter: Code[20])
    var
        Draft: Record CF_ScheduleDraftOperation;
        Change: Codeunit CF_DraftScheduleChange;
        Failure: Text;
        Warning: Text;
        Version: Text;
    begin
        Setup.ValidateHorizon();
        if (FirstDate = 0D) or (LastDate < FirstDate) or (LastDate - FirstDate + 1 > Setup.MaximumScheduleDays) then
            Error(RangeErr);
        if Results.FindSet() then
            repeat
                Clear(Change);
                Failure := '';
                ClearLastError();
                if not TryReadRequest(Draft, ScenarioCode, Results, Setup, WorkCenter, Version) then
                    Failure := GetLastErrorText();
                if Failure = '' then begin
                    Change.SetRequest(ScenarioCode, Format(Results.OperationId, 0, 4), Version, CreateDateTime(FirstDate, 0T), false, '');
                    Change.SetAutomaticOptions(Setup.AutoScheduleMethod, FirstDate, LastDate);
                    ClearLastError();
                    Results.Scheduled := Change.Run();
                    if not Results.Scheduled then begin
                        Failure := GetLastErrorText();
                        if StrPos(Failure, Change.ConfirmationPrefix()) = 1 then begin
                            Warning := CopyStr(Failure, StrLen(Change.ConfirmationPrefix()) + 1);
                            if Confirm(OverloadQst, false, Results.OrderNo, Results.OperationNo, Warning) then begin
                                Change.SetRequest(ScenarioCode, Format(Results.OperationId, 0, 4), Version, CreateDateTime(FirstDate, 0T), false, Warning);
                                Change.SetAutomaticOptions(Setup.AutoScheduleMethod, FirstDate, LastDate);
                                ClearLastError();
                                Results.Scheduled := Change.Run();
                                if not Results.Scheduled then begin
                                    Failure := GetLastErrorText();
                                    if StrPos(Failure, Change.ConfirmationPrefix()) = 1 then
                                        Failure := CapacityChangedLbl;
                                end;
                            end else
                                Failure := CancelledLbl;
                        end;
                    end;
                end;
                if Results.Scheduled then begin
                    AdvanceRevision(Results, Change.GetOrderRevision());
                    SetResult(Results, StrSubstNo(SavedLbl, Change.GetChangedCount()))
                end else
                    SetResult(Results, Failure);
                Results.Modify();
            until Results.Next() = 0;
        // Following steps may have moved again during this batch.
        if Results.FindSet() then
            repeat
                ClearLastError();
                if not TryReadFinalState(ScenarioCode, Results) then
                    SetResult(Results, StrSubstNo(FinalReadErr, GetLastErrorText()) + ' ' + Results.Result)
                else
                    if Results.Scheduled and not Results.Confirmed then
                        SetResult(Results, Results.Result + ' ' + ChangedAgainLbl);
                Results.Modify();
            until Results.Next() = 0;
    end;

    [TryFunction]
    local procedure TryReadRequest(var Draft: Record CF_ScheduleDraftOperation; ScenarioCode: Code[20]; Candidate: Record CF_AutoScheduleBuffer temporary; Setup: Record CF_ProductionSchedulerSetup; WorkCenter: Code[20]; var Version: Text)
    var
        DraftOrder: Record CF_ScheduleDraftOrder;
        Mgt: Codeunit CF_ProductionSchedulerMgt;
    begin
        if not Draft.Get(ScenarioCode, Candidate.OperationId) then
            Error(MissingLbl);
        DraftOrder.Get(ScenarioCode, Draft.Status, Draft.OrderNo);
        if DraftOrder.Revision <> Candidate.DraftRevision then
            Error(ConcurrentErr);
        if (Draft.Status <> Candidate.Status) or (Draft.OrderNo <> Candidate.OrderNo) or
           not Mgt.Included(Setup, Draft.Status) or ((WorkCenter <> '') and (Draft.WorkCenterNo <> WorkCenter))
        then
            Error(ScopeChangedLbl);
        if Draft.Confirmed then
            Error(ConfirmedLbl);
        if Draft.Restriction <> '' then
            Error('%1', Draft.Restriction);
        Version := ScenarioCode + ':' + Format(Candidate.DraftRevision, 0, 9) + ':' + Format(Draft.SystemRowVersion, 0, 9);
    end;

    local procedure AdvanceRevision(var Current: Record CF_AutoScheduleBuffer temporary; NewRevision: Integer)
    var
        TempCandidates: Record CF_AutoScheduleBuffer temporary;
    begin
        TempCandidates.Copy(Current, true);
        TempCandidates.Reset();
        TempCandidates.SetRange(Status, Current.Status);
        TempCandidates.SetRange(OrderNo, Current.OrderNo);
        TempCandidates.SetRange(DraftRevision, Current.DraftRevision);
        TempCandidates.ModifyAll(DraftRevision, NewRevision);
        Current.DraftRevision := NewRevision;
    end;

    [TryFunction]
    local procedure TryReadFinalState(ScenarioCode: Code[20]; var Result: Record CF_AutoScheduleBuffer temporary)
    var
        Draft: Record CF_ScheduleDraftOperation;
    begin
        if not Draft.Get(ScenarioCode, Result.OperationId) then
            Error(MissingLbl);
        Result.Confirmed := Draft.Confirmed;
        Result.StartDateTime := Draft.StartDateTime;
        Result.EndDateTime := Draft.EndDateTime;
    end;

    local procedure SetResult(var Result: Record CF_AutoScheduleBuffer temporary; MessageText: Text)
    begin
        if StrLen(MessageText) > MaxStrLen(Result.Result) then
            MessageText := CopyStr(MessageText, 1, MaxStrLen(Result.Result) - StrLen(TruncatedLbl)) + TruncatedLbl;
        Result.Result := CopyStr(MessageText, 1, MaxStrLen(Result.Result));
    end;

    var
        ScanLimitErr: Label 'Auto Schedule exceeds 3,000 routing records. Narrow the work-centre or production-order filters. Nothing was scheduled.';
        ConcurrentErr: Label 'Another planner changed this draft order after Auto Schedule was prepared. Refresh and retry.';
        BatchLimitErr: Label 'Auto Schedule is limited to 100 unconfirmed operations per run. Narrow the filters. Nothing was scheduled.';
        MissingLbl: Label 'Skipped: the routing operation no longer exists.';
        ScopeChangedLbl: Label 'Skipped: the operation no longer matches the original Schedule Options filters.';
        RangeErr: Label 'The Auto Schedule dates must be within Maximum Schedule Days.';
        FinalReadErr: Label 'Final state could not be read: %1.', Comment = '%1 = error';
        CapacityChangedLbl: Label 'Capacity changed during confirmation. This operation was not saved; reload and retry.';
        ConfirmedLbl: Label 'Skipped: the operation is already confirmed.';
        CancelledLbl: Label 'Not saved: the overload warning was declined.';
        SavedLbl: Label 'Saved to draft only. %1 routing steps recalculated; BC unchanged.', Comment = '%1 = changed operation count';
        ChangedAgainLbl: Label 'Later routing changes invalidated this confirmation; review the final dates.';
        TruncatedLbl: Label ' [message truncated]';
        OverloadQst: Label 'Order %1, operation %2 has daily overload:\%3\Save this operation despite the overload? Earlier successful operations remain saved.', Comment = '%1 = order, %2 = operation, %3 = overload report';
}
