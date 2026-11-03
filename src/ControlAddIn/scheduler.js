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
    let previousClientView;
    let search = "";
    let lastError = "";
    let zoom = "day";
    let busy = false;
    let stale = false;
    let generation = 0;
    const collapsed = new Set();
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
        if (!banner) return;
        banner.textContent = message;
        banner.classList.add("cf-error");
        banner.hidden = false;
        setBusy(false);
    }

    function invoke(name, args) {
        if (busy) return;
        const currentGeneration = generation;
        setBusy(true);
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

    function select(item, notify) {
        hideTooltip();
        selectedId = item.id;
        root.querySelectorAll("[data-operation]").forEach(node => {
            node.classList.toggle("cf-selected", node.dataset.operation === selectedId);
            node.setAttribute("aria-pressed", String(node.dataset.operation === selectedId));
        });
        renderDetails(item);
        renderRoutingLinks();
        if (notify && !busy) invoke("OperationSelected", [item.id]);
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
        }, item.editable));
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
        select(item, true);
        contextOwner = owner;
        contextMenu = element("div", "cf-context-menu");
        contextMenu.setAttribute("role", "menu");
        contextMenu.setAttribute("aria-label", `${item.order} / ${item.operation}`);
        contextMenu.tabIndex = -1;
        const actions = [
            ["details", "draftDetails", true],
            ["edit", "editDraft", item.editable],
            ["zoom", "zoomDocument", true],
            ["reset", "resetDraft", item.canReset === true],
            ["commit", "commitOrder", item.canCommit === true],
            ["order", "order", true]
        ];
        for (const [command, caption, allowed] of actions) {
            const control = mutationButton(label(caption), () => {
                closeContextMenu(false);
                invoke("OperationContextRequested", [item.id, item.version, command]);
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
        appendProblems(tooltip, item);
        if (warning) tooltip.append(element("p", "cf-warning", warning));
        tooltip.hidden = false;
        tooltip.scrollTop = 0;
        const anchor = owner.getBoundingClientRect();
        const rect = tooltip.getBoundingClientRect();
        const margin = 8;
        const below = anchor.bottom + margin;
        const top = below + rect.height <= window.innerHeight - margin ? below : anchor.top - rect.height - margin;
        tooltip.style.left = Math.max(margin, Math.min(anchor.left, window.innerWidth - rect.width - margin)) + "px";
        tooltip.style.top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin)) + "px";
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

    function renderUnconfirmed() {
        const section = element("section", "cf-unconfirmed");
        const pending = payload.operations.filter(item => !core.onTimeline(item) && matchesView(item));
        section.append(element("h2", "", `${label("unconfirmed")} (${pending.length})`));
        const list = element("div", "cf-pending-list");
        for (const item of pending) {
            const row = button(`${item.order} / ${item.operation} | ${item.item} | ${item.description}`,
                () => select(item, true), "cf-pending-item");
            row.dataset.operation = item.id;
            row.dataset.canDrag = String(item.editable);
            row.draggable = item.editable && !busy && !stale;
            row.classList.toggle("cf-selected", selectedId === item.id);
            row.classList.toggle("cf-problem", item.problems.length > 0);
            row.setAttribute("aria-pressed", String(selectedId === item.id));
            listen(row, "dragstart", event => {
                if (busy || stale || !item.editable || !event.dataTransfer) {
                    event.preventDefault();
                    return;
                }
                hideTooltip();
                pendingDrag = item;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-cf-production-operation", item.id);
            });
            listen(row, "dragend", cancelPendingDrag);
            attachTooltip(row, item);
            if (item.problems.length) row.append(element("span", "cf-problem-text", item.problems[0]));
            else if (item.issue) row.append(element("span", "cf-warning", item.issue));
            list.append(row);
        }
        if (!pending.length) list.append(element("p", "", label("empty")));
        section.append(list);
        return section;
    }

    function matchesView(item) {
        return core.operationVisible(item, search, payload.includeProblemSteps);
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
        if (help) help.textContent = label("dropHelp");
    }

    function pendingDrop(event) {
        if (!pendingDrag || busy || stale || !pendingDrag.editable || pendingDrag.confirmed) return null;
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
        const bars = new Map([...grid.querySelectorAll(".cf-operation")].map(bar => [bar.dataset.operation, bar]));
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
            const from = bars.get(edge.from);
            const to = bars.get(edge.to);
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
        for (const cell of resource.days) {
            const values = core.capacity(cell.available, cell.allocated);
            const box = element("div", "cf-capacity-day");
            const position = dayPositions.get(cell.date);
            if (!position) {
                const date = core.parseCivil(cell.date + "T00:00:00");
                if (axis.filtered && core.overlaps(date, date + core.day, axis.start, axis.end)) continue;
                throw new Error("Capacity date is outside the visible window.");
            }
            box.style.left = `${position.left / axis.width * 100}%`;
            box.style.width = `${position.width / axis.width * 100}%`;
            box.textContent = resource.direct
                ? hours.format(cell.allocated / 60)
                : `${hours.format(cell.allocated / 60)} / ${hours.format(cell.available / 60)}`;
            const parts = [`${cell.date}`, `${label("allocated")}: ${hours.format(cell.allocated)} ${label("minutes")}`];
            if (resource.direct) parts.push(label("direct"));
            else {
                parts.push(`${label("available")}: ${hours.format(cell.available)} ${label("minutes")}`);
                parts.push(`${label("remaining")}: ${hours.format(values.remaining)} ${label("minutes")}`);
                if (values.percent !== null) parts.push(`${hours.format(values.percent)}%`);
                box.classList.toggle("cf-overload", values.overloaded);
                box.classList.toggle("cf-no-capacity", cell.available === 0 && !values.overloaded);
            }
            box.title = parts.join("\n");
            box.setAttribute("aria-label", parts.join(", "));
            strip.append(box);
        }
        timeline.append(strip);
    }

    function dragBar(event, item, bar, lane, axis) {
        if (event.button !== 0 || event.isPrimary === false || !core.onTimeline(item) || !item.editable || stale || busy) return;
        if (axis.compressed && !core.axisContains(axis, core.parseCivil(item.start))) return;
        hideTooltip();
        closeContextMenu(false);
        const origin = event.clientX;
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
                bar.style.transform = `translateX(${delta}px)`;
                bar.classList.add("cf-dragging");
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
            bar.style.transform = "";
            bar.classList.remove("cf-dragging");
            renderRoutingLinks();
            if (moved && endEvent.type === "pointerup") {
                bar.dataset.suppressClick = "true";
                const next = core.draggedAxisStart(axis, core.parseCivil(item.start), delta, width);
                if (!next) {
                    banner.textContent = label(payload.hideNonWorkingDays ? "hiddenDragRange" : "hourDragRange");
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
        const visibleDates = payload.hideNonWorkingDays ? core.workingDates(payload.resources) : undefined;
        const axis = core.timeAxis(zoom, viewStart, viewEnd, payload.hourWindows, visibleDates);
        const dayPositions = new Map(axis.days.map(day => [core.formatCivil(day.start).slice(0, 10), day]));
        currentAxis = axis;
        const dayScope = root.querySelector(".cf-nonworking-scope");
        dayScope.hidden = !payload.hideNonWorkingDays;
        if (payload.hideNonWorkingDays) {
            const dayAxis = core.timeAxis("day", viewStart, viewEnd, undefined, visibleDates);
            const hiddenOperations = payload.operations.filter(item => core.onTimeline(item) && matchesView(item) &&
                core.overlaps(core.parseCivil(item.start), core.parseCivil(item.end), viewStart, viewEnd) &&
                !core.axisClip(dayAxis, core.parseCivil(item.start), core.parseCivil(item.end))).length;
            const hiddenLoadDays = new Set(payload.resources.flatMap(resource => resource.days)
                .filter(cell => cell.allocated > 0 && !visibleDates.includes(cell.date)).map(cell => cell.date)).size;
            const values = [String((viewEnd - viewStart) / core.day - dayAxis.days.length), String(hiddenOperations), String(hiddenLoadDays)];
            dayScope.textContent = label("nonWorkingScope").replace(/%([123])/g, (_, index) => values[Number(index) - 1]);
        }
        const hourScope = root.querySelector(".cf-hour-scope");
        hourScope.hidden = zoom !== "hour";
        const hourAxis = zoom === "hour" && payload.hideNonWorkingDays
            ? core.timeAxis(zoom, viewStart, viewEnd, payload.hourWindows) : axis;
        const outsideHours = payload.operations.filter(item => core.onTimeline(item) && matchesView(item) &&
            core.overlaps(core.parseCivil(item.start), core.parseCivil(item.end), viewStart, viewEnd) &&
            !core.axisClip(hourAxis, core.parseCivil(item.start), core.parseCivil(item.end))).length;
        hourScope.textContent = label("hourScope").replace("%1", String(outsideHours));
        if (axis.duration === 0) {
            const empty = element("p", "cf-empty-calendar", label("noWorkingDays"));
            empty.setAttribute("role", "status");
            board.append(empty);
            renderRoutingLinks();
            return;
        }
        const grid = element("div", "cf-grid");
        grid.classList.toggle("cf-month-view", zoom === "month");
        grid.classList.toggle("cf-fit-overview", payload.fitToWindow && axis.days.length > 31);
        if (axis.ticks.every(tick => Math.abs(tick.width - axis.tickWidth) < 0.000001)) {
            grid.style.setProperty("--cf-grid-lines", `repeating-linear-gradient(to right, #cbd4d6 0, #cbd4d6 1px, transparent 1px, transparent ${axis.tickWidth / axis.width * 100}%)`);
        } else {
            const stops = axis.ticks.map(tick => {
                const left = tick.left / axis.width * 100;
                return `transparent ${left}%, #cbd4d6 ${left}%, #cbd4d6 calc(${left}% + 1px), transparent calc(${left}% + 1px)`;
            });
            grid.style.setProperty("--cf-grid-lines", `linear-gradient(to right, ${stops.join(", ")})`);
        }
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
            renderCapacity(resource, timeline, axis, dayPositions);
            if (!resource.summary) {
                timeline.dataset.resource = resource.id;
                const lane = element("div", "cf-lane");
                const items = payload.operations.filter(item => core.onTimeline(item) && item.resource === resource.id && matchesView(item));
                const placed = core.layout(items, viewStart, viewEnd, axis);
                lane.style.height = Math.max(42, (1 + Math.max(-1, ...placed.map(entry => entry.track))) * 34 + 8) + "px";
                for (const interval of resource.windows) {
                    const position = core.axisClip(axis, core.parseCivil(interval.start), core.parseCivil(interval.end));
                    if (position) {
                        const working = element("div", "cf-working");
                        working.style.left = position.left + "%";
                        working.style.width = position.width + "%";
                        lane.append(working);
                    }
                }
                for (const entry of placed) {
                    const item = entry.item;
                    const bar = button(`${item.order} / ${item.operation}`, function () {
                        if (bar.dataset.suppressClick === "true") {
                            delete bar.dataset.suppressClick;
                            return;
                        }
                        select(item, true);
                    }, "cf-operation cf-status-" + item.statusId);
                    bar.style.left = entry.left + "%";
                    bar.style.width = `max(12px, ${entry.width}%)`;
                    bar.style.top = (entry.track * 34 + 4) + "px";
                    bar.dataset.operation = item.id;
                    bar.classList.toggle("cf-pending", !item.confirmed && !item.finished);
                    bar.classList.toggle("cf-late", item.late);
                    bar.classList.toggle("cf-problem", item.problems.length > 0);
                    bar.classList.toggle("cf-selected", selectedId === item.id);
                    bar.setAttribute("aria-pressed", String(selectedId === item.id));
                    const canDrag = item.editable && (!axis.compressed || core.axisContains(axis, entry.start));
                    bar.classList.toggle("cf-editable", canDrag);
                    bar.setAttribute("aria-label", `${item.order} / ${item.operation} - ${item.description}${item.problems.length ? " - " + label("problem") : ""}`);
                    attachTooltip(bar, item, item.editable && !canDrag
                        ? label(payload.hideNonWorkingDays ? "hiddenClippedStart" : "hourClippedStart") : "");
                    listen(bar, "pointerdown", event => dragBar(event, item, bar, lane, axis));
                    listen(bar, "dblclick", () => invoke("OperationOpenRequested", [item.id, true]));
                    lane.append(bar);
                }
                timeline.append(lane);
            }
            row.append(timeline);
            grid.append(row);
        }
        board.append(grid);
        renderCurrentTime();
        renderRoutingLinks();
        linkObserver = new ResizeObserver(renderRoutingLinks);
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
        heading.append(element("h1", "", label("title")));
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
        banner = element("div", "cf-banner");
        banner.setAttribute("role", "alert");
        banner.hidden = !lastError && !payload.warnings.length;
        banner.textContent = lastError || payload.warnings.join("\n");
        banner.classList.toggle("cf-error", Boolean(lastError));
        const searchLabel = element("label", "cf-search", label("search"));
        const searchInput = element("input");
        searchInput.type = "search";
        searchInput.value = search;
        listen(searchInput, "input", function () {
            search = searchInput.value;
            root.querySelector(".cf-unconfirmed").replaceWith(renderUnconfirmed());
            renderBoard();
        });
        searchLabel.append(searchInput);
        root.append(banner, element("p", "cf-scope", payload.scope),
            element("p", "cf-scope", payload.timeZone), searchLabel, renderUnconfirmed());
        if (payload.focusNotice) root.append(element("p", "cf-scope cf-document-scope", payload.focusNotice));
        root.append(element("p", "cf-legend", label("legend")));
        if (!payload.includeProblemSteps) {
            const hidden = payload.operations.filter(item => item.problems.length > 0).length;
            root.append(element("p", "cf-scope cf-problem-scope", label("problemScope").replace("%1", String(hidden))));
        }
        root.append(element("p", "cf-scope cf-hour-scope"));
        root.append(element("p", "cf-scope cf-nonworking-scope"));
        const dropHelp = element("p", "cf-scope cf-drop-help", label("dropHelp"));
        dropHelp.setAttribute("aria-live", "polite");
        const routingScope = element("p", "cf-scope cf-routing-scope");
        routingScope.setAttribute("aria-live", "polite");
        root.append(dropHelp, routingScope);
        board = element("div", "cf-board");
        board.tabIndex = 0;
        board.setAttribute("role", "region");
        board.setAttribute("aria-label", label("title"));
        listen(board, "dragover", dragOverPending);
        listen(board, "drop", dropPending);
        listen(board, "dragleave", event => {
            if (!board.contains(event.relatedTarget)) clearDropPreview();
        });
        root.append(board, renderNavigation());
        details = element("section", "cf-details");
        details.setAttribute("aria-live", "polite");
        root.append(details, tooltip);
        renderDetails(payload.operations.find(item => item.id === selectedId &&
            (payload.includeProblemSteps || item.problems.length === 0)));
        renderBoard();
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
            if (data.scenario && data.operations.some(item =>
                typeof item.canReset !== "boolean" || typeof item.canCommit !== "boolean" ||
                typeof item.draftChanged !== "boolean")) throw new Error("Invalid draft operation permissions.");
            if (payload && data.scenario !== payload.scenario) {
                selectedId = "";
                previousClientView = undefined;
                collapsed.clear();
                search = "";
            }
            if (typeof data.hideNonWorkingDays !== "boolean") throw new Error("Invalid non-working-day display setting.");
            if (typeof data.includeProblemSteps !== "boolean") throw new Error("Invalid problem-step display setting.");
            if (!Number.isFinite(core.parseCivil(data.currentTime))) throw new Error("Invalid Business Central current time.");
            if (typeof data.documentFocus !== "boolean" || typeof data.fitToWindow !== "boolean" ||
                typeof data.selectedOperationId !== "string" || typeof data.focusNotice !== "string" ||
                !["", "focus", "refocus", "restore"].includes(data.viewChange)) throw new Error("Invalid date-view settings.");
            core.timeAxis(data.viewMode, core.parseCivil(data.start), core.parseCivil(data.end), data.hourWindows,
                data.hideNonWorkingDays ? core.workingDates(data.resources) : undefined);
            const navigation = data.navigation;
            const bounds = core.rangeWindow(navigation.start, navigation.days, navigation.viewDays, navigation.offset);
            if (bounds.start !== data.start || bounds.end !== data.end) throw new Error("Schedule dates do not match the navigation window.");
            if (data.viewChange === "focus" && !previousClientView) {
                previousClientView = { search, collapsed: [...collapsed], selectedId,
                    scrollTop: board?.scrollTop || 0, scrollLeft: board?.scrollLeft || 0 };
            }
            const restoring = data.viewChange === "restore" ? previousClientView : null;
            if (data.viewChange === "focus" || data.viewChange === "refocus") {
                search = "";
                collapsed.clear();
                selectedId = data.selectedOperationId;
            } else if (restoring) {
                search = restoring.search;
                collapsed.clear();
                for (const id of restoring.collapsed) collapsed.add(id);
                selectedId = restoring.selectedId;
            }
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
            }
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
}());
