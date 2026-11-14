/**
 * Department + Program access assignment for users (used by user create/update).
 *
 * Invariant maintained here: a user's program assignments always sit inside departments they are a
 * member of ("Program access must respect its parent Department relationship").
 */
import { query } from '../config/database';
import type { JwtPayload } from '../auth/jwt';
import { canAccessDepartment, isGlobalUser } from './hierarchy.service';

export interface DepartmentGrant {
  id: string;
  access_scope: 'assigned' | 'all';
}

/** Returns an error message when a non-global actor tries to grant access outside their own scope. */
export function checkGrantScope(
  actor: JwtPayload,
  departments: DepartmentGrant[] | undefined,
  projectIds: string[] | undefined
): string | null {
  if (isGlobalUser(actor)) return null;
  if (departments?.some(d => !canAccessDepartment(actor, d.id))) {
    return 'Cannot assign departments outside your access';
  }
  if (projectIds?.length) {
    const allowed = actor.projectIds as string[];
    if (projectIds.some(pid => !allowed.includes(pid))) return 'Cannot assign programs outside your access';
  }
  return null;
}

/**
 * Applies department and/or program assignments for `userId`.
 *  • departments given → replaces memberships; programs outside the new departments are unassigned.
 *  • projectIds given  → replaces program assignments.
 *  • only projectIds   → the departments of those programs are added automatically.
 */
export async function syncUserAccess(
  userId: string,
  departments: DepartmentGrant[] | undefined,
  projectIds: string[] | undefined,
  actorId: string
): Promise<void> {
  if (departments !== undefined) {
    await query(`DELETE FROM user_departments WHERE user_id = $1`, [userId]);
    for (const d of departments) {
      await query(
        `INSERT INTO user_departments (user_id, department_id, access_scope, assigned_by)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, department_id) DO UPDATE SET access_scope = EXCLUDED.access_scope`,
        [userId, d.id, d.access_scope, actorId]
      );
    }
  }

  if (projectIds !== undefined) {
    await query(`DELETE FROM project_users WHERE user_id = $1`, [userId]);
    for (const projectId of projectIds) {
      await query(
        `INSERT INTO project_users (project_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [projectId, userId, actorId]
      );
    }
  }

  if (departments !== undefined) {
    // Department removal wins: drop program assignments that no longer have a parent membership
    await query(
      `DELETE FROM project_users pu USING projects p
        WHERE pu.project_id = p.id AND pu.user_id = $1
          AND NOT EXISTS (SELECT 1 FROM user_departments ud WHERE ud.user_id = $1 AND ud.department_id = p.department_id)`,
      [userId]
    );
  } else if (projectIds !== undefined) {
    await query(
      `INSERT INTO user_departments (user_id, department_id, assigned_by)
       SELECT DISTINCT $1::uuid, p.department_id, $2::uuid FROM project_users pu JOIN projects p ON p.id = pu.project_id
        WHERE pu.user_id = $1
       ON CONFLICT DO NOTHING`,
      [userId, actorId]
    );
  }
}

/** SQL fragment: JSON array of a user's departments (alias `u` must be the users table). */
export const USER_DEPARTMENTS_JSON = `
  COALESCE((SELECT json_agg(json_build_object('id', d.id, 'name', d.name, 'code', d.code, 'access_scope', ud.access_scope) ORDER BY d.name)
              FROM user_departments ud JOIN departments d ON d.id = ud.department_id
             WHERE ud.user_id = u.id), '[]') AS departments`;
