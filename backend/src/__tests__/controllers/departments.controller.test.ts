import { Request, Response } from 'express';
import type { JwtPayload } from '../../auth/jwt';
import * as ctrl from '../../controllers/departments.controller';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
jest.mock('../../services/audit.service', () => ({ auditLog: jest.fn() }));
import { query, queryOne } from '../../config/database';

const mockQuery = query as jest.Mock;
const mockQueryOne = queryOne as jest.Mock;

const D1 = '11111111-1111-1111-1111-111111111111';
const D2 = '22222222-2222-2222-2222-222222222222';
const U1 = '99999999-9999-9999-9999-999999999999';

const gsa: JwtPayload = { userId: 'g', email: 'g@x', username: 'g', roles: ['Global Super Admin'], permissions: [], projectIds: '*', departmentIds: '*' };
const scoped: JwtPayload = { userId: 's', email: 's@x', username: 's', roles: ['Admin'], permissions: [], projectIds: ['p1'], departmentIds: [D1] };

const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response);
const req = (user: JwtPayload | undefined, extra: Partial<Request> = {}) =>
  ({ user, query: {}, params: {}, body: {}, headers: {}, ...extra } as unknown as Request);

beforeEach(() => { mockQuery.mockReset(); mockQueryOne.mockReset(); });

describe('listDepartments', () => {
  it('lists all departments for global users', async () => {
    mockQuery.mockResolvedValueOnce([{ id: D1 }, { id: D2 }]);
    const r = res();
    await ctrl.listDepartments(req(gsa), r);
    expect(r.json).toHaveBeenCalledWith({ success: true, data: [{ id: D1 }, { id: D2 }], total: 2 });
    expect(mockQuery.mock.calls[0][1]).toEqual([]);
  });

  it('restricts scoped users to their departments', async () => {
    mockQuery.mockResolvedValueOnce([{ id: D1 }]);
    await ctrl.listDepartments(req(scoped), res());
    expect(mockQuery.mock.calls[0][1]).toEqual([[D1]]);
  });

  it('returns empty for users without departments', async () => {
    const r = res();
    await ctrl.listDepartments(req({ ...scoped, departmentIds: [] }), r);
    expect(r.json).toHaveBeenCalledWith({ success: true, data: [], total: 0 });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('getDepartment', () => {
  it('returns 403 for a department the user cannot access', async () => {
    const r = res();
    await ctrl.getDepartment(req(scoped, { params: { id: D2 } as never }), r);
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('returns 404 when not found', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const r = res();
    await ctrl.getDepartment(req(gsa, { params: { id: D1 } as never }), r);
    expect(r.status).toHaveBeenCalledWith(404);
  });

  it('returns the department with only accessible programs for scoped users', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: D1, name: 'Eng' });
    mockQuery.mockResolvedValueOnce([{ id: 'p1' }]);
    const r = res();
    await ctrl.getDepartment(req(scoped, { params: { id: D1 } as never }), r);
    expect(mockQuery.mock.calls[0][1]).toEqual([D1, ['p1']]);
    expect(r.json).toHaveBeenCalledWith({ success: true, data: { id: D1, name: 'Eng', programs: [{ id: 'p1' }] } });
  });
});

describe('createDepartment', () => {
  it('validates required fields', async () => {
    await expect(ctrl.createDepartment(req(gsa, { body: { name: 'Eng' } }), res())).rejects.toThrow();
    await expect(ctrl.createDepartment(req(gsa, { body: { name: 'Eng', code: 'bad code!' } }), res())).rejects.toThrow();
  });

  it('returns 409 on duplicate name or code', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: D2 });
    const r = res();
    await ctrl.createDepartment(req(gsa, { body: { name: 'Eng', code: 'ENG' } }), r);
    expect(r.status).toHaveBeenCalledWith(409);
  });

  it('creates a department (201) and stores created_by', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce([{ id: D1, name: 'Eng', code: 'ENG' }]);
    const r = res();
    await ctrl.createDepartment(req(gsa, { body: { name: 'Eng', code: 'eng', description: 'x' } }), r);
    expect(r.status).toHaveBeenCalledWith(201);
    expect(mockQuery.mock.calls[0][1]).toEqual(['Eng', 'eng', 'x', 'active', 'g']);
    expect(mockQuery).toHaveBeenCalledTimes(1); // global creator: no self-assignment
  });

  it('gives a non-global creator department-level access', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce([{ id: D2 }]).mockResolvedValueOnce([]);
    await ctrl.createDepartment(req(scoped, { body: { name: 'Ops', code: 'OPS' } }), res());
    expect(mockQuery.mock.calls[1][0]).toContain("'all'");
    expect(mockQuery.mock.calls[1][1]).toEqual(['s', D2]);
  });
});

