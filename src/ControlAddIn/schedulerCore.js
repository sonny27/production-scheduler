(function (root, factory) {
    "use strict";
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.CFSchedulerCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const minute = 60000;
    const day = 86400000;

    // Civil timestamps use a UTC coordinate system only for arithmetic. They are
    // BC session wall times, never converted through the browser's time zone.
    function parseCivil(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(value || "");
        if (!match) return NaN;
        const [, y, m, d, h, min, s] = match.map(Number);
        const date = new Date(0);
        date.setUTCFullYear(y, m - 1, d);
        date.setUTCHours(h, min, s, 0);
        const result = date.getTime();
        return formatCivil(result) === value ? result : NaN;
    }

    function formatCivil(value) {
        if (!Number.isFinite(value)) return "";
        const date = new Date(value);
        if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return "";
        return date.toISOString().slice(0, 19);
    }

    function overlaps(start, end, viewStart, viewEnd) {
        return Number.isFinite(start) && Number.isFinite(end) &&
            end > start && start < viewEnd && end > viewStart;
    }

    function clip(start, end, viewStart, viewEnd) {
        if (!overlaps(start, end, viewStart, viewEnd)) return null;
        const span = viewEnd - viewStart;
        return {
            left: (Math.max(start, viewStart) - viewStart) / span * 100,
            width: (Math.min(end, viewEnd) - Math.max(start, viewStart)) / span * 100
        };
    }

    function layout(items, viewStart, viewEnd, axis) {
        const visible = items.map(item => ({
            item, start: parseCivil(item.start), end: parseCivil(item.end)
        })).map(entry => ({
            ...entry, position: axis ? axisClip(axis, entry.start, entry.end) : clip(entry.start, entry.end, viewStart, viewEnd)
        })).filter(entry => entry.position)
            .sort((a, b) => a.start - b.start || a.end - b.end || a.item.id.localeCompare(b.item.id));
        const trackEnds = [];
        return visible.map(entry => {
            let track = trackEnds.findIndex(end => end <= entry.start);
            if (track < 0) track = trackEnds.length;
            trackEnds[track] = entry.end;
            return { ...entry, track, ...entry.position };
        });
    }

    function capacity(available, allocated) {
        if (!Number.isFinite(available) || !Number.isFinite(allocated)) {
            throw new TypeError("Capacity values must be finite numbers.");
        }
        return {
            remaining: allocated === 0 ? available : available - allocated,
            percent: available > 0 ? allocated / available * 100 : null,
            overloaded: allocated > available + 0.001
        };
    }

    function operationVisible(item, search, includeProblemSteps) {
        return (includeProblemSteps || item.problems.length === 0) &&
            (!search || `${item.order} ${item.item} ${item.operation} ${item.description}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    }

    function onTimeline(item) {
        return item.confirmed === true || item.finished === true;
    }

    function draggedStart(start, deltaPixels, width, span) {
        if (!Number.isFinite(start) || !Number.isFinite(deltaPixels) ||
            !Number.isFinite(width) || width <= 0 || !Number.isFinite(span) || span <= 0) {
            return "";
        }
        const snappedDelta = Math.round(deltaPixels / width * span / (15 * minute)) * 15 * minute;
        return formatCivil(start + snappedDelta);
    }

    function inputToCivil(value) {
        const full = value && value.length === 16 ? value + ":00" : value;
        return Number.isFinite(parseCivil(full)) ? full : "";
    }

    function axisPosition(axis, time) {
        let position = 0;
        for (const segment of axis.segments) {
            if (time <= segment.start) break;
            position += Math.min(time, segment.end) - segment.start;
            if (time < segment.end) break;
        }
        return position;
    }

    function axisClip(axis, start, end) {
        if (!overlaps(start, end, axis.start, axis.end)) return null;
        const left = axisPosition(axis, start);
        const right = axisPosition(axis, end);
        return right > left ? { left: left / axis.duration * 100, width: (right - left) / axis.duration * 100 } : null;
    }

    function axisContains(axis, time) {
        return axis.segments.some(segment => time >= segment.start && time < segment.end);
    }

    function currentTimePosition(axis, value) {
        const time = parseCivil(value);
        if (!Number.isFinite(time)) throw new RangeError("Invalid Business Central current time.");
        return axisContains(axis, time) ? axisPosition(axis, time) / axis.duration * 100 : null;
    }

    function draggedAxisStart(axis, start, deltaPixels, width) {
        if (!axis.compressed) return draggedStart(start, deltaPixels, width, axis.end - axis.start);
        if (!axisContains(axis, start) || !Number.isFinite(deltaPixels) || !Number.isFinite(width) || width <= 0) return "";
        const delta = Math.round(deltaPixels / width * axis.duration / (15 * minute)) * 15 * minute;
        if (delta === 0) return formatCivil(start);
        return formatCivil(axisTimeAt(axis, axisPosition(axis, start) + delta));
    }

    function axisTimeAt(axis, target) {
        if (target < 0 || target >= axis.duration) return NaN;
        for (const segment of axis.segments) {
            const length = segment.end - segment.start;
            if (target < length) return segment.start + target;
            target -= length;
        }
        return NaN;
    }

    function droppedAxisStart(axis, pixels, width) {
        if (!Number.isFinite(pixels) || !Number.isFinite(width) || width <= 0 || pixels < 0 || pixels >= width) return "";
        const time = axisTimeAt(axis, pixels / width * axis.duration);
        const segment = axis.segments.find(entry => time >= entry.start && time < entry.end);
        if (!segment) return "";
        const snap = 15 * minute;
        const last = Math.max(segment.start, Math.floor((segment.end - 1000) / snap) * snap);
        return formatCivil(Math.max(segment.start, Math.min(last, Math.round(time / snap) * snap)));
    }

    function routingLinks(operations, selectedId, documentFocus = false) {
        const selected = operations.find(item => item.id === selectedId);
        if (!selected) return { enabled: false, edges: [] };
        const order = operations.filter(item => item.order === selected.order && item.statusId === selected.statusId);
        if (!documentFocus && !order.some(item => item.orderScheduled || item.confirmed)) return { enabled: false, edges: [] };
        const all = new Map(operations.map(item => [item.id, item]));
        const edges = new Map();
        function add(from, to, origin) {
            if (from === to) return;
            for (const id of [from, to]) {
                const other = all.get(id);
                if (other && (other.order !== origin.order || other.statusId !== origin.statusId ||
                    other.routingReference !== origin.routingReference || other.routingNo !== origin.routingNo)) return;
            }
            edges.set(JSON.stringify([from, to]), { from, to });
        }
        for (const item of order) {
            for (const id of item.successors) add(item.id, id, item);
            for (const id of item.predecessors) add(id, item.id, item);
        }
        return { enabled: true, edges: [...edges.values()] };
    }

    function workingDates(resources) {
        const dates = new Set();
        for (const resource of resources) {
            for (const cell of resource.days) {
                capacity(cell.available, cell.allocated);
                if (!Number.isFinite(parseCivil(cell.date + "T00:00:00"))) throw new RangeError("Invalid calendar date.");
                if (cell.available > 0) dates.add(cell.date);
            }
        }
        return [...dates].sort();
    }

    function timeAxis(view, start, end, hourWindows, visibleDates) {
        const widths = { hour: 1152, day: 160, week: 65, month: 28 };
        if (!Object.hasOwn(widths, view) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
            throw new RangeError("Invalid timeline view or date range.");
        }
        const dayWidth = widths[view];
        const interval = view === "hour" ? 60 * minute : day;
        if (visibleDates !== undefined && (!Array.isArray(visibleDates) ||
            visibleDates.some(date => typeof date !== "string" || !Number.isFinite(parseCivil(date + "T00:00:00"))))) {
            throw new RangeError("Visible calendar dates must be valid civil dates.");
        }
        const visible = visibleDates === undefined ? null : new Set(visibleDates);
        const axis = { view, start, end, filtered: visible !== null, segments: [] };
        if (view === "hour") {
            if (!Array.isArray(hourWindows) || hourWindows.length !== 7 ||
                hourWindows.some(window => !window || !Number.isInteger(window.start) || !Number.isInteger(window.end) ||
                    window.start < 0 || window.end > day || window.end <= window.start)) {
                throw new RangeError("Seven valid weekday display windows are required.");
            }
        }
        if (view === "hour" || visible) {
            const date = new Date(start);
            date.setUTCHours(0, 0, 0, 0);
            for (let cursor = date.getTime(); cursor < end; cursor += day) {
                if (visible && !visible.has(formatCivil(cursor).slice(0, 10))) continue;
                const window = view === "hour" ? hourWindows[(new Date(cursor).getUTCDay() + 6) % 7] : { start: 0, end: day };
                const from = Math.max(start, cursor + window.start);
                const to = Math.min(end, cursor + window.end);
                if (to > from) {
                    const previous = axis.segments[axis.segments.length - 1];
                    if (view !== "hour" && previous && previous.end === from) previous.end = to;
                    else axis.segments.push({ start: from, end: to });
                }
            }
        } else axis.segments.push({ start, end });
        axis.duration = axis.segments.reduce((total, segment) => total + segment.end - segment.start, 0);
        if (axis.duration <= 0 && !visible) throw new RangeError("No configured hours fall within the timeline range.");
        axis.compressed = view === "hour" || axis.duration < end - start;
        const scale = dayWidth / day;
        axis.width = axis.duration * scale;
        const period = (from, to) => ({
            start: from, end: to,
            left: axisPosition(axis, from) * scale,
            width: (axisPosition(axis, to) - axisPosition(axis, from)) * scale
        });
        const ticks = [];
        for (const segment of axis.segments) {
            for (let cursor = segment.start; cursor < segment.end;) {
                const boundary = Math.min((Math.floor(cursor / interval) + 1) * interval, segment.end);
                ticks.push(period(cursor, boundary));
                cursor = boundary;
            }
        }
        const levels = [];
        let parents = [{ start, end }];
        for (const unit of view === "hour" ? ["week", "day"] : ["month", "week"]) {
            const cells = [];
            for (const parent of parents) {
                let cursor = parent.start;
                while (cursor < parent.end) {
                    const anchor = new Date(cursor);
                    anchor.setUTCHours(0, 0, 0, 0);
                    let next;
                    if (unit === "day") {
                        next = anchor.getTime() + day;
                    } else if (unit === "week") {
                        anchor.setUTCDate(anchor.getUTCDate() - (anchor.getUTCDay() + 6) % 7);
                        next = anchor.getTime() + 7 * day;
                    } else {
                        anchor.setUTCDate(1);
                        const nextMonth = new Date(anchor);
                        nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
                        next = nextMonth.getTime();
                    }
                    // A week spanning two months is split under its respective month headers.
                    const boundary = Math.min(next, parent.end);
                    const cell = { ...period(cursor, boundary), anchor: anchor.getTime() };
                    if (cell.width > 0) cells.push(cell);
                    cursor = boundary;
                }
            }
            levels.push({ unit, cells });
            parents = cells;
        }
        levels.push({ unit: view === "hour" ? "hour" : "day", cells: ticks });
        const days = [];
        for (let cursor = start; cursor < end; cursor += day) {
            const cell = period(cursor, Math.min(cursor + day, end));
            if (cell.width > 0) days.push(cell);
        }
        return { ...axis, dayWidth, tickWidth: interval / day * dayWidth, ticks, levels, days };
    }

    function rangeWindow(start, days, viewDays, offset) {
        const first = parseCivil(start);
        if (!Number.isFinite(first) || !start.endsWith("T00:00:00") ||
            !Number.isInteger(days) || days < 1 || days > 366 ||
            !Number.isInteger(viewDays) || viewDays < 1 || viewDays > 366 || viewDays > days ||
            !Number.isInteger(offset) || offset < 0 || offset > days - viewDays ||
            !formatCivil(first + days * day)) {
            throw new RangeError("Invalid display navigation range.");
        }
        return {
            start: formatCivil(first + offset * day),
            end: formatCivil(first + (offset + viewDays) * day),
            rangeEnd: formatCivil(first + days * day),
            lastOffset: days - viewDays
        };
    }

    return Object.freeze({ minute, day, parseCivil, formatCivil, overlaps, clip, layout, capacity, operationVisible, onTimeline, draggedStart, inputToCivil, timeAxis, rangeWindow,
        axisPosition, axisClip, axisContains, currentTimePosition, draggedAxisStart, droppedAxisStart, routingLinks, workingDates });
}));
