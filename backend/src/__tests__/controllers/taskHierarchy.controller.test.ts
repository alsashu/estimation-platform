/**
 * Storypoint (SP) and Parametric (PE) task creation share one hierarchy/permission model.
 * The same scenarios run against both controllers; the calculation engines are mocked so these tests
 * prove the engines are untouched by hierarchy handling.
 */
import { Request, Response } from 'express';
import type { JwtPayload } from '../../auth/jwt';
import * as sp from '../../controllers/estimations.controller';
import * as pe from '../../controllers/parametricEstimations.controller';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
jest.mock('../../services/estimationEngine', () => ({
  runFullEstimation: jest.fn().mockResolvedValue({
    story_points: 5, initial_min_days: 1, initial_max_days: 2, initial_min_hours: 8, initial_max_hours: 16,
    overhead_percent: 0.1, revised_min_days: 1.1, revised_max_days: 2.2, revised_min_hours: 8.8, revised_max_hours: 17.6,
  }),
}));
jest.mock('../../services/parametricEngine', () => {
  const actual = jest.requireActual('../../services/parametricEngine');
  return {
    ...actual,
    resolveProjectParametricConfig: jest.fn().mockResolvedValue({ average: {}, expert: {} }),
    calculateParametric: jest.fn().mockReturnValue({
      multiplier: 1, detailed_estimation: 70, average_estimation: 68, final_estimation: 70,
      expert_config: { id: 'ec', name: 'ASW', values: [] }, average_config: { id: 'ac', name: 'Std' }, breakdown: [],
    }),
  };
});

import { query, queryOne } from '../../config/database';
import { resolveProjectParametricConfig } from '../../services/parametricEngine';
const mockQuery = query as jest.Mock;
const mockQueryOne = queryOne as jest.Mock;

const D1 = '11111111-1111-1111-1111-111111111111';
const D2 = '22222222-2222-2222-2222-222222222222';
const P1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const P2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const B1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const C1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const S1 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const T1 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const user: JwtPayload = { userId: 'u', email: 'u@x', username: 'u', roles: ['User'], permissions: [], projectIds: [P1], departmentIds: [D1] };
const gsa: JwtPayload = { userId: 'g', email: 'g@x', username: 'g', roles: ['Global Super Admin'], permissions: [], projectIds: '*', departmentIds: '*' };

const dept = { id: D1, name: 'Engineering', status: 'active' };
const prog = { id: P1, name: 'Alpha', status: 'active', department_id: D1 };
const base = { id: B1, name: 'R1', status: 'active', project_id: P1 };
const comp = { id: C1, name: 'API', baseline_id: B1 };
const sub  = { id: S1, name: 'Auth', component_id: C1 };

const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response);
const req = (u: JwtPayload | undefined, extra: Partial<Request> = {}) =>
  ({ user: u, query: {}, params: {}, body: {}, headers: {}, ...extra } as unknown as Request);

const spBody = { title: 'Login', complexity: 'Low', risk: 'Low', competency: 'Expert', work_group: 'DEVELOPMENT' };
const peBody = {
  task_title: 'API', middleware_inputs: 'Small', application: 'Medium', system_configuration: 'NA',
  data_and_control_flow: 'Small', use_case: 'Large', team_efficiency: 1,
};

beforeEach(() => { mockQuery.mockReset(); mockQueryOne.mockReset(); });

const MODULES = [
  { name: 'Storypoint Estimation', create: sp.create, body: spBody, table: 'INSERT INTO estimations' },
  { name: 'Parametric Estimation', create: pe.create, body: peBody, table: 'INSERT INTO parametric_estimations' },
] as const;

