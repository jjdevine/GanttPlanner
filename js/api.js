// api.js — talks to SWA Database Connections (Data API Builder) via GraphQL.
//
// SWA exposes the API at /data-api/graphql. Cookies for SWA auth flow with the
// request automatically because the API is same-origin. No connection string
// is ever exposed to the browser — DAB resolves it from SWA app settings.

const GRAPHQL_URL = '/data-api/graphql';

// -----------------------------------------------------------------------------
// Wire-format <-> domain mapping
//
// Server (DAB / SQL) shape:                Client (UI / JSON view) shape:
//   { id, person, taskName, startDate,       { id, person, task, start, end,
//     endDate, capacityImpact, complete,       capacityImpact, complete,
//     milestonesJson }                         milestones: { label: 'yyyy-mm-dd' } }
// -----------------------------------------------------------------------------

function safeParseMilestones(s) {
    if (!s) return {};
    try {
        const v = JSON.parse(s);
        return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch {
        return {};
    }
}

export function fromServer(row) {
    return {
        id: row.id,
        person: row.person || '',
        task: row.taskName || '',
        start: row.startDate || '',
        end: row.endDate || '',
        capacityImpact: row.capacityImpact || 'medium',
        complete: !!row.complete,
        milestones: safeParseMilestones(row.milestonesJson),
    };
}

export function toServerInput(t) {
    return {
        person: t.person || '',
        taskName: t.task || '',
        startDate: t.start ? t.start : null,
        endDate:   t.end   ? t.end   : null,
        capacityImpact: t.capacityImpact || 'medium',
        complete: !!t.complete,
        milestonesJson: JSON.stringify(t.milestones || {}),
    };
}

// -----------------------------------------------------------------------------
// GraphQL helper
// -----------------------------------------------------------------------------
async function gql(query, variables) {
    const res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });

    if (res.status === 401 || res.status === 403) {
        // Session expired or not signed in — bounce to SWA login.
        window.location.href = '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(window.location.pathname);
        throw new Error('Not authenticated');
    }
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const body = await res.json();
    if (body.errors && body.errors.length) {
        const msg = body.errors.map(e => e.message).join('; ');
        throw new Error(msg);
    }
    return body.data;
}

// -----------------------------------------------------------------------------
// CRUD
// -----------------------------------------------------------------------------

const TASK_FIELDS = `
    id person taskName startDate endDate capacityImpact complete milestonesJson
`;

export async function listTasks() {
    // DAB paginates at 100 by default; loop until hasNextPage is false.
    const all = [];
    let after = null;
    /* eslint no-constant-condition: 0 */
    while (true) {
        const data = await gql(
            `query($after: String) {
                tasks(first: 1000, after: $after, orderBy: { person: ASC, endDate: ASC }) {
                    items { ${TASK_FIELDS} }
                    hasNextPage
                    endCursor
                }
            }`,
            { after }
        );
        const page = data.tasks;
        page.items.forEach(r => all.push(fromServer(r)));
        if (!page.hasNextPage) break;
        after = page.endCursor;
    }
    return all;
}

export async function createTask(t) {
    const data = await gql(
        `mutation($item: CreateTaskInput!) {
            createTask(item: $item) { ${TASK_FIELDS} }
        }`,
        { item: toServerInput(t) }
    );
    return fromServer(data.createTask);
}

export async function updateTask(id, t) {
    const data = await gql(
        `mutation($id: UUID!, $item: UpdateTaskInput!) {
            updateTask(id: $id, item: $item) { ${TASK_FIELDS} }
        }`,
        { id, item: toServerInput(t) }
    );
    return fromServer(data.updateTask);
}

export async function deleteTask(id) {
    await gql(
        `mutation($id: UUID!) {
            deleteTask(id: $id) { id }
        }`,
        { id }
    );
}

// Look up the signed-in user (SWA exposes /.auth/me).
export async function getCurrentUser() {
    try {
        const r = await fetch('/.auth/me', { credentials: 'same-origin' });
        if (!r.ok) return null;
        const j = await r.json();
        const cp = j && j.clientPrincipal;
        return cp ? { name: cp.userDetails, provider: cp.identityProvider, roles: cp.userRoles || [] } : null;
    } catch {
        return null;
    }
}
