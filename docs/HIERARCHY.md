# Organisational Hierarchy — Department → Program → Baseline → Component → Subcomponent → Task

This document covers the database schema, migration strategy, permission model and API for the
organisational hierarchy shared by Storypoint Estimation (SP) and Parametric Estimation (PE).

```text
Department
 └── Program            (formerly "Project")
      └── Baseline      (many per program, versioned)
           └── Component        (optional)
                └── Subcomponent (optional)
                     └── Task (SP `estimations` / PE `parametric_estimations`) — Estimated + Actual
```

---

## 1. Database

Migration source: `backend/src/db/migrate.hierarchy.ts` (run by `npm run db:init`; idempotent).

### Tables

| Table | Key columns | Notes |
|---|---|---|
| `departments` | `id`, `name`, `code`, `description`, `status`, `is_system`, `created_by`, `created_at` | Unique on `LOWER(name)` and `UPPER(code)`. |
| `projects` (= **Programs**) | `+ department_id NOT NULL` | Physical table name kept for FK compatibility; every API/UI calls it *Program*. `UNIQUE (id, department_id)`. |
| `user_departments` | `user_id`, `department_id` | Department-level access. |
| `project_users` (= UserPrograms) | `user_id`, `project_id` | Existing program assignment table. |
| `baselines` | `project_id`, `name`, `version`, `description`, `start_date`, `end_date`, `status` | `UNIQUE (id, project_id)`. |
| `components` | `baseline_id`, `name`, … | `UNIQUE (id, baseline_id)`. |
| `subcomponents` | `component_id`, `name`, … | `UNIQUE (id, component_id)`. |
| `estimations` / `parametric_estimations` | `+ department_id, baseline_id, component_id NULL, subcomponent_id NULL` | PE also gains `actual_days`, `variance_days`, `accuracy_percent`, `completed_at`, `status`. |

### Consistency is enforced by the database

Composite foreign keys make invalid cross-level combinations impossible, independent of the API:

- task `(project_id, department_id)` → `projects (id, department_id)` — `ON UPDATE CASCADE`, so moving a Program to another Department moves its tasks.
- task `(baseline_id, project_id)` → `baselines (id, project_id)`
- task `(component_id, baseline_id)` → `components (id, baseline_id)` (nullable)
- task `(subcomponent_id, component_id)` → `subcomponents (id, component_id)` (nullable)

### Migration of existing data (no invented associations)

1. Programs without a department go to the system department **Unassigned** (`UNASSIGNED`, `is_system = true`). Admins re-home them from the Programs page.
2. Every user assigned to a program gets the matching `user_departments` row, so no one loses access.
3. Tasks that have a program but no baseline are attached to a per-program **Legacy (pre-hierarchy)** baseline (version `LEGACY`). It is created only for programs that own such rows.
4. Tasks with **no program** keep every hierarchy column `NULL`. Only global users see them, until an admin re-assigns them through `PUT /api/estimations/:id` or `PUT /api/parametric-estimations/:id`.

No rows are deleted or duplicated, and re-running the migration is a no-op.

---

## 2. Access model

| Rule | Implementation |
|---|---|
| User sees only assigned Departments | `user_departments` |
| User sees only assigned Programs, within an assigned Department | `project_users` ∩ program's `department_id` ∈ user's departments |
| Baselines / Components / Subcomponents | Inherit visibility from their Program |
| Global Super Admin (and global admin roles) | Unrestricted (`isGlobal`) |
| Inactive Department / Program / Baseline | Hidden from lookups; new tasks cannot be created under it |

Scoping happens on the server in `services/userAccess.service.ts` and `services/hierarchy.service.ts` (`applyHierarchyScope`). Every list, dashboard, history and analytics query uses it. Frontend filtering is only for convenience.

New permissions: `department.read|create|update|assign`, `baseline.read|create|update|delete`, `component.manage`.

---

## 3. API

All endpoints are under `/api` and require a bearer token.

### Master data

