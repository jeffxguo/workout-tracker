'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'workoutTrackerData_v3';
const LEGACY_KEYS = ['workoutTrackerData_v1', 'workoutTrackerData_v2'];
const CATEGORIES  = ['push', 'pull', 'legs'];

// ── Default data ───────────────────────────────────────────────────────────
function getInitialData() {
    const t = Date.now();
    return {
        push: {
            lastWorkoutDate: null,
            exercises: [
                { id: t + 1,  name: 'Bench Press',            weight: '', reps: '', history: [] },
                { id: t + 2,  name: 'Overhead Press',          weight: '', reps: '', history: [] },
                { id: t + 3,  name: 'Incline Dumbbell Press',  weight: '', reps: '', history: [] },
                { id: t + 4,  name: 'Triceps Pushdown',        weight: '', reps: '', history: [] },
                { id: t + 5,  name: 'Lateral Raises',          weight: '', reps: '', history: [] },
            ],
        },
        pull: {
            lastWorkoutDate: null,
            exercises: [
                { id: t + 6,  name: 'Pull-ups / Lat Pulldown', weight: '', reps: '', history: [] },
                { id: t + 7,  name: 'Barbell Rows',            weight: '', reps: '', history: [] },
                { id: t + 8,  name: 'Face Pulls',              weight: '', reps: '', history: [] },
                { id: t + 9,  name: 'Bicep Curls',             weight: '', reps: '', history: [] },
                { id: t + 10, name: 'Hammer Curls',            weight: '', reps: '', history: [] },
            ],
        },
        legs: {
            lastWorkoutDate: null,
            exercises: [
                { id: t + 11, name: 'Squats',               weight: '', reps: '', history: [] },
                { id: t + 12, name: 'Romanian Deadlifts',   weight: '', reps: '', history: [] },
                { id: t + 13, name: 'Leg Press',            weight: '', reps: '', history: [] },
                { id: t + 14, name: 'Leg Curls',            weight: '', reps: '', history: [] },
                { id: t + 15, name: 'Calf Raises',          weight: '', reps: '', history: [] },
            ],
        },
    };
}

// ── Data helpers ───────────────────────────────────────────────────────────

/** Coerce any loaded/imported object into the expected shape without destroying data. */
function sanitizeData(data) {
    CATEGORIES.forEach((cat, i) => {
        if (!data[cat]) data[cat] = { lastWorkoutDate: null, exercises: [] };
        if (!Array.isArray(data[cat].exercises)) data[cat].exercises = [];
        data[cat].exercises.forEach((ex, idx) => {
            if (typeof ex.id !== 'number') ex.id = Date.now() + i * 100 + idx;
            if (!Array.isArray(ex.history)) ex.history = [];
        });
    });
    return data;
}

/** Try to migrate data from old storage keys before falling back to defaults. */
function migrateFromLegacyKeys() {
    for (const oldKey of [...LEGACY_KEYS].reverse()) {
        const raw = localStorage.getItem(oldKey);
        if (!raw) continue;
        try {
            const parsed = JSON.parse(raw);
            if (parsed.push && parsed.pull && parsed.legs) {
                const migrated = sanitizeData(parsed);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
                LEGACY_KEYS.forEach(k => localStorage.removeItem(k));
                console.info(`Migrated workout data from ${oldKey} → ${STORAGE_KEY}`);
                return migrated;
            }
        } catch (e) {
            console.error(`Migration failed for ${oldKey}:`, e);
        }
    }
    return null;
}

function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed.push && parsed.pull && parsed.legs) return sanitizeData(parsed);
        } catch (e) {
            console.error('Error parsing stored data:', e);
        }
    }
    return migrateFromLegacyKeys() ?? getInitialData();
}

function saveData(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving data:', e);
        showToast('Could not save — storage may be full.', 'error');
    }
}

