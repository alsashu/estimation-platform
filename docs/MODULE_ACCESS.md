# Estimation Module Access (SP / PE)

Users are granted **Story Point Estimation (SP)**, **Parametric Estimation (PE)**, or both. Module access
is **separate from roles**: "Admin + SP" and "Admin + PE" are the same Admin role with different module
grants, so adding a module later never needs new role combinations.

**Effective access = role permissions ∩ module access ∩ Department / Program scope.**

## Data model

| Table | Purpose |
|---|---|
| `estimation_modules` | Module catalogue: `SP` Story Point Estimation, `PE` Parametric Estimation |
| `user_estimation_access` | One row per (user, module): `is_active`, `grant_source` (`admin` / `registration` / `migration` / `seed`), `created_by/at`, `updated_by/at`. `UNIQUE (user_id, module_code)`, FKs to `users` (cascade) and `estimation_modules` |

Revoking a module deactivates the row instead of deleting it. Every change also writes `audit_logs`:
`estimation_access_granted` (create / registration approval), `estimation_access_updated`
(with `previous_value` / `new_value` incl. `added` / `removed`) and `estimation_access_migrated`.

Migration: `backend/src/db/migrate.estimationAccess.ts` (schema in `runEstimationAccessMigration`, run with
the other migrations; backfill in `backfillEstimationAccess`, run once after seeding).

## Which permissions belong to which module

| Module | Permissions |
|---|---|
| SP | `estimation.*`, `master.*` (Story Points, Effort Estimates, Competency) |
| PE | `parametric.*` (incl. `parametric.import` Excel upload, `parametric.master.*`, `parametric.actuals.correct`) |
| — (shared) | users, roles, departments, programs, baselines, registrations, monitoring, audit |

## Enforcement (backend)

- The access token carries the **role** permissions and the modules at issue time.
- `middleware/authenticate.ts` reads the user's modules **live** on every request
  (`services/estimationAccess.service.ts`, 15 s cache invalidated whenever modules change) and removes the
  permissions of modules the user does not hold. All existing `authorize('estimation.read')`,
  `authorize('parametric.import')` … checks therefore enforce module access with no per-route changes:
  SP / PE estimation, dashboard, history, analytics, master-data and Excel-import APIs answer **403**.
  `/hierarchy/effort?module=sp|pe` checks the matching module.
- Changes apply **immediately**: a revoked module is refused on the very next request, even with an
  older token. A tampered token fails signature verification (401). If the lookup fails, the request fails
  (fail closed).
- When the live modules differ from the token, responses carry `X-Access-Changed: SP,PE | SP | PE | none`.
- Global Super Admin always has both modules.

## Grant rules

| Actor | Can grant |
|---|---|
| Global Super Admin | SP only, PE only, or both, to anyone (incl. Admins) |
| Admin with SP | SP only |
| Admin with PE | PE only |
| Admin with both | SP only, PE only, or both |

- At least one module is required on create (`POST /api/users`, `modules`), on registration approval
  (`POST /api/registrations/:id/approve`, `modules`) and when `modules` is sent on update (`PUT /api/users/:id`).
- Requesting a module the actor does not hold → **403**. Empty or unknown → **400**.
- On update, modules the target has but the actor cannot manage are **kept** (an SP-only Admin cannot strip
  someone's PE access).
- Department / Program scope still applies (`checkGrantScope`), and an Admin can still only manage users
  they created.

## Frontend

- `utils/moduleAccess.ts`: module list, field state, validation, route → module, landing page.
- `store/authStore.ts`: `modules`, `getModules()`, `hasModule()`, `setUser()`.
- `services/api.ts`: on `X-Access-Changed` that differs from the stored modules, reloads `/auth/me` so the
  navigation updates without logging out.
- **Sidebar** shows SP items only with SP (Dashboard SP, Storypoint Estimation, Historical Data SP,
  Analytics SP, Story Points, Effort Estimates, Competency), and PE items only with PE (Dashboard PE,
  Parametric Estimation, Historical Data PE, Analytics PE, Parametric Data). Groups with no visible item are
  hidden. Organisation (Departments / Programs / Baselines) stays governed by its own permissions.
- **Routes** (`components/auth/ModuleRoute.tsx`): direct URLs to another module's pages show a
  "403 · Access denied" page. `/` sends PE-only users to Dashboard PE, and users with no module to
  `/no-module-access`.
- **Create / Edit User** and **Approve Registration** have the *Estimation Module Access \** field
  (`components/access/EstimationModuleAccessField.tsx`). Modules the admin cannot grant are disabled;
  modules a user keeps but the admin cannot manage are shown ticked and locked. The Users table has a
  Modules column.

## Existing users — migration policy

Applied once (marker `app_settings['estimation_access.backfill_v1']`), recorded per user in `audit_logs`:

- **SP** is granted if the user's roles currently confer any SP permission (`estimation.*` / `master.*`).
- **PE** is granted if the user's roles currently confer any PE permission (`parametric.*`).
- Users whose roles confer neither get no module (they could not use either before).
- Rows are marked `grant_source = 'migration'`. Users with existing rows are never touched.

This preserves exactly the access each account had. Nothing is granted beyond what the role already
allowed. At the time of migration all four system roles (Global Super Admin, Scoped Super Admin, Admin,
User) included both SP and PE permissions, so every existing account kept both modules. Narrow them per
user in User Management. Accounts created after the migration must be given modules explicitly.

## Tests

- `backend/src/__tests__/services/estimationAccess.test.ts`: permission → module mapping, grant rules for
  every GSA / Admin combination, Department / Program combination, edit rules, persistence, backfill.
- `backend/src/__tests__/middleware/authenticate.test.ts`: live filtering, immediate revoke / grant, GSA,
  caching, fail-closed, tampered token, SP / PE 403 via `authorize`.
- `backend/src/__tests__/integration/hierarchy.db.test.ts` "Module access" (real Postgres): backfill,
  unique constraint, SP / PE / master-data / Excel-import / effort APIs, grant 403s, scope, live switch with
  the same token, audit trail.
- `frontend/src/__tests__/components/ModuleAccess.test.tsx`: SP-only / PE-only / both / none navigation,
  direct-URL guards, landing pages, the form field. `__tests__/utils/accessSync.test.ts`: header handling.
