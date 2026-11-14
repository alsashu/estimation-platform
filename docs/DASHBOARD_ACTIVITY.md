# Dashboard Estimation Activity — custom date range

Dashboard SP (`/`) and Dashboard PE (`/parametric-dashboard`) both show an **Estimation Activity** graph
with a From Date / To Date filter. The default is the **last 30 days including today**.

## UI

`frontend/src/components/dashboard/EstimationActivityCard.tsx` (shared by both dashboards), pure helpers in
`components/dashboard/activityRange.ts`.

- From Date, To Date (native date pickers, shown as DD-MM-YYYY in an en-GB browser), **Apply**, **Reset**.
- The graph only changes on **Apply**; **Reset** restores the last 30 days.
- Validation (inline message, Apply disabled): both dates required; From ≤ To; no future dates; at most
  3660 days (~10 years). The pickers also set `max` (today) and `min` (To ≥ From).
- Interval follows the span: ≤ 62 days → daily, ≤ 366 days → weekly (Monday-start), longer → monthly.
  The subtitle says which ("Weekly estimations over the selected period · 01 Jan 2026 – 14 Nov 2026").
- Tooltip shows the period (partial first/last weeks or months are clamped to the range) and counts.
  PE also shows the Manual / Excel-import split.
- No records in the range → an explanatory empty state instead of a flat line.
- Respects the header Department / Program and the page Baseline filter; changing them keeps the range.

## Series

| Dashboard | Series | Date column |
|---|---|---|
| SP | Created | `created_at` |
| SP | Completed | `completed_at` (status `completed`) |
| PE | Estimations (manual + Excel import) | `created_at` |

Before this change SP bucketed everything by `COALESCE(completed_at, created_at)`; it now counts
creations by creation date as required, and completions on the day they were completed.

## API

`GET /api/analysis/trend` (SP) and `GET /api/parametric-analysis/trend` (PE)

| Param | Meaning |
|---|---|
| `from`, `to` | YYYY-MM-DD, inclusive, both required together; `to` not in the future |
| `tz` | IANA time zone the dates are in (frontend sends the browser's); default `UTC` |
| `days` | legacy: last N days ending today, used when `from`/`to` are absent (default 30) |
| `departmentId`, `programId`, `baselineId`, `componentId`, `subcomponentId` | hierarchy filters (plus normal access scoping) |

Response: `{ success, data: [{ date, period_start, period_end, total, … }], meta: { from, to, timezone, interval, days } }`.
SP points add `completed`, `avg_accuracy`; PE points add `manual`, `excel_import`, `avg_final_estimation`.
Invalid input → `400 { success: false, error }`.

Filtering, bucketing and zero-filling all happen in PostgreSQL (`services/activityRange.ts`): day bounds are
converted with `(date)::timestamp AT TIME ZONE tz`, so "14 Nov" means 14 Nov in the user's time zone, and
`generate_series` produces empty buckets. "Future" is judged in the caller's time zone too.

## Tests

- `backend/src/__tests__/services/activityRange.test.ts` — range resolution, validation, time zones, SQL shape,
  hierarchy filters, access scoping (SP + PE).
- `backend/src/__tests__/integration/hierarchy.db.test.ts` — "Estimation Activity" case against real Postgres:
  custom range, zero-fill, time zone bucketing, Department/Program/Baseline filters, manual vs Excel, same-day,
  empty, weekly/monthly, inverted and future ranges, SP creations vs completions, default 30 days.
- `frontend/src/__tests__/components/EstimationActivityCard.test.tsx` — default range, Apply, validation,
  Reset, empty state, interval labels, server error.
