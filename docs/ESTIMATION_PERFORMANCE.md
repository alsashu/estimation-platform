# Estimation Performance Dashboard (EFA · ED · EBI · EEI)

**Sidebar:** Overview → *Estimation Performance* (`/estimation-performance`). It is visible to users with SP and/or PE access.
The dashboard is independent of Dashboard SP and Dashboard PE and reads the same records as **Historical Data SP**
(`estimations`) and **Historical Data PE** (`parametric_estimations`). Nothing is copied or modified. Every value is
calculated from eligible records at request time.

## Common effort basis

| Method | Approved estimate | Actual | Unit |
|---|---|---|---|
| SP | `estimated_hours` (falls back to the framework's `revised_min_hours`, as when actuals are recorded) ÷ 8 | `actual_hours` ÷ 8 | PersonDays |
| PE | `final_estimation` | `actual_days` | PersonDays |

Story Points are never added to PersonDays. Every row keeps its method, id and source, so SP and PE rows cannot collide
or be counted twice.

**Eligible record:** `status = completed`, an approved estimate > 0 and a recorded actual, completed (`completed_at`)
inside the selected From/To dates in the caller's time zone. A missing actual is never treated as 0; the record is
simply not eligible. Completed records without a usable estimate or actual are counted and reported as *excluded*.

## KPI definitions

| KPI | Formula | Records |
|---|---|---|
| **ED** Estimation Deviation | `(ΣE − ΣA) / ΣE × 100` (signed). Per task `(E − A) / E × 100` | all eligible |
| **Aggregate ED** | `Σ|E − A| / ΣE × 100` (absolute, errors never cancel) | — |
| **EFA** Estimation Framework Accuracy | `100 − Framework Aggregate ED` | framework-aligned only |
| **EEI** Estimation Effectiveness Index | `100 − Aggregate ED` | all eligible |
| **EBI** Estimation Benefit Index | `(Historical ED − Current ED) / Historical ED × 100` | historical baseline vs framework-aligned records |

**ED direction** uses the on-target tolerance (default ±5 %). Below −tolerance is underestimation (actual > estimate),
above +tolerance is overestimation, and anything in between is on target.

### EFA vs EEI: different record sets

The two formulas have the same shape, so the record sets are kept explicitly separate:

- **Framework-aligned** (EFA, and the current side of EBI) means the approved estimate *is* the framework's calibrated output.
  - **SP:** the approved estimate lies inside the framework's calibrated range (`revised_min_hours … revised_max_hours`) or was
    never overridden.
  - **PE:** `final_estimation` is always the engine's output, so every PE record is framework-aligned.
- **EEI** uses every eligible record, including SP estimates a team overrode outside the framework range.
- **Framework Adoption Rate** = framework-aligned ÷ eligible.

### EBI: historical baseline without the framework

Estimates made before the framework were never captured in the platform. The historical side of EBI is therefore
a **governed historical baseline**: approved totals from the pre-framework records. Each baseline has:

- a scope: a Department or a Program
- a method: SP, PE or ALL
- totals: ΣE, ΣA, Σ|E − A| and the number of records
- the period it covers, plus a source/approval note

Manage baselines from the *Historical Baselines* button. This needs the `performance.baseline.manage` permission,
which is granted to GSA, Scoped SA and Admin.

**Comparable scope** rules:

- **Program vs department level:** a department uses its program-level baselines when it has any, otherwise its
  department-level baseline, never both. With a Program or org-Baseline filter, only program-level baselines apply.
- **Method coverage:** an ALL baseline covers both methods. SP-only reporting prefers the SP baseline, then falls back
  to ALL.
- **Current side:** only framework-aligned records in the scopes and methods a baseline covers.
- **Uncovered current records:** records in scopes with no baseline are listed as *not compared*.
- **Unused baselines:** baselines with no current records in the period are left out of the calculation.

**Versioning:** baselines are never overwritten. An edit retires the active row and inserts a new version
(`supersedes_id`). There is at most one active baseline per Department, Program and method. Every change is written to
`audit_logs`.

**When EBI shows N/A**, distinct from 0:

- no baseline in scope
- Historical ED = 0, because the formula would divide by zero
- no current framework records in the period
- the baseline or task level, where EBI is not tracked

Results are never capped. EBI can be negative (deterioration), and EEI can drop below 0.

> The spec's EEI example writes `Aggregate ED = 360 / 1,240` with 1,240 labelled *Total actual*. The formula, and the
> tooltip example ("Total Estimated PD = 1,240 PD"), divide by **ΣEstimate**, and the implementation follows the formula.

## Filters and access

| Filter | Behaviour |
|---|---|
| Department | Bound to the global header Department |
| Programs | Multi-select, searchable, defaults to the header Program, or all programs of the department when empty |
| Baseline | Enabled when exactly one program is selected |
| From / To | Default is the last 90 days (configurable). From ≤ To, no future dates, maximum 3660 days |
| Method | Both, Story Point or Parametric |

**Department and Program access** is enforced in SQL. Non-global users only ever see their own programs. Asking for
an inaccessible scope returns no rows. Baselines are filtered the same way.

**Method access** follows the user's module access:

- SP needs `estimation.read` (SP module); PE needs `parametric.read` (PE module).
- *Both* reports the methods the user holds.
- Requesting a method the user does not hold explicitly returns **403**.

## Dashboard

- **KPI tiles:**
  - Each tile shows the value, a short description, a status (thresholds are configurable under *Thresholds*) and the
    change against the previous period of the same length.
  - Hovering the tile, or tapping its ⓘ, opens the calculation tooltip. It shows the formula, the actual inputs, each
    step, the result, the interpretation, the data source and the number of eligible records. Every number comes from
    the backend result.
  - Clicking a tile opens a drawer with the full breakdown, recommended actions and the supporting records (exportable
    as CSV).
- **Indicators:** total estimated, actual and absolute-error PD; average deviation; under-, over- and on-target rates;
  actuals coverage; data completeness; framework adoption; calibration gap; best program; highest-deviation program;
  best department.
- **Charts:**
  - ED deviation by program (diverging; click a bar to drill down)
  - Historical vs Current ED, by program or department
  - EFA and EEI trend
  - Program-wise performance (choose a KPI, best or worst first)
  - Under- vs overestimation
  - |ED| distribution (configurable buckets)
  - Department comparison
  - Top 5 programs needing calibration and top 5 showing improvement
- **Drill-down table:** Department → Program → Baseline → Task, with CSV export. *Export* downloads the KPI summary.
- **Snapshots:** the server recalculates the dashboard for the given filters and stores the result, including the
  baseline versions used. A management report can then be reproduced after records or baselines change. Snapshots are
  visible to their author, and to global users.

Colours were validated with the dataviz palette validator in light and dark mode. EFA is blue, EEI orange and EBI aqua.
Deviation direction uses red (under) and blue (over) with a grey midpoint. Status always appears as an icon plus a
label.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/performance/dashboard` | Summary, previous period, indicators, comparisons, trend, distribution |
| `GET /api/performance/breakdown?groupBy=department\|program\|baseline\|task` | Drill-down rows (tasks carry source and framework flag) |
| `GET/POST /api/performance/baselines`, `PUT /…/:id`, `PATCH /…/:id/status` | Historical baselines |
| `GET/PUT /api/performance/settings` | Thresholds, tolerance, histogram bounds, default range |
| `GET/POST /api/performance/snapshots`, `GET /…/:id` | Snapshots |

Filters: `departmentId`, `programIds` (comma list), `baselineId`, `from`, `to`, `tz`, `method`. Documented in Swagger
under *Estimation Performance*.

**Code:**

- Engine (pure functions): `backend/src/services/performanceKpi.ts`
- Data access: `backend/src/services/performanceData.ts`
- Controller: `backend/src/controllers/performance.controller.ts`
- Tables: `kpi_historical_baselines`, `kpi_snapshots`, created in `backend/src/db/migrate.performance.ts`
- Frontend: `frontend/src/modules/performance/`

## Tests

- `backend/src/__tests__/services/performanceKpi.test.ts`:
  - every formula: positive, negative and zero ED; EFA and EEI aggregation; uncapped results
  - all EBI cases: historical above, below and equal to current; historical 0; no baseline; comparable scope
  - framework alignment, scope matching, breakdowns, distribution, time-zone trend, thresholds
- `backend/src/__tests__/services/performanceData.test.ts`: method permissions, filter validation, Department and
  Program scoping. Includes a regression test: a denied scope must not leave bound parameters behind.
- `backend/src/__tests__/integration/hierarchy.db.test.ts`, *Estimation Performance* (real PostgreSQL):
  - hand-checked EFA, ED and EEI on mixed SP and PE records
  - SP, PE and combined reporting, plus date, program, baseline and department filters
  - EBI with a versioned baseline, the historical-ED-0 N/A case and snapshot immutability
  - audit trail, and 403s and scoping for a PE-only user
- `frontend/src/__tests__/components/EstimationPerformance.test.tsx`:
  - tooltip calculations, which must match the backend values
  - N/A vs 0, filters, method access, invalid dates, the empty state and the drawer
  - sidebar visibility, baseline form validation and CSV export
