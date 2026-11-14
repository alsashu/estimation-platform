import { PoolClient } from 'pg';

/**
 * Estimation module access (SP / PE) — kept separate from roles.
 *
 * A role says WHAT a user may do (create, approve, manage users…); module access says in WHICH
 * estimation module(s) they may do it. "Admin + SP" and "Admin + PE" are the same Admin role with
 * different rows here, so new modules never require new role combinations.
 *
 * One row per (user, module). Rows are deactivated (is_active = false) rather than deleted so the
 * history stays inspectable; every change is also written to audit_logs.
 */
export const estimationAccessMigration = `
CREATE TABLE IF NOT EXISTS estimation_modules (
  code        VARCHAR(10)  PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0
);
INSERT INTO estimation_modules (code, name, sort_order) VALUES
  ('SP', 'Story Point Estimation', 1),
  ('PE', 'Parametric Estimation', 2)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_estimation_access (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_code  VARCHAR(10)  NOT NULL REFERENCES estimation_modules(code),
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  grant_source VARCHAR(20)  NOT NULL DEFAULT 'admin' CHECK (grant_source IN ('admin', 'migration', 'registration', 'seed')),
  created_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_estimation_access UNIQUE (user_id, module_code)
);
CREATE INDEX IF NOT EXISTS idx_uea_user_active ON user_estimation_access(user_id) WHERE is_active;
`;

export async function runEstimationAccessMigration(client: PoolClient): Promise<void> {
  await client.query(estimationAccessMigration);
}

export const BACKFILL_MARKER = 'estimation_access.backfill_v1';

/**
 * One-time, explicit backfill for accounts that existed before module access was introduced.
 *
 * Policy (preserve current access, grant nothing new):
 *   • SP is granted when the user's roles currently confer any SP permission (estimation.* / master.*).
 *   • PE is granted when the user's roles currently confer any PE permission (parametric.*).
 *   • Users with neither get no row (they could not use either module before either).
 * Rows are marked grant_source = 'migration' and each affected user gets an audit_logs entry
 * ('estimation_access_migrated') recording the modules and the rule. Runs once, guarded by an
 * app_settings marker, so users created later must be given modules explicitly.
 */
export async function backfillEstimationAccess(client: PoolClient): Promise<number> {
  const done = await client.query(`SELECT 1 FROM app_settings WHERE key = $1`, [BACKFILL_MARKER]);
  if (done.rows.length) return 0;

  const { rows } = await client.query<{ user_id: string; username: string; modules: string[] }>(`
    WITH perms AS (
      SELECT u.id AS user_id, u.username,
             bool_or(p.name LIKE 'estimation.%' OR p.name LIKE 'master.%') AS sp,
             bool_or(p.name LIKE 'parametric.%') AS pe
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN role_permissions rp ON rp.role_id = ur.role_id
        JOIN permissions p ON p.id = rp.permission_id
       WHERE u.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM user_estimation_access x WHERE x.user_id = u.id)
       GROUP BY u.id, u.username
    )
    SELECT user_id, username,
           array_remove(ARRAY[CASE WHEN sp THEN 'SP' END, CASE WHEN pe THEN 'PE' END], NULL) AS modules
      FROM perms WHERE sp OR pe`);

  for (const r of rows) {
    for (const m of r.modules) {
      await client.query(
        `INSERT INTO user_estimation_access (user_id, module_code, grant_source) VALUES ($1, $2, 'migration')
         ON CONFLICT (user_id, module_code) DO NOTHING`, [r.user_id, m]);
    }
    await client.query(
      `INSERT INTO audit_logs (entity, entity_id, action, new_value, username)
       VALUES ('user', $1, 'estimation_access_migrated', $2, 'system')`,
      [r.user_id, JSON.stringify({ modules: r.modules, policy: 'granted modules the user\'s roles already permitted (estimation.*/master.* → SP, parametric.* → PE)' })]);
  }

  await client.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
    [BACKFILL_MARKER, JSON.stringify({ at: new Date().toISOString(), users: rows.length })]);
  if (rows.length) console.log(`🔐 Estimation module access backfilled for ${rows.length} existing user(s).`);
  return rows.length;
}
