import { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { hashPassword, comparePassword, validatePasswordPolicy, generateStrongPassword } from '../auth/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken, getRefreshExpiryDate } from '../auth/jwt';
import { auditLog } from '../services/audit.service';
import { createNotification, createApprovalNotification, broadcastToAdmins } from '../services/notification.service';

interface UserRow {
  id: string; first_name: string; last_name: string; username: string;
  email: string; password_hash: string; status: string; is_active: boolean;
  failed_login_count: number; locked_until: string | null;
}

async function buildUserTokenPayload(userId: string) {
  const user = await queryOne<UserRow>(`SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
  if (!user) throw new Error('User not found');

  const roles = await query<{ name: string }>(
    `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1`,
    [userId]
  );

  const perms = await query<{ name: string }>(
    `SELECT DISTINCT p.name FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     JOIN user_roles ur ON ur.role_id = rp.role_id
     WHERE ur.user_id = $1`,
    [userId]
  );

  const isGSA = roles.some(r => r.name === 'Global Super Admin');
  let projectIds: string[] | '*';

  if (isGSA) {
    projectIds = '*';
  } else {
    const projects = await query<{ project_id: string }>(
      `SELECT project_id FROM project_users WHERE user_id = $1`, [userId]
    );
    projectIds = projects.map(p => p.project_id);
  }

  return {
    userId,
    email: user.email,
    username: user.username,
    roles: roles.map(r => r.name),
    permissions: perms.map(p => p.name),
    projectIds,
  };
}

// ─── Login ───────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = loginSchema.parse(req.body);

  const user = await queryOne<UserRow>(
    `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`, [email]
  );

  if (!user || !user.is_active) {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
    return;
  }

  // Check lockout
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remaining = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    res.status(403).json({ success: false, error: `Account locked. Try again in ${remaining} min` });
    return;
  }

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    const maxAttempts = 5;
    const newCount = user.failed_login_count + 1;
    const lockUntil = newCount >= maxAttempts
      ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
      : null;

    await query(
      `UPDATE users SET failed_login_count=$1, locked_until=$2 WHERE id=$3`,
      [newCount, lockUntil, user.id]
    );

    await auditLog({ entity: 'auth', entityId: user.id, action: 'login_failed', req });
    res.status(401).json({ success: false, error: 'Invalid credentials' });
    return;
  }

  // Reset failed attempts
  await query(
    `UPDATE users SET failed_login_count=0, locked_until=NULL, last_login_at=NOW() WHERE id=$1`,
    [user.id]
  );

  const payload = await buildUserTokenPayload(user.id);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ userId: user.id, email: user.email });

  // Store refresh token hash
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5)`,
    [user.id, tokenHash, getRefreshExpiryDate().toISOString(), req.ip, req.headers['user-agent'] ?? null]
  );

  await auditLog({ entity: 'auth', entityId: user.id, action: 'login', user: payload, req });

  res.json({
    success: true,
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      email: user.email,
      roles: payload.roles,
      permissions: payload.permissions,
      projectIds: payload.projectIds,
    },
  });
}

// ─── Refresh Token ────────────────────────────────────────────────────────────
export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { refreshToken: token } = req.body;
  if (!token) {
    res.status(400).json({ success: false, error: 'Refresh token required' });
    return;
  }

  let decoded: { userId: string; email: string };
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const stored = await queryOne<{ id: string; revoked_at: string | null }>(
    `SELECT id, revoked_at FROM refresh_tokens
     WHERE token_hash=$1 AND user_id=$2 AND expires_at > NOW()`,
    [tokenHash, decoded.userId]
  );

  if (!stored || stored.revoked_at) {
    res.status(401).json({ success: false, error: 'Refresh token revoked or expired' });
    return;
  }

  // Rotate — revoke old, issue new
  await query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1`, [stored.id]);

  const payload = await buildUserTokenPayload(decoded.userId);
  const newAccessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken({ userId: decoded.userId, email: decoded.email });

  const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5)`,
    [decoded.userId, newHash, getRefreshExpiryDate().toISOString(), req.ip, req.headers['user-agent'] ?? null]
  );

  res.json({ success: true, accessToken: newAccessToken, refreshToken: newRefreshToken });
}

