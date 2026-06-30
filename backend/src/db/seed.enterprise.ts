import { PoolClient } from 'pg';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

// ─── Permissions ──────────────────────────────────────────────────────────────
const PERMISSIONS = [
  // Estimation
  { name: 'estimation.create',     module: 'estimation',   desc: 'Create estimations' },
  { name: 'estimation.read',       module: 'estimation',   desc: 'Read estimations' },
  { name: 'estimation.update',     module: 'estimation',   desc: 'Update estimations' },
  { name: 'estimation.delete',     module: 'estimation',   desc: 'Delete estimations' },
  { name: 'estimation.import',     module: 'estimation',   desc: 'Bulk import estimations' },
  // Users
  { name: 'user.create',           module: 'user',         desc: 'Create users' },
  { name: 'user.read',             module: 'user',         desc: 'Read user list' },
  { name: 'user.update',           module: 'user',         desc: 'Update users' },
  { name: 'user.delete',           module: 'user',         desc: 'Delete users' },
  { name: 'user.activate',         module: 'user',         desc: 'Activate/deactivate users' },
  // Projects
  { name: 'project.create',        module: 'project',      desc: 'Create projects' },
  { name: 'project.read',          module: 'project',      desc: 'Read projects' },
  { name: 'project.update',        module: 'project',      desc: 'Update projects' },
  { name: 'project.delete',        module: 'project',      desc: 'Delete projects' },
  { name: 'project.assign',        module: 'project',      desc: 'Assign users to projects' },
  // Master data
  { name: 'master.read',           module: 'master',       desc: 'Read master data' },
  { name: 'master.write',          module: 'master',       desc: 'Create/update/delete master data' },
  // Roles & Permissions
  { name: 'role.read',             module: 'role',         desc: 'Read roles' },
  { name: 'role.manage',           module: 'role',         desc: 'Create/update/delete roles' },
  { name: 'permission.read',       module: 'permission',   desc: 'Read permissions' },
  { name: 'permission.manage',     module: 'permission',   desc: 'Assign permissions to roles' },
  // Registration
  { name: 'registration.approve',  module: 'registration', desc: 'Approve/reject registrations' },
  // Monitoring
  { name: 'monitoring.read',       module: 'monitoring',   desc: 'Access monitoring and logs' },
  // Audit
  { name: 'audit.read',            module: 'audit',        desc: 'Read audit logs' },
];

// ─── Roles ────────────────────────────────────────────────────────────────────
const ROLES = [
  { name: 'Global Super Admin', desc: 'Full platform access across all projects', system: true },
  { name: 'Scoped Super Admin', desc: 'Full access within assigned projects',      system: true },
  { name: 'Admin',              desc: 'Manage users and projects within scope',    system: true },
  { name: 'User',               desc: 'Access estimations in assigned projects',   system: true },
];

// ─── Role → Permission mapping ────────────────────────────────────────────────
const ROLE_PERMISSIONS: Record<string, string[]> = {
  'Global Super Admin': PERMISSIONS.map(p => p.name),
  'Scoped Super Admin': PERMISSIONS.filter(p =>
    !['role.manage', 'permission.manage'].includes(p.name)
  ).map(p => p.name),
  'Admin': [
    'estimation.create', 'estimation.read', 'estimation.update', 'estimation.delete', 'estimation.import',
    'user.create', 'user.read', 'user.update', 'user.activate',
    'project.read', 'project.assign',
    'master.read',
    'role.read',
    'permission.read',
    'registration.approve',
  ],
  'User': [
    'estimation.create', 'estimation.read', 'estimation.update',
    'project.read',
    'master.read',
  ],
};

// ─── Projects ─────────────────────────────────────────────────────────────────
const PROJECTS = [
  { name: 'Alpha Platform',      code: 'AP',  desc: 'Core platform development and infrastructure' },
  { name: 'Beta Infrastructure', code: 'BI',  desc: 'Backend infrastructure and DevOps' },
  { name: 'Gamma Services',      code: 'GS',  desc: 'Microservices and API layer' },
  { name: 'Delta Operations',    code: 'DO',  desc: 'Operations and support tooling' },
  { name: 'Epsilon Analytics',   code: 'EA',  desc: 'Data analytics and reporting platform' },
];

// ─── Users ────────────────────────────────────────────────────────────────────
const USERS = [
  { firstName: 'Ashu',     lastName: 'Joshi',    username: 'ashu.joshi',   email: 'ashu.joshi@mail.com',     password: 'Ashu@123',     role: 'Global Super Admin' },
  { firstName: 'Jacob',    lastName: 'Thomas',   username: 'jacob.thomas', email: 'jacob.thomas@mail.com',   password: 'Jacob@123',    role: 'Scoped Super Admin' },
  { firstName: 'Ankur',    lastName: 'Jain',     username: 'ankur.jain',   email: 'ankur.jain@mail.com',     password: 'Ankur@123',    role: 'Admin' },
  { firstName: 'Raghu',    lastName: 'Kolli',    username: 'raghu.kolli',  email: 'raghu.kolli@mail.com',    password: 'Raghu@123',    role: 'Admin' },
  { firstName: 'Yash',     lastName: 'HB',       username: 'yash.hb',      email: 'yash.hb@mail.com',        password: 'Yash@123',     role: 'User' },
  { firstName: 'Srikanth', lastName: 'N',        username: 'srikanth.n',   email: 'srikanth.n@mail.com',     password: 'Srikanth@123', role: 'User' },
];

