import { pool } from '../config/database';
import { seedData } from './seed';
import { runEnterpriseMigration } from './migrate';
import { seedEnterpriseData } from './seed.enterprise';

const schema = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS story_point_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complexity VARCHAR(20) NOT NULL,
  risk VARCHAR(20) NOT NULL,
  story_points INTEGER NOT NULL,
  color_hex VARCHAR(10) NOT NULL DEFAULT '#1E3246',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(complexity, risk)
);

CREATE TABLE IF NOT EXISTS effort_estimate_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_points INTEGER NOT NULL UNIQUE,
  min_days DECIMAL(6,2) NOT NULL,
  max_days DECIMAL(6,2) NOT NULL,
  min_hours DECIMAL(7,2) GENERATED ALWAYS AS (min_days * 8) STORED,
  max_hours DECIMAL(7,2) GENERATED ALWAYS AS (max_days * 8) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competency_overhead_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  competency VARCHAR(20) NOT NULL,
  complexity VARCHAR(20) NOT NULL,
  overhead_percent DECIMAL(5,4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competency, complexity)
);

CREATE TABLE IF NOT EXISTS competency_level_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level VARCHAR(20) NOT NULL UNIQUE,
  description TEXT,
  knowledge_depth TEXT,
  independence TEXT,
  problem_solving TEXT,
  communication TEXT,
  mentorship TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS complexity_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level VARCHAR(20) NOT NULL UNIQUE,
  scope TEXT,
  requirement_clarity TEXT,
  business_logic TEXT,
  dependencies TEXT,
  implementation_effort TEXT,
  testing_effort TEXT,
  risk_label TEXT,
  rollback_complexity TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level VARCHAR(20) NOT NULL UNIQUE,
  scope TEXT,
  requirement_clarity TEXT,
  business_logic TEXT,
  dependencies TEXT,
  implementation_effort TEXT,
  testing_effort TEXT,
  risk_label TEXT,
  rollback_complexity TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estimations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  project_name VARCHAR(255),
  complexity VARCHAR(20) NOT NULL,
  risk VARCHAR(20) NOT NULL,
  competency VARCHAR(20) NOT NULL,
  work_group VARCHAR(20) NOT NULL DEFAULT 'DEVELOPMENT',
  story_points INTEGER NOT NULL,
  initial_min_days DECIMAL(8,2) NOT NULL,
  initial_max_days DECIMAL(8,2) NOT NULL,
  initial_min_hours DECIMAL(9,2) NOT NULL,
  initial_max_hours DECIMAL(9,2) NOT NULL,
  overhead_percent DECIMAL(5,4) NOT NULL,
  revised_min_days DECIMAL(8,4) NOT NULL,
  revised_max_days DECIMAL(8,4) NOT NULL,
  revised_min_hours DECIMAL(9,4) NOT NULL,
  revised_max_hours DECIMAL(9,4) NOT NULL,
  actual_hours DECIMAL(9,2),
  actual_days DECIMAL(8,2),
  completed_at TIMESTAMPTZ,
  variance_hours DECIMAL(9,4),
  accuracy_percent DECIMAL(6,4),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(20) DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS estimations ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL(9,2);
ALTER TABLE IF EXISTS estimations ADD COLUMN IF NOT EXISTS work_group VARCHAR(20) NOT NULL DEFAULT 'DEVELOPMENT';

CREATE TABLE IF NOT EXISTS app_logs (
  id          BIGSERIAL PRIMARY KEY,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level       VARCHAR(10)  NOT NULL,
  category    VARCHAR(30)  NOT NULL DEFAULT 'general',
  message     TEXT         NOT NULL,
  correlation_id  VARCHAR(36),
  method          VARCHAR(10),
  url             TEXT,
  status_code     INTEGER,
  response_time_ms INTEGER,
  ip              VARCHAR(45),
  user_agent      TEXT,
  error_stack     TEXT,
  metadata        JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_logs_timestamp   ON app_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level       ON app_logs (level);
CREATE INDEX IF NOT EXISTS idx_app_logs_category    ON app_logs (category);
CREATE INDEX IF NOT EXISTS idx_app_logs_corr_id     ON app_logs (correlation_id)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_logs_status      ON app_logs (status_code)
  WHERE status_code IS NOT NULL;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
  CREATE TRIGGER update_story_point_configs_updated_at BEFORE UPDATE ON story_point_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_effort_estimate_configs_updated_at BEFORE UPDATE ON effort_estimate_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_competency_overhead_configs_updated_at BEFORE UPDATE ON competency_overhead_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_estimations_updated_at BEFORE UPDATE ON estimations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('🗄️  Initialising database schema...');
    await client.query(schema);
    console.log('✅ Schema created/verified.');

    // Enterprise migration (idempotent)
    await runEnterpriseMigration(client);

    const { rows } = await client.query(`SELECT value FROM app_settings WHERE key = 'seeded'`);
    if (rows.length === 0) {
      console.log('🌱 Seeding master data...');
      await seedData(client);
      await client.query(`INSERT INTO app_settings (key, value) VALUES ('seeded', 'true') ON CONFLICT (key) DO NOTHING`);
      console.log('✅ Seed data loaded.');
    } else {
      console.log('ℹ️  Database already seeded.');
    }

    // Enterprise seed (idempotent — uses ON CONFLICT DO NOTHING)
    await seedEnterpriseData(client);

  } finally {
    client.release();
  }
}
