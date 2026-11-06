namespace CloudFactory.ProductionScheduling;

using Microsoft.Manufacturing.Document;

codeunit 91312 CF_SchedulerDraftActions
{
    trigger OnRun()
    begin
        ExecuteRequest();
    end;

    [CommitBehavior(CommitBehavior::Error)]
    local procedure ExecuteRequest()
    begin
        CheckPermissions();
        AffectedCount := 0;
        case Request of
            Request::Reset:
                ResetOrders();
            Request::Locks:
                SetLocks();
            Request::Undo:
                RestoreUndo();
            else
                Error(RequestErr);
        end;
        Request := Request::None;
    end;

    procedure SetResetRequest(ScenarioCode: Code[20]; ExpectedScenarioRevision: Integer)
    var
        Scenario: Record CF_ScheduleScenario;
    begin
        Request := Request::None;
        CheckPermissions();
        Scenario.Get(ScenarioCode);
        if Scenario.Revision <> ExpectedScenarioRevision then
            Error(ScenarioStaleErr);
        RequestScenario := ScenarioCode;
        RequestScenarioId := Scenario.SystemId;
        RequestRevision := ExpectedScenarioRevision;
        Request := Request::Reset;
    end;

    procedure SetLockRequest(ScenarioCode: Code[20]; OperationsJson: Text; Locked: Boolean)
    var
        Scenario: Record CF_ScheduleScenario;
        Items: JsonArray;
        Item: JsonToken;
        IdToken: JsonToken;
        VersionToken: JsonToken;
        Value: JsonObject;
        OperationId: Guid;
        ExpectedVersion: Text;
    begin
        Request := Request::None;
        CheckPermissions();
        Scenario.Get(ScenarioCode);
        Clear(RequestVersions);
        if (StrLen(OperationsJson) > 2000000) or not Items.ReadFrom(OperationsJson) then
            Error(SelectionErr);
        if (Items.Count() = 0) or (Items.Count() > 1000) then
            Error(SelectionErr);
        foreach Item in Items do begin
            if not Item.IsObject() then
                Error(SelectionErr);
            Value := Item.AsObject();
            if not Value.Get('id', IdToken) or not Value.Get('version', VersionToken) then
                Error(SelectionErr);
            if not Evaluate(OperationId, JsonText(IdToken)) then
                Error(SelectionErr);
            ExpectedVersion := JsonText(VersionToken);
            if IsNullGuid(OperationId) or (ExpectedVersion = '') or (StrLen(ExpectedVersion) > 250) then
                Error(SelectionErr);
            if RequestVersions.ContainsKey(OperationId) then
                Error(DuplicateErr);
            RequestVersions.Add(OperationId, ExpectedVersion);
        end;
        RequestScenario := ScenarioCode;
        RequestScenarioId := Scenario.SystemId;
        RequestLocked := Locked;
        Request := Request::Locks;
    end;

    procedure CaptureUndoForOperation(ScenarioCode: Code[20]; OperationIdText: Text; ExpectedVersion: Text)
    var
        Scenario: Record CF_ScheduleScenario;
        DraftOrder: Record CF_ScheduleDraftOrder;
        Draft: Record CF_ScheduleDraftOperation;
    begin
        CheckPermissions();
        ClearCandidate();
        Scenario.LockTable();
        Scenario.Get(ScenarioCode);
        Drafts.GetOperation(ScenarioCode, OperationIdText, Draft);
        Drafts.CheckVersion(Draft, ExpectedVersion);
        DraftOrder.Get(ScenarioCode, Draft.Status, Draft.OrderNo);
        Drafts.CheckBaseline(DraftOrder);
        CandidateScenario := ScenarioCode;
        CandidateScenarioId := Scenario.SystemId;
        CandidateScenarioRevision := Scenario.Revision + 1;
        CaptureOrder(DraftOrder);
        CandidateCapacityVersion := CapacityVersion(CandidateWorkCenters);
        CandidateReady := true;
    end;

    procedure AcceptUndoRevision(NewRevision: Integer)
    begin
        if not CandidateReady or (TempCandidateOrders.Count() <> 1) then
            Error(CaptureErr);
        TempCandidateOrders.FindFirst();
        if NewRevision <> TempCandidateOrders.Revision + 1 then
            Error(CaptureErr);
        Clear(CandidateVersions);
        CandidateVersions.Add(OrderKey(TempCandidateOrders), NewRevision);
        // The worker's exact result is essential: a later reader could seal somebody else's edit.
        PromoteCandidate();
    end;

    procedure SetUndoRequest(ScenarioCode: Code[20])
    begin
        Request := Request::None;
        CheckPermissions();
        if not CanUndo(ScenarioCode) then
            Error(NoUndoErr);
        RequestScenario := ScenarioCode;
        RequestScenarioId := UndoScenarioId;
        Request := Request::Undo;
    end;

    procedure CanUndo(ScenarioCode: Code[20]): Boolean
    var
        Scenario: Record CF_ScheduleScenario;
    begin
        if not UndoReady or (ScenarioCode <> UndoScenario) then
            exit(false);
        if not Scenario.Get(ScenarioCode) then
            exit(false);
        exit(Scenario.SystemId = UndoScenarioId);
    end;

    procedure ClearUndo()
    begin
        UndoReady := false;
        Clear(UndoScenario);
        Clear(UndoScenarioId);
        Clear(UndoVersions);
        Clear(UndoOriginalCalendarBaselines);
        Clear(UndoWorkCenters);
        Clear(UndoCapacityVersion);
        UndoScenarioRevision := 0;
        TempUndoOrders.Reset();
        TempUndoOrders.DeleteAll();
        TempUndoOperations.Reset();
        TempUndoOperations.DeleteAll();
        TempUndoAllocations.Reset();
        TempUndoAllocations.DeleteAll();
        ClearCandidate();
    end;

    procedure GetAffectedCount(): Integer
    begin
        exit(AffectedCount);
    end;

    local procedure ResetOrders()
    var
        Scenario: Record CF_ScheduleScenario;
        DraftOrder: Record CF_ScheduleDraftOrder;
        Order: Record "Production Order";
        Routing: Record "Prod. Order Routing Line";
        TempOrders: Record CF_ScheduleDraftOrder temporary;
    begin
        LockRequestScenario(Scenario);
        if Scenario.Revision <> RequestRevision then
            Error(ScenarioStaleErr);
        Drafts.LockScenario(RequestScenario);
        DraftOrder.SetRange(ScenarioCode, RequestScenario);
        if DraftOrder.FindSet() then
            repeat
                if not Order.Get(DraftOrder.Status, DraftOrder.OrderNo) then
                    Error(MissingOrderErr, DraftOrder.OrderNo, DraftOrder.Status);
                Routing.Reset();
                Routing.SetRange(Status, DraftOrder.Status);
                Routing.SetRange("Prod. Order No.", DraftOrder.OrderNo);
                if Routing.IsEmpty() then
                    Error(NoRoutingErr, DraftOrder.OrderNo);
                TempOrders := DraftOrder;
                TempOrders.Insert();
            until DraftOrder.Next() = 0;
        // Only the already imported order keys are visited; no UI scope or routing filter applies.
        if TempOrders.FindSet() then
            repeat
                Drafts.ImportOrder(RequestScenario, TempOrders.Status, TempOrders.OrderNo, false);
                AffectedCount += 1;
            until TempOrders.Next() = 0;
        ClearUndo();
    end;

    local procedure SetLocks()
    var
        Scenario: Record CF_ScheduleScenario;
        DraftOrder: Record CF_ScheduleDraftOrder;
        Draft: Record CF_ScheduleDraftOperation;
        OperationId: Guid;
    begin
        LockRequestScenario(Scenario);
        Drafts.LockScenario(RequestScenario);
        ClearCandidate();
        CandidateScenario := RequestScenario;
        CandidateScenarioId := Scenario.SystemId;
        CandidateScenarioRevision := Scenario.Revision + 1;
        // Validate every client token before modifying any order revision.
        foreach OperationId in RequestVersions.Keys() do begin
            if not Draft.Get(RequestScenario, OperationId) then
                Error(MissingOperationErr);
            Drafts.CheckVersion(Draft, RequestVersions.Get(OperationId));
            DraftOrder.Get(RequestScenario, Draft.Status, Draft.OrderNo);
            Drafts.CheckBaseline(DraftOrder);
            if RequestLocked then
                ValidateLock(Draft);
        end;
        foreach OperationId in RequestVersions.Keys() do begin
            Draft.Get(RequestScenario, OperationId);
            if not TempCandidateOrders.Get(RequestScenario, Draft.Status, Draft.OrderNo) then begin
                DraftOrder.Get(RequestScenario, Draft.Status, Draft.OrderNo);
                CaptureOrder(DraftOrder);
            end;
        end;
        CandidateCapacityVersion := CapacityVersion(CandidateWorkCenters);
        foreach OperationId in RequestVersions.Keys() do begin
            Draft.Get(RequestScenario, OperationId);
            Draft.PositionLocked := RequestLocked;
            Draft.Modify();
            AffectedCount += 1;
        end;
        TempCandidateOrders.Reset();
        if TempCandidateOrders.FindSet() then
            repeat
                DraftOrder.Get(RequestScenario, TempCandidateOrders.Status, TempCandidateOrders.OrderNo);
                Drafts.CheckBaseline(DraftOrder);
                CheckCalendarSnapshot(TempCandidateOrders);
                DraftOrder.Revision += 1;
                // Position locks are draft metadata, not uncommitted BC schedule changes.
                DraftOrder.Modify();
                CandidateVersions.Add(OrderKey(DraftOrder), DraftOrder.Revision);
            until TempCandidateOrders.Next() = 0;
        PromoteCandidate();
    end;

    local procedure ValidateLock(Draft: Record CF_ScheduleDraftOperation)
    var
        Routing: Record "Prod. Order Routing Line";
        Mgt: Codeunit CF_ProductionSchedulerMgt;
        Issue: Text;
    begin
        if not Draft.Confirmed or Draft.Finished or (Draft.Restriction <> '') or
           (Draft.StartDateTime = 0DT) or (Draft.EndDateTime <= Draft.StartDateTime) or
           (Draft.WorkMinutes <= 0)
        then
            Error(LockErr, Draft.OperationNo, Draft.OrderNo);
        if not Routing.GetBySystemId(Draft.OperationId) then
            Error(MissingOperationErr);
        Issue := Mgt.EditIssue(Routing);
        if Issue <> '' then
            Error('%1: %2', Draft.OperationNo, Issue);
    end;

    local procedure RestoreUndo()
    var
        Scenario: Record CF_ScheduleScenario;
        DraftOrder: Record CF_ScheduleDraftOrder;
        Draft: Record CF_ScheduleDraftOperation;
        Allocation: Record CF_ScheduleDraftAllocation;
        NewRevision: Integer;
    begin
        LockRequestScenario(Scenario);
        if not UndoReady or (UndoScenario <> RequestScenario) or (UndoScenarioId <> Scenario.SystemId) then
            Error(NoUndoErr);
        if Scenario.Revision <> UndoScenarioRevision then
            Error(ScenarioUndoConflictErr);
        if CapacityVersion(UndoWorkCenters) <> UndoCapacityVersion then
            Error(CapacityConflictErr);
        Drafts.LockScenario(RequestScenario);
        TempUndoOrders.Reset();
        if not TempUndoOrders.FindSet() then
            Error(NoUndoErr);
        repeat
            if not DraftOrder.Get(RequestScenario, TempUndoOrders.Status, TempUndoOrders.OrderNo) then
                Error(UndoConflictErr, TempUndoOrders.OrderNo);
            if (DraftOrder.SystemId <> TempUndoOrders.SystemId) or
               (DraftOrder.Revision <> UndoVersions.Get(OrderKey(TempUndoOrders)))
            then
                Error(UndoConflictErr, TempUndoOrders.OrderNo);
            Drafts.CheckBaseline(DraftOrder);
            Drafts.CheckBaseline(TempUndoOrders);
            CheckCalendarSnapshot(TempUndoOrders);
        until TempUndoOrders.Next() = 0;
        TempUndoOrders.FindSet();
        repeat
            DraftOrder.Get(RequestScenario, TempUndoOrders.Status, TempUndoOrders.OrderNo);
            NewRevision := DraftOrder.Revision + 1;
            Draft.Reset();
            Draft.SetRange(ScenarioCode, RequestScenario);
            Draft.SetRange(Status, TempUndoOrders.Status);
            Draft.SetRange(OrderNo, TempUndoOrders.OrderNo);
            Draft.DeleteAll();
            Allocation.Reset();
            Allocation.SetRange(ScenarioCode, RequestScenario);
            Allocation.SetRange(Status, TempUndoOrders.Status);
            Allocation.SetRange(OrderNo, TempUndoOrders.OrderNo);
            Allocation.DeleteAll();
            TempUndoOrders.CalcFields(Baseline, CalendarBaseline);
            DraftOrder := TempUndoOrders;
            DraftOrder.SetCalendarBaseline(UndoOriginalCalendarBaselines.Get(OrderKey(TempUndoOrders)));
            DraftOrder.Revision := NewRevision;
            DraftOrder.Modify();
            AffectedCount += 1;
        until TempUndoOrders.Next() = 0;
        TempUndoOperations.Reset();
        if TempUndoOperations.FindSet() then
            repeat
                TempUndoOperations.CalcFields(Snapshot);
                Draft := TempUndoOperations;
                Draft.Insert(false, true);
            until TempUndoOperations.Next() = 0;
        TempUndoAllocations.Reset();
        if TempUndoAllocations.FindSet() then
            repeat
                Allocation := TempUndoAllocations;
                Allocation.Insert(false, true);
            until TempUndoAllocations.Next() = 0;
        TempUndoOrders.FindSet();
        repeat
            Drafts.CheckBaseline(TempUndoOrders);
            CheckCalendarSnapshot(TempUndoOrders);
        until TempUndoOrders.Next() = 0;
        if CapacityVersion(UndoWorkCenters) <> UndoCapacityVersion then
            Error(CapacityConflictErr);
        // Fresh order revisions and inserted operation rowversions prevent old tokens reviving.
        ClearUndo();
    end;

    local procedure CaptureOrder(var DraftOrder: Record CF_ScheduleDraftOrder)
    var
        Draft: Record CF_ScheduleDraftOperation;
        Allocation: Record CF_ScheduleDraftAllocation;
    begin
        DraftOrder.CalcFields(Baseline, CalendarBaseline);
        TempCandidateOrders := DraftOrder;
        CandidateOriginalCalendarBaselines.Add(OrderKey(DraftOrder), DraftOrder.GetCalendarBaseline());
        TempCandidateOrders.SetCalendarBaseline(Drafts.LiveCalendarVersion(DraftOrder.Status, DraftOrder.OrderNo));
        TempCandidateOrders.Insert(false, true);
        Draft.SetRange(ScenarioCode, DraftOrder.ScenarioCode);
        Draft.SetRange(Status, DraftOrder.Status);
        Draft.SetRange(OrderNo, DraftOrder.OrderNo);
        if Draft.FindSet() then
            repeat
                CandidateOperationCount += 1;
                if CandidateOperationCount > 3000 then
                    Error(SnapshotLimitErr);
                Draft.CalcFields(Snapshot);
                if not CandidateWorkCenters.ContainsKey(Draft.WorkCenterNo) then
                    CandidateWorkCenters.Add(Draft.WorkCenterNo, true);
                TempCandidateOperations := Draft;
                TempCandidateOperations.Insert(false, true);
            until Draft.Next() = 0;
        Allocation.SetRange(ScenarioCode, DraftOrder.ScenarioCode);
        Allocation.SetRange(Status, DraftOrder.Status);
        Allocation.SetRange(OrderNo, DraftOrder.OrderNo);
        if Allocation.FindSet() then
            repeat
                CandidateAllocationCount += 1;
                if CandidateAllocationCount > 50000 then
                    Error(SnapshotLimitErr);
                TempCandidateAllocations := Allocation;
                TempCandidateAllocations.Insert(false, true);
            until Allocation.Next() = 0;
    end;

    local procedure PromoteCandidate()
    var
        OrderTokenKey: Text;
        WorkCenterNo: Code[20];
    begin
        // Keep the accepted snapshot untouched while a new request is being validated/applied.
        UndoReady := false;
        TempUndoOrders.Reset();
        TempUndoOrders.DeleteAll();
        TempUndoOperations.Reset();
        TempUndoOperations.DeleteAll();
        TempUndoAllocations.Reset();
        TempUndoAllocations.DeleteAll();
        TempCandidateOrders.Reset();
        if TempCandidateOrders.FindSet() then
            repeat
                TempCandidateOrders.CalcFields(Baseline, CalendarBaseline);
                TempUndoOrders := TempCandidateOrders;
                TempUndoOrders.Insert(false, true);
            until TempCandidateOrders.Next() = 0;
        TempCandidateOperations.Reset();
        if TempCandidateOperations.FindSet() then
            repeat
                TempCandidateOperations.CalcFields(Snapshot);
                TempUndoOperations := TempCandidateOperations;
                TempUndoOperations.Insert(false, true);
            until TempCandidateOperations.Next() = 0;
        TempCandidateAllocations.Reset();
        if TempCandidateAllocations.FindSet() then
            repeat
                TempUndoAllocations := TempCandidateAllocations;
                TempUndoAllocations.Insert(false, true);
            until TempCandidateAllocations.Next() = 0;
        Clear(UndoVersions);
        Clear(UndoOriginalCalendarBaselines);
        foreach OrderTokenKey in CandidateVersions.Keys() do
            UndoVersions.Add(OrderTokenKey, CandidateVersions.Get(OrderTokenKey));
        foreach OrderTokenKey in CandidateOriginalCalendarBaselines.Keys() do
            UndoOriginalCalendarBaselines.Add(OrderTokenKey, CandidateOriginalCalendarBaselines.Get(OrderTokenKey));
        Clear(UndoWorkCenters);
        foreach WorkCenterNo in CandidateWorkCenters.Keys() do
            UndoWorkCenters.Add(WorkCenterNo, true);
        UndoCapacityVersion := CandidateCapacityVersion;
        UndoScenarioRevision := CandidateScenarioRevision;
        UndoScenario := CandidateScenario;
        UndoScenarioId := CandidateScenarioId;
        UndoReady := not TempUndoOrders.IsEmpty();
        ClearCandidate();
    end;

    local procedure ClearCandidate()
    begin
        CandidateReady := false;
        Clear(CandidateScenario);
        Clear(CandidateScenarioId);
        Clear(CandidateVersions);
        Clear(CandidateOriginalCalendarBaselines);
        Clear(CandidateWorkCenters);
        Clear(CandidateCapacityVersion);
        CandidateScenarioRevision := 0;
        CandidateOperationCount := 0;
        CandidateAllocationCount := 0;
        TempCandidateOrders.Reset();
        TempCandidateOrders.DeleteAll();
        TempCandidateOperations.Reset();
        TempCandidateOperations.DeleteAll();
        TempCandidateAllocations.Reset();
        TempCandidateAllocations.DeleteAll();
    end;

    local procedure LockRequestScenario(var Scenario: Record CF_ScheduleScenario)
    begin
        Scenario.LockTable();
        if not Scenario.Get(RequestScenario) then
            Error(ScenarioStaleErr);
        if Scenario.SystemId <> RequestScenarioId then
            Error(ScenarioStaleErr);
    end;

    local procedure CheckPermissions()
    var
        Scenario: Record CF_ScheduleScenario;
        DraftOrder: Record CF_ScheduleDraftOrder;
        Draft: Record CF_ScheduleDraftOperation;
        Allocation: Record CF_ScheduleDraftAllocation;
    begin
        if not Scenario.WritePermission() or not DraftOrder.WritePermission() or
           not Draft.WritePermission() or not Allocation.WritePermission()
        then
            Error(PermissionErr);
    end;

    local procedure OrderKey(DraftOrder: Record CF_ScheduleDraftOrder): Text
    begin
        exit(Format(DraftOrder.Status.AsInteger(), 0, 9) + ':' + DraftOrder.OrderNo);
    end;

    local procedure CheckCalendarSnapshot(var SnapshotOrder: Record CF_ScheduleDraftOrder)
    begin
        if SnapshotOrder.GetCalendarBaseline() <> Drafts.LiveCalendarVersion(SnapshotOrder.Status, SnapshotOrder.OrderNo) then
            Error(CalendarConflictErr, SnapshotOrder.OrderNo);
    end;

    local procedure JsonText(Token: JsonToken): Text
    var
        Serialized: Text;
    begin
        if not Token.IsValue() then
            Error(SelectionErr);
        Token.WriteTo(Serialized);
        if CopyStr(Serialized, 1, 1) <> '"' then
            Error(SelectionErr);
        exit(Token.AsValue().AsText());
    end;

    local procedure CapacityVersion(WorkCenters: Dictionary of [Code[20], Boolean]): Text
    var
        Need: Record "Prod. Order Capacity Need";
        Fingerprint: TextBuilder;
        WorkCenterNo: Code[20];
        Scanned: Integer;
    begin
        foreach WorkCenterNo in WorkCenters.Keys() do begin
            Fingerprint.Append(Format(StrLen(WorkCenterNo), 0, 9) + ':' + WorkCenterNo + ';');
            Need.SetRange("Work Center No.", WorkCenterNo);
            if Need.FindSet() then
                repeat
                    Scanned += 1;
                    if Scanned > 50000 then
                        Error(CapacityLimitErr);
                    Fingerprint.Append(Format(Need.SystemId, 0, 4) + ':' + Format(Need.SystemRowVersion, 0, 9) + ';');
                until Need.Next() = 0;
        end;
        exit(Fingerprint.ToText());
    end;

    var
        TempCandidateOrders: Record CF_ScheduleDraftOrder temporary;
        TempCandidateOperations: Record CF_ScheduleDraftOperation temporary;
        TempCandidateAllocations: Record CF_ScheduleDraftAllocation temporary;
        TempUndoOrders: Record CF_ScheduleDraftOrder temporary;
        TempUndoOperations: Record CF_ScheduleDraftOperation temporary;
        TempUndoAllocations: Record CF_ScheduleDraftAllocation temporary;
        Drafts: Codeunit CF_ScheduleDraftMgt;
        RequestVersions: Dictionary of [Guid, Text];
        CandidateVersions: Dictionary of [Text, Integer];
        UndoVersions: Dictionary of [Text, Integer];
        CandidateOriginalCalendarBaselines: Dictionary of [Text, Text];
        UndoOriginalCalendarBaselines: Dictionary of [Text, Text];
        CandidateWorkCenters: Dictionary of [Code[20], Boolean];
        UndoWorkCenters: Dictionary of [Code[20], Boolean];
        CandidateCapacityVersion: Text;
        UndoCapacityVersion: Text;
        CandidateScenarioRevision: Integer;
        UndoScenarioRevision: Integer;
        Request: Option None,Reset,Locks,Undo;
        RequestScenario: Code[20];
        RequestScenarioId: Guid;
        RequestRevision: Integer;
        RequestLocked: Boolean;
        CandidateScenario: Code[20];
        CandidateScenarioId: Guid;
        CandidateReady: Boolean;
        CandidateOperationCount: Integer;
        CandidateAllocationCount: Integer;
        UndoScenario: Code[20];
        UndoScenarioId: Guid;
        UndoReady: Boolean;
        AffectedCount: Integer;
        RequestErr: Label 'No draft action has been prepared.';
        ScenarioStaleErr: Label 'The scenario changed after this action was prepared. Refresh and try again.';
        SelectionErr: Label 'Select between 1 and 1000 operations with valid IDs and version tokens.';
        DuplicateErr: Label 'The selected operations contain a duplicate ID.';
        CaptureErr: Label 'The draft undo snapshot cannot be accepted for this worker revision.';
        NoUndoErr: Label 'There is no accepted draft change to undo in this scenario.';
        MissingOrderErr: Label 'Production order %1 (%2) no longer exists in BC. No orders were reset.', Comment = '%1 = production order number, %2 = production order status';
        NoRoutingErr: Label 'Production order %1 has no current BC routing. No orders were reset.', Comment = '%1 = production order number';
        MissingOperationErr: Label 'A selected draft operation or its BC routing no longer exists. Refresh and try again.';
        LockErr: Label 'Operation %1 of order %2 must be scheduled, unfinished and valid before its position can be locked.', Comment = '%1 = operation number, %2 = production order number';
        UndoConflictErr: Label 'Order %1 changed since the accepted draft action. Nothing was undone.', Comment = '%1 = production order number';
        CalendarConflictErr: Label 'The capacity calendar for order %1 changed since this draft snapshot was captured. No draft changes were applied.', Comment = '%1 = production order number';
        ScenarioUndoConflictErr: Label 'The shared draft scenario changed since this action. Nothing was undone.';
        CapacityConflictErr: Label 'BC capacity reservations in an affected work centre changed since this action. Nothing was undone.';
        CapacityLimitErr: Label 'Undo safety validation exceeds 50000 BC capacity reservations. No draft changes were applied.';
        SnapshotLimitErr: Label 'The undo snapshot exceeds 3000 operations or 50000 allocations. No draft changes were applied.';
        PermissionErr: Label 'You do not have write permission for the scenario and draft schedule tables.';
}