describe('updateDepartment', () => {
  it('returns 403 without department access', async () => {
    const r = res();
    await ctrl.updateDepartment(req(scoped, { params: { id: D2 } as never, body: { name: 'X' } }), r);
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('returns 404 when missing', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const r = res();
    await ctrl.updateDepartment(req(gsa, { params: { id: D1 } as never, body: { name: 'X' } }), r);
    expect(r.status).toHaveBeenCalledWith(404);
  });

  it('refuses to change the code of the system department', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: D1, name: 'Unassigned', code: 'UNASSIGNED', is_system: true });
    const r = res();
    await ctrl.updateDepartment(req(gsa, { params: { id: D1 } as never, body: { code: 'NEW' } }), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('returns 409 on duplicate', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: D1, name: 'Eng', code: 'ENG', is_system: false })
      .mockResolvedValueOnce({ id: D2 });
    const r = res();
    await ctrl.updateDepartment(req(gsa, { params: { id: D1 } as never, body: { name: 'Ops' } }), r);
    expect(r.status).toHaveBeenCalledWith(409);
  });

  it('updates the department', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: D1, name: 'Eng', code: 'ENG', is_system: false })
      .mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce([{ id: D1, name: 'Engineering' }]);
    const r = res();
    await ctrl.updateDepartment(req(gsa, { params: { id: D1 } as never, body: { name: 'Engineering' } }), r);
    expect(r.json).toHaveBeenCalledWith({ success: true, data: { id: D1, name: 'Engineering' } });
  });
});

describe('setDepartmentStatus', () => {
  it('rejects invalid status values', async () => {
    await expect(ctrl.setDepartmentStatus(req(gsa, { params: { id: D1 } as never, body: { status: 'deleted' } }), res())).rejects.toThrow();
  });

  it('deactivates and reactivates', async () => {
    for (const status of ['inactive', 'active']) {
      mockQueryOne.mockResolvedValueOnce({ id: D1 });
      mockQuery.mockResolvedValueOnce([{ id: D1, status }]);
      const r = res();
      await ctrl.setDepartmentStatus(req(gsa, { params: { id: D1 } as never, body: { status } }), r);
      expect(r.json).toHaveBeenCalledWith({ success: true, data: { id: D1, status } });
    }
  });
});

describe('department user assignment', () => {
  it('assigns users with the requested access scope', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: D1 });
    mockQuery.mockResolvedValue([]);
    const r = res();
    await ctrl.assignDepartmentUsers(req(gsa, { params: { id: D1 } as never, body: { userIds: [U1], access_scope: 'all' } }), r);
    expect(mockQuery.mock.calls[0][1]).toEqual([U1, D1, 'all', 'g']);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('blocks assignment into departments outside the admin\'s access', async () => {
    const r = res();
    await ctrl.assignDepartmentUsers(req(scoped, { params: { id: D2 } as never, body: { userIds: [U1] } }), r);
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('removing a user also removes their program assignments in that department', async () => {
    mockQuery.mockResolvedValue([]);
    await ctrl.removeDepartmentUser(req(gsa, { params: { id: D1, userId: U1 } as never }), res());
    expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM project_users');
    expect(mockQuery.mock.calls[1][0]).toContain('DELETE FROM user_departments');
  });
});
