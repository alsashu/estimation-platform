import { Request, Response } from 'express';
import type { JwtPayload } from '../../auth/jwt';
import * as ctrl from '../../controllers/baselines.controller';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
jest.mock('../../services/audit.service', () => ({ auditLog: jest.fn() }));
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
const scoped: JwtPayload = { userId: 's', email: 's@x', username: 's', roles: ['Admin'], permissions: [], projectIds: [P1], departmentIds: [D1] };

const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response);
const req = (user: JwtPayload | undefined, extra: Partial<Request> = {}) =>
  ({ user, query: {}, params: {}, body: {}, headers: {}, ...extra } as unknown as Request);

const program = { id: P1, name: 'Alpha', status: 'active', department_id: D1 };

beforeEach(() => { mockQuery.mockReset(); mockQueryOne.mockReset(); });

// ─── Baselines ───────────────────────────────────────────────────────────────
describe('createBaseline', () => {
  it('requires a program', async () => {
    await expect(ctrl.createBaseline(req(gsa, { body: { name: 'R1' } }), res())).rejects.toThrow(/Program is required/);
  });

  it('returns 400 for unknown program', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const r = res();
    await ctrl.createBaseline(req(gsa, { body: { program_id: P1, name: 'R1' } }), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('rejects a department that does not own the program', async () => {
    mockQueryOne.mockResolvedValueOnce(program);
    const r = res();
    await ctrl.createBaseline(req(gsa, { body: { program_id: P1, department_id: D2, name: 'R1' } }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/does not belong/) }));
  });

  it('returns 403 for programs outside the user\'s access', async () => {
    mockQueryOne.mockResolvedValueOnce({ ...program, id: P2 });
    const r = res();
    await ctrl.createBaseline(req(scoped, { body: { program_id: P2, name: 'R1' } }), r);
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('rejects baselines under an inactive program', async () => {
    mockQueryOne.mockResolvedValueOnce({ ...program, status: 'inactive' });
    const r = res();
    await ctrl.createBaseline(req(gsa, { body: { program_id: P1, name: 'R1' } }), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('rejects end date before start date', async () => {
    mockQueryOne.mockResolvedValueOnce(program);
    const r = res();
    await ctrl.createBaseline(req(gsa, { body: { program_id: P1, name: 'R1', start_date: '2026-05-01', end_date: '2026-04-01' } }), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('returns 409 for a duplicate name within the program', async () => {
    mockQueryOne.mockResolvedValueOnce(program).mockResolvedValueOnce({ id: B1 });
    const r = res();
    await ctrl.createBaseline(req(gsa, { body: { program_id: P1, name: 'R1' } }), r);
    expect(r.status).toHaveBeenCalledWith(409);
  });

  it('creates multiple baselines under the same program (legacy project_id accepted)', async () => {
    for (const [i, name] of ['Baseline 1', 'Baseline 2', 'Baseline 3'].entries()) {
      mockQueryOne.mockResolvedValueOnce(program).mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce([{ id: `b${i}`, project_id: P1, name }]);
      const r = res();
      const body = i === 0 ? { project_id: P1, name } : { program_id: P1, name, version: `v${i}` };
      await ctrl.createBaseline(req(scoped, { body }), r);
      expect(r.status).toHaveBeenCalledWith(201);
    }
    expect(mockQuery.mock.calls.every(c => (c[1] as unknown[])[0] === P1)).toBe(true);
  });
});

describe('listBaselines', () => {
  it('scopes to accessible programs for non-global users and filters by program', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await ctrl.listBaselines(req(scoped, { query: { programId: P1 } as never }), res());
    expect(mockQuery.mock.calls[0][1]).toEqual([[P1], P1]);
  });

  it('returns empty for users without programs', async () => {
    const r = res();
    await ctrl.listBaselines(req({ ...scoped, projectIds: [] }), r);
    expect(r.json).toHaveBeenCalledWith({ success: true, data: [], total: 0 });
  });
});

describe('getBaseline', () => {
  it('returns 404 / 403 appropriately', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const r1 = res();
    await ctrl.getBaseline(req(gsa, { params: { id: B1 } as never }), r1);
    expect(r1.status).toHaveBeenCalledWith(404);

    mockQueryOne.mockResolvedValueOnce({ id: B1, project_id: P2 });
    const r2 = res();
    await ctrl.getBaseline(req(scoped, { params: { id: B1 } as never }), r2);
    expect(r2.status).toHaveBeenCalledWith(403);
  });

  it('returns the component tree and task counts', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: B1, project_id: P1, name: 'R1' })
      .mockResolvedValueOnce({ program_name: 'Alpha' })
      .mockResolvedValueOnce({ sp_task_count: 3, pe_task_count: 1 });
    mockQuery.mockResolvedValueOnce([{ id: C1, name: 'API', subcomponents: [] }]);
    const r = res();
    await ctrl.getBaseline(req(scoped, { params: { id: B1 } as never }), r);
    expect(r.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ program_name: 'Alpha', sp_task_count: 3, components: [expect.objectContaining({ id: C1 })] }) });
  });
});

