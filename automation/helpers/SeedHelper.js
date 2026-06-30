'use strict';
/**
 * Seed the test accounts required by the automation suite.
 * Idempotent — users that already exist are skipped.
 *
 * Accounts created:
 *   gsa        → Global Super Admin
 *   ssa        → Scoped Super Admin
 *   admin      → Admin
 *   user       → User (active)
 *   inactive   → User (deactivated)
 */
const { login, getUsers, getRoles, createUser, setUserActive } = require('../utils/ApiUtil');
const { logger } = require('../utils/LoggerUtil');
const config = require('../config/config');

async function seedTestUsers() {
  logger.info('[seed] Starting test account seeding...');

  // 1. Authenticate as the super admin that already exists in the DB
  const sa = config.credentials.superAdmin;
  let saToken;
  try {
    const result = await login(sa.email, sa.password);
    saToken = result.accessToken;
    logger.info(`[seed] Authenticated as ${sa.email}`);
  } catch (err) {
    throw new Error(
      `[seed] Cannot login as superAdmin (${sa.email}): ${err.message}. ` +
      'Ensure the backend is running and SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD are correct.'
    );
  }

  // 2. Build role name → id map
  const roles = await getRoles(saToken);
  const roleMap = {};
  for (const r of roles) roleMap[r.name] = r.id;

  const ROLES = {
    gsa:   roleMap['Global Super Admin'],
    ssa:   roleMap['Scoped Super Admin'],
    admin: roleMap['Admin'],
    user:  roleMap['User'],
  };

  for (const [key, id] of Object.entries(ROLES)) {
    if (!id) logger.warn(`[seed] Role "${key}" not found in DB — user will be created with no role`);
  }

  // 3. Define the accounts to seed
  const accounts = [
    {
      key: 'gsa',
      firstName: 'GSA',      lastName: 'Tester',
      username:  'gsa_tester',
      email:     config.credentials.gsa.email,
      password:  config.credentials.gsa.password,
      roleIds:   ROLES.gsa   ? [ROLES.gsa]   : [],
      active:    true,
    },
    {
      key: 'ssa',
      firstName: 'SSA',      lastName: 'Tester',
      username:  'ssa_tester',
      email:     config.credentials.ssa.email,
      password:  config.credentials.ssa.password,
      roleIds:   ROLES.ssa   ? [ROLES.ssa]   : [],
      active:    true,
    },
    {
      key: 'admin',
      firstName: 'Admin',    lastName: 'Tester',
      username:  'admin_tester',
      email:     config.credentials.admin.email,
      password:  config.credentials.admin.password,
      roleIds:   ROLES.admin ? [ROLES.admin] : [],
      active:    true,
    },
    {
      key: 'user',
      firstName: 'Normal',   lastName: 'Tester',
      username:  'user_tester',
      email:     config.credentials.user.email,
      password:  config.credentials.user.password,
      roleIds:   ROLES.user  ? [ROLES.user]  : [],
      active:    true,
    },
    {
      key: 'inactive',
      firstName: 'Inactive', lastName: 'Tester',
      username:  'inactive_tester',
      email:     config.credentials.inactive.email,
      password:  config.credentials.inactive.password,
      roleIds:   ROLES.user  ? [ROLES.user]  : [],
      active:    false,
    },
  ];

  // 4. Create missing accounts
  let created = 0;
  let skipped = 0;

  for (const account of accounts) {
    try {
      // Check if the email already exists
      const existing = await getUsers(saToken, { search: account.email, limit: 5 });
      const found = existing.some(u => u.email === account.email);

      if (found) {
        logger.info(`[seed] skip     ${account.email} (already exists)`);
        skipped++;
        continue;
      }

      // Create the user
      const newUser = await createUser(saToken, {
        firstName:  account.firstName,
        lastName:   account.lastName,
        username:   account.username,
        email:      account.email,
        password:   account.password,
        roleIds:    account.roleIds,
      });

      // Deactivate the inactive account
      if (!account.active) {
        await setUserActive(saToken, newUser.id, false);
        logger.info(`[seed] created  ${account.email} (${account.key}, inactive)`);
      } else {
        logger.info(`[seed] created  ${account.email} (${account.key})`);
      }

      created++;
    } catch (err) {
      // 409 = duplicate (race condition or pre-existing) — treat as skip
      if (err.response && err.response.status === 409) {
        logger.info(`[seed] skip     ${account.email} (conflict — already exists)`);
        skipped++;
      } else {
        logger.warn(`[seed] failed   ${account.email}: ${err.message}`);
      }
    }
  }

  logger.info(`[seed] Done — ${created} created, ${skipped} skipped.`);
}

module.exports = { seedTestUsers };
