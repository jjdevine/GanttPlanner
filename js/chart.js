// chart.js — D3 Gantt rendering. Pure-ish: takes tasks + filters and renders.
// Returns the deduped "visible task list" so the toggle panel can be rebuilt.

import { keyFor, normaliseImpact, todayUTC, impactOrder } from './util.js';

const parseDate  = d3.utcParse('%Y-%m-%d');

const margin = { top: 36, right: 24, bottom: 44, left: 90 };
const barHeight = 25, rowGap = 5, groupGap = 10, barRx = 5;
const FADE_LEN = 80, FADE_DIM = 0.4;
const PIN_HEAD_RADIUS = 6;
const PIN_OVERHANG    = 22;
const FLOATING_OFFSET_DAYS   = 14;
const FLOATING_DURATION_DAYS = 14;

const customPalette = [
    '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b',
    '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
];

export function getViewWindow(scaleValue) {
    const t0 = todayUTC();
    let futureDays;
    switch (scaleValue) {
        case '3w': futureDays = 21;  break;
        case '1y': futureDays = 365; break;
        default:   futureDays = 91;
    }
    const pastDays = Math.max(7, Math.round(futureDays / 3));
    return {
        start: d3.utcDay.offset(t0, -pastDays),
        end:   d3.utcDay.offset(t0,  futureDays),
    };
}

/**
 * Render the chart.
 * @param {object} opts
 * @param {Array}  opts.tasks            — UI-shape tasks (from api.fromServer)
 * @param {object} opts.filters          — { capacityImpactState, hideCompleted, showMilestones, hiddenKeys, scaleValue }
 * @param {Function} opts.onTaskClick    — (taskId) => void
 * @returns {Array}  visibleTaskList     — for the toggle panel
 */