describe.each(MODULES)('$name task creation with hierarchy', ({ create, body, table }) => {
  const insertCall = () => mockQuery.mock.calls.find(c => String(c[0]).includes(table))!;

  it('creates a task with Department, Program and Baseline only', async () => {
    mockQueryOne.mockResolvedValueOnce(dept).mockResolvedValueOnce(prog).mockResolvedValueOnce(base);
    mockQuery.mockResolvedValue([{ id: T1 }]);
    const r = res();
    await create(req(user, { body: { ...body, department_id: D1, program_id: P1, baseline_id: B1 } }), r);
    expect(r.status).toHaveBeenCalledWith(201);
    const params = insertCall()[1] as unknown[];
    expect(params).toEqual(expect.arrayContaining([P1, D1, B1, 'Alpha']));
    expect(r.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ component_id: null, subcomponent_id: null }) });
  });

  it('creates a task with an optional Component', async () => {
    mockQueryOne.mockResolvedValueOnce(dept).mockResolvedValueOnce(prog).mockResolvedValueOnce(base).mockResolvedValueOnce(comp);
    mockQuery.mockResolvedValue([{ id: T1 }]);
    const r = res();
    await create(req(user, { body: { ...body, department_id: D1, program_id: P1, baseline_id: B1, component_id: C1 } }), r);
    expect(r.status).toHaveBeenCalledWith(201);
    expect(insertCall()[1]).toEqual(expect.arrayContaining([C1]));
  });

  it('creates a task with an optional Subcomponent', async () => {
    mockQueryOne.mockResolvedValueOnce(dept).mockResolvedValueOnce(prog).mockResolvedValueOnce(base)
      .mockResolvedValueOnce(comp).mockResolvedValueOnce(sub);
    mockQuery.mockResolvedValue([{ id: T1 }]);
    const r = res();
    await create(req(user, { body: { ...body, department_id: D1, program_id: P1, baseline_id: B1, component_id: C1, subcomponent_id: S1 } }), r);
    expect(r.status).toHaveBeenCalledWith(201);
    expect(insertCall()[1]).toEqual(expect.arrayContaining([C1, S1]));
  });

  it('accepts the legacy project_id field as the program', async () => {
    mockQueryOne.mockResolvedValueOnce(dept).mockResolvedValueOnce(prog).mockResolvedValueOnce(base);
    mockQuery.mockResolvedValue([{ id: T1 }]);
    const r = res();
    await create(req(user, { body: { ...body, department_id: D1, project_id: P1, baseline_id: B1 } }), r);
    expect(r.status).toHaveBeenCalledWith(201);
  });

  it('rejects a task with no hierarchy (Department, Program, Baseline are mandatory)', async () => {
    await expect(create(req(user, { body }), res())).rejects.toThrow('Department is required');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an invalid hierarchy combination (program from another department)', async () => {
    mockQueryOne.mockResolvedValueOnce(dept).mockResolvedValueOnce({ ...prog, department_id: D2 });
    await expect(create(req(gsa, { body: { ...body, department_id: D1, program_id: P1, baseline_id: B1 } }), res()))
      .rejects.toThrow(/does not belong to Department/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects an unauthorised program with 403 (backend authorisation)', async () => {
    mockQueryOne.mockResolvedValueOnce(dept).mockResolvedValueOnce({ ...prog, id: P2 });
    await expect(create(req(user, { body: { ...body, department_id: D1, program_id: P2, baseline_id: B1 } }), res()))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects malformed hierarchy ids', async () => {
    await expect(create(req(user, { body: { ...body, department_id: 'x', program_id: P1, baseline_id: B1 } }), res())).rejects.toThrow();
  });
});

describe('PE uses the program to resolve master data (engine itself unchanged)', () => {
  it('passes the validated program id to resolveProjectParametricConfig', async () => {
    mockQueryOne.mockResolvedValueOnce(dept).mockResolvedValueOnce(prog).mockResolvedValueOnce(base);
    mockQuery.mockResolvedValue([{ id: T1 }]);
    await pe.create(req(user, { body: { ...peBody, department_id: D1, program_id: P1, baseline_id: B1 } }), res());
    expect(resolveProjectParametricConfig).toHaveBeenCalledWith(P1);
  });
});

describe.each([
  { name: 'SP', getAll: sp.getAll, table: 'estimations' },
  { name: 'PE', getAll: pe.getAll, table: 'parametric_estimations' },
])('$name list filtering', ({ getAll }) => {
  it('applies department / program / baseline filters with access scoping', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: '0' }]);
    await getAll(req(user, { query: { departmentId: D1, programId: P1, baselineId: B1 } as never }), res());
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('e.project_id = ANY(');
    expect(sql).toContain('e.department_id =');
    expect(sql).toContain('e.baseline_id =');
    expect(params).toEqual(expect.arrayContaining([[P1], D1, P1, B1]));
  });

  it('returns no rows for an unauthorised department', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: '0' }]);
    await getAll(req(user, { query: { departmentId: D2 } as never }), res());
    expect(mockQuery.mock.calls[0][0]).toContain('1=0');
  });
});

