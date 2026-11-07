"use strict";
(function () {
    const labels = {
        operationDetails: "Prod. Order Routing Line", operationNo: "Operation No.", description: "Description",
        problem: "Scheduling problem",
        noWorkingPortion: "No working-calendar portion is visible. This marker is not the operation duration.",
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
        hiddenDaysScope: "%1 days hidden. %2 matching operations fall entirely on hidden days. %3 hidden days contain allocated capacity. Use Show Weekends or Show All Days.",
        noWorkingDays: "No working days in this date range. Use Show All Days or change Schedule Options; check resource calendars.",
        hiddenClippedStart: "The actual start is outside visible periods. Use Schedule start in the details.",
        hiddenDragRange: "Drop within visible dates and hours, or enter the start manually.",
        title: "Production Scheduler", currentTime: "Current time", unconfirmed: "Unscheduled", unscheduled: "Unscheduled",
        requestedStart: "Requested start", estimatedFinish: "Estimated finish (before recalculation)", requiredDue: "Required due",
        empty: "No operations in this view.", schedule: "Schedule start", confirm: "Confirm existing dates",
        order: "Open production order", routing: "Schedule Details", start: "Start", end: "Finish", due: "Due",
        openBCRouting: "Open BC Routing",
        draftDetails: "Schedule Details", editDraft: "Edit Draft Start", zoomDocument: "Zoom to Document", unzoomDocument: "Unzoom",
        resetDraft: "Reset Order Draft from BC", commitOrder: "Commit This Order to BC", draftScenario: "Draft scenario",
        hour: "Hour", day: "Day", week: "Week", month: "Month", busy: "Working...", failed: "Request failed; refresh before retrying.",
        hourScope: "Hour view shows the full day. Light-blue intervals are non-working time from each resource calendar.",
        hourDragRange: "Drop within the visible timeline, or enter the start manually.",
        hourClippedStart: "The actual start is outside the visible timeline. Use Schedule start instead of dragging this clipped bar.",
        capacity: "Daily hours: allocated / available", noCapacity: "No capacity", missingCalendar: "No calculated calendar entries.",
        blocked: "Blocked resource", direct: "Direct load only, not additional capacity.",
        legend: "Unscheduled steps appear in an Unscheduled row under each work centre. Scheduled or finished steps appear on resource rows. Red border: scheduling problem. Grey fill: daily capacity utilisation. Light red: overloaded. Empty days stay white.",
        minutes: "minutes", available: "Available", allocated: "Allocated", remaining: "Remaining",
        select: "Select an operation.", late: "Late", pending: "Awaiting confirmation", confirmed: "Confirmed", finished: "Finished",
        invalidDate: "Enter a valid start date and time.", search: "Find order, item or operation",
        selectionToolbar: "Step selection", selectedCount: "%1 selected", selectChain: "Select Routing Chain",
        selectFollowing: "Select Following Steps", clearSelection: "Clear Selection", lockSelected: "Lock Position Selected",
        unlockSelected: "Unlock Position Selected", lockStep: "Lock Position", unlockStep: "Unlock Position",
        positionLocked: "Position locked", lockedNoEdit: "This step's position is locked. Unlock it before dragging or editing its start.",
        noSelection: "Select at least one step first.", noLockChange: "The selected steps already have this lock state.",
        selectionUnavailable: "Selection actions are unavailable.", invalidSelectionCommand: "Unsupported selection command.",
        saving: "Saving draft...", saved: "Draft saved.", saveFailed: "The draft change was not saved. Refresh before retrying.",
        viewStateFailed: "The scroll position and selection could not be remembered for this session.",
        approvedOnlyScope: "Showing approved operations only. Capacity, planning and commit scope are not filtered.",
        approvedStatus: "Approved", unapprovedStatus: "Unapproved",
        problemDetails: "Show Problem Details", close: "Close",
        unapprovedOnlyScope: "Showing unapproved operations only. Draft approval alone does not count."
    };
    const days = [
        { date: "2026-11-03", available: 480, allocated: 600 },
        { date: "2026-11-04", available: 480, allocated: 120 },
        { date: "2026-11-05", available: 0, allocated: 0 }
    ];
    const windows = [
        { start: "2026-11-03T08:00:00", end: "2026-11-03T16:00:00", minutes: 480 },
        { start: "2026-11-04T08:00:00", end: "2026-11-04T16:00:00", minutes: 480 }
    ];
    const resources = [
        { id: "W:100", parent: "", name: "100 - Assembly department", summary: true, direct: false, windows, days,
            loadWindows: [{ start: "2026-11-03T08:00:00", end: "2026-11-03T12:00:00", minutes: 600 },
                { start: "2026-11-04T08:00:00", end: "2026-11-04T10:00:00", minutes: 120 }] },
        { id: "D:100", parent: "W:100", name: "100 - Direct work centre operations", direct: true, windows,
            loadWindows: [{ start: "2026-11-03T08:00:00", end: "2026-11-03T10:00:00", minutes: 120 }],
            days: days.map(day => ({ ...day, available: 0, allocated: day.date === "2026-11-03" ? 120 : 0 })) },
        { id: "M:100", parent: "W:100", name: "100 - CNC machine", direct: false, windows, days,
            loadWindows: [{ start: "2026-11-03T08:00:00", end: "2026-11-03T12:00:00", minutes: 600 },
                { start: "2026-11-04T08:00:00", end: "2026-11-04T10:00:00", minutes: 120 }] }
    ];
    const operation = (id, order, from, to, resource, confirmed, statusId) => ({
        id, order, operation: "10", resource, workCenter: "W:100",
        workMinutes: from && to ? (Date.parse(`${to}Z`) - Date.parse(`${from}Z`)) / 60000 : 60,
        confirmed, statusId, version: "1", finished: false, problems: [],
        draftChanged: false, canReset: true, canCommit: false, positionLocked: false,
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
        dragSnapMinutes: 15,
        currentTime: "2026-11-03T10:15:00",
        hideNonWorkingDays: false,
        includeProblemSteps: true,
        showSearch: true, showDisplayRange: true, showStepDetails: true,
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
    window.fixture.assertProblemDetails = function () {
        const original = structuredClone(fixture.payload);
        const bridge = Microsoft.Dynamics.NAV.InvokeExtensibilityMethod;
        Microsoft.Dynamics.NAV.InvokeExtensibilityMethod = (name, args, skip, success) => success();
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        try {
            const p = structuredClone(original);
            p.operations[0].problems = ["Capacity overload", "Routing <problem>"];
            p.operations[1].problems = [];
            p.includeProblemSteps = true;
            p.approvalFilter = 0;
            fixture.payload = p;
            LoadSchedule(p);
            const node = document.querySelector('[data-operation="op-a"]');
            node.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
            document.querySelector('[data-command="problems"]').click();
            const dialog = document.querySelector(".cf-problem-dialog");
            assert(dialog.open && dialog.textContent.includes("Capacity overload") &&
                dialog.textContent.includes("Routing <problem>"), "Problem details omitted reported issues");
            assert(!dialog.querySelector("problem"), "Problem details interpreted text as markup");
            dialog.querySelector("button").click();
            assert(!dialog.open, "Close retained an open problem dialog");
            document.querySelector('[data-operation="op-b"]').dispatchEvent(new MouseEvent("contextmenu", {
                bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
            assert(!document.querySelector('[data-command="problems"]'), "Healthy operation offered problem details");
            return { problemAction: true, reportedIssues: true, safeText: true, close: true, healthyActionHidden: true };
        } finally {
            Microsoft.Dynamics.NAV.InvokeExtensibilityMethod = bridge;
            fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertApprovalBadges = function () {
        const original = structuredClone(fixture.payload);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        try {
            const p = structuredClone(original);
            p.approvalFilter = 0;
            fixture.payload = p;
            for (const [approved, problem] of [[true, false], [false, false], [true, true], [false, true]]) {
                p.operations[0].approved = approved;
                p.operations[0].problems = problem ? ["Sample problem"] : [];
                LoadSchedule(p);
                document.querySelector('[data-operation="op-a"]').dispatchEvent(new PointerEvent("pointerenter", {pointerType: "mouse"}));
                const tooltip = document.querySelector(".cf-operation-tooltip");
                const badge = tooltip.querySelector(approved ? ".cf-approval-approved" : ".cf-approval-unapproved");
                assert(!tooltip.hidden && badge.textContent === (approved ? "Approved" : "Unapproved"),
                    "Tooltip omitted the committed approval badge");
                assert(Boolean(tooltip.querySelector(".cf-approval-problem")) === problem,
                    "Tooltip problem badge incorrectly replaces or omits approval");
                assert(getComputedStyle(badge).backgroundColor === (approved ? "rgb(20, 107, 53)" : "rgb(255, 224, 178)"),
                    "Approval badge colour does not match its status");
            }
            return { approvalStates: 2, independentProblemBadge: true, colours: true };
        } finally {
            fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertApprovalFilters = function () {
        const original = structuredClone(fixture.payload);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        try {
            const p = structuredClone(original);
            p.operations.forEach(item => { item.approved = item.id === "op-a"; });
            const capacity = JSON.stringify(p.resources);
            for (const [mode, expected] of [[1, ["op-a"]], [2, ["op-b", "op-c", "op-p"]], [0, ["op-a", "op-b", "op-c", "op-p"]]]) {
                p.approvalFilter = mode;
                fixture.payload = p;
                LoadSchedule(p);
                const ids = [...new Set([...document.querySelectorAll(".cf-board [data-operation]")].map(node => node.dataset.operation))].sort();
                assert(JSON.stringify(ids) === JSON.stringify(expected), "Approval filter does not use committed approval independently of draft confirmation");
                for (const node of document.querySelectorAll(".cf-operation")) {
                    const item = p.operations.find(item => item.id === node.dataset.operation);
                    assert(node.classList.contains("cf-unapproved") === (item.approved === false && !item.finished),
                        "Timeline approval styling does not match committed approval");
                    if (item.approved === false && !item.finished && !item.problems.length && !item.late) {
                        const style = getComputedStyle(node);
                        assert(style.backgroundColor === "rgb(226, 243, 217)" && style.borderLeftStyle === "dashed" &&
                            style.borderLeftColor === "rgb(232, 135, 30)", "Unapproved styling is not light green with orange dashed border");
                    }
                }
                assert(Boolean(document.querySelector(".cf-approval-scope")) === Boolean(mode), "Active approval filter not identified");
                assert(JSON.stringify(p.resources) === capacity &&
                    document.querySelector(".cf-capacity-day").textContent.includes("10 / 8"), "Approval filter changed capacity");
            }
            document.querySelector('[data-operation="op-a"]').click();
            p.approvalFilter = 2;
            LoadSchedule(p);
            assert(!document.querySelector(".cf-required-due") &&
                document.querySelector(".cf-selection-count").textContent.includes("0"), "Filtered selection retained invisible operation actions");
            return { approvedOnly: true, unapprovedOnly: true, showAll: true, capacityUnchanged: true, hiddenSelectionCleared: true };
        } finally {
            fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertDocumentZoomToolbar = function () {
        const original = structuredClone(fixture.payload);
        const bridge = Microsoft.Dynamics.NAV.InvokeExtensibilityMethod;
        const requests = [];
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        Microsoft.Dynamics.NAV.InvokeExtensibilityMethod = (name, args, skip, success) => {
            requests.push({ name, args });
            success();
        };
        try {
            const p = structuredClone(original);
            p.documentFocus = false;
            fixture.payload = p;
            LoadSchedule(p);
            document.querySelector('[data-operation="op-a"]').click();
            let control = document.querySelector(".cf-document-zoom");
            assert(control.textContent === "Zoom to Document" && !control.disabled, "Zoom button unavailable for selection");
            control.click();
            assert(requests.at(-1).name === "OperationContextRequested" &&
                requests.at(-1).args[0] === "op-a" && requests.at(-1).args[2] === "zoom", "Zoom did not use existing BC view command");
            p.documentFocus = true;
            LoadSchedule(p);
            control = document.querySelector(".cf-document-zoom");
            assert(control.textContent === "Unzoom" && !control.disabled, "Focused view did not offer Unzoom");
            document.querySelector('[data-selection="clear"]').click();
            assert(!control.disabled && !control.closest(".cf-selection").hidden, "Clearing selection hid Unzoom");
            control.click();
            assert(requests.at(-1).args[2] === "unzoom", "Unzoom did not request previous-view restoration");
            p.documentFocus = false;
            LoadSchedule(p);
            document.querySelector('[data-operation="op-a"]').click();
            assert(document.querySelector(".cf-document-zoom").textContent === "Zoom to Document", "Restore retained Unzoom caption");
            return { zoomDispatch: true, unzoomWithoutSelection: true, restoredCaption: true };
        } finally {
            Microsoft.Dynamics.NAV.InvokeExtensibilityMethod = bridge;
            fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertDragDatesAndDue = function () {
        const original = structuredClone(fixture.payload);
        const bridge = Microsoft.Dynamics.NAV.InvokeExtensibilityMethod;
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const requests = [];
        const assertGuides = (axis, start, end) => {
            const overlay = document.querySelector(".cf-drag-dates");
            const bounds = overlay.getBoundingClientRect();
            assert(getComputedStyle(overlay).position === "absolute" &&
                getComputedStyle(overlay).backgroundColor === "rgba(0, 0, 0, 0)",
                "Drag dates still use a floating popup");
            for (const [kind, value] of [["start", start], ["finish", end]]) {
                const marker = overlay.querySelector(`.cf-drag-${kind}`);
                const rect = marker.getBoundingClientRect();
                const expected = bounds.left + CFSchedulerCore.axisPosition(axis,
                    CFSchedulerCore.parseCivil(value)) / axis.duration * bounds.width;
                assert(marker.dataset.time === value && Math.abs(rect.left - expected) < 1,
                    `${kind} guide does not align with its operation time`);
                assert(Math.abs(rect.height - bounds.height) < 1 && parseFloat(getComputedStyle(marker).borderLeftWidth) > 0,
                    `${kind} guide does not span the timeline`);
                const label = marker.querySelector(".cf-drag-date-label").getBoundingClientRect();
                assert(label.left >= bounds.left - 1 && label.right <= bounds.right + 1,
                    `${kind} label runs outside the timeline`);
            }
            assert(overlay.querySelector(".cf-drag-start span").getBoundingClientRect().bottom <
                overlay.querySelector(".cf-drag-finish span").getBoundingClientRect().top,
                "Start and finish labels overlap instead of appearing above and below the operation");
        };
        Microsoft.Dynamics.NAV.InvokeExtensibilityMethod = (name, args, skip, success, failure) => {
            requests.push({ name, args, failure });
            if (name !== "OperationStartChangeRequested") success();
        };
        try {
            const p = structuredClone(original);
            for (const viewMode of ["hour", "day", "week", "month"]) {
                p.viewMode = viewMode;
                fixture.payload = p;
                LoadSchedule(p);
                document.querySelector('[data-operation="op-a"]').click();
                const marker = document.querySelector(".cf-required-due");
                assert(marker && Math.abs(parseFloat(marker.style.left) - 200 / 3) < 0.0001,
                    "Due date is not at the end of its day");
                assert(marker.textContent.includes(p.operations[0].order) &&
                    marker.textContent.includes("2026-11-04 24:00"), "Due marker omits selected order/date");
                const lane = document.querySelector('[data-resource="M:100"] .cf-lane');
                const bounds = lane.getBoundingClientRect();
                const axis = CFSchedulerCore.timeAxis(viewMode, CFSchedulerCore.parseCivil(p.start),
                    CFSchedulerCore.parseCivil(p.end));
                const x = bounds.left + bounds.width / 2;
                const transfer = new DataTransfer();
                const unscheduled = document.querySelector('[data-operation="op-p"]');
                unscheduled.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
                lane.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true,
                    dataTransfer: transfer, clientX: x, clientY: bounds.top + 10 }));
                const start = CFSchedulerCore.droppedAxisStart(axis, x - bounds.left, bounds.width);
                const preview = CFSchedulerCore.dragPreview(p.operations.find(item => item.id === "op-p"), start);
                assertGuides(axis, preview.start, preview.end);
                unscheduled.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
                assert(!document.querySelector(".cf-drag-dates"), "Cancelled drop retained guide lines");
            }
            p.viewMode = "hour";
            p.dragSnapMinutes = 1;
            fixture.payload = p;
            LoadSchedule(p);
            const lane = document.querySelector('[data-resource="M:100"] .cf-lane');
            const bounds = lane.getBoundingClientRect();
            const axis = CFSchedulerCore.timeAxis("hour", CFSchedulerCore.parseCivil(p.start), CFSchedulerCore.parseCivil(p.end));
            const start = "2026-11-03T08:07:00";
            const x = bounds.left + CFSchedulerCore.axisPosition(axis, CFSchedulerCore.parseCivil(start)) / axis.duration * bounds.width;
            const transfer = new DataTransfer();
            document.querySelector('[data-operation="op-p"]').dispatchEvent(new DragEvent("dragstart", {
                bubbles: true, cancelable: true, dataTransfer: transfer
            }));
            lane.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true,
                dataTransfer: transfer, clientX: x, clientY: bounds.top + 10 }));
            assert(document.querySelector(".cf-drag-dates").textContent.includes("2026-11-03 08:07:00"),
                "Minute-level preview was rounded to a 15-minute boundary");
            assertGuides(axis, start, CFSchedulerCore.dragPreview(p.operations.find(item => item.id === "op-p"), start).end);
            lane.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true,
                dataTransfer: transfer, clientX: x, clientY: bounds.top + 10 }));
            const request = requests.findLast(item => item.name === "OperationStartChangeRequested");
            assert(request.args[2] === start, "Drop request did not use configured minute precision");
            request.failure();
            assert(!document.querySelector(".cf-drag-dates"), "Rejected drop retained its estimated dates");
            return { dueMarkerViews: 4, verticalGuideViews: 4, minuteSnapPreviewAndRequest: true, rejectedDropCleanup: true };
        } finally {
            Microsoft.Dynamics.NAV.InvokeExtensibilityMethod = bridge;
            fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertOperationStacking = async function () {
        const original = structuredClone(fixture.payload);
        const baseline = JSON.stringify(fixture.bcOperations);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const settle = () => new Promise(resolve => {
            setTimeout(resolve, 100);
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        const check = () => {
            for (const lane of document.querySelectorAll(".cf-lane")) {
                const bars = [...lane.querySelectorAll(".cf-operation, .cf-unscheduled-operation")];
                const bounds = lane.getBoundingClientRect();
                for (let index = 0; index < bars.length; index++) {
                    const a = bars[index].getBoundingClientRect();
                    assert(a.top >= bounds.top && a.bottom <= bounds.bottom + 0.1, "Expanded lane clips a bar");
                    for (const other of bars.slice(index + 1)) {
                        if (bars[index].dataset.operation === other.dataset.operation) {
                            assert(bars[index].style.top === other.style.top, "Fragments changed lanes");
                            continue;
                        }
                        const b = other.getBoundingClientRect();
                        assert(!(a.left < b.right - 0.1 && b.left < a.right - 0.1 &&
                            a.top < b.bottom - 0.1 && b.top < a.bottom - 0.1), "Operation bars cover each other");
                    }
                }
            }
        };
        try {
            const p = structuredClone(original);
            p.fitToWindow = true;
            p.showSearch = false;
            p.hideNonWorkingDays = p.hideWeekends = false;
            p.operations = Array.from({ length: 20 }, (_, index) => ({
                ...structuredClone(original.operations[0]), id: `stack-${index}`, resource: "D:100",
                start: "2026-11-03T08:00:00", end: "2026-11-03T08:01:00", workMinutes: 1
            }));
            p.operations.push(...[2, 4].map((minutes, index) => ({
                ...structuredClone(p.operations[0]), id: `adjacent-${index}`,
                start: `2026-11-03T08:0${minutes}:00`, end: `2026-11-03T08:0${minutes + 1}:00`
            })));
            p.operations.push(...p.operations.slice(0, 3).map((item, index) => ({
                ...structuredClone(item), id: `pending-stack-${index}`, confirmed: false
            })));
            for (const viewMode of ["hour", "day", "week", "month"]) {
                for (const excludeNonWorkingHours of [false, true]) {
                    p.viewMode = viewMode;
                    p.excludeNonWorkingHours = excludeNonWorkingHours;
                    fixture.payload = p;
                    LoadSchedule(p);
                    await settle();
                    check();
                    const lane = document.querySelector('[data-resource="D:100"] .cf-lane');
                    assert(lane.clientHeight >= 20 * 34 + 8, "Dense operations did not expand the row");
                    assert(document.querySelector(".cf-unscheduled-row .cf-lane").clientHeight >= 3 * 34 + 8,
                        "Unscheduled operations did not expand the row");
                    const grid = document.querySelector(".cf-grid");
                    grid.style.width = "400px";
                    await settle();
                    check();
                    grid.style.width = "1800px";
                    await settle();
                    check();
                }
            }
            p.operations = [p.operations[0]];
            fixture.payload = p;
            LoadSchedule(p);
            await settle();
            assert(document.querySelector('[data-resource="D:100"] .cf-lane').clientHeight === 42,
                "Row did not shrink after removing overlaps");
            assert(JSON.stringify(fixture.bcOperations) === baseline, "Stacking changed BC data");
            return "Operation stacking passed: all views, dense rows, minimum-width bars, working portions, resize and shrink.";
        } finally {
            fixture.payload = original;
            LoadSchedule(original);
            await settle();
        }
    };
    window.fixture.assertNonWorkingDayShading = function () {
        const original = structuredClone(fixture.payload);
        const p = structuredClone(original);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const shades = id => [...document.querySelectorAll(`[data-resource="${id}"] .cf-nonworking-day`)];
        try {
            fixture.payload = p;
            for (const view of ["hour", "day", "week", "month"]) {
                p.viewMode = view;
                LoadSchedule(p);
                for (const id of ["M:100", "D:100"]) {
                    assert(shades(id).length === 1 && shades(id)[0].dataset.date === "2026-11-05",
                        "Non-working days must follow the resource calendar, including the direct row's parent");
                    assert(getComputedStyle(shades(id)[0]).backgroundColor === "rgb(252, 252, 250)",
                        "Non-working day is not off-white");
                    const timeline = document.querySelector(`[data-resource="${id}"]`);
                    const cell = [...timeline.querySelectorAll(".cf-capacity-day")].find(node => node.dataset.date === "2026-11-05");
                    assert(Math.abs(cell.getBoundingClientRect().left - shades(id)[0].getBoundingClientRect().left) < 1 &&
                        Math.abs(cell.getBoundingClientRect().width - shades(id)[0].getBoundingClientRect().width) < 1,
                        "Non-working day does not align with its date");
                }
                assert(!document.querySelector(".cf-unscheduled-row .cf-nonworking-day"),
                    "Unscheduled rows must retain their yellow background");
                p.resources.find(resource => resource.id === "M:100").missingCalendar = true;
                LoadSchedule(p);
                assert(shades("M:100").length === 0, "Missing calendar must not imply a non-working day");
                delete p.resources.find(resource => resource.id === "M:100").missingCalendar;
                p.hideNonWorkingDays = true;
                LoadSchedule(p);
                assert(!document.querySelector(".cf-nonworking-day"), "Hidden days must not leave background shading");
                p.hideNonWorkingDays = false;
            }
            p.end = "2026-11-08T00:00:00";
            p.navigation.viewDays = 5;
            for (const resource of p.resources) {
                resource.days.push({date: "2026-11-06", available: 0, allocated: 0},
                    {date: "2026-11-07", available: 0, allocated: 0});
            }
            for (const view of ["hour", "day", "week", "month"]) {
                p.viewMode = view;
                LoadSchedule(p);
                const weekend = shades("M:100").find(node => node.dataset.date === "2026-11-07");
                assert(weekend.classList.contains("cf-nonworking-weekend") &&
                    getComputedStyle(weekend).backgroundColor === "rgb(248, 251, 254)",
                    "Non-working weekend must use very pale blue");
                assert(!shades("M:100").find(node => node.dataset.date === "2026-11-06")
                    .classList.contains("cf-nonworking-weekend"), "Weekday incorrectly uses weekend colour");
            }
            return { views: 4, offWhite: true, calendarBased: true, directParentCalendar: true, hiddenDays: true, missingCalendar: true };
        } finally {
            fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertHourlyCapacity = function () {
        const original = structuredClone(fixture.payload);
        const p = structuredClone(original);
        const originalSearch = document.querySelector(".cf-search input")?.value || "";
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        try {
            p.viewMode = "hour";
            fixture.payload = p;
            LoadSchedule(p);
            const fills = () => [...document.querySelectorAll('[data-resource="M:100"] .cf-hour-load')];
            const starts = fills().map(node => node.dataset.start);
            assert(starts.length === 6, "Hourly fill must use only hours with allocated work");
            assert(!starts.includes("2026-11-03T15:00:00"), "An empty hour received daily capacity fill");
            assert(starts.includes("2026-11-04T09:00:00"), "A timed allocation is missing");
            const full = fills().find(node => node.dataset.start === "2026-11-04T09:00:00");
            assert(getComputedStyle(full.querySelector(".cf-capacity-meter"), "::after").backgroundColor === "rgb(244, 202, 202)",
                "100% hourly capacity must use solid light red");
            const overloaded = fills().find(node => node.dataset.start === "2026-11-03T09:00:00");
            assert(getComputedStyle(overloaded.querySelector(".cf-capacity-meter"), "::after").backgroundImage.includes("repeating-linear-gradient"),
                "Overloaded hourly capacity must use stripes");
            assert(!document.querySelector(".cf-hour-capacity-percent") &&
                !document.querySelector('[data-resource="M:100"] .cf-capacity-percent'),
                "Hour view must not show percentage labels");
            const hourlyHover = document.querySelector('[data-resource="M:100"] .cf-hour-capacity-tooltip[data-start="2026-11-03T09:00:00"]');
            assert(hourlyHover.title.includes("250%") && hourlyHover.textContent === "",
                "Hourly percentage must appear only in the hover tooltip");
            const emptyHover = document.querySelector('[data-resource="M:100"] .cf-hour-capacity-tooltip[data-start="2026-11-03T15:00:00"]');
            assert(emptyHover.title.includes("0%"), "Empty working hours must have a utilisation tooltip");
            const search = document.querySelector(".cf-search input");
            search.value = "NO MATCH";
            search.dispatchEvent(new Event("input"));
            assert(document.querySelectorAll(".cf-operation").length === 0, "Search did not hide operations");
            assert(JSON.stringify(fills().map(node => node.dataset.start)) === JSON.stringify(starts),
                "Filtering operations changed occupied hourly capacity");
            p.viewMode = "day";
            LoadSchedule(p);
            assert(!document.querySelector(".cf-hour-load"), "Day view must retain daily fills");
            return { timedHourlyFill: true, emptyHoursUnfilled: true, filtersPreserveLoad: true, dayViewUnchanged: true };
        } finally {
            const search = document.querySelector(".cf-search input");
            if (search) {
                search.value = originalSearch;
                search.dispatchEvent(new Event("input"));
            }
            fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertWorkingPortions = async function () {
        const original = structuredClone(fixture.payload);
        const p = structuredClone(original);
        const core = CFSchedulerCore;
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const bars = id => [...document.querySelectorAll(".cf-operation")].filter(node => node.dataset.operation === id);
        const settle = async () => {
            for (let attempt = 0; document.getElementById("controlAddIn").getAttribute("aria-busy") === "true"; attempt++) {
                if (attempt === 100) throw new Error("Split operation bridge did not settle");
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        };
        p.start = "2027-10-01T00:00:00";
        p.end = "2027-10-05T00:00:00";
        p.navigation = {...p.navigation, start: p.start, viewDays: 4, offset: 0};
        for (const resource of p.resources) {
            resource.windows = [
                {start: "2027-10-01T08:00:00", end: "2027-10-01T16:00:00", minutes: 480},
                {start: "2027-10-04T08:00:00", end: "2027-10-04T16:00:00", minutes: 480}
            ];
            resource.days = Array.from({length: 4}, (_, index) => ({
                date: core.formatCivil(core.parseCivil(p.start) + index * core.day).slice(0, 10),
                available: resource.direct || index === 1 || index === 2 ? 0 : 480,
                allocated: index === 0 ? 15 : index === 3 ? 4 : 0
            }));
        }
        const a = {...p.operations[0], start: "2027-10-01T15:45:00", end: "2027-10-04T08:04:00",
            predecessors: [], successors: ["op-next"], nextOperation: "40"};
        const b = {...a, id: "op-next", operation: "40", start: "2027-10-04T08:04:00",
            end: "2027-10-04T08:30:00", predecessors: [a.id], successors: [], previousOperation: "10"};
        p.operations = [a, b];
        const before = JSON.stringify(p.operations);
        try {
            for (const view of ["hour", "day", "week", "month"]) {
                for (const hideWeekends of [false, true]) {
                    for (const exclude of [false, true]) {
                        Object.assign(p, {viewMode: view, hideWeekends, excludeNonWorkingHours: exclude});
                        fixture.payload = p;
                        LoadSchedule(p);
                        assert(bars(a.id).length === (exclude ? 2 : 1), "Incorrect working-portion count");
                        assert(bars(a.id).every(node => node.style.top === bars(a.id)[0].style.top),
                            "Fragments of the same operation occupy different tracks");
                    }
                }
            }
            assert(JSON.stringify(p.operations) === before, "Display option changed operation dates");
            p.viewMode = "hour";
            p.excludeNonWorkingHours = true;
            LoadSchedule(p);
            bars(a.id)[1].click();
            await settle();
            assert(bars(a.id).every(node => node.classList.contains("cf-selected")),
                "Selecting a fragment did not select the whole operation");
            const path = document.querySelector(".cf-routing-link");
            assert(path, "Split operation lost its routing link");
            const from = bars(a.id).at(-1).getBoundingClientRect();
            const to = bars(b.id)[0].getBoundingClientRect();
            const grid = document.querySelector(".cf-grid").getBoundingClientRect();
            const first = path.getPointAtLength(0);
            const last = path.getPointAtLength(path.getTotalLength());
            assert(Math.abs(first.x - (from.right - grid.left)) < 0.2 && Math.abs(last.x - (to.left - grid.left)) < 0.2,
                "Routing link does not connect last-to-first fragments");
            const node = bars(a.id)[1];
            const originalCapture = [node.setPointerCapture, node.hasPointerCapture, node.releasePointerCapture];
            node.setPointerCapture = () => {};
            node.hasPointerCapture = () => false;
            node.releasePointerCapture = () => {};
            const requestsBefore = fixture.calls.filter(call => call.name === "OperationStartChangeRequested").length;
            const x = node.getBoundingClientRect().left + 3;
            try {
                node.dispatchEvent(new PointerEvent("pointerdown", {pointerId: 99, isPrimary: true, button: 0, clientX: x, bubbles: true}));
                node.dispatchEvent(new PointerEvent("pointermove", {pointerId: 99, isPrimary: true, clientX: x + 20, bubbles: true}));
                assert(bars(a.id).every(part => part.classList.contains("cf-dragging") && part.style.transform),
                    "Dragging one fragment did not preview the whole operation");
                document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
                assert(bars(a.id).every(part => !part.classList.contains("cf-dragging") && !part.style.transform),
                    "Cancel left a translated fragment");
            } finally {
                [node.setPointerCapture, node.hasPointerCapture, node.releasePointerCapture] = originalCapture;
            }
            assert(fixture.calls.filter(call => call.name === "OperationStartChangeRequested").length === requestsBefore,
                "Cancelled fragment drag sent a request");
            const axis = core.timeAxis(p.viewMode, core.parseCivil(p.start), core.parseCivil(p.end), undefined,
                core.visibleDates(p.resources, core.parseCivil(p.start), core.parseCivil(p.end), p.hideNonWorkingDays, p.hideWeekends));
            const expected = core.draggedAxisStart(axis, core.parseCivil(a.start), -30, node.closest(".cf-lane").getBoundingClientRect().width);
            node.setPointerCapture = () => {};
            node.hasPointerCapture = () => false;
            node.releasePointerCapture = () => {};
            try {
                for (const [type, dx] of [["pointerdown", 0], ["pointermove", -30], ["pointerup", -30]]) {
                    node.dispatchEvent(new PointerEvent(type, {pointerId: 100, isPrimary: true, button: 0, clientX: x + dx, bubbles: true}));
                }
                await settle();
                const request = fixture.calls.filter(call => call.name === "OperationStartChangeRequested").at(-1);
                assert(request && request.args[0] === a.id && request.args[2] === expected,
                    "Dragging final fragment did not move the original operation start");
            } finally {
                [node.setPointerCapture, node.hasPointerCapture, node.releasePointerCapture] = originalCapture;
            }
            p.resources.find(resource => resource.id === a.resource).windows = [];
            LoadSchedule(p);
            assert(bars(a.id).length === 1 && bars(a.id)[0].classList.contains("cf-no-working-portion") &&
                !bars(a.id)[0].classList.contains("cf-editable"), "Missing calendar silently fabricated a duration");
            bars(a.id)[0].dispatchEvent(new PointerEvent("pointerenter", {pointerType: "mouse"}));
            assert(document.querySelector("[role=tooltip]").textContent.includes(labels.noWorkingPortion),
                "Missing-calendar marker lacks an explanation");
            return {views: 4, modes: 2, weekendModes: 2, routingEndpoints: true, fragmentDrag: true, fragmentDragCancellation: true,
                viewport: [innerWidth, innerHeight]};
        } finally {
            fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertGridLines = function () {
        const original = structuredClone(fixture.payload);
        const p = structuredClone(original);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        p.start = "2026-10-28T00:00:00";
        p.end = "2026-11-10T00:00:00";
        p.navigation = {...p.navigation, start: p.start, viewDays: 13, offset: 0};
        const core = CFSchedulerCore;
        for (const resource of p.resources) {
            resource.name += " with a long resource name to exercise different row heights";
            resource.days = Array.from({length: 13}, (_, index) => ({
                date: core.formatCivil(core.parseCivil(p.start) + index * core.day).slice(0, 10),
                available: resource.direct || index % 4 === 0 ? 0 : 480,
                allocated: index % 3 === 0 ? 600 : 120
            }));
        }
        let cases = 0;
        const aligned = () => {
            const grid = document.querySelector(".cf-grid");
            const overlay = grid.querySelector(".cf-grid-lines");
            const lines = [...overlay.children];
            const ticks = [...grid.querySelectorAll(".cf-date-ticks .cf-date")];
            assert(lines.length === ticks.length, "Grid has a different boundary count from date headers");
            const bounds = overlay.getBoundingClientRect();
            const gridBounds = grid.getBoundingClientRect();
            assert(Math.abs(bounds.height - gridBounds.height) < 0.1, "Grid lines do not span every row");
            assert(getComputedStyle(overlay).pointerEvents === "none", "Grid lines block operation gestures");
            for (let index = 0; index < lines.length; index++) {
                const line = lines[index].getBoundingClientRect();
                const tick = ticks[index].getBoundingClientRect();
                assert(Math.abs(line.right - tick.right) < 0.1, `Boundary ${index} drifts from its header`);
                assert(Math.abs(line.top - bounds.top) < 0.1 && Math.abs(line.bottom - bounds.bottom) < 0.1,
                    "A vertical boundary does not run straight through all rows");
            }
            const days = [...grid.querySelectorAll('[data-unit="day"] .cf-date')];
            for (const timeline of grid.querySelectorAll(".cf-timeline")) {
                for (const [index, cell] of [...timeline.querySelectorAll(".cf-capacity-day")].entries()) {
                    assert(Math.abs(cell.getBoundingClientRect().right - days[index].getBoundingClientRect().right) < 0.1,
                        "Daily capacity box is offset from the header");
                }
            }
            assert(!grid.style.getPropertyValue("--cf-grid-lines"), "Repeating per-lane gradient still exists");
        };
        try {
            for (const view of ["hour", "day", "week", "month"]) {
                for (const fit of [false, true]) {
                    for (const [weekends, nonWorking] of [[false,false],[true,false],[false,true],[true,true]]) {
                        Object.assign(p, {viewMode: view, fitToWindow: fit, hideWeekends: weekends, hideNonWorkingDays: nonWorking});
                        fixture.payload = p;
                        LoadSchedule(p);
                        aligned();
                        const board = document.querySelector(".cf-board");
                        board.scrollLeft = board.scrollWidth / 3;
                        aligned();
                        document.querySelector(".cf-summary button").click();
                        aligned();
                        document.querySelector(".cf-summary button").click();
                        aligned();
                        cases++;
                    }
                }
            }
            return {cases, scrolledAndCollapsed: true, viewport: [innerWidth, innerHeight]};
        } finally {
            fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertWeekends = function () {
        const original = structuredClone(fixture.payload);
        const p = structuredClone(original);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        p.start = "2026-11-06T00:00:00";
        p.end = "2026-11-10T00:00:00";
        p.navigation = {...p.navigation, start: p.start, viewDays: 4, offset: 0};
        for (const resource of p.resources) {
            resource.days = ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]
                .map((date, index) => ({date, available: resource.direct || index === 3 ? 0 : 480, allocated: index === 1 ? 60 : 0}));
            resource.windows = [];
        }
        p.operations = [{...p.operations[0], start: "2026-11-07T08:00:00", end: "2026-11-07T09:00:00"}];
        const before = JSON.stringify(p.operations);
        try {
            for (const view of ["hour", "day", "week", "month"]) {
                p.viewMode = view;
                for (const [weekends, nonWorking, count] of [[false,false,4],[true,false,2],[true,true,1],[false,true,3]]) {
                    p.hideWeekends = weekends;
                    p.hideNonWorkingDays = nonWorking;
                    fixture.payload = p;
                    LoadSchedule(p);
                    assert(document.querySelectorAll('[data-unit="day"] .cf-date').length === count, "Weekend filters do not compose");
                    assert(Boolean(document.querySelector('.cf-operation[data-operation="op-a"]')) === !weekends,
                        "Scheduled weekend operation is incorrectly shown or lost after restoring weekends");
                    assert(!document.querySelector(".cf-pending-item"), "Hidden weekend operation returned to unscheduled");
                    if (weekends) assert(document.querySelector(".cf-nonworking-scope").textContent.includes("1 matching operations"),
                        "Hidden weekend operation lacks notice");
                    assert(document.querySelectorAll('[data-resource="M:100"] .cf-day-load').length === count,
                        "Weekend capacity shading is misaligned");
                }
            }
            p.start = "2026-11-07T00:00:00";
            p.end = "2026-11-09T00:00:00";
            p.navigation = {...p.navigation, start: p.start, viewDays: 2};
            for (const resource of p.resources) resource.days = resource.days.slice(1, 3);
            p.hideWeekends = true;
            p.hideNonWorkingDays = false;
            LoadSchedule(p);
            assert(document.querySelector(".cf-empty-calendar") && !document.querySelector(".cf-operation"),
                "Weekend-only window does not show the empty-calendar notice");
            assert(JSON.stringify(p.operations) === before, "Weekend filtering modified scheduled dates");
            return {views: 4,combinations: 4, weekendOnly: true, viewport: [innerWidth, innerHeight]};
        } finally {
            fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertCapacityFill = function () {
        const original = structuredClone(window.fixture.payload);
        const p = structuredClone(original);
        for (const resource of p.resources) resource.days = resource.days.map(day => ({...day}));
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const machine = p.resources.find(resource => resource.id === "M:100");
        const parent = p.resources.find(resource => resource.id === "W:100");
        const direct = p.resources.find(resource => resource.id === "D:100");
        const before = JSON.stringify(p.operations);
        try {
            for (const view of ["day", "week", "month"]) {
                p.viewMode = view;
                for (const [available, allocated, percent, overloaded] of [
                    [100, 0, 0, false], [100, 20, 20, false], [100, 50, 50, false], [100, 80, 80, false], [100, 100, 100, false],
                    [100, 125, 100, true], [0, 0, 0, false], [0, 10, 100, true]
                ]) {
                    Object.assign(machine.days[0], {available, allocated});
                    parent.days[0].available = 100;
                    direct.days[0].allocated = 80;
                    window.fixture.payload = p;
                    LoadSchedule(p);
                    const timeline = document.querySelector('[data-resource="M:100"]');
                    const cell = timeline.querySelector('.cf-capacity-day');
                    const shading = timeline.querySelector('.cf-day-load');
                    for (const node of [cell, shading]) {
                        assert(parseFloat(node.style.getPropertyValue("--cf-load-fill")) === percent, "Incorrect capacity fill percentage");
                        assert(node.classList.contains("cf-loaded") === (allocated > 0), "Empty day has utilisation shading");
                        assert(node.classList.contains("cf-overload") === overloaded, "Incorrect overload colouring");
                        const style = getComputedStyle(node);
                        if (node === cell) assert(style.backgroundColor === "rgba(0, 0, 0, 0)" && style.backgroundImage === "none",
                            "Capacity numbers must not restart or obscure the continuous fill");
                        else {
                            assert(style.backgroundImage === "none", "Capacity meter must not tint the whole cell");
                            const meter = node.querySelector(".cf-capacity-meter");
                            const meterFill = getComputedStyle(meter, "::after");
                            assert(Math.abs(parseFloat(meterFill.width) -
                                meter.getBoundingClientRect().width * percent / 100) < 1,
                                "Meter width does not match utilisation");
                            if (overloaded) assert(meterFill.backgroundImage.includes("repeating-linear-gradient"),
                                "Overloaded capacity must use red stripes");
                            else if (allocated === available && available > 0) assert(meterFill.backgroundColor === "rgb(244, 202, 202)",
                                "100% capacity must use solid light red");
                            else assert(meterFill.backgroundColor === "rgb(120, 155, 145)",
                                "Normal capacity must use muted green");
                        }
                    }
                    const dayHeader = document.querySelector('[data-unit="day"] .cf-date').getBoundingClientRect();
                    const capacityRect = cell.getBoundingClientRect();
                    const shadeRect = shading.getBoundingClientRect();
                    const timelineRect = timeline.getBoundingClientRect();
                    const percentage = cell.querySelector(".cf-capacity-percent");
                    assert(available > 0 ? percentage?.textContent === `${Math.round(allocated / available * 100)}%` : !percentage,
                        "Top percentage must show actual utilisation, not clamp overload to 100%");
                    if (view !== "month" && percentage) assert(Math.abs(percentage.getBoundingClientRect().top - cell.getBoundingClientRect().top - 5) < 1,
                        "Percentage is not at the top of the cell");
                    assert(Math.abs(shadeRect.top - timelineRect.top) < 0.1 &&
                        Math.abs(shadeRect.bottom - timelineRect.bottom) < 0.1 &&
                        timeline.querySelectorAll(".cf-load-background").length === 1,
                        "Daily fill must cover the entire resource box once, without restarting at the capacity strip");
                    assert(timeline.querySelector(".cf-load-background").parentElement === timeline,
                        "Capacity fill is incorrectly scoped to the operation lane");
                    for (const resourceTimeline of document.querySelectorAll(".cf-row:not(.cf-unscheduled-row) .cf-timeline")) {
                        const resourceRect = resourceTimeline.getBoundingClientRect();
                        const fillRect = resourceTimeline.querySelector(".cf-day-load").getBoundingClientRect();
                        assert(Math.abs(resourceRect.top - fillRect.top) < 0.1 && Math.abs(resourceRect.bottom - fillRect.bottom) < 0.1,
                            "Summary or direct resource fill does not cover its complete box");
                    }
                    assert(Math.abs(dayHeader.left - shadeRect.left) < 1 && Math.abs(capacityRect.width - shadeRect.width) < 1,
                        "Daily fill is not aligned with capacity and date headers");
                    for (const layer of timeline.querySelectorAll(".cf-lane, .cf-capacity")) {
                        assert(getComputedStyle(layer).backgroundColor === "rgba(0, 0, 0, 0)",
                            "A foreground layer creates a white gap in the capacity fill");
                    }
                    assert(!document.querySelector(".cf-working, .cf-no-capacity"), "Legacy non-working backgrounds remain");
                    const directShade = document.querySelector('[data-resource="D:100"] .cf-day-load');
                    assert(directShade.style.getPropertyValue("--cf-load-fill") === "80%" &&
                        !directShade.classList.contains("cf-overload"), "Direct load does not use parent availability");
                    const empty = timeline.querySelectorAll(".cf-day-load")[2];
                    assert(!empty.classList.contains("cf-loaded") && !empty.classList.contains("cf-overload"),
                        "Empty non-working day is shaded");
                }
                const label = document.querySelector('[data-resource="M:100"]').parentElement.querySelector(".cf-resource-label");
                label.textContent = "Long resource description ".repeat(80);
                const tallTimeline = document.querySelector('[data-resource="M:100"]');
                const tallRect = tallTimeline.getBoundingClientRect();
                const tallShade = tallTimeline.querySelector(".cf-day-load").getBoundingClientRect();
                assert(Math.abs(tallRect.top - tallShade.top) < 0.1 && Math.abs(tallRect.bottom - tallShade.bottom) < 0.1,
                    "A tall resource label creates an unfilled gap below the lane");
            }
            p.showSearch = true;
            machine.days[0].available = 100;
            machine.days[0].allocated = 80;
            LoadSchedule(p);
            const input = document.querySelector(".cf-search input");
            input.value = "NO MATCH";
            input.dispatchEvent(new Event("input"));
            assert(document.querySelector('[data-resource="M:100"] .cf-day-load').style.getPropertyValue("--cf-load-fill") === "80%",
                "Text search changed capacity fill");
            input.value = "";
            input.dispatchEvent(new Event("input"));
            p.hideNonWorkingDays = true;
            for (const view of ["day", "week", "month"]) {
                p.viewMode = view;
                LoadSchedule(p);
                const timeline = document.querySelector('[data-resource="M:100"]');
                const shades = timeline.querySelectorAll(".cf-day-load");
                const cells = timeline.querySelectorAll(".cf-capacity-day");
                assert(shades.length === 2 && cells.length === 2, "Compressed axis retained a hidden day's fill");
                for (let index = 0; index < shades.length; index++) {
                    assert(shades[index].dataset.date === cells[index].dataset.date &&
                        Math.abs(shades[index].getBoundingClientRect().left - cells[index].getBoundingClientRect().left) < 1 &&
                        Math.abs(shades[index].getBoundingClientRect().width - cells[index].getBoundingClientRect().width) < 1,
                        "Compressed utilisation fill drifted from its day");
                }
            }
            assert(JSON.stringify(p.operations) === before, "Capacity styling modified routing data");
            return {views: 3, casesPerView: 8, compressedViews: 3, continuousFullRowFill: true, tallResourceLabel: true, directParentCapacity: true, searchIndependent: true,
                viewport: [innerWidth, innerHeight]};
        } finally {
            window.fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertCompactDisplay = async function () {
        const original = structuredClone(window.fixture.payload);
        const p = structuredClone(original);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const visible = selector => document.querySelector(selector).getBoundingClientRect().height > 0;
        const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const load = async () => {
            window.fixture.payload = p;
            LoadSchedule(p);
            await settle();
        };
        try {
            p.showSearch = p.showDisplayRange = p.showStepDetails = true;
            await load();
            const fullHeight = document.querySelector(".cf-board").clientHeight;
            assert(!document.querySelector(".cf-heading h1"), "Control add-in duplicates the Business Central page title");
            assert(document.querySelector(".cf-scenario").textContent.includes(p.scenario) &&
                document.querySelectorAll(".cf-zoom button").length === 4,
                "Removing the duplicate title removed scenario or date-view controls");
            assert(document.querySelector(".cf-board").getAttribute("aria-label") === p.labels.title,
                "Scheduler region lost its accessible name");
            const input = document.querySelector(".cf-search input");
            input.value = "NO MATCH";
            input.dispatchEvent(new Event("input"));
            assert(!document.querySelector(".cf-unscheduled-row"), "A filter with no unscheduled operations uses space");
            delete p.showSearch;
            delete p.showDisplayRange;
            delete p.showStepDetails;
            await load();
            assert(!visible(".cf-search") && !visible(".cf-navigation") && !visible(".cf-details"),
                "Optional panels are not hidden by default");
            assert(visible(".cf-unscheduled-row") &&
                document.querySelectorAll(".cf-operation").length === 3,
                "Unscheduled steps are not displayed under their work centre");
            assert(!document.querySelector(".cf-legend") && !document.body.innerText.includes(p.scope) &&
                !document.body.innerText.includes(p.timeZone) && !visible(".cf-drop-help"),
                "Static instructions still occupy the main window");
            assert(document.querySelector(".cf-routing-scope").classList.contains("cf-visually-hidden"),
                "Routing summary still occupies layout space");
            const compactHeight = document.querySelector(".cf-board").clientHeight;
            if (innerHeight >= 600) assert(compactHeight > fullHeight + 100, "Compact mode did not reclaim timeline height");
            for (const showSearch of [false, true]) {
                for (const showDisplayRange of [false, true]) {
                    for (const showStepDetails of [false, true]) {
                        Object.assign(p, {showSearch, showDisplayRange, showStepDetails});
                        await load();
                        assert(visible(".cf-search") === showSearch && visible(".cf-navigation") === showDisplayRange &&
                            visible(".cf-details") === showStepDetails, "Display switches are not independent");
                    }
                }
            }
            p.showSearch = p.showDisplayRange = p.showStepDetails = false;
            p.operations = p.operations.filter(item => item.confirmed || item.finished);
            await load();
            if (p.scenario) {
                SelectOperations("clear");
                assert(!visible(".cf-selection"), "Selection toolbar uses compact space without a selection or status");
            }
            assert(!document.querySelector(".cf-unscheduled-row"), "Empty unscheduled rows are not hidden");
            p.operations.push({...original.operations.find(item => item.id === "op-p")});
            p.hideUnscheduled = true;
            await load();
            assert(!document.querySelector(".cf-unscheduled-row"), "Hide Unscheduled did not remove the category row");
            p.hideUnscheduled = false;
            await load();
            assert(document.querySelector(".cf-unscheduled-row"), "Show Unscheduled did not restore the category row");
            p.operations = p.operations.filter(item => item.confirmed || item.finished);
            await load();
            assert(document.querySelector(".cf-board").clientHeight >= innerHeight * 0.70,
                "Empty compact view does not fill at least 70% of the window");
            const bar = document.querySelector('.cf-operation[data-operation="op-a"]');
            bar.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true, clientX: 20, clientY: 20}));
            assert(document.querySelectorAll(".cf-context-menu button").length === 7 && !visible(".cf-details"),
                "Context actions require the optional bottom details panel");
            for (let attempt = 0; document.getElementById("controlAddIn").getAttribute("aria-busy") === "true"; attempt++) {
                if (attempt === 100) throw new Error("Context selection bridge did not settle");
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            p.warnings = ["Capacity test warning"];
            await load();
            assert(visible(".cf-banner") && document.querySelector(".cf-banner").textContent.includes(p.warnings[0]),
                "Compact display hid a warning");
            ShowError("Scheduling test error");
            assert(visible(".cf-banner") && document.querySelector(".cf-banner").textContent === "Scheduling test error",
                "Compact display hid an error");
            return {defaultsHidden: true, combinations: 8, emptyUnscheduledHidden: true,
                fullHeight, compactHeight, viewport: [innerWidth, innerHeight]};
        } finally {
            window.fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertMoveViewport = async function () {
        const original = structuredClone(fixture.payload);
        const p = structuredClone(original);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const settle = async () => {
            for (let attempt = 0; document.getElementById("controlAddIn").getAttribute("aria-busy") === "true"; attempt++) {
                if (attempt === 100) throw new Error("Viewport move bridge did not settle");
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        };
        try {
            Object.assign(p, {viewMode: "hour", fitToWindow: false, showSearch: false,
                showDisplayRange: false, showStepDetails: false});
            const machine = p.resources.find(resource => resource.id === "M:100");
            p.resources.splice(2, 0, ...Array.from({length: 24}, (_, index) =>
                ({...structuredClone(machine), id: `M:extra-${index}`, name: `Additional machine ${index}`})));
            p.operations[0].start = "2026-11-04T10:00:00";
            p.operations[0].end = "2026-11-04T12:00:00";
            fixture.payload = p;
            LoadSchedule(p);
            let board = document.querySelector(".cf-board");
            let node = document.querySelector('.cf-operation[data-operation="op-a"]');
            node.click();
            await settle();
            board = document.querySelector(".cf-board");
            node = document.querySelector('.cf-operation[data-operation="op-a"]');
            const boardRect = board.getBoundingClientRect();
            const barRect = node.getBoundingClientRect();
            board.scrollLeft = barRect.left - boardRect.left - 280;
            board.scrollTop = barRect.top - boardRect.top - 180;
            const before = {left: board.scrollLeft, top: board.scrollTop};
            assert(before.left > 0 && before.top > 0, "Viewport regression requires scrolling in both directions");
            node.focus({preventScroll: true});
            node.setPointerCapture = () => {};
            node.hasPointerCapture = () => false;
            node.releasePointerCapture = () => {};
            const origin = node.getBoundingClientRect().left + 5;
            const version = p.operations[0].version;
            for (const [type, delta] of [["pointerdown", 0], ["pointermove", 30], ["pointerup", 30]]) {
                node.dispatchEvent(new PointerEvent(type, {pointerId: 71, isPrimary: true, button: 0,
                    clientX: origin + delta, bubbles: true, cancelable: true}));
            }
            await settle();
            board = document.querySelector(".cf-board");
            node = document.querySelector('.cf-operation[data-operation="op-a"]');
            assert(p.operations[0].version !== version, "Viewport regression did not actually move the operation");
            assert(Math.abs(board.scrollLeft - before.left) < 1 && Math.abs(board.scrollTop - before.top) < 1,
                "Accepted move reset the horizontal or vertical viewport");
            assert(node.classList.contains("cf-selected") && document.activeElement === node,
                "Accepted move lost the selected operation or keyboard focus");
            assert(node.getBoundingClientRect().left >= board.getBoundingClientRect().left + 240 &&
                node.getBoundingClientRect().right <= board.getBoundingClientRect().right,
                "Moved operation is no longer visible");
            board.focus({preventScroll: true});
            LoadSchedule(structuredClone(p));
            assert(document.activeElement === document.querySelector(".cf-board") &&
                Math.abs(document.querySelector(".cf-board").scrollLeft - before.left) < 1,
                "Ordinary refresh lost board focus or scroll position");
            p.viewMode = "day";
            LoadSchedule(p);
            assert(document.querySelector(".cf-board").scrollLeft === 0, "Changing the time scale incorrectly retained old pixel scroll");
            return {acceptedMove: true, horizontalAndVerticalScroll: true, selectionAndFocus: true,
                refresh: true, viewChangeReset: true, viewport: [innerWidth, innerHeight]};
        } finally {
            fixture.payload = original;
            LoadSchedule(original);
        }
    };
    window.fixture.assertPlacementAndDrag = async function () {
        const original = structuredClone(window.fixture.payload);
        const originalDelay = fixture.saveDelay;
        fixture.saveDelay = 300;
        const p = structuredClone(original);
        const baseline = JSON.stringify(window.fixture.bcOperations);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const bar = id => document.querySelector(`.cf-operation[data-operation="${id}"]`);
        const pending = id => document.querySelector(`.cf-pending-item[data-operation="${id}"]`);
        const requests = () => window.fixture.calls.filter(call => call.name === "OperationStartChangeRequested");
        const core = CFSchedulerCore;
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
                    assert(pending("op-p").closest(".cf-unscheduled-row") &&
                        pending("op-p").closest(".cf-unscheduled-row").previousElementSibling.querySelector(".cf-resource-name").textContent ===
                            p.resources[0].name,
                        "Unscheduled work is not grouped beneath its work-centre category");
                    assert(bar("op-a") && !pending("op-a"), "Scheduled step must appear only on the timeline");
                    const axis = CFSchedulerCore.timeAxis(view, CFSchedulerCore.parseCivil(p.start),
                        CFSchedulerCore.parseCivil(p.end));
                    assert(Math.abs(Number(pending("op-p").style.width.match(/([\d.]+)%/)[1]) -
                        p.operations.find(item => item.id === "op-p").workMinutes * CFSchedulerCore.minute / axis.duration * 100) < 0.00001,
                        "Unscheduled operation width does not represent its work duration");
                    disjoint();
                }
            }
            assert(JSON.stringify(p.operations) === unchanged, "Display placement modified the stored schedule");
            p.viewMode = "hour";
            p.documentFocus = false;
            LoadSchedule(p);
            const hourAxis = core.timeAxis("hour", core.parseCivil(p.start), core.parseCivil(p.end));
            const machineRow = document.querySelector('[data-resource="M:100"]');
            const shades = [...machineRow.querySelectorAll(".cf-nonworking-interval")];
            assert(shades.length === 5, "Hour view did not shade calendar gaps and the non-working day");
            const expectedShades = core.nonWorkingSegments(hourAxis, p.resources.find(resource => resource.id === "M:100").windows);
            assert(shades.every((shade, index) =>
                Math.abs(parseFloat(shade.style.left) - expectedShades[index].left) < 0.0001 &&
                Math.abs(parseFloat(shade.style.width) - expectedShades[index].width) < 0.0001),
                "Per-resource non-working shading does not match calendar windows");
            const headerColor = getComputedStyle(document.querySelector('.cf-date-columns[data-unit="hour"]')).backgroundColor;
            assert(shades.every(shade => getComputedStyle(shade).backgroundColor === headerColor),
                "Non-working shading does not match the Hour header color");
            const machine = p.resources.find(resource => resource.id === "M:100");
            machine.missingCalendar = true;
            LoadSchedule(p);
            assert(!document.querySelector('[data-resource="M:100"] .cf-nonworking-interval'),
                "A missing calendar was incorrectly rendered as non-working time");
            delete machine.missingCalendar;
            LoadSchedule(p);
            await settle();
            let lane = document.querySelector('[data-resource="M:100"] .cf-lane');
            let rect = lane.getBoundingClientRect();
            const axis = core.timeAxis("hour", core.parseCivil(p.start), core.parseCivil(p.end));
            const x = rect.left + core.axisPosition(axis, core.parseCivil("2026-11-03T09:30:00")) / axis.duration * rect.width;
            const transfer = new DataTransfer();
            pending("op-p").dispatchEvent(new DragEvent("dragstart", {dataTransfer: transfer, bubbles: true, cancelable: true}));
            lane.dispatchEvent(new DragEvent("dragover", {dataTransfer: transfer, clientX: x, clientY: rect.top + 10, bubbles: true, cancelable: true}));
            assert(document.querySelector(".cf-drag-dates").textContent.includes("Requested start: 2026-11-03 09:30:00") &&
                document.querySelector(".cf-drag-dates").textContent.includes("Estimated finish"),
                "Unscheduled drag omitted live requested start and estimated finish");
            assert(document.querySelector(".cf-required-due")?.textContent.includes("2026-11-04 24:00"),
                "Selected order required due date was not shown during drag");
            lane.dispatchEvent(new DragEvent("drop", {dataTransfer: transfer, clientX: x, bubbles: true, cancelable: true}));
            assert(pending("op-p") && !bar("op-p"), "The step moved before AL accepted the drop");
            assert(lane.querySelector(".cf-saving-position") &&
                document.getElementById("controlAddIn").getAttribute("aria-busy") === "true",
                "Drop preview disappeared before AL accepted the change");
            const previewBounds = lane.querySelector(".cf-saving-position").getBoundingClientRect();
            assert(previewBounds.bottom <= lane.getBoundingClientRect().bottom + 0.1,
                "Pending drop preview is clipped by its lane");
            assert(document.querySelector(".cf-drag-finish span").getBoundingClientRect().top >= previewBounds.bottom,
                "Estimated finish label covers the pending operation instead of sitting below it");
            await new Promise(resolve => setTimeout(resolve, 100));
            assert(lane.querySelector(".cf-saving-position") &&
                lane.querySelector(".cf-saving-position").getBoundingClientRect().bottom <= lane.getBoundingClientRect().bottom + 0.1,
                "Resize processing removed or clipped the pending drop preview");
            await settle();
            assert(!pending("op-p") && bar("op-p"), "Successful drop did not transfer the step to the timeline");
            assert(!document.querySelector(".cf-saving-position"), "Successful drop retained a pending preview");
            assert(!document.querySelector(".cf-drag-dates"), "Successful drop retained live drag dates");
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
            assert(document.querySelector(".cf-drag-dates")?.textContent.includes("Estimated finish"),
                "Timeline drag omitted its live date labels");
            pointer(node, "pointerup", origin + delta);
            assert(p.operations[0].start === start, "Timeline drag optimistically changed the stored start");
            assert(node.classList.contains("cf-saving-position") && node.style.transform !== "",
                "Timeline drag snapped back before the save response");
            await new Promise(resolve => setTimeout(resolve, 100));
            assert(node.classList.contains("cf-saving-position") && node.style.transform !== "" &&
                p.operations[0].start === start, "Delayed save withdrew the pending move or changed stored dates");
            await settle();
            assert(!document.querySelector(".cf-saving-position"), "Accepted move retained a pending transform");
            const expected = core.draggedAxisStart(axis, core.parseCivil(start), delta, rect.width);
            assert(requests().length === count + 1 &&
                JSON.stringify(requests().at(-1).args) === JSON.stringify(["op-a", version, expected]),
                "Timeline drag did not send exactly one versioned start change");
            assert(p.operations[0].start === expected && !pending("op-a") &&
                JSON.stringify(p.operations.slice(1).map(item => [item.id, item.start, item.end])) === others,
                "Client dragged a group instead of the selected step");
            disjoint();
            node = bar("op-a");
            preparePointer(node);
            const failedStart = p.operations[0].start;
            fixture.failNext = true;
            pointer(node, "pointerdown", origin);
            pointer(node, "pointermove", origin + delta);
            pointer(node, "pointerup", origin + delta);
            assert(node.classList.contains("cf-saving-position"), "Failed move had no initial preview");
            await settle();
            assert(node.style.transform === "" && !node.classList.contains("cf-saving-position") &&
                p.operations[0].start === failedStart, "Failed move did not restore the original position");
            assert(!document.querySelector(".cf-drag-dates"), "Failed move retained misleading drag dates");
            assert(!document.querySelector(".cf-banner").hidden, "Failed move was not reported");
            LoadSchedule(p);
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
                assert(!document.querySelector(".cf-drag-dates"), `${cancellation} retained drag dates`);
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
            fixture.saveDelay = originalDelay;
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
        const commands = ["details", "edit", "zoom", "reset", "commit", "order", "bcRouting", "lock"];
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
                "The menu must contain exactly the six approved actions plus the position lock");
            const rect = menu.getBoundingClientRect();
            assert(rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
                "Context menu escaped the viewport");
            assert(bar().classList.contains("cf-selected"), "Right click must highlight the selected step");
            menu.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
            assert(!document.querySelector(".cf-context-menu") && document.activeElement === bar(), "Escape must restore focus");
            for (const command of commands.filter(value => value !== "lock")) {
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
            assert(document.activeElement.dataset.command === "lock", "End must focus the last menu action");
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
            for (const command of ["edit", "reset", "commit", "lock"]) {
                assert(menu.querySelector(`[data-command="${command}"]`).disabled, `${command} ignores permissions`);
            }
            for (const command of ["details", "zoom", "order", "bcRouting"]) {
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
                const axis = core.timeAxis(view, core.parseCivil(p.start), core.parseCivil(p.end));
                const header = document.querySelector(".cf-axis").getBoundingClientRect();
                const expected = header.left + core.currentTimePosition(axis, p.currentTime) / 100 * header.width;
                const markers = [...document.querySelectorAll(".cf-current-time")];
                assert(markers.every(marker => getComputedStyle(marker).borderLeftColor === "rgb(179, 157, 219)"),
                    "Current-time line must be light purple");
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
            const hourAxis = core.timeAxis("hour", core.parseCivil(p.start), core.parseCivil(p.end));
            const hourHeader = document.querySelector(".cf-axis").getBoundingClientRect();
            const hourPosition = hourHeader.left + core.currentTimePosition(hourAxis, p.currentTime) / 100 * hourHeader.width;
            assert(document.querySelector(".cf-current-time") &&
                near(document.querySelector(".cf-current-time").getBoundingClientRect().left, hourPosition),
                "A non-working hour must remain visible on the full-day Hour axis");
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
                    resource.windows = dates.map(date => ({ start: date + "T08:00:00", end: date + "T16:00:00", minutes: 480 }));
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
                .map(day => ({ start: day.date + "T08:00:00", end: day.date + "T09:00:00", minutes: day.available }));
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
                    !document.querySelector(".cf-pending-item") && document.querySelector(".cf-routing-scope").hidden,
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
            const axis = CFSchedulerCore.timeAxis("hour", CFSchedulerCore.parseCivil(p.start), CFSchedulerCore.parseCivil(p.end));
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
            const owner = document.querySelector(`[aria-describedby="${tip().id}"]`);
            const anchor = owner.getBoundingClientRect();
            assert(rect.left >= 7 && rect.top >= 7 && rect.right <= innerWidth - 7 && rect.bottom <= innerHeight - 7,
                "Tooltip escaped the iframe viewport");
            assert(rect.bottom <= anchor.top - 7 || rect.top >= anchor.bottom + 7,
                "Tooltip covers its operation instead of staying above or below");
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
            const node = bar();
            const originalStyle = node.style.cssText;
            try {
                for (const top of [12, Math.floor(innerHeight / 2), innerHeight - 45]) {
                    node.style.position = "fixed";
                    node.style.left = "250px";
                    node.style.top = `${top}px`;
                    node.style.width = "80px";
                    node.style.zIndex = "90";
                    enter(node);
                    contained();
                    const anchor = node.getBoundingClientRect();
                    const target = document.elementFromPoint(anchor.left + anchor.width / 2, anchor.top + anchor.height / 2);
                    assert(target === node || node.contains(target), "Hover box intercepts operation selection");
                }
            } finally {
                node.style.cssText = originalStyle;
            }
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
            const colours = {month: "rgb(220, 231, 244)", week: "rgb(236, 242, 249)",
                day: "rgb(248, 250, 253)", hour: "rgb(248, 250, 253)"};
            const style = getComputedStyle(row);
            if (style.backgroundColor !== colours[row.dataset.unit] || style.color !== "rgb(38, 62, 89)") {
                throw new Error("Date headers do not use the Calm Blue hierarchy.");
            }
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
            const lastPanel = [".cf-details", ".cf-navigation", ".cf-board"]
                .map(selector => root.querySelector(selector)).find(node => !node.hidden);
            near(lastPanel.getBoundingClientRect().bottom, window.innerHeight - 8, "No unused space below visible content");
        }
        return {
            viewport: [window.innerWidth, window.innerHeight],
            board: [board.clientWidth, board.clientHeight],
            horizontalScroll: board.scrollWidth > board.clientWidth + 1,
            verticalFallback: root.scrollHeight > root.clientHeight + 1
        };
    };
    window.fixture.assertSelectionLocks = async function () {
        const original = structuredClone(window.fixture.payload);
        const baseline = JSON.stringify(window.fixture.bcOperations);
        const p = structuredClone(original);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const root = document.getElementById("controlAddIn");
        const settle = async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
            for (let attempt = 0; root.getAttribute("aria-busy") === "true"; attempt++) {
                if (attempt === 100) throw new Error("Selection bridge did not settle");
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        };
        const node = id => document.querySelector(`[data-operation="${id}"]`);
        const click = (id, ctrlKey = false) => node(id).dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, ctrlKey}));
        const selected = () => [...document.querySelectorAll(".cf-multi-selected")].map(entry => entry.dataset.operation).sort();
        const count = () => document.querySelector(".cf-selection-count").textContent;
        const toolbarButton = command => document.querySelector(`.cf-selection [data-selection="${command}"]`);
        const lockCalls = () => window.fixture.calls.filter(call => call.name === "OperationsLockRequested");
        const status = () => document.querySelector(".cf-draft-status");
        const storageKey = "cf-production-scheduler:view:TEST-COMPANY:user:BASE";
        try {
            sessionStorage.removeItem(storageKey);
            const opA = p.operations.find(item => item.id === "op-a");
            const opP = p.operations.find(item => item.id === "op-p");
            opA.routingNo = opP.routingNo = "ROUTE-100";
            opA.successors = ["op-p"];
            opP.predecessors = ["op-a"];
            p.operations.push(
                {...structuredClone(opA), id: "op-r", operation: "50", routingReference: 20000, successors: [], predecessors: [],
                    start: "2026-11-04T08:00:00", end: "2026-11-04T09:00:00"},
                {...structuredClone(opA), id: "op-s", operation: "60", statusId: 2, status: "Firm Planned", successors: [], predecessors: [],
                    start: "2026-11-04T10:00:00", end: "2026-11-04T11:00:00"});
            window.fixture.payload = p;
            LoadSchedule(p);
            await settle();
            SelectOperations("clear");
            SetDraftStatus("", "");
            assert(document.querySelector(".cf-selection").hidden, "The compact toolbar stays hidden without a selection or status");
            SelectOperations("chain");
            assert(root.querySelector(".cf-banner").textContent === p.labels.noSelection, "Chain without a selection is reported");
            click("op-a");
            await settle();
            assert(!document.querySelector(".cf-selection").hidden, "Draft scenarios must show the selection toolbar");
            SelectOperations("clear");
            assert(document.querySelector(".cf-selection").getAttribute("role") === "toolbar", "Selection controls need a toolbar role");
            assert(count() === "0 selected" && toolbarButton("chain").disabled, "Selection actions need a selection");
            assert(document.querySelector(".cf-lock-selected").hidden &&
                document.querySelector(".cf-unlock-selected").hidden, "Position actions need a selection");
            click("op-a");
            await settle();
            assert(count() === "1 selected" && node("op-a").classList.contains("cf-selected"), "Plain click selects one step");
            click("op-b", true);
            await settle();
            assert(JSON.stringify(selected()) === JSON.stringify(["op-a", "op-b"]), "Ctrl+click must add to the selection");
            assert(node("op-b").classList.contains("cf-selected") && !node("op-a").classList.contains("cf-selected"),
                "The last Ctrl+clicked step is the active details step");
            assert(document.querySelector(".cf-details h3").textContent.startsWith("101002"), "Details follow the active step");
            assert(node("op-a").getAttribute("aria-pressed") === "true", "Selected set members expose aria-pressed");
            click("op-b", true);
            await settle();
            assert(JSON.stringify(selected()) === JSON.stringify(["op-a"]) && node("op-a").classList.contains("cf-selected"),
                "Ctrl+click toggles off and returns focus to the remaining step");
            SelectOperations("chain");
            assert(JSON.stringify(selected()) === JSON.stringify(["op-a", "op-p"]),
                "Routing chain uses status, order, routing reference and routing number");
            SelectOperations("clear");
            assert(count() === "0 selected" && !document.querySelector(".cf-multi-selected, .cf-selected"), "Clear selection");
            click("op-p");
            await settle();
            SelectOperations("following");
            assert(JSON.stringify(selected()) === JSON.stringify(["op-p"]), "Following steps of the last step is only itself");
            click("op-a");
            await settle();
            toolbarButton("following").click();
            assert(JSON.stringify(selected()) === JSON.stringify(["op-a", "op-p"]), "Following steps follow successors");
            SelectOperations("bogus");
            assert(!root.querySelector(".cf-banner").classList.contains("cf-error") &&
                root.querySelector(".cf-banner").textContent === p.labels.invalidSelectionCommand, "Unknown commands are reported");
            const lock = document.querySelector(".cf-lock-selected");
            assert(!lock.disabled && document.querySelector(".cf-unlock-selected").disabled, "Lock enabled only for unlocked steps");
            assert(!lock.hidden && document.querySelector(".cf-unlock-selected").hidden,
                "Unlocked selection should show only Lock Position Selected");
            const versions = [opA.version, opP.version];
            lock.click();
            assert(status().textContent === p.labels.saving && !status().hidden, "Mutation must show Saving");
            await settle();
            const call = lockCalls().at(-1);
            assert(JSON.stringify(call.args) === JSON.stringify([JSON.stringify([{id: "op-a", version: versions[0]}, {id: "op-p", version: versions[1]}]), true]),
                "Lock request sends versioned operations");
            assert(status().textContent === p.labels.saved, "Reloaded payload confirms the save");
            assert(JSON.stringify(selected()) === JSON.stringify(["op-a", "op-p"]), "Selection survives the reload");
            assert(document.querySelector(".cf-lock-selected").hidden && !document.querySelector(".cf-unlock-selected").hidden,
                "Locked selection should show only Unlock Position Selected");
            const locked = node("op-a");
            const icon = locked.querySelector(".cf-lock-icon");
            assert(icon && getComputedStyle(icon).pointerEvents === "none" && icon.getAttribute("aria-hidden") === "true",
                "Lock icon must be decorative and not intercept clicks");
            const iconRect = icon.getBoundingClientRect();
            const hit = document.elementFromPoint(iconRect.left + iconRect.width / 2, iconRect.top + iconRect.height / 2);
            assert(!hit || hit === locked || !locked.contains(hit), "Lock icon must not steal bar clicks");
            assert(locked.getAttribute("aria-label").includes(p.labels.positionLocked), "Locked state must be announced");
            assert(!locked.classList.contains("cf-editable") && node("op-p").draggable === false, "Locked steps are not draggable");
            const before = window.fixture.calls.filter(entry => entry.name === "OperationStartChangeRequested").length;
            const rect = locked.getBoundingClientRect();
            locked.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, isPrimary: true, pointerId: 31, clientX: rect.left + 5}));
            locked.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, pointerId: 31, clientX: rect.left + 80}));
            locked.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 31, clientX: rect.left + 80}));
            await settle();
            assert(window.fixture.calls.filter(entry => entry.name === "OperationStartChangeRequested").length === before, "Locked drag must not save");
            assert(!root.querySelector(".cf-banner").hidden && root.querySelector(".cf-banner").textContent === p.labels.lockedNoEdit,
                "Locked timeline drag must explain how to unlock the position");
            const pendingLocked = node("op-p");
            pendingLocked.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, isPrimary: true,
                pointerId: 32, clientX: 20, clientY: 20 }));
            pendingLocked.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 32, clientX: 40, clientY: 20 }));
            assert(root.querySelector(".cf-banner").textContent === p.labels.lockedNoEdit && !pendingLocked.draggable,
                "Locked unscheduled drag must explain the position lock without enabling dragging");
            click("op-a");
            await settle();
            assert([...document.querySelectorAll(".cf-details [data-mutation]")].find(entry => entry.textContent === p.labels.schedule).disabled,
                "Manual start editing is disabled for locked steps");
            locked.dispatchEvent(new MouseEvent("contextmenu", {clientX: 20, clientY: 20, bubbles: true, cancelable: true}));
            await settle();
            const menu = document.querySelector(".cf-context-menu");
            assert(menu.querySelector('[data-command="edit"]').disabled, "Context edit is disabled for locked steps");
            const unlock = menu.querySelector('[data-command="unlock"]');
            assert(unlock && !unlock.disabled && unlock.textContent === p.labels.unlockStep, "Context unlock must be available");
            unlock.click();
            await settle();
            assert(JSON.stringify(lockCalls().at(-1).args) === JSON.stringify([JSON.stringify([{id: "op-a", version: String(Number(versions[0]) + 1)}]), false]),
                "Context unlock sends only the clicked step");
            assert(!node("op-a").querySelector(".cf-lock-icon") && node("op-p").querySelector(".cf-lock-icon"), "Unlock updates only the requested step");
            SelectOperations("chain");
            assert(!document.querySelector(".cf-lock-selected").disabled && !document.querySelector(".cf-unlock-selected").disabled,
                "Mixed selections can lock the unlocked and unlock the locked steps");
            assert(!document.querySelector(".cf-lock-selected").hidden && !document.querySelector(".cf-unlock-selected").hidden,
                "Mixed selections must offer both applicable position actions");
            const viewer = structuredClone(p);
            for (const item of viewer.operations) Object.assign(item, {canLock: false, canUnlock: false});
            LoadSchedule(viewer);
            assert(document.querySelector(".cf-lock-selected").disabled && document.querySelector(".cf-unlock-selected").disabled,
                "Capabilities from canLock/canUnlock disable toolbar mutations for viewers");
            LoadSchedule(p);
            click("op-p");
            await settle();
            LockSelectedOperations(true);
            assert(root.querySelector(".cf-banner").textContent === p.labels.noLockChange && !status().textContent.includes(p.labels.saving),
                "Requests without a lock change are reported and not sent");
            click("op-a");
            await settle();
            window.fixture.failNext = true;
            LockSelectedOperations(true);
            await settle();
            assert(status().classList.contains("cf-error") && status().textContent === p.labels.saveFailed, "Failed saves never show Saved");
            LoadSchedule(p);
            await settle();
            assert(status().textContent === p.labels.saveFailed, "A later unrelated payload must not claim success");
            SetDraftStatus("saving", "");
            ShowError("Draft conflict");
            assert(status().textContent === p.labels.saveFailed, "ShowError while saving reports a failed save");
            LoadSchedule(p);
            SetDraftStatus("saved", "Replan saved: 3 orders");
            assert(status().textContent === "Replan saved: 3 orders" && !status().classList.contains("cf-error"), "Parent status messages display");
            SetDraftStatus("error", "Partially saved: 1 of 2 orders");
            assert(status().classList.contains("cf-error") && status().textContent.startsWith("Partially"), "Parent error state displays");
            SetDraftStatus("", "");
            assert(status().hidden, "Empty state clears the status");
            click("op-a");
            await settle();
            SelectOperations("chain");
            assert(count() === "2 selected", "Chain selection before stale reload");
            const stale = structuredClone(p);
            stale.operations = stale.operations.filter(item => item.id !== "op-p");
            LoadSchedule(stale);
            assert(count() === "1 selected", "Stale selected IDs are removed on payload load");
            LoadSchedule(p);
            click("op-a");
            click("op-r", true);
            await settle();
            const viewPayload = {...structuredClone(p), viewStateKey: "TEST-COMPANY:user:BASE"};
            window.fixture.payload = viewPayload;
            LoadSchedule(viewPayload);
            await new Promise(resolve => setTimeout(resolve, 300));
            const saved = JSON.parse(sessionStorage.getItem(storageKey));
            assert(saved && JSON.stringify(saved.selectedIds) === JSON.stringify(["op-a", "op-r"]) && saved.start === viewPayload.start,
                "View state is stored per key and display window");
            assert(!document.body.textContent.includes("TEST-COMPANY"), "The view-state key is never rendered");
            SelectOperations("clear");
            await new Promise(resolve => setTimeout(resolve, 300));
            sessionStorage.setItem(storageKey, JSON.stringify({...saved, selectedIds: ["op-r", "missing"], selectedId: "op-r"}));
            window.CFProductionScheduler.initialise();
            await settle();
            assert(JSON.stringify(selected()) === JSON.stringify(["op-r"]) && node("op-r").classList.contains("cf-selected"),
                "Reopen restores the remembered selection and drops unknown IDs");
            sessionStorage.setItem(storageKey, JSON.stringify({...saved, start: "2026-12-01T00:00:00"}));
            SelectOperations("clear");
            window.CFProductionScheduler.initialise();
            await settle();
            assert(count() === "0 selected", "A different display window must not restore view state");
            const other = {...structuredClone(p), scenario: "OTHER", viewStateKey: "TEST-COMPANY:user:OTHER"};
            click("op-a");
            LoadSchedule(other);
            assert(count() === "0 selected", "Scenario switching clears the selected set");
            assert(JSON.stringify(window.fixture.bcOperations) === baseline, "Locks must not mutate the BC baseline");
            return {selection: true, chain: true, following: true, locks: true, status: true, viewState: true};
        } finally {
            sessionStorage.removeItem(storageKey);
            sessionStorage.removeItem("cf-production-scheduler:view:TEST-COMPANY:user:OTHER");
            window.fixture.failNext = false;
            window.fixture.payload = original;
            LoadSchedule(original);
        }
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
                if (name === "OperationsLockRequested") {
                    for (const request of JSON.parse(args[0])) {
                        const item = payload.operations.find(entry => entry.id === request.id);
                        if (item.version !== request.version) throw new Error("Stale lock version");
                        item.positionLocked = args[1];
                        item.version = String(Number(item.version) + 1);
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
            }, name === "OperationStartChangeRequested" ? (fixture.saveDelay ?? 50) : 50);
        }
    } } };
}());