// ── Export / Import ────────────────────────────────────────────────────────
function exportData() {
    const blob = new Blob([JSON.stringify(workoutData, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
        href:     url,
        download: `workout-backup-${getLocalDateString()}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.push && imported.pull && imported.legs) {
                workoutData = sanitizeData(imported);
                saveData(workoutData);
                renderAllSections();
                showToast('Backup imported!', 'success');
            } else {
                showToast('Invalid backup file.', 'error');
            }
        } catch (_) {
            showToast('Could not read backup file.', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // allow re-import of same file
}

// ── State ──────────────────────────────────────────────────────────────────
let workoutData = loadData();

// ── Date utilities ─────────────────────────────────────────────────────────
function getLocalDateString(date = new Date()) {
    const y  = date.getFullYear();
    const m  = String(date.getMonth() + 1).padStart(2, '0');
    const d  = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseDateString(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function formatDate(str, opts) {
    try {
        return parseDateString(str).toLocaleDateString('en-US', opts);
    } catch (_) {
        return 'Invalid date';
    }
}

function calculateDaysAgo(dateString) {
    if (!dateString) return null;
    const last  = parseDateString(dateString);
    const today = new Date();
    last.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return Math.round(Math.abs(today - last) / 86400000);
}

// ── PR detection ───────────────────────────────────────────────────────────

/** Returns the highest numeric weight ever logged for an exercise, or null. */
function getMaxWeight(history) {
    if (!history?.length) return null;
    const vals = history.map(e => parseFloat(e.weight)).filter(n => !isNaN(n) && n > 0);
    return vals.length ? Math.max(...vals) : null;
}

// ── Rendering ──────────────────────────────────────────────────────────────
function renderWorkoutSection(category) {
    const data        = workoutData[category];
    const lastDateEl  = document.getElementById(`${category}-last-date`);
    const daysAgoEl   = document.getElementById(`${category}-days-ago`);
    const container   = document.getElementById(`${category}-exercises`);

    // Header — last workout date
    if (data.lastWorkoutDate) {
        lastDateEl.textContent = formatDate(data.lastWorkoutDate, { month: 'short', day: 'numeric', year: 'numeric' });
        lastDateEl.className   = 'text-gray-700';
    } else {
        lastDateEl.textContent = 'Never';
        lastDateEl.className   = 'text-gray-400';
    }

    // Header — days-ago colour
    const days = calculateDaysAgo(data.lastWorkoutDate);
    daysAgoEl.textContent = days ?? 'N/A';
    daysAgoEl.className   = 'font-medium ' + (
        days === null  ? 'text-gray-400' :
        days <= 2      ? 'text-green-600' :
        days <= 4      ? 'text-yellow-600' :
                         'text-red-600'
    );

    // Exercise list
    container.innerHTML = '';
    if (!data.exercises.length) {
        container.innerHTML = '<div class="text-center text-gray-400 py-4 text-sm">No exercises yet.</div>';
        return;
    }

    data.exercises.forEach((exercise, index) => {
        if (typeof exercise.id !== 'number') return;

        // Last-tracked label
        let trackedLabel = '<span class="italic text-gray-400">Never tracked</span>';
        if (exercise.history.length) {
            const opts = { month: 'short', day: 'numeric', year: 'numeric' };
            trackedLabel = `Tracked: ${formatDate(exercise.history[0].date, opts)}`;
        }

        // PR badge — shown when current weight equals the all-time max
        const maxW    = getMaxWeight(exercise.history);
        const currW   = parseFloat(exercise.weight);
        const showPR  = maxW !== null && !isNaN(currW) && currW > 0 && currW >= maxW;
        const prBadge = showPR ? '<span class="pr-badge">PR 🏆</span>' : '';

        const card = document.createElement('div');
        card.className = 'exercise-item p-3 rounded-lg shadow-sm';
        card.innerHTML = `
            <div class="flex justify-between items-start mb-2 gap-2">
                <div class="flex-grow min-w-0">
                    <div id="name-display-container-${exercise.id}" class="flex items-center gap-2">
                        <h5 id="name-display-${exercise.id}" class="font-semibold text-gray-800 break-words">${exercise.name}</h5>
                        <button onclick="showEditNameInput(${exercise.id}, '${category}')"
                                class="btn btn-accent btn-icon flex-shrink-0" title="Edit name"
                                style="padding:5px;min-height:28px;min-width:28px;font-size:0.75rem;">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                    </div>
                    <div id="name-edit-container-${exercise.id}" style="display:none;">
                        <input type="text" id="name-input-${exercise.id}"
                               class="name-edit-input border rounded px-2 py-1 text-sm mb-2"
                               value="${exercise.name}">
                        <div class="flex gap-2 justify-end">
                            <button onclick="saveExerciseName(${exercise.id}, '${category}')" class="btn btn-secondary btn-xs">Save</button>
                            <button onclick="hideEditNameInput(${exercise.id}, '${category}')" class="btn btn-accent btn-xs">Cancel</button>
                        </div>
                    </div>
                </div>
                <div class="flex gap-1 items-center flex-shrink-0">
                    <button onclick="moveExerciseUp(${exercise.id}, '${category}')"
                            class="btn btn-accent btn-icon" title="Move up"
                            ${index === 0 ? 'disabled' : ''}>
                        <i class="fas fa-arrow-up"></i>
                    </button>
                    <button onclick="moveExerciseDown(${exercise.id}, '${category}')"
                            class="btn btn-accent btn-icon" title="Move down"
                            ${index === data.exercises.length - 1 ? 'disabled' : ''}>
                        <i class="fas fa-arrow-down"></i>
                    </button>
                    <button onclick="toggleHistory(${exercise.id}, '${category}')"
                            class="btn btn-info btn-icon" title="History">
                        <i class="fas fa-history"></i>
                    </button>
                    <button id="remove-btn-${exercise.id}"
                            onclick="showRemoveConfirmation(${exercise.id})"
                            class="btn btn-warning btn-xs">Remove?</button>
                    <span id="confirm-remove-${exercise.id}" style="display:none;" class="flex gap-1 items-center">
                        <button onclick="removeExercise('${category}', ${exercise.id})" class="btn btn-danger btn-xs">Yes</button>
                        <button onclick="hideRemoveConfirmation(${exercise.id})" class="btn btn-accent btn-xs">No</button>
                    </span>
                </div>
            </div>
            <div class="text-sm text-gray-600 mb-1 flex items-center gap-2 flex-wrap">
                <span>
                    Last:
                    <span class="font-medium text-gray-800">${exercise.weight || '–'}</span>
                    <span class="text-gray-400 mx-0.5">/</span>
                    <span class="font-medium text-gray-800">${exercise.reps || '–'}</span>
                    <span class="text-xs text-gray-400 ml-1">wt / reps</span>
                </span>
                ${prBadge}
            </div>
            <div class="text-xs text-gray-400 mb-3">${trackedLabel}</div>
            <div class="update-form">
                <input type="text" inputmode="text"
                       id="${category}-input-weight-${exercise.id}"
                       placeholder="Weight (e.g. 45lb bar, 2x25 DB)" class="border rounded">
                <input type="text" inputmode="decimal"
                       id="${category}-input-reps-${exercise.id}"
                       placeholder="Reps (e.g. 5/5/4)" class="border rounded">
                <button onclick="updateExercise('${category}', ${exercise.id})"
                        class="btn btn-secondary btn-sm flex-grow">Log</button>
            </div>
            <div id="history-content-${exercise.id}" style="display:none;"
                 class="history-content mt-3 pt-3 border-t border-gray-200 rounded-b-lg"></div>
        `;
        container.appendChild(card);
    });
}

function renderAllSections() {
    CATEGORIES.forEach(renderWorkoutSection);
}

// ── Actions ────────────────────────────────────────────────────────────────
function markDone(category) {
    workoutData[category].lastWorkoutDate = getLocalDateString();
    saveData(workoutData);
    renderWorkoutSection(category);
    showToast(`${category.charAt(0).toUpperCase() + category.slice(1)} day logged!`, 'success');
}

function updateExercise(category, exerciseId) {
    const weightInput = document.getElementById(`${category}-input-weight-${exerciseId}`);
    const repsInput   = document.getElementById(`${category}-input-reps-${exerciseId}`);
    if (!weightInput || !repsInput) return;

    const newWeight = weightInput.value.trim();
    const newReps   = repsInput.value.trim();
    if (!newWeight && !newReps) return;

    const exercise = workoutData[category].exercises.find(ex => ex.id === exerciseId);
    if (!exercise) return;

    // Detect new PR before the history is updated
    const parsedWeight = parseFloat(newWeight);
    const oldMax       = getMaxWeight(exercise.history);
    const isNewPR      = parsedWeight > 0 && !isNaN(parsedWeight) &&
                         (oldMax === null || parsedWeight > oldMax);

    exercise.history.unshift({ date: getLocalDateString(), weight: newWeight, reps: newReps });
    exercise.weight = newWeight;
    exercise.reps   = newReps;
    saveData(workoutData);

    weightInput.value = '';
    repsInput.value   = '';
    renderWorkoutSection(category);

    if (isNewPR) {
        showToast(`New PR on ${exercise.name}! 🏆`, 'success');
    }
}

function addExercise(category) {
    const input = document.getElementById(`new-${category}-exercise`);
    const name  = input.value.trim();
    if (!name) { input.focus(); return; }

    workoutData[category].exercises.unshift({ id: Date.now(), name, weight: '', reps: '', history: [] });
    saveData(workoutData);
    renderWorkoutSection(category);
    input.value = '';
}

function removeExercise(category, exerciseId) {
    const idx = workoutData[category].exercises.findIndex(ex => ex.id === exerciseId);
    if (idx > -1) workoutData[category].exercises.splice(idx, 1);
    saveData(workoutData);
    renderWorkoutSection(category);
}

function showRemoveConfirmation(exerciseId) {
    document.getElementById(`remove-btn-${exerciseId}`).style.display    = 'none';
    document.getElementById(`confirm-remove-${exerciseId}`).style.display = 'inline-flex';
}

function hideRemoveConfirmation(exerciseId) {
    document.getElementById(`confirm-remove-${exerciseId}`).style.display = 'none';
    document.getElementById(`remove-btn-${exerciseId}`).style.display     = 'inline-flex';
}

// ── Name editing ───────────────────────────────────────────────────────────
function showEditNameInput(exerciseId, category) {
    const display = document.getElementById(`name-display-container-${exerciseId}`);
    const edit    = document.getElementById(`name-edit-container-${exerciseId}`);
    const input   = document.getElementById(`name-input-${exerciseId}`);
    const ex      = workoutData[category]?.exercises.find(e => e.id === exerciseId);
    if (!display || !edit || !input || !ex) return;

    input.value        = ex.name;
    display.style.display = 'none';
    edit.style.display    = 'block';
    input.focus();
    input.select();
}

function hideEditNameInput(exerciseId) {
    document.getElementById(`name-display-container-${exerciseId}`).style.display = 'flex';
    document.getElementById(`name-edit-container-${exerciseId}`).style.display    = 'none';
}

function saveExerciseName(exerciseId, category) {
    const input   = document.getElementById(`name-input-${exerciseId}`);
    const newName = input?.value.trim();
    if (!newName) {
        input?.classList.add('border-red-500');
        setTimeout(() => input?.classList.remove('border-red-500'), 2000);
        return;
    }
    const ex = workoutData[category].exercises.find(e => e.id === exerciseId);
    if (!ex) return;
    ex.name = newName;
    saveData(workoutData);
    document.getElementById(`name-display-${exerciseId}`).textContent = newName;
    hideEditNameInput(exerciseId);
}

// ── History ────────────────────────────────────────────────────────────────
function renderHistoryContent(exerciseId, category) {
    const el = document.getElementById(`history-content-${exerciseId}`);
    if (!el) return;
    const ex = workoutData[category]?.exercises.find(e => e.id === exerciseId);
    if (!ex?.history?.length) {
        el.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm">No history yet.</div>';
        return;
    }
    const opts = { month: 'short', day: 'numeric', year: '2-digit' };
    const rows = ex.history
        .map(entry => `
            <tr>
                <td>${formatDate(entry.date, opts)}</td>
                <td>${entry.weight || '–'}</td>
                <td>${entry.reps   || '–'}</td>
            </tr>`)
        .join('');
    el.innerHTML = `
        <div class="p-3">
            <h4 class="text-sm font-semibold mb-2 text-gray-600">History</h4>
            <table class="history-table">
                <thead><tr><th>Date</th><th>Weight</th><th>Reps</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

function toggleHistory(exerciseId, category) {
    const el = document.getElementById(`history-content-${exerciseId}`);
    if (!el) return;
    if (el.style.display === 'none') {
        renderHistoryContent(exerciseId, category);
        el.style.display = 'block';
    } else {
        el.style.display = 'none';
    }
}

// ── Reordering ─────────────────────────────────────────────────────────────
function moveExercise(exerciseId, category, direction) {
    const list = workoutData[category].exercises;
    const idx  = list.findIndex(ex => ex.id === exerciseId);
    if (idx === -1) return;
    const next = idx + direction;
    if (next < 0 || next >= list.length) return;
    [list[idx], list[next]] = [list[next], list[idx]];
    saveData(workoutData);
    renderWorkoutSection(category);
}

function moveExerciseUp(exerciseId, category)   { moveExercise(exerciseId, category, -1); }
function moveExerciseDown(exerciseId, category) { moveExercise(exerciseId, category,  1); }

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className   = `show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}

// ── Tab navigation (mobile) ────────────────────────────────────────────────
let activeTab = 'push';

function showTab(category) {
    CATEGORIES.forEach(cat => {
        document.getElementById(`${cat}-section`).classList.toggle('tab-hidden', cat !== category);
        document.getElementById(`tab-${cat}`).classList.toggle('active', cat === category);
    });
    activeTab = category;
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    renderAllSections();
    showTab('push');
});
