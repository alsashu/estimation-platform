import { Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { auditLog } from '../services/audit.service';

// ─── Roles ────────────────────────────────────────────────────────────────────
export async function listRoles(_req: Request, res: Response): Promise<void> {
  const data = await query(
    `SELECT r.id, r.name, r.description, r.is_system, r.created_at,
            COALESCE(json_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL), '[]') AS permissions,
            COUNT(DISTINCT ur.user_id)::int AS user_count
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     LEFT JOIN user_roles ur ON ur.role_id = r.id
     GROUP BY r.id
     ORDER BY r.created_at`
  );
  res.json({ success: true, data });
}

export async function getRole(req: Request, res: Response): Promise<void> {
  const role = await queryOne(
    `SELECT r.*, COALESCE(json_agg(DISTINCT jsonb_build_object('id', p.id, 'name', p.name, 'module', p.module))
       FILTER (WHERE p.id IS NOT NULL), '[]') AS permissions
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     WHERE r.id = $1 GROUP BY r.id`,
    [req.params.id]
  );
  if (!role) { res.status(404).json({ success: false, error: 'Role not found' }); return; }
  res.json({ success: true, data: role });
}

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

export async function createRole(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const body = createRoleSchema.parse(req.body);
  const exists = await queryOne(`SELECT id FROM roles WHERE name=$1`, [body.name]);
  if (exists) { res.status(409).json({ success: false, error: 'Role name already exists' }); return; }

  const [role] = await query<{ id: string }>(
    `INSERT INTO roles (name, description) VALUES ($1,$2) RETURNING *`,
    [body.name, body.description ?? null]
  );

  for (const permId of body.permissionIds ?? []) {
    await query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [role.id, permId]);
  }

  await auditLog({ entity: 'role', entityId: role.id, action: 'created', newValue: body, user: req.user, req });
  res.status(201).json({ success: true, data: role });
}

const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

export async function updateRole(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const body = updateRoleSchema.parse(req.body);
  const role = await queryOne<{ id: string; is_system: boolean }>(
    `SELECT id, is_system FROM roles WHERE id=$1`, [req.params.id]
  );
  if (!role) { res.status(404).json({ success: false, error: 'Role not found' }); return; }

  if (role.is_system && body.name) {
    res.status(400).json({ success: false, error: 'Cannot rename system roles' }); return;
  }

  const [updated] = await query(
    `UPDATE roles SET name=COALESCE($1,name), description=COALESCE($2,description) WHERE id=$3 RETURNING *`,
    [body.name ?? null, body.description ?? null, req.params.id]
  );

  if (body.permissionIds !== undefined) {
    await query(`DELETE FROM role_permissions WHERE role_id=$1`, [req.params.id]);
    for (const permId of body.permissionIds) {
      await query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, permId]);
    }
  }

  await auditLog({ entity: 'role', entityId: req.params.id, action: 'updated', newValue: body, user: req.user, req });
  res.json({ success: true, data: updated });
}

export async function deleteRole(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const role = await queryOne<{ id: string; is_system: boolean }>(
    `SELECT id, is_system FROM roles WHERE id=$1`, [req.params.id]
  );
  if (!role) { res.status(404).json({ success: false, error: 'Role not found' }); return; }
  if (role.is_system) { res.status(400).json({ success: false, error: 'Cannot delete system roles' }); return; }

  await query(`DELETE FROM roles WHERE id=$1`, [req.params.id]);
  await auditLog({ entity: 'role', entityId: req.params.id, action: 'deleted', user: req.user, req });
  res.json({ success: true, message: 'Role deleted' });
}

// ─── Permissions ──────────────────────────────────────────────────────────────
export async function listPermissions(_req: Request, res: Response): Promise<void> {
  const data = await query(`SELECT * FROM permissions ORDER BY module, name`);
  res.json({ success: true, data });
}
