import { Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { auditLog } from '../services/audit.service';

// ─── List Projects ────────────────────────────────────────────────────────────
export async function listProjects(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const { page = 1, limit = 50, search, status } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE p.deleted_at IS NULL';
  const params: unknown[] = [];
  let i = 1;

  // Non-GSA users only see their assigned projects
  if (req.user.projectIds !== '*') {
    const ids = req.user.projectIds as string[];
    if (ids.length === 0) {
      res.json({ success: true, data: [], total: 0, page: 1, limit: Number(limit) });
      return;
    }
    where += ` AND p.id = ANY($${i++}::uuid[])`;
    params.push(ids);
  }

  if (search) { where += ` AND (p.name ILIKE $${i} OR p.code ILIKE $${i++})`; params.push(`%${search}%`); }
  if (status) { where += ` AND p.status = $${i++}`; params.push(status); }

  const data = await query(
    `SELECT p.id, p.name, p.code, p.description, p.status, p.created_at,
            COUNT(DISTINCT pu.user_id)::int AS user_count,
            COUNT(DISTINCT e.id)::int AS estimation_count
     FROM projects p
     LEFT JOIN project_users pu ON pu.project_id = p.id
     LEFT JOIN estimations e ON e.project_id = p.id
     ${where}
     GROUP BY p.id
     ORDER BY p.name
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, Number(limit), offset]
  );

  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM projects p ${where}`, params
  );
  const total = parseInt(countRows[0]?.count ?? '0');

  res.json({ success: true, data, total, page: Number(page), limit: Number(limit) });
}

// ─── Get Project ──────────────────────────────────────────────────────────────
export async function getProject(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  // Access check for non-GSA
  if (req.user.projectIds !== '*') {
    const ids = req.user.projectIds as string[];
    if (!ids.includes(req.params.id)) {
      res.status(403).json({ success: false, error: 'No access to this project' });
      return;
    }
  }

  const project = await queryOne(
    `SELECT p.*,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', u.id, 'name', u.first_name || ' ' || u.last_name, 'email', u.email, 'username', u.username))
              FILTER (WHERE u.id IS NOT NULL), '[]') AS users
     FROM projects p
     LEFT JOIN project_users pu ON pu.project_id = p.id
     LEFT JOIN users u ON u.id = pu.user_id AND u.deleted_at IS NULL
     WHERE p.id = $1 AND p.deleted_at IS NULL
     GROUP BY p.id`,
    [req.params.id]
  );

  if (!project) { res.status(404).json({ success: false, error: 'Project not found' }); return; }
  res.json({ success: true, data: project });
}

// ─── Create Project ───────────────────────────────────────────────────────────
const createSchema = z.object({
  name:        z.string().min(1).max(255),
  description: z.string().optional(),
  code:        z.string().min(2).max(50).optional(),
  status:      z.enum(['active', 'inactive', 'archived']).optional(),
});

export async function createProject(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const body = createSchema.parse(req.body);

  const exists = await queryOne(
    `SELECT id FROM projects WHERE (name=$1 OR (code IS NOT NULL AND code=$2)) AND deleted_at IS NULL`,
    [body.name, body.code ?? null]
  );
  if (exists) { res.status(409).json({ success: false, error: 'Project name or code already exists' }); return; }

  const [project] = await query<{ id: string }>(
    `INSERT INTO projects (name, description, code, status, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [body.name, body.description ?? null, body.code ?? null, body.status ?? 'active', req.user.userId]
  );

  await auditLog({ entity: 'project', entityId: project.id, action: 'created', newValue: body, user: req.user, req });
  res.status(201).json({ success: true, data: project });
}

// ─── Update Project ───────────────────────────────────────────────────────────
const updateSchema = z.object({
  name:        z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  code:        z.string().min(2).max(50).optional(),
  status:      z.enum(['active', 'inactive', 'archived']).optional(),
});

export async function updateProject(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const body = updateSchema.parse(req.body);
  const existing = await queryOne(`SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL`, [req.params.id]);
  if (!existing) { res.status(404).json({ success: false, error: 'Project not found' }); return; }

  const [updated] = await query(
    `UPDATE projects SET
       name=COALESCE($1,name), description=COALESCE($2,description),
       code=COALESCE($3,code), status=COALESCE($4,status), updated_by=$5
     WHERE id=$6 RETURNING *`,
    [body.name ?? null, body.description ?? null, body.code ?? null, body.status ?? null, req.user.userId, req.params.id]
  );

  await auditLog({ entity: 'project', entityId: req.params.id, action: 'updated', previousValue: existing, newValue: body, user: req.user, req });
  res.json({ success: true, data: updated });
}

// ─── Delete Project (soft) ────────────────────────────────────────────────────
export async function deleteProject(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const project = await queryOne(`SELECT id FROM projects WHERE id=$1 AND deleted_at IS NULL`, [req.params.id]);
  if (!project) { res.status(404).json({ success: false, error: 'Project not found' }); return; }

  await query(`UPDATE projects SET deleted_at=NOW(), updated_by=$1 WHERE id=$2`, [req.user.userId, req.params.id]);
  await auditLog({ entity: 'project', entityId: req.params.id, action: 'deleted', user: req.user, req });
  res.json({ success: true, message: 'Project deleted' });
}

// ─── Assign Users to Project ──────────────────────────────────────────────────
const assignSchema = z.object({
  userIds: z.array(z.string().uuid()),
});

export async function assignUsers(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const { userIds } = assignSchema.parse(req.body);

  // Non-GSA admins can only assign to their own projects
  if (req.user.projectIds !== '*') {
    const ids = req.user.projectIds as string[];
    if (!ids.includes(req.params.id)) {
      res.status(403).json({ success: false, error: 'No access to this project' });
      return;
    }
  }

  for (const userId of userIds) {
    await query(
      `INSERT INTO project_users (project_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [req.params.id, userId, req.user.userId]
    );
  }

  await auditLog({ entity: 'project', entityId: req.params.id, action: 'users_assigned', newValue: { userIds }, user: req.user, req });
  res.json({ success: true, message: `${userIds.length} user(s) assigned` });
}

// ─── Remove User from Project ─────────────────────────────────────────────────
export async function removeUser(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  await query(`DELETE FROM project_users WHERE project_id=$1 AND user_id=$2`, [req.params.id, req.params.userId]);
  await auditLog({ entity: 'project', entityId: req.params.id, action: 'user_removed', newValue: { userId: req.params.userId }, user: req.user, req });
  res.json({ success: true, message: 'User removed from project' });
}