describe('updateBaseline / status / delete', () => {
  it('refuses to re-parent a baseline (program_id is immutable)', async () => {
    await expect(ctrl.updateBaseline(req(gsa, { params: { id: B1 } as never, body: { program_id: P2 } }), res())).rejects.toThrow();
  });

  it('updates fields, allowing explicit nulls', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: B1, project_id: P1, start_date: null, end_date: null }).mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce([{ id: B1, name: 'R2', version: null }]);
    const r = res();
    await ctrl.updateBaseline(req(gsa, { params: { id: B1 } as never, body: { name: 'R2', version: null } }), r);
    expect(mockQuery.mock.calls[0][0]).toContain('version = $2');
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('validates status values and toggles status', async () => {
    await expect(ctrl.setBaselineStatus(req(gsa, { params: { id: B1 } as never, body: { status: 'nope' } }), res())).rejects.toThrow();
    mockQueryOne.mockResolvedValueOnce({ id: B1, project_id: P1 });
    mockQuery.mockResolvedValueOnce([{ id: B1, status: 'inactive' }]);
    const r = res();
    await ctrl.setBaselineStatus(req(gsa, { params: { id: B1 } as never, body: { status: 'inactive' } }), r);
    expect(r.json).toHaveBeenCalledWith({ success: true, data: { id: B1, status: 'inactive' } });
  });

  it('refuses to delete a baseline that has tasks', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: B1, project_id: P1 }).mockResolvedValueOnce({ n: 4 });
    const r = res();
    await ctrl.deleteBaseline(req(gsa, { params: { id: B1 } as never }), r);
    expect(r.status).toHaveBeenCalledWith(409);
  });

  it('deletes an empty baseline', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: B1, project_id: P1 }).mockResolvedValueOnce({ n: 0 });
    mockQuery.mockResolvedValueOnce([]);
    const r = res();
    await ctrl.deleteBaseline(req(gsa, { params: { id: B1 } as never }), r);
    expect(r.json).toHaveBeenCalledWith({ success: true, message: 'Baseline deleted' });
  });
});

// ─── Components ──────────────────────────────────────────────────────────────
describe('components', () => {
  it('creates a component under a baseline', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: B1, project_id: P1 }).mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce([{ id: C1, baseline_id: B1, name: 'API' }]);
    const r = res();
    await ctrl.createComponent(req(scoped, { body: { baseline_id: B1, name: 'API' } }), r);
    expect(r.status).toHaveBeenCalledWith(201);
  });

  it('rejects unknown baseline, inaccessible baseline and duplicates', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const r1 = res();
    await ctrl.createComponent(req(gsa, { body: { baseline_id: B1, name: 'API' } }), r1);
    expect(r1.status).toHaveBeenCalledWith(400);

    mockQueryOne.mockResolvedValueOnce({ id: B1, project_id: P2 });
    const r2 = res();
    await ctrl.createComponent(req(scoped, { body: { baseline_id: B1, name: 'API' } }), r2);
    expect(r2.status).toHaveBeenCalledWith(403);

    mockQueryOne.mockResolvedValueOnce({ id: B1, project_id: P1 }).mockResolvedValueOnce({ id: C1 });
    const r3 = res();
    await ctrl.createComponent(req(gsa, { body: { baseline_id: B1, name: 'API' } }), r3);
    expect(r3.status).toHaveBeenCalledWith(409);
  });

  it('requires a baselineId when listing', async () => {
    await expect(ctrl.listComponents(req(gsa), res())).rejects.toThrow();
  });

  it('refuses to delete a component used by tasks; deletes an unused one', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: C1, project_id: P1 }).mockResolvedValueOnce({ n: 2 });
    const r1 = res();
    await ctrl.deleteComponent(req(gsa, { params: { id: C1 } as never }), r1);
    expect(r1.status).toHaveBeenCalledWith(409);

    mockQueryOne.mockResolvedValueOnce({ id: C1, project_id: P1 }).mockResolvedValueOnce({ n: 0 });
    mockQuery.mockResolvedValueOnce([]);
    const r2 = res();
    await ctrl.deleteComponent(req(gsa, { params: { id: C1 } as never }), r2);
    expect(r2.json).toHaveBeenCalledWith({ success: true, message: 'Component deleted' });
  });

  it('updates a component name with duplicate protection', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: C1, baseline_id: B1, project_id: P1 }).mockResolvedValueOnce({ id: 'other' });
    const r = res();
    await ctrl.updateComponent(req(gsa, { params: { id: C1 } as never, body: { name: 'Dup' } }), r);
    expect(r.status).toHaveBeenCalledWith(409);
  });
});

// ─── Subcomponents ───────────────────────────────────────────────────────────
describe('subcomponents', () => {
  it('creates a subcomponent under a component', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: C1, project_id: P1 }).mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce([{ id: 's1', component_id: C1 }]);
    const r = res();
    await ctrl.createSubcomponent(req(scoped, { body: { component_id: C1, name: 'Auth' } }), r);
    expect(r.status).toHaveBeenCalledWith(201);
  });

  it('rejects unknown parent component', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const r = res();
    await ctrl.createSubcomponent(req(gsa, { body: { component_id: C1, name: 'Auth' } }), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('refuses to delete a subcomponent used by tasks', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 's1', project_id: P1 }).mockResolvedValueOnce({ n: 1 });
    const r = res();
    await ctrl.deleteSubcomponent(req(gsa, { params: { id: 's1' } as never }), r);
    expect(r.status).toHaveBeenCalledWith(409);
  });

  it('denies access to subcomponents of other programs', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 's1', project_id: P2 });
    const r = res();
    await ctrl.updateSubcomponent(req(scoped, { params: { id: 's1' } as never, body: { name: 'x' } }), r);
    expect(r.status).toHaveBeenCalledWith(403);
  });
});
