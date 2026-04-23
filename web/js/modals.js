// modals.js — quick-add/edit task modal and per-person import/export modal.
// Uses callbacks passed by app.js so it doesn't need to know about the API.

import { normaliseImpact, isoDateOnly } from './util.js';

// ---------- Quick add / edit ----------

const quickModal      = document.getElementById('quickModal');
const quickForm       = document.getElementById('quickForm');
const quickError      = document.getElementById('quickError');
const quickCancel     = document.getElementById('quickCancel');
const quickModalTitle = document.getElementById('quickModalTitle');
const quickSubmit     = document.getElementById('quickSubmit');

const qmPerson   = document.getElementById('qmPerson');
const qmTask     = document.getElementById('qmTask');
const qmStart    = document.getElementById('qmStart');
const qmEnd      = document.getElementById('qmEnd');
const qmImpact   = document.getElementById('qmImpact');
const qmComplete = document.getElementById('qmComplete');
const qmNoStart  = document.getElementById('qmNoStart');
const qmDelete   = document.getElementById('qmDelete');

const milestoneList   = document.getElementById('milestoneList');
const addMilestoneBtn = document.getElementById('addMilestoneBtn');

let editingId = null;          // task.id when editing, null when adding
let onSaveCb   = null;
let onDeleteCb = null;
let getPeopleCb = () => [];

qmNoStart.addEventListener('change', () => {
    if (qmNoStart.checked) {
        qmStart.value = '';
        qmStart.disabled = true;
        qmStart.required = false;
    } else {
        qmStart.disabled = false;
        qmStart.required = true;
    }
});

function clearMilestoneRows() { milestoneList.innerHTML = ''; }

function addMilestoneRow(label = '', date = '') {
    const row = document.createElement('div');
    row.className = 'milestone-row';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.placeholder = 'Label';
    labelInput.value = label;
    labelInput.className = 'ms-label';

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = date;
    dateInput.className = 'ms-date';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.className = 'ms-remove';
    removeBtn.addEventListener('click', () => milestoneList.removeChild(row));

    row.appendChild(labelInput);
    row.appendChild(dateInput);
    row.appendChild(removeBtn);
    milestoneList.appendChild(row);
}

addMilestoneBtn.addEventListener('click', () => addMilestoneRow());

function refreshPersonDatalist() {
    const datalist = document.getElementById('personDatalist');
    datalist.innerHTML = '';
    getPeopleCb().forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        datalist.appendChild(opt);
    });
}

function openModal() { quickModal.classList.remove('modal-hidden'); }
function closeModal() { quickModal.classList.add('modal-hidden'); }

export function openAddModal() {
    editingId = null;
    quickError.textContent = '';
    quickModalTitle.textContent = 'Quick add task';
    quickSubmit.textContent = 'Add';
    qmDelete.style.display = 'none';

    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    qmNoStart.checked = false;
    qmStart.disabled = false;
    qmStart.required = true;
    qmStart.value = `${yyyy}-${mm}-${dd}`;
    qmEnd.value = '';
    qmImpact.value = 'medium';
    qmComplete.checked = false;
    qmPerson.value = '';
    qmTask.value = '';

    clearMilestoneRows();
    addMilestoneRow();
    refreshPersonDatalist();
    openModal();
    qmPerson.focus();
}

export function openEditModal(task) {
    if (!task) return;
    editingId = task.id;
    quickError.textContent = '';
    quickModalTitle.textContent = 'Edit task';
    quickSubmit.textContent = 'Update';
    qmDelete.style.display = '';

    qmPerson.value = task.person || '';
    qmTask.value = task.task || '';
    const hasStart = !!(task.start && String(task.start).trim());
    qmNoStart.checked = !hasStart;
    qmStart.disabled = !hasStart;
    qmStart.required = hasStart;
    qmStart.value = hasStart ? isoDateOnly(task.start) : '';
    qmEnd.value = isoDateOnly(task.end);
    qmImpact.value = normaliseImpact(task.capacityImpact);
    qmComplete.checked = !!task.complete;

    clearMilestoneRows();
    const entries = Object.entries(task.milestones || {});
    if (entries.length) {
        entries.forEach(([label, date]) => addMilestoneRow(label, isoDateOnly(date)));
    } else {
        addMilestoneRow();
    }

    refreshPersonDatalist();
    openModal();
    qmPerson.focus();
}

export function initQuickModal({ onSave, onDelete, getPeople }) {
    onSaveCb   = onSave;
    onDeleteCb = onDelete;
    getPeopleCb = getPeople;

    quickCancel.addEventListener('click', closeModal);

    qmDelete.addEventListener('click', async () => {
        if (editingId == null) return;
        if (!confirm('Delete this task? This cannot be undone.')) return;
        try {
            qmDelete.disabled = true;
            await onDeleteCb(editingId);
            closeModal();
        } catch (err) {
            quickError.textContent = 'Delete failed: ' + (err.message || err);
        } finally {
            qmDelete.disabled = false;
        }
    });

    quickForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        quickError.textContent = '';

        const person = qmPerson.value.trim();
        const task = qmTask.value.trim();
        const noStart = qmNoStart.checked;
        const start = noStart ? '' : qmStart.value;
        const end = qmEnd.value;
        const impact = qmImpact.value || 'medium';
        const complete = qmComplete.checked;

        if (!person || !task) {
            quickError.textContent = 'Person and task are required.';
            return;
        }
        if (!noStart && !start) {
            quickError.textContent = 'Start date is required (or tick unknown start date).';
            return;
        }

        const milestones = {};
        milestoneList.querySelectorAll('.milestone-row').forEach(row => {
            const labelInput = row.querySelector('.ms-label');
            const dateInput  = row.querySelector('.ms-date');
            if (!labelInput || !dateInput) return;
            const label = labelInput.value.trim();
            const date = dateInput.value;
            if (label && date) milestones[label] = date;
        });

        const payload = {
            person, task,
            start: start || '',
            end: end || '',
            capacityImpact: impact,
            complete,
            milestones,
        };

        try {
            quickSubmit.disabled = true;
            await onSaveCb(editingId, payload);
            closeModal();
        } catch (err) {
            quickError.textContent = 'Save failed: ' + (err.message || err);
        } finally {
            quickSubmit.disabled = false;
        }
    });

    quickModal.addEventListener('click', (e) => {
        if (e.target === quickModal) closeModal();
    });
}

