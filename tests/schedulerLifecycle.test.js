"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = (folder, file) => fs.readFileSync(path.join(__dirname, "..", "src", folder, file), "utf8");

test("approval filtering is display-only, uses live BC state and restores with the view", () => {
    const page = source("Page", "CFProductionScheduler.Page.al");
    for (const action of ["ShowApprovedOnly", "ShowUnapprovedOnly", "ShowAllApprovals"])
        assert.match(page, new RegExp(`actionref\\(${action}Promoted; ${action}\\)`));
    assert.match(page, /Payload\.Add\('approvalFilter', ApprovalFilter\)/);
    assert.match(page, /State\.ApprovalFilter := ApprovalFilter/);
    assert.match(page, /ApprovalFilter := State\.ApprovalFilter/);
    const draft = source("Codeunit", "CFScheduleDraftMgt.Codeunit.al");
    assert.match(draft, /if Routing\.GetBySystemId\(Draft\.OperationId\) then\s+Approved := Mgt\.IsConfirmed\(Routing\)/);
    assert.match(draft, /Item\.Add\('approved', Approved\)/);
    const planning = page.slice(page.indexOf("local procedure RunAutoSchedule("), page.indexOf("local procedure ResetScenario("));
    assert.doesNotMatch(planning, /ApprovalFilter/);
});

test("planning accepts chains with locks but moves only eligible unlocked operations", () => {
    const auto = source("Codeunit", "CFAutoSchedule.Codeunit.al");
    assert.match(auto, /exit\(not Draft\.Finished and not Draft\.PositionLocked and \(Replan or not Draft\.Confirmed\)\)/);
    const change = source("Codeunit", "CFDraftScheduleChange.Codeunit.al");
    assert.match(change, /exit\(not Draft\.PositionLocked and not Draft\.Finished and\s+\(not Automatic or Replan or not Draft\.Confirmed\)\)/);
    assert.match(change, /if Automatic and CanMove\(Following\) then\s+ExcludedOperations\.Add\(Following\.OperationId\)/);
    assert.match(change, /if not CanMove\(Following\) then\s+Error\(LockedErr, Following\.OperationNo\)/);
    assert.match(source("Codeunit", "CFDraftFiniteSlots.Codeunit.al"), /if not Excluded\.Contains\(Allocation\.OperationId\) then begin/);
    const page = source("Page", "CFProductionScheduler.Page.al");
    assert.match(page.slice(page.indexOf("action(AutoSchedule)"), page.indexOf("action(ReplanUnlocked)")),
        /RunAutoSchedule\(false, false, TempImported\)/);
    assert.match(page.slice(page.indexOf("action(ReplanUnlocked)"), page.indexOf("action(Refresh)")),
        /RunAutoSchedule\(true, false, TempImported\)/);
});

test("selection toolbar hides position actions that have no applicable state changes", () => {
    const ui = source("ControlAddIn", "scheduler.js");
    assert.match(ui, /const changes = lockChanges\(items, locked\);[\s\S]*?control\.hidden = changes\.length === 0;/);
    assert.match(ui, /control\.dataset\.allowed = String\(changes\.length > 0 && changes\.every\(item => canLock\(item, locked\)\)\)/);
});

test("document zoom toolbar and context menu share the existing reversible view flow", () => {
    const ui = source("ControlAddIn", "scheduler.js");
    assert.match(ui, /documentZoom\.textContent = label\(payload\.documentFocus \? "unzoomDocument" : "zoomDocument"\)/);
    assert.match(ui, /selection\.append\(lock, unlock, documentZoom, status\)/);
    const page = source("Page", "CFProductionScheduler.Page.al");
    const context = page.slice(page.indexOf("local procedure HandleContext("));
    assert.ok(context.indexOf("if Command = 'unzoom'") < context.indexOf("Drafts.GetOperation("));
    assert.match(context, /'zoom': FocusDocument\(\)/);
    assert.match(page, /local procedure UnzoomDocument\(\)[\s\S]*?RestoreView\(TempPreviousView\);[\s\S]*?ViewChange := 'restore';/);
});

