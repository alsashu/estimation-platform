import { Request, Response } from 'express';
import * as projectsController from '../../controllers/projects.controller';
import type { JwtPayload } from '../../auth/jwt';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
jest.mock('../../services/audit.service', () => ({ auditLog: jest.fn() }));

import { query, queryOne } from '../../config/database';
const mockQuery = query as jest.Mock;
const mockQueryOne = queryOne as jest.Mock;

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
}

const DEPT_A = '11111111-1111-1111-1111-111111111111';
const DEPT_B = '22222222-2222-2222-2222-222222222222';

const gsaUser: JwtPayload = {
  userId: 'gsa', email: 'gsa@test.com', username: 'gsa',
  roles: ['Global Super Admin'], permissions: ['project.create', 'project.read'],
  projectIds: '*', departmentIds: '*',
};

const scopedUser: JwtPayload = {
  userId: 'scoped', email: 's@test.com', username: 'scoped',
  roles: ['User'], permissions: ['project.read'],
  projectIds: ['proj-alpha'], departmentIds: [DEPT_A],
};

beforeEach(() => { mockQuery.mockReset(); mockQueryOne.mockReset(); });

describe('Program list (projectsController.listProjects)', () => {
  it('returns all programs for GSA', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'p1', name: 'Alpha' }])
      .mockResolvedValueOnce([{ count: '1' }]);
    const req = { user: gsaUser, query: {} } as unknown as Request;
    const res = mockRes();
    await projectsController.listProjects(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('returns empty list for user with no program access', async () => {
    const noProjects: JwtPayload = { ...scopedUser, projectIds: [] };
    const req = { user: noProjects, query: {} } as unknown as Request;
    const res = mockRes();
    await projectsController.listProjects(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [], total: 0, page: 1, limit: 50 });
  });

  it('scopes query for non-GSA users', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'proj-alpha', name: 'Alpha' }])
      .mockResolvedValueOnce([{ count: '1' }]);
    const req = { user: scopedUser, query: {} } as unknown as Request;
    const res = mockRes();
    await projectsController.listProjects(req, res);
    const callParams = mockQuery.mock.calls[0][1] as unknown[];
    expect(callParams).toContain(scopedUser.projectIds);
  });

  it('filters by department (multiple programs under one department)', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'p1', department_id: DEPT_A }, { id: 'p2', department_id: DEPT_A }])
      .mockResolvedValueOnce([{ count: '2' }]);
    const req = { user: gsaUser, query: { departmentId: DEPT_A } } as unknown as Request;
    const res = mockRes();
    await projectsController.listProjects(req, res);
    expect(mockQuery.mock.calls[0][0]).toContain('p.department_id =');
    expect(mockQuery.mock.calls[0][1]).toContain(DEPT_A);
    expect((res.json as jest.Mock).mock.calls[0][0].data).toHaveLength(2);
  });
});