export function isQuickModalOpen() { return !quickModal.classList.contains('modal-hidden'); }
export function closeQuickModal()   { closeModal(); }

// ---------- Person import / export ----------

const personModal           = document.getElementById('personModal');
const personImportExportBtn = document.getElementById('personImportExportBtn');
const personNameInput       = document.getElementById('personName');
const personJsonArea        = document.getElementById('personJsonArea');
const personError           = document.getElementById('personError');
const personExportBtn       = document.getElementById('personExportBtn');
const personImportBtn       = document.getElementById('personImportBtn');
const personCancelBtn       = document.getElementById('personCancelBtn');

let personGetTasksCb   = () => [];
let personImportCb     = async () => {};

function refreshPersonSelect() {
    personNameInput.innerHTML = '<option value="">Select a person...</option>';
    const seen = new Set();
    personGetTasksCb().forEach(t => {
        if (t.person && !seen.has(t.person)) {
            seen.add(t.person);
            const opt = document.createElement('option');
            opt.value = t.person;
            opt.textContent = t.person;
            personNameInput.appendChild(opt);
        }
    });
}

function openPersonModal() {
    personError.textContent = '';
    personJsonArea.value = '';
    refreshPersonSelect();
    personNameInput.value = '';
    personModal.classList.remove('modal-hidden');
    personNameInput.focus();
}
function closePersonModal() { personModal.classList.add('modal-hidden'); }

export function initPersonModal({ getAllTasks, importTasksForPerson }) {
    personGetTasksCb = getAllTasks;
    personImportCb   = importTasksForPerson;

    personImportExportBtn.addEventListener('click', openPersonModal);
    personCancelBtn.addEventListener('click', closePersonModal);

    personExportBtn.addEventListener('click', () => {
        personError.textContent = '';
        const person = personNameInput.value.trim();
        if (!person) { personError.textContent = 'Person name is required for export.'; return; }
        const tasksForPerson = personGetTasksCb()
            .filter(t => (t.person || '') === person)
            .map(({ id, ...rest }) => rest); // strip ids when exporting
        personJsonArea.value = JSON.stringify({ tasks: tasksForPerson }, null, 2);
    });

    personImportBtn.addEventListener('click', async () => {
        personError.textContent = '';
        const person = personNameInput.value.trim();
        if (!person) { personError.textContent = 'Person name is required for import.'; return; }

        const raw = personJsonArea.value.trim();
        if (!raw) { personError.textContent = 'Paste JSON to import.'; return; }

        let parsed;
        try { parsed = JSON.parse(raw); }
        catch { personError.textContent = 'Invalid JSON in tasks area.'; return; }

        let incoming;
        if (Array.isArray(parsed)) incoming = parsed;
        else if (parsed && Array.isArray(parsed.tasks)) incoming = parsed.tasks;
        else { personError.textContent = 'JSON must be an array or an object with a "tasks" array.'; return; }

        const otherPersons = new Set();
        incoming.forEach(t => {
            if (t && t.person && t.person !== person) otherPersons.add(t.person);
        });
        if (otherPersons.size > 0) {
            const names = Array.from(otherPersons).join(', ');
            const ok = confirm(
                `Warning: The imported data contains tasks for "${names}" but you selected "${person}".\n\n` +
                `All imported tasks will be reassigned to "${person}" and will REPLACE all of ${person}'s existing tasks in the database.\n\nContinue?`
            );
            if (!ok) return;
        } else {
            const ok = confirm(`This will REPLACE all of ${person}'s existing tasks in the database with the imported set. Continue?`);
            if (!ok) return;
        }

        const cleaned = incoming
            .filter(t => t && typeof t === 'object')
            .map(t => ({
                person,
                task: t.task || '',
                start: t.start || '',
                end: t.end || '',
                capacityImpact: t.capacityImpact || 'medium',
                complete: !!t.complete,
                milestones: t.milestones || {},
            }));

        try {
            personImportBtn.disabled = true;
            await personImportCb(person, cleaned);
            closePersonModal();
        } catch (err) {
            personError.textContent = 'Import failed: ' + (err.message || err);
        } finally {
            personImportBtn.disabled = false;
        }
    });

    personModal.addEventListener('click', (e) => {
        if (e.target === personModal) closePersonModal();
    });
}

export function isPersonModalOpen() { return !personModal.classList.contains('modal-hidden'); }
export function closeAllModals() {
    if (isQuickModalOpen()) closeQuickModal();
    if (isPersonModalOpen()) closePersonModal();
}