| Method | Path | Permission |
|---|---|---|
| GET / POST | `/departments` | `department.read` / `department.create` |
| GET / PUT | `/departments/:id` | `department.read` / `department.update` |
| PATCH | `/departments/:id/status` | `department.update` |
| GET / POST | `/departments/:id/users` | `department.read` / `department.assign` |
| DELETE | `/departments/:id/users/:userId` | `department.assign` |
| GET / POST / PUT / DELETE | `/projects[/:id]` (Programs; `department_id` required on create) | `project.*` |
| POST / DELETE | `/projects/:id/users[/:userId]` | `project.assign` |
| GET / POST | `/baselines` (`?programId=`) | `baseline.read` / `baseline.create` |
| GET / PUT / DELETE | `/baselines/:id` | `baseline.read` / `baseline.update` / `baseline.delete` |
| PATCH | `/baselines/:id/status` | `baseline.update` |
| GET / POST / PUT / DELETE | `/components[/:id]` (`?baselineId=`) | `baseline.read` / `component.manage` |
| GET / POST / PUT / DELETE | `/subcomponents[/:id]` (`?componentId=`) | `baseline.read` / `component.manage` |

The API validates required fields, duplicates (409), parent existence and status, and parent/child consistency (400 or 422). Access outside the user's scope returns 403.

### Header context and cascading lookups (any authenticated user, permission-filtered)

| Path | Params | Returns |
|---|---|---|
| `GET /hierarchy/context` | — | `{ isGlobal, departments[], programs[] }` for the header |
| `GET /hierarchy/lookup/departments` | `search?` | accessible active departments |
| `GET /hierarchy/lookup/programs` | `departmentId`, `search?` | accessible active programs of the department |
| `GET /hierarchy/lookup/baselines` | `programId`, `search?` | active baselines |
| `GET /hierarchy/lookup/components` | `baselineId`, `search?` | components |
| `GET /hierarchy/lookup/subcomponents` | `componentId`, `search?` | subcomponents |

### Tasks

`POST /estimations`, `POST /parametric-estimations` and both `/import` endpoints require
`department_id`, `program_id` and `baseline_id`, and accept optional `component_id` and `subcomponent_id`.
Actual effort is recorded with `PATCH /estimations/:id/actuals` (hours) or
`PATCH /parametric-estimations/:id/actuals` (person-days).

Every SP/PE list, dashboard, history and analytics endpoint (`/estimations`, `/analysis/*`,
`/parametric-estimations`, `/parametric-analysis/*`) accepts the filters
`departmentId`, `programId`, `baselineId`, `componentId` and `subcomponentId`.

### Estimated vs Actual aggregation

```
GET /hierarchy/effort?module=sp|pe&groupBy=department|program|baseline|component|subcomponent|task
    [&departmentId][&programId][&baselineId][&componentId][&subcomponentId][&from][&to]
```

- `module=sp` needs `estimation.read` and reports hours (`estimated_hours`, falling back to `revised_min_hours`, vs `actual_hours`).
- `module=pe` needs `parametric.read` and reports person-days (`final_estimation` vs `actual_days`).
- Variance follows each module's convention, which the response returns as `variance_convention`: SP uses `Actual − Estimated`, PE uses `Estimated − Actual`. Each row also includes `deviation_percent`. See [PARAMETRIC_ACTUALS.md](PARAMETRIC_ACTUALS.md).
- Tasks without a component or subcomponent are grouped under *(No component)* / *(No subcomponent)*, so totals stay complete at every level.
- The SP and PE calculation engines stay independent. Only the hierarchy is shared.

---

## 4. Frontend

| Piece | File |
|---|---|
| Global Department/Program context (persisted) | `frontend/src/store/hierarchyStore.ts` |
| Header pickers | `frontend/src/components/layout/ContextSelector.tsx` |
| Reusable searchable dropdown | `frontend/src/components/ui/SearchableSelect.tsx` |
| Task-form cascade (5 levels) | `frontend/src/components/hierarchy/HierarchySelector.tsx` |
| Page filter bar (Dashboard / History / Analytics) | `frontend/src/components/hierarchy/HierarchyFilterBar.tsx` |
| Estimated vs Actual breakdown | `frontend/src/components/hierarchy/EffortBreakdown.tsx` |
| Admin pages | `/departments`, `/programs`, `/baselines` (`/projects` redirects to `/programs`) |

Behaviour:
- A single authorised Department or Program is selected automatically.
- Changing a parent clears any dependent selection that is no longer valid.
- Component and Subcomponent stay optional.

---

## 5. Tests

| Suite | Command |
|---|---|
| Backend unit (controllers, services, access) | `cd backend && npm test` |
| Backend integration — real PostgreSQL + Express | `INTEGRATION_DATABASE_URL=postgresql://user:pass@localhost:5435/estimation_it npm run test:integration` (**drops and re-creates** that database) |
| Frontend (store, SearchableSelect, HierarchySelector) | `cd frontend && npm test` |
