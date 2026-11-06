namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Document;

codeunit 91303 CF_AutoSchedule
{
    procedure SetReplan(Value: Boolean)
    begin
        Replan := Value;
    end;

    procedure SetImportedOrders(var Orders: Record CF_ScheduleDraftOrder temporary)
    begin
        TempImportedOrders.Copy(Orders, true);
        ImportedOnly := true;
    end;

    procedure Prepare(var Results: Record CF_AutoScheduleBuffer temporary; ScenarioCode: Code[20]; Setup: Record CF_ProductionSchedulerSetup; WorkCenter: Code[20]; OrderNo: Code[20])
    var
        Draft: Record CF_ScheduleDraftOperation;
        DraftOrder: Record CF_ScheduleDraftOrder;
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        SelectedChains: Dictionary of [Text, Boolean];
        PreparedChains: Dictionary of [Text, Boolean];
        RoutingKey: Text;
        Scanned: Integer;
    begin
        Setup.ValidateStatuses();
        Setup.ValidateHorizon();
        Results.Reset();
        Results.DeleteAll();
        Draft.SetCurrentKey(ScenarioCode, Status, OrderNo, RoutingReferenceNo, RoutingNo, SequenceNo, OperationNo);
        Draft.SetRange(ScenarioCode, ScenarioCode);
        if OrderNo <> '' then
            Draft.SetRange(OrderNo, OrderNo);
        if Draft.FindSet() then
            repeat
                Scanned += 1;
                if Scanned > 3000 then
                    Error(ScanLimitErr);
                RoutingKey := ChainKey(Draft);
                if Mgt.Included(Setup, Draft.Status) and IsEligible(Draft) and InImportedScope(Draft) and
                   ((WorkCenter = '') or (Draft.WorkCenterNo = WorkCenter))
                then
                    if not SelectedChains.ContainsKey(RoutingKey) then begin
                        if SelectedChains.Count() >= 100 then
                            Error(BatchLimitErr);
                        SelectedChains.Add(RoutingKey, true);
                    end;
            until Draft.Next() = 0;
        // The resource filter selects chains, not the resource of their first step.
        if Draft.FindSet() then
            repeat
                RoutingKey := ChainKey(Draft);
                if SelectedChains.ContainsKey(RoutingKey) and IsEligible(Draft) and
                   not PreparedChains.ContainsKey(RoutingKey)
                then begin
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
                    PreparedChains.Add(RoutingKey, true);
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
        Chains: Dictionary of [Text, Boolean];
        Messages: Dictionary of [Text, Text];
        RoutingKey: Text;
    begin
        Setup.ValidateHorizon();
        if (FirstDate = 0D) or (LastDate < FirstDate) or (LastDate - FirstDate + 1 > Setup.MaximumScheduleDays) then
            Error(RangeErr);
        if Results.FindSet() then
            repeat
                RoutingKey := CandidateChainKey(Results);
                if Chains.ContainsKey(RoutingKey) then begin
                    Results.Scheduled := Chains.Get(RoutingKey);
                    SetResult(Results, Messages.Get(RoutingKey));
                    Results.Modify();
                end else begin
                    Clear(Change);
                    Failure := '';
                    Results.Scheduled := false;
                    ClearLastError();
                    if not TryReadRequest(Draft, ScenarioCode, Results, Setup, WorkCenter, Version) then
                        Failure := GetLastErrorText();
                    if Failure = '' then begin
                        Change.SetRequest(ScenarioCode, Format(Results.OperationId, 0, 4), Version, CreateDateTime(FirstDate, 0T), false, '');
                        Change.SetAutomaticOptions(Setup.AutoScheduleMethod, FirstDate, LastDate, Setup.AutoScheduleBypassCapacity);
                        Change.SetReplan(Replan);
                        ClearLastError();
                        Results.Scheduled := Change.Run();
                        if not Results.Scheduled then begin
                            Failure := GetLastErrorText();
                            if StrPos(Failure, Change.ConfirmationPrefix()) = 1 then begin
                                Warning := CopyStr(Failure, StrLen(Change.ConfirmationPrefix()) + 1);
                                if Confirm(OverloadQst, false, Results.OrderNo, Results.OperationNo, Warning) then begin
                                    Change.SetRequest(ScenarioCode, Format(Results.OperationId, 0, 4), Version, CreateDateTime(FirstDate, 0T), false, Warning);
                                    Change.SetAutomaticOptions(Setup.AutoScheduleMethod, FirstDate, LastDate, Setup.AutoScheduleBypassCapacity);
                                    Change.SetReplan(Replan);
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
                        SetResult(Results, StrSubstNo(SavedLbl, Change.GetChangedCount()));
                        if Setup.AutoScheduleBypassCapacity then
                            SetResult(Results, Results.Result + ' ' + CapacityBypassedLbl);
                    end else
                        SetResult(Results, Failure);
                    Results.Modify();
                    Chains.Add(RoutingKey, Results.Scheduled);
                    Messages.Add(RoutingKey, Results.Result);
                end;
            until Results.Next() = 0;
        if Results.FindSet() then
            repeat
                ClearLastError();
                if not TryReadFinalState(ScenarioCode, Results) then
                    SetResult(Results, StrSubstNo(FinalReadErr, GetLastErrorText()) + ' ' + Results.Result)
                else
                    if Results.Scheduled and not Results.Confirmed then begin
                        Results.Scheduled := false;
                        SetResult(Results, Results.Result + ' ' + ChangedAgainLbl);
                    end;
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
           (Draft.RoutingReferenceNo <> Candidate.RoutingReferenceNo) or (Draft.RoutingNo <> Candidate.RoutingNo) or
           not Mgt.Included(Setup, Draft.Status) or not InImportedScope(Draft) or not ChainMatchesScope(Draft, WorkCenter)
        then
            Error(ScopeChangedLbl);
        if Draft.PositionLocked then
            Error(LockedLbl);
        if Draft.Confirmed and not Replan then
            Error(ConfirmedLbl);
        if Draft.Restriction <> '' then
            Error('%1', Draft.Restriction);
        Version := ScenarioCode + ':' + Format(Candidate.DraftRevision, 0, 9) + ':' + Format(Draft.SystemRowVersion, 0, 9);
    end;

    local procedure IsEligible(Draft: Record CF_ScheduleDraftOperation): Boolean
    begin
        exit(not Draft.Finished and not Draft.PositionLocked and (Replan or not Draft.Confirmed));
    end;

    local procedure ChainMatchesScope(Draft: Record CF_ScheduleDraftOperation; WorkCenter: Code[20]): Boolean
    var
        Step: Record CF_ScheduleDraftOperation;
    begin
        if WorkCenter = '' then
            exit(true);
        Step.SetRange(ScenarioCode, Draft.ScenarioCode);
        Step.SetRange(Status, Draft.Status);
        Step.SetRange(OrderNo, Draft.OrderNo);
        Step.SetRange(RoutingReferenceNo, Draft.RoutingReferenceNo);
        Step.SetRange(RoutingNo, Draft.RoutingNo);
        Step.SetRange(WorkCenterNo, WorkCenter);
        Step.SetRange(Finished, false);
        Step.SetRange(PositionLocked, false);
        if not Replan then
            Step.SetRange(Confirmed, false);
        exit(not Step.IsEmpty());
    end;

    local procedure InImportedScope(Draft: Record CF_ScheduleDraftOperation): Boolean
    begin
        if not ImportedOnly then
            exit(true);
        TempImportedOrders.Reset();
        exit(TempImportedOrders.Get(Draft.ScenarioCode, Draft.Status, Draft.OrderNo));
    end;

    local procedure ChainKey(Draft: Record CF_ScheduleDraftOperation): Text
    var
        Parts: JsonArray;
        Value: Text;
    begin
        Parts.Add(Draft.Status.AsInteger());
        Parts.Add(Draft.OrderNo);
        Parts.Add(Draft.RoutingReferenceNo);
        Parts.Add(Draft.RoutingNo);
        Parts.WriteTo(Value);
        exit(Value);
    end;

    local procedure CandidateChainKey(Candidate: Record CF_AutoScheduleBuffer temporary): Text
    var
        Draft: Record CF_ScheduleDraftOperation;
    begin
        Draft.Status := Candidate.Status;
        Draft.OrderNo := Candidate.OrderNo;
        Draft.RoutingReferenceNo := Candidate.RoutingReferenceNo;
        Draft.RoutingNo := Candidate.RoutingNo;
        exit(ChainKey(Draft));
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
        Step: Record CF_ScheduleDraftOperation;
        ChainEnd: DateTime;
    begin
        if not Draft.Get(ScenarioCode, Result.OperationId) then
            Error(MissingLbl);
        Result.Confirmed := Draft.Confirmed;
        Result.StartDateTime := Draft.StartDateTime;
        Result.EndDateTime := Draft.EndDateTime;
        if Result.Scheduled and (Draft.DueDate <> 0D) then begin
            ChainEnd := 0DT;
            Step.SetRange(ScenarioCode, ScenarioCode);
            Step.SetRange(Status, Draft.Status);
            Step.SetRange(OrderNo, Draft.OrderNo);
            Step.SetRange(RoutingReferenceNo, Draft.RoutingReferenceNo);
            Step.SetRange(RoutingNo, Draft.RoutingNo);
            if Step.FindSet() then
                repeat
                    if Step.EndDateTime > ChainEnd then
                        ChainEnd := Step.EndDateTime;
                until Step.Next() = 0;
            if (ChainEnd <> 0DT) and (DT2Date(ChainEnd) > Draft.DueDate) then
                SetResult(Result, Result.Result + ' ' + StrSubstNo(LateFinishLbl, DT2Date(ChainEnd), Draft.DueDate));
        end;
    end;

    local procedure SetResult(var Result: Record CF_AutoScheduleBuffer temporary; MessageText: Text)
    begin
        if StrLen(MessageText) > MaxStrLen(Result.Result) then
            MessageText := CopyStr(MessageText, 1, MaxStrLen(Result.Result) - StrLen(TruncatedLbl)) + TruncatedLbl;
        Result.Result := CopyStr(MessageText, 1, MaxStrLen(Result.Result));
    end;

    var
        TempImportedOrders: Record CF_ScheduleDraftOrder temporary;
        Replan: Boolean;
        ImportedOnly: Boolean;
        ScanLimitErr: Label 'Auto Schedule exceeds 3,000 routing records. Narrow the work-centre or production-order filters. Nothing was scheduled.';
        ConcurrentErr: Label 'Another planner changed this draft order after Auto Schedule was prepared. Refresh and retry.';
        BatchLimitErr: Label 'Auto Schedule is limited to 100 routing chains per run. Narrow the filters. Nothing was scheduled.';
        MissingLbl: Label 'Skipped: the routing operation no longer exists.';
        ScopeChangedLbl: Label 'Skipped: the operation no longer matches the original Schedule Options filters.';
        RangeErr: Label 'The Auto Schedule dates must be within Maximum Schedule Days.';
        FinalReadErr: Label 'Final state could not be read: %1.', Comment = '%1 = error';
        CapacityChangedLbl: Label 'Capacity changed during confirmation. This operation was not saved; reload and retry.';
        ConfirmedLbl: Label 'Skipped: the operation is already confirmed.';
        LockedLbl: Label 'Skipped: the operation is position-locked.';
        CancelledLbl: Label 'Not saved: the overload warning was declined.';
        SavedLbl: Label 'Saved to draft only. %1 routing steps recalculated; BC unchanged.', Comment = '%1 = changed operation count';
        CapacityBypassedLbl: Label 'Occupied capacity and daily overload checks bypassed; working calendars and routing rules retained.';
        LateFinishLbl: Label 'Late: routing chain finishes %1, after its due date %2.', Comment = '%1 = final civil finish date, %2 = due date';
        ChangedAgainLbl: Label 'Later routing changes invalidated this confirmation; review the final dates.';
        TruncatedLbl: Label ' [message truncated]';
        OverloadQst: Label 'Order %1, operation %2 has daily overload:\%3\Save this operation despite the overload? Earlier successful operations remain saved.', Comment = '%1 = order, %2 = operation, %3 = overload report';
}
