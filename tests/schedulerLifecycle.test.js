"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = (folder, file) => fs.readFileSync(path.join(__dirname, "..", "src", folder, file), "utf8");

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
    const flag = setup.slice(setup.indexOf("field(28; AutoScheduleBypassCapacity"), setup.indexOf("    keys"));
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
