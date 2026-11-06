(function () {
    "use strict";
    const core = window.CFSchedulerCore;
    let payload;
    let root;
    let banner;
    let board;
    let details;
    let controller;
    let tooltip;
    let tooltipOwner;
    let tooltipTimer;
    let contextMenu;
    let contextOwner;
    let linkObserver;
    let currentAxis;
    let currentTime = "";
    let clockTimer;
    let pendingDrag;
    let dropPreview;
    let selectedId = "";
    let selectedIds = [];
    let draftStatus = { state: "", text: "" };
    let pendingSave = false;
    let pendingSaveTimer;
    let viewStateKey = "";
    let viewStateLoaded = false;
    let viewStateTimer;
    let viewStateWarned = false;
    let previousClientView;
    let search = "";
    let lastError = "";
    let zoom = "day";
    let busy = false;
    let stale = false;
    let generation = 0;
    const collapsed = new Set();
    const savingEvents = new Set(["OperationStartChangeRequested", "OperationConfirmRequested", "OperationsLockRequested"]);
    const draftStates = ["", "saving", "saved", "failed", "error"];
    const hours = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
    const dates = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
    const months = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

    function label(name) {
        return payload && payload.labels ? payload.labels[name] || name : name;
    }

    function element(tag, className, text) {
        const result = document.createElement(tag);
        if (className) result.className = className;
        if (text !== undefined) result.textContent = text;
        return result;
    }

    function listen(target, event, callback, options) {
        target.addEventListener(event, callback, { ...options, signal: controller.signal });
    }

    function button(text, callback, className) {
        const result = element("button", className, text);
        result.type = "button";
        listen(result, "click", callback);
        return result;
    }

    function setBusy(value) {
        busy = value;
        if (value) {
            hideTooltip();
            closeContextMenu(false);
            cancelPendingDrag();
        }
        if (root) root.setAttribute("aria-busy", String(value));
        if (root) root.querySelectorAll("[data-mutation]").forEach(node => {
            node.disabled = value || stale || node.dataset.allowed !== "true";
        });
        if (root) root.querySelectorAll(".cf-zoom button").forEach(node => { node.disabled = value; });
        if (root) root.querySelectorAll(".cf-navigation input").forEach(node => {
            node.disabled = value || node.max === "0";
        });
        if (root) root.querySelectorAll(".cf-pending-item").forEach(node => {
            node.draggable = !value && !stale && node.dataset.canDrag === "true";
        });
        if (!value && contextMenu && document.activeElement === contextMenu) {
            contextMenu.querySelector("button:not(:disabled)")?.focus({preventScroll: true});
        }
    }

    function error(message) {
        hideTooltip();
        closeContextMenu(false);
        cancelPendingDrag();
        stale = true;
        if (root) root.querySelectorAll(".cf-current-time, .cf-time-overlay").forEach(node => node.remove());
        lastError = message;
        if (pendingSave || draftStatus.state === "saving") setDraftStatus("failed", "");
        if (!banner) return;
        banner.textContent = message;
        banner.classList.add("cf-error");
        banner.hidden = false;
        setBusy(false);
    }

    function notice(message) {
        if (!banner || lastError) return;
        banner.textContent = message;
        banner.classList.remove("cf-error");
        banner.hidden = false;
    }

    function setDraftStatus(state, text) {
        clearTimeout(pendingSaveTimer);
        if (state === "error") state = "failed";
        pendingSave = state === "saving";
        draftStatus = { state, text: text || (state ? label(state === "failed" ? "saveFailed" : state) : "") };
        renderDraftStatus();
    }

    function renderDraftStatus() {
        const node = root?.querySelector(".cf-draft-status");
        if (!node) return;
        node.textContent = draftStatus.text;
        node.hidden = !draftStatus.text;
        node.dataset.state = draftStatus.state;
        node.classList.toggle("cf-error", draftStatus.state === "failed");
        renderSelectionToolbar();
    }

    function invoke(name, args) {
        if (busy) return;
        const currentGeneration = generation;
        const saving = savingEvents.has(name);
        setBusy(true);
        if (saving) setDraftStatus("saving", "");
        const bridge = window.Microsoft && window.Microsoft.Dynamics &&
            window.Microsoft.Dynamics.NAV;
        if (!bridge || typeof bridge.InvokeExtensibilityMethod !== "function") {
            error("The Business Central control add-in connection is unavailable.");
            return;
        }
        try {
            bridge.InvokeExtensibilityMethod(name, args, false,
                function () {
                    if (currentGeneration === generation) setBusy(false);
                    // Only a reloaded payload or SetDraftStatus confirms a save; otherwise withdraw "saving" without claiming success.
                    if (saving && pendingSave) pendingSaveTimer = setTimeout(function () {
                        if (pendingSave && currentGeneration === generation) setDraftStatus("", "");
                    }, 2000);
                },
                function () {
                    if (currentGeneration === generation) error(label("failed"));
                });
        } catch (failure) {
            console.error("Production scheduler bridge failed.", failure);
            error(label("failed"));
        }
    }

    function mutationButton(text, callback, allowed) {
        const result = button(text, callback, "cf-primary");
        result.dataset.mutation = "true";
        result.dataset.allowed = String(allowed);
        result.disabled = busy || stale || !allowed;
        return result;
    }

    function additive(event) {
        return Boolean(event && (event.ctrlKey || event.metaKey));
    }

    function select(item, notify, mode = "replace") {
        hideTooltip();
        const previous = selectedId;
        if (mode === "toggle") {
            selectedIds = core.toggleSelection(selectedIds, item.id);
            if (selectedIds.includes(item.id)) selectedId = item.id;
            else if (selectedId === item.id) selectedId = selectedIds.at(-1) || "";
        } else {
            if (mode !== "keep" || !selectedIds.includes(item.id)) selectedIds = [item.id];
            selectedId = item.id;
        }
        refreshSelection();
        if (notify && !busy && selectedId && (selectedId === item.id || selectedId !== previous)) {
            invoke("OperationSelected", [selectedId]);
        }
    }

    function markSelection(node, id) {
        node.classList.toggle("cf-selected", id === selectedId);
        node.classList.toggle("cf-multi-selected", selectedIds.includes(id));
        node.setAttribute("aria-pressed", String(selectedIds.includes(id)));
    }

    function activeItem() {
        return payload.operations.find(item => item.id === selectedId &&
            (payload.includeProblemSteps || item.problems.length === 0));
    }

    function selectedItems() {
        return selectedIds.map(id => payload.operations.find(item => item.id === id)).filter(Boolean);
    }

    function canLock(item, locked = true) {
        const allowed = item.canLock ?? item.canReset;
        return (locked ? allowed : item.canUnlock ?? allowed) === true;
    }

    function refreshSelection() {
        root.querySelectorAll("[data-operation]").forEach(node => markSelection(node, node.dataset.operation));
        renderDetails(activeItem());
        renderRoutingLinks();
        renderSelectionToolbar();
        saveViewState();
    }

    function renderSelectionToolbar() {
        const toolbar = root?.querySelector(".cf-selection");
        if (!toolbar || !payload) return;
        const items = selectedItems();
        toolbar.hidden = !payload.scenario || (!items.length && !draftStatus.text);
        toolbar.querySelector(".cf-selection-count").textContent = label("selectedCount").replace("%1", String(items.length));
        for (const locked of [true, false]) {
            const changes = lockChanges(items, locked);
            toolbar.querySelector(locked ? ".cf-lock-selected" : ".cf-unlock-selected").dataset.allowed =
                String(changes.length > 0 && changes.every(item => canLock(item, locked)));
        }
        toolbar.querySelectorAll("[data-mutation]").forEach(node => {
            node.disabled = busy || stale || node.dataset.allowed !== "true";
        });
        toolbar.querySelectorAll("[data-selection]").forEach(node => { node.disabled = stale || !items.length; });
    }

    function selectOperations(command) {
        if (!payload || stale) {
            console.warn("Production scheduler selection is unavailable until the schedule is refreshed.");
            notice(label("selectionUnavailable"));
            return false;
        }
        if (command === "clear") {
            selectedIds = [];
            selectedId = "";
            refreshSelection();
            return true;
        }
        if (command !== "chain" && command !== "following") {
            console.error("Unsupported production scheduler selection command.", command);
            notice(label("invalidSelectionCommand"));
            return false;
        }
        const origins = core.pruneSelection(selectedIds.length ? selectedIds : [selectedId], payload.operations);
        if (!origins.length) {
            notice(label("noSelection"));
            return false;
        }
        const related = origins.flatMap(id => command === "chain"
            ? core.routingChain(payload.operations, id) : core.followingSteps(payload.operations, id));
        selectedIds = core.pruneSelection([...origins, ...related], payload.operations);
        if (!selectedIds.includes(selectedId)) selectedId = selectedIds[0] || "";
        refreshSelection();
        return true;
    }

    function lockChanges(items, locked) {
        return items.filter(item => item.positionLocked !== locked);
    }

    function requestSelectedLocks(locked) {
        if (typeof locked !== "boolean") throw new Error("Invalid position lock request.");
        const items = payload ? selectedItems() : [];
        const changes = lockChanges(items, locked);
        if (items.length && !changes.length) {
            notice(label("noLockChange"));
            return false;
        }
        return requestLocks(changes, locked);
    }

    function requestLocks(items, locked) {
        if (typeof locked !== "boolean") throw new Error("Invalid position lock request.");
        if (!payload || !payload.scenario || stale || busy) {
            notice(label("selectionUnavailable"));
            return false;
        }
        if (!items.length) {
            notice(label("noSelection"));
            return false;
        }
        invoke("OperationsLockRequested", [JSON.stringify(core.lockRequest(payload.operations, items.map(item => item.id))), locked]);
        return true;
    }

    function viewStorageKey() {
        return "cf-production-scheduler:view:" + viewStateKey;
    }

    function viewStateFailed(failure) {
        console.warn("Production scheduler view state is unavailable.", failure);
        if (!viewStateWarned) {
            viewStateWarned = true;
            notice(label("viewStateFailed"));
        }
    }

    function readViewState(data) {
        try {
            const text = window.sessionStorage.getItem(viewStorageKey());
            if (!text) return null;
            const state = JSON.parse(text);
            const valid = state && state.version === 1 && state.start === data.start && state.end === data.end &&
                state.viewMode === data.viewMode && Number.isFinite(state.scrollLeft) && Number.isFinite(state.scrollTop) &&
                typeof state.selectedId === "string" && Array.isArray(state.selectedIds) &&
                state.selectedIds.every(id => typeof id === "string");
            return valid ? state : null;
        } catch (failure) {
            viewStateFailed(failure);
            return null;
        }
    }

    function writeViewState() {
        clearTimeout(viewStateTimer);
        if (!viewStateKey || !payload || !board || stale) return;
        try {
            window.sessionStorage.setItem(viewStorageKey(), JSON.stringify({
                version: 1, start: payload.start, end: payload.end, viewMode: zoom,
                scrollLeft: board.scrollLeft, scrollTop: board.scrollTop, selectedId, selectedIds
            }));
        } catch (failure) {
            viewStateFailed(failure);
        }
    }

    function saveViewState() {
        clearTimeout(viewStateTimer);
        if (viewStateKey) viewStateTimer = setTimeout(writeViewState, 250);
    }

    function renderDetails(item) {
        details.replaceChildren();
        if (!item) {
            details.append(element("p", "", label("select")));
            return;
        }
        details.append(element("h3", "", `${item.order} / ${item.operation} - ${item.description}`));
        details.append(element("p", "", `${item.status} | ${item.item} | ${item.quantity}`));
        details.append(element("p", "", `${label("start")}: ${displayDate(item.start)} | ${label("end")}: ${displayDate(item.end)} | ${label("due")}: ${item.due}`));
        details.append(element("p", "", item.effort));
        if (item.positionLocked) details.append(element("p", "cf-locked-note", label("lockedNoEdit")));
        appendProblems(details, item);
        const controls = element("div", "cf-detail-actions");
        const inputLabel = element("label", "", label("start"));
        const input = element("input");
        input.type = "datetime-local";
        input.step = "60";
        input.value = (item.start || payload.start).slice(0, 16);
        inputLabel.append(input);
        controls.append(inputLabel);
        controls.append(mutationButton(label("schedule"), function () {
            const start = core.inputToCivil(input.value);
            if (!start) {
                input.setCustomValidity(label("invalidDate"));
                input.reportValidity();
                return;
            }
            input.setCustomValidity("");
            invoke("OperationStartChangeRequested", [item.id, item.version, start]);
        }, item.editable && !item.positionLocked));
        controls.append(mutationButton(label("confirm"), () =>
            invoke("OperationConfirmRequested", [item.id, item.version]), item.canConfirm));
        controls.append(button(label("order"), () => invoke("OperationOpenRequested", [item.id, false])));
        controls.append(button(label("routing"), () => invoke("OperationOpenRequested", [item.id, true])));
        details.append(controls);
    }

    function displayDate(value) {
        return (value || "-").replace("T", " ");
    }

    function closeContextMenu(restoreFocus = false) {
        if (contextMenu) contextMenu.remove();
        contextMenu = null;
        if (restoreFocus && contextOwner?.isConnected) contextOwner.focus({preventScroll: true});
        contextOwner = null;
    }

    function openContextMenu(event, owner, item, keyboard = false) {
        if (busy || stale) return;
        event.preventDefault();
        closeContextMenu(false);
        select(item, true, "keep");
        contextOwner = owner;
        contextMenu = element("div", "cf-context-menu");
        contextMenu.setAttribute("role", "menu");
        contextMenu.setAttribute("aria-label", `${item.order} / ${item.operation}`);
        contextMenu.tabIndex = -1;
        const actions = [
            ["details", "draftDetails", true],
            ["edit", "editDraft", item.editable && !item.positionLocked],
            ["zoom", "zoomDocument", true],
            ["reset", "resetDraft", item.canReset === true],
            ["commit", "commitOrder", item.canCommit === true],
            ["order", "order", true],
            ["bcRouting", "openBCRouting", true]
        ];
        if (payload.scenario) actions.push(item.positionLocked
            ? ["unlock", "unlockStep", canLock(item, false)] : ["lock", "lockStep", canLock(item, true)]);
        for (const [command, caption, allowed] of actions) {
            const control = mutationButton(label(caption), () => {
                closeContextMenu(false);
                if (command === "lock" || command === "unlock") requestLocks([item], command === "lock");
                else invoke("OperationContextRequested", [item.id, item.version, command]);
            }, allowed);
            control.className = "";
            control.dataset.command = command;
            control.setAttribute("role", "menuitem");
            contextMenu.append(control);
        }
        listen(contextMenu, "keydown", keyEvent => {
            if (keyEvent.key === "Escape") {
                keyEvent.preventDefault();
                keyEvent.stopPropagation();
                closeContextMenu(true);
                return;
            }
            if (keyEvent.key === "Tab") {
                closeContextMenu(false);
                return;
            }
            const controls = [...contextMenu.querySelectorAll("button:not(:disabled)")];
            if (!controls.length) return;
            const index = controls.indexOf(document.activeElement);
            let next;
            if (keyEvent.key === "ArrowDown") next = (index + 1) % controls.length;
            if (keyEvent.key === "ArrowUp") next = (index - 1 + controls.length) % controls.length;
            if (keyEvent.key === "Home") next = 0;
            if (keyEvent.key === "End") next = controls.length - 1;
            if (next !== undefined) {
                keyEvent.preventDefault();
                controls[next].focus({preventScroll: true});
            }
        });
        root.append(contextMenu);
        const ownerRect = owner.getBoundingClientRect();
        const x = keyboard ? ownerRect.left : event.clientX;
        const y = keyboard ? ownerRect.bottom : event.clientY;
        const rect = contextMenu.getBoundingClientRect();
        contextMenu.style.left = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)) + "px";
        contextMenu.style.top = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)) + "px";
        contextMenu.focus({preventScroll: true});
        if (!busy) contextMenu.querySelector("button:not(:disabled)")?.focus({preventScroll: true});
    }

    function appendProblems(container, item) {
        if (item.issue && !item.problems.includes(item.issue)) container.append(element("p", "cf-warning", item.issue));
        if (!item.problems.length) return;
        const list = element("ul", "cf-problems");
        list.setAttribute("aria-label", label("problem"));
        for (const problem of item.problems) list.append(element("li", "", problem));
        container.append(list);
    }

    function clockTime(value) {
        return core.formatCivil(value).slice(11).replace(/:00$/, "");
    }

    function hideTooltip() {
        clearTimeout(tooltipTimer);
        if (tooltipOwner) tooltipOwner.removeAttribute("aria-describedby");
        tooltipOwner = undefined;
        if (tooltip) tooltip.hidden = true;
    }

    function deferHideTooltip() {
        clearTimeout(tooltipTimer);
        tooltipTimer = setTimeout(function () {
            if (document.activeElement !== tooltipOwner || !tooltipOwner.matches(":focus-visible")) hideTooltip();
        }, 150);
    }

    function showTooltip(item, owner, warning) {
        if (busy || stale || owner.classList.contains("cf-dragging")) return;
        hideTooltip();
        tooltipOwner = owner;
        tooltip.replaceChildren(element("h3", "", label("operationDetails")));
        function fields(values) {
            const list = element("dl", "cf-tooltip-fields");
            for (const [name, value] of values) {
                list.append(element("dt", "", label(name)), element("dd", "", value === "" || value == null ? "-" : String(value)));
            }
            tooltip.append(list);
        }
        fields([
            ["operationNo", item.operation], ["description", item.description],
            ["startingDateTime", displayDate(item.start)], ["endingDateTime", displayDate(item.end)],
            ["status", item.status], ["orderNo", item.order],
            ["previousOperation", item.previousOperation], ["nextOperation", item.nextOperation],
            ["resource", payload.resources.find(resource => resource.id === item.resource)?.name || item.resource],
            ["due", item.due], ["confirmation", label(item.finished ? "finished" : item.confirmed ? "confirmed" : "pending")]
        ]);
        for (const line of item.lines) {
            tooltip.append(element("h4", "", `${label("productionLine")} ${line.lineNo}`));
            fields([
                ["lineNo", line.lineNo], ["itemNo", line.item], ["description", line.description],
                ["quantity", line.quantity], ["unit", line.unit]
            ]);
        }
        tooltip.append(element("p", "", item.effort));
        if (item.positionLocked) tooltip.append(element("p", "cf-locked-note", `${label("positionLocked")}. ${label("lockedNoEdit")}`));
        appendProblems(tooltip, item);
        if (warning) tooltip.append(element("p", "cf-warning", warning));
        tooltip.style.maxHeight = "";
        tooltip.hidden = false;
        tooltip.scrollTop = 0;
        const anchor = owner.getBoundingClientRect();
        const margin = 8;
        const bottomEdge = Math.max(margin, anchor.bottom);
        const topEdge = Math.min(window.innerHeight - margin, anchor.top);
        const below = Math.max(0, window.innerHeight - bottomEdge - 2 * margin);
        const above = Math.max(0, topEdge - 2 * margin);
        const naturalHeight = tooltip.getBoundingClientRect().height;
        const placeBelow = naturalHeight <= below || (naturalHeight > above && below >= above);
        tooltip.style.maxHeight = `${placeBelow ? below : above}px`;
        const rect = tooltip.getBoundingClientRect();
        const top = placeBelow ? bottomEdge + margin : topEdge - rect.height - margin;
        tooltip.style.left = Math.max(margin, Math.min(anchor.left, window.innerWidth - rect.width - margin)) + "px";
        tooltip.style.top = top + "px";
        owner.setAttribute("aria-describedby", tooltip.id);
    }

    function attachTooltip(owner, item, warning) {
        owner.setAttribute("aria-haspopup", "menu");
        listen(owner, "contextmenu", event => openContextMenu(event, owner, item));
        listen(owner, "keydown", event => {
            if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                openContextMenu(event, owner, item, true);
            }
        });
        listen(owner, "pointerenter", event => {
            if (event.pointerType !== "touch" && !event.buttons) showTooltip(item, owner, warning);
        });
        listen(owner, "pointerleave", deferHideTooltip);
        listen(owner, "focus", () => {
            if (owner.matches(":focus-visible")) showTooltip(item, owner, warning);
        });
        listen(owner, "blur", hideTooltip);
        listen(owner, "pointerdown", hideTooltip);
    }

    function stackLane(lane, placed) {
        const width = lane.getBoundingClientRect().width;
        if (width <= 0) return;
        const stacked = core.stackRenderedOperations(placed, width);
        const bars = [...lane.children];
        stacked.forEach((entry, index) => {
            bars[index].style.top = (entry.track * 34 + 4) + "px";
        });
        lane.style.height = Math.max(42, (1 + Math.max(-1, ...stacked.map(entry => entry.track))) * 34 + 8) + "px";
    }

    function renderUnscheduledRow(resource, items, axis, lanes) {
        const row = element("div", "cf-row cf-child-resource cf-unscheduled-row");
        const name = element("div", "cf-resource-label");
        name.append(element("span", "cf-resource-name", label("unscheduled")));
        row.append(name);
        const timeline = element("div", "cf-timeline");
        const lane = element("div", "cf-lane");
        const placed = core.unscheduledLayout(items, axis);
        lane.style.height = Math.max(42, (1 + Math.max(-1, ...placed.map(entry => entry.track))) * 34 + 8) + "px";
        for (const entry of placed) {
            const item = entry.item;
            const canDrag = item.editable && !item.positionLocked;
            const bar = button(`${item.order} / ${item.operation}`,
                event => select(item, true, additive(event) ? "toggle" : "replace"),
                "cf-unscheduled-operation cf-pending cf-pending-item");
            bar.style.left = entry.left + "%";
            bar.style.width = `max(12px, ${entry.width}%)`;
            bar.style.top = (entry.track * 34 + 4) + "px";
            bar.dataset.operation = item.id;
            bar.dataset.canDrag = String(canDrag);
            bar.draggable = canDrag && !busy && !stale;
            bar.classList.toggle("cf-problem", item.problems.length > 0);
            bar.classList.toggle("cf-locked", item.positionLocked === true);
            markSelection(bar, item.id);
            if (item.positionLocked) {
                bar.setAttribute("aria-label", `${bar.textContent} - ${label("positionLocked")}`);
                bar.prepend(lockIcon());
            }
            listen(bar, "dragstart", event => {
                if (busy || stale || !canDrag || !event.dataTransfer) {
                    event.preventDefault();
                    return;
                }
                hideTooltip();
                pendingDrag = item;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-cf-production-operation", item.id);
            });
            listen(bar, "dragend", cancelPendingDrag);
            listen(bar, "dblclick", () => invoke("OperationOpenRequested", [item.id, true]));
            attachTooltip(bar, item);
            lane.append(bar);
        }
        timeline.append(lane);
        lanes.push({ lane, placed });
        row.append(timeline);
        return row;
    }

    function lockIcon() {
        const icon = element("span", "cf-lock-icon");
        icon.setAttribute("aria-hidden", "true");
        return icon;
    }

    function matchesView(item) {
        return core.operationVisible(item, search, payload.includeProblemSteps);
    }

    function workCenterId(item) {
        if (typeof item.workCenter === "string") return item.workCenter;
        const resource = payload.resources.find(entry => entry.id === item.resource);
        return resource?.parent || resource?.id;
    }

    function clearDropPreview() {
        if (dropPreview) {
            dropPreview.parentElement?.classList.remove("cf-drop-target");
            dropPreview.remove();
            dropPreview = undefined;
        }
    }

    function cancelPendingDrag() {
        pendingDrag = undefined;
        clearDropPreview();
        const help = root?.querySelector(".cf-drop-help");
        if (help) {
            help.textContent = "";
            help.hidden = true;
        }
    }

    function pendingDrop(event) {
        if (!pendingDrag || busy || stale || !pendingDrag.editable || pendingDrag.positionLocked || pendingDrag.confirmed) return null;
        const timeline = event.target.closest(".cf-timeline");
        if (!timeline || timeline.dataset.resource !== pendingDrag.resource) return null;
        const lane = timeline.querySelector(".cf-lane");
        if (!lane) return null;
        const rect = lane.getBoundingClientRect();
        const start = core.droppedAxisStart(currentAxis, event.clientX - rect.left, rect.width);
        return start ? { item: pendingDrag, lane, start } : null;
    }

    function dragOverPending(event) {
        if (!pendingDrag) return;
        event.preventDefault();
        const drop = pendingDrop(event);
        event.dataTransfer.dropEffect = drop ? "move" : "none";
        clearDropPreview();
        const help = root.querySelector(".cf-drop-help");
        const text = label(drop ? "dropHelp" : "dropInvalid");
        if (help.textContent !== text) help.textContent = text;
        help.hidden = Boolean(drop);
        if (!drop) return;
        dropPreview = element("div", "cf-drop-preview");
        dropPreview.style.left = core.axisPosition(currentAxis, core.parseCivil(drop.start)) / currentAxis.duration * 100 + "%";
        dropPreview.append(element("span", "", displayDate(drop.start)));
        drop.lane.classList.add("cf-drop-target");
        drop.lane.append(dropPreview);
    }

    function dropPending(event) {
        if (!pendingDrag) return;
        event.preventDefault();
        const drop = pendingDrop(event);
        cancelPendingDrag();
        if (!drop) {
            banner.textContent = label("dropInvalid");
            banner.classList.remove("cf-error");
            banner.hidden = false;
            return;
        }
        select(drop.item, false);
        invoke("OperationStartChangeRequested", [drop.item.id, drop.item.version, drop.start]);
    }

    function renderRoutingLinks() {
        const grid = board?.querySelector(".cf-grid");
        const scope = root.querySelector(".cf-routing-scope");
        if (!grid) {
            scope.hidden = true;
            return;
        }
        grid.querySelector(".cf-routing-links")?.remove();
        const selected = payload.operations.find(item => item.id === selectedId &&
            (payload.includeProblemSteps || item.problems.length === 0));
        scope.hidden = !selected;
        if (!selected) return;
        const links = core.routingLinks(payload.operations, selectedId, payload.documentFocus);
        if (!links.enabled) {
            scope.textContent = label("routingUnscheduled");
            return;
        }
        const bars = new Map();
        for (const bar of grid.querySelectorAll(".cf-operation")) {
            const endpoints = bars.get(bar.dataset.operation);
            if (endpoints) endpoints.last = bar;
            else bars.set(bar.dataset.operation, {first: bar, last: bar});
        }
        const visible = links.edges.filter(edge => bars.has(edge.from) && bars.has(edge.to));
        const values = [selected.order, String(visible.length), String(links.edges.length - visible.length)];
        scope.textContent = label("routingScope").replace(/%([123])/g, (_, index) => values[Number(index) - 1]);
        const svgElement = name => document.createElementNS("http://www.w3.org/2000/svg", name);
        const svg = svgElement("svg");
        svg.classList.add("cf-routing-links");
        svg.setAttribute("aria-hidden", "true");
        const rect = grid.getBoundingClientRect();
        svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
        const defs = svgElement("defs");
        const marker = svgElement("marker");
        marker.id = "cf-routing-arrow";
        marker.setAttribute("viewBox", "0 0 8 8");
        marker.setAttribute("refX", "8");
        marker.setAttribute("refY", "4");
        marker.setAttribute("markerWidth", "6");
        marker.setAttribute("markerHeight", "6");
        marker.setAttribute("orient", "auto");
        const arrow = svgElement("path");
        arrow.setAttribute("d", "M 0 0 L 8 4 L 0 8 Z");
        marker.append(arrow);
        defs.append(marker);
        svg.append(defs);
        for (const edge of visible) {
            const from = bars.get(edge.from).last;
            const to = bars.get(edge.to).first;
            const a = from.getBoundingClientRect();
            const b = to.getBoundingClientRect();
            const x1 = a.right - rect.left;
            const y1 = a.top + a.height / 2 - rect.top;
            const x2 = b.left - rect.left;
            const y2 = b.top + b.height / 2 - rect.top;
            const bend = Math.max(24, Math.min(120, Math.abs(x2 - x1) / 2));
            const path = svgElement("path");
            path.classList.add("cf-routing-link");
            path.dataset.from = edge.from;
            path.dataset.to = edge.to;
            path.setAttribute("d", `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
            path.setAttribute("marker-end", "url(#cf-routing-arrow)");
            svg.append(path);
        }
        grid.append(svg);
    }

    function renderNavigation() {
        const range = payload.navigation;
        const bounds = core.rangeWindow(range.start, range.days, range.viewDays, range.offset);
        const section = element("section", "cf-navigation");
        const caption = element("label", "", range.caption);
        const output = element("output");
        const input = element("input");
        input.type = "range";
        input.min = "0";
        input.max = String(bounds.lastOffset);
        input.step = "1";
        input.value = String(range.offset);
        input.setAttribute("aria-label", range.caption);
        const updateCaption = function () {
            const preview = core.rangeWindow(range.start, range.days, range.viewDays, Number(input.value));
            const last = core.formatCivil(core.parseCivil(preview.end) - core.day).slice(0, 10);
            output.textContent = `${preview.start.slice(0, 10)} - ${last}`;
            input.setAttribute("aria-valuetext", output.textContent);
        };
        updateCaption();
        listen(input, "input", updateCaption);
        listen(input, "change", function () {
            const offset = Number(input.value);
            if (offset !== range.offset) invoke("DateWindowChanged", [offset]);
        });
        caption.append(output, input);
        const ruler = element("div", "cf-range-ruler");
        const ticks = [...new Set([0, ...[1, 2, 3, 4].map(part => Math.round((range.days - 1) * part / 4))])];
        for (const offset of ticks) {
            const date = core.formatCivil(core.parseCivil(range.start) + offset * core.day).slice(0, 10);
            ruler.append(element("span", "", date));
        }
        section.append(caption, ruler);
        return section;
    }

    function renderCapacity(resource, timeline, axis, dayPositions) {
        const strip = element("div", "cf-capacity");
        const background = element("div", "cf-load-background");
        background.setAttribute("aria-hidden", "true");
        const capacityResource = resource.direct ? payload.resources.find(parent => parent.id === resource.parent) : resource;
        if (!capacityResource) throw new Error("Direct operations require their parent work-centre capacity.");
        const availability = new Map(capacityResource.days.map(day => [day.date, day.available]));
        for (const cell of resource.days) {
            const values = core.capacity(cell.available, cell.allocated);
            const available = availability.get(cell.date);
            if (available === undefined) throw new Error("Daily resource capacity is missing.");
            const fill = core.capacityFill(available, cell.allocated);
            const box = element("div", "cf-capacity-day");
            box.dataset.date = cell.date;
            const position = dayPositions.get(cell.date);
            if (!position) {
                const date = core.parseCivil(cell.date + "T00:00:00");
                if (axis.filtered && core.overlaps(date, date + core.day, axis.start, axis.end)) continue;
                throw new Error("Capacity date is outside the visible window.");
            }
            box.style.left = `${position.left / axis.width * 100}%`;
            box.style.width = `${position.width / axis.width * 100}%`;
            box.style.setProperty("--cf-load-fill", `${fill.percent}%`);
            box.classList.toggle("cf-loaded", fill.loaded);
            box.classList.toggle("cf-overload", fill.overloaded);
            box.classList.toggle("cf-full", available > 0 && cell.allocated >= available);
            const shading = element("div", "cf-day-load");
            shading.dataset.date = cell.date;
            shading.style.left = box.style.left;
            shading.style.width = box.style.width;
            shading.style.setProperty("--cf-load-fill", `${fill.percent}%`);
            shading.classList.toggle("cf-loaded", fill.loaded);
            shading.classList.toggle("cf-overload", fill.overloaded);
            shading.classList.toggle("cf-full", available > 0 && cell.allocated >= available);
            shading.append(element("div", "cf-capacity-meter"));
            if (zoom !== "hour") background.append(shading);
            box.textContent = resource.direct
                ? hours.format(cell.allocated / 60)
                : `${hours.format(cell.allocated / 60)} / ${hours.format(cell.available / 60)}`;
            const parts = [`${cell.date}`, `${label("allocated")}: ${hours.format(cell.allocated)} ${label("minutes")}`];
            if (resource.direct) {
                parts.push(label("direct"));
                parts.push(`${label("available")}: ${hours.format(available)} ${label("minutes")}`);
                if (available > 0) parts.push(`${hours.format(cell.allocated / available * 100)}%`);
            }
            else {
                parts.push(`${label("available")}: ${hours.format(cell.available)} ${label("minutes")}`);
                parts.push(`${label("remaining")}: ${hours.format(values.remaining)} ${label("minutes")}`);
                if (values.percent !== null) parts.push(`${hours.format(values.percent)}%`);
            }
            box.title = parts.join("\n");
            box.setAttribute("aria-label", parts.join(", "));
            if (zoom !== "hour" && available > 0) {
                const percent = element("span", "cf-capacity-percent",
                    `${hours.format(cell.allocated / available * 100)}%`);
                percent.title = box.title;
                box.append(percent);
            }
            strip.append(box);
        }
        if (zoom === "hour") {
            for (const cell of core.hourlyCapacity(axis, capacityResource.windows, resource.loadWindows)) {
                const fill = core.capacityFill(cell.available, cell.allocated);
                const hover = element("div", "cf-hour-capacity-tooltip");
                hover.dataset.start = core.formatCivil(cell.start);
                hover.style.left = `${cell.left / axis.width * 100}%`;
                hover.style.width = `${cell.width / axis.width * 100}%`;
                hover.title = `${core.formatCivil(cell.start)} - ${core.formatCivil(cell.end)}\n` +
                    `${label("allocated")}: ${hours.format(cell.allocated)} ${label("minutes")}\n` +
                    `${label("available")}: ${hours.format(cell.available)} ${label("minutes")}\n` +
                    (cell.available > 0 ? `${hours.format(cell.allocated / cell.available * 100)}%` : label("noCapacity"));
                hover.setAttribute("aria-label", hover.title);
                strip.append(hover);
                if (!fill.loaded) continue;
                const shading = element("div", "cf-day-load cf-hour-load");
                shading.dataset.start = core.formatCivil(cell.start);
                shading.style.left = `${cell.left / axis.width * 100}%`;
                shading.style.width = `${cell.width / axis.width * 100}%`;
                shading.style.setProperty("--cf-load-fill", `${fill.percent}%`);
                shading.classList.add("cf-loaded");
                shading.classList.toggle("cf-overload", fill.overloaded);
                shading.classList.toggle("cf-full", cell.available > 0 && cell.allocated >= cell.available);
                shading.append(element("div", "cf-capacity-meter"));
                background.append(shading);
            }
            strip.classList.add("cf-hour-capacity");
        }
        timeline.append(background, strip);
    }

    function renderNonWorkingTime(resource, timeline, axis, dayPositions) {
        const calendarResource = resource.direct ? payload.resources.find(parent => parent.id === resource.parent) : resource;
        if (!calendarResource) throw new Error("Direct operations require their parent work-centre calendar.");
        if (calendarResource.missingCalendar) return;
        const background = element("div", "cf-nonworking-hours");
        background.setAttribute("aria-hidden", "true");
        for (const interval of zoom === "hour" ? core.nonWorkingSegments(axis, calendarResource.windows) : []) {
            const shade = element("div", "cf-nonworking-interval");
            shade.style.left = `${interval.left}%`;
            shade.style.width = `${interval.width}%`;
            background.append(shade);
        }
        for (const cell of calendarResource.days) {
            if (cell.available > 0) continue;
            const position = dayPositions.get(cell.date);
            if (!position) continue;
            const shade = element("div", "cf-nonworking-day");
            shade.classList.toggle("cf-nonworking-weekend",
                [0, 6].includes(new Date(core.parseCivil(cell.date + "T00:00:00")).getUTCDay()));
            shade.dataset.date = cell.date;
            shade.style.left = `${position.left / axis.width * 100}%`;
            shade.style.width = `${position.width / axis.width * 100}%`;
            background.append(shade);
        }
        if (background.childElementCount) timeline.append(background);
    }

    function dragBar(event, item, bar, lane, axis) {
        if (event.button !== 0 || event.isPrimary === false || additive(event) || !core.onTimeline(item) || !item.editable ||
            item.positionLocked || stale || busy) return;
        if (axis.compressed && !core.axisContains(axis, core.parseCivil(item.start))) return;
        hideTooltip();
        closeContextMenu(false);
        const origin = event.clientX;
        const fragments = [...lane.querySelectorAll(".cf-operation")].filter(node => node.dataset.operation === item.id);
        let delta = 0;
        let moved = false;
        let finished = false;
        const width = lane.getBoundingClientRect().width;
        bar.setPointerCapture(event.pointerId);
        function move(moveEvent) {
            if (moveEvent.pointerId !== event.pointerId) return;
            delta = moveEvent.clientX - origin;
            if (Math.abs(delta) > 5) moved = true;
            if (moved) {
                moveEvent.preventDefault();
                board.querySelector(".cf-routing-links")?.remove();
                for (const fragment of fragments) {
                    fragment.style.transform = `translateX(${delta}px)`;
                    fragment.classList.add("cf-dragging");
                }
            }
        }
        function finish(endEvent) {
            if (finished || (endEvent.pointerId !== undefined && endEvent.pointerId !== event.pointerId)) return;
            finished = true;
            bar.removeEventListener("pointermove", move);
            bar.removeEventListener("pointerup", finish);
            bar.removeEventListener("pointercancel", cancel);
            bar.removeEventListener("lostpointercapture", cancel);
            document.removeEventListener("keydown", keydown);
            if (bar.hasPointerCapture(event.pointerId)) bar.releasePointerCapture(event.pointerId);
            for (const fragment of fragments) {
                fragment.style.transform = "";
                fragment.classList.remove("cf-dragging");
            }
            renderRoutingLinks();
            if (moved && endEvent.type === "pointerup") {
                bar.dataset.suppressClick = "true";
                const next = core.draggedAxisStart(axis, core.parseCivil(item.start), delta, width);
                if (!next) {
                    banner.textContent = label(payload.hideNonWorkingDays || payload.hideWeekends ? "hiddenDragRange" : "hourDragRange");
                    banner.classList.remove("cf-error");
                    banner.hidden = false;
                    return;
                }
                if (next && next !== item.start) {
                    select(item, false);
                    invoke("OperationStartChangeRequested", [item.id, item.version, next]);
                }
            }
        }
        function cancel(cancelEvent) { finish(cancelEvent); }
        function keydown(keyEvent) {
            if (keyEvent.key === "Escape") {
                keyEvent.preventDefault();
                finish(keyEvent);
            }
        }
        bar.addEventListener("pointermove", move, { signal: controller.signal });
        bar.addEventListener("pointerup", finish, { signal: controller.signal });
        bar.addEventListener("pointercancel", cancel, { signal: controller.signal });
        bar.addEventListener("lostpointercapture", cancel, { signal: controller.signal });
        document.addEventListener("keydown", keydown, { signal: controller.signal });
    }

    function requestCurrentTime() {
        if (!stale && !busy && !contextMenu && !document.hidden && !pendingDrag && !board?.querySelector(".cf-dragging")) {
            invoke("CurrentTimeRequested", []);
        }
    }

    function renderCurrentTime() {
        const grid = board?.querySelector(".cf-grid");
        if (!grid) return;
        grid.querySelectorAll(".cf-current-time, .cf-time-overlay").forEach(node => node.remove());
        const caption = `${label("currentTime")}: ${displayDate(currentTime)}`;
        grid.querySelector(".cf-current-time-label").textContent = caption;
        const position = core.currentTimePosition(currentAxis, currentTime);
        if (position === null || stale) return;
        const overlay = element("div", "cf-time-overlay");
        overlay.setAttribute("aria-hidden", "true");
        const marker = element("div", "cf-current-time");
        marker.style.left = position + "%";
        marker.dataset.time = currentTime;
        overlay.append(marker);
        grid.append(overlay);
        const headerMarker = marker.cloneNode(true);
        headerMarker.setAttribute("aria-hidden", "true");
        grid.querySelector(".cf-axis").append(headerMarker);
    }

    function renderBoard() {
        hideTooltip();
        clearDropPreview();
        if (linkObserver) linkObserver.disconnect();
        board.replaceChildren();
        const viewStart = core.parseCivil(payload.start);
        const viewEnd = core.parseCivil(payload.end);
        if (!Number.isFinite(viewStart) || viewEnd <= viewStart) throw new Error("Invalid schedule window.");
        const visibleDates = core.visibleDates(payload.resources, viewStart, viewEnd, payload.hideNonWorkingDays, payload.hideWeekends);
        const axis = core.timeAxis(zoom, viewStart, viewEnd, undefined, visibleDates);
        const dayPositions = new Map(axis.days.map(day => [core.formatCivil(day.start).slice(0, 10), day]));
        currentAxis = axis;
        const dayScope = root.querySelector(".cf-nonworking-scope");
        dayScope.hidden = !payload.hideNonWorkingDays && !payload.hideWeekends;
        if (!dayScope.hidden) {
            const dayAxis = core.timeAxis("day", viewStart, viewEnd, undefined, visibleDates);
            const hiddenOperations = payload.operations.filter(item => core.onTimeline(item) && matchesView(item) &&
                core.overlaps(core.parseCivil(item.start), core.parseCivil(item.end), viewStart, viewEnd) &&
                !core.axisClip(dayAxis, core.parseCivil(item.start), core.parseCivil(item.end))).length;
            const hiddenLoadDays = new Set(payload.resources.flatMap(resource => resource.days)
                .filter(cell => cell.allocated > 0 && !visibleDates.includes(cell.date)).map(cell => cell.date)).size;
            const values = [String((viewEnd - viewStart) / core.day - dayAxis.days.length), String(hiddenOperations), String(hiddenLoadDays)];
            dayScope.textContent = label(payload.hideWeekends ? "hiddenDaysScope" : "nonWorkingScope")
                .replace(/%([123])/g, (_, index) => values[Number(index) - 1]);
        }
        const hourScope = root.querySelector(".cf-hour-scope");
        hourScope.hidden = zoom !== "hour";
        hourScope.textContent = label("hourScope");
        if (axis.duration === 0) {
            const empty = element("p", "cf-empty-calendar", label("noWorkingDays"));
            empty.setAttribute("role", "status");
            board.append(empty);
            renderRoutingLinks();
            return;
        }
        const grid = element("div", "cf-grid");
        const lanes = [];
        grid.classList.toggle("cf-month-view", zoom === "month");
        grid.classList.toggle("cf-fit-overview", payload.fitToWindow && axis.days.length > 31);
        const gridLines = element("div", "cf-grid-lines");
        gridLines.setAttribute("aria-hidden", "true");
        for (const tick of axis.ticks) {
            const cell = element("div", "cf-grid-cell");
            cell.style.left = tick.left / axis.width * 100 + "%";
            cell.style.width = tick.width / axis.width * 100 + "%";
            gridLines.append(cell);
        }
        grid.append(gridLines);
        grid.style.setProperty("--cf-min-timeline-width", payload.fitToWindow ? "0px" : axis.width + "px");
        const header = element("div", "cf-row cf-header");
        const headerLabel = element("div", "cf-resource-label", label("capacity"));
        headerLabel.append(element("small", "cf-current-time-label"));
        header.append(headerLabel);
        const axisHeader = element("div", "cf-axis");
        for (const [index, level] of axis.levels.entries()) {
            const columns = element("div", "cf-date-columns " +
                (index === axis.levels.length - 1 ? "cf-date-ticks" : "cf-date-groups"));
            columns.dataset.unit = level.unit;
            for (const period of level.cells) {
                const date = new Date(period.anchor ?? period.start);
                const text = level.unit === "month" ? months.format(date)
                    : level.unit === "week" ? `${label("week")} ${dates.format(date)}`
                        : level.unit === "hour" ? clockTime(period.start)
                            : zoom === "hour" || zoom === "day" ? dates.format(date) : String(date.getUTCDate());
                const cell = element("div", "cf-date", text);
                cell.style.left = period.left / axis.width * 100 + "%";
                cell.style.width = period.width / axis.width * 100 + "%";
                cell.title = `${text} (${core.formatCivil(period.anchor ?? period.start).slice(0, 10)})`;
                if (zoom === "hour" && level.unit === "day") {
                    const window = axis.segments.find(segment => segment.start >= period.start && segment.start < period.end);
                    cell.textContent += ` (${clockTime(window.start)} - ${clockTime(window.end)})`;
                    cell.title = cell.textContent;
                }
                if (level.unit === "hour") cell.title = `${core.formatCivil(period.start)} - ${core.formatCivil(period.end)}`;
                cell.setAttribute("aria-label", cell.title);
                columns.append(cell);
            }
            axisHeader.append(columns);
        }
        header.append(axisHeader);
        grid.append(header);
        for (const resource of payload.resources) {
            if (resource.parent && collapsed.has(resource.parent)) continue;
            const row = element("div", "cf-row" + (resource.summary ? " cf-summary" : ""));
            row.classList.toggle("cf-child-resource", Boolean(resource.parent));
            const name = element("div", "cf-resource-label");
            if (resource.summary) {
                const toggle = button("", function () {
                    if (collapsed.has(resource.id)) collapsed.delete(resource.id);
                    else collapsed.add(resource.id);
                    renderBoard();
                });
                toggle.setAttribute("aria-expanded", String(!collapsed.has(resource.id)));
                const chevron = element("span", "cf-tree-chevron");
                chevron.setAttribute("aria-hidden", "true");
                toggle.append(chevron, element("span", "cf-resource-name", resource.name));
                name.append(toggle);
            } else name.append(element("span", "cf-resource-name", resource.name));
            if (resource.blocked) name.append(element("small", "cf-warning", label("blocked")));
            if (resource.missingCalendar) name.append(element("small", "cf-warning", label("missingCalendar")));
            if (resource.direct) name.title = label("direct");
            row.append(name);
            const timeline = element("div", "cf-timeline");
            renderNonWorkingTime(resource, timeline, axis, dayPositions);
            renderCapacity(resource, timeline, axis, dayPositions);
            if (!resource.summary) {
                timeline.dataset.resource = resource.id;
                const lane = element("div", "cf-lane");
                const items = payload.operations.filter(item => core.onTimeline(item) && item.resource === resource.id && matchesView(item));
                const placed = core.layout(items, viewStart, viewEnd, axis,
                    payload.excludeNonWorkingHours ? resource.windows : undefined);
                lane.style.height = Math.max(42, (1 + Math.max(-1, ...placed.map(entry => entry.track))) * 34 + 8) + "px";
                for (const entry of placed) {
                    const item = entry.item;
                    const bar = button(`${item.order} / ${item.operation}`, function (event) {
                        if (bar.dataset.suppressClick === "true") {
                            delete bar.dataset.suppressClick;
                            return;
                        }
                        select(item, true, additive(event) ? "toggle" : "replace");
                    }, "cf-operation cf-status-" + item.statusId);
                    if (item.positionLocked) bar.prepend(lockIcon());
                    bar.style.left = entry.left + "%";
                    bar.style.width = `max(12px, ${entry.width}%)`;
                    bar.style.top = (entry.track * 34 + 4) + "px";
                    bar.dataset.operation = item.id;
                    bar.classList.toggle("cf-no-working-portion", Boolean(entry.noWorkingPortion));
                    bar.classList.toggle("cf-pending", !item.confirmed && !item.finished);
                    bar.classList.toggle("cf-late", item.late);
                    bar.classList.toggle("cf-problem", item.problems.length > 0);
                    markSelection(bar, item.id);
                    bar.classList.toggle("cf-locked", item.positionLocked === true);
                    const canDrag = !entry.noWorkingPortion && item.editable && !item.positionLocked &&
                        (!axis.compressed || core.axisContains(axis, entry.start));
                    bar.classList.toggle("cf-editable", canDrag);
                    bar.setAttribute("aria-label", `${item.order} / ${item.operation} - ${item.description}${item.problems.length ? " - " + label("problem") : ""}${item.positionLocked ? " - " + label("positionLocked") : ""}`);
                    attachTooltip(bar, item, entry.noWorkingPortion ? label("noWorkingPortion") : item.editable && !item.positionLocked && !canDrag
                        ? label(payload.hideNonWorkingDays || payload.hideWeekends ? "hiddenClippedStart" : "hourClippedStart") : "");
                    if (canDrag) listen(bar, "pointerdown", event => dragBar(event, item, bar, lane, axis));
                    listen(bar, "dblclick", () => invoke("OperationOpenRequested", [item.id, true]));
                    lane.append(bar);
                }
                timeline.append(lane);
                lanes.push({ lane, placed });
            }
            row.append(timeline);
            grid.append(row);
            if (resource.summary && payload.hideUnscheduled !== true) {
                const unscheduled = payload.operations.filter(item => !core.onTimeline(item) &&
                    workCenterId(item) === resource.id && matchesView(item));
                if (unscheduled.length) grid.append(renderUnscheduledRow(resource, unscheduled, axis, lanes));
            }
        }
        board.append(grid);
        const stackLanes = () => lanes.forEach(({ lane, placed }) => stackLane(lane, placed));
        stackLanes();
        renderCurrentTime();
        renderRoutingLinks();
        linkObserver = new ResizeObserver(() => {
            stackLanes();
            renderRoutingLinks();
        });
        linkObserver.observe(grid);
    }

    function render() {
        closeContextMenu(false);
        hideTooltip();
        cancelPendingDrag();
        if (linkObserver) linkObserver.disconnect();
        if (controller) controller.abort();
        controller = new AbortController();
        root.replaceChildren();
        tooltip = element("div", "cf-operation-tooltip");
        tooltip.id = "cf-operation-tooltip";
        tooltip.setAttribute("role", "tooltip");
        tooltip.hidden = true;
        listen(tooltip, "pointerenter", () => clearTimeout(tooltipTimer));
        listen(tooltip, "pointerleave", deferHideTooltip);
        listen(document, "keydown", event => {
            if (event.key === "Escape") hideTooltip();
        });
        listen(document, "scroll", event => {
            if (!tooltip.contains(event.target)) hideTooltip();
            if (contextMenu && !contextMenu.contains(event.target)) closeContextMenu(false);
        }, { capture: true });
        listen(document, "pointerdown", event => {
            if (contextMenu && !contextMenu.contains(event.target)) closeContextMenu(false);
        }, { capture: true });
        listen(document, "focusin", event => {
            if (contextMenu && !contextMenu.contains(event.target)) closeContextMenu(false);
        });
        listen(window, "resize", () => { hideTooltip(); closeContextMenu(false); });
        listen(document, "visibilitychange", requestCurrentTime);
        const heading = element("div", "cf-heading");
        if (payload.scenario) heading.append(element("span", "cf-scenario",
            `${label("draftScenario")}: ${payload.scenario} - ${payload.scenarioName || ""}`));
        const zoomGroup = element("div", "cf-zoom");
        for (const level of ["hour", "day", "week", "month"]) {
            const control = button(label(level), function () {
                invoke("ViewModeChanged", [level]);
            });
            control.setAttribute("aria-pressed", String(zoom === level));
            zoomGroup.append(control);
        }
        heading.append(zoomGroup);
        root.append(heading);
        const selection = element("div", "cf-selection");
        selection.setAttribute("role", "toolbar");
        selection.setAttribute("aria-label", label("selectionToolbar"));
        selection.hidden = !payload.scenario;
        const count = element("output", "cf-selection-count");
        count.setAttribute("aria-live", "polite");
        selection.append(count);
        for (const [command, caption] of [["chain", "selectChain"], ["following", "selectFollowing"], ["clear", "clearSelection"]]) {
            const control = button(label(caption), () => selectOperations(command));
            control.dataset.selection = command;
            selection.append(control);
        }
        const lock = mutationButton(label("lockSelected"), () => requestSelectedLocks(true), false);
        lock.classList.add("cf-lock-selected");
        const unlock = mutationButton(label("unlockSelected"), () => requestSelectedLocks(false), false);
        unlock.classList.add("cf-unlock-selected");
        const status = element("span", "cf-draft-status");
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        selection.append(lock, unlock, status);
        root.append(selection);
        banner = element("div", "cf-banner");
        banner.setAttribute("role", "alert");
        banner.hidden = !lastError && !payload.warnings.length;
        banner.textContent = lastError || payload.warnings.join("\n");
        banner.classList.toggle("cf-error", Boolean(lastError));
        const searchLabel = element("label", "cf-search", label("search"));
        searchLabel.hidden = payload.showSearch !== true;
        const searchInput = element("input");
        searchInput.type = "search";
        searchInput.value = search;
        listen(searchInput, "input", function () {
            search = searchInput.value;
            renderBoard();
        });
        searchLabel.append(searchInput);
        root.append(banner, searchLabel);
        if (payload.focusNotice) root.append(element("p", "cf-scope cf-document-scope", payload.focusNotice));
        if (!payload.includeProblemSteps) {
            const hidden = payload.operations.filter(item => item.problems.length > 0).length;
            root.append(element("p", "cf-scope cf-problem-scope", label("problemScope").replace("%1", String(hidden))));
        }
        root.append(element("p", "cf-scope cf-hour-scope"));
        root.append(element("p", "cf-scope cf-nonworking-scope"));
        const dropHelp = element("p", "cf-scope cf-drop-help");
        dropHelp.hidden = true;
        dropHelp.setAttribute("aria-live", "polite");
        const routingScope = element("p", "cf-scope cf-routing-scope cf-visually-hidden");
        routingScope.setAttribute("aria-live", "polite");
        root.append(dropHelp, routingScope);
        board = element("div", "cf-board");
        board.tabIndex = 0;
        board.setAttribute("role", "region");
        board.setAttribute("aria-label", label("title"));
        listen(board, "scroll", saveViewState, { passive: true });
        listen(window, "pagehide", writeViewState);
        listen(board, "dragover", dragOverPending);
        listen(board, "drop", dropPending);
        listen(board, "dragleave", event => {
            if (!board.contains(event.relatedTarget)) clearDropPreview();
        });
        const navigation = renderNavigation();
        navigation.hidden = payload.showDisplayRange !== true;
        root.append(board, navigation);
        details = element("section", "cf-details");
        details.hidden = payload.showStepDetails !== true;
        details.setAttribute("aria-live", "polite");
        root.append(details, tooltip);
        renderDetails(activeItem());
        renderBoard();
        renderSelectionToolbar();
        renderDraftStatus();
        setBusy(busy);
    }

    function initialise() {
        closeContextMenu(false);
        hideTooltip();
        cancelPendingDrag();
        if (linkObserver) linkObserver.disconnect();
        clearInterval(clockTimer);
        generation += 1;
        if (controller) controller.abort();
        controller = new AbortController();
        root = document.getElementById("controlAddIn");
        if (!root) throw new Error("Business Central controlAddIn container was not found.");
        root.classList.add("cf-scheduler");
        root.replaceChildren();
        banner = element("div", "cf-banner");
        banner.setAttribute("role", "alert");
        root.append(banner);
        busy = false;
        stale = true;
        viewStateLoaded = false;
        invoke("ControlReady", []);
    }

    window.CFProductionScheduler = Object.freeze({ initialise });
    window.LoadSchedule = function (data) {
        try {
            if (typeof data === "string") data = JSON.parse(data);
            if (!data || !Array.isArray(data.resources) || !Array.isArray(data.operations) ||
                !Array.isArray(data.warnings) || !data.labels) throw new Error("Invalid scheduler payload.");
            if (data.scenario !== undefined && (typeof data.scenario !== "string" ||
                typeof data.scenarioName !== "string")) throw new Error("Invalid draft scenario.");
            if (data.operations.some(item => !item || !Array.isArray(item.lines) ||
                !Array.isArray(item.successors) || !Array.isArray(item.predecessors) ||
                !Array.isArray(item.problems) || item.problems.some(problem => typeof problem !== "string" || !problem) ||
                typeof item.orderScheduled !== "boolean" || typeof item.confirmed !== "boolean" ||
                typeof item.finished !== "boolean")) throw new Error("Invalid production routing details.");
            if (data.operations.some(item => (item.workCenter !== undefined && typeof item.workCenter !== "string") ||
                (item.workMinutes !== undefined && (!Number.isFinite(item.workMinutes) || item.workMinutes < 0)))) {
                throw new Error("Invalid unscheduled operation details.");
            }
            if (data.scenario && data.operations.some(item =>
                typeof item.canReset !== "boolean" || typeof item.canCommit !== "boolean" ||
                typeof item.draftChanged !== "boolean" || typeof item.positionLocked !== "boolean" ||
                [item.canLock, item.canUnlock].some(value => value !== undefined && typeof value !== "boolean"))) {
                throw new Error("Invalid draft operation permissions.");
            }
            if (data.operations.some(item => item.positionLocked !== undefined && typeof item.positionLocked !== "boolean")) {
                throw new Error("Invalid position lock.");
            }
            if (data.viewStateKey !== undefined && typeof data.viewStateKey !== "string") throw new Error("Invalid view state key.");
            if (payload && data.scenario !== payload.scenario) {
                selectedId = "";
                selectedIds = [];
                setDraftStatus("", "");
                previousClientView = undefined;
                collapsed.clear();
                search = "";
            }
            if (typeof data.hideNonWorkingDays !== "boolean") throw new Error("Invalid non-working-day display setting.");
            if (data.hideWeekends !== undefined && typeof data.hideWeekends !== "boolean") throw new Error("Invalid weekend display setting.");
            if (data.hideUnscheduled !== undefined && typeof data.hideUnscheduled !== "boolean") throw new Error("Invalid unscheduled display setting.");
            if (data.excludeNonWorkingHours !== undefined && typeof data.excludeNonWorkingHours !== "boolean") throw new Error("Invalid operation-duration display setting.");
            if (data.excludeNonWorkingHours && data.resources.some(resource => !Array.isArray(resource.windows))) throw new Error("Missing working calendar windows.");
            if (data.viewMode === "hour" && data.resources.some(resource => !Array.isArray(resource.windows))) {
                throw new Error("Missing working calendar windows for Hour view.");
            }
            if (typeof data.includeProblemSteps !== "boolean") throw new Error("Invalid problem-step display setting.");
            for (const option of ["showSearch", "showDisplayRange", "showStepDetails"]) {
                if (data[option] !== undefined && typeof data[option] !== "boolean") throw new Error("Invalid optional display setting.");
            }
            if (!Number.isFinite(core.parseCivil(data.currentTime))) throw new Error("Invalid Business Central current time.");
            if (typeof data.documentFocus !== "boolean" || typeof data.fitToWindow !== "boolean" ||
                typeof data.selectedOperationId !== "string" || typeof data.focusNotice !== "string" ||
                !["", "focus", "refocus", "restore"].includes(data.viewChange)) throw new Error("Invalid date-view settings.");
            core.timeAxis(data.viewMode, core.parseCivil(data.start), core.parseCivil(data.end), undefined,
                core.visibleDates(data.resources, core.parseCivil(data.start), core.parseCivil(data.end), data.hideNonWorkingDays, data.hideWeekends));
            const navigation = data.navigation;
            const bounds = core.rangeWindow(navigation.start, navigation.days, navigation.viewDays, navigation.offset);
            if (bounds.start !== data.start || bounds.end !== data.end) throw new Error("Schedule dates do not match the navigation window.");
            const retainViewport = board && payload && !data.viewChange &&
                data.scenario === payload.scenario && data.start === payload.start &&
                data.end === payload.end && data.viewMode === zoom;
            const viewport = retainViewport ? {
                left: board.scrollLeft, top: board.scrollTop,
                rootLeft: root.scrollLeft, rootTop: root.scrollTop,
                focusBoard: document.activeElement === board,
                focusedOperation: board.contains(document.activeElement) ? document.activeElement.dataset.operation : undefined
            } : null;
            if (data.viewChange === "focus" && !previousClientView) {
                previousClientView = { search, collapsed: [...collapsed], selectedId, selectedIds: [...selectedIds],
                    scrollTop: board?.scrollTop || 0, scrollLeft: board?.scrollLeft || 0 };
            }
            const restoring = data.viewChange === "restore" ? previousClientView : null;
            if (data.viewChange === "focus" || data.viewChange === "refocus") {
                search = "";
                collapsed.clear();
                selectedId = data.selectedOperationId;
                selectedIds = selectedId ? [selectedId] : [];
            } else if (restoring) {
                search = restoring.search;
                collapsed.clear();
                for (const id of restoring.collapsed) collapsed.add(id);
                selectedId = restoring.selectedId;
                selectedIds = [...restoring.selectedIds];
            }
            const key = data.viewStateKey || "";
            if (key !== viewStateKey) {
                viewStateKey = key;
                viewStateLoaded = false;
            }
            let stored = null;
            if (key && !viewStateLoaded) {
                viewStateLoaded = true;
                if (!data.viewChange) stored = readViewState(data);
            }
            if (stored) {
                selectedId = stored.selectedId;
                selectedIds = stored.selectedIds;
            }
            selectedIds = core.pruneSelection(selectedIds, data.operations);
            if (selectedId && !data.operations.some(item => item.id === selectedId)) selectedId = "";
            if (pendingSave) setDraftStatus("saved", "");
            if (data.showSearch !== true) search = "";
            payload = data;
            currentTime = data.currentTime;
            zoom = data.viewMode;
            stale = false;
            lastError = "";
            render();
            clearInterval(clockTimer);
            clockTimer = setInterval(requestCurrentTime, core.minute);
            if (restoring) {
                board.scrollTop = restoring.scrollTop;
                board.scrollLeft = restoring.scrollLeft;
                previousClientView = undefined;
            } else if (stored) {
                board.scrollLeft = stored.scrollLeft;
                board.scrollTop = stored.scrollTop;
            } else if (viewport) {
                board.scrollLeft = viewport.left;
                board.scrollTop = viewport.top;
                root.scrollLeft = viewport.rootLeft;
                root.scrollTop = viewport.rootTop;
                const focusedOperation = [...board.querySelectorAll(".cf-operation")]
                    .find(node => node.dataset.operation === viewport.focusedOperation);
                if (focusedOperation) focusedOperation.focus({preventScroll: true});
                else if (viewport.focusBoard) board.focus({preventScroll: true});
            }
            saveViewState();
        } catch (failure) {
            console.error("Production scheduler rendering failed.", failure);
            error(label("failed"));
        }
    };
    window.SetCurrentTime = function (value) {
        try {
            if (!Number.isFinite(core.parseCivil(value))) throw new Error("Invalid Business Central current time.");
            currentTime = value;
            renderCurrentTime();
        } catch (failure) {
            console.error("Production scheduler clock update failed.", failure);
            error(label("failed"));
        }
    };
    window.ShowError = error;
    window.SelectOperations = function (command) {
        try {
            selectOperations(command);
        } catch (failure) {
            console.error("Production scheduler selection failed.", failure);
            error(label("failed"));
        }
    };
    window.LockSelectedOperations = function (locked) {
        try {
            requestSelectedLocks(locked);
        } catch (failure) {
            console.error("Production scheduler lock request failed.", failure);
            error(label("failed"));
        }
    };
    window.SetDraftStatus = function (state, messageText) {
        try {
            if (!draftStates.includes(state) || (messageText !== undefined && typeof messageText !== "string")) {
                throw new Error("Invalid draft save status.");
            }
            setDraftStatus(state, messageText || "");
        } catch (failure) {
            console.error("Production scheduler status update failed.", failure);
            error(label("failed"));
        }
    };
}());