test("drag saves retain pending visuals without mutating the authoritative operation dates", () => {
    const ui = source("ControlAddIn", "scheduler.js");
    const drag = ui.slice(ui.indexOf("function dragBar("), ui.indexOf("function requestCurrentTime("));
    assert.match(drag, /if \(!savingPosition\) fragment\.style\.transform = ""/);
    assert.match(drag, /if \(savingPosition\) pendingMove = \{ nodes: fragments \}/);
    assert.doesNotMatch(drag, /item\.(?:start|end|version|confirmed)\s*=/);
    const drop = ui.slice(ui.indexOf("function dropPending("), ui.indexOf("function renderRoutingLinks("));
    assert.match(drop, /previewPendingDrop\(drop\);\s+showDragDates\(drop\.item, drop\.start, drop\.lane, pendingMove\.preview\);\s+invoke\("OperationStartChangeRequested"/);
    assert.match(ui, /if \(currentGeneration === generation && !pendingMove\) setBusy\(false\)/);
    assert.match(ui, /clearPendingMove\(\);\s+if \(pendingSave\) setDraftStatus\("saved"/);
    assert.match(ui, /if \(state === "failed"\) clearPendingMove\(\)/);
    assert.match(ui, /if \(pendingMove\) error\(label\("failed"\)\)/);
});

test("drag snapping setup is validated and passed to both drag paths", () => {
    const setup = source("Table", "CFProductionSchedulerSetup.Table.al");
    assert.match(setup, /field\(30; DragSnapMinutes; Integer\)[\s\S]*?InitValue = 15/);
    assert.match(setup, /DragSnapMinutes < 1.*DragSnapMinutes > 1440/);
    assert.match(source("Codeunit", "CFSchedulerUpgrade.Codeunit.al"), /if Setup\.DragSnapMinutes = 0 then\s+Setup\.DragSnapMinutes := 15/);
    assert.match(source("Page", "CFProductionSchedulerSetup.Page.al"), /field\(DragSnapMinutes; Rec\.DragSnapMinutes\)/);
    assert.match(source("Codeunit", "CFProductionSchedulerMgt.Codeunit.al"), /Payload\.Add\('dragSnapMinutes', Setup\.DragSnapMinutes\)/);
    const ui = source("ControlAddIn", "scheduler.js");
    assert.match(ui, /core\.droppedAxisStart\(currentAxis, event\.clientX - rect\.left, rect\.width, payload\.dragSnapMinutes \?\? 15\)/);
    assert.equal((ui.match(/core\.draggedAxisStart\(axis, core\.parseCivil\(item\.start\), delta, width, payload\.dragSnapMinutes \?\? 15\)/g) || []).length, 2);
});

test("Planned to Firm Planned promotion defaults on and preserves later setup opt-outs", () => {
    const setup = source("Table", "CFProductionSchedulerSetup.Table.al");
    assert.match(setup, /field\(29; FirmPlannedOnCommit; Boolean\)[\s\S]*?InitValue = true/);
    assert.match(source("Page", "CFProductionSchedulerSetup.Page.al"), /field\(FirmPlannedOnCommit; Rec\.FirmPlannedOnCommit\)/);
    const upgrade = source("Codeunit", "CFSchedulerUpgrade.Codeunit.al");
    assert.match(upgrade, /if not UpgradeTag\.HasUpgradeTag\(FirmPlannedTag\(\)\) then\s+Setup\.FirmPlannedOnCommit := true/);
    assert.match(upgrade, /UpgradeTag\.SetUpgradeTag\(FirmPlannedTag\(\)\)/);
    assert.match(upgrade, /OnGetPerCompanyUpgradeTags/);
    assert.match(upgrade, /PerCompanyUpgradeTags\.Add\(FirmPlannedTag\(\)\)/);
});

test("only successful fully-approved Planned order commits promote, including unchanged dates", () => {
    const worker = source("Codeunit", "CFProductionScheduleChange.Codeunit.al");
    assert.match(worker, /Setup\.FirmPlannedOnCommit and \(Status = Status::Planned\) and AllUnfinishedApproved\(Draft\)/);
    const approval = worker.slice(worker.indexOf("local procedure AllUnfinishedApproved"), worker.indexOf("local procedure PromoteAndRemap"));
    assert.match(approval, /Draft\.SetRange\(Finished, false\);\s+if Draft\.IsEmpty\(\) then\s+exit\(false\)/);
    assert.match(approval, /Draft\.SetRange\(Confirmed, false\);\s+exit\(Draft\.IsEmpty\(\)\)/);
    assert.doesNotMatch(approval, /Changed|StartDateTime|EndDateTime/);
    const commit = worker.slice(worker.indexOf("local procedure CommitOrder()"), worker.indexOf("local procedure AllUnfinishedApproved"));
    assert.ok(commit.indexOf("PromoteAndRemap(Order") > commit.indexOf("Error('%1%2', ConfirmationPrefix(), Warning)"));
    assert.ok(commit.indexOf("PromoteAndRemap(Order") > commit.indexOf("VerifyAllocations(Draft, Routing)"));
    assert.match(commit, /Drafts\.CheckBaseline\(DraftOrder\)/);
    assert.match(commit, /State\.RoutingVersion := Routing\.SystemRowVersion/);
    assert.match(commit, /Drafts\.ImportOrder\(ScenarioCode, Order\.Status, Order\."No\.", true\)/);
    assert.doesNotMatch(commit, /Commit\(\)/);
});

test("promotion uses BC status management with narrowly bound commit suppression", () => {
    const promotion = source("Codeunit", "CFSchedulerOrderPromotion.Codeunit.al");
    assert.match(promotion, /EventSubscriberInstance = Manual/);
    assert.match(promotion, /CommitBehavior\(CommitBehavior::Error\)/);
    assert.match(promotion, /Order\.TestField\(Status, Order\.Status::Planned\)/);
    assert.match(promotion, /BindSubscription\(Subscriber\);\s+StatusMgt\.ChangeProdOrderStatus\(Order, Order\.Status::"Firm Planned", WorkDate\(\), false\);\s+UnbindSubscription\(Subscriber\)/);
    assert.match(promotion, /xProductionOrder\.Status <> xProductionOrder\.Status::Planned/);
    assert.match(promotion, /xProductionOrder\."No\." <> RequestedOrderNo/);
    assert.match(promotion, /NewStatus <> NewStatus::"Firm Planned"/);
    assert.match(promotion, /SuppressCommit := true/);
    assert.match(promotion, /Result := ToProdOrder/);
    assert.doesNotMatch(promotion, /Order\.Validate\(Status|Order\.Rename|Commit\(\)/);
    assert.match(source("PermissionSet", "CFSchedulerCommit.PermissionSet.al"), /codeunit CF_SchedulerOrderPromotion = X/);
    assert.doesNotMatch(source("PermissionSet", "CFSchedulerPlanner.PermissionSet.al"), /CF_SchedulerOrderPromotion/);
});

test("promotion verifies remapped routing and allocations before replacing the active scenario", () => {
    const worker = source("Codeunit", "CFProductionScheduleChange.Codeunit.al");
    const remap = worker.slice(worker.indexOf("local procedure PromoteAndRemap"), worker.indexOf("local procedure VerifyAllocations"));
    assert.match(remap, /ExistingOrder\.Get\(ScenarioCode, Order\.Status, Order\."No\."\)/);
    assert.match(remap, /Routing\.Count\(\) <> Draft\.Count\(\)/);
    assert.match(remap, /Routing\.Get\(Order\.Status, Order\."No\.", Draft\.RoutingReferenceNo, Draft\.RoutingNo, Draft\.OperationNo\)/);
    assert.match(remap, /Routing\."Starting Date-Time" <> Draft\.StartDateTime/);
    assert.match(remap, /Routing\."Ending Date-Time" <> Draft\.EndDateTime/);
    assert.match(remap, /VerifyAllocations\(Draft, Routing\)/);
    assert.match(remap, /TempOperations := Draft/); // Includes confirmations and position locks.
    assert.match(remap, /TempOperations\.OperationId := Routing\.SystemId/);
    assert.match(remap, /if Draft\.OperationId <> Routing\.SystemId then\s+if State\.Get\(Draft\.OperationId\) then\s+State\.Delete\(\)/);
    assert.ok(remap.indexOf("VerifyAllocations") < remap.indexOf("Allocation.DeleteAll()"));
    assert.match(remap, /Allocation\.SetRange\(ScenarioCode, ScenarioCode\)/);
    assert.match(remap, /DraftOrder\.Delete\(\);\s+DraftOrder\.Status := Order\.Status;\s+DraftOrder\.OrderNo := Order\."No\.";\s+DraftOrder\.Insert\(\)/);
    assert.match(remap, /Draft\.SetRange\(Status, Order\.Status\);\s+Draft\.SetRange\(OrderNo, Order\."No\."\)/);
    const page = source("Page", "CFProductionScheduler.Page.al");
    assert.match(page, /Worker\.GetCommittedOrder\(CommittedOrder\);\s+TempResults\.Status := CommittedOrder\.Status;\s+TempResults\.OrderNo := CommittedOrder\."No\."/);
    assert.match(page, /StrSubstNo\(PromotedCommitLbl, TempOrders\.OrderNo, CommittedOrder\."No\."\)/);
    assert.match(page, /if ProductionOrderNo = TempOrders\.OrderNo then\s+ProductionOrderNo := CommittedOrder\."No\.";\s+Clear\(SelectedOperationId\)/);
});

test("Run Finite Plan is promoted and rejects non-finite or bypass configuration before planning", () => {
    const page = source("Page", "CFProductionScheduler.Page.al");
    const action = page.slice(page.indexOf("action(AutoSchedule)"), page.indexOf("action(ReplanUnlocked)"));
    assert.match(action, /Caption = 'Run Finite Plan'/);
    assert.match(page, /actionref\(AutoSchedulePromoted; AutoSchedule\)/);
    assert.match(action, /ReloadPlanningSettings\(\)/);
    assert.match(action, /AutoScheduleMethod <> ViewSetup\.AutoScheduleMethod::FiniteCapacity/);
    assert.match(action, /ViewSetup\.AutoScheduleBypassCapacity\s+then\s+Error\(FinitePlanSetupErr\)/);
    assert.ok(action.indexOf("Error(FinitePlanSetupErr)") < action.indexOf("RunAutoSchedule(false, false, TempImported)"));
});

test("imported-order override preserves dates, allocations and routing restrictions", () => {
    const draft = source("Codeunit", "CFScheduleDraftMgt.Codeunit.al");
    const override = draft.slice(draft.indexOf("procedure OverrideImportedOrder("), draft.indexOf("procedure LiveVersion("));
    assert.match(override, /Draft\.SetRange\(Finished, false\);\s+Draft\.ModifyAll\(Confirmed, true\);\s+Draft\.ModifyAll\(Changed, true\)/);
    assert.match(override, /DraftOrder\.Revision \+= 1;\s+DraftOrder\.Changed := true/);
    assert.doesNotMatch(override, /(?:StartDateTime|EndDateTime|Restriction|WorkMinutes)\s*:=|Allocation\.(?:Modify|Delete|Insert)|ImportOrder|ApplyChange/);
    assert.match(override, /Draft\.StartDateTime <> Draft\.BaselineStart/);
    assert.match(override, /Draft\.EndDateTime <> Draft\.BaselineEnd/);
    assert.match(override, /Draft\.Restriction <> ComplexErr/);
    assert.match(override, /Mgt\.EditIssue\(Routing\)/);
    assert.match(override, /Abs\(TotalMinutes - Draft\.WorkMinutes\)/);
    assert.match(override, /Draft\.WritePermission\(\)/);
    assert.match(override, /DraftOrder\.Revision <> ExpectedRevision/);
    assert.equal((override.match(/CheckBaseline\(DraftOrder\)/g) || []).length, 2);
    assert.ok(override.indexOf("Confirm(OverrideOverloadQst") < override.indexOf("LockScenario(ScenarioCode)"));
    assert.match(override, /if Warning <> AcceptedWarning then\s+Error\(StaleErr\)/);
    // An unchanged snapshot with Block=false reports existing overload only for the selected order's pools.
    assert.equal((override.match(/Before\.Copy\(After, true\)/g) || []).length, 2);
    assert.equal((override.match(/OverloadReport\(Before, After, false\)/g) || []).length, 2);
});

test("auto schedule results override is order-wide and refreshes the scheduler after closing", () => {
    const results = source("Page", "CFAutoScheduleResults.Page.al");
    assert.match(results, /Caption = 'Override and Save to Draft'/);
    assert.match(results, /OverrideImportedOrder\(ScenarioCode, Rec\.OperationId, Rec\.DraftRevision, Warning\)/);
    assert.match(results, /Results\.SetRange\(Status, Rec\.Status\);\s+Results\.SetRange\(OrderNo, Rec\.OrderNo\)/);
    assert.match(results, /Results\.DraftRevision := DraftOrder\.Revision/);
    assert.match(results, /Results\.Confirmed := Draft\.Confirmed/);
    assert.match(results, /Commit\(\);\s+CurrPage\.Update\(false\)/);
    const page = source("Page", "CFProductionScheduler.Page.al");
    assert.match(page, /ResultsPage\.SetResults\(TempResults, ActiveScenarioCode\);\s+ResultsPage\.RunModal\(\);\s+RefreshSchedule\(\)/);
});

test("opening restores view state without importing or recalculating drafts", () => {
    const page = source("Page", "CFProductionScheduler.Page.al");
    const opening = page.slice(page.indexOf("trigger OnOpenPage()"), page.indexOf("procedure SetOrder("));
    assert.match(opening, /RestoreSessionView\(\)/);
    assert.match(opening, /SaveSessionView\(\)/);
    assert.doesNotMatch(opening, /ImportScope|ImportOrder|RunAutoSchedule|ApplyChange/);
    assert.match(page, /Payload\.Add\('viewStateKey', CompanyName\(\)/);
});

test("reset action explicitly includes hidden orders and uses a revision-checked atomic worker", () => {
    const page = source("Page", "CFProductionScheduler.Page.al");
    const reset = page.slice(page.indexOf("local procedure ResetScenario()"), page.indexOf("local procedure SetPositionLocks("));
    assert.match(reset, /Orders\.SetRange\(ScenarioCode, ActiveScenarioCode\)/);
    assert.doesNotMatch(reset, /SetRange\(OrderNo|WorkCenterNo|ViewStartDate/);
    assert.match(reset, /ExpectedRevision := Scenario\.Revision/);
    assert.match(reset, /SetResetRequest\(ActiveScenarioCode, ExpectedRevision\)/);
    assert.match(reset, /if not DraftActions\.Run\(\) then/);
    assert.match(page, /Hidden and filtered orders are included/);
});

test("import-and-schedule limits scheduling candidates to newly imported orders", () => {
    const page = source("Page", "CFProductionScheduler.Page.al");
    assert.match(page, /ImportNewOrders\(true\)/);
    assert.match(page, /not TempExisting\.Get\(ActiveScenarioCode, Existing\.Status, Existing\.OrderNo\)/);
    assert.match(page, /RunAutoSchedule\(false, true, TempImported\)/);
    assert.match(page, /if ImportedOnly then\s+AutoScheduler\.SetImportedOrders\(TempImported\);\s+AutoScheduler\.Prepare/);
});

test("manual undo seals the worker's exact revision rather than adopting concurrent edits", () => {
    const page = source("Page", "CFProductionScheduler.Page.al");
    const apply = page.slice(page.indexOf("local procedure ApplyChange("), page.indexOf("local procedure RequireScenario()"));
    assert.match(apply, /CaptureUndoForOperation\(ActiveScenarioCode, OperationId, Version\)/);
    assert.match(apply, /if not TryCaptureUndo\(OperationId, Version\) then begin[\s\S]*?ShowError\(Failure\)/);
    assert.match(apply, /if Saved then\s+DraftActions\.AcceptUndoRevision\(Change\.GetOrderRevision\(\)\)/);
    assert.match(page, /DraftActions\.CanUndo\(ActiveScenarioCode\)/);
});

test("calendar drift is reported without replacing saved operation dates", () => {
    const draft = source("Codeunit", "CFScheduleDraftMgt.Codeunit.al");
    const warnings = draft.slice(draft.indexOf("procedure AddScenarioWarnings("), draft.indexOf("local procedure AppendVersion("));
    assert.match(warnings, /LiveVersion/);
    assert.match(warnings, /CalendarVersion/);
    assert.match(warnings, /Warnings\.Add/);
    assert.match(warnings, /CalendarUnknownLbl/);
    assert.doesNotMatch(warnings, /\.Modify|\.Insert|\.Delete|ImportOrder/);
    assert.match(draft, /AppendCalendarVersion\("Capacity Type"::"Work Center", Routing\."Work Center No\."/);
});

test("explicit reset clears locks while successful BC commit retains them", () => {
    const draft = source("Codeunit", "CFScheduleDraftMgt.Codeunit.al");
    assert.match(draft, /if Committed then begin[\s\S]*?Draft\.SetRange\(PositionLocked, true\)/);
    assert.match(draft, /Draft\.PositionLocked := Committed and LockedIds\.Contains\(Routing\.SystemId\)/);
    assert.match(draft, /Item\.Add\('positionLocked', Draft\.PositionLocked\)/);
});

test("planning actions use one explicit mode and a full scheduling horizon from the selected start", () => {
    const page = source("Page", "CFProductionScheduler.Page.al");
    assert.match(page, /AutoScheduler\.SetReplan\(Replan\)/);
    assert.match(page, /LastDate := ViewStartDate \+ ViewSetup\.MaximumScheduleDays - 1/);
    assert.match(page, /RunAutoSchedule\(true, false, TempImported\)/);
    assert.match(page, /RunAutoSchedule\(false, false, TempImported\)/);
});

test("new draft lifecycle workers are available to planners, not granted to read-only viewers", () => {
    assert.match(source("PermissionSet", "CFSchedulerPlanner.PermissionSet.al"), /codeunit CF_SchedulerDraftActions = X/);
    assert.doesNotMatch(source("PermissionSet", "CFSchedulerView.PermissionSet.al"), /codeunit CF_SchedulerDraftActions = X/);
    assert.match(source("PermissionSet", "CFSchedulerView.PermissionSet.al"), /codeunit CF_SchedulerSessionState = X/);
});

test("manual and automatic moves share finite slots without clearing successor confirmations", () => {
    const change = source("Codeunit", "CFDraftScheduleChange.Codeunit.al");
    assert.match(change, /Method := Setup\.AutoScheduleMethod/);
    assert.match(change, /Slots\.Initialize\(Draft, ScenarioCode/);
    assert.match(change, /Following\.Confirmed := Following\.Confirmed or Automatic/);
    assert.match(change, /Cursor > Following\.StartDateTime/);
    assert.match(change, /if not CanMove\(Following\) then\s+Error\(LockedErr/);
    assert.match(change, /\[CommitBehavior\(CommitBehavior::Error\)\]/);
});

test("batch candidates are unique routing chains and fixed positions are not auto candidates", () => {
    const auto = source("Codeunit", "CFAutoSchedule.Codeunit.al");
    assert.match(auto, /not Draft\.PositionLocked/);
    assert.match(auto, /not PreparedChains\.ContainsKey\(RoutingKey\)/);
    assert.match(auto, /PreparedChains\.Add\(RoutingKey, true\)/);
    assert.match(auto, /SelectedChains\.ContainsKey\(RoutingKey\) and IsEligible\(Draft\)/);
    assert.match(auto, /not ChainMatchesScope\(Draft, WorkCenter\)/);
    assert.match(auto, /Change\.SetReplan\(Replan\)/);
    assert.match(auto, /LateFinishLbl/);
});

test("finite reservations use assigned resource concurrency, active scenario overlays and parent daily work", () => {
    const slots = source("Codeunit", "CFDraftFiniteSlots.Codeunit.al");
    assert.match(slots, /Need\.Type = Draft\.ResourceType/);
    assert.match(slots, /Need\."No\." = Draft\.ResourceNo/);
    assert.match(slots, /ReplacesNeed\(ScenarioCode, Need\)/);
    assert.match(slots, /Allocation\.SetRange\(ScenarioCode, ScenarioCode\)/);
    assert.match(slots, /Capacity\.Available\("Capacity Type"::"Work Center"/);
    assert.match(slots, /ResourceLoad/);
    assert.match(source("PermissionSet", "CFSchedulerPlanner.PermissionSet.al"), /codeunit CF_DraftFiniteSlots = X/);
});

test("undo rejects intervening scenario, BC reservation and calendar changes", () => {
    const actions = source("Codeunit", "CFSchedulerDraftActions.Codeunit.al");
    assert.match(actions, /Scenario\.Revision <> UndoScenarioRevision/);
    assert.match(actions, /CapacityVersion\(UndoWorkCenters\) <> UndoCapacityVersion/);
    assert.match(actions, /CheckCalendarSnapshot\(TempUndoOrders\)/);
    assert.match(actions, /DraftOrder\.Revision \+ 1/);
    assert.match(actions, /Draft\.Insert\(false, true\)/);
    assert.match(actions, /RequestVersions\.ContainsKey\(OperationId\)/);
});

test("capacity bypass is an opt-in automatic scheduling setting with explicit confirmation and results", () => {
    const setup = source("Table", "CFProductionSchedulerSetup.Table.al");
    const flag = setup.match(/field\(28; AutoScheduleBypassCapacity; Boolean\)\s*\{[^}]*\}/)[0];
    assert.match(flag, /Boolean/);
    assert.doesNotMatch(flag, /InitValue\s*=\s*true/);
    assert.match(source("Page", "CFProductionSchedulerSetup.Page.al"), /field\(AutoScheduleBypassCapacity; Rec\.AutoScheduleBypassCapacity\)/);
    const page = source("Page", "CFProductionScheduler.Page.al");
    assert.match(page, /ModeCaption, ViewSetup\.AutoScheduleBypassCapacity\)/);
    assert.match(page, /Bypass occupied capacity and daily overload checks: %7/);
    const auto = source("Codeunit", "CFAutoSchedule.Codeunit.al");
    assert.equal((auto.match(/SetAutomaticOptions\(Setup\.AutoScheduleMethod, FirstDate, LastDate, Setup\.AutoScheduleBypassCapacity\)/g) || []).length, 2);
    assert.match(auto, /if Setup\.AutoScheduleBypassCapacity then\s+SetResult\(Results, Results\.Result \+ ' ' \+ CapacityBypassedLbl\)/);
});

test("bypass skips occupied slots and overload rejection only for automatic requests", () => {
    const change = source("Codeunit", "CFDraftScheduleChange.Codeunit.al");
    assert.match(change, /if \(Warning <> ''\) and not \(Automatic and BypassCapacity\) then begin/);
    assert.match(change, /\(Method = Method::FiniteCapacity\) and not BypassCapacity, ExcludedOperations\)/);
    assert.match(change, /if \(Method = Method::FiniteCapacity\) and not BypassCapacity and \(Work > WorkLimit\) then/);
    const request = change.slice(change.indexOf("procedure SetRequest("), change.indexOf("procedure SetReplan("));
    assert.match(request, /Automatic := false/);
    assert.match(request, /BypassCapacity := false/);
    assert.match(change, /Setup\.AutoScheduleBypassCapacity <> BypassCapacity/);
    assert.match(change, /Error\(PlanningChangedErr\)/);
});

test("capacity bypass retains calendars, routing restrictions, locks and the scheduling horizon", () => {
    const change = source("Codeunit", "CFDraftScheduleChange.Codeunit.al");
    assert.match(change, /ValidateOperation\(Draft\)/);
    assert.match(change, /if Draft\.Restriction <> '' then\s+Error/);
    assert.match(change, /ValidateChain\(Draft\)/);
    assert.match(change, /if Draft\.PositionLocked then\s+Error/);
    assert.match(change, /Calendar\.SetFilter\("Capacity \(Effective\)", '>0'\)/);
    assert.match(change, /Slots\.Window\(Calendar, SlotStart, FreeEnd, WorkLimit\)/);
    assert.match(change, /Draft\.EndDateTime > CreateDateTime\(LastDate \+ 1, 0T\)/);
    assert.match(source("Codeunit", "CFDraftFiniteSlots.Codeunit.al"), /\(ParentCapacity > 0\) and \(not UseFinite or/);
    assert.doesNotMatch(source("Codeunit", "CFProductionScheduleChange.Codeunit.al"), /AutoScheduleBypassCapacity|BypassCapacity/);
});
