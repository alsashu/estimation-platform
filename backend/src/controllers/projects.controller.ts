/**
 * Programs (formerly "Projects").
 *
 * Served at both /api/programs (preferred) and /api/projects (backward compatible). The physical table
 * is still `projects`; every Program must belong to exactly one Department.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { auditLog } from '../services/audit.service';
import { canAccessDepartment } from '../services/hierarchy.service';

const statusEnum = z.enum(['active', 'inactive', 'archived']);

// ─── List Programs ────────────────────────────────────────────────────────────
export async function listProjects(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const { page = 1, limit = 50, search, status } = req.query;
  const departmentId = (req.query.departmentId ?? req.query.department_id) as string | undefined;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE p.deleted_at IS NULL';
  const params: unknown[] = [];
  let i = 1;

  // Non-GSA users only see their accessible programs
  if (req.user.projectIds !== '*') {
    const ids = req.user.projectIds as string[];
    if (ids.length === 0) {
      res.json({ success: true, data: [], total: 0, page: 1, limit: Number(limit) });
      return;
    }
    where += ` AND p.id = ANY($${i++}::uuid[])`;
    params.push(ids);
  }

  if (departmentId) { where += ` AND p.department_id = $${i++}`; params.push(z.string().uuid().parse(departmentId)); }
  if (search) { where += ` AND (p.name ILIKE $${i} OR p.code ILIKE $${i++})`; params.push(`%${search}%`); }
  if (status) { where += ` AND p.status = $${i++}`; params.push(status); }

  const data = await query(
    `SELECT p.id, p.name, p.code, p.description, p.status, p.created_at,
            p.department_id, d.name AS department_name, d.code AS department_code,
            p.parametric_average_config_id, p.parametric_expert_config_id,
            ac.name AS parametric_average_config_name,
            ec.name AS parametric_expert_config_name,
            (SELECT COUNT(*)::int FROM project_users pu WHERE pu.project_id = p.id) AS user_count,
            (SELECT COUNT(*)::int FROM estimations e WHERE e.project_id = p.id) AS estimation_count,
            (SELECT COUNT(*)::int FROM parametric_estimations pe WHERE pe.project_id = p.id) AS parametric_estimation_count,
            (SELECT COUNT(*)::int FROM baselines b WHERE b.project_id = p.id) AS baseline_count
     FROM projects p
     JOIN departments d ON d.id = p.department_id
     LEFT JOIN parametric_average_configs ac ON ac.id = p.parametric_average_config_id
     LEFT JOIN parametric_expert_configs ec ON ec.id = p.parametric_expert_config_id
     ${where}
     ORDER BY d.name, p.name
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, Number(limit), offset]
  );

  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM projects p ${where}`, params
  );
  const total = parseInt(countRows[0]?.count ?? '0');

  res.json({ success: true, data, total, page: Number(page), limit: Number(limit) });
}

// ─── Get Program ──────────────────────────────────────────────────────────────
export async function getProject(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  if (req.user.projectIds !== '*') {
    const ids = req.user.projectIds as string[];
    if (!ids.includes(req.params.id)) {
      res.status(403).json({ success: false, error: 'No access to this program' });
      return;
    }
  }

  const project = await queryOne(
    `SELECT p.*, d.name AS department_name, d.code AS department_code,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', u.id, 'name', u.first_name || ' ' || u.last_name, 'email', u.email, 'username', u.username))
              FILTER (WHERE u.id IS NOT NULL), '[]') AS users,
            COALESCE((SELECT json_agg(json_build_object('id', b.id, 'name', b.name, 'version', b.version, 'status', b.status, 'is_legacy', b.is_legacy) ORDER BY b.created_at DESC)
                        FROM baselines b WHERE b.project_id = p.id), '[]') AS baselines
     FROM projects p
     JOIN departments d ON d.id = p.department_id
     LEFT JOIN project_users pu ON pu.project_id = p.id
     LEFT JOIN users u ON u.id = pu.user_id AND u.deleted_at IS NULL
     WHERE p.id = $1 AND p.deleted_at IS NULL
     GROUP BY p.id, d.name, d.code`,
    [req.params.id]
  );

  if (!project) { res.status(404).json({ success: false, error: 'Program not found' }); return; }
  res.json({ success: true, data: project });
}

// ─── Create Program ───────────────────────────────────────────────────────────
const createSchema = z.object({
  department_id: z.string({ required_error: 'Department is required' }).uuid('Department is required'),
  name:          z.string().trim().min(1).max(255),
  description:   z.string().optional(),
  code:          z.string().trim().min(2).max(50).optional(),
  status:        statusEnum.optional(),
});

/** Validates the target department for create/move. Returns an error message or null. */
async function checkDepartment(req: Request, departmentId: string): Promise<{ status: number; error: string } | null> {
  const dept = await queryOne<{ id: string; name: string; status: string }>(
    `SELECT id, name, status FROM departments WHERE id = $1`, [departmentId]
  );
  if (!dept) return { status: 400, error: 'Department not found' };
  if (!canAccessDepartment(req.user, dept.id)) return { status: 403, error: 'No access to this department' };
  if (dept.status !== 'active') return { status: 400, error: `Department "${dept.name}" is inactive` };
  return null;
}

