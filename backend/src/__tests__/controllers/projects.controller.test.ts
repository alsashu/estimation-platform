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

const gsaUser: JwtPayload = {
  userId: 'gsa', email: 'gsa@test.com', username: 'gsa',
  roles: ['Global Super Admin'], permissions: ['project.create', 'project.read'],
  projectIds: '*',
};

const scopedUser: JwtPayload = {
  userId: 'scoped', email: 's@test.com', username: 'scoped',
  roles: ['User'], permissions: ['project.read'],
  projectIds: ['proj-alpha'],
};

describe('projectsController.listProjects', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns all projects for GSA', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'p1', name: 'Alpha' }])
      .mockResolvedValueOnce([{ count: '1' }]);
    const req = { user: gsaUser, query: {} } as unknown as Request;
    const res = mockRes();
    await projectsController.listProjects(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('returns empty list for user with no project access', async () => {
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
});

describe('projectsController.getProject', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 when user does not have project access', async () => {
    const req = { user: scopedUser, params: { id: 'unassigned-project' } } as unknown as Request;
    const res = mockRes();
    await projectsController.getProject(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 404 when project does not exist', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const req = { user: gsaUser, params: { id: 'unknown-id' } } as unknown as Request;
    const res = mockRes();
    await projectsController.getProject(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns project data for valid id', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'p1', name: 'Alpha', users: [] });
    const req = { user: gsaUser, params: { id: 'p1' } } as unknown as Request;
    const res = mockRes();
    await projectsController.getProject(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('projectsController.createProject', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws ZodError for missing name', async () => {
    const req = { user: gsaUser, body: {} } as Request;
    const res = mockRes();
    await expect(projectsController.createProject(req, res)).rejects.toThrow();
  });

  it('returns 409 when project name already exists', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'existing' });
    const req = { user: gsaUser, body: { name: 'Existing', code: 'EX' } } as Request;
    const res = mockRes();
    await projectsController.createProject(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('creates a project and returns 201', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce([{ id: 'new-proj' }]);
    const req = { user: gsaUser, body: { name: 'New Project', code: 'NP' } } as Request;
    const res = mockRes();
    await projectsController.createProject(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('projectsController.deleteProject', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 404 for unknown project', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const req = { user: gsaUser, params: { id: 'unknown' } } as unknown as Request;
    const res = mockRes();
    await projectsController.deleteProject(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('soft-deletes the project', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'p1' });
    mockQuery.mockResolvedValue([]);
    const req = { user: gsaUser, params: { id: 'p1' } } as unknown as Request;
    const res = mockRes();
    await projectsController.deleteProject(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockQuery.mock.calls[0][0]).toContain('deleted_at');
  });
});

describe('projectsController.assignUsers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 for non-GSA assigning to a project they do not own', async () => {
    const req = {
      user: scopedUser,
      params: { id: 'other-project' },
      body: { userIds: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'] },
    } as unknown as Request;
    const res = mockRes();
    await projectsController.assignUsers(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('assigns users successfully', async () => {
    mockQuery.mockResolvedValue([]);
    const req = {
      user: gsaUser,
      params: { id: 'p1' },
      body: { userIds: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'] },
    } as unknown as Request;
    const res = mockRes();
    await projectsController.assignUsers(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
