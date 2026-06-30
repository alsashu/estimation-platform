import { Request, Response } from 'express';
import * as usersController from '../../controllers/users.controller';
import type { JwtPayload } from '../../auth/jwt';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
jest.mock('../../services/audit.service', () => ({ auditLog: jest.fn() }));
jest.mock('../../services/notification.service', () => ({ createNotification: jest.fn() }));
jest.mock('../../auth/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
  validatePasswordPolicy: jest.fn().mockReturnValue(null),
  DEFAULT_POLICY: { minLength: 8 },
}));

import { query, queryOne } from '../../config/database';
const mockQuery = query as jest.Mock;
const mockQueryOne = queryOne as jest.Mock;

// resetAllMocks between each test to prevent queue contamination across test runs
beforeEach(() => {
  jest.resetAllMocks();
  // Re-apply persistent mocks that are reset by resetAllMocks
  (require('../../auth/password').hashPassword as jest.Mock).mockResolvedValue('hashed');
  (require('../../auth/password').validatePasswordPolicy as jest.Mock).mockReturnValue(null);
});

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
}

const gsaUser: JwtPayload = {
  userId: 'gsa-id', email: 'gsa@test.com', username: 'gsa',
  roles: ['Global Super Admin'], permissions: ['user.create', 'user.read', 'user.update', 'user.delete'],
  projectIds: '*',
};

const PROJ_1 = '11111111-1111-1111-1111-111111111111';
const PROJ_2 = '22222222-2222-2222-2222-222222222222';
const PROJ_3 = '33333333-3333-3333-3333-333333333333'; // out-of-scope project
const SA_ROLE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const adminUser: JwtPayload = {
  userId: 'admin-id', email: 'admin@test.com', username: 'admin',
  roles: ['Admin'], permissions: ['user.create', 'user.read', 'user.update', 'user.delete', 'user.activate'],
  projectIds: [PROJ_1, PROJ_2],
};

// ── listUsers ─────────────────────────────────────────────────────────────────
describe('usersController.listUsers', () => {
  it('returns paginated user list for GSA (no scoping)', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'u1', first_name: 'John', roles: [], projects: [] }])
      .mockResolvedValueOnce([{ count: '1' }]);
    const req = { user: gsaUser, query: {} } as unknown as Request;
    const res = mockRes();
    await usersController.listUsers(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, total: 1 }));
  });

  it('returns empty list when no users', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: '0' }]);
    const req = { user: gsaUser, query: {} } as unknown as Request;
    const res = mockRes();
    await usersController.listUsers(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [], total: 0 }));
  });

  it('Admin list query includes SA-exclusion and created_by scoping params', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: '0' }]);
    const req = { user: adminUser, query: {} } as unknown as Request;
    const res = mockRes();
    await usersController.listUsers(req, res);

    // Both query calls should pass adminUser.userId as a parameter for scoping
    const firstCallParams = mockQuery.mock.calls[0][1] as unknown[];
    expect(firstCallParams).toContain('admin-id');
    // SA_ROLES array should be passed as one of the parameters
    expect(firstCallParams.some(p => Array.isArray(p) && p.includes('Global Super Admin'))).toBe(true);
  });
});

