"use strict";
(function () {
    const labels = {
        operationDetails: "Prod. Order Routing Line", operationNo: "Operation No.", description: "Description",
        problem: "Scheduling problem",
        problemScope: "%1 problem steps are hidden. Capacity totals and Auto Schedule are unchanged. Enable Include Problem Steps in Schedule Options to show them.",
        startingDateTime: "Starting Date-Time", endingDateTime: "Ending Date-Time", status: "Status",
        orderNo: "Prod. Order No.", previousOperation: "Previous Operation No.", nextOperation: "Next Operation No.",
        productionLine: "Prod. Order Line", lineNo: "Line No.", itemNo: "Item No.", quantity: "Quantity",
        unit: "Unit of Measure Code", resource: "Resource", confirmation: "Planner confirmation",
        routingScope: "Routing links for order %1: %2 visible; %3 hidden by the view, filters or collapsed rows.",
        routingUnscheduled: "Schedule or confirm a step to show routing links.",
        dropHelp: "Drag an unscheduled step onto its assigned resource row. Drag a timeline step horizontally to adjust its draft start. Select a step to show routing links.",
        dropInvalid: "Drop an editable unplanned step onto its assigned resource within the displayed dates and hours.",
        nonWorkingScope: "%1 non-working days hidden. %2 matching operations fall entirely on hidden days. %3 hidden days contain allocated capacity. Use Show All Days.",
        noWorkingDays: "No working days in this date range. Use Show All Days or change Schedule Options; check resource calendars.",
        hiddenClippedStart: "The actual start is outside visible periods. Use Schedule start in the details.",
        hiddenDragRange: "Drop within visible dates and hours, or enter the start manually.",
        title: "Production Scheduler", currentTime: "Current time", unconfirmed: "Unscheduled / awaiting planner confirmation",
        empty: "No operations in this view.", schedule: "Schedule start", confirm: "Confirm existing dates",
        order: "Open production order", routing: "Schedule Details", start: "Start", end: "Finish", due: "Due",
        draftDetails: "Schedule Details", editDraft: "Edit Draft Start", zoomDocument: "Zoom to Document",
        resetDraft: "Reset Order Draft from BC", commitOrder: "Commit This Order to BC", draftScenario: "Draft scenario",
        hour: "Hour", day: "Day", week: "Week", month: "Month", busy: "Working...", failed: "Request failed; refresh before retrying.",
        hourScope: "Hour view hides off-hours. Daily capacity is unchanged. %1 matching operations are outside these hours; use Day view.",
        hourDragRange: "Drop within displayed hours, or enter the start manually.",
        hourClippedStart: "The actual start is outside displayed hours. Use Schedule start instead of dragging this clipped bar.",
        capacity: "Daily hours: allocated / available", missingCalendar: "No calculated calendar entries.",
        blocked: "Blocked resource", direct: "Direct load only, not additional capacity.",
        legend: "Top: unscheduled steps. Timeline: scheduled or finished steps. Red border: scheduling problem. Red capacity: overloaded. Grey: non-working.",
        minutes: "minutes", available: "Available", allocated: "Allocated", remaining: "Remaining",
        select: "Select an operation.", late: "Late", pending: "Awaiting confirmation", confirmed: "Confirmed", finished: "Finished",
        invalidDate: "Enter a valid start date and time.", search: "Find order, item or operation"
    };
    const days = [
        { date: "2026-11-03", available: 480, allocated: 600 },
        { date: "2026-11-04", available: 480, allocated: 120 },
        { date: "2026-11-05", available: 0, allocated: 0 }
    ];
    const windows = [
        { start: "2026-11-03T08:00:00", end: "2026-11-03T16:00:00" },
        { start: "2026-11-04T08:00:00", end: "2026-11-04T16:00:00" }
    ];
    const resources = [
        { id: "W:100", parent: "", name: "100 - Assembly department", summary: true, direct: false, windows, days },
        { id: "D:100", parent: "W:100", name: "100 - Direct work centre operations", direct: true, windows,
            days: days.map(day => ({ ...day, available: 0, allocated: day.date === "2026-11-03" ? 120 : 0 })) },
        { id: "M:100", parent: "W:100", name: "100 - CNC machine", direct: false, windows, days }
    ];
    const operation = (id, order, from, to, resource, confirmed, statusId) => ({
        id, order, operation: "10", resource, confirmed, statusId, version: "1", finished: false, problems: [],
        draftChanged: false, canReset: true, canCommit: false,
        description: "Assembly <script>not executable</script>", item: "ITEM-100", quantity: 10,
        previousOperation: "", nextOperation: "20",
        routingReference: 10000, routingNo: "ROUTE-100", predecessors: [], successors: [], orderScheduled: confirmed,
        lines: [{ lineNo: 10000, item: "ITEM-100", description: "Finished assembly", quantity: 10, unit: "PCS" }],
        status: statusId === 3 ? "Released" : "Firm Planned", start: from, end: to,
        due: "2026-11-04", issue: "", editable: true, canConfirm: true, late: !confirmed,
        effort: "Setup: 20 MINUTES; run: 15 MINUTES; lot size: 1; concurrent capacity: 1."
    });
    const payload = {
        scenario: "BASE", scenarioName: "Shared planning scenario",
        viewMode: "day",
        currentTime: "2026-11-03T10:15:00",
        hideNonWorkingDays: false,
        includeProblemSteps: true,
        documentFocus: false, fitToWindow: false, viewChange: "", selectedOperationId: "", focusNotice: "",
        hourWindows: Array.from({ length: 7 }, () => ({ start: 7 * 3600000, end: 18 * 3600000 })),
        navigation: { start: "2026-11-03T00:00:00", days: 90, viewDays: 3, offset: 0, caption: "Display range" },
        start: "2026-11-03T00:00:00", end: "2026-11-06T00:00:00", today: "2026-11-03",
        scope: "UI TEST DATA ONLY. Capacity includes hidden and unconfirmed orders.",
        timeZone: "Times are Business Central session wall times.", labels, resources, warnings: [],
        operations: [
            operation("op-a", "101001", "2026-11-03T08:00:00", "2026-11-03T12:00:00", "M:100", true, 3),
            operation("op-b", "101002", "2026-11-03T09:00:00", "2026-11-03T14:00:00", "M:100", true, 2),
            operation("op-c", "101003", "2026-11-02T15:00:00", "2026-11-03T10:00:00", "D:100", true, 3),
            {...operation("op-p", "101001", "2026-11-03T08:00:00", "2026-11-03T10:00:00", "M:100", false, 3),
                operation: "40", nextOperation: ""}
        ]
    };
    window.fixture = { payload, calls: [], failNext: false, bcOperations: structuredClone(payload.operations) };
    window.fixture.assertPlacementAndDrag = async function () {
        const original = structuredClone(window.fixture.payload);
        const p = structuredClone(original);
        const baseline = JSON.stringify(window.fixture.bcOperations);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const bar = id => document.querySelector(`.cf-operation[data-operation="${id}"]`);
        const pending = id => document.querySelector(`.cf-pending-item[data-operation="${id}"]`);
        const requests = () => window.fixture.calls.filter(call => call.name === "OperationStartChangeRequested");
        const settle = async () => {
            for (let attempt = 0; document.getElementById("controlAddIn").getAttribute("aria-busy") === "true"; attempt++) {
                if (attempt === 100) throw new Error("Drag bridge did not settle");
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        };
        const disjoint = () => {
            const ids = new Set([...document.querySelectorAll(".cf-pending-item")].map(node => node.dataset.operation));
            assert([...document.querySelectorAll(".cf-operation")].every(node => !ids.has(node.dataset.operation)),
                "A routing step appears in both sections");
        };
        const pointer = (node, type, x, id = 21) => node.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: id, pointerType: "mouse", isPrimary: true,
            button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x
        }));
        function preparePointer(node) {
            // Synthetic events cannot acquire native pointer capture. Only capture is stubbed.
            let captured;
            Object.defineProperties(node, {
                setPointerCapture: {configurable: true, value: id => { captured = id; }},
                hasPointerCapture: {configurable: true, value: id => captured === id},
                releasePointerCapture: {configurable: true, value: () => { captured = undefined; }}
            });
        }
        try {
            window.fixture.payload = p;
            const unchanged = JSON.stringify(p.operations);
            for (const view of ["hour", "day", "week", "month"]) {
                for (const focus of [false, true]) {
                    p.viewMode = view;
                    p.documentFocus = focus;
                    LoadSchedule(p);
                    assert(pending("op-p") && !bar("op-p"), "Existing dates must not place an unscheduled step");
                    assert(bar("op-a") && !pending("op-a"), "Scheduled step must appear only on the timeline");
                    disjoint();
                }
            }
            assert(JSON.stringify(p.operations) === unchanged, "Display placement modified the stored schedule");
            p.viewMode = "hour";
            p.documentFocus = false;
            LoadSchedule(p);
            let lane = document.querySelector('[data-resource="M:100"] .cf-lane');
            let rect = lane.getBoundingClientRect();
            const core = CFSchedulerCore;
            const axis = core.timeAxis("hour", core.parseCivil(p.start), core.parseCivil(p.end), p.hourWindows);
            const x = rect.left + core.axisPosition(axis, core.parseCivil("2026-11-03T09:30:00")) / axis.duration * rect.width;
            const transfer = new DataTransfer();
            pending("op-p").dispatchEvent(new DragEvent("dragstart", {dataTransfer: transfer, bubbles: true, cancelable: true}));
            lane.dispatchEvent(new DragEvent("drop", {dataTransfer: transfer, clientX: x, bubbles: true, cancelable: true}));
            assert(pending("op-p") && !bar("op-p"), "The step moved before AL accepted the drop");
            await settle();
            assert(!pending("op-p") && bar("op-p"), "Successful drop did not transfer the step to the timeline");
            disjoint();
            lane = document.querySelector('[data-resource="M:100"] .cf-lane');
            rect = lane.getBoundingClientRect();
            const delta = rect.width * 60 * core.minute / axis.duration;
            let node = bar("op-a");
            const origin = node.getBoundingClientRect().left + 5;
            const start = p.operations[0].start;
            const version = p.operations[0].version;
            const others = JSON.stringify(p.operations.slice(1).map(item => [item.id, item.start, item.end]));
            const count = requests().length;
            preparePointer(node);
            pointer(node, "pointerdown", origin);
            pointer(node, "pointermove", origin + delta, 99);
            assert(!node.classList.contains("cf-dragging"), "Another pointer moved the selected step");
            pointer(node, "pointermove", origin + delta);
            assert(node.classList.contains("cf-dragging"), "Individual timeline step did not enter drag mode");
            pointer(node, "pointerup", origin + delta);
            assert(p.operations[0].start === start, "Timeline drag optimistically changed the stored start");
            await settle();
            const expected = core.draggedAxisStart(axis, core.parseCivil(start), delta, rect.width);
            assert(requests().length === count + 1 &&
                JSON.stringify(requests().at(-1).args) === JSON.stringify(["op-a", version, expected]),
                "Timeline drag did not send exactly one versioned start change");
            assert(p.operations[0].start === expected && !pending("op-a") &&
                JSON.stringify(p.operations.slice(1).map(item => [item.id, item.start, item.end])) === others,
                "Client dragged a group instead of the selected step");
            disjoint();
            for (const cancellation of ["Escape", "pointercancel", "lostpointercapture"]) {
                node = bar("op-a");
                preparePointer(node);
                const before = requests().length;
                pointer(node, "pointerdown", origin);
                pointer(node, "pointermove", origin + delta);
                if (cancellation === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
                else pointer(node, cancellation, origin + delta);
                pointer(node, "pointerup", origin + delta);
                assert(!node.classList.contains("cf-dragging") && node.style.transform === "" &&
                    requests().length === before, `${cancellation} did not cancel the timeline drag cleanly`);
            }
            p.operations[0].editable = false;
            LoadSchedule(p);
            node = bar("op-a");
            preparePointer(node);
            const before = requests().length;
            pointer(node, "pointerdown", origin);
            pointer(node, "pointermove", origin + delta);
            pointer(node, "pointerup", origin + delta);
            assert(requests().length === before, "Read-only timeline step was moved");
            assert(JSON.stringify(window.fixture.bcOperations) === baseline, "UI scheduling mutated the fixture BC baseline");
            return {exclusivePlacement: true, views: 4, documentFocus: true, pendingDrop: true,
                timelineDrag: true, cancellations: 3, viewport: [innerWidth, innerHeight]};
        } finally {
            window.fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertContextMenu = async function () {
        const original = structuredClone(window.fixture.payload);
        const baseline = JSON.stringify(window.fixture.bcOperations);
        const p = structuredClone(original);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const settle = async () => {
            for (let attempt = 0; document.getElementById("controlAddIn").getAttribute("aria-busy") === "true"; attempt++) {
                if (attempt === 100) throw new Error("Context menu bridge did not settle");
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        };
        const commands = ["details", "edit", "zoom", "reset", "commit", "order"];
        const bar = () => document.querySelector('.cf-operation[data-operation="op-a"]');
        const open = async (owner, key) => {
            owner.dispatchEvent(key
                ? new KeyboardEvent("keydown", {key, shiftKey: key === "F10", bubbles: true, cancelable: true})
                : new MouseEvent("contextmenu", {clientX: innerWidth - 2, clientY: innerHeight - 2, bubbles: true, cancelable: true}));
            await settle();
            const menu = document.querySelector(".cf-context-menu");
            assert(menu, "Context menu was not opened");
            return menu;
        };
        try {
            p.operations[0].canCommit = true;
            p.operations[0].draftChanged = true;
            window.fixture.payload = p;
            LoadSchedule(p);
            await settle();
            let menu = await open(bar());
            assert(JSON.stringify([...menu.querySelectorAll("button")].map(node => node.dataset.command)) === JSON.stringify(commands),
                "The menu must contain exactly the six approved actions");
            const rect = menu.getBoundingClientRect();
            assert(rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
                "Context menu escaped the viewport");
            assert(bar().classList.contains("cf-selected"), "Right click must highlight the selected step");
            menu.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
            assert(!document.querySelector(".cf-context-menu") && document.activeElement === bar(), "Escape must restore focus");
            for (const command of commands) {
                menu = await open(bar());
                const control = menu.querySelector(`[data-command="${command}"]`);
                assert(!control.disabled, `Allowed action ${command} is disabled`);
                control.click();
                await settle();
                const call = window.fixture.calls.filter(entry => entry.name === "OperationContextRequested").at(-1);
                assert(JSON.stringify(call.args) === JSON.stringify(["op-a", p.operations[0].version, command]),
                    `Wrong versioned AL request for ${command}`);
                assert(!document.querySelector(".cf-context-menu"), "Menu must close after an action");
            }
            const pending = document.querySelector('.cf-pending-item[data-operation="op-p"]');
            menu = await open(pending, "F10");
            menu.dispatchEvent(new KeyboardEvent("keydown", {key: "End", bubbles: true, cancelable: true}));
            assert(document.activeElement.dataset.command === "order", "End must focus the last menu action");
            menu.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true, cancelable: true}));
            assert(document.activeElement.dataset.command === "details", "ArrowDown must wrap");
            menu.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
            assert(document.activeElement === pending, "Keyboard dismissal must restore the pending step focus");
            menu = await open(bar(), "ContextMenu");
            menu.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", bubbles: true}));
            assert(!document.querySelector(".cf-context-menu"), "Tab must dismiss the menu");
            await open(bar());
            document.querySelector(".cf-heading").dispatchEvent(new PointerEvent("pointerdown", {bubbles: true}));
            assert(!document.querySelector(".cf-context-menu"), "Outside click must dismiss the menu");
            p.operations[0].editable = false;
            p.operations[0].canReset = false;
            p.operations[0].canCommit = false;
            LoadSchedule(p);
            menu = await open(bar());
            for (const command of ["edit", "reset", "commit"]) {
                assert(menu.querySelector(`[data-command="${command}"]`).disabled, `${command} ignores permissions`);
            }
            for (const command of ["details", "zoom", "order"]) {
                assert(!menu.querySelector(`[data-command="${command}"]`).disabled, `${command} must remain available`);
            }
            window.dispatchEvent(new Event("resize"));
            assert(!document.querySelector(".cf-context-menu"), "Resize must dismiss the menu");
            await open(bar());
            ShowError("Stale draft");
            assert(!document.querySelector(".cf-context-menu"), "Errors must dismiss the menu");
            bar().dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true}));
            assert(!document.querySelector(".cf-context-menu"), "Stale payload must not offer actions");
            const other = {...p, scenario: "OTHER", scenarioName: "<script>Independent scenario</script>"};
            window.fixture.payload = other;
            LoadSchedule(other);
            assert(!document.querySelector(".cf-details h3"), "Scenario switching must clear the old selection");
            assert(document.querySelector(".cf-scenario").textContent.includes(other.scenarioName), "Scenario name must render safely as text");
            assert(!document.querySelector(".cf-scenario script"), "Scenario name was rendered as HTML");
            assert(JSON.stringify(window.fixture.bcOperations) === baseline, "Context dispatch must not mutate the fixture BC baseline");
            return {actions: commands.length, keyboard: true, permissions: true, viewport: [innerWidth, innerHeight], bcUnchanged: true};
        } finally {
            window.fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertProblemSteps = async function () {
        const original = structuredClone(window.fixture.payload);
        const p = structuredClone(original);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const bar = id => document.querySelector(`.cf-operation[data-operation="${id}"]`);
        const settle = async () => {
            for (let attempt = 0; document.getElementById("controlAddIn").getAttribute("aria-busy") === "true"; attempt++) {
                if (attempt === 100) throw new Error("Fixture bridge did not settle");
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        };
        const problems = ["No working capacity: Machine Center 100 on 2026-11-03.", "No calculated capacity needs. Refresh the production order."];
        p.operations[0].problems = problems;
        p.operations[3].problems = problems;
        p.operations[0].canConfirm = false;
        p.operations[1].problems = ["Overloaded capacity: Work Center 100, allocated 10 h / available 8 h."];
        p.operations[0].successors = ["op-b"];
        p.operations[1].predecessors = ["op-a"];
        p.operations[1].successors = ["op-c"];
        p.operations[2].predecessors = ["op-b"];
        for (const item of p.operations) {
            item.order = "101001";
            item.statusId = 3;
            item.orderScheduled = true;
        }
        const unchanged = JSON.stringify([p.resources, p.operations]);
        const mutations = () => window.fixture.calls.filter(call =>
            call.name === "OperationStartChangeRequested" || call.name === "OperationConfirmRequested").length;
        const before = mutations();
        try {
            window.fixture.payload = p;
            for (const view of ["hour", "day", "week", "month"]) {
                p.viewMode = view;
                p.includeProblemSteps = true;
                LoadSchedule(p);
                assert(document.querySelectorAll(".cf-operation.cf-problem").length === 2, "Both problem steps need a red border");
                assert(!bar("op-c").classList.contains("cf-problem"), "Healthy step was marked as a problem");
                for (const node of [bar("op-a"), bar("op-b"), document.querySelector('.cf-pending-item[data-operation="op-p"]')]) {
                    const style = getComputedStyle(node);
                    assert(style.borderTopColor === (node.matches(":hover") ? "rgb(164, 38, 44)" : "rgb(197, 15, 31)") &&
                        Math.abs(parseFloat(style.borderTopWidth) - 2) < 1, "Problem border is not red");
                    assert(["rgb(255, 255, 255)", "rgb(243, 246, 247)"].includes(style.backgroundColor), "Problem steps should have a neutral fill, not a red fill");
                }
                bar("op-a").dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
                const tip = document.querySelector("[role=tooltip]");
                assert(!tip.hidden && problems.every(problem => tip.textContent.includes(problem)), "Hover must explain all reported problems");
                bar("op-a").click();
                await settle();
                assert(getComputedStyle(bar("op-a")).outlineColor === "rgb(229, 160, 0)" &&
                    ["rgb(197, 15, 31)", "rgb(164, 38, 44)"].includes(getComputedStyle(bar("op-a")).borderTopColor), "Selection must retain the red problem border");
                assert(document.querySelectorAll(".cf-details .cf-problems li").length === 2, "Selected details omit problem reasons");
                const capacity = [...document.querySelectorAll(".cf-capacity-day")].map(node => node.title);
                p.includeProblemSteps = false;
                LoadSchedule(p);
                assert(!bar("op-a") && !bar("op-b") && bar("op-c"), "Excluded problems remain on the timeline");
                assert(!document.querySelector(".cf-pending-item"), "Excluded problem remains in the unplanned list");
                assert(!document.querySelector(".cf-details h3"), "Hidden selected problem still shows details/actions");
                assert(document.querySelector(".cf-problem-scope").textContent.startsWith("3"), "Hidden problem count is missing");
                assert(JSON.stringify([...document.querySelectorAll(".cf-capacity-day")].map(node => node.title)) === JSON.stringify(capacity), "Hiding steps changed capacity totals");
                bar("op-c").click();
                await settle();
                assert(!document.querySelector(".cf-routing-link") &&
                    document.querySelector(".cf-routing-scope").textContent.includes("2 hidden"), "Hiding steps invented bypass arrows or lost hidden-link counts");
                p.includeProblemSteps = true;
                LoadSchedule(p);
                assert(document.querySelectorAll(".cf-operation").length === 3 &&
                    document.querySelectorAll(".cf-routing-link").length === 2, "Including problems did not restore steps and dependencies");
                window.fixture.assertLayout();
            }
            assert(JSON.stringify([p.resources, p.operations]) === unchanged, "Display filtering changed scheduling data");
            assert(mutations() === before, "Display filtering sent a scheduling mutation");
            for (const item of p.operations) { item.problems = []; item.late = false; }
            LoadSchedule(p);
            assert(!document.querySelector(".cf-problem"), "Resolved problems retained their red styling after authoritative refresh");
            for (const item of p.operations) item.problems = ["Blocked resource"];
            p.includeProblemSteps = false;
            LoadSchedule(p);
            assert(!document.querySelector(".cf-operation") && !document.querySelector(".cf-pending-item") &&
                document.querySelectorAll(".cf-capacity-day").length > 0, "All-problem filtering must keep capacity and the empty board");
            return { passed: true, views: 4, viewport: [innerWidth, innerHeight] };
        } finally {
            window.fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertCurrentTime = function () {
        const original = structuredClone(window.fixture.payload);
        const p = structuredClone(original);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const near = (a, b) => Math.abs(a - b) < 0.2;
        const before = window.fixture.calls.length;
        const unchanged = JSON.stringify([p.operations, p.resources]);
        const core = window.CFSchedulerCore;
        try {
            window.fixture.payload = p;
            p.currentTime = "2026-11-03T10:15:00";
            for (const view of ["hour", "day", "week", "month"]) {
                p.viewMode = view;
                LoadSchedule(p);
                const axis = core.timeAxis(view, core.parseCivil(p.start), core.parseCivil(p.end), p.hourWindows);
                const header = document.querySelector(".cf-axis").getBoundingClientRect();
                const expected = header.left + core.currentTimePosition(axis, p.currentTime) / 100 * header.width;
                const markers = [...document.querySelectorAll(".cf-current-time")];
                assert(markers.length === 2, "Current-time line must cover both sticky header and resource grid");
                assert(markers.every(marker => near(marker.getBoundingClientRect().left, expected)), "Current-time marker is misaligned");
                const grid = document.querySelector(".cf-grid").getBoundingClientRect();
                const overlay = document.querySelector(".cf-time-overlay").getBoundingClientRect();
                assert(near(overlay.top, grid.top) && near(overlay.bottom, grid.bottom), "Time line must span summaries, capacity and operations");
                assert(markers.every(marker => getComputedStyle(marker).pointerEvents === "none"), "Time line must not intercept dragging");
                assert(document.querySelector(".cf-current-time-label").textContent.includes("2026-11-03 10:15:00"), "Current-time label is missing");
                const bar = document.querySelector(".cf-operation");
                SetCurrentTime("2026-11-03T11:15:00");
                assert(bar === document.querySelector(".cf-operation"), "Clock update rebuilt the operations");
                assert(document.querySelector(".cf-current-time").getBoundingClientRect().left > expected, "Live clock update did not move the marker");
                SetCurrentTime(p.end);
                assert(!document.querySelector(".cf-current-time"), "Out-of-range time must not show a marker");
                window.fixture.assertLayout();
            }
            p.viewMode = "hour";
            p.currentTime = "2026-11-03T06:00:00";
            LoadSchedule(p);
            assert(!document.querySelector(".cf-current-time"), "Off-hours time was snapped into the Hour window");
            p.viewMode = "day";
            p.hideNonWorkingDays = true;
            p.currentTime = "2026-11-05T10:00:00";
            LoadSchedule(p);
            assert(!document.querySelector(".cf-current-time"), "Time on a hidden day was snapped to a visible date");
            assert(JSON.stringify([p.operations, p.resources]) === unchanged, "Clock modified scheduling data");
            assert(window.fixture.calls.length === before, "Rendering a time update sent a manufacturing request");
            return { passed: true, views: 4, viewport: [innerWidth, innerHeight] };
        } finally {
            window.fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertDateViews = async function () {
        const original = structuredClone(window.fixture.payload);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const core = window.CFSchedulerCore;
        const p = structuredClone(original);
        p.operations = p.operations.slice(0, 3);
        const settle = async () => {
            for (let attempt = 0; document.getElementById("controlAddIn").getAttribute("aria-busy") === "true"; attempt++) {
                if (attempt === 100) throw new Error("Fixture bridge did not settle");
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        };
        let focused = false;
        try {
            LoadSchedule(original);
            const search = document.querySelector('.cf-search input');
            search.value = original.operations[0].order;
            search.dispatchEvent(new Event("input"));
            document.querySelector('.cf-operation[data-operation="op-a"]').click();
            await settle();
            document.querySelector('.cf-resource-label button[aria-expanded="true"]').click();
            p.documentFocus = true;
            p.fitToWindow = true;
            p.viewChange = "focus";
            p.selectedOperationId = "op-a";
            p.focusNotice = "Document view: Released 101001. Capacity includes competing orders.";
            p.viewMode = "month";
            p.hideNonWorkingDays = false;
            p.start = "2028-01-01T00:00:00";
            for (const [index, item] of p.operations.entries()) {
                Object.assign(item, { order: "101001", statusId: 3, confirmed: index < 2, orderScheduled: false,
                    start: `2028-01-0${index + 1}T08:00:00`, end: `2028-01-0${index + 1}T12:00:00`,
                    predecessors: index ? [p.operations[index - 1].id] : [],
                    successors: index < 2 ? [p.operations[index + 1].id] : [] });
            }
            Object.assign(p.operations[2], { finished: true, editable: false, canConfirm: false });
            const callCount = window.fixture.calls.length;
            for (const [end, length] of [["2028-07-01T00:00:00", 182], ["2029-01-01T00:00:00", 366]]) {
                p.end = end;
                p.navigation = { start: p.start, days: length, viewDays: length, offset: 0, caption: "Display range" };
                const dates = Array.from({ length }, (_, index) =>
                    core.formatCivil(core.parseCivil(p.start) + index * core.day).slice(0, 10));
                for (const resource of p.resources) {
                    resource.days = dates.map(date => ({ date, available: resource.direct ? 0 : 480, allocated: 600 }));
                    resource.windows = dates.map(date => ({ start: date + "T08:00:00", end: date + "T16:00:00" }));
                }
                p.operations[2].start = dates.at(-1) + "T08:00:00";
                p.operations[2].end = dates.at(-1) + "T12:00:00";
                const unchanged = JSON.stringify(p);
                window.fixture.payload = p;
                LoadSchedule(p);
                focused = true;
                assert(!document.querySelector('.cf-banner.cf-error'), "Long-range rendering failed");
                assert(document.querySelector('.cf-search input').value === "", "Document focus clears text search");
                assert(document.querySelector('.cf-resource-label button').getAttribute("aria-expanded") === "true", "Document focus expands resources");
                assert(document.querySelectorAll('[data-unit="day"] .cf-date').length === length, "Full preset range is displayed");
                assert(document.querySelectorAll('.cf-operation').length === 3, "All document steps remain on the timeline");
                assert(document.querySelectorAll('.cf-routing-link').length === 2, "Scheduled and finished document dependencies are connected");
                assert(document.querySelectorAll('.cf-operation.cf-selected').length === 1, "Selected document step is highlighted");
                assert(!document.querySelector('.cf-pending-item[data-operation="op-c"]'), "Finished step is not marked unplanned");
                assert(document.querySelector('.cf-capacity-day').title.includes("600"), "Competing capacity remains visible");
                const layout = window.fixture.assertLayout();
                assert(!layout.horizontalScroll, "Full overview fits the available width");
                assert(JSON.stringify(p) === unchanged, "Display actions do not mutate operation dates, capacity or confirmations");
                p.viewChange = "";
            }
            const restore = { ...original, viewChange: "restore" };
            window.fixture.payload = restore;
            LoadSchedule(restore);
            focused = false;
            assert(document.querySelector('.cf-search input').value === original.operations[0].order, "Restore recovers text search");
            assert(document.querySelector('.cf-resource-label button').getAttribute("aria-expanded") === "false", "Restore recovers collapsed resources");
            assert(document.querySelectorAll('.cf-date-ticks .cf-date').length === 3, "Restore recovers the original date range");
            assert(window.fixture.calls.length === callCount, "Focus, presets and restore send no manufacturing mutation requests");
            document.querySelector('.cf-resource-label button').click();
            const input = document.querySelector('.cf-search input');
            input.value = "";
            input.dispatchEvent(new Event("input"));
            return { sixMonthDays: 182, leapYearDays: 366, links: 2, restoredSearchAndResources: true };
        } finally {
            window.fixture.payload = original;
            LoadSchedule({ ...original, viewChange: focused ? "restore" : "" });
        }
    };
    window.fixture.assertNonWorkingDays = async function () {
        const original = structuredClone(window.fixture.payload);
        const p = structuredClone(original);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        p.start = "2026-11-06T00:00:00";
        p.end = "2026-11-10T00:00:00";
        p.currentTime = "2026-11-07T10:00:00";
        p.navigation = { ...p.navigation, start: p.start, viewDays: 4, offset: 0 };
        p.hideNonWorkingDays = true;
        const dates = ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"];
        for (const resource of p.resources) {
            resource.days = dates.map((date, index) => ({
                date, available: resource.direct ? 0 : index === 0 ? 480 : index === 2 && resource.id === "M:100" ? 60 : 0,
                allocated: index === 1 ? 120 : 0
            }));
            resource.windows = resource.days.filter(day => day.available > 0)
                .map(day => ({ start: day.date + "T08:00:00", end: day.date + "T09:00:00" }));
        }
        Object.assign(p.operations[0], { start: "2026-11-06T08:00:00", end: "2026-11-06T10:00:00",
            successors: ["op-b", "op-c"], orderScheduled: true });
        Object.assign(p.operations[1], { order: p.operations[0].order, statusId: 3, status: "Released",
            start: "2026-11-07T08:00:00", end: "2026-11-07T10:00:00", predecessors: ["op-a"] });
        Object.assign(p.operations[2], { order: p.operations[0].order, start: "2026-11-08T08:00:00",
            end: "2026-11-08T12:00:00", predecessors: ["op-a"] });
        p.operations.push({ ...p.operations[2], id: "clipped", order: "CLIPPED", predecessors: [],
            start: "2026-11-07T11:00:00", end: "2026-11-08T11:00:00" });
        const unchanged = JSON.stringify([p.resources, p.operations, p.navigation]);
        const dayHeaders = () => [...document.querySelectorAll('[data-unit="day"] .cf-date')];
        try {
            window.fixture.payload = p;
            LoadSchedule(p);
            document.querySelector('.cf-operation[data-operation="op-a"]').click();
            for (let attempt = 0; document.getElementById("controlAddIn").getAttribute("aria-busy") === "true"; attempt++) {
                if (attempt === 100) throw new Error("Fixture bridge did not settle");
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            const calls = window.fixture.calls.length;
            for (const view of ["hour", "day", "week", "month"]) {
                p.viewMode = view;
                LoadSchedule(p);
                assert(dayHeaders().length === 2, "Expected Friday and working Sunday only");
                for (const row of document.querySelectorAll(".cf-capacity")) {
                    assert(row.children.length === 2 &&
                        row.children[0].title.startsWith("2026-11-06") && row.children[1].title.startsWith("2026-11-08"),
                        "A weekend with capacity was hidden or a closed holiday was shown");
                }
                assert(!document.querySelector('.cf-operation[data-operation="op-b"]'), "Closed-day operation stayed visible");
                assert(!document.querySelector(".cf-current-time"), "Hidden current-time marker was placed on another date");
                const note = document.querySelector(".cf-nonworking-scope").textContent;
                assert(note.includes("2 non-working days") && note.includes("1 matching operations") &&
                    note.includes("1 hidden days contain allocated capacity"), "Hidden operation/load notice is incorrect");
                const clipped = document.querySelector('.cf-operation[data-operation="clipped"]');
                assert(!clipped.classList.contains("cf-editable"), "Clipped hidden-day start remained draggable");
                clipped.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
                assert(document.querySelector("[role=tooltip]").textContent.includes(labels.hiddenClippedStart), "Missing clipped-start guidance");
                document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
                const paths = [...document.querySelectorAll(".cf-routing-link")];
                assert(paths.length === 1 && paths[0].dataset.to === "op-c", "Links did not follow visible endpoints");
                const grid = document.querySelector(".cf-grid").getBoundingClientRect();
                for (const [id, point] of [["op-a", paths[0].getPointAtLength(0)], ["op-c", paths[0].getPointAtLength(paths[0].getTotalLength())]]) {
                    const rect = document.querySelector(`.cf-operation[data-operation="${id}"]`).getBoundingClientRect();
                    const x = (id === "op-a" ? rect.right : rect.left) - grid.left;
                    assert(Math.abs(point.x - x) < 0.2 && Math.abs(point.y - (rect.top + rect.height / 2 - grid.top)) < 0.2, "Compressed arrows drifted");
                }
                window.fixture.assertLayout();
                const search = document.querySelector('input[type="search"]');
                search.value = "CLIPPED";
                search.dispatchEvent(new Event("input"));
                assert(dayHeaders().length === 2, "Text search changed the working calendar");
                search.value = "";
                search.dispatchEvent(new Event("input"));
                document.querySelector(".cf-summary button").click();
                assert(dayHeaders().length === 2, "Collapsing resources changed the working calendar");
                document.querySelector(".cf-summary button").click();
                p.hideNonWorkingDays = false;
                LoadSchedule(p);
                assert(dayHeaders().length === 4 && document.querySelector('.cf-operation[data-operation="op-b"]') &&
                    document.querySelector(".cf-current-time"), "Show All Days did not restore the full timeline");
                p.hideNonWorkingDays = true;
            }
            assert(JSON.stringify([p.resources, p.operations, p.navigation]) === unchanged, "Display filtering changed scheduling/capacity data");
            assert(window.fixture.calls.length === calls, "Display filtering sent a scheduling request");
            for (const resource of p.resources) for (const day of resource.days) day.available = 0;
            for (const view of ["hour", "day", "week", "month"]) {
                p.viewMode = view;
                LoadSchedule(p);
                assert(document.querySelector(".cf-empty-calendar")?.textContent === labels.noWorkingDays &&
                    !document.querySelector(".cf-grid") && !document.querySelector(".cf-banner.cf-error") &&
                    document.querySelector(".cf-pending-item") && document.querySelector(".cf-routing-scope").hidden,
                    "All-closed range did not render a usable explicit empty state");
                assert(document.querySelector(".cf-board").getBoundingClientRect().height >= 219, "Empty calendar collapsed the board");
            }
            p.hideNonWorkingDays = false;
            LoadSchedule(p);
            assert(dayHeaders().length === 4, "All-closed range could not be restored");
            return { passed: true, views: 4, viewport: [innerWidth, innerHeight] };
        } finally {
            window.fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertRoutingLinks = async function () {
        const original = structuredClone(window.fixture.payload);
        const p = structuredClone(original);
        const a = p.operations[0];
        const c = p.operations[2];
        a.operation = "20";
        a.predecessors = ["op-c"];
        a.successors = ["op-d"];
        a.orderScheduled = true;
        Object.assign(c, { order: a.order, statusId: a.statusId, operation: "10", successors: ["op-a"],
            start: "2026-11-03T07:00:00", end: "2026-11-03T08:00:00" });
        const d = { ...a, id: "op-d", operation: "30", resource: "D:100", predecessors: ["op-a"], successors: [],
            start: "2026-11-03T13:00:00", end: "2026-11-03T15:00:00" };
        p.operations.push(d);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const bar = id => document.querySelector(`.cf-operation[data-operation="${id}"]`);
        const pending = () => document.querySelector('.cf-pending-item[data-operation="op-a"]');
        const links = () => [...document.querySelectorAll(".cf-routing-link")];
        const settled = async () => {
            for (let attempt = 0; attempt < 100; attempt++) {
                if (document.getElementById("controlAddIn").getAttribute("aria-busy") === "false") return;
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            throw new Error("Fixture bridge did not settle");
        };
        function aligned() {
            const grid = document.querySelector(".cf-grid").getBoundingClientRect();
            assert(links().length === 2, "Expected two routing arrows");
            for (const link of links()) {
                const from = bar(link.dataset.from).getBoundingClientRect();
                const to = bar(link.dataset.to).getBoundingClientRect();
                const start = link.getPointAtLength(0);
                const end = link.getPointAtLength(link.getTotalLength());
                assert(Math.abs(start.x - (from.right - grid.left)) < 0.2 &&
                    Math.abs(start.y - (from.top + from.height / 2 - grid.top)) < 0.2 &&
                    Math.abs(end.x - (to.left - grid.left)) < 0.2 &&
                    Math.abs(end.y - (to.top + to.height / 2 - grid.top)) < 0.2, "Arrow endpoints drifted");
            }
        }
        function startDrag() {
            const dataTransfer = new DataTransfer();
            const event = new DragEvent("dragstart", { dataTransfer, bubbles: true, cancelable: true });
            pending().dispatchEvent(event);
            return { dataTransfer, event };
        }
        function dragEvent(name, target, dataTransfer, clientX) {
            target.dispatchEvent(new DragEvent(name, { dataTransfer, clientX, bubbles: true, cancelable: true }));
        }
        try {
            window.fixture.payload = p;
            LoadSchedule(p);
            bar("op-a").click();
            await settled();
            aligned();
            assert(document.querySelectorAll(".cf-operation.cf-selected").length === 1 &&
                bar("op-a").getAttribute("aria-pressed") === "true", "Selected step is not unique/highlighted");
            assert(getComputedStyle(bar("op-a")).outlineColor === "rgb(229, 160, 0)", "Selected step lacks gold highlight");
            bar("op-b").click();
            await settled();
            assert(links().length === 0 && bar("op-b").classList.contains("cf-selected"), "Other order selection retained arrows");
            bar("op-a").click();
            await settled();
            for (const view of ["hour", "day", "week", "month"]) {
                p.viewMode = view;
                LoadSchedule(p);
                aligned();
                window.fixture.assertLayout();
            }
            document.querySelector(".cf-summary button").click();
            assert(links().length === 0 && document.querySelector(".cf-routing-scope").textContent.includes("2 hidden"), "Collapsed endpoints were not hidden");
            document.querySelector(".cf-summary button").click();
            aligned();
            const search = document.querySelector('input[type="search"]');
            search.value = "101002";
            search.dispatchEvent(new Event("input"));
            assert(links().length === 0, "Search left detached arrows");
            search.value = "";
            search.dispatchEvent(new Event("input"));
            aligned();
            p.viewMode = "hour";
            a.confirmed = false;
            LoadSchedule(p);
            assert(pending() && !bar("op-a"), "An unscheduled step must appear only at the top");
            const wrong = document.querySelector('[data-resource="D:100"] .cf-lane');
            const beforeWrong = window.fixture.calls.length;
            let drag = startDrag();
            dragEvent("dragover", wrong, drag.dataTransfer, wrong.getBoundingClientRect().left + 20);
            assert(!document.querySelector(".cf-drop-preview") && document.querySelector(".cf-drop-help").textContent === labels.dropInvalid,
                "Wrong resource accepted a preview or lacked guidance");
            dragEvent("drop", wrong, drag.dataTransfer, wrong.getBoundingClientRect().left + 20);
            assert(window.fixture.calls.length === beforeWrong && !document.querySelector(".cf-banner").hidden, "Wrong resource sent a request or lacked warning");
            const lane = document.querySelector('[data-resource="M:100"] .cf-lane');
            const rect = lane.getBoundingClientRect();
            const axis = CFSchedulerCore.timeAxis("hour", CFSchedulerCore.parseCivil(p.start), CFSchedulerCore.parseCivil(p.end), p.hourWindows);
            const x = rect.left + CFSchedulerCore.axisPosition(axis, CFSchedulerCore.parseCivil("2026-11-03T09:30:00")) / axis.duration * rect.width;
            drag = startDrag();
            dragEvent("dragover", lane, drag.dataTransfer, x);
            assert(document.querySelector(".cf-drop-preview")?.textContent.includes("09:30:00"), "Assigned-row drop preview is incorrect");
            const beforeDrop = window.fixture.calls.length;
            dragEvent("drop", lane, drag.dataTransfer, x);
            assert(!document.querySelector(".cf-drop-preview") && pending() && !a.confirmed, "Drop optimistically confirmed the operation");
            await settled();
            const request = window.fixture.calls[beforeDrop];
            assert(window.fixture.calls.length === beforeDrop + 1 && request.name === "OperationStartChangeRequested" &&
                JSON.stringify(request.args) === JSON.stringify(["op-a", "1", "2026-11-03T09:30:00"]), "Drop did not use the existing scheduling request");
            assert(!pending() && a.confirmed && a.start === "2026-11-03T09:30:00" &&
                bar("op-a").classList.contains("cf-selected"), "Authoritative confirmation lost selection/unplanned state");
            aligned();
            for (const item of p.operations) { item.confirmed = false; item.orderScheduled = false; }
            LoadSchedule(p);
            assert(links().length === 0 && document.querySelector(".cf-routing-scope").textContent === labels.routingUnscheduled, "Unscheduled order retained links");
            a.editable = false;
            LoadSchedule(p);
            assert(!pending().draggable && startDrag().event.defaultPrevented, "Read-only operation became draggable");
            a.editable = true;
            LoadSchedule(p);
            const beforeFailure = window.fixture.calls.length;
            window.fixture.failNext = true;
            drag = startDrag();
            dragEvent("drop", document.querySelector('[data-resource="M:100"] .cf-lane'), drag.dataTransfer, x);
            await settled();
            assert(window.fixture.calls.length === beforeFailure + 1 && document.querySelector(".cf-banner.cf-error") &&
                !pending().draggable && !a.confirmed, "Failed request did not retain unplanned state and disable retries");
            return { passed: true, viewport: [innerWidth, innerHeight], views: 4 };
        } finally {
            window.fixture.failNext = false;
            window.fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertHoverDetails = async function () {
        const original = structuredClone(window.fixture.payload);
        const before = window.fixture.calls.length;
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const tip = () => document.querySelector("[role=tooltip]");
        const bar = () => document.querySelector('.cf-operation[data-operation="op-a"]');
        const enter = node => node.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
        const leave = node => node.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
        const pause = () => new Promise(resolve => setTimeout(resolve, 200));
        function contained() {
            const rect = tip().getBoundingClientRect();
            assert(rect.left >= 7 && rect.top >= 7 && rect.right <= innerWidth - 7 && rect.bottom <= innerHeight - 7,
                "Tooltip escaped the iframe viewport");
            assert(tip().scrollWidth <= tip().clientWidth + 1, "Tooltip text overflowed horizontally");
        }
        try {
            document.activeElement.blur();
            LoadSchedule(original);
            enter(bar());
            assert(!tip().hidden, "Hover did not show details");
            assert(bar().getAttribute("aria-describedby") === tip().id && !bar().hasAttribute("title"), "Tooltip accessibility/native title");
            const pairs = [...tip().querySelectorAll("dt")].map(node => [node.textContent, node.nextElementSibling.textContent]);
            for (const [name, value] of [
                ["Operation No.", "10"], ["Previous Operation No.", "-"], ["Next Operation No.", "20"],
                ["Prod. Order No.", "101001"], ["Line No.", "10000"], ["Item No.", "ITEM-100"],
                ["Quantity", "10"], ["Unit of Measure Code", "PCS"], ["Status", "Released"],
                ["Starting Date-Time", "2026-11-03 08:00:00"], ["Ending Date-Time", "2026-11-03 12:00:00"]
            ]) assert(pairs.some(pair => pair[0] === name && pair[1] === value), `Missing ${name}: ${value}`);
            assert(tip().textContent.includes("<script>not executable</script>") && !tip().querySelector("script"), "Unsafe description rendering");
            contained();
            leave(bar());
            enter(tip());
            await pause();
            assert(!tip().hidden, "Tooltip closed while moving onto it");
            tip().dispatchEvent(new Event("scroll"));
            assert(!tip().hidden, "Scrolling tooltip dismissed it");
            leave(tip());
            await pause();
            assert(tip().hidden && !bar().hasAttribute("aria-describedby"), "Tooltip stayed after leaving");
            enter(bar());
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            assert(tip().hidden, "Escape did not dismiss");
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
            bar().focus({ preventScroll: true });
            assert(!tip().hidden, "Keyboard focus did not show details");
            bar().blur();
            assert(tip().hidden, "Blur did not dismiss");
            enter(document.querySelector(".cf-pending-item"));
            assert(!tip().hidden && tip().textContent.includes("101001"), "Unscheduled hover missing");
            document.querySelector(".cf-board").dispatchEvent(new Event("scroll"));
            assert(tip().hidden, "Board scrolling did not dismiss");
            enter(bar());
            window.dispatchEvent(new Event("resize"));
            assert(tip().hidden, "Resize did not dismiss");
            enter(bar());
            LoadSchedule(original);
            assert(tip().hidden && !document.querySelector("[aria-describedby]"), "Refresh kept stale tooltip");
            const multiple = structuredClone(original);
            multiple.viewMode = "hour";
            multiple.operations[0].start = "2026-11-03T06:00:00";
            multiple.operations[0].previousOperation = "05";
            multiple.operations[0].lines.push({ lineNo: 20000, item: "ITEM-200", description: "X".repeat(300), quantity: 0, unit: "PCS" });
            LoadSchedule(multiple);
            enter(bar());
            assert(tip().querySelectorAll("h4").length === 2 && tip().textContent.includes("ITEM-200"), "Shared routing lost a production line");
            assert(tip().textContent.includes(labels.hourClippedStart), "Clipped-start guidance missing");
            contained();
            const pending = document.querySelector(".cf-pending-item");
            pending.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch" }));
            assert(tip().hidden, "Pointer down did not dismiss");
            pending.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "touch" }));
            assert(tip().hidden, "Touch created a sticky hover");
            assert(window.fixture.calls.length === before, "Hover sent a Business Central request");
            return { passed: true, viewport: [innerWidth, innerHeight] };
        } finally {
            LoadSchedule(original);
        }
    };
    window.fixture.assertLayout = function () {
        const root = document.getElementById("controlAddIn");
        const board = root.querySelector(".cf-board");
        const grid = root.querySelector(".cf-grid");
        const axis = root.querySelector(".cf-axis").getBoundingClientRect();
        const label = root.querySelector(".cf-resource-label").getBoundingClientRect();
        const minimum = parseFloat(grid.style.getPropertyValue("--cf-min-timeline-width"));
        const near = (actual, expected, message, tolerance = 1) => {
            if (Math.abs(actual - expected) > tolerance) {
                throw new Error(`${message}: expected ${expected}, received ${actual}`);
            }
        };
        near(root.getBoundingClientRect().height, window.innerHeight, "Root fills iframe height");
        near(root.getBoundingClientRect().width, window.innerWidth, "Root fills iframe width");
        near(grid.getBoundingClientRect().width, Math.max(board.clientWidth, label.width + minimum), "Timeline fits or scrolls");
        for (const row of root.querySelectorAll(".cf-date-columns")) {
            near(row.getBoundingClientRect().width, axis.width, "Header fills timeline");
            near(row.lastElementChild.getBoundingClientRect().right, axis.right, "Last date aligns", 0.1);
        }
        for (const row of root.querySelectorAll(".cf-capacity")) {
            near(row.getBoundingClientRect().width, axis.width, "Capacity fills timeline");
            near(row.lastElementChild.getBoundingClientRect().right, axis.right, "Last capacity cell aligns");
            const dayHeaders = root.querySelectorAll('[data-unit="day"] .cf-date');
            for (const [index, cell] of [...row.children].entries()) {
                near(cell.getBoundingClientRect().left, dayHeaders[index].getBoundingClientRect().left, "Daily capacity start aligns");
                near(cell.getBoundingClientRect().right, dayHeaders[index].getBoundingClientRect().right, "Daily capacity end aligns");
            }
        }
        if (board.getBoundingClientRect().height < 219) throw new Error("Timeline is unusably short.");
        if (root.scrollWidth > root.clientWidth + 1) throw new Error("Horizontal scrolling escaped the board.");
        if (root.scrollHeight <= root.clientHeight + 1) {
            near(root.querySelector(".cf-details").getBoundingClientRect().bottom, window.innerHeight - 8, "No unused space below details");
        }
        return {
            viewport: [window.innerWidth, window.innerHeight],
            board: [board.clientWidth, board.clientHeight],
            horizontalScroll: board.scrollWidth > board.clientWidth + 1,
            verticalFallback: root.scrollHeight > root.clientHeight + 1
        };
    };
    window.Microsoft = { Dynamics: { NAV: {
        InvokeExtensibilityMethod(name, args, skipIfBusy, success, failure) {
            window.fixture.calls.push({ name, args, skipIfBusy });
            setTimeout(function () {
                const payload = window.fixture.payload;
                if (window.fixture.failNext) {
                    window.fixture.failNext = false;
                    failure();
                    return;
                }
                if (name === "ControlReady") window.LoadSchedule(payload);
                if (name === "CurrentTimeRequested") window.SetCurrentTime(payload.currentTime);
                if (name === "ViewModeChanged") {
                    payload.viewMode = args[0];
                    payload.fitToWindow = false;
                    payload.viewChange = "";
                    window.LoadSchedule(payload);
                }
                if (name === "DateWindowChanged") {
                    payload.navigation.offset = args[0];
                    const core = window.CFSchedulerCore;
                    const next = core.rangeWindow(payload.navigation.start, payload.navigation.days, payload.navigation.viewDays, args[0]);
                    payload.start = next.start;
                    payload.end = next.end;
                    for (const resource of payload.resources) {
                        resource.days = Array.from({ length: payload.navigation.viewDays }, (_, index) => {
                            const date = core.formatCivil(core.parseCivil(next.start) + index * core.day).slice(0, 10);
                            const original = days.find(day => day.date === date);
                            return resource.direct
                                ? { date, available: 0, allocated: date === "2026-11-03" ? 120 : 0 }
                                : original || { date, available: 0, allocated: 0 };
                        });
                    }
                    window.LoadSchedule(payload);
                }
                if (name === "OperationStartChangeRequested" || name === "OperationConfirmRequested") {
                    const item = payload.operations.find(entry => entry.id === args[0]);
                    if (name === "OperationStartChangeRequested") {
                        const duration = window.CFSchedulerCore.parseCivil(item.end) - window.CFSchedulerCore.parseCivil(item.start);
                        item.start = args[2];
                        item.end = window.CFSchedulerCore.formatCivil(window.CFSchedulerCore.parseCivil(item.start) + duration);
                    }
                    item.confirmed = true;
                    item.draftChanged = true;
                    item.canCommit = true;
                    for (const related of payload.operations) {
                        if (related.order === item.order && related.statusId === item.statusId) related.orderScheduled = true;
                    }
                    item.version = String(Number(item.version) + 1);
                    window.LoadSchedule(payload);
                }
                success();
            }, 50);
        }
    } } };
}());
