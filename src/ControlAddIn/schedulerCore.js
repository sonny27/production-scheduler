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

    function layout(items, viewStart, viewEnd, axis, workingWindows) {
        const windows = workingWindows === undefined ? undefined : mergeWorkingWindows(workingWindows);
        const visible = items.map(item => ({
            item, start: parseCivil(item.start), end: parseCivil(item.end)
        })).map(entry => ({
            ...entry, position: axis ? axisClip(axis, entry.start, entry.end) : clip(entry.start, entry.end, viewStart, viewEnd)
        })).filter(entry => entry.position)
            .sort((a, b) => a.start - b.start || a.end - b.end || a.item.id.localeCompare(b.item.id));
        const trackEnds = [];
        return visible.flatMap(entry => {
            let track = trackEnds.findIndex(end => end <= entry.start);
            if (track < 0) track = trackEnds.length;
            trackEnds[track] = entry.end;
            const placed = { ...entry, track, ...entry.position };
            if (windows === undefined) return [placed];
            const parts = windows.flatMap(window => {
                const start = Math.max(entry.start, window.start);
                const end = Math.min(entry.end, window.end);
                const position = axis ? axisClip(axis, start, end) : clip(start, end, viewStart, viewEnd);
                return position ? [{...placed, ...position, segmentStart: start, segmentEnd: end}] : [];
            });
            return parts.length ? parts : [{...placed, width: 0, noWorkingPortion: true}];
        });
    }

    function stackRenderedOperations(entries, timelineWidth) {
        if (!Number.isFinite(timelineWidth) || timelineWidth <= 0) throw new RangeError("Invalid timeline width.");
        const operations = new Map();
        for (const entry of entries) {
            const left = entry.left / 100 * timelineWidth;
            const right = left + Math.max(12, entry.width / 100 * timelineWidth);
            const operation = operations.get(entry.item.id);
            if (operation) {
                operation.left = Math.min(operation.left, left);
                operation.right = Math.max(operation.right, right);
            } else operations.set(entry.item.id, { entry, left, right });
        }
        const tracks = [];
        const assigned = new Map();
        const sorted = [...operations.values()].sort((a, b) =>
            a.entry.start - b.entry.start || a.entry.end - b.entry.end || a.entry.item.id.localeCompare(b.entry.item.id));
        for (const operation of sorted) {
            // Minimum-width markers and compressed dates can collide without a time overlap.
            let track = tracks.findIndex(previous =>
                previous.end <= operation.entry.start && previous.right + 2 <= operation.left);
            if (track < 0) track = tracks.length;
            tracks[track] = { end: operation.entry.end, right: operation.right };
            assigned.set(operation.entry.item.id, track);
        }
        return entries.map(entry => ({ ...entry, track: assigned.get(entry.item.id) }));
    }

    function nonWorkingSegments(axis, workingWindows) {
        if (!axis || !Number.isFinite(axis.duration) || axis.duration <= 0 ||
            !Array.isArray(axis.segments)) return [];
        const windows = mergeWorkingWindows(workingWindows);
        return axis.segments.flatMap(segment => {
            const result = [];
            let cursor = segment.start;
            for (const window of windows) {
                if (window.end <= cursor || window.start >= segment.end) continue;
                if (window.start > cursor) result.push({start: cursor, end: Math.min(window.start, segment.end)});
                cursor = Math.max(cursor, window.end);
                if (cursor >= segment.end) break;
            }
            if (cursor < segment.end) result.push({start: cursor, end: segment.end});
            return result.filter(interval => interval.end > interval.start).map(interval => ({
                ...interval,
                left: axisPosition(axis, interval.start) / axis.duration * 100,
                width: (axisPosition(axis, interval.end) - axisPosition(axis, interval.start)) / axis.duration * 100
            }));
        });
    }

    function unscheduledLayout(items, axis) {
        if (!axis || !Number.isFinite(axis.duration) || axis.duration <= 0 || !axis.segments.length) return [];
        const projected = [];
        const originals = new Map();
        for (const item of items) {
            const start = parseCivil(item.start);
            const end = parseCivil(item.end);
            const hasDates = Number.isFinite(start) && Number.isFinite(end) && end > start;
            if (hasDates && !overlaps(start, end, axis.start, axis.end)) continue;
            if (item.workMinutes !== undefined &&
                (!Number.isFinite(item.workMinutes) || item.workMinutes < 0)) {
                throw new RangeError("Invalid unscheduled operation duration.");
            }
            let duration = Number.isFinite(item.workMinutes) ? item.workMinutes * minute
                : hasDates ? end - start : 0;
            if (duration <= 0 && hasDates) duration = end - start;
            if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Invalid unscheduled operation duration.");
            const position = hasDates ? axisPosition(axis, start) : 0;
            if (position >= axis.duration) continue;
            const endPosition = Math.min(axis.duration, position + duration);
            if (endPosition <= position) continue;
            const projectedStart = axisTimeAt(axis, position);
            const projectedEnd = endPosition === axis.duration
                ? axis.segments.at(-1).end
                : axisTimeAt(axis, endPosition);
            if (!Number.isFinite(projectedStart) || !Number.isFinite(projectedEnd) || projectedEnd <= projectedStart) continue;
            const projectedItem = {
                ...item,
                start: formatCivil(projectedStart),
                end: formatCivil(projectedEnd)
            };
            projected.push(projectedItem);
            originals.set(item.id, item);
        }
        return layout(projected, axis.start, axis.end, axis)
            .map(entry => ({...entry, item: originals.get(entry.item.id)}));
    }

    function mergeWorkingWindows(windows) {
        if (!Array.isArray(windows)) throw new TypeError("Working calendar windows must be an array.");
        const sorted = windows.map(window => {
            const start = parseCivil(window.start);
            const end = parseCivil(window.end);
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new RangeError("Invalid working calendar interval.");
            return {start, end};
        }).sort((a, b) => a.start - b.start || a.end - b.end);
        const merged = [];
        for (const window of sorted) {
            const previous = merged.at(-1);
            if (previous && window.start <= previous.end) previous.end = Math.max(previous.end, window.end);
            else merged.push({...window});
        }
        return merged;
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

    function capacityFill(available, allocated) {
        const values = capacity(available, allocated);
        return {
            loaded: allocated > 0,
            percent: allocated > 0 ? Math.max(0, Math.min(100, values.percent ?? 100)) : 0,
            overloaded: allocated > 0 && values.overloaded
        };
    }

    function hourlyCapacity(axis, calendarWindows, loadWindows) {
        if (!axis || axis.view !== "hour") throw new RangeError("Hourly capacity requires an Hour axis.");
        const cells = axis.ticks.map(tick => ({...tick, available: 0, allocated: 0}));
        function accumulate(windows, field) {
            if (!Array.isArray(windows)) throw new TypeError("Timed capacity windows must be an array.");
            for (const window of windows) {
                const start = parseCivil(window.start);
                const end = parseCivil(window.end);
                if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
                    !Number.isFinite(window.minutes) || window.minutes < 0) {
                    throw new RangeError("Invalid timed capacity interval.");
                }
                let low = 0;
                let high = cells.length;
                while (low < high) {
                    const middle = Math.floor((low + high) / 2);
                    if (cells[middle].end <= start) low = middle + 1;
                    else high = middle;
                }
                for (let index = low; index < cells.length && cells[index].start < end; index++) {
                    const cell = cells[index];
                    const overlap = Math.min(end, cell.end) - Math.max(start, cell.start);
                    if (overlap > 0) cell[field] += window.minutes * overlap / (end - start);
                }
            }
        }
        accumulate(calendarWindows, "available");
        accumulate(loadWindows, "allocated");
        return cells;
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

    function sameRouting(a, b) {
        return Boolean(a && b) && a.statusId === b.statusId && a.order === b.order &&
            a.routingReference === b.routingReference && a.routingNo === b.routingNo;
    }

    function routingChain(operations, id) {
        const origin = operations.find(item => item.id === id);
        return origin ? operations.filter(item => sameRouting(item, origin)).map(item => item.id) : [];
    }

    function followingSteps(operations, id) {
        const origin = operations.find(item => item.id === id);
        if (!origin) return [];
        const routing = new Map(operations.filter(item => sameRouting(item, origin)).map(item => [item.id, item]));
        const result = new Set([origin.id]);
        const queue = [origin];
        while (queue.length) {
            const item = queue.shift();
            const next = [...item.successors];
            for (const other of routing.values()) if (other.predecessors.includes(item.id)) next.push(other.id);
            for (const nextId of next) {
                const successor = routing.get(nextId);
                if (successor && !result.has(nextId)) {
                    result.add(nextId);
                    queue.push(successor);
                }
            }
        }
        return operations.filter(item => result.has(item.id)).map(item => item.id);
    }

    function toggleSelection(ids, id) {
        return ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
    }

    function pruneSelection(ids, operations) {
        const known = new Set(operations.map(item => item.id));
        return [...new Set(ids)].filter(id => known.has(id));
    }

    function lockRequest(operations, ids) {
        const byId = new Map(operations.map(item => [item.id, item]));
        return [...new Set(ids)].filter(id => byId.has(id)).map(id => ({ id, version: byId.get(id).version }));
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

    function visibleDates(resources, start, end, hideNonWorkingDays, hideWeekends) {
        if (!hideNonWorkingDays && !hideWeekends) return undefined;
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new RangeError("Invalid visible date range.");
        const working = hideNonWorkingDays ? new Set(workingDates(resources)) : null;
        const dates = [];
        for (let cursor = start; cursor < end; cursor += day) {
            const date = formatCivil(cursor).slice(0, 10);
            if (hideWeekends && [0, 6].includes(new Date(cursor).getUTCDay())) continue;
            if (!working || working.has(date)) dates.push(date);
        }
        return dates;
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
        if (view === "hour" && hourWindows !== undefined) {
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
                const window = view === "hour" && hourWindows
                    ? hourWindows[(new Date(cursor).getUTCDay() + 6) % 7] : { start: 0, end: day };
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

    return Object.freeze({ minute, day, parseCivil, formatCivil, overlaps, clip, layout, stackRenderedOperations, unscheduledLayout, nonWorkingSegments, capacity, capacityFill, hourlyCapacity, operationVisible, onTimeline, draggedStart, inputToCivil, timeAxis, rangeWindow,
        axisPosition, axisClip, axisContains, currentTimePosition, draggedAxisStart, droppedAxisStart, routingLinks, workingDates, visibleDates,
        sameRouting, routingChain, followingSteps, toggleSelection, pruneSelection, lockRequest });
}));
