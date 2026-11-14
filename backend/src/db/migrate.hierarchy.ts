import { PoolClient } from 'pg';

/**
 * Organisational hierarchy migration
 *
 *   Department → Program → Baseline → Component (opt) → Subcomponent (opt) → Task
 *
 * Design notes
 * ────────────
 * • "Program" is the renamed "Project". The physical table stays `projects` (it is referenced by
 *   registration_requests, project_users, estimations, parametric_estimations and the parametric
 *   config mapping), and every API/UI surface calls it a Program. Renaming the table would break all
 *   of those FKs for no functional gain.
 *
 * • Cross-level consistency is enforced IN THE DATABASE with composite foreign keys:
 *     programs       UNIQUE (id, department_id)
 *     baselines      UNIQUE (id, project_id)
 *     components     UNIQUE (id, baseline_id)
 *     subcomponents  UNIQUE (id, component_id)
 *   and each task table references (project_id, department_id), (baseline_id, project_id),
 *   (component_id, baseline_id), (subcomponent_id, component_id). A task therefore can never point at
 *   a baseline of a different program, a component of a different baseline, etc. `ON UPDATE CASCADE`
 *   on (project_id, department_id) means moving a Program to another Department moves its tasks too.
 *
 * • Migration of existing data (idempotent, no invented associations):
 *     1. Programs without a department are attached to a system department "Unassigned" (code
 *        UNASSIGNED). It is a clearly-labelled holding area that admins re-home programs out of.
 *     2. Users assigned to a program get a matching user_departments row so nobody loses access.
 *     3. Task rows that already have a program but no baseline are attached to a per-program
 *        "Legacy (pre-hierarchy)" baseline (version LEGACY) that is only created when such rows exist.
 *     4. Task rows WITHOUT a program are left untouched (all hierarchy columns NULL). We do not know
 *        which program they belong to, so they remain "Unassigned" — visible only to global users —
 *        until an admin re-assigns them through PUT /estimations/:id or PUT /parametric-estimations/:id.
 */
