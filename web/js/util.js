// util.js — shared pure helpers (no DOM, no API).

export const impactOrder = { high: 0, medium: 1, low: 2 };

export function normaliseImpact(val) {
    if (!val) return 'medium';
    const v = String(val).toLowerCase();
    if (v === 'high' || v === 'medium' || v === 'low') return v;
    return 'medium';
}

// Stable identity for UI dedup (toggle list). Prefers id when present.
export function keyFor(t) {
    if (t.id) return t.id;
    return [t.person || '', t.task || '', t.start || '', t.end || ''].join('||');
}

export function sortTasksArray(tasks) {
    if (!Array.isArray(tasks)) return;
    tasks.sort((a, b) => {
        const pa = (a.person || '').toLowerCase();
        const pb = (b.person || '').toLowerCase();
        if (pa !== pb) return pa.localeCompare(pb);

        const ia = impactOrder[normaliseImpact(a.capacityImpact)];
        const ib = impactOrder[normaliseImpact(b.capacityImpact)];
        if (ia !== ib) return ia - ib;

        const ea = a.end || '';
        const eb = b.end || '';
        if (ea !== eb) return ea.localeCompare(eb);

        return (a.task || '').localeCompare(b.task || '');
    });
}

export function todayUTC() {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Render dates as YYYY-MM-DD when round-tripping to/from <input type="date">.
export function isoDateOnly(s) {
    if (!s) return '';
    return String(s).slice(0, 10);
}
