# Capability guide

A walkthrough of what the Gantt planner does and how to use each feature. The behaviour is identical to the original standalone HTML; the only change is that data lives in **Azure SQL** instead of `localStorage`.

## The screen at a glance

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Gantt Planner                                       Signed in as alice@…   │
│                                                                              │
│  Future window: [3 months ▼]  [Apply]   Sync: Loaded 42 task(s)              │
│  [Reload from DB] [Download JSON] [Person import/export] [Quick add task]    │
│                                                                              │
│  ┌─────────────────────────────────────────────────┐  ┌─ Capacity impact ─┐ │
│  │                                                 │  │ ☑ High            │ │
│  │   ▓▓▓▓▓▓▓▓▓▓▓▓▓ task bars …                    │  │ ☑ Medium          │ │
│  │                                                 │  │ ☑ Low             │ │
│  │   today│                                        │  └───────────────────┘ │
│  │                                                 │  ┌─ Status ──────────┐ │
│  └─────────────────────────────────────────────────┘  │ ☑ Hide completed  │ │
│                                                       └───────────────────┘ │
│  ┌─ JSON snapshot (read-only) ─────────────────────┐  ┌─ Milestones ──────┐ │
│  │ { "tasks": [ ... ] }                            │  │ ☑ Show milestones │ │
│  └─────────────────────────────────────────────────┘  └───────────────────┘ │
│                                                       ┌─ Tasks shown ─────┐ │
│                                                       │ ☑ alice — design  │ │
│                                                       │ ☑ alice — build   │ │
│                                                       │ ☐ bob   — testing │ │
│                                                       └───────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Persistence model

- Every task is a row in the `gantt.Tasks` table.
- Milestones are stored as a JSON blob on the task row, exactly mirroring the original `{ "label": "yyyy-mm-dd", ... }` shape.
- Each task has a server-assigned UUID `id`. The browser uses this id when editing or deleting.
- Multiple users can share the same database. There is no live push, so use **Reload from DB** to see changes other people have made.

## Authentication

- The SWA `web/staticwebapp.config.json` requires authentication for every route (`/*` and `/data-api/*`).
- Unauthenticated requests are redirected to `/.auth/login/aad`.
- The data-API permissions in `web/swa-db-connections/staticwebapp.database.config.json` only grant CRUD to the `authenticated` role.
- The user-bar in the top-right shows your name and a **log out** link.

## Tasks

### Anatomy of a task bar

| Visual cue                                | Meaning                                                              |
|-------------------------------------------|----------------------------------------------------------------------|
| Solid bar, glowing white outline          | Capacity impact = **high**                                           |
| Solid bar, normal outline                 | Capacity impact = **medium**                                         |
| Faded bar (45% opacity)                   | Capacity impact = **low**                                            |
| Dashed border with diagonal hatching      | Floating task — start date unknown, drawn at *today + 14d*           |
| Red border with red diagonal hatching + ⚠ | Overdue — not complete and the end date is in the past               |
| Orange pin head + stem above the bar      | Milestone (label appears next to the pin)                            |
| Vertical red line across the chart        | Today                                                                |
| Bar fades to translucent at the chart edge| The task starts before / extends past the visible window             |

### Creating a task

Click **Quick add task** in the top bar. Fill in:

- **Person** — typeahead from existing people (a new person name creates a new lane).
- **Task** — short label drawn on the bar.
- **Unknown start date (floating)** — tick this if you don't know when it'll start. The bar will hatch.
- **Start date / End date** — `End date` is optional; leave it blank for an open-ended task.
- **Capacity impact** — high / medium / low (drives the visual prominence).
- **Complete** — tick to mark done (filtered out by default via the "Hide completed" panel).
- **Milestones** — zero or more `(label, date)` pairs. Add as many as you want.

Hitting **Add** issues a single GraphQL `createTask` mutation against `/data-api/graphql`.

### Editing a task

Click anywhere on a task bar (or its label) on the chart. The same modal opens, pre-filled and titled **Edit task**. The button changes to **Update**, and a red **Delete** button appears in the bottom-left of the modal.