// ── getUser ───────────────────────────────────────────────────────────────────
describe('usersController.getUser', () => {
  it('GSA: returns user data for valid id', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'u1', first_name: 'John', roles: [], projects: [] });
    const req = { user: gsaUser, params: { id: 'u1' } } as unknown as Request;
    const res = mockRes();
    await usersController.getUser(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('GSA: returns 404 for unknown user', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const req = { user: gsaUser, params: { id: 'nonexistent' } } as unknown as Request;
    const res = mockRes();
    await usersController.getUser(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('Admin: returns 403 when target is a Super Admin', async () => {
    // getTargetMeta (queryOne) returns a SA user
    mockQueryOne.mockResolvedValueOnce({ created_by: 'other', roles: ['Global Super Admin'] });
    const req = { user: adminUser, params: { id: 'sa-user' } } as unknown as Request;
    const res = mockRes();
    await usersController.getUser(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('Admin: returns 404 when meta is null', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const req = { user: adminUser, params: { id: 'ghost' } } as unknown as Request;
    const res = mockRes();
    await usersController.getUser(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('Admin: can view normal user (meta check passes, then main query)', async () => {
    // First queryOne = getTargetMeta (non-SA user)
    mockQueryOne.mockResolvedValueOnce({ created_by: 'admin-id', roles: ['User'] });
    // Second queryOne = main getUser query
    mockQueryOne.mockResolvedValueOnce({ id: 'u1', first_name: 'Bob', roles: [], projects: [] });
    const req = { user: adminUser, params: { id: 'u1' } } as unknown as Request;
    const res = mockRes();
    await usersController.getUser(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ── createUser ────────────────────────────────────────────────────────────────
describe('usersController.createUser', () => {
  it('throws ZodError for missing required fields', async () => {
    const req = { user: gsaUser, body: { email: 'x@x.com' } } as Request;
    const res = mockRes();
    await expect(usersController.createUser(req, res)).rejects.toThrow();
  });

  it('returns 409 when email already exists', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'existing' });
    const req = {
      user: gsaUser,
      body: { firstName: 'J', lastName: 'D', username: 'jd_user', email: 'j@d.com', password: 'Pass@123', roleIds: [] },
    } as Request;
    const res = mockRes();
    await usersController.createUser(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 201 when user is created successfully', async () => {
    mockQueryOne.mockResolvedValueOnce(null); // no email conflict
    mockQuery
      .mockResolvedValueOnce([{ id: 'new-user' }]) // INSERT user
      .mockResolvedValue([]); // password history / role / project inserts
    const req = {
      user: gsaUser,
      body: {
        firstName: 'J', lastName: 'D', username: 'jd_test2',
        email: 'jd2@test.com', password: 'Pass@123',
        roleIds: [], projectIds: [],
      },
    } as Request;
    const res = mockRes();
    await usersController.createUser(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('Admin: returns 403 when trying to assign SA role', async () => {
    mockQueryOne.mockResolvedValueOnce(null); // no email conflict
    mockQuery.mockResolvedValueOnce([{ id: SA_ROLE }]); // SA roles found in DB
    const req = {
      user: adminUser,
      body: {
        firstName: 'J', lastName: 'D', username: 'jd_u3', email: 'jd3@test.com',
        password: 'Pass@123', roleIds: [SA_ROLE], projectIds: [],
      },
    } as Request;
    const res = mockRes();
    await usersController.createUser(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('Admin: returns 403 when assigning project outside own scope', async () => {
    mockQueryOne.mockResolvedValueOnce(null); // no email conflict
    mockQuery.mockResolvedValueOnce([]); // no SA roles among requested
    const req = {
      user: adminUser, // has projectIds: [PROJ_1, PROJ_2]
      body: {
        firstName: 'J', lastName: 'D', username: 'jd_u4', email: 'jd4@test.com',
        password: 'Pass@123', roleIds: [], projectIds: [PROJ_3], // not in admin scope
      },
    } as Request;
    const res = mockRes();
    await usersController.createUser(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── updateUser ────────────────────────────────────────────────────────────────
describe('usersController.updateUser', () => {
  it('Admin: returns 403 when target is a Super Admin', async () => {
    mockQueryOne.mockResolvedValueOnce({ created_by: 'other', roles: ['Global Super Admin'] });
    const req = {
      user: adminUser, params: { id: 'sa-user' },
      body: { firstName: 'Hacked' },
    } as unknown as Request;
    const res = mockRes();
    await usersController.updateUser(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('Admin: returns 403 when target was not created by this admin', async () => {
    mockQueryOne.mockResolvedValueOnce({ created_by: 'other-admin', roles: ['User'] });
    const req = {
      user: adminUser, params: { id: 'other-admin-user' },
      body: { firstName: 'Changed' },
    } as unknown as Request;
    const res = mockRes();
    await usersController.updateUser(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('Admin: returns 403 when assigning out-of-scope project', async () => {
    // getTargetMeta: owned user (project scope check fires before existence query)
    mockQueryOne.mockResolvedValueOnce({ created_by: 'admin-id', roles: ['User'] });
    const req = {
      user: adminUser, params: { id: 'target-user' },
      body: { projectIds: [PROJ_3] }, // PROJ_3 is not in adminUser's scope
    } as unknown as Request;
    const res = mockRes();
    await usersController.updateUser(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('GSA: can update any user without restriction', async () => {
    // GSA skips meta check; goes straight to existing query
    mockQueryOne.mockResolvedValueOnce({ id: 'u1', first_name: 'Old' }); // existing
    mockQuery.mockResolvedValueOnce([]); // update
    mockQueryOne.mockResolvedValueOnce({ id: 'u1', first_name: 'New', roles: [], projects: [] }); // return
    const req = {
      user: gsaUser, params: { id: 'u1' },
      body: { firstName: 'New' },
    } as unknown as Request;
    const res = mockRes();
    await usersController.updateUser(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ── deleteUser ────────────────────────────────────────────────────────────────
describe('usersController.deleteUser', () => {
  it('returns 400 when trying to delete self (no DB call needed)', async () => {
    // Self-check is evaluated before any DB query — no mock needed
    const req = { user: gsaUser, params: { id: gsaUser.userId } } as unknown as Request;
    const res = mockRes();
    await usersController.deleteUser(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it('GSA: returns 404 for unknown user', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const req = { user: gsaUser, params: { id: 'other-user' } } as unknown as Request;
    const res = mockRes();
    await usersController.deleteUser(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('GSA: soft-deletes the user', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'other-user' });
    mockQuery.mockResolvedValue([]);
    const req = { user: gsaUser, params: { id: 'other-user' } } as unknown as Request;
    const res = mockRes();
    await usersController.deleteUser(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('deleted_at'), expect.any(Array));
  });

  it('Admin: returns 403 when target is a Super Admin', async () => {
    mockQueryOne.mockResolvedValueOnce({ created_by: 'other', roles: ['Global Super Admin'] });
    const req = { user: adminUser, params: { id: 'sa-user' } } as unknown as Request;
    const res = mockRes();
    await usersController.deleteUser(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('Admin: returns 403 when target not created by this admin', async () => {
    mockQueryOne.mockResolvedValueOnce({ created_by: 'different-admin', roles: ['User'] });
    const req = { user: adminUser, params: { id: 'other-admins-user' } } as unknown as Request;
    const res = mockRes();
    await usersController.deleteUser(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('Admin: can delete own user', async () => {
    // getTargetMeta: owned by this admin
    mockQueryOne.mockResolvedValueOnce({ created_by: 'admin-id', roles: ['User'] });
    // existence check
    mockQueryOne.mockResolvedValueOnce({ id: 'my-user' });
    mockQuery.mockResolvedValue([]);
    const req = { user: adminUser, params: { id: 'my-user' } } as unknown as Request;
    const res = mockRes();
    await usersController.deleteUser(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ── setUserActive ─────────────────────────────────────────────────────────────
describe('usersController.setUserActive', () => {
  it('GSA: returns 404 for unknown user', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const req = { user: gsaUser, params: { id: 'x' }, body: { active: false } } as unknown as Request;
    const res = mockRes();
    await usersController.setUserActive(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('GSA: toggles user active status', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'u1' });
    mockQuery.mockResolvedValue([]);
    const req = { user: gsaUser, params: { id: 'u1' }, body: { active: false } } as unknown as Request;
    const res = mockRes();
    await usersController.setUserActive(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('Admin: returns 403 when target is a Super Admin', async () => {
    mockQueryOne.mockResolvedValueOnce({ created_by: 'other', roles: ['Scoped Super Admin'] });
    const req = { user: adminUser, params: { id: 'sa-user' }, body: { active: false } } as unknown as Request;
    const res = mockRes();
    await usersController.setUserActive(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('Admin: returns 403 when target not created by this admin', async () => {
    mockQueryOne.mockResolvedValueOnce({ created_by: 'other-admin', roles: ['User'] });
    const req = { user: adminUser, params: { id: 'alien-user' }, body: { active: true } } as unknown as Request;
    const res = mockRes();
    await usersController.setUserActive(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('Admin: can toggle own created user', async () => {
    // getTargetMeta: owned by this admin
    mockQueryOne.mockResolvedValueOnce({ created_by: 'admin-id', roles: ['User'] });
    // existence check
    mockQueryOne.mockResolvedValueOnce({ id: 'my-user' });
    mockQuery.mockResolvedValue([]);
    const req = { user: adminUser, params: { id: 'my-user' }, body: { active: false } } as unknown as Request;
    const res = mockRes();
    await usersController.setUserActive(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
