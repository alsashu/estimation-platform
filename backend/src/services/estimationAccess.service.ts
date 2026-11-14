/**
 * Estimation module access (SP / PE), independent of roles.
 *
 * Effective access = role permissions ∩ module access (+ Department / Program scope, applied elsewhere).
 * A permission that belongs to a module the user has not been granted is simply not effective, so every
 * existing `authorize('estimation.read')` / `authorize('parametric.read')` check also enforces module access.
 *
 * Module access is resolved LIVE on every request (short cache, invalidated on change) so revoking or
 * granting a module takes effect immediately, without waiting for the access token to expire.
 */
import { query } from '../config/database';

export const MODULE_CODES = ['SP', 'PE'] as const;
export type ModuleCode = (typeof MODULE_CODES)[number];

export const MODULE_LABELS: Record<ModuleCode, string> = {
  SP: 'Story Point Estimation',
  PE: 'Parametric Estimation',
};

/** Which module a permission belongs to; null = not module-bound (users, departments, monitoring…). */
export function permissionModule(permission: string): ModuleCode | null {
  if (permission.startsWith('estimation.') || permission.startsWith('master.')) return 'SP';
  if (permission.startsWith('parametric.')) return 'PE';
  return null;
}

export function filterPermissionsByModules(permissions: string[], modules: readonly string[]): string[] {
  return permissions.filter(p => {
    const m = permissionModule(p);
    return m === null || modules.includes(m);
  });
}

export const isGlobalSuperAdminRoles = (roles: string[] = []) => roles.includes('Global Super Admin');

export function normalizeModules(modules: readonly string[]): ModuleCode[] {
  return MODULE_CODES.filter(m => modules.includes(m));
}

export const sameModules = (a: readonly string[] = [], b: readonly string[] = []) =>
  normalizeModules(a).join(',') === normalizeModules(b).join(',');

// ─── Live lookup with a short cache ──────────────────────────────────────────
const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { modules: ModuleCode[]; at: number }>();

export function invalidateUserModules(userId?: string): void {
  if (userId) cache.delete(userId); else cache.clear();
}

export async function getUserModules(userId: string): Promise<ModuleCode[]> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.modules;
  const rows = await query<{ module_code: string }>(
    `SELECT module_code FROM user_estimation_access WHERE user_id = $1 AND is_active`, [userId]);
  const modules = normalizeModules(rows.map(r => r.module_code));
  cache.set(userId, { modules, at: Date.now() });
  return modules;
}

/** Global Super Admin always has every module; everyone else gets what is assigned. */
export async function getEffectiveModules(userId: string, roles: string[]): Promise<ModuleCode[]> {
  if (isGlobalSuperAdminRoles(roles)) return [...MODULE_CODES];
  return getUserModules(userId);
}

// ─── Grant rules ─────────────────────────────────────────────────────────────
export interface GrantDecision {
  ok: boolean;
  status?: 400 | 403;
  error?: string;
  /** Final module set for the target (requested ∪ modules the actor cannot manage that the target keeps). */
  modules?: ModuleCode[];
}

/**
 * An actor can only grant or revoke modules they hold themselves (GSA: all).
 * Modules the target already has but the actor cannot manage are preserved untouched.
 * The resulting set must contain at least one module.
 */
export function decideModuleGrant(
  actorModules: readonly ModuleCode[],
  requested: readonly string[],
  targetCurrent: readonly ModuleCode[] = []
): GrantDecision {
  const req = normalizeModules(requested);
  if (req.length !== new Set(requested).size) {
    return { ok: false, status: 400, error: 'Unknown estimation module' };
  }
  const beyond = req.filter(m => !actorModules.includes(m));
  if (beyond.length) {
    return { ok: false, status: 403, error: `You cannot grant ${beyond.map(m => MODULE_LABELS[m]).join(' / ')} access — it is outside your own module access` };
  }
  const kept = targetCurrent.filter(m => !actorModules.includes(m));
  const modules = normalizeModules([...req, ...kept]);
  if (modules.length === 0) {
    return { ok: false, status: 400, error: 'Select at least one estimation module' };
  }
  return { ok: true, modules };
}

/**
 * Makes `modules` the user's active set: upserts/reactivates the requested rows, deactivates the rest.
 * Returns what changed (for the audit log).
 */
export async function setUserModules(
  userId: string,
  modules: readonly ModuleCode[],
  actorId: string | null,
  source: 'admin' | 'registration' = 'admin'
): Promise<{ before: ModuleCode[]; after: ModuleCode[]; added: ModuleCode[]; removed: ModuleCode[] }> {
  const beforeRows = await query<{ module_code: string }>(
    `SELECT module_code FROM user_estimation_access WHERE user_id = $1 AND is_active`, [userId]);
  const before = normalizeModules(beforeRows.map(r => r.module_code));
  const after = normalizeModules(modules);

  for (const m of after) {
    await query(
      `INSERT INTO user_estimation_access (user_id, module_code, is_active, grant_source, created_by, updated_by)
       VALUES ($1, $2, true, $3, $4, $4)
       ON CONFLICT (user_id, module_code) DO UPDATE
         SET is_active = true,
             updated_by = CASE WHEN user_estimation_access.is_active THEN user_estimation_access.updated_by ELSE EXCLUDED.updated_by END,
             updated_at = CASE WHEN user_estimation_access.is_active THEN user_estimation_access.updated_at ELSE NOW() END`,
      [userId, m, source, actorId]);
  }
  await query(
    `UPDATE user_estimation_access SET is_active = false, updated_by = $3, updated_at = NOW()
      WHERE user_id = $1 AND is_active AND NOT (module_code = ANY($2::text[]))`,
    [userId, after, actorId]);

  invalidateUserModules(userId);
  return {
    before, after,
    added: after.filter(m => !before.includes(m)),
    removed: before.filter(m => !after.includes(m)),
  };
}

/** SQL fragment: a user's active module codes (alias `u` must be the users table). */
export const USER_MODULES_SQL = `
  COALESCE((SELECT array_agg(uea.module_code ORDER BY uea.module_code DESC)
              FROM user_estimation_access uea WHERE uea.user_id = u.id AND uea.is_active), '{}') AS estimation_modules`;