### Deleting a task

Open the edit modal and click **Delete**. You'll be asked to confirm.

## Filtering

All filters are client-side and instant. Filtering never deletes data — it just hides it.

| Panel              | What it does                                                       |
|--------------------|--------------------------------------------------------------------|
| Capacity impact    | Hides bars whose impact level is unticked                          |
| Status             | Hides tasks where `complete = true` (default on)                   |
| Milestones         | Hides milestone pins for all tasks                                 |
| Tasks shown        | Per-task hide checkboxes (useful for cleaning up a busy view)      |
| Future window      | Pick 3w / 3m / 1y. Past = `~window/3` days. Click **Apply**.       |

## Person import / export

For sharing a single person's tasks with someone else, or for bulk editing in a text editor.

1. Click **Person import/export**.
2. Pick the person from the dropdown.
3. **Export** populates the textarea with `{"tasks":[ ... ]}` for that person only. Copy and send.
4. **Import & replace** takes the JSON in the textarea and **replaces every task for the selected person** with it. The replacement happens task-by-task against the database (delete-all-then-insert-all for that person), so other people's tasks are untouched.
5. If the JSON has tasks under a different person name, you'll be warned and (if you confirm) all of them get re-assigned to the selected person.

## Download JSON

The **Download JSON** button writes the *current in-memory snapshot* (`{ "tasks": [...] }`) to a timestamped file on your machine. Useful for backups or sharing the whole plan. Note: this is a read-only export; nothing in the database changes.

## Reload from DB

Pulls the entire task set from Azure SQL again. Use after someone else may have made changes, or if the chart looks stale. The status text next to the **Apply** button reports the result.

## Concurrency and conflict handling

The current model is **last-write-wins** at the task level. If two users edit the same task simultaneously, the later save wins. Because mutations are per-task (not bulk), the blast radius of a conflict is one task at a time. Reload before editing if you suspect drift.

## Data shape — quick reference

A single task as it appears in the JSON view (and in the export):

```json
{
  "person": "alice",
  "task": "Q3 launch",
  "start": "2026-04-15",
  "end": "2026-06-30",
  "capacityImpact": "high",
  "complete": false,
  "milestones": {
    "design freeze": "2026-05-01",
    "ship": "2026-06-30"
  }
}
```

The corresponding row in `gantt.Tasks`:

| Column          | Value                                                          |
|-----------------|----------------------------------------------------------------|
| Id              | `8b4f…` (uniqueidentifier, server-assigned)                    |
| Person          | `alice`                                                        |
| TaskName        | `Q3 launch`                                                    |
| StartDate       | `2026-04-15`                                                   |
| EndDate         | `2026-06-30`                                                   |
| CapacityImpact  | `high`                                                         |
| Complete        | `0`                                                            |
| MilestonesJson  | `{"design freeze":"2026-05-01","ship":"2026-06-30"}`           |
| CreatedUtc      | `2026-04-23T09:14:11Z`                                         |
| UpdatedUtc      | `2026-04-23T09:14:11Z`                                         |

## Troubleshooting

| Symptom                                              | Likely cause / fix                                                                                                |
|------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|
| Page loads but instantly redirects to a Microsoft login | Working as designed — sign in with your Entra ID account.                                                       |
| `Could not load tasks: HTTP 500`                     | DAB couldn't reach SQL. Check the SWA portal **Database connection** blade for the connection-string status.      |
| `Could not load tasks: Not authenticated`            | Your session expired. The app redirected you to `/login`; sign in again.                                          |
| New tasks appear, then vanish on refresh             | The `createTask` mutation failed silently in a previous version — check the browser devtools network tab for 4xx. |
| Chart is empty but the JSON view shows tasks         | All tasks are filtered out. Check the right-hand panels (especially **Hide completed** and the date window).      |
| `gantt.Tasks` doesn't exist                          | You skipped step 2 of [SETUP.md](SETUP.md). Run `sql/01-schema.sql`.                                              |