export function renderChart({ tasks: tasksRaw, filters, onTaskClick }) {
    const svg = d3.select('#svg');
    const today = todayUTC();
    const floatingStart = d3.utcDay.offset(today, FLOATING_OFFSET_DAYS);
    const floatingEnd   = d3.utcDay.offset(today, FLOATING_OFFSET_DAYS + FLOATING_DURATION_DAYS);

    const tasks = tasksRaw.map((t) => {
        const hasStart = !!(t.start && String(t.start).trim());
        return {
            id: t.id,
            person: t.person || '—',
            task: t.task || '(unnamed)',
            start: hasStart ? parseDate(t.start) : null,
            end: (t.end && String(t.end).trim()) ? parseDate(t.end) : null,
            capacityImpact: normaliseImpact(t.capacityImpact),
            complete: !!t.complete,
            milestones: t.milestones || {},
            floating: !hasStart,
        };
    });

    const { start: viewStart, end: viewEnd } = getViewWindow(filters.scaleValue);

    tasks.forEach(d => {
        if (d.floating) {
            d.start = floatingStart;
            d.end = floatingEnd;
        } else if (!d.end || isNaN(+d.end)) {
            d.end = viewEnd;
        }
    });

    tasks.forEach(d => {
        d.overdue = !d.complete && !d.floating && d.end && d.end < today;
    });

    const overlaps = (t) => (t.start <= viewEnd) && (t.end >= viewStart);

    const people = [...new Set(tasks.map(d => d.person))];
    const colors = d3.scaleOrdinal().domain(people).range(customPalette);

    const isImpactVisible = (impact) => filters.capacityImpactState[impact] !== false;

    const byPersonVisible = new Map();
    const visibleTaskList = [];
    people.forEach(p => {
        const vis = tasks.filter(t => {
            if (t.person !== p) return false;
            if (!overlaps(t)) return false;
            if (!isImpactVisible(t.capacityImpact)) return false;
            if (filters.hideCompleted && t.complete) return false;
            if (filters.hiddenKeys.has(keyFor(t))) return false;
            return true;
        });
        const visAll = tasks.filter(t => t.person === p && overlaps(t) && !(filters.hideCompleted && t.complete));
        visAll.forEach(t => visibleTaskList.push(t));
        if (vis.length) byPersonVisible.set(p, vis);
    });

    const visiblePeople = Array.from(byPersonVisible.keys());
    const width = Math.max(800, document.getElementById('chart').clientWidth - 24);

    if (visiblePeople.length === 0) {
        svg.attr('viewBox', `0 0 ${width} 140`).attr('preserveAspectRatio', 'xMidYMid meet');
        svg.selectAll('*').remove();
        svg.append('text')
            .attr('x', 12).attr('y', 28)
            .attr('fill', '#fff').attr('font-size', 14)
            .text('No tasks in the selected date range (or all hidden / filtered).');
        return visibleTaskList;
    }

    const groupsHeight = visiblePeople.reduce((s, p) => {
        const n = byPersonVisible.get(p).length;
        return s + (n * (barHeight + rowGap)) + groupGap;
    }, 0);

    const height = margin.top + margin.bottom + groupsHeight;

    svg
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'none')
        .attr('width', '100%')
        .attr('height', height);
    svg.selectAll('*').remove();

    const x = d3.scaleUtc().domain([viewStart, viewEnd]).range([margin.left, width - margin.right]);
    const plotX0 = margin.left, plotX1 = width - margin.right;
    const defs = svg.append('defs');

    defs.append('clipPath').attr('id', 'plot-clip')
        .append('rect')
            .attr('x', plotX0)
            .attr('y', margin.top - PIN_OVERHANG)
            .attr('width', plotX1 - plotX0)
            .attr('height', height - margin.bottom - margin.top + PIN_OVERHANG);

    const hatch = defs.append('pattern')
        .attr('id', 'hatch-floating')
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 8).attr('height', 8)
        .attr('patternTransform', 'rotate(45)');
    hatch.append('line')
        .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 8)
        .attr('stroke', 'rgba(255,255,255,0.35)').attr('stroke-width', 2.5);

    const overdueHatch = defs.append('pattern')
        .attr('id', 'hatch-overdue')
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 10).attr('height', 10)
        .attr('patternTransform', 'rotate(-45)');
    overdueHatch.append('line')
        .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 10)
        .attr('stroke', 'rgba(255,70,70,0.4)').attr('stroke-width', 3);

    const tickInterval = d3.utcDay.every(7);
    const xAxis = d3.axisBottom(x).ticks(tickInterval).tickFormat(d3.utcFormat('%b %d'));

    svg.append('g').selectAll('line').data(x.ticks(tickInterval)).enter().append('line')
        .attr('x1', d => x(d)).attr('x2', d => x(d))
        .attr('y1', margin.top - 6).attr('y2', height - margin.bottom + 6)
        .attr('class', 'gridline');

    const groupTop = new Map();
    let cy = margin.top;
    visiblePeople.forEach(p => {
        const rows = byPersonVisible.get(p).length;
        groupTop.set(p, cy);
        cy += rows * (barHeight + rowGap) + groupGap;
    });

    visiblePeople.forEach(p => {
        const rows = byPersonVisible.get(p).length;
        const gH = rows * (barHeight + rowGap);
        svg.append('text')
            .attr('class', 'person-label')
            .attr('x', 12)
            .attr('y', groupTop.get(p) + gH / 2 + 5)
            .text(p);
    });

    const taskG = svg.append('g').attr('clip-path', 'url(#plot-clip)');

    function appendBarGradient(id, color, w, lfade, rfade) {
        const lf = Math.min(0.5, lfade / w || 0), rf = Math.min(0.5, rfade / w || 0);
        const g = defs.append('linearGradient').attr('id', id).attr('x1', '0%').attr('x2', '100%');
        const dim = FADE_DIM;
        if (lf > 0) {
            g.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', dim);
            g.append('stop').attr('offset', lf * 100 + '%').attr('stop-color', color).attr('stop-opacity', 1);
        } else {
            g.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', 1);
        }
        if (rf > 0) {
            g.append('stop').attr('offset', (100 - rf * 100) + '%').attr('stop-color', color).attr('stop-opacity', 1);
            g.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', dim);
        } else {
            g.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', 1);
        }
    }

    visiblePeople.forEach(p => {
        const list = byPersonVisible.get(p);
        const color = colors(p);

        list.forEach((t, i) => {
            const yTop = groupTop.get(p) + i * (barHeight + rowGap);
            const startPx = x(t.start), endPx = x(t.end);
            const dStart = Math.max(plotX0, Math.max(startPx, plotX0));
            const dEnd   = Math.min(plotX1, Math.min(endPx, plotX1));
            const w = Math.max(0, dEnd - dStart); if (w <= 0) return;

            const truncL = t.start < viewStart || startPx < plotX0;
            const truncR = t.end   > viewEnd   || endPx   > plotX1;
            const lf = truncL ? Math.min(FADE_LEN, w / 2) : 0;
            const rf = truncR ? Math.min(FADE_LEN, w / 2) : 0;

            const gradId = `g_${t.id || i}_${i}`;
            appendBarGradient(gradId, color, w, lf, rf);

            const barRect = taskG.append('rect')
                .attr('x', dStart).attr('y', yTop)
                .attr('width', w).attr('height', barHeight)
                .attr('rx', barRx)
                .attr('fill', `url(#${gradId})`)
                .attr('stroke', d3.color(color).darker(0.8))
                .attr('stroke-width', 1)
                .attr('class', 'task-rect impact-' + t.capacityImpact)
                .on('click', () => onTaskClick(t.id));

            if (t.floating) {
                barRect.attr('stroke-dasharray', '6,3');
                taskG.append('rect')
                    .attr('x', dStart).attr('y', yTop)
                    .attr('width', w).attr('height', barHeight)
                    .attr('rx', barRx)
                    .attr('fill', 'url(#hatch-floating)')
                    .attr('pointer-events', 'none');
            }

            if (t.overdue) {
                barRect.attr('stroke', '#ff4d4f').attr('stroke-width', 2);
                taskG.append('rect')
                    .attr('x', dStart).attr('y', yTop)
                    .attr('width', w).attr('height', barHeight)
                    .attr('rx', barRx)
                    .attr('fill', 'url(#hatch-overdue)')
                    .attr('pointer-events', 'none');
                taskG.append('text')
                    .attr('x', Math.min(dEnd + 4, plotX1 - 4))
                    .attr('y', yTop + Math.round(barHeight * 0.72))
                    .attr('class', 'overdue-icon')
                    .attr('text-anchor', dEnd + 20 > plotX1 ? 'end' : 'start')
                    .text('⚠ overdue');
            }

            taskG.append('text')
                .attr('x', dStart + 8)
                .attr('y', yTop + Math.round(barHeight * 0.68))
                .attr('class', 'task-label')
                .attr('text-anchor', 'start')
                .text(t.floating ? t.task + ' (no date)' : t.task)
                .on('click', () => onTaskClick(t.id));

            if (filters.showMilestones) {
                const milestonesArr = Object.entries(t.milestones || {})
                    .map(([k, v]) => ({ label: k, date: parseDate(v) }))
                    .filter(m => m.date && m.date >= viewStart && m.date <= viewEnd);

                milestonesArr.forEach(m => {
                    const mx = x(m.date);
                    if (mx < plotX0 || mx > plotX1) return;

                    const barTopY    = yTop;
                    const barCenterY = yTop + barHeight / 2;
                    const headCy = barTopY;
                    const stemY1 = headCy + PIN_HEAD_RADIUS * 0.2;
                    const stemY2 = barCenterY;

                    taskG.append('circle')
                        .attr('cx', mx).attr('cy', headCy)
                        .attr('r', PIN_HEAD_RADIUS)
                        .attr('class', 'milestone');
                    taskG.append('line')
                        .attr('x1', mx).attr('y1', stemY1)
                        .attr('x2', mx).attr('y2', stemY2)
                        .attr('class', 'milestone-pin-stem');
                    taskG.append('text')
                        .attr('x', mx + 10).attr('y', barTopY)
                        .attr('dominant-baseline', 'middle')
                        .attr('class', 'milestone-text')
                        .attr('text-anchor', 'start')
                        .text(m.label);
                });
            }
        });
    });

    svg.append('g')
        .attr('transform', `translate(0,${height - margin.bottom + 6})`)
        .attr('class', 'axis')
        .call(xAxis)
        .selectAll('text')
        .attr('transform', 'rotate(-35)')
        .style('text-anchor', 'end');

    const t0 = todayUTC();
    if (t0 >= viewStart && t0 <= viewEnd) {
        svg.append('line')
            .attr('x1', x(t0)).attr('x2', x(t0))
            .attr('y1', margin.top - 6).attr('y2', height - margin.bottom + 6)
            .attr('class', 'today-line');
    }

    return visibleTaskList;
}

