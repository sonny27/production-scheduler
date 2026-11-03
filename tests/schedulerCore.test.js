"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const core = require("../src/ControlAddIn/schedulerCore.js");
const fullDayWindows = Array.from({ length: 7 }, () => ({ start: 0, end: core.day }));
const defaultHourWindows = Array.from({ length: 7 }, () => ({ start: 7 * 60 * core.minute, end: 18 * 60 * core.minute }));
const routingOperation = (id, values = {}) => ({
    id, order: "ORDER-1", statusId: 3, routingReference: 10000, routingNo: "ROUTE",
    confirmed: false, orderScheduled: false, successors: [], predecessors: [], ...values
});

const alSource = (folder, file) => fs.readFileSync(path.join(__dirname, "..", "src", folder, file), "utf8");

test("unscheduled and timeline placement are exclusive, regardless of existing dates or problems", () => {
    for (const confirmed of [false, true]) {
        for (const finished of [false, true]) {
            for (const start of ["", "2026-11-03T08:00:00", "2025-01-01T08:00:00"]) {
                for (const problems of [[], ["No capacity"]]) {
                    const item = {confirmed, finished, start, problems};
                    const snapshot = structuredClone(item);
                    assert.equal(core.onTimeline(item), confirmed || finished);
                    assert.equal(!core.onTimeline(item), !confirmed && !finished);
                    assert.deepEqual(item, snapshot);
                }
            }
        }
    }
});

test("successful scheduling transitions out of the pending list; failed or unconfirmed steps stay there", () => {
    const item = {confirmed: false, finished: false, start: "2026-11-03T08:00:00"};
    assert.equal(core.onTimeline(item), false);
    item.start = "2026-11-03T09:30:00";
    assert.equal(core.onTimeline(item), false);
    item.confirmed = true;
    assert.equal(core.onTimeline(item), true);
    item.confirmed = false;
    assert.equal(core.onTimeline(item), false);
});