// ─── Logout ───────────────────────────────────────────────────────────────────
export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken: token } = req.body;
  if (token) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1`, [hash]);
  }
  if (req.user) {
    await auditLog({ entity: 'auth', entityId: req.user.userId, action: 'logout', user: req.user, req });
  }
  res.json({ success: true, message: 'Logged out' });
}

// ─── Me ───────────────────────────────────────────────────────────────────────
export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const user = await queryOne<UserRow>(
    `SELECT id, first_name, last_name, username, email, status, is_active, last_login_at, created_at
     FROM users WHERE id = $1 AND deleted_at IS NULL`, [req.user.userId]
  );
  if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
  res.json({
    success: true,
    data: {
      ...user,
      roles: req.user.roles,
      permissions: req.user.permissions,
      projectIds: req.user.projectIds,
    },
  });
}

// ─── Change Password ──────────────────────────────────────────────────────────
const changePassSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const { currentPassword, newPassword } = changePassSchema.parse(req.body);

  const user = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1`, [req.user.userId]
  );
  if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

  const valid = await comparePassword(currentPassword, user.password_hash);
  if (!valid) { res.status(400).json({ success: false, error: 'Current password is incorrect' }); return; }

  const policyError = validatePasswordPolicy(newPassword);
  if (policyError) { res.status(400).json({ success: false, error: policyError }); return; }

  // Check password history
  const histCount = parseInt(process.env.PASSWORD_HISTORY_COUNT ?? '5');
  const history = await query<{ password_hash: string }>(
    `SELECT password_hash FROM password_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [req.user.userId, histCount]
  );
  for (const h of history) {
    if (await comparePassword(newPassword, h.password_hash)) {
      res.status(400).json({ success: false, error: `Cannot reuse your last ${histCount} passwords` });
      return;
    }
  }

  const newHash = await hashPassword(newPassword);
  await query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [newHash, req.user.userId]);
  await query(`INSERT INTO password_history (user_id, password_hash) VALUES ($1,$2)`, [req.user.userId, newHash]);
  await auditLog({ entity: 'auth', entityId: req.user.userId, action: 'password_changed', user: req.user, req });

  res.json({ success: true, message: 'Password changed successfully' });
}

// ─── Forgot Password ──────────────────────────────────────────────────────────
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body;
  if (!email) { res.status(400).json({ success: false, error: 'Email is required' }); return; }

  const user = await queryOne<{ id: string; first_name: string }>(
    `SELECT id, first_name FROM users WHERE email=$1 AND deleted_at IS NULL AND is_active=true`, [email]
  );

  // Always respond success to prevent email enumeration
  const generic = { success: true, message: 'If this email exists, a reset link has been sent' };

  if (!user) { res.json(generic); return; }

  // Invalidate old tokens
  await query(`DELETE FROM password_reset_tokens WHERE user_id=$1`, [user.id]);

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
    [user.id, tokenHash, expiresAt.toISOString()]
  );

  // In production, send email. For now, return token in response (dev mode only).
  const isDev = process.env.NODE_ENV !== 'production';
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  await auditLog({ entity: 'auth', entityId: user.id, action: 'password_reset_requested', req });

  res.json({
    ...generic,
    ...(isDev && { resetToken: token, resetUrl }),
  });
}

// ─── Reset Password ───────────────────────────────────────────────────────────
const resetPassSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, newPassword } = resetPassSchema.parse(req.body);

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const prt = await queryOne<{ id: string; user_id: string; used_at: string | null }>(
    `SELECT id, user_id, used_at FROM password_reset_tokens
     WHERE token_hash=$1 AND expires_at > NOW()`,
    [tokenHash]
  );

  if (!prt || prt.used_at) {
    res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    return;
  }

  const policyError = validatePasswordPolicy(newPassword);
  if (policyError) { res.status(400).json({ success: false, error: policyError }); return; }

  const histCount = parseInt(process.env.PASSWORD_HISTORY_COUNT ?? '5');
  const history = await query<{ password_hash: string }>(
    `SELECT password_hash FROM password_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [prt.user_id, histCount]
  );
  for (const h of history) {
    if (await comparePassword(newPassword, h.password_hash)) {
      res.status(400).json({ success: false, error: `Cannot reuse your last ${histCount} passwords` });
      return;
    }
  }

  const newHash = await hashPassword(newPassword);
  await query(`UPDATE users SET password_hash=$1, failed_login_count=0, locked_until=NULL WHERE id=$2`, [newHash, prt.user_id]);
  await query(`UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1`, [prt.id]);
  await query(`INSERT INTO password_history (user_id, password_hash) VALUES ($1,$2)`, [prt.user_id, newHash]);
  await auditLog({ entity: 'auth', entityId: prt.user_id, action: 'password_reset', req });

  res.json({ success: true, message: 'Password reset successfully' });
}

