// app.js — entry point. Loads tasks from Azure SQL via SWA Database Connections,
// renders the chart, and routes UI events back through the API.

import * as api from './api.js';
import { sortTasksArray } from './util.js';
import { renderChart, buildToggleList } from './chart.js';
import {
    initQuickModal, openAddModal, openEditModal,
    initPersonModal, closeAllModals,
} from './modals.js';

// ----- mutable UI state -----
const state = {
    tasks: [],
    capacityImpactState: { high: true, medium: true, low: true },
    hideCompleted: true,
    showMilestones: true,
    hiddenKeys: new Set(),
    scaleValue: '3m',
};

const msg        = document.getElementById('msg');
const syncStatus = document.getElementById('syncStatus');
const textarea   = document.getElementById('json');
const scaleEl    = document.getElementById('scale');

function setStatus(text, kind = '') {
    syncStatus.textContent = text;
    syncStatus.className = kind;
}

function showError(text) {
    msg.textContent = text;
    msg.className = '';
}
function showOk(text) {
    msg.textContent = text;
    msg.className = 'ok';
}

// ----- core render cycle -----

function render(rebuildToggles) {
    msg.textContent = '';
    const filters = {
        capacityImpactState: state.capacityImpactState,
        hideCompleted: state.hideCompleted,
        showMilestones: state.showMilestones,
        hiddenKeys: state.hiddenKeys,
        scaleValue: scaleEl.value,
    };
    const visible = renderChart({
        tasks: state.tasks,
        filters,
        onTaskClick: (id) => {
            const t = state.tasks.find(x => x.id === id);
            if (t) openEditModal(t);
        },
    });
    if (rebuildToggles) {
        buildToggleList(visible, state.hiddenKeys, (key, checked) => {
            if (checked) state.hiddenKeys.delete(key);
            else state.hiddenKeys.add(key);
            render(false);
        });
    }
    refreshJsonView();
}

function refreshJsonView() {
    const exportShape = state.tasks.map(({ id, ...rest }) => rest);
    sortTasksArray(exportShape);
    textarea.value = JSON.stringify({ tasks: exportShape }, null, 2);
}

// ----- API-backed operations -----

async function reloadFromServer() {
    setStatus('Loading…');
    try {
        const tasks = await api.listTasks();
        sortTasksArray(tasks);
        state.tasks = tasks;
        setStatus(`Loaded ${tasks.length} task(s)`, 'ok');
        render(true);
    } catch (err) {
        setStatus('Load failed', 'error');
        showError('Could not load tasks: ' + (err.message || err));
    }
}

async function saveTask(id, payload) {
    setStatus('Saving…');
    if (id == null) {
        const created = await api.createTask(payload);
        state.tasks.push(created);
    } else {
        const updated = await api.updateTask(id, payload);
        const i = state.tasks.findIndex(t => t.id === id);
        if (i >= 0) state.tasks[i] = updated;
        else state.tasks.push(updated);
    }
    sortTasksArray(state.tasks);
    setStatus('Saved', 'ok');
    render(true);
}

async function deleteTaskById(id) {
    setStatus('Deleting…');
    await api.deleteTask(id);
    state.tasks = state.tasks.filter(t => t.id !== id);
    setStatus('Deleted', 'ok');
    render(true);
}

// Replace all of one person's tasks with a fresh set (used by import).
async function replacePersonTasks(person, newTasks) {
    setStatus(`Replacing tasks for ${person}…`);
    const existing = state.tasks.filter(t => (t.person || '') === person);
    // Delete existing
    for (const t of existing) {
        await api.deleteTask(t.id);
    }
    state.tasks = state.tasks.filter(t => (t.person || '') !== person);
    // Insert new
    for (const nt of newTasks) {
        const created = await api.createTask(nt);
        state.tasks.push(created);
    }
    sortTasksArray(state.tasks);
    setStatus(`Imported ${newTasks.length} task(s) for ${person}`, 'ok');
    render(true);
}

// ----- wire up filter panels -----

[
    { id: 'capHigh',   impact: 'high'   },
    { id: 'capMedium', impact: 'medium' },
    { id: 'capLow',    impact: 'low'    },
].forEach(({ id, impact }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = state.capacityImpactState[impact];
    el.addEventListener('change', () => {
        state.capacityImpactState[impact] = el.checked;
        render(false);
    });
});

const hideCompletedCheckbox = document.getElementById('hideCompleted');
if (hideCompletedCheckbox) {
    hideCompletedCheckbox.checked = state.hideCompleted;
    hideCompletedCheckbox.addEventListener('change', () => {
        state.hideCompleted = hideCompletedCheckbox.checked;
        render(false);
    });
}

const showMilestonesCheckbox = document.getElementById('showMilestones');
if (showMilestonesCheckbox) {
    showMilestonesCheckbox.checked = state.showMilestones;
    showMilestonesCheckbox.addEventListener('change', () => {
        state.showMilestones = showMilestonesCheckbox.checked;
        render(false);
    });
}

document.getElementById('applyScale').addEventListener('click', () => render(true));

document.getElementById('refreshBtn').addEventListener('click', reloadFromServer);

document.getElementById('downloadBtnTop').addEventListener('click', downloadJson);

function downloadJson() {
    refreshJsonView();
    const blob = new Blob([textarea.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const ts = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + '-' +
        String(now.getHours()).padStart(2, '0') + '-' +
        String(now.getMinutes()).padStart(2, '0');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tasks-' + ts + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

// Resize observer to keep the chart filling its container.
new ResizeObserver(() => render(false)).observe(document.getElementById('chart'));

// ----- modals -----

document.getElementById('quickAddBtn').addEventListener('click', openAddModal);

initQuickModal({
    onSave: saveTask,
    onDelete: deleteTaskById,
    getPeople: () => {
        const set = new Set();
        state.tasks.forEach(t => { if (t.person) set.add(t.person); });
        return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    },
});

initPersonModal({
    getAllTasks: () => state.tasks,
    importTasksForPerson: replacePersonTasks,
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
});

// ----- user bar -----

(async () => {
    const user = await api.getCurrentUser();
    const userBar = document.getElementById('userBar');
    if (user) {
        userBar.innerHTML = `Signed in as <strong>${user.name}</strong> (${user.provider}) — <a href="/logout">log out</a>`;
    } else {
        userBar.innerHTML = `Not signed in — <a href="/login">log in</a>`;
    }
})();

// ----- go -----
reloadFromServer();
