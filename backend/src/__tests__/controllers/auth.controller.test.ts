import { Request, Response } from 'express';
import * as authController from '../../controllers/auth.controller';
import { validatePasswordPolicy, hashPassword, DEFAULT_POLICY } from '../../auth/password';
import type { JwtPayload } from '../../auth/jwt';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
jest.mock('../../services/audit.service', () => ({ auditLog: jest.fn() }));
jest.mock('../../services/notification.service', () => ({
  broadcastToAdmins: jest.fn(),
  createNotification: jest.fn(),
}));

import { query, queryOne } from '../../config/database';
const mockQuery = query as jest.Mock;
const mockQueryOne = queryOne as jest.Mock;

function mockRes() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  return res as unknown as Response;
}

const gsa: JwtPayload = {
  userId: 'admin-id', email: 'admin@test.com', username: 'admin',
  roles: ['Global Super Admin'], permissions: ['user.create'],
  projectIds: '*',
};

function buildUserRow(overrides = {}) {
  return {
    id: 'user-1', email: 'a@b.com', username: 'user1',
    first_name: 'A', last_name: 'B',
    password_hash: '', status: 'active', is_active: true,
    failed_login_count: 0, locked_until: null,
    ...overrides,
  };
}

// ── generatePassword ──────────────────────────────────────────────────────────
describe('authController.generatePassword', () => {
  it('returns a strong password nested in data', async () => {
    const res = mockRes();
    await authController.generatePassword({} as Request, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ password: expect.any(String) }) }));
  });

  it('returned password passes the default policy', async () => {
    const res = mockRes();
    await authController.generatePassword({} as Request, res);
    const { data } = (res.json as jest.Mock).mock.calls[0][0];
    expect(validatePasswordPolicy(data.password, DEFAULT_POLICY)).toBeNull();
  });
});

// ── login ─────────────────────────────────────────────────────────────────────
describe('authController.login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when body schema is invalid (missing email)', async () => {
    const req = { body: { password: 'x' } } as Request;
    const res = mockRes();
    await expect(authController.login(req, res)).rejects.toThrow();
  });

  it('returns 401 when user not found', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const req = { body: { email: 'x@x.com', password: 'Pass@123' } } as Request;
    const res = mockRes();
    await authController.login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when account is deactivated (combined invalid-credentials response)', async () => {
    const hash = await hashPassword('Pass@123');
    mockQueryOne.mockResolvedValueOnce(buildUserRow({ password_hash: hash, is_active: false }));
    const req = { body: { email: 'a@b.com', password: 'Pass@123' }, ip: '127.0.0.1', headers: {} } as Request;
    const res = mockRes();
    await authController.login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when account is locked', async () => {
    const future = new Date(Date.now() + 60_000);
    mockQueryOne.mockResolvedValueOnce(buildUserRow({ locked_until: future, is_active: true }));
    const req = { body: { email: 'a@b.com', password: 'Pass@123' } } as Request;
    const res = mockRes();
    await authController.login(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 401 for wrong password and increments failed attempts', async () => {
    const hash = await hashPassword('Correct@1');
    mockQueryOne.mockResolvedValueOnce(buildUserRow({ password_hash: hash, is_active: true }));
    mockQuery.mockResolvedValue([]);
    const req = { body: { email: 'a@b.com', password: 'Wrong@9' }, ip: '127.0.0.1', headers: {} } as Request;
    const res = mockRes();
    await authController.login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('failed_login_count'),
      expect.any(Array)
    );
  });

  it('returns 200 with tokens on successful login', async () => {
    const hash = await hashPassword('Correct@1');
    const userRow = buildUserRow({ password_hash: hash, is_active: true });
    mockQueryOne
      .mockResolvedValueOnce(userRow) // login: find user by email
      .mockResolvedValueOnce(userRow); // buildUserTokenPayload: find user by id
    mockQuery
      .mockResolvedValueOnce([]) // reset attempts + last_login_at
      .mockResolvedValueOnce([{ name: 'User' }]) // roles
      .mockResolvedValueOnce([{ name: 'estimation.read' }]) // permissions
      .mockResolvedValueOnce([{ project_id: 'p1' }]) // projects
      .mockResolvedValueOnce([]); // insert refresh token
    const req = { body: { email: 'a@b.com', password: 'Correct@1' }, ip: '127.0.0.1', headers: {} } as Request;
    const res = mockRes();
    await authController.login(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ── changePassword ────────────────────────────────────────────────────────────
describe('authController.changePassword', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    const req = { body: { currentPassword: 'Old@1', newPassword: 'New@Pass1' } } as Request;
    const res = mockRes();
    await authController.changePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('throws ZodError when required fields are missing', async () => {
    const req = { user: gsa, body: { newPassword: 'New@Pass1' } } as Request;
    const res = mockRes();
    await expect(authController.changePassword(req, res)).rejects.toThrow();
  });

  it('returns 400 when current password is wrong', async () => {
    const hash = await hashPassword('Correct@1');
    mockQueryOne.mockResolvedValueOnce({ password_hash: hash });
    const req = { user: gsa, body: { currentPassword: 'Wrong@1', newPassword: 'New@Pass2' } } as Request;
    const res = mockRes();
    await authController.changePassword(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── register ──────────────────────────────────────────────────────────────────
describe('authController.register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws ZodError when required fields are missing', async () => {
    const req = { body: {} } as Request;
    const res = mockRes();
    await expect(authController.register(req, res)).rejects.toThrow();
  });

  it('returns 409 when email already exists', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'existing' });
    const req = {
      body: { firstName: 'A', lastName: 'B', username: 'abc', email: 'a@b.com', password: 'Pass@123' },
    } as Request;
    const res = mockRes();
    await authController.register(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});
