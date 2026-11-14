import { Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { auditLog } from '../services/audit.service';
import { canAccessDepartment, isGlobalUser } from '../services/hierarchy.service';

interface DepartmentRow {
  id: string; name: string; code: string; description: string | null;
  status: 'active' | 'inactive'; is_system: boolean;
}

const statusEnum = z.enum(['active', 'inactive']);

// ─── List ─────────────────────────────────────────────────────────────────────
export async function listDepartments(req: Request, res: Response): Promise<void> {
  const { search, status } = req.query;
  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  let i = 1;

  if (!isGlobalUser(req.user)) {
    const ids = Array.isArray(req.user?.departmentIds) ? req.user!.departmentIds : [];
    if (ids.length === 0) { res.json({ success: true, data: [], total: 0 }); return; }
    where += ` AND d.id = ANY($${i++}::uuid[])`;
    params.push(ids);
  }
  if (search) { where += ` AND (d.name ILIKE $${i} OR d.code ILIKE $${i++})`; params.push(`%${search}%`); }
  if (status) { where += ` AND d.status = $${i++}`; params.push(statusEnum.parse(status)); }

  const data = await query(
    `SELECT d.id, d.name, d.code, d.description, d.status, d.is_system, d.created_at, d.updated_at,
            d.created_by, NULLIF(TRIM(COALESCE(cu.first_name,'') || ' ' || COALESCE(cu.last_name,'')), '') AS created_by_name,
            (SELECT COUNT(*)::int FROM projects p WHERE p.department_id = d.id AND p.deleted_at IS NULL) AS program_count,
            (SELECT COUNT(*)::int FROM user_departments ud WHERE ud.department_id = d.id) AS user_count
       FROM departments d
       LEFT JOIN users cu ON cu.id = d.created_by
       ${where}
      ORDER BY d.is_system, d.name`,
    params
  );
  res.json({ success: true, data, total: data.length });
}

// ─── Get (with programs) ─────────────────────────────────────────────────────
export async function getDepartment(req: Request, res: Response): Promise<void> {
  if (!canAccessDepartment(req.user, req.params.id)) {
    res.status(403).json({ success: false, error: 'No access to this department' }); return;
  }
  const dept = await queryOne<DepartmentRow>(`SELECT * FROM departments WHERE id = $1`, [req.params.id]);
  if (!dept) { res.status(404).json({ success: false, error: 'Department not found' }); return; }

  const programParams: unknown[] = [req.params.id];
  let programScope = '';
  if (!isGlobalUser(req.user)) {
    programScope = ` AND p.id = ANY($2::uuid[])`;
    programParams.push(req.user!.projectIds as string[]);
  }
  const programs = await query(
    `SELECT p.id, p.name, p.code, p.status,
            (SELECT COUNT(*)::int FROM baselines b WHERE b.project_id = p.id) AS baseline_count
       FROM projects p
      WHERE p.department_id = $1 AND p.deleted_at IS NULL${programScope}
      ORDER BY p.name`,
    programParams
  );
  res.json({ success: true, data: { ...dept, programs } });
}

// ─── Create ───────────────────────────────────────────────────────────────────
const createSchema = z.object({
  name:        z.string().trim().min(1).max(255),
  code:        z.string().trim().min(2).max(50).regex(/^[A-Za-z0-9_-]+$/, 'Code may contain letters, numbers, - and _ only'),
  description: z.string().max(2000).optional(),
  status:      statusEnum.optional(),
});

async function findDuplicate(name: string, code: string, excludeId?: string) {
  return queryOne<{ id: string }>(
    `SELECT id FROM departments
      WHERE (LOWER(name) = LOWER($1) OR UPPER(code) = UPPER($2)) AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [name, code, excludeId ?? null]
  );
}

export async function createDepartment(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const body = createSchema.parse(req.body);

  if (await findDuplicate(body.name, body.code)) {
    res.status(409).json({ success: false, error: 'Department name or code already exists' }); return;
  }

  const [dept] = await query<DepartmentRow>(
    `INSERT INTO departments (name, code, description, status, created_by)
     VALUES ($1, UPPER($2), $3, $4, $5) RETURNING *`,
    [body.name, body.code, body.description ?? null, body.status ?? 'active', req.user.userId]
  );

  // A non-global creator gets department-level access so they can manage what they created.
  if (!isGlobalUser(req.user)) {
    await query(
      `INSERT INTO user_departments (user_id, department_id, access_scope, assigned_by)
       VALUES ($1, $2, 'all', $1) ON CONFLICT DO NOTHING`,
      [req.user.userId, dept.id]
    );
  }

  await auditLog({ entity: 'department', entityId: dept.id, action: 'created', newValue: body, user: req.user, req });
  res.status(201).json({ success: true, data: dept });
}

// ─── Update ───────────────────────────────────────────────────────────────────
const updateSchema = createSchema.partial();

export async function updateDepartment(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const body = updateSchema.parse(req.body);

  if (!canAccessDepartment(req.user, req.params.id)) {
    res.status(403).json({ success: false, error: 'No access to this department' }); return;
  }
  const existing = await queryOne<DepartmentRow>(`SELECT * FROM departments WHERE id = $1`, [req.params.id]);
  if (!existing) { res.status(404).json({ success: false, error: 'Department not found' }); return; }

  if (existing.is_system && body.code && body.code.toUpperCase() !== existing.code.toUpperCase()) {
    res.status(400).json({ success: false, error: 'The code of a system department cannot be changed' }); return;
  }
  if ((body.name || body.code) && await findDuplicate(body.name ?? existing.name, body.code ?? existing.code, existing.id)) {
    res.status(409).json({ success: false, error: 'Department name or code already exists' }); return;
  }

  const [updated] = await query<DepartmentRow>(
    `UPDATE departments SET
       name = COALESCE($1, name), code = COALESCE(UPPER($2), code),
       description = COALESCE($3, description), status = COALESCE($4, status), updated_by = $5
     WHERE id = $6 RETURNING *`,
    [body.name ?? null, body.code ?? null, body.description ?? null, body.status ?? null, req.user.userId, req.params.id]
  );

  await auditLog({ entity: 'department', entityId: req.params.id, action: 'updated', previousValue: existing, newValue: body, user: req.user, req });
  res.json({ success: true, data: updated });
}

// ─── Activate / Deactivate ───────────────────────────────────────────────────
export async function setDepartmentStatus(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const { status } = z.object({ status: statusEnum }).parse(req.body);

  if (!canAccessDepartment(req.user, req.params.id)) {
    res.status(403).json({ success: false, error: 'No access to this department' }); return;
  }
  const existing = await queryOne<DepartmentRow>(`SELECT * FROM departments WHERE id = $1`, [req.params.id]);
  if (!existing) { res.status(404).json({ success: false, error: 'Department not found' }); return; }

  const [updated] = await query<DepartmentRow>(
    `UPDATE departments SET status = $1, updated_by = $2 WHERE id = $3 RETURNING *`,
    [status, req.user.userId, req.params.id]
  );
  await auditLog({ entity: 'department', entityId: req.params.id, action: status === 'active' ? 'activated' : 'deactivated', user: req.user, req });
  res.json({ success: true, data: updated });
}

// ─── Users of a department ───────────────────────────────────────────────────
export async function listDepartmentUsers(req: Request, res: Response): Promise<void> {
  if (!canAccessDepartment(req.user, req.params.id)) {
    res.status(403).json({ success: false, error: 'No access to this department' }); return;
  }
  const data = await query(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.email, ud.access_scope, ud.assigned_at,
            COALESCE(json_agg(jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code))
                     FILTER (WHERE p.id IS NOT NULL), '[]') AS programs
       FROM user_departments ud
       JOIN users u ON u.id = ud.user_id AND u.deleted_at IS NULL
       LEFT JOIN project_users pu ON pu.user_id = u.id
       LEFT JOIN projects p ON p.id = pu.project_id AND p.department_id = ud.department_id AND p.deleted_at IS NULL
      WHERE ud.department_id = $1
      GROUP BY u.id, ud.access_scope, ud.assigned_at
      ORDER BY u.first_name, u.last_name`,
    [req.params.id]
  );
  res.json({ success: true, data });
}

const assignSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
  access_scope: z.enum(['assigned', 'all']).default('assigned'),
});

