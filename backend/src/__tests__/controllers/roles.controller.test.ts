import { Request, Response } from 'express';
import * as rolesController from '../../controllers/roles.controller';
import type { JwtPayload } from '../../auth/jwt';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
jest.mock('../../services/audit.service', () => ({ auditLog: jest.fn() }));

import { query, queryOne } from '../../config/database';
const mockQuery = query as jest.Mock;
const mockQueryOne = queryOne as jest.Mock;

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
}

const adminUser: JwtPayload = {
  userId: 'admin-1', email: 'admin@test.com', username: 'admin',
  roles: ['Global Super Admin'], permissions: ['role.manage'],
  projectIds: '*',
};

describe('rolesController.listRoles', () => {
  it('returns roles list', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'r1', name: 'User', permissions: [], user_count: 5 }]);
    const req = {} as Request;
    const res = mockRes();
    await rolesController.listRoles(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('rolesController.getRole', () => {
  it('returns 404 for unknown role', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const req = { params: { id: 'unknown' } } as unknown as Request;
    const res = mockRes();
    await rolesController.getRole(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns role with permissions', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'r1', name: 'User', permissions: [] });
    const req = { params: { id: 'r1' } } as unknown as Request;
    const res = mockRes();
    await rolesController.getRole(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('rolesController.createRole', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    const req = { body: { name: 'NewRole' } } as Request;
    const res = mockRes();
    await rolesController.createRole(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 409 when role name already exists', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'existing' });
    const req = { user: adminUser, body: { name: 'Existing' } } as Request;
    const res = mockRes();
    await rolesController.createRole(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('creates a role and returns 201', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce([{ id: 'new-role' }]);
    const req = { user: adminUser, body: { name: 'NewRole', permissionIds: [] } } as Request;
    const res = mockRes();
    await rolesController.createRole(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('rolesController.deleteRole', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 for system roles', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'r1', is_system: true });
    const req = { user: adminUser, params: { id: 'r1' } } as unknown as Request;
    const res = mockRes();
    await rolesController.deleteRole(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('deletes a non-system role', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'custom-r', is_system: false });
    mockQuery.mockResolvedValue([]);
    const req = { user: adminUser, params: { id: 'custom-r' } } as unknown as Request;
    const res = mockRes();
    await rolesController.deleteRole(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('rolesController.listPermissions', () => {
  it('returns permissions list', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'p1', name: 'estimation.read', module: 'estimation' }]);
    const req = {} as Request;
    const res = mockRes();
    await rolesController.listPermissions(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
