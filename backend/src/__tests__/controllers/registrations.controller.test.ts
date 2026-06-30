import { Request, Response } from 'express';
import * as regsController from '../../controllers/registrations.controller';
import type { JwtPayload } from '../../auth/jwt';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
jest.mock('../../services/audit.service', () => ({ auditLog: jest.fn() }));
jest.mock('../../services/notification.service', () => ({
  createNotification: jest.fn(),
  broadcastToAdmins: jest.fn(),
}));
jest.mock('../../auth/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
}));

import { query, queryOne } from '../../config/database';
const mockQuery = query as jest.Mock;
const mockQueryOne = queryOne as jest.Mock;

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
}

const adminUser: JwtPayload = {
  userId: 'admin-1', email: 'admin@test.com', username: 'admin',
  roles: ['Admin'], permissions: ['registration.approve'],
  projectIds: ['proj-1'],
};

describe('registrationsController.listRegistrations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    const req = { query: {} } as unknown as Request;
    const res = mockRes();
    await regsController.listRegistrations(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns registrations for admin', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'r1', email: 'x@x.com', status: 'pending' }])
      .mockResolvedValueOnce([{ count: '1' }]);
    const req = { user: adminUser, query: {} } as unknown as Request;
    const res = mockRes();
    await regsController.listRegistrations(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('registrationsController.getPendingCount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns pending count for admin (nested in data field)', async () => {
    mockQuery.mockResolvedValueOnce([{ count: '3' }]);
    const req = { user: adminUser } as Request;
    const res = mockRes();
    await regsController.getPendingCount(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { count: 3 } });
  });

  it('returns 401 when not authenticated', async () => {
    const req = {} as Request;
    const res = mockRes();
    await regsController.getPendingCount(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 0 when no pending requests', async () => {
    mockQuery.mockResolvedValueOnce([{ count: '0' }]);
    const req = { user: adminUser } as Request;
    const res = mockRes();
    await regsController.getPendingCount(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { count: 0 } });
  });
});

describe('registrationsController.approveRegistration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 404 for unknown registration', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const req = { user: adminUser, params: { id: 'x' }, body: {} } as unknown as Request;
    const res = mockRes();
    await regsController.approveRegistration(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 if already processed (not pending)', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'r1', status: 'approved', password_hash: 'h' });
    const req = { user: adminUser, params: { id: 'r1' }, body: {} } as unknown as Request;
    const res = mockRes();
    await regsController.approveRegistration(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('approves a pending registration and creates user', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'r1', status: 'pending', email: 'new@test.com',
      first_name: 'New', last_name: 'User', username: 'newuser',
      password_hash: 'h', requested_project_id: 'proj-1', requested_role_id: 'role-1',
    });
    mockQuery
      .mockResolvedValueOnce([{ id: 'new-user-id' }])
      .mockResolvedValue([]);
    const req = { user: adminUser, params: { id: 'r1' }, body: {} } as unknown as Request;
    const res = mockRes();
    await regsController.approveRegistration(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('registrationsController.rejectRegistration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 404 for unknown registration', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const req = { user: adminUser, params: { id: 'x' }, body: { reason: 'No' } } as unknown as Request;
    const res = mockRes();
    await regsController.rejectRegistration(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 if not pending', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'r1', status: 'approved' });
    const req = { user: adminUser, params: { id: 'r1' }, body: { reason: 'No' } } as unknown as Request;
    const res = mockRes();
    await regsController.rejectRegistration(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects a pending registration', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'r1', status: 'pending', email: 'x@x.com', first_name: 'X' });
    mockQuery.mockResolvedValue([]);
    const req = { user: adminUser, params: { id: 'r1' }, body: { reason: 'Not eligible' } } as unknown as Request;
    const res = mockRes();
    await regsController.rejectRegistration(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