test("individual draft edits refresh silently on success but retain overload warnings and errors", () => {
    const page = alSource("Page", "CFProductionScheduler.Page.al");
    const change = page.slice(page.indexOf("local procedure ApplyChange("), page.indexOf("local procedure RequireScenario("));
    assert.doesNotMatch(change, /\bMessage\s*\(/);
    assert.match(change, /Confirm\(OverloadQst, false, Warning\)/);
    assert.match(change, /RefreshSchedule\(\)/);
    assert.match(change, /if not Saved then\s+CurrPage\.Schedule\.ShowError\(Failure\)/);
});

test("draft mutation entry points are wired to the draft worker, not the BC commit worker", () => {
    const page = alSource("Page", "CFProductionScheduler.Page.al");
    const auto = alSource("Codeunit", "CFAutoSchedule.Codeunit.al");
    const draft = alSource("Codeunit", "CFDraftScheduleChange.Codeunit.al");
    assert.match(page, /Change: Codeunit CF_DraftScheduleChange;/);
    assert.match(auto, /Change: Codeunit CF_DraftScheduleChange;/);
    assert.doesNotMatch(auto, /CF_ProductionScheduleChange/);
    assert.doesNotMatch(draft, /Routing\.(Validate|Modify|Insert|Delete)\(/);
    assert.doesNotMatch(draft, /Need\.(Modify|Insert|Delete|DeleteAll)\(/);
    assert.match(draft, /Drafts\.CheckVersion\(Draft, ExpectedVersion\)/);
    assert.match(draft, /Drafts\.CheckBaseline\(DraftOrder\)/);
    assert.match(auto, /DraftOrder\.Revision <> Candidate\.DraftRevision/);
});

test("BC commit source retains whole-order conflict, rollback and recalculation checks", () => {
    const source = alSource("Codeunit", "CFProductionScheduleChange.Codeunit.al");
    const page = alSource("Page", "CFProductionScheduler.Page.al");
    assert.match(source, /\[CommitBehavior\(CommitBehavior::Error\)\]\s+local procedure CommitOrder/);
    assert.ok(source.indexOf("Drafts.CheckBaseline(DraftOrder)") < source.indexOf('Routing.Validate("Starting Date-Time"'));
    assert.ok(source.indexOf("Error(DifferenceErr") < source.indexOf("Drafts.ImportOrder"));
    assert.ok(source.indexOf("VerifyAllocations(Draft, Routing)") < source.indexOf("Drafts.ImportOrder"));
    assert.match(source, /DraftOrder\.Revision <> ExpectedRevision/);
    assert.match(page, /TempResults\.Scheduled := Worker\.Run\(\)/);
    assert.match(page, /until TempOrders\.Next\(\) = 0/);
});

test("entire-schedule commit is promoted and invokes the unfiltered batch scope", () => {
    const page = alSource("Page", "CFProductionScheduler.Page.al");
    const action = page.slice(page.indexOf("action(CommitToBC)"), page.indexOf("action(ScheduleOptions)"));
    assert.match(action, /Caption = 'Commit Entire Schedule to BC'/);
    assert.match(action, /CommitDraftOrders\('', ''\)/);
    assert.match(action, /AccessByPermission = codeunit CF_ProductionScheduleChange = X/);
    assert.match(page, /actionref\(CommitToBCPromoted; CommitToBC\)/);
    const selection = page.slice(page.indexOf("local procedure CommitDraftOrders"),
        page.indexOf("if OperationId <> '' then begin", page.indexOf("local procedure CommitDraftOrders")));
    assert.match(selection, /DraftOrder\.SetRange\(ScenarioCode, ActiveScenarioCode\)/);
    assert.match(selection, /DraftOrder\.SetRange\(Changed, true\)/);
    assert.doesNotMatch(selection, /DraftOrder\.Set(?:Range|Filter)\((?:Status|OrderNo|WorkCenterNo)/);
    assert.match(page, /'commit': CommitDraftOrders\(OperationId, Version\)/);
});

test("draft editing and BC commit have separate permission boundaries", () => {
    const planner = alSource("PermissionSet", "CFSchedulerPlanner.PermissionSet.al");
    const committer = alSource("PermissionSet", "CFSchedulerCommit.PermissionSet.al");
    assert.match(planner, /codeunit CF_DraftScheduleChange = X/);
    assert.doesNotMatch(planner, /codeunit CF_ProductionScheduleChange = X/);
    assert.doesNotMatch(planner, /tabledata CF_ProductionScheduleState = RIMD/);
    assert.match(committer, /codeunit CF_ProductionScheduleChange = X/);
    assert.match(committer, /tabledata CF_ProductionScheduleState = RIMD/);
});

test("all approved context commands have a versioned AL event and server handler", () => {
    const addIn = alSource("ControlAddIn", "CFProductionSchedulerAddIn.ControlAddIn.al");
    const page = alSource("Page", "CFProductionScheduler.Page.al");
    assert.match(addIn, /event OperationContextRequested\(OperationId: Text; Version: Text; Command: Text\)/);
    for (const command of ["details", "edit", "zoom", "reset", "commit", "order"]) {
        assert.ok(page.includes(`'${command}':`), `Missing AL handler for ${command}`);
    }
    assert.match(page, /Page\.RunModal\(Page::CF_ScheduleDraftRouting, Draft\)/);
});

test("problem filtering excludes every diagnosed problem type without changing operation data", () => {
    for (const reason of ["No working capacity", "Overloaded capacity", "Blocked resource", "Missing dates",
        "Missing calculated capacity", "Late", "Unsupported routing"]) {
        const item = { order: "1001", item: "ITEM-A", operation: "10", description: "Assembly", problems: [reason] };
        const before = structuredClone(item);
        assert.equal(core.operationVisible(item, "", true), true);
        assert.equal(core.operationVisible(item, "", false), false);
        assert.equal(core.operationVisible(item, "assembly", false), false);
        assert.deepEqual(item, before);
    }
});

test("problem filtering composes with case-insensitive text search and retains healthy read-only steps", () => {
    const item = { order: "1001", item: "ITEM-A", operation: "10", description: "Assembly",
        problems: [], issue: "Finished operations cannot be scheduled.", finished: true, editable: false };
    for (const include of [true, false]) {
        assert.equal(core.operationVisible(item, "", include), true);
        assert.equal(core.operationVisible(item, "item-a", include), true);
        assert.equal(core.operationVisible(item, "ASSEMBLY", include), true);
        assert.equal(core.operationVisible(item, "different order", include), false);
    }
});

test("hiding a problem routing endpoint does not invent a bypass dependency", () => {
    const items = [
        routingOperation("a", { problems: [], confirmed: true, successors: ["b"] }),
        routingOperation("b", { problems: ["No capacity"], predecessors: ["a"], successors: ["c"] }),
        routingOperation("c", { problems: [], predecessors: ["b"] })
    ];
    const visible = new Set(items.filter(item => core.operationVisible(item, "", false)).map(item => item.id));
    const links = core.routingLinks(items, "a");
    assert.equal(links.edges.length, 2);
    assert.equal(links.edges.filter(edge => visible.has(edge.from) && visible.has(edge.to)).length, 0);
    assert.deepEqual([...visible], ["a", "c"]);
});

test("current-time marker projects session wall time in all four timeline scales", () => {
    const start = core.parseCivil("2026-11-03T00:00:00");
    for (const view of ["hour", "day", "week", "month"]) {
        const axis = core.timeAxis(view, start, start + core.day, defaultHourWindows);
        const expected = view === "hour" ? 3.25 / 11 * 100 : 10.25 / 24 * 100;
        assert.ok(Math.abs(core.currentTimePosition(axis, "2026-11-03T10:15:00") - expected) < 0.000001);
        assert.equal(core.currentTimePosition(axis, "2026-11-04T00:00:00"), null);
        assert.equal(core.currentTimePosition(axis, "2026-11-02T23:59:59"), null);
        assert.throws(() => core.currentTimePosition(axis, "invalid"), RangeError);
    }
});

test("current-time marker hides off-hours and closed dates without snapping to a boundary", () => {
    const start = core.parseCivil("2026-11-03T00:00:00");
    const hourAxis = core.timeAxis("hour", start, start + 3 * core.day, defaultHourWindows,
        ["2026-11-03", "2026-11-05"]);
    assert.equal(core.currentTimePosition(hourAxis, "2026-11-03T06:59:59"), null);
    assert.equal(core.currentTimePosition(hourAxis, "2026-11-03T07:00:00"), 0);
    assert.equal(core.currentTimePosition(hourAxis, "2026-11-03T18:00:00"), null);
    assert.equal(core.currentTimePosition(hourAxis, "2026-11-04T10:00:00"), null);
    assert.equal(core.currentTimePosition(hourAxis, "2026-11-05T07:00:00"), 50);
    const empty = core.timeAxis("day", start, start + core.day, undefined, []);
    assert.equal(core.currentTimePosition(empty, "2026-11-03T10:15:00"), null);
});

test("current-time position accepts refreshed clocks crossing midnight and daylight-saving jumps", () => {
    const start = core.parseCivil("2026-11-01T00:00:00");
    const axis = core.timeAxis("day", start, start + 2 * core.day);
    assert.ok(core.currentTimePosition(axis, "2026-11-02T00:00:00") >
        core.currentTimePosition(axis, "2026-11-01T23:59:59"));
    assert.equal(core.currentTimePosition(axis, "2026-11-02T00:00:00"), 50);
    assert.ok(core.currentTimePosition(axis, "2026-11-01T01:00:00") <
        core.currentTimePosition(axis, "2026-11-01T01:59:59"));
});

test("working dates use positive calendar capacity in any scoped resource, not weekday or load", () => {
    const resources = [
        { days: [{ date: "2026-11-06", available: 480, allocated: 0 }, { date: "2026-11-07", available: 0, allocated: 120 }] },
        { days: [{ date: "2026-11-07", available: 60, allocated: 0 }, { date: "2026-11-08", available: 0.001, allocated: 0 }] },
        { days: [{ date: "2026-11-09", available: 0, allocated: 600 }] }
    ];
    const before = structuredClone(resources);
    assert.deepEqual(core.workingDates(resources), ["2026-11-06", "2026-11-07", "2026-11-08"]);
    assert.deepEqual(resources, before);
    assert.deepEqual(core.workingDates([]), []);
    assert.throws(() => core.workingDates([{ days: [{ date: "2026-11-09", available: NaN, allocated: 0 }] }]), TypeError);
    assert.throws(() => core.workingDates([{ days: [{ date: "2026-11-31", available: 480, allocated: 0 }] }]), RangeError);
});

test("all views compress closed dates while keeping contiguous aligned calendar headers", () => {
    const start = core.parseCivil("2026-10-30T00:00:00");
    const end = core.parseCivil("2026-11-04T00:00:00");
    const visible = ["2026-10-30", "2026-11-02"];
    for (const view of ["hour", "day", "week", "month"]) {
        const axis = core.timeAxis(view, start, end, defaultHourWindows, visible);
        assert.deepEqual(axis.days.map(cell => core.formatCivil(cell.start).slice(0, 10)), visible);
        assert.equal(axis.ticks.length, view === "hour" ? 22 : 2);
        assert.equal(axis.compressed, true);
        for (const level of axis.levels) {
            let right = 0;
            for (const cell of level.cells) {
                assert.ok(Math.abs(cell.left - right) < 0.000001);
                assert.ok(cell.width > 0);
                right += cell.width;
            }
            assert.ok(Math.abs(right - axis.width) < 0.000001);
        }
        const restored = core.timeAxis(view, start, end, defaultHourWindows);
        assert.equal(restored.days.length, 5);
        assert.equal(restored.ticks.length, view === "hour" ? 55 : 5);
    }
});

test("closed-day clipping hides closed-only operations without changing production dates", () => {
    const start = core.parseCivil("2026-11-06T00:00:00");
    const end = core.parseCivil("2026-11-10T00:00:00");
    const operations = [
        { id: "cross", start: "2026-11-06T16:00:00", end: "2026-11-09T10:00:00" },
        { id: "closed", start: "2026-11-07T08:00:00", end: "2026-11-07T12:00:00" }
    ];
    const before = structuredClone(operations);
    const visible = ["2026-11-06", "2026-11-09"];
    for (const view of ["hour", "day", "week", "month"]) {
        const axis = core.timeAxis(view, start, end, defaultHourWindows, visible);
        const placed = core.layout(operations, start, end, axis);
        assert.equal(placed.length, 1);
        assert.equal(placed[0].item.id, "cross");
        const duration = view === "hour" ? 5 * 60 * core.minute : 18 * 60 * core.minute;
        assert.ok(Math.abs(placed[0].width - duration / axis.duration * 100) < 0.000001);
    }
    assert.deepEqual(operations, before);
});

test("bar dragging and unplanned drops skip closed days in every scale", () => {
    const start = core.parseCivil("2026-11-06T00:00:00");
    const end = core.parseCivil("2026-11-10T00:00:00");
    for (const view of ["hour", "day", "week", "month"]) {
        const axis = core.timeAxis(view, start, end, defaultHourWindows, ["2026-11-06", "2026-11-09"]);
        const from = core.parseCivil(view === "hour" ? "2026-11-06T17:45:30" : "2026-11-06T23:45:30");
        const delta = 30 * core.minute / axis.duration * axis.width;
        assert.equal(core.draggedAxisStart(axis, from, delta, axis.width),
            view === "hour" ? "2026-11-09T07:15:30" : "2026-11-09T00:15:30");
        assert.equal(core.draggedAxisStart(axis, core.parseCivil("2026-11-07T08:00:00"), delta, axis.width), "");
        assert.equal(core.droppedAxisStart(axis, axis.width / 2, axis.width),
            view === "hour" ? "2026-11-09T07:00:00" : "2026-11-09T00:00:00");
    }
});

test("all-closed ranges return an empty axis and cannot accept a drop or drag", () => {
    const start = core.parseCivil("2026-11-06T00:00:00");
    for (const view of ["hour", "day", "week", "month"]) {
        const axis = core.timeAxis(view, start, start + core.day, defaultHourWindows, []);
        assert.equal(axis.width, 0);
        assert.equal(axis.duration, 0);
        assert.deepEqual(axis.days, []);
        assert.deepEqual(axis.ticks, []);
        assert.equal(core.axisClip(axis, start, start + core.day), null);
        assert.equal(core.droppedAxisStart(axis, 100, 1000), "");
        assert.equal(core.draggedAxisStart(axis, start, 100, 1000), "");
    }
    assert.throws(() => core.timeAxis("day", start, start + core.day, undefined, ["2026-02-30"]), RangeError);
    assert.throws(() => core.timeAxis("hour", start, start + core.day, [], []), RangeError);
});

test("filtering fully working days preserves continuous non-hour dragging and snapping", () => {
    const start = core.parseCivil("2026-11-06T00:00:00");
    const axis = core.timeAxis("day", start, start + 2 * core.day, undefined, ["2026-11-06", "2026-11-07"]);
    assert.equal(axis.compressed, false);
    assert.deepEqual(axis.segments, [{ start, end: start + 2 * core.day }]);
    assert.equal(core.droppedAxisStart(axis, 23.99 / 48 * axis.width, axis.width), "2026-11-07T00:00:00");
});

test("routing links require a selection and a scheduled step in that exact order/status", () => {
    const a = routingOperation("a", { successors: ["b"] });
    const b = routingOperation("b");
    const unrelated = routingOperation("x", { order: "ORDER-2", confirmed: true });
    const otherStatus = routingOperation("y", { statusId: 2, confirmed: true });
    assert.deepEqual(core.routingLinks([a, b, unrelated, otherStatus], "a"), { enabled: false, edges: [] });
    assert.deepEqual(core.routingLinks([a, { ...b, confirmed: true }], ""), { enabled: false, edges: [] });
    assert.deepEqual(core.routingLinks([a, { ...b, confirmed: true }], "a"), { enabled: true, edges: [{ from: "a", to: "b" }] });
    assert.equal(core.routingLinks([{ ...a, orderScheduled: true }, b], "a").enabled, true);
});

test("routing links use resolved IDs, deduplicate both directions and preserve branches", () => {
    const items = [
        routingOperation("a", { confirmed: true, successors: ["b", "c", "a"] }),
        routingOperation("b", { predecessors: ["a"], successors: ["d"] }),
        routingOperation("c", { predecessors: ["a"], successors: ["d"] }),
        routingOperation("d", { predecessors: ["b", "c"] })
    ];
    assert.deepEqual(core.routingLinks(items, "c").edges, [
        { from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" }, { from: "c", to: "d" }
    ]);
});

test("routing links never cross order/status/routing identities or skip over missing steps", () => {
    const items = [
        routingOperation("a", { confirmed: true, successors: ["outside", "other-order", "other-status", "other-ref", "other-routing"] }),
        routingOperation("b", { predecessors: ["outside"] }),
        routingOperation("other-order", { order: "ORDER-2" }),
        routingOperation("other-status", { statusId: 2 }),
        routingOperation("other-ref", { routingReference: 20000 }),
        routingOperation("other-routing", { routingNo: "SECOND" })
    ];
    assert.deepEqual(core.routingLinks(items, "a").edges, [{ from: "a", to: "outside" }, { from: "outside", to: "b" }]);
});

test("unplanned drops map all timeline scales to quarter hours and reject outside coordinates", () => {
    const start = core.parseCivil("2026-11-03T00:00:00");
    for (const view of ["hour", "day", "week", "month"]) {
        const axis = core.timeAxis(view, start, start + core.day, defaultHourWindows);
        const time = start + (8 * 60 + 22) * core.minute;
        const pixel = core.axisPosition(axis, time) / axis.duration * 1000;
        assert.equal(core.droppedAxisStart(axis, pixel, 1000), "2026-11-03T08:15:00");
        assert.equal(core.droppedAxisStart(axis, -1, 1000), "");
        assert.equal(core.droppedAxisStart(axis, 1000, 1000), "");
        assert.equal(core.droppedAxisStart(axis, 0, 0), "");
        assert.equal(core.droppedAxisStart(axis, NaN, 1000), "");
        assert.equal(core.axisContains(axis, core.parseCivil(core.droppedAxisStart(axis, 999.99, 1000))), true);
    }
});

test("unplanned Hour drops skip nights and stay inside partial weekday windows", () => {
    const start = core.parseCivil("2026-11-02T00:00:00");
    const windows = defaultHourWindows.map(window => ({ ...window }));
    windows[0] = { start: (7 * 60 + 10) * core.minute, end: (12 * 60 + 5) * core.minute };
    windows[1] = { start: 9 * 60 * core.minute, end: 17 * 60 * core.minute };
    const axis = core.timeAxis("hour", start, start + 2 * core.day, windows);
    assert.equal(core.droppedAxisStart(axis, 0, axis.duration), "2026-11-02T07:15:00");
    assert.equal(core.droppedAxisStart(axis, 295 * core.minute - 1, axis.duration), "2026-11-02T12:00:00");
    assert.equal(core.droppedAxisStart(axis, 295 * core.minute, axis.duration), "2026-11-03T09:00:00");
    assert.equal(core.droppedAxisStart(axis, axis.duration - 1, axis.duration), "2026-11-03T16:45:00");
    windows[0].start = (7 * 60 + 5) * core.minute;
    const partial = core.timeAxis("hour", start, start + core.day, windows);
    assert.equal(core.droppedAxisStart(partial, 0, partial.duration), "2026-11-02T07:05:00");
});

test("civil timestamps round-trip including midnight and leap day", () => {
    for (const value of ["2026-11-03T00:00:00", "2028-02-29T23:59:59", "0099-01-01T08:30:00"]) {
        assert.equal(core.formatCivil(core.parseCivil(value)), value);
    }
});

test("invalid dates, unsupported offsets and impossible times are rejected", () => {
    for (const value of ["", "2026-02-29T08:00:00", "2026-11-03T24:00:00", "2026-13-01T08:00:00",
        "2026-11-03T08:00:00Z", "2026-11-03T08:00:00+11:00", "2026-11-03T08:60:00"]) {
        assert.equal(Number.isNaN(core.parseCivil(value)), true, value);
    }
});

test("civil coordinates do not change with browser or process time zone", () => {
    const modulePath = path.resolve(__dirname, "../src/ControlAddIn/schedulerCore.js");
    const source = `const c=require(${JSON.stringify(modulePath)});console.log(c.formatCivil(c.parseCivil('2026-10-04T01:30:00')+c.day));`;
    for (const TZ of ["UTC", "Australia/Sydney", "America/New_York"]) {
        const result = spawnSync(process.execPath, ["-e", source], { env: { ...process.env, TZ }, encoding: "utf8" });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout.trim(), "2026-10-05T01:30:00");
    }
});

test("overlap includes operations starting before the viewport and excludes exact end boundaries", () => {
    assert.equal(core.overlaps(-100, 50, 0, 100), true);
    assert.equal(core.overlaps(-100, 0, 0, 100), false);
    assert.equal(core.overlaps(100, 200, 0, 100), false);
    assert.equal(core.overlaps(10, 10, 0, 100), false);
    assert.equal(core.overlaps(NaN, 50, 0, 100), false);
    assert.deepEqual(core.clip(-100, 50, 0, 100), { left: 0, width: 50 });
    assert.deepEqual(core.clip(50, 200, 0, 100), { left: 50, width: 50 });
});

test("overlapping operations stack and adjacent operations reuse tracks", () => {
    const make = (id, from, to) => ({ id, start: `2026-11-03T${from}:00:00`, end: `2026-11-03T${to}:00:00` });
    const items = [make("A", "08", "10"), make("B", "09", "11"), make("C", "10", "12")];
    const result = core.layout(items, core.parseCivil("2026-11-03T00:00:00"), core.parseCivil("2026-11-04T00:00:00"));
    assert.deepEqual(result.map(item => item.track), [0, 1, 0]);
    assert.deepEqual(items.map(item => item.id), ["A", "B", "C"]);
});

test("zero availability with load is overload with no utilisation percentage", () => {
    assert.deepEqual(core.capacity(0, 60), { remaining: -60, percent: null, overloaded: true });
    assert.deepEqual(core.capacity(0, 0), { remaining: 0, percent: null, overloaded: false });
    assert.deepEqual(core.capacity(480, 600), { remaining: -120, percent: 125, overloaded: true });
});

test("resource-hours examples preserve supplied effective availability", () => {
    assert.equal(core.capacity(1440, 720).percent, 50);
    assert.equal(core.capacity(768, 384).percent, 50);
    assert.throws(() => core.capacity(NaN, 10), TypeError);
});

test("drag snaps the delta to 15 minutes without changing seconds or original start alignment", () => {
    const start = core.parseCivil("2026-11-03T08:07:30");
    assert.equal(core.draggedStart(start, 15, 1440, core.day), "2026-11-03T08:22:30");
    assert.equal(core.draggedStart(start, -30, 1440, core.day), "2026-11-03T07:37:30");
    assert.equal(core.draggedStart(start, 10, 0, core.day), "");
});

test("date entry supports minute and second precision but rejects blank or invalid values", () => {
    assert.equal(core.inputToCivil("2026-11-03T08:30"), "2026-11-03T08:30:00");
    assert.equal(core.inputToCivil("2026-11-03T08:30:12"), "2026-11-03T08:30:12");
    assert.equal(core.inputToCivil(""), "");
    assert.equal(core.inputToCivil("2026-11-31T08:30"), "");
});

test("custom AL object and field names follow the agreed convention", () => {
    const sourceRoot = path.resolve(__dirname, "../src");
    const walk = directory => fs.readdirSync(directory, { withFileTypes: true })
        .flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
    for (const file of walk(sourceRoot).filter(file => file.endsWith(".al"))) {
        const source = fs.readFileSync(file, "utf8");
        const object = /^\s*(?:table|page|codeunit|enum|permissionset|pageextension)\s+\d+\s+([A-Za-z0-9_]+)/m.exec(source)
            || /^\s*controladdin\s+([A-Za-z0-9_]+)/m.exec(source);
        assert.ok(object, file);
        assert.match(object[1], /^CF_[A-Z][A-Za-z0-9]*$/, file);
        for (const match of source.matchAll(/field\(\d+;\s*([^;]+);/g)) {
            assert.match(match[1], /^[A-Z][A-Za-z0-9]*$/, file);
        }
    }
});

test("control assets exist and the independent manifest has no scheduler dependency", () => {
    const base = path.resolve(__dirname, "..");
    const source = fs.readFileSync(path.join(base, "src/ControlAddIn/CFProductionSchedulerAddIn.ControlAddIn.al"), "utf8");
    for (const [, asset] of source.matchAll(/'(src\/[^']+)'/g)) {
        assert.equal(fs.existsSync(path.join(base, asset)), true, asset);
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(base, "app.json"), "utf8")).dependencies, []);
});

test("all four view modes have distinct scales and preserve the date range", () => {
    const start = core.parseCivil("2026-11-03T00:00:00");
    const end = start + 14 * core.day;
    const widths = [];
    for (const view of ["hour", "day", "week", "month"]) {
        const axis = core.timeAxis(view, start, end, fullDayWindows);
        widths.push(axis.dayWidth);
        assert.equal(axis.ticks.length, view === "hour" ? 14 * 24 : 14);
        assert.equal(axis.ticks.reduce((total, tick) => total + tick.width, 0), 14 * axis.dayWidth);
        assert.deepEqual(axis.levels.map(level => level.unit), view === "hour" ? ["week", "day", "hour"] : ["month", "week", "day"]);
        for (const level of axis.levels) {
            assert.equal(level.cells.reduce((total, cell) => total + cell.width, 0), 14 * axis.dayWidth);
        }
    }
    assert.deepEqual(widths, [1152, 160, 65, 28]);
    assert.throws(() => core.timeAxis("invalid", start, end), RangeError);
});

test("week headers use Monday boundaries and clip partial weeks", () => {
    const axis = core.timeAxis("week", core.parseCivil("2026-11-03T00:00:00"), core.parseCivil("2026-11-12T00:00:00"));
    assert.deepEqual(axis.levels[1].cells.map(group => core.formatCivil(group.anchor)), ["2026-11-02T00:00:00", "2026-11-09T00:00:00"]);
    assert.deepEqual(axis.levels[1].cells.map(group => group.width), [6 * 65, 3 * 65]);
});

test("month headers follow calendar month lengths including leap years and year boundaries", () => {
    const axis = core.timeAxis("month", core.parseCivil("2028-01-30T00:00:00"), core.parseCivil("2028-03-02T00:00:00"));
    assert.deepEqual(axis.levels[0].cells.map(group => group.width), [2 * 28, 29 * 28, 28]);
    const year = core.timeAxis("month", core.parseCivil("2026-12-31T00:00:00"), core.parseCivil("2027-01-02T00:00:00"));
    assert.deepEqual(year.levels[0].cells.map(group => core.formatCivil(group.anchor)), ["2026-12-01T00:00:00", "2027-01-01T00:00:00"]);
});

test("hour view creates hour ticks grouped by civil day across daylight saving dates", () => {
    const axis = core.timeAxis("hour", core.parseCivil("2026-10-04T00:00:00"), core.parseCivil("2026-10-06T00:00:00"), fullDayWindows);
    assert.equal(axis.ticks.length, 48);
    assert.deepEqual(axis.levels[1].cells.map(group => group.width), [1152, 1152]);
    assert.equal(axis.tickWidth, 48);
});

test("weeks crossing a month boundary are split beneath their parent month", () => {
    const axis = core.timeAxis("month", core.parseCivil("2026-10-30T00:00:00"), core.parseCivil("2026-11-04T00:00:00"));
    const weeks = axis.levels[1].cells;
    assert.deepEqual(weeks.map(cell => core.formatCivil(cell.start)), [
        "2026-10-30T00:00:00", "2026-11-01T00:00:00", "2026-11-02T00:00:00"
    ]);
    assert.deepEqual(weeks.map(cell => core.formatCivil(cell.anchor)), [
        "2026-10-26T00:00:00", "2026-10-26T00:00:00", "2026-11-02T00:00:00"
    ]);
    assert.deepEqual(weeks.map(cell => cell.width), [56, 28, 56]);
});

test("every header level is contiguous, aligned and contained by its parent across year rollover", () => {
    const start = core.parseCivil("2026-12-20T00:00:00");
    const end = core.parseCivil("2027-02-20T00:00:00");
    for (const view of ["hour", "day", "week", "month"]) {
        const axis = core.timeAxis(view, start, end, fullDayWindows);
        let parents = [{ start, end }];
        for (const level of axis.levels) {
            let cursor = start;
            for (const cell of level.cells) {
                const cellEnd = cell.start + cell.width / axis.dayWidth * core.day;
                assert.equal(cell.start, cursor);
                assert.ok(cell.width > 0);
                assert.ok(parents.some(parent => cell.start >= parent.start && cellEnd <= parent.end));
                cursor = cellEnd;
            }
            assert.equal(cursor, end);
            parents = level.cells;
        }
    }
});

test("range navigation fits its window within the display range", () => {
    assert.deepEqual(core.rangeWindow("2026-11-03T00:00:00", 90, 14, 76), {
        start: "2027-01-18T00:00:00", end: "2027-02-01T00:00:00",
        rangeEnd: "2027-02-01T00:00:00", lastOffset: 76
    });
    assert.equal(core.rangeWindow("2028-02-28T00:00:00", 3, 1, 1).start, "2028-02-29T00:00:00");
    assert.equal(core.rangeWindow("2026-11-03T00:00:00", 1, 1, 0).lastOffset, 0);
    for (const [days, view, offset] of [[0, 1, 0], [367, 1, 0], [10, 11, 0], [366, 367, 0], [90, 14, 77], [90, 14, -1], [90, 14, 0.5]]) {
        assert.throws(() => core.rangeWindow("2026-11-03T00:00:00", days, view, offset), RangeError);
    }
    assert.throws(() => core.rangeWindow("2026-11-03T01:00:00", 90, 14, 0), RangeError);
    assert.throws(() => core.rangeWindow("9999-12-31T00:00:00", 2, 1, 0), RangeError);
});

test("six-month and leap-year windows display every day without a 62-day truncation", () => {
    for (const [start, end, days] of [
        ["2028-01-01T00:00:00", "2028-07-01T00:00:00", 182],
        ["2028-01-01T00:00:00", "2029-01-01T00:00:00", 366],
        ["2029-01-01T00:00:00", "2030-01-01T00:00:00", 365]
    ]) {
        const bounds = core.rangeWindow(start, days, days, 0);
        assert.deepEqual(bounds, { start, end, rangeEnd: end, lastOffset: 0 });
        for (const view of ["hour", "day", "week", "month"]) {
            const axis = core.timeAxis(view, core.parseCivil(start), core.parseCivil(end), defaultHourWindows);
            assert.equal(axis.days.length, days);
            assert.equal(axis.ticks.length, days * (view === "hour" ? 11 : 1));
            for (const level of axis.levels) {
                assert.equal(level.cells[0].left, 0);
                const last = level.cells.at(-1);
                assert.ok(Math.abs(last.left + last.width - axis.width) < 0.000001);
            }
        }
    }
});

test("fitted long-range coordinates retain calendar dates for bars and drops", () => {
    const start = core.parseCivil("2028-01-01T00:00:00");
    const axis = core.timeAxis("month", start, core.parseCivil("2029-01-01T00:00:00"));
    const when = core.parseCivil("2028-07-01T12:00:00");
    const actualWidth = 1000;
    const position = core.axisPosition(axis, when) / axis.duration * actualWidth;
    assert.equal(core.droppedAxisStart(axis, position, actualWidth), "2028-07-01T12:00:00");
    const clipped = core.axisClip(axis, when, when + core.day);
    assert.ok(Math.abs(clipped.left - position / actualWidth * 100) < 0.000001);
    assert.ok(Math.abs(clipped.width - 100 / 366) < 0.000001);
});

test("annual working-day compression retains leap day and the last working date", () => {
    const start = core.parseCivil("2028-01-01T00:00:00");
    const end = core.parseCivil("2029-01-01T00:00:00");
    const dates = Array.from({ length: 366 }, (_, index) => start + index * core.day)
        .filter(time => ![0, 6].includes(new Date(time).getUTCDay()))
        .map(time => core.formatCivil(time).slice(0, 10));
    const axis = core.timeAxis("month", start, end, undefined, dates);
    assert.equal(axis.days.length, dates.length);
    assert.ok(axis.days.some(cell => core.formatCivil(cell.start).startsWith("2028-02-29")));
    assert.equal(core.formatCivil(axis.days.at(-1).start).slice(0, 10), dates.at(-1));
    assert.equal(axis.duration, dates.length * core.day);
});

test("document focus shows routing dependencies without manufacturing confirmations", () => {
    const items = [routingOperation("a", { successors: ["b"] }), routingOperation("b", { predecessors: ["a"] })];
    const before = structuredClone(items);
    assert.deepEqual(core.routingLinks(items, "a", true), { enabled: true, edges: [{ from: "a", to: "b" }] });
    assert.deepEqual(core.routingLinks(items, "a"), { enabled: false, edges: [] });
    assert.deepEqual(core.routingLinks(items, "", true), { enabled: false, edges: [] });
    assert.deepEqual(items, before);
});

test("Hour view displays 07:00-18:00 on every weekday, including weekends", () => {
        const start = core.parseCivil("2026-11-02T00:00:00");
        const axis = core.timeAxis("hour", start, start + 7 * core.day, defaultHourWindows);
        assert.equal(axis.ticks.length, 7 * 11);
        assert.equal(axis.width, 7 * 11 * 48);
        assert.equal(axis.duration, 7 * 11 * 60 * core.minute);
        for (const [index, segment] of axis.segments.entries()) {
            assert.equal(segment.start, start + index * core.day + 7 * 60 * core.minute);
            assert.equal(segment.end, start + index * core.day + 18 * 60 * core.minute);
            assert.equal(axis.days[index].width, 11 * 48);
        }
    });

    test("weekday-specific windows, partial hours and header widths stay aligned", () => {
        const start = core.parseCivil("2026-11-02T00:00:00");
        const windows = defaultHourWindows.map((window, index) => ({
            start: window.start + index * 30 * core.minute, end: window.end - index * 30 * core.minute
        }));
        const axis = core.timeAxis("hour", start, start + 7 * core.day, windows);
        for (const [index, segment] of axis.segments.entries()) {
            assert.equal(segment.start, start + index * core.day + windows[index].start);
            assert.equal(segment.end, start + index * core.day + windows[index].end);
            assert.equal(axis.days[index].width, (11 - index) * 48);
        }
        for (const level of axis.levels) {
            let right = 0;
            for (const cell of level.cells) {
                assert.equal(cell.left, right);
                right += cell.width;
            }
            assert.equal(right, axis.width);
        }
        const tuesday = axis.ticks.filter(tick => core.formatCivil(tick.start).startsWith("2026-11-03"));
        assert.equal(core.formatCivil(tuesday[0].start), "2026-11-03T07:30:00");
        assert.equal(tuesday[0].width, 24);
        assert.equal(tuesday.at(-1).width, 24);
    });

    test("compressed projection hides off-hours and clips crossing operations without changing their dates", () => {
        const start = core.parseCivil("2026-11-03T00:00:00");
        const axis = core.timeAxis("hour", start, start + 2 * core.day, defaultHourWindows);
        const parse = core.parseCivil;
        assert.equal(core.axisClip(axis, parse("2026-11-03T19:00:00"), parse("2026-11-04T06:00:00")), null);
        const crossing = core.axisClip(axis, parse("2026-11-03T17:00:00"), parse("2026-11-04T08:00:00"));
        assert.equal(crossing.left, 10 / 22 * 100);
        assert.equal(crossing.width, 2 / 22 * 100);
        const items = [
            { id: "hidden", start: "2026-11-03T19:00:00", end: "2026-11-04T06:00:00" },
            { id: "visible", start: "2026-11-03T06:00:00", end: "2026-11-03T08:00:00" }
        ];
        const before = JSON.stringify(items);
        assert.deepEqual(core.layout(items, start, start + 2 * core.day, axis).map(entry => entry.item.id), ["visible"]);
        assert.equal(JSON.stringify(items), before);
        assert.equal(core.axisContains(axis, parse(items[1].start)), false);
        assert.equal(core.axisContains(axis, parse("2026-11-03T18:00:00")), false);
    });

    test("hourly dragging crosses hidden nights, preserves seconds and rejects clipped starts/out-of-range drops", () => {
        const start = core.parseCivil("2026-11-03T00:00:00");
        const axis = core.timeAxis("hour", start, start + 3 * core.day, defaultHourWindows);
        const drag = (time, hours) => core.draggedAxisStart(axis, core.parseCivil(time), hours * 48, axis.width);
        assert.equal(drag("2026-11-03T17:00:00", 1), "2026-11-04T07:00:00");
        assert.equal(drag("2026-11-04T07:00:00", -1), "2026-11-03T17:00:00");
        assert.equal(drag("2026-11-03T17:52:30", 0.25), "2026-11-04T07:07:30");
        assert.equal(drag("2026-11-03T08:07:30", 0), "2026-11-03T08:07:30");
        assert.equal(drag("2026-11-03T06:00:00", 1), "");
        assert.equal(drag("2026-11-02T17:00:00", 1), "");
        assert.equal(drag("2026-11-03T07:00:00", -1), "");
        assert.equal(drag("2026-11-05T17:00:00", 1), "");
    });

    test("Hour view validates all seven windows and uses civil time across daylight saving", () => {
        const start = core.parseCivil("2026-10-04T00:00:00");
        for (const windows of [undefined, [], defaultHourWindows.slice(1),
            defaultHourWindows.map((w, i) => i === 6 ? { start: 18 * 3600000, end: 7 * 3600000 } : w),
            defaultHourWindows.map((w, i) => i === 0 ? { start: -1, end: 1 } : w),
            defaultHourWindows.map((w, i) => i === 0 ? { start: 0, end: core.day + 1 } : w)]) {
            assert.throws(() => core.timeAxis("hour", start, start + core.day, windows), RangeError);
        }
        const axis = core.timeAxis("hour", start, start + 2 * core.day, defaultHourWindows);
        assert.equal(axis.ticks.length, 22);
        assert.equal(core.formatCivil(axis.segments[0].start), "2026-10-04T07:00:00");
        for (const view of ["day", "week", "month"]) {
            assert.deepEqual(core.timeAxis(view, start, start + 2 * core.day, defaultHourWindows),
                core.timeAxis(view, start, start + 2 * core.day));
        }
    });