export async function assignDepartmentUsers(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const body = assignSchema.parse(req.body);

  if (!canAccessDepartment(req.user, req.params.id)) {
    res.status(403).json({ success: false, error: 'No access to this department' }); return;
  }
  const dept = await queryOne(`SELECT id FROM departments WHERE id = $1`, [req.params.id]);
  if (!dept) { res.status(404).json({ success: false, error: 'Department not found' }); return; }

  for (const userId of body.userIds) {
    await query(
      `INSERT INTO user_departments (user_id, department_id, access_scope, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, department_id) DO UPDATE SET access_scope = EXCLUDED.access_scope`,
      [userId, req.params.id, body.access_scope, req.user.userId]
    );
  }
  await auditLog({ entity: 'department', entityId: req.params.id, action: 'users_assigned', newValue: body, user: req.user, req });
  res.json({ success: true, message: `${body.userIds.length} user(s) assigned` });
}

/** Removing a user from a department also removes their program assignments inside it. */
export async function removeDepartmentUser(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  if (!canAccessDepartment(req.user, req.params.id)) {
    res.status(403).json({ success: false, error: 'No access to this department' }); return;
  }
  await query(
    `DELETE FROM project_users WHERE user_id = $1 AND project_id IN (SELECT id FROM projects WHERE department_id = $2)`,
    [req.params.userId, req.params.id]
  );
  await query(`DELETE FROM user_departments WHERE user_id = $1 AND department_id = $2`, [req.params.userId, req.params.id]);
  await auditLog({ entity: 'department', entityId: req.params.id, action: 'user_removed', newValue: { userId: req.params.userId }, user: req.user, req });
  res.json({ success: true, message: 'User removed from department' });
}