describe('Program get (projectsController.getProject)', () => {
  it('returns 403 when user does not have program access', async () => {
    const req = { user: scopedUser, params: { id: 'unassigned-project' } } as unknown as Request;
    const res = mockRes();
    await projectsController.getProject(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 404 when program does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const req = { user: gsaUser, params: { id: 'unknown-id' } } as unknown as Request;
    const res = mockRes();
    await projectsController.getProject(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns program data with department and baselines', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'p1', name: 'Alpha', users: [], baselines: [], department_name: 'Eng' });
    const req = { user: gsaUser, params: { id: 'p1' } } as unknown as Request;
    const res = mockRes();
    await projectsController.getProject(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('Program create (projectsController.createProject)', () => {
  it('throws ZodError for missing name', async () => {
    const req = { user: gsaUser, body: { department_id: DEPT_A } } as Request;
    await expect(projectsController.createProject(req, mockRes())).rejects.toThrow();
  });

  it('prevents program creation without a department', async () => {
    const req = { user: gsaUser, body: { name: 'No Dept', code: 'ND' } } as Request;
    await expect(projectsController.createProject(req, mockRes())).rejects.toThrow(/Department is required/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 400 when the department does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const req = { user: gsaUser, body: { department_id: DEPT_A, name: 'X' } } as Request;
    const res = mockRes();
    await projectsController.createProject(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Department not found' }));
  });

  it('returns 400 when the department is inactive', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: DEPT_A, name: 'Old', status: 'inactive' });
    const req = { user: gsaUser, body: { department_id: DEPT_A, name: 'X' } } as Request;
    const res = mockRes();
    await projectsController.createProject(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 403 when a scoped user creates a program in a department they cannot access', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: DEPT_B, name: 'Other', status: 'active' });
    const req = { user: scopedUser, body: { department_id: DEPT_B, name: 'X' } } as Request;
    const res = mockRes();
    await projectsController.createProject(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 409 when program name already exists', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: DEPT_A, name: 'Eng', status: 'active' })
      .mockResolvedValueOnce({ id: 'existing' });
    const req = { user: gsaUser, body: { department_id: DEPT_A, name: 'Existing', code: 'EX' } } as Request;
    const res = mockRes();
    await projectsController.createProject(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('creates a program under the department and returns 201', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: DEPT_A, name: 'Eng', status: 'active' })
      .mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce([{ id: 'new-proj', department_id: DEPT_A }]);
    const req = { user: gsaUser, body: { department_id: DEPT_A, name: 'New Program', code: 'NP' } } as Request;
    const res = mockRes();
    await projectsController.createProject(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockQuery.mock.calls[0][1]).toContain(DEPT_A);
  });
});

describe('Program update / move (projectsController.updateProject)', () => {
  it('moves a program to another department and keeps its users\' access', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'p1', department_id: DEPT_A })          // existing program
      .mockResolvedValueOnce({ id: DEPT_B, name: 'B', status: 'active' }); // target department
    mockQuery.mockResolvedValue([{ id: 'p1', department_id: DEPT_B }]);
    const req = { user: gsaUser, params: { id: 'p1' }, body: { department_id: DEPT_B } } as unknown as Request;
    const res = mockRes();
    await projectsController.updateProject(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    const sqls = mockQuery.mock.calls.map(c => c[0] as string);
    expect(sqls.some(s => s.includes('INSERT INTO user_departments'))).toBe(true);
  });

  it('returns 403 when a scoped user updates a program they cannot access', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'other', department_id: DEPT_A });
    const req = { user: scopedUser, params: { id: 'other' }, body: { name: 'X' } } as unknown as Request;
    const res = mockRes();
    await projectsController.updateProject(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('Program delete (projectsController.deleteProject)', () => {
  it('returns 404 for unknown program', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const req = { user: gsaUser, params: { id: 'unknown' } } as unknown as Request;
    const res = mockRes();
    await projectsController.deleteProject(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('soft-deletes the program', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'p1' });
    mockQuery.mockResolvedValue([]);
    const req = { user: gsaUser, params: { id: 'p1' } } as unknown as Request;
    const res = mockRes();
    await projectsController.deleteProject(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockQuery.mock.calls[0][0]).toContain('deleted_at');
  });
});

describe('Program user assignment (projectsController.assignUsers)', () => {
  it('returns 403 for non-GSA assigning to a program they do not own', async () => {
    const req = {
      user: scopedUser,
      params: { id: 'other-project' },
      body: { userIds: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'] },
    } as unknown as Request;
    const res = mockRes();
    await projectsController.assignUsers(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('assigns users and grants membership of the parent department', async () => {
    mockQueryOne.mockResolvedValueOnce({ department_id: DEPT_A });
    mockQuery.mockResolvedValue([]);
    const req = {
      user: gsaUser,
      params: { id: 'p1' },
      body: { userIds: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'] },
    } as unknown as Request;
    const res = mockRes();
    await projectsController.assignUsers(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    const deptInsert = mockQuery.mock.calls.find(c => (c[0] as string).includes('INSERT INTO user_departments'));
    expect(deptInsert?.[1]).toEqual(['a1b2c3d4-e5f6-7890-abcd-ef1234567890', DEPT_A, 'gsa']);
  });
});