export async function createProject(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const body = createSchema.parse(req.body);

  const deptError = await checkDepartment(req, body.department_id);
  if (deptError) { res.status(deptError.status).json({ success: false, error: deptError.error }); return; }

  const exists = await queryOne(
    `SELECT id FROM projects WHERE (name=$1 OR (code IS NOT NULL AND code=$2)) AND deleted_at IS NULL`,
    [body.name, body.code ?? null]
  );
  if (exists) { res.status(409).json({ success: false, error: 'Program name or code already exists' }); return; }

  const [project] = await query<{ id: string }>(
    `INSERT INTO projects (name, description, code, status, department_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [body.name, body.description ?? null, body.code ?? null, body.status ?? 'active', body.department_id, req.user.userId]
  );

  await auditLog({ entity: 'program', entityId: project.id, action: 'created', newValue: body, user: req.user, req });
  res.status(201).json({ success: true, data: project });
}

// ─── Update Program ───────────────────────────────────────────────────────────
const updateSchema = z.object({
  department_id: z.string().uuid().optional(),
  name:          z.string().trim().min(1).max(255).optional(),
  description:   z.string().optional(),
  code:          z.string().trim().min(2).max(50).optional(),
  status:        statusEnum.optional(),
});

export async function updateProject(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const body = updateSchema.parse(req.body);
  const existing = await queryOne<{ id: string; department_id: string }>(
    `SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL`, [req.params.id]
  );
  if (!existing) { res.status(404).json({ success: false, error: 'Program not found' }); return; }

  if (req.user.projectIds !== '*' && !(req.user.projectIds as string[]).includes(existing.id)) {
    res.status(403).json({ success: false, error: 'No access to this program' }); return;
  }

  const moving = !!body.department_id && body.department_id !== existing.department_id;
  if (moving) {
    const deptError = await checkDepartment(req, body.department_id!);
    if (deptError) { res.status(deptError.status).json({ success: false, error: deptError.error }); return; }
  }

  if (body.name || body.code) {
    const dup = await queryOne(
      `SELECT id FROM projects WHERE (name=$1 OR (code IS NOT NULL AND code=$2)) AND deleted_at IS NULL AND id<>$3`,
      [body.name ?? null, body.code ?? null, existing.id]
    );
    if (dup) { res.status(409).json({ success: false, error: 'Program name or code already exists' }); return; }
  }

  // department_id change cascades to the program's tasks via the composite FK (ON UPDATE CASCADE)
  const [updated] = await query(
    `UPDATE projects SET
       name=COALESCE($1,name), description=COALESCE($2,description),
       code=COALESCE($3,code), status=COALESCE($4,status),
       department_id=COALESCE($5,department_id), updated_by=$6
     WHERE id=$7 RETURNING *`,
    [body.name ?? null, body.description ?? null, body.code ?? null, body.status ?? null,
     body.department_id ?? null, req.user.userId, req.params.id]
  );

  if (moving) {
    // Users assigned to the program keep their access: they become members of the new department.
    await query(
      `INSERT INTO user_departments (user_id, department_id, assigned_by)
       SELECT pu.user_id, $1, $2 FROM project_users pu WHERE pu.project_id = $3
       ON CONFLICT DO NOTHING`,
      [body.department_id, req.user.userId, existing.id]
    );
  }

  await auditLog({ entity: 'program', entityId: req.params.id, action: moving ? 'moved' : 'updated', previousValue: existing, newValue: body, user: req.user, req });
  res.json({ success: true, data: updated });
}

// ─── Delete Program (soft) ────────────────────────────────────────────────────
export async function deleteProject(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const project = await queryOne(`SELECT id FROM projects WHERE id=$1 AND deleted_at IS NULL`, [req.params.id]);
  if (!project) { res.status(404).json({ success: false, error: 'Program not found' }); return; }

  await query(`UPDATE projects SET deleted_at=NOW(), updated_by=$1 WHERE id=$2`, [req.user.userId, req.params.id]);
  await auditLog({ entity: 'program', entityId: req.params.id, action: 'deleted', user: req.user, req });
  res.json({ success: true, message: 'Program deleted' });
}

// ─── Assign Users to Program ──────────────────────────────────────────────────
const assignSchema = z.object({
  userIds: z.array(z.string().uuid()),
});

export async function assignUsers(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const { userIds } = assignSchema.parse(req.body);

  // Non-GSA admins can only assign to their own programs
  if (req.user.projectIds !== '*') {
    const ids = req.user.projectIds as string[];
    if (!ids.includes(req.params.id)) {
      res.status(403).json({ success: false, error: 'No access to this program' });
      return;
    }
  }

  const program = await queryOne<{ department_id: string }>(
    `SELECT department_id FROM projects WHERE id=$1 AND deleted_at IS NULL`, [req.params.id]
  );
  if (!program) { res.status(404).json({ success: false, error: 'Program not found' }); return; }

  for (const userId of userIds) {
    await query(
      `INSERT INTO project_users (project_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [req.params.id, userId, req.user.userId]
    );
    // Program access requires membership of the parent department
    await query(
      `INSERT INTO user_departments (user_id, department_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [userId, program.department_id, req.user.userId]
    );
  }

  await auditLog({ entity: 'program', entityId: req.params.id, action: 'users_assigned', newValue: { userIds }, user: req.user, req });
  res.json({ success: true, message: `${userIds.length} user(s) assigned` });
}

// ─── Remove User from Program ─────────────────────────────────────────────────
export async function removeUser(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  if (req.user.projectIds !== '*' && !(req.user.projectIds as string[]).includes(req.params.id)) {
    res.status(403).json({ success: false, error: 'No access to this program' });
    return;
  }

  await query(`DELETE FROM project_users WHERE project_id=$1 AND user_id=$2`, [req.params.id, req.params.userId]);
  await auditLog({ entity: 'program', entityId: req.params.id, action: 'user_removed', newValue: { userId: req.params.userId }, user: req.user, req });
  res.json({ success: true, message: 'User removed from program' });
}
