import { Request, Response } from 'express';
import type { JwtPayload } from '../../auth/jwt';
import * as effort from '../../controllers/effort.controller';
import * as lookup from '../../controllers/hierarchyLookup.controller';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
import { query, queryOne } from '../../config/database';
const mockQuery = query as jest.Mock;
const mockQueryOne = queryOne as jest.Mock;

const D1 = '11111111-1111-1111-1111-111111111111';
const D2 = '22222222-2222-2222-2222-222222222222';
const P1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const P2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const B1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const C1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const gsa: JwtPayload = { userId: 'g', email: 'g@x', username: 'g', roles: ['Global Super Admin'], permissions: [], projectIds: '*', departmentIds: '*' };
const user: JwtPayload = { userId: 'u', email: 'u@x', username: 'u', roles: ['User'], permissions: [], projectIds: [P1], departmentIds: [D1] };
const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response);
const req = (u: JwtPayload, q: Record<string, unknown> = {}) => ({ user: u, query: q } as unknown as Request);

beforeEach(() => { mockQuery.mockReset(); mockQueryOne.mockReset(); });

// ─── Effort aggregation ──────────────────────────────────────────────────────
describe('deriveMetrics', () => {
  it('computes variance, accuracy and deviation over completed tasks only (SP: Actual − Estimated)', () => {
    expect(effort.deriveMetrics(100, 120, 3)).toEqual({ variance: 20, accuracy_percent: 80, deviation_percent: 20 });
  });
  it('PE convention reports Estimated − Actual with the same accuracy / deviation', () => {
    expect(effort.deriveMetrics(100, 120, 3, 'estimated_minus_actual')).toEqual({ variance: -20, accuracy_percent: 80, deviation_percent: 20 });
    expect(effort.deriveMetrics(100, 90, 3, 'estimated_minus_actual')).toEqual({ variance: 10, accuracy_percent: 90, deviation_percent: 10 });
  });
  it('returns null accuracy and deviation when nothing is completed', () => {
    expect(effort.deriveMetrics(0, 0, 0)).toEqual({ variance: 0, accuracy_percent: null, deviation_percent: null });
  });
  it('never returns negative accuracy', () => {
    expect(effort.deriveMetrics(10, 50, 1).accuracy_percent).toBe(0);
  });
});

describe('getEffort', () => {
  it('requires a module', async () => {
    await expect(effort.getEffort(req(gsa, {}), res())).rejects.toThrow();
  });

  it.each([
    ['department', 't.department_id'],
    ['program', 't.project_id'],
    ['baseline', 't.baseline_id'],
    ['component', 't.component_id'],
    ['subcomponent', 't.subcomponent_id'],
  ])('groups SP effort by %s', async (groupBy, key) => {
    mockQuery.mockResolvedValueOnce([]);
    await effort.getEffort(req(gsa, { module: 'sp', groupBy }), res());
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain(`GROUP BY ${key}`);
    expect(sql).toContain('FROM estimations t');
    expect(sql).toContain('COALESCE(t.estimated_hours, t.revised_min_hours)');
  });

  it('uses PE columns and units independently of SP', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const r = res();
    await effort.getEffort(req(gsa, { module: 'pe', groupBy: 'program' }), r);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('FROM parametric_estimations t');
    expect(sql).toContain('t.final_estimation');
    expect(sql).toContain('t.actual_days');
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ unit: 'person_days' }));
  });

  it('aggregates rows (including tasks without components) into totals', async () => {
    mockQuery.mockResolvedValueOnce([
      { id: C1, name: 'API', task_count: 2, completed_count: 1, estimated_total: 30, estimated_completed: 10, actual_total: 12 },
      { id: null, name: '(No component)', task_count: 1, completed_count: 1, estimated_total: 5, estimated_completed: 5, actual_total: 5 },
    ]);
    const r = res();
    await effort.getEffort(req(user, { module: 'sp', groupBy: 'component', baselineId: B1 }), r);
    const body = (r.json as jest.Mock).mock.calls[0][0];
    expect(body.data[0]).toMatchObject({ variance: 2, accuracy_percent: 80 });
    expect(body.data[1]).toMatchObject({ name: '(No component)', variance: 0, accuracy_percent: 100 });
    expect(body.totals).toMatchObject({ task_count: 3, completed_count: 2, estimated_total: 35, actual_total: 17, variance: 2 });
    expect(mockQuery.mock.calls[0][1]).toEqual([[P1], B1]); // access scope + baseline filter
  });

  it('returns task-level estimated vs actual rows', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 't1', name: 'Task', task_count: 1, completed_count: 0, estimated_total: 8, estimated_completed: 0, actual_total: 0 }]);
    const r = res();
    await effort.getEffort(req(gsa, { module: 'sp', groupBy: 'task' }), r);
    expect(mockQuery.mock.calls[0][0]).toContain('LIMIT 500');
    expect((r.json as jest.Mock).mock.calls[0][0].data[0]).toMatchObject({ id: 't1', accuracy_percent: null });
  });

  it('returns nothing for an unauthorised department filter', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await effort.getEffort(req(user, { module: 'sp', groupBy: 'program', departmentId: D2 }), res());
    expect(mockQuery.mock.calls[0][0]).toContain('1=0');
  });
});

