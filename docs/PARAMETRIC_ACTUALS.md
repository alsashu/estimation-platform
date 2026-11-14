# Parametric Estimation — Estimated & Actual Effort (PersonDays)

A parametric task's lifecycle:

1. **Estimate.** Create the task. The engine calculates Detailed, Average and Final Estimation from the
   program's parametric master data. **Final Estimation is the Estimated PersonDays.** The task is stored
   with `status = 'open'`, and every actuals field is empty.
2. **Record actuals.** When the work is done, enter the actual PersonDays, plus optional notes and a
   completion date, in the task details panel (Historical Data PE → open a task). The task becomes
   `completed`.
3. **Correct.** If the number was wrong, an authorised user corrects it. The original estimate and
   its calculation breakdown are never modified.

## Metrics

All metrics are computed on the server in `backend/src/services/parametricActuals.ts`. The client shows a live preview before saving.

| Metric | Formula | Notes |
|---|---|---|
| Variance (PD) | `Estimated − Actual` | Positive = finished under estimate, negative = overran |
| Deviation (%) | `|Estimated − Actual| / Estimated × 100` | |
| Accuracy (%) | `(1 − |Estimated − Actual| / Estimated) × 100` | Floored at 0, the same floor Storypoint uses. Deviation still shows the real size of a large miss |

If the estimate is zero or missing, Accuracy and Deviation are `null` ("Not Available") rather than
dividing by zero. Variance is still stored.

> Storypoint keeps its own convention (`Actual − Estimated`, in hours). The calculation engines are
> independent. The shared Estimated-vs-Actual breakdown (`GET /api/hierarchy/effort`) applies each
> module's convention and returns it as `variance_convention`.

## Data

`parametric_estimations` (migration `backend/src/db/migrate.parametricActuals.ts`, idempotent):

| Column | Meaning |
|---|---|
| `final_estimation` | Estimated PersonDays. Never written by the actuals flow |
| `actual_days` | Actual PersonDays. `CHECK (actual_days IS NULL OR actual_days > 0)` |
| `variance_days`, `accuracy_percent`, `deviation_percent` | Derived metrics |
| `actual_notes` | Optional notes (≤ 2,000 chars) |
| `completed_at`, `status` | Completion date. `open` → `completed` |
| `actuals_recorded_by/at` | Who first recorded the actuals, and when |
| `actuals_updated_by/at` | Who last corrected them, and when |

Every recording and correction also writes an `audit_logs` row: entity `parametric_estimation`,
action `actuals_recorded` or `actuals_corrected`, with the previous and new values.
The migration recomputes the derived metrics for any rows that already have actuals, so environments
that recorded actuals under the earlier `Actual − Estimated` sign are brought in line.

## API

### `PATCH /api/parametric-estimations/:id/actuals`

```json
{ "actual_days": 12.5, "notes": "Vendor API changed", "completed_at": "2026-11-14" }
```

| Field | Rules |
|---|---|
| `actual_days` | Required number, > 0, ≤ 100,000, at most 2 decimal places |
| `notes` | Optional, ≤ 2,000 chars. Omitted = keep the stored notes. `null` or `""` = clear them |
| `completed_at` | Optional ISO date or date-time. Not in the future, not before the task was created. Defaults to the stored date, or now |

Permissions:
- **First recording:** `parametric.create`, plus access to the task's Department and Program.
- **Correction** (actuals already exist): the user who recorded them, **or** anyone with
  `parametric.actuals.correct`. That permission goes to Global Super Admin, Scoped Super Admin and Admin. Anyone else gets 403.

The response is the full task row, including `actuals_recorded_by_name` and `actuals_updated_by_name`.

### Reporting

| Endpoint | Adds |
|---|---|
| `GET /api/parametric-analysis/summary` | `completed_count`, `open_count`, `estimated_completed_days`, `actual_total_days`, `total_variance_days`, `avg_accuracy_percent`, `avg_deviation_percent`, `under_estimate_count`, `over_estimate_count`, `on_target_count` |
| `GET /api/parametric-analysis/actuals` | Scatter points (latest 200 completed tasks) and accuracy bands (≥ 85 %, 70–85 %, < 70 %) |
| `GET /api/hierarchy/effort?module=pe&groupBy=…` | Estimated vs Actual, variance, accuracy and deviation at the Department, Program, Baseline, Component, Subcomponent and Task levels |

All of these honour the Department, Program, Baseline, Component and Subcomponent filters and the user's access scope.

## UI

| Where | What |
|---|---|
| Historical Data PE → task details | Before actuals: Estimated PersonDays, "Not Recorded", "Not Available", the record form and **Save Actual**. After actuals: Estimated, Actual, Accuracy, Variance, Deviation, completion date, notes, recorder and last corrector, and **Correct actuals** |
| Historical Data PE table | Actual column and a colour-coded Accuracy badge |
| Dashboard PE | KPIs (tasks with actuals, average accuracy, estimated vs actual, total variance), the under/on/over-estimate split, and estimated vs actual on recent tasks |
| Analytics PE | The same KPIs, an estimated-vs-actual scatter, the accuracy distribution, and the hierarchy breakdown with a Deviation column |

The accuracy-band colours were validated for colour-vision deficiency and contrast in both light and dark mode.
Every band also carries a text label and a count, so colour is never the only signal.

## Tests

- `backend/src/__tests__/services/parametricActuals.test.ts`: the formulas, rounding, and zero or missing estimates.
- `backend/src/__tests__/controllers/parametricActuals.controller.test.ts`: submission, validation,
  corrections, permissions, audit entries, and a check that the estimate is never written.
- `backend/src/__tests__/integration/hierarchy.db.test.ts`: the full flow against real PostgreSQL,
  including the CHECK constraint, audit rows, recorder names and KPIs.
- `frontend/src/__tests__/components/ParametricActualsPanel.test.tsx`: the before and after states, validation, preview,
  correction permissions and rounding.
