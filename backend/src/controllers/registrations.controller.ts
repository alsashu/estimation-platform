import { Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { auditLog } from '../services/audit.service';
import { createNotification } from '../services/notification.service';

// ─── List Registration Requests ───────────────────────────────────────────────
export async function listRegistrations(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const { page = 1, limit = 20, status } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  let i = 1;

  if (status) { where += ` AND rr.status = $${i++}`; params.push(status); }

  // Non-GSA/Admin only see requests for their projects
  if (req.user.projectIds !== '*') {
    const ids = req.user.projectIds as string[];
    if (ids.length === 0) {
      res.json({ success: true, data: [], total: 0, page: 1, limit: Number(limit) });
      return;
    }
    where += ` AND (rr.requested_project_id IS NULL OR rr.requested_project_id = ANY($${i++}::uuid[]))`;
    params.push(ids);
  }

  const data = await query(
    `SELECT rr.id, rr.first_name, rr.last_name, rr.username, rr.email, rr.status,
            rr.rejection_reason, rr.created_at, rr.reviewed_at,
            p.name AS requested_project_name, p.code AS requested_project_code,
            r.name AS requested_role_name,
            rev.first_name || ' ' || rev.last_name AS reviewed_by_name
     FROM registration_requests rr
     LEFT JOIN projects p ON p.id = rr.requested_project_id
     LEFT JOIN roles r ON r.id = rr.requested_role_id
     LEFT JOIN users rev ON rev.id = rr.reviewed_by
     ${where}
     ORDER BY rr.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, Number(limit), offset]
  );

  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM registration_requests rr ${where}`, params
  );

  res.json({
    success: true, data,
    total: parseInt(countRows[0]?.count ?? '0'),
    page: Number(page), limit: Number(limit),
  });
}

// ─── Get pending count ────────────────────────────────────────────────────────
export async function getPendingCount(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  let where = `WHERE rr.status = 'pending'`;
  const params: unknown[] = [];

  if (req.user.projectIds !== '*') {
    const ids = req.user.projectIds as string[];
    where += ` AND (rr.requested_project_id = ANY($1::uuid[]))`;
    params.push(ids);
  }

  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM registration_requests rr ${where}`, params
  );
  res.json({ success: true, data: { count: parseInt(rows[0]?.count ?? '0') } });
}

// ─── Approve ──────────────────────────────────────────────────────────────────
const approveSchema = z.object({ roleId: z.string().uuid().optional() });

export async function approveRegistration(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const { roleId } = approveSchema.parse(req.body);
  const regReq = await queryOne<{
    id: string; first_name: string; last_name: string; username: string;
    email: string; password_hash: string; status: string;
    requested_project_id: string | null; requested_role_id: string | null;
  }>(`SELECT * FROM registration_requests WHERE id=$1`, [req.params.id]);

  if (!regReq) { res.status(404).json({ success: false, error: 'Registration request not found' }); return; }
  if (regReq.status !== 'pending') { res.status(400).json({ success: false, error: 'Request already reviewed' }); return; }

  // Check that admin has access to the requested project
  if (req.user.projectIds !== '*' && regReq.requested_project_id) {
    const ids = req.user.projectIds as string[];
    if (!ids.includes(regReq.requested_project_id)) {
      res.status(403).json({ success: false, error: 'No access to approve for this project' });
      return;
    }
  }

  // Create user account
  const [newUser] = await query<{ id: string }>(
    `INSERT INTO users (first_name, last_name, username, email, password_hash, status, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,'active',true,$6) RETURNING id`,
    [regReq.first_name, regReq.last_name, regReq.username, regReq.email, regReq.password_hash, req.user.userId]
  );

  // Assign role (requested or default User)
  const finalRoleId = roleId ?? regReq.requested_role_id;
  if (finalRoleId) {
    await query(`INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [newUser.id, finalRoleId, req.user.userId]);
  } else {
    const userRole = await queryOne<{ id: string }>(`SELECT id FROM roles WHERE name='User'`);
    if (userRole) {
      await query(`INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [newUser.id, userRole.id, req.user.userId]);
    }
  }

  // Assign project
  if (regReq.requested_project_id) {
    await query(`INSERT INTO project_users (project_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [regReq.requested_project_id, newUser.id, req.user.userId]);
  }

  // Update request status
  await query(
    `UPDATE registration_requests SET status='approved', reviewed_by=$1, reviewed_at=NOW() WHERE id=$2`,
    [req.user.userId, regReq.id]
  );

  // Store password in history
  await query(`INSERT INTO password_history (user_id, password_hash) VALUES ($1,$2)`, [newUser.id, regReq.password_hash]);

  // Notify the new user
  await createNotification({
    type: 'success', category: 'approval', userId: newUser.id,
    title: 'Registration Approved',
    message: `Welcome ${regReq.first_name}! Your registration has been approved. You can now log in.`,
  });

  await auditLog({
    entity: 'registration', entityId: regReq.id, action: 'approved',
    newValue: { newUserId: newUser.id }, user: req.user, req,
  });

  res.json({ success: true, message: 'Registration approved', data: { userId: newUser.id } });
}

// ─── Reject ───────────────────────────────────────────────────────────────────
const rejectSchema = z.object({ reason: z.string().min(1).max(500) });

export async function rejectRegistration(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const { reason } = rejectSchema.parse(req.body);
  const regReq = await queryOne<{ id: string; status: string; first_name: string; email: string }>(
    `SELECT id, status, first_name, email FROM registration_requests WHERE id=$1`, [req.params.id]
  );

  if (!regReq) { res.status(404).json({ success: false, error: 'Registration request not found' }); return; }
  if (regReq.status !== 'pending') { res.status(400).json({ success: false, error: 'Request already reviewed' }); return; }

  await query(
    `UPDATE registration_requests SET status='rejected', rejection_reason=$1, reviewed_by=$2, reviewed_at=NOW() WHERE id=$3`,
    [reason, req.user.userId, regReq.id]
  );

  await auditLog({
    entity: 'registration', entityId: regReq.id, action: 'rejected',
    newValue: { reason }, user: req.user, req,
  });

  res.json({ success: true, message: 'Registration rejected' });
}