export const hierarchyMigration = `
-- ─── Departments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  code        VARCHAR(50)  NOT NULL,
  description TEXT,
  status      VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  is_system   BOOLEAN      NOT NULL DEFAULT false,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_name ON departments (LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_code ON departments (UPPER(code));

INSERT INTO departments (name, code, description, is_system)
SELECT 'Unassigned', 'UNASSIGNED', 'System holding department for programs created before the Department hierarchy existed. Move programs out of here into real departments.', true
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE UPPER(code) = 'UNASSIGNED');

-- ─── Programs (= projects) → Department ──────────────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS department_id UUID;
UPDATE projects SET department_id = (SELECT id FROM departments WHERE UPPER(code) = 'UNASSIGNED')
 WHERE department_id IS NULL;
ALTER TABLE projects ALTER COLUMN department_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT fk_projects_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT uq_projects_id_department UNIQUE (id, department_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_projects_department ON projects(department_id) WHERE deleted_at IS NULL;

-- ─── User ↔ Department access ────────────────────────────────────────────────
-- access_scope = 'assigned' → user sees only the programs explicitly assigned to them (project_users)
-- access_scope = 'all'      → user sees every program in the department (department-level access)
CREATE TABLE IF NOT EXISTS user_departments (
  user_id       UUID NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  access_scope  VARCHAR(20) NOT NULL DEFAULT 'assigned' CHECK (access_scope IN ('assigned', 'all')),
  assigned_by   UUID REFERENCES users(id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, department_id)
);
CREATE INDEX IF NOT EXISTS idx_user_departments_dept ON user_departments(department_id);

-- Backfill: every existing program assignment implies membership of that program's department
INSERT INTO user_departments (user_id, department_id)
SELECT DISTINCT pu.user_id, p.department_id
  FROM project_users pu JOIN projects p ON p.id = pu.project_id
ON CONFLICT DO NOTHING;

-- ─── Baselines ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS baselines (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  name        VARCHAR(255) NOT NULL,
  version     VARCHAR(50),
  description TEXT,
  start_date  DATE,
  end_date    DATE,
  status      VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  is_legacy   BOOLEAN     NOT NULL DEFAULT false,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_baselines_id_project UNIQUE (id, project_id),
  CONSTRAINT ck_baselines_dates CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_baselines_program_name ON baselines (project_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_baselines_project ON baselines(project_id);

-- ─── Components (optional) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS components (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  baseline_id UUID NOT NULL REFERENCES baselines(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_components_id_baseline UNIQUE (id, baseline_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_components_baseline_name ON components (baseline_id, LOWER(name));

-- ─── Subcomponents (optional) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subcomponents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  component_id UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   UUID REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_subcomponents_id_component UNIQUE (id, component_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_subcomponents_component_name ON subcomponents (component_id, LOWER(name));

-- ─── Task tables: hierarchy columns ──────────────────────────────────────────
ALTER TABLE estimations            ADD COLUMN IF NOT EXISTS department_id   UUID;
ALTER TABLE estimations            ADD COLUMN IF NOT EXISTS baseline_id     UUID;
ALTER TABLE estimations            ADD COLUMN IF NOT EXISTS component_id    UUID;
ALTER TABLE estimations            ADD COLUMN IF NOT EXISTS subcomponent_id UUID;
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS department_id   UUID;
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS baseline_id     UUID;
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS component_id    UUID;
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS subcomponent_id UUID;

-- Parametric tasks gain Actual effort tracking (PersonDays — same unit as final_estimation)
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS actual_days      DECIMAL(10,2);
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS variance_days    DECIMAL(10,2);
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS accuracy_percent DECIMAL(6,2);
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ;
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS status           VARCHAR(20) NOT NULL DEFAULT 'open';

-- Backfill department from program for rows that already had a program
UPDATE estimations e            SET department_id = p.department_id FROM projects p WHERE e.project_id = p.id AND e.department_id IS NULL;
UPDATE parametric_estimations e SET department_id = p.department_id FROM projects p WHERE e.project_id = p.id AND e.department_id IS NULL;

-- Legacy baseline only for programs that actually own baseline-less rows
INSERT INTO baselines (project_id, name, version, description, is_legacy)
SELECT DISTINCT x.project_id, 'Legacy (pre-hierarchy)', 'LEGACY',
       'Auto-created during migration to hold estimations recorded before baselines existed.', true
  FROM (
    SELECT project_id FROM estimations            WHERE project_id IS NOT NULL AND baseline_id IS NULL
    UNION
    SELECT project_id FROM parametric_estimations WHERE project_id IS NOT NULL AND baseline_id IS NULL
  ) x
 WHERE NOT EXISTS (SELECT 1 FROM baselines b WHERE b.project_id = x.project_id AND b.is_legacy);

UPDATE estimations e SET baseline_id = b.id
  FROM baselines b WHERE b.project_id = e.project_id AND b.is_legacy AND e.project_id IS NOT NULL AND e.baseline_id IS NULL;
UPDATE parametric_estimations e SET baseline_id = b.id
  FROM baselines b WHERE b.project_id = e.project_id AND b.is_legacy AND e.project_id IS NOT NULL AND e.baseline_id IS NULL;

-- ─── Composite FK constraints (both task tables) ─────────────────────────────
DO $$ BEGIN
  ALTER TABLE estimations ADD CONSTRAINT fk_est_program_department
    FOREIGN KEY (project_id, department_id) REFERENCES projects(id, department_id) ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE estimations ADD CONSTRAINT fk_est_baseline_program
    FOREIGN KEY (baseline_id, project_id) REFERENCES baselines(id, project_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE estimations ADD CONSTRAINT fk_est_component_baseline
    FOREIGN KEY (component_id, baseline_id) REFERENCES components(id, baseline_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE estimations ADD CONSTRAINT fk_est_subcomponent_component
    FOREIGN KEY (subcomponent_id, component_id) REFERENCES subcomponents(id, component_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE estimations ADD CONSTRAINT ck_est_hierarchy_shape CHECK (
    (subcomponent_id IS NULL OR component_id IS NOT NULL) AND
    (component_id    IS NULL OR baseline_id  IS NOT NULL) AND
    (baseline_id     IS NULL OR project_id   IS NOT NULL) AND
    (project_id      IS NULL OR department_id IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE parametric_estimations ADD CONSTRAINT fk_pe_program_department
    FOREIGN KEY (project_id, department_id) REFERENCES projects(id, department_id) ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE parametric_estimations ADD CONSTRAINT fk_pe_baseline_program
    FOREIGN KEY (baseline_id, project_id) REFERENCES baselines(id, project_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE parametric_estimations ADD CONSTRAINT fk_pe_component_baseline
    FOREIGN KEY (component_id, baseline_id) REFERENCES components(id, baseline_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE parametric_estimations ADD CONSTRAINT fk_pe_subcomponent_component
    FOREIGN KEY (subcomponent_id, component_id) REFERENCES subcomponents(id, component_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE parametric_estimations ADD CONSTRAINT ck_pe_hierarchy_shape CHECK (
    (subcomponent_id IS NULL OR component_id IS NOT NULL) AND
    (component_id    IS NULL OR baseline_id  IS NOT NULL) AND
    (baseline_id     IS NULL OR project_id   IS NOT NULL) AND
    (project_id      IS NULL OR department_id IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_est_department   ON estimations(department_id)   WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_est_baseline     ON estimations(baseline_id)     WHERE baseline_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_est_component    ON estimations(component_id)    WHERE component_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_est_subcomponent ON estimations(subcomponent_id) WHERE subcomponent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pe_department    ON parametric_estimations(department_id)   WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pe_baseline      ON parametric_estimations(baseline_id)     WHERE baseline_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pe_component     ON parametric_estimations(component_id)    WHERE component_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pe_subcomponent  ON parametric_estimations(subcomponent_id) WHERE subcomponent_id IS NOT NULL;

-- ─── Triggers ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_baselines_updated_at BEFORE UPDATE ON baselines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_components_updated_at BEFORE UPDATE ON components FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_subcomponents_updated_at BEFORE UPDATE ON subcomponents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

export async function runHierarchyMigration(client: PoolClient): Promise<void> {
  console.log('🔧  Running organisational hierarchy migration...');
  await client.query('BEGIN');
  try {
    await client.query(hierarchyMigration);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  console.log('✅  Hierarchy migration complete.');
}
