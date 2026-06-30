import { PoolClient } from 'pg';

export const enterpriseMigration = `
-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name       VARCHAR(100) NOT NULL,
  last_name        VARCHAR(100) NOT NULL,
  username         VARCHAR(100) NOT NULL UNIQUE,
  email            VARCHAR(255) NOT NULL UNIQUE,
  password_hash    VARCHAR(255) NOT NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'active',
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  last_login_at    TIMESTAMPTZ,
  failed_login_count INTEGER    NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by       UUID REFERENCES users(id),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_status   ON users(status) WHERE deleted_at IS NULL;

-- ─── Roles ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Permissions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  module      VARCHAR(50)  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);

-- ─── User-Role mapping ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);

-- ─── Role-Permission mapping ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);

-- ─── Projects ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  code        VARCHAR(50)  UNIQUE,
  status      VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_code   ON projects(code)   WHERE deleted_at IS NULL;

-- ─── Project-User mapping ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_users (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  role_id     UUID REFERENCES roles(id),
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_users_user    ON project_users(user_id);
CREATE INDEX IF NOT EXISTS idx_project_users_project ON project_users(project_id);

-- ─── Registration Requests ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS registration_requests (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name           VARCHAR(100) NOT NULL,
  last_name            VARCHAR(100) NOT NULL,
  username             VARCHAR(100) NOT NULL,
  email                VARCHAR(255) NOT NULL,
  password_hash        VARCHAR(255) NOT NULL,
  requested_project_id UUID REFERENCES projects(id),
  requested_role_id    UUID REFERENCES roles(id),
  status               VARCHAR(20)  NOT NULL DEFAULT 'pending',
  reviewed_by          UUID REFERENCES users(id),
  reviewed_at          TIMESTAMPTZ,
  rejection_reason     TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_requests_status  ON registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_reg_requests_project ON registration_requests(requested_project_id);
CREATE INDEX IF NOT EXISTS idx_reg_requests_email   ON registration_requests(email);

-- ─── Enhance notifications ────────────────────────────────────────────────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES users(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category   VARCHAR(50)  NOT NULL DEFAULT 'general';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url VARCHAR(500);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority   VARCHAR(20)  NOT NULL DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_notifications_user     ON notifications(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_read     ON notifications(read, created_at DESC);

-- ─── Audit Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id             BIGSERIAL    PRIMARY KEY,
  entity         VARCHAR(50)  NOT NULL,
  entity_id      VARCHAR(100),
  action         VARCHAR(50)  NOT NULL,
  previous_value JSONB,
  new_value      JSONB,
  user_id        UUID REFERENCES users(id),
  username       VARCHAR(100),
  ip_address     VARCHAR(45),
  user_agent     TEXT,
  timestamp      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity    ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_logs(action);

-- ─── Password History ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id, created_at DESC);

-- ─── Refresh Tokens ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ,
  ip_address  VARCHAR(45),
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user       ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash       ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- ─── Password Reset Tokens ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_user   ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_prt_hash   ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_expiry ON password_reset_tokens(expires_at);

-- ─── Link estimations to projects ────────────────────────────────────────────
ALTER TABLE estimations ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
ALTER TABLE estimations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_estimations_project ON estimations(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimations_creator ON estimations(created_by) WHERE created_by IS NOT NULL;

-- ─── Triggers ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_reg_requests_updated_at BEFORE UPDATE ON registration_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

export async function runEnterpriseMigration(client: PoolClient): Promise<void> {
  console.log('🔧  Running enterprise migration...');
  await client.query(enterpriseMigration);
  console.log('✅  Enterprise migration complete.');
}
