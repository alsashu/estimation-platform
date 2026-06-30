import { Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { hashPassword, comparePassword, validatePasswordPolicy } from '../auth/password';
import { auditLog } from '../services/audit.service';
import { createNotification } from '../services/notification.service';

interface UserRow {
  id: string; first_name: string; last_name: string; username: string;
  email: string; status: string; is_active: boolean; last_login_at: string | null;
  created_at: string; updated_at: string;
}

// Role names that indicate a super-admin
const SA_ROLES = ['Global Super Admin', 'Scoped Super Admin'];
const isSA = (roles: string[]): boolean => roles.some(r => SA_ROLES.includes(r));

// Fetch minimal security meta for a target user: their roles and who created them
interface TargetMeta { roles: string[]; created_by: string | null; }
async function getTargetMeta(userId: string): Promise<TargetMeta | null> {
  return queryOne<TargetMeta>(
    `SELECT u.created_by,
            COALESCE(json_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '[]') AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1 AND u.deleted_at IS NULL
     GROUP BY u.id`,
    [userId]
  );
}

// ─── List Users ───────────────────────────────────────────────────────────────
export async function listUsers(req: Request, res: Response): Promise<void> {
  const { page = 1, limit = 20, search, status, role } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE u.deleted_at IS NULL';
  const params: unknown[] = [];
  let i = 1;

  if (search) {
    where += ` AND (u.email ILIKE $${i} OR u.username ILIKE $${i} OR u.first_name ILIKE $${i} OR u.last_name ILIKE $${i})`;
    params.push(`%${search}%`); i++;
  }
  if (status) { where += ` AND u.status = $${i++}`; params.push(status); }
  if (role) {
    where += ` AND EXISTS (SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id=ur2.role_id WHERE ur2.user_id=u.id AND r2.name=$${i++})`;
    params.push(role);
  }

  if (!isSA(req.user!.roles)) {
    // Non-super-admins cannot see super-admin accounts
    where += ` AND NOT EXISTS (
      SELECT 1 FROM user_roles ur_sa
      JOIN roles r_sa ON r_sa.id = ur_sa.role_id
      WHERE ur_sa.user_id = u.id AND r_sa.name = ANY($${i}::text[])
    )`;
    params.push(SA_ROLES); i++;

    // Admins only see users they created (covers direct creation + registration approvals)
    // or their own account
    where += ` AND (u.created_by = $${i} OR u.id = $${i})`;
    params.push(req.user!.userId); i++;
  }

  const data = await query(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.email, u.status, u.is_active,
            u.last_login_at, u.created_at, u.updated_at,
            COALESCE(json_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '[]') AS roles,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code))
                     FILTER (WHERE p.id IS NOT NULL), '[]') AS projects
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     LEFT JOIN project_users pu ON pu.user_id = u.id
     LEFT JOIN projects p ON p.id = pu.project_id AND p.deleted_at IS NULL
     ${where}
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, Number(limit), offset]
  );

  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM users u ${where}`, params
  );
  const total = parseInt(countRows[0]?.count ?? '0');
  res.json({ success: true, data, total, page: Number(page), limit: Number(limit) });
}

// ─── Get User ─────────────────────────────────────────────────────────────────
export async function getUser(req: Request, res: Response): Promise<void> {
  // Non-super-admins cannot view super-admin accounts
  if (req.user && !isSA(req.user.roles)) {
    const meta = await getTargetMeta(req.params.id);
    if (!meta) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    if (isSA(meta.roles)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' }); return;
    }
  }

  const user = await queryOne(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.email, u.status, u.is_active,
            u.last_login_at, u.created_at, u.updated_at,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', r.id, 'name', r.name)) FILTER (WHERE r.id IS NOT NULL), '[]') AS roles,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code)) FILTER (WHERE p.id IS NOT NULL), '[]') AS projects
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     LEFT JOIN project_users pu ON pu.user_id = u.id
     LEFT JOIN projects p ON p.id = pu.project_id
     WHERE u.id = $1 AND u.deleted_at IS NULL
     GROUP BY u.id`,
    [req.params.id]
  );
  if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
  res.json({ success: true, data: user });
}

// ─── Create User ──────────────────────────────────────────────────────────────
const createUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  username:  z.string().min(3).max(100),
  email:     z.string().email(),
  password:  z.string().min(8),
  roleIds:   z.array(z.string().uuid()).optional(),
  projectIds: z.array(z.string().uuid()).optional(),
});