describe('task updates and hierarchy re-assignment', () => {
  it('SP: re-validates the hierarchy when moving a task', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ project_id: null })     // existing legacy row (GSA can access)
      .mockResolvedValueOnce(dept).mockResolvedValueOnce(prog).mockResolvedValueOnce(base)
      .mockResolvedValueOnce({ id: T1, project_id: P1 }); // re-read
    mockQuery.mockResolvedValue([]);
    const r = res();
    await sp.update(req(gsa, { params: { id: T1 } as never, body: { department_id: D1, program_id: P1, baseline_id: B1 } }), r);
    expect(mockQuery.mock.calls[0][0]).toContain('baseline_id=');
    expect(r.json).toHaveBeenCalledWith({ success: true, data: { id: T1, project_id: P1 } });
  });

  it('SP: blocks updates to tasks of other programs', async () => {
    mockQueryOne.mockResolvedValueOnce({ project_id: P2 });
    await expect(sp.update(req(user, { params: { id: T1 } as never, body: { title: 'x' } }), res())).rejects.toMatchObject({ statusCode: 403 });
  });

  it('PE: updates details only without touching the hierarchy', async () => {
    mockQueryOne.mockResolvedValueOnce({ project_id: P1 }).mockResolvedValueOnce({ id: T1 });
    mockQuery.mockResolvedValue([]);
    await pe.update(req(user, { params: { id: T1 } as never, body: { task_title: 'Renamed' } }), res());
    expect(mockQuery.mock.calls[0][0]).not.toContain('baseline_id');
  });

  it('PE: rejects an empty update', async () => {
    mockQueryOne.mockResolvedValueOnce({ project_id: P1 });
    await expect(pe.update(req(user, { params: { id: T1 } as never, body: {} }), res())).rejects.toThrow('Nothing to update');
  });
});

describe('Estimated vs Actual effort recording', () => {
  it('SP: rejects missing / non-positive actuals', async () => {
    await expect(sp.recordActuals(req(user, { params: { id: T1 } as never, body: {} }), res())).rejects.toThrow();
    await expect(sp.recordActuals(req(user, { params: { id: T1 } as never, body: { actual_hours: -2 } }), res())).rejects.toThrow();
  });

  it('SP: blocks recording actuals on another program\'s task', async () => {
    mockQueryOne.mockResolvedValueOnce({ estimated_hours: 10, revised_min_hours: 8, title: 't', project_id: P2 });
    await expect(sp.recordActuals(req(user, { params: { id: T1 } as never, body: { actual_hours: 9 } }), res())).rejects.toMatchObject({ statusCode: 403 });
  });

  // PE recording, corrections and metrics are covered in parametricActuals.controller.test.ts

  it('PE: validates actual effort', async () => {
    await expect(pe.recordActuals(req(user, { params: { id: T1 } as never, body: { actual_days: 0 } }), res())).rejects.toThrow(/greater than 0/);
  });

  it('PE: returns 404 for unknown task', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const r = res();
    await pe.recordActuals(req(user, { params: { id: T1 } as never, body: { actual_days: 3 } }), r);
    expect(r.status).toHaveBeenCalledWith(404);
  });
});

describe('bulk import uses the dialog hierarchy as default', () => {
  it('SP: applies the default hierarchy and validates it once for all rows', async () => {
    mockQueryOne.mockResolvedValueOnce(dept).mockResolvedValueOnce(prog).mockResolvedValueOnce(base);
    mockQuery.mockResolvedValue([]);
    const r = res();
    await sp.batchImport(req(user, { body: { hierarchy: { department_id: D1, program_id: P1, baseline_id: B1 }, rows: [spBody, spBody] } }), r);
    expect(mockQueryOne).toHaveBeenCalledTimes(3);
    expect(r.json).toHaveBeenCalledWith({ success: true, created: 2, errors: [] });
  });

  it('PE: reports a per-row error when no hierarchy is provided', async () => {
    mockQuery.mockResolvedValue([]);
    const r = res();
    await pe.batchImport(req(user, { body: { rows: [peBody] } }), r);
    expect(r.json).toHaveBeenCalledWith({ success: true, created: 0, errors: [{ row: 1, error: 'Department is required' }] });
  });
});