// ─── Generate Password ────────────────────────────────────────────────────────
export async function generatePassword(_req: Request, res: Response): Promise<void> {
  const password = generateStrongPassword();
  res.json({ success: true, data: { password } });
}

// ─── Public Registration ──────────────────────────────────────────────────────
const registerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  username: z.string().min(3).max(100).regex(/^[a-zA-Z0-9._-]+$/, 'Invalid username format'),
  email: z.string().email(),
  password: z.string().min(8),
  requestedProjectId: z.string().uuid().optional(),
  requestedRoleId: z.string().uuid().optional(),
});

export async function register(req: Request, res: Response): Promise<void> {
  const body = registerSchema.parse(req.body);

  const policyError = validatePasswordPolicy(body.password);
  if (policyError) { res.status(400).json({ success: false, error: policyError }); return; }

  // Check duplicates in users and pending requests
  const emailExists = await queryOne(
    `SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL
     UNION SELECT id FROM registration_requests WHERE email=$1 AND status='pending'`,
    [body.email]
  );
  if (emailExists) { res.status(409).json({ success: false, error: 'Email already registered or pending' }); return; }

  const userExists = await queryOne(
    `SELECT id FROM users WHERE username=$1 AND deleted_at IS NULL`, [body.username]
  );
  if (userExists) { res.status(409).json({ success: false, error: 'Username already taken' }); return; }

  const hash = await hashPassword(body.password);
  const [req_] = await query<{ id: string }>(
    `INSERT INTO registration_requests (first_name, last_name, username, email, password_hash, requested_project_id, requested_role_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [body.firstName, body.lastName, body.username, body.email, hash,
     body.requestedProjectId ?? null, body.requestedRoleId ?? null]
  );

  // Notify admins/super-admins who have access to the requested project
  let adminIds: { id: string }[];
  if (body.requestedProjectId) {
    adminIds = await query<{ id: string }>(
      `SELECT DISTINCT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       LEFT JOIN project_users pu ON pu.user_id = u.id
       WHERE r.name IN ('Global Super Admin','Scoped Super Admin','Admin')
         AND (r.name = 'Global Super Admin' OR pu.project_id = $1)
         AND u.is_active = true AND u.deleted_at IS NULL`,
      [body.requestedProjectId]
    );
  } else {
    adminIds = await query<{ id: string }>(
      `SELECT DISTINCT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.name IN ('Global Super Admin','Admin')
         AND u.is_active = true AND u.deleted_at IS NULL`
    );
  }

  await broadcastToAdmins(
    adminIds.map(a => a.id),
    {
      type: 'warning',
      category: 'approval',
      priority: 'high',
      title: 'New Registration Pending',
      message: `${body.firstName} ${body.lastName} (${body.email}) has requested access. Review and approve.`,
      actionUrl: '/registrations',
    }
  );

  res.status(201).json({
    success: true,
    message: 'Registration submitted. You will be notified once approved.',
    data: { id: req_.id },
  });
}