export async function createUser(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const body = createUserSchema.parse(req.body);

  const policyError = validatePasswordPolicy(body.password);
  if (policyError) { res.status(400).json({ success: false, error: policyError }); return; }

  const exists = await queryOne(
    `SELECT id FROM users WHERE (email=$1 OR username=$2) AND deleted_at IS NULL`,
    [body.email, body.username]
  );
  if (exists) { res.status(409).json({ success: false, error: 'Email or username already exists' }); return; }

  // Admins cannot assign super admin roles
  if (!req.user.roles.includes('Global Super Admin') && !req.user.roles.includes('Scoped Super Admin')) {
    const superRoles = await query<{ id: string }>(
      `SELECT id FROM roles WHERE name IN ('Global Super Admin','Scoped Super Admin') AND id = ANY($1::uuid[])`,
      [body.roleIds ?? []]
    );
    if (superRoles.length > 0) {
      res.status(403).json({ success: false, error: 'Cannot assign Super Admin role' });
      return;
    }
  }

  // Admins can only assign projects they have access to
  if (req.user.projectIds !== '*' && body.projectIds?.length) {
    const allowed = req.user.projectIds as string[];
    const unauthorized = body.projectIds.filter(pid => !allowed.includes(pid));
    if (unauthorized.length > 0) {
      res.status(403).json({ success: false, error: 'Cannot assign projects outside your access' });
      return;
    }
  }

  const hash = await hashPassword(body.password);
  const [newUser] = await query<{ id: string }>(
    `INSERT INTO users (first_name, last_name, username, email, password_hash, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [body.firstName, body.lastName, body.username, body.email, hash, req.user.userId]
  );

  // Store password in history
  await query(`INSERT INTO password_history (user_id, password_hash) VALUES ($1,$2)`, [newUser.id, hash]);

  // Assign roles
  for (const roleId of body.roleIds ?? []) {
    await query(`INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [newUser.id, roleId, req.user.userId]);
  }

  // Assign projects
  for (const projectId of body.projectIds ?? []) {
    await query(`INSERT INTO project_users (project_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [projectId, newUser.id, req.user.userId]);
  }

  await auditLog({
    entity: 'user', entityId: newUser.id, action: 'created',
    newValue: { email: body.email, username: body.username },
    user: req.user, req,
  });

  await createNotification({
    type: 'info', title: 'New User Created',
    message: `User ${body.firstName} ${body.lastName} (${body.email}) created by ${req.user.username}`,
    userId: newUser.id,
  });

  const created = await queryOne(
    `SELECT id, first_name, last_name, username, email, status, is_active, created_at FROM users WHERE id=$1`,
    [newUser.id]
  );
  res.status(201).json({ success: true, data: created });
}

// ─── Update User ──────────────────────────────────────────────────────────────
const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName:  z.string().min(1).max(100).optional(),
  username:  z.string().min(3).max(100).optional(),
  email:     z.string().email().optional(),
  roleIds:   z.array(z.string().uuid()).optional(),
  projectIds: z.array(z.string().uuid()).optional(),
});

export async function updateUser(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const body = updateUserSchema.parse(req.body);
  const targetId = req.params.id;

  // Check target visibility and ownership for non-super-admins
  if (!isSA(req.user.roles)) {
    const meta = await getTargetMeta(targetId);
    if (!meta) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    if (isSA(meta.roles)) {
      res.status(403).json({ success: false, error: 'Cannot modify a Super Admin account' }); return;
    }
    if (meta.created_by !== req.user.userId && targetId !== req.user.userId) {
      res.status(403).json({ success: false, error: 'You can only manage users you have created' }); return;
    }
  }

  // Admins can only assign projects they have access to
  if (!isSA(req.user.roles) && body.projectIds?.length && req.user.projectIds !== '*') {
    const allowed = req.user.projectIds as string[];
    const unauthorized = body.projectIds.filter(pid => !allowed.includes(pid));
    if (unauthorized.length > 0) {
      res.status(403).json({ success: false, error: 'Cannot assign projects outside your access' });
      return;
    }
  }

  const existing = await queryOne<UserRow>(
    `SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL`, [targetId]
  );
  if (!existing) { res.status(404).json({ success: false, error: 'User not found' }); return; }

  const updates: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (body.firstName) { updates.push(`first_name=$${i++}`); vals.push(body.firstName); }
  if (body.lastName)  { updates.push(`last_name=$${i++}`);  vals.push(body.lastName); }
  if (body.username)  { updates.push(`username=$${i++}`);   vals.push(body.username); }
  if (body.email)     { updates.push(`email=$${i++}`);      vals.push(body.email); }

  if (updates.length > 0) {
    updates.push(`updated_by=$${i++}`); vals.push(req.user.userId);
    vals.push(targetId);
    await query(`UPDATE users SET ${updates.join(',')} WHERE id=$${i}`, vals);
  }

  // Update roles
  if (body.roleIds !== undefined) {
    await query(`DELETE FROM user_roles WHERE user_id=$1`, [targetId]);
    for (const roleId of body.roleIds) {
      await query(`INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [targetId, roleId, req.user.userId]);
    }
  }

  // Update projects
  if (body.projectIds !== undefined) {
    await query(`DELETE FROM project_users WHERE user_id=$1`, [targetId]);
    for (const projectId of body.projectIds) {
      await query(`INSERT INTO project_users (project_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [projectId, targetId, req.user.userId]);
    }
  }

  await auditLog({
    entity: 'user', entityId: targetId, action: 'updated',
    previousValue: existing, newValue: body,
    user: req.user, req,
  });

  const updated = await queryOne(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.email, u.status, u.is_active, u.updated_at,
            COALESCE(json_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '[]') AS roles,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code))
                     FILTER (WHERE p.id IS NOT NULL), '[]') AS projects
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
     LEFT JOIN project_users pu ON pu.user_id = u.id
     LEFT JOIN projects p ON p.id = pu.project_id AND p.deleted_at IS NULL
     WHERE u.id = $1 GROUP BY u.id`,
    [targetId]
  );
  res.json({ success: true, data: updated });
}

// ─── Activate / Deactivate User ───────────────────────────────────────────────
export async function setUserActive(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const { active } = req.body;
  if (typeof active !== 'boolean') { res.status(400).json({ success: false, error: 'active boolean required' }); return; }

  if (!isSA(req.user.roles)) {
    const meta = await getTargetMeta(req.params.id);
    if (!meta) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    if (isSA(meta.roles)) {
      res.status(403).json({ success: false, error: 'Cannot modify a Super Admin account' }); return;
    }
    if (meta.created_by !== req.user.userId) {
      res.status(403).json({ success: false, error: 'You can only manage users you have created' }); return;
    }
  }

  const user = await queryOne<UserRow>(`SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL`, [req.params.id]);
  if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

  const newStatus = active ? 'active' : 'inactive';
  await query(
    `UPDATE users SET is_active=$1, status=$2, updated_by=$3 WHERE id=$4`,
    [active, newStatus, req.user.userId, req.params.id]
  );

  await auditLog({
    entity: 'user', entityId: req.params.id,
    action: active ? 'activated' : 'deactivated',
    user: req.user, req,
  });

  res.json({ success: true, message: `User ${active ? 'activated' : 'deactivated'}` });
}

// ─── Soft Delete User ─────────────────────────────────────────────────────────
export async function deleteUser(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  if (req.params.id === req.user.userId) {
    res.status(400).json({ success: false, error: 'Cannot delete your own account' }); return;
  }

  if (!isSA(req.user.roles)) {
    const meta = await getTargetMeta(req.params.id);
    if (!meta) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    if (isSA(meta.roles)) {
      res.status(403).json({ success: false, error: 'Cannot delete a Super Admin account' }); return;
    }
    if (meta.created_by !== req.user.userId) {
      res.status(403).json({ success: false, error: 'You can only manage users you have created' }); return;
    }
  }

  const user = await queryOne<UserRow>(`SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL`, [req.params.id]);
  if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

  await query(`UPDATE users SET deleted_at=NOW(), updated_by=$1 WHERE id=$2`, [req.user.userId, req.params.id]);
  await auditLog({ entity: 'user', entityId: req.params.id, action: 'deleted', user: req.user, req });
  res.json({ success: true, message: 'User deleted' });
}

// ─── Admin reset password ─────────────────────────────────────────────────────
const adminResetSchema = z.object({ newPassword: z.string().min(8) });

export async function adminResetPassword(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const { newPassword } = adminResetSchema.parse(req.body);

  const policyError = validatePasswordPolicy(newPassword);
  if (policyError) { res.status(400).json({ success: false, error: policyError }); return; }

  const user = await queryOne(`SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL`, [req.params.id]);
  if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

  const histCount = parseInt(process.env.PASSWORD_HISTORY_COUNT ?? '5');
  const history = await query<{ password_hash: string }>(
    `SELECT password_hash FROM password_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [req.params.id, histCount]
  );
  for (const h of history) {
    if (await comparePassword(newPassword, h.password_hash)) {
      res.status(400).json({ success: false, error: `Cannot reuse previous passwords` });
      return;
    }
  }

  const hash = await hashPassword(newPassword);
  await query(`UPDATE users SET password_hash=$1, failed_login_count=0, locked_until=NULL WHERE id=$2`, [hash, req.params.id]);
  await query(`INSERT INTO password_history (user_id, password_hash) VALUES ($1,$2)`, [req.params.id, hash]);
  await auditLog({ entity: 'user', entityId: req.params.id, action: 'password_reset_by_admin', user: req.user, req });

  res.json({ success: true, message: 'Password reset successfully' });
}