export function buildToggleList(visibleTaskList, hiddenKeys, onToggle) {
    const toggleList = document.getElementById('toggleList');
    const seen = new Set();
    const deduped = visibleTaskList
        .slice()
        .sort((a, b) => {
            if (a.person !== b.person) return a.person.localeCompare(b.person);
            const ia = impactOrder[a.capacityImpact] ?? 1;
            const ib = impactOrder[b.capacityImpact] ?? 1;
            if (ia !== ib) return ia - ib;
            const ea = a.end ? +a.end : 0, eb = b.end ? +b.end : 0;
            if (ea !== eb) return ea - eb;
            return (a.task || '').localeCompare(b.task || '');
        })
        .filter(t => {
            const k = keyFor(t);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });

    toggleList.innerHTML = '';
    deduped.forEach(t => {
        const k = keyFor(t);
        const id = 'chk_' + btoa(unescape(encodeURIComponent(k))).replace(/=/g, '');
        const row = document.createElement('div');
        row.className = 'item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = id;
        cb.checked = !hiddenKeys.has(k);
        cb.addEventListener('change', () => onToggle(k, cb.checked));

        const label = document.createElement('label');
        label.setAttribute('for', id);
        label.textContent = `${t.person} — ${t.task}`;

        row.appendChild(cb);
        row.appendChild(label);
        toggleList.appendChild(row);
    });
}
