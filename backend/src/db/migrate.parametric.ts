import { PoolClient } from 'pg';

export const parametricMigration = `
-- ─── Parametric: Average Estimation configs ──────────────────────────────────
CREATE TABLE IF NOT EXISTS parametric_average_configs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  small       DECIMAL(8,2) NOT NULL,
  medium      DECIMAL(8,2) NOT NULL,
  large       DECIMAL(8,2) NOT NULL,
  is_default  BOOLEAN      NOT NULL DEFAULT false,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Parametric: Expert Judgement configs ────────────────────────────────────
CREATE TABLE IF NOT EXISTS parametric_expert_configs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_default  BOOLEAN      NOT NULL DEFAULT false,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parametric_expert_values (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_id              UUID NOT NULL REFERENCES parametric_expert_configs(id) ON DELETE CASCADE,
  size                   VARCHAR(10) NOT NULL CHECK (size IN ('Small', 'Medium', 'Large')),
  middleware_inputs      DECIMAL(8,2) NOT NULL DEFAULT 0,
  application            DECIMAL(8,2) NOT NULL DEFAULT 0,
  system_configuration   DECIMAL(8,2) NOT NULL DEFAULT 0,
  data_and_control_flow  DECIMAL(8,2) NOT NULL DEFAULT 0,
  use_case               DECIMAL(8,2) NOT NULL DEFAULT 0,
  UNIQUE (config_id, size)
);

CREATE INDEX IF NOT EXISTS idx_parametric_expert_values_config ON parametric_expert_values(config_id);

-- ─── Project → Parametric configuration mapping ──────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS parametric_average_config_id UUID REFERENCES parametric_average_configs(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS parametric_expert_config_id  UUID REFERENCES parametric_expert_configs(id)  ON DELETE SET NULL;

-- ─── Parametric Estimation History ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parametric_estimations (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_title               VARCHAR(255) NOT NULL,
  project_id               UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name             VARCHAR(255),
  description              TEXT,
  work_group               VARCHAR(100),
  middleware_inputs        VARCHAR(10) NOT NULL CHECK (middleware_inputs IN ('Small','Medium','Large','NA')),
  application              VARCHAR(10) NOT NULL CHECK (application IN ('Small','Medium','Large','NA')),
  system_configuration     VARCHAR(10) NOT NULL CHECK (system_configuration IN ('Small','Medium','Large','NA')),
  data_and_control_flow    VARCHAR(10) NOT NULL CHECK (data_and_control_flow IN ('Small','Medium','Large','NA')),
  use_case                 VARCHAR(10) NOT NULL CHECK (use_case IN ('Small','Medium','Large','NA')),
  team_efficiency          DECIMAL(3,2) NOT NULL,
  multiplier               DECIMAL(6,3) NOT NULL,
  detailed_estimation      DECIMAL(10,2) NOT NULL,
  average_estimation       DECIMAL(10,2) NOT NULL,
  final_estimation         DECIMAL(10,2) NOT NULL,
  expert_config_id         UUID REFERENCES parametric_expert_configs(id) ON DELETE SET NULL,
  expert_config_name       VARCHAR(100),
  expert_config_snapshot   JSONB,
  average_config_id        UUID REFERENCES parametric_average_configs(id) ON DELETE SET NULL,
  average_config_name      VARCHAR(100),
  average_config_snapshot  JSONB,
  breakdown                JSONB,
  source                   VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'excel_import')),
  created_by               UUID REFERENCES users(id),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by               UUID REFERENCES users(id),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parametric_estimations_project ON parametric_estimations(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parametric_estimations_created ON parametric_estimations(created_at DESC);

-- ─── Triggers ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER update_parametric_average_configs_updated_at BEFORE UPDATE ON parametric_average_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_parametric_expert_configs_updated_at BEFORE UPDATE ON parametric_expert_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_parametric_estimations_updated_at BEFORE UPDATE ON parametric_estimations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

export async function runParametricMigration(client: PoolClient): Promise<void> {
  console.log('🔧  Running parametric estimation migration...');
  await client.query(parametricMigration);
  console.log('✅  Parametric estimation migration complete.');
}