// ─── Lookups (cascading dropdowns) ───────────────────────────────────────────
describe('hierarchy lookups', () => {
  it('context: global users get every active department and program', async () => {
    mockQuery.mockResolvedValueOnce([{ id: D1 }, { id: D2 }]).mockResolvedValueOnce([{ id: P1 }, { id: P2 }]);
    const r = res();
    await lookup.getMyContext(req(gsa), r);
    expect(r.json).toHaveBeenCalledWith({ success: true, data: { isGlobal: true, departments: [{ id: D1 }, { id: D2 }], programs: [{ id: P1 }, { id: P2 }] } });
  });

  it('context: scoped users get only their departments and programs', async () => {
    mockQuery.mockResolvedValueOnce([{ id: D1 }]).mockResolvedValueOnce([{ id: P1 }]);
    await lookup.getMyContext(req(user), res());
    expect(mockQuery.mock.calls[0][1]).toEqual([[D1]]);
    expect(mockQuery.mock.calls[1][1]).toEqual([[P1]]);
  });

  it('context: users with nothing assigned get empty lists without querying', async () => {
    const r = res();
    await lookup.getMyContext(req({ ...user, projectIds: [], departmentIds: [] }), r);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(r.json).toHaveBeenCalledWith({ success: true, data: { isGlobal: false, departments: [], programs: [] } });
  });

  it('departments: applies search', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await lookup.lookupDepartments(req(user, { search: 'eng' }), res());
    expect(mockQuery.mock.calls[0][0]).toContain('ILIKE $2');
    expect(mockQuery.mock.calls[0][1]).toEqual([[D1], '%eng%']);
  });

  it('programs: dynamically filtered by department and access', async () => {
    mockQuery.mockResolvedValueOnce([{ id: P1 }]);
    await lookup.lookupPrograms(req(user, { departmentId: D1 }), res());
    expect(mockQuery.mock.calls[0][1]).toEqual([D1, [P1]]);
  });

  it('programs: unauthorised department returns empty', async () => {
    const r = res();
    await lookup.lookupPrograms(req(user, { departmentId: D2 }), r);
    expect(r.json).toHaveBeenCalledWith({ success: true, data: [] });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('programs: requires a department id', async () => {
    await expect(lookup.lookupPrograms(req(user, {}), res())).rejects.toThrow();
  });

  it('baselines: only for an accessible program, active only', async () => {
    mockQuery.mockResolvedValueOnce([{ id: B1 }]);
    await lookup.lookupBaselines(req(user, { programId: P1 }), res());
    expect(mockQuery.mock.calls[0][0]).toContain("b.status = 'active'");

    const r = res();
    await lookup.lookupBaselines(req(user, { programId: P2 }), r);
    expect(r.json).toHaveBeenCalledWith({ success: true, data: [] });
  });

  it('components / subcomponents: check the owning program', async () => {
    mockQueryOne.mockResolvedValueOnce({ project_id: P2 });
    const r1 = res();
    await lookup.lookupComponents(req(user, { baselineId: B1 }), r1);
    expect(r1.json).toHaveBeenCalledWith({ success: true, data: [] });

    mockQueryOne.mockResolvedValueOnce({ project_id: P1 });
    mockQuery.mockResolvedValueOnce([{ id: C1 }]);
    const r2 = res();
    await lookup.lookupComponents(req(user, { baselineId: B1 }), r2);
    expect(r2.json).toHaveBeenCalledWith({ success: true, data: [{ id: C1 }] });

    mockQueryOne.mockResolvedValueOnce(null);
    const r3 = res();
    await lookup.lookupSubcomponents(req(user, { componentId: C1 }), r3);
    expect(r3.json).toHaveBeenCalledWith({ success: true, data: [] });
  });
});