// ─── Project-User assignments ─────────────────────────────────────────────────
// Global Super Admin gets all projects (handled in code)
const PROJECT_ASSIGNMENTS: Record<string, string[]> = {
  'jacob.thomas': ['Alpha Platform', 'Beta Infrastructure'],
  'ankur.jain':   ['Alpha Platform', 'Beta Infrastructure', 'Gamma Services'],
  'raghu.kolli':  ['Delta Operations'],
  'yash.hb':      ['Alpha Platform', 'Beta Infrastructure', 'Gamma Services'],
  'srikanth.n':   ['Delta Operations'],
};

export async function seedEnterpriseData(client: PoolClient): Promise<void> {
  console.log('🌱  Seeding enterprise data...');

  // ── Permissions ──
  for (const p of PERMISSIONS) {
    await client.query(
      `INSERT INTO permissions (name, description, module)
       VALUES ($1,$2,$3) ON CONFLICT (name) DO NOTHING`,
      [p.name, p.desc, p.module]
    );
  }

  // ── Roles ──
  for (const r of ROLES) {
    await client.query(
      `INSERT INTO roles (name, description, is_system)
       VALUES ($1,$2,$3) ON CONFLICT (name) DO NOTHING`,
      [r.name, r.desc, r.system]
    );
  }

  // ── Role-Permission mapping ──
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const roleRow = await client.query(`SELECT id FROM roles WHERE name = $1`, [roleName]);
    if (!roleRow.rows[0]) continue;
    const roleId = roleRow.rows[0].id;

    for (const permName of perms) {
      const permRow = await client.query(`SELECT id FROM permissions WHERE name = $1`, [permName]);
      if (!permRow.rows[0]) continue;
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [roleId, permRow.rows[0].id]
      );
    }
  }

  // ── Projects ──
  for (const p of PROJECTS) {
    await client.query(
      `INSERT INTO projects (name, code, description)
       VALUES ($1,$2,$3) ON CONFLICT (name) DO NOTHING`,
      [p.name, p.code, p.desc]
    );
  }

  // ── Users ──
  for (const u of USERS) {
    const existing = await client.query(`SELECT id FROM users WHERE email = $1`, [u.email]);
    if (existing.rows[0]) continue;

    const hash = await bcrypt.hash(u.password, SALT_ROUNDS);
    const userResult = await client.query(
      `INSERT INTO users (first_name, last_name, username, email, password_hash, status, is_active)
       VALUES ($1,$2,$3,$4,$5,'active',true) RETURNING id`,
      [u.firstName, u.lastName, u.username, u.email, hash]
    );
    const userId: string = userResult.rows[0].id;

    // Assign role
    const roleRow = await client.query(`SELECT id FROM roles WHERE name = $1`, [u.role]);
    if (roleRow.rows[0]) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [userId, roleRow.rows[0].id]
      );
    }

    // Store initial password in history
    await client.query(
      `INSERT INTO password_history (user_id, password_hash) VALUES ($1,$2)`,
      [userId, hash]
    );
  }

  // ── Project assignments ──
  for (const [username, projectNames] of Object.entries(PROJECT_ASSIGNMENTS)) {
    const userRow = await client.query(`SELECT id FROM users WHERE username = $1`, [username]);
    if (!userRow.rows[0]) continue;
    const userId: string = userRow.rows[0].id;

    for (const projectName of projectNames) {
      const projRow = await client.query(`SELECT id FROM projects WHERE name = $1`, [projectName]);
      if (!projRow.rows[0]) continue;
      await client.query(
        `INSERT INTO project_users (project_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [projRow.rows[0].id, userId]
      );
    }
  }

  // Global Super Admin → all projects
  const gsaRow = await client.query(`SELECT id FROM users WHERE username = 'ashu.joshi'`);
  if (gsaRow.rows[0]) {
    const allProjects = await client.query(`SELECT id FROM projects`);
    for (const p of allProjects.rows) {
      await client.query(
        `INSERT INTO project_users (project_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [p.id, gsaRow.rows[0].id]
      );
    }
  }

  // ── App settings for password policy ──
  const policySettings = [
    ['password.min_length',           '8'],
    ['password.require_uppercase',    'true'],
    ['password.require_lowercase',    'true'],
    ['password.require_number',       'true'],
    ['password.require_special',      'true'],
    ['password.history_count',        '5'],
    ['password.max_failed_attempts',  '5'],
    ['password.lockout_minutes',      '30'],
  ];
  for (const [key, value] of policySettings) {
    await client.query(
      `INSERT INTO app_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }

  console.log('✅  Enterprise seed complete.');
}
