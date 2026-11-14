import { Request, Response } from 'express';
import type { JwtPayload } from '../../auth/jwt';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
jest.mock('../../services/audit.service', () => ({ auditLog: jest.fn() }));
jest.mock('../../services/notification.service', () => ({ createNotification: jest.fn() }));
jest.mock('../../auth/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
  validatePasswordPolicy: jest.fn().mockReturnValue(null),
}));

import { query, queryOne } from '../../config/database';
import { auditLog } from '../../services/audit.service';
import {
  permissionModule, filterPermissionsByModules, decideModuleGrant, setUserModules, invalidateUserModules,
  getEffectiveModules, normalizeModules,
} from '../../services/estimationAccess.service';
import { backfillEstimationAccess, BACKFILL_MARKER } from '../../db/migrate.estimationAccess';
import * as users from '../../controllers/users.controller';

const mockQuery = query as jest.Mock;
const mockQueryOne = queryOne as jest.Mock;
const mockAudit = auditLog as jest.Mock;

beforeEach(() => {
  mockQuery.mockReset(); mockQueryOne.mockReset(); mockAudit.mockReset();
  invalidateUserModules();
});

// ─── Permission → module mapping ─────────────────────────────────────────────
describe('permission → module mapping', () => {
  it.each([
    ['estimation.read', 'SP'], ['estimation.import', 'SP'], ['master.read', 'SP'], ['master.write', 'SP'],
    ['parametric.read', 'PE'], ['parametric.import', 'PE'], ['parametric.master.write', 'PE'], ['parametric.actuals.correct', 'PE'],
    ['user.create', null], ['department.read', null], ['baseline.read', null], ['project.read', null], ['audit.read', null],
  ])('%s → %s', (perm, mod) => expect(permissionModule(perm)).toBe(mod));

  it('filters role permissions down to the granted modules, keeping admin permissions', () => {
    const perms = ['estimation.read', 'master.read', 'parametric.read', 'user.create', 'baseline.read'];
    expect(filterPermissionsByModules(perms, ['SP'])).toEqual(['estimation.read', 'master.read', 'user.create', 'baseline.read']);
    expect(filterPermissionsByModules(perms, ['PE'])).toEqual(['parametric.read', 'user.create', 'baseline.read']);
    expect(filterPermissionsByModules(perms, ['SP', 'PE'])).toEqual(perms);
  });

  it('normalizes order and drops unknown codes', () => {
    expect(normalizeModules(['PE', 'XX', 'SP'])).toEqual(['SP', 'PE']);
  });
});

// ─── Grant rules ─────────────────────────────────────────────────────────────
describe('decideModuleGrant', () => {
  it('GSA (both modules) can grant SP only, PE only, or both', () => {
    expect(decideModuleGrant(['SP', 'PE'], ['SP'])).toEqual({ ok: true, modules: ['SP'] });
    expect(decideModuleGrant(['SP', 'PE'], ['PE'])).toEqual({ ok: true, modules: ['PE'] });
    expect(decideModuleGrant(['SP', 'PE'], ['PE', 'SP'])).toEqual({ ok: true, modules: ['SP', 'PE'] });
  });

  it('SP-only admin: SP yes; PE-only or both → 403', () => {
    expect(decideModuleGrant(['SP'], ['SP'])).toMatchObject({ ok: true, modules: ['SP'] });
    expect(decideModuleGrant(['SP'], ['PE'])).toMatchObject({ ok: false, status: 403, error: expect.stringMatching(/Parametric Estimation/) });
    expect(decideModuleGrant(['SP'], ['SP', 'PE'])).toMatchObject({ ok: false, status: 403 });
  });

  it('PE-only admin: PE yes; SP-only or both → 403', () => {
    expect(decideModuleGrant(['PE'], ['PE'])).toMatchObject({ ok: true, modules: ['PE'] });
    expect(decideModuleGrant(['PE'], ['SP'])).toMatchObject({ ok: false, status: 403, error: expect.stringMatching(/Story Point Estimation/) });
    expect(decideModuleGrant(['PE'], ['SP', 'PE'])).toMatchObject({ ok: false, status: 403 });
  });

  it('requires at least one module and rejects unknown codes', () => {
    expect(decideModuleGrant(['SP', 'PE'], [])).toMatchObject({ ok: false, status: 400 });
    expect(decideModuleGrant(['SP', 'PE'], ['XX'])).toMatchObject({ ok: false, status: 400 });
  });

  it('on edit, keeps modules the actor cannot manage (an SP admin cannot strip PE)', () => {
    expect(decideModuleGrant(['SP'], ['SP'], ['SP', 'PE'])).toEqual({ ok: true, modules: ['SP', 'PE'] });
  });

  it('on edit, a both-module admin can narrow a user to one module', () => {
    expect(decideModuleGrant(['SP', 'PE'], ['PE'], ['SP', 'PE'])).toEqual({ ok: true, modules: ['PE'] });
  });

  it('an actor with no modules can grant nothing', () => {
    expect(decideModuleGrant([], ['SP'])).toMatchObject({ ok: false, status: 403 });
  });
});

// ─── Persistence ─────────────────────────────────────────────────────────────
describe('setUserModules / getEffectiveModules', () => {
  it('upserts requested modules, deactivates the rest and reports the diff', async () => {
    mockQuery.mockResolvedValueOnce([{ module_code: 'SP' }, { module_code: 'PE' }]).mockResolvedValue([]);
    const change = await setUserModules('u1', ['PE'], 'admin');
    expect(change).toEqual({ before: ['SP', 'PE'], after: ['PE'], added: [], removed: ['SP'] });
    const sqls = mockQuery.mock.calls.map(c => c[0] as string);
    expect(sqls[1]).toContain('ON CONFLICT (user_id, module_code) DO UPDATE');
    expect(sqls[2]).toContain('SET is_active = false');
    expect(mockQuery.mock.calls[2][1]).toEqual(['u1', ['PE'], 'admin']);
  });

  it('invalidates the cache so the change applies on the next request', async () => {
    mockQuery.mockResolvedValueOnce([{ module_code: 'SP' }, { module_code: 'PE' }]);
    expect(await getEffectiveModules('u1', ['User'])).toEqual(['SP', 'PE']);
    mockQuery.mockResolvedValueOnce([{ module_code: 'SP' }, { module_code: 'PE' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await setUserModules('u1', ['SP'], 'admin');
    mockQuery.mockResolvedValueOnce([{ module_code: 'SP' }]);
    expect(await getEffectiveModules('u1', ['User'])).toEqual(['SP']);
  });
});

// ─── Migration backfill ──────────────────────────────────────────────────────
describe('backfillEstimationAccess (existing users)', () => {
  const client = () => ({ query: jest.fn() });

  it('runs once (marker present → no-op)', async () => {
    const c = client();
    c.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
    expect(await backfillEstimationAccess(c as never)).toBe(0);
    expect(c.query).toHaveBeenCalledTimes(1);
  });

  it('grants only modules the roles already permitted, audits each user, then sets the marker', async () => {
    const c = client();
    c.query
      .mockResolvedValueOnce({ rows: [] })                                   // marker check
      .mockResolvedValueOnce({ rows: [
        { user_id: 'a', username: 'sp_only', modules: ['SP'] },
        { user_id: 'b', username: 'both', modules: ['SP', 'PE'] },
      ] })
      .mockResolvedValue({ rows: [] });
    expect(await backfillEstimationAccess(c as never)).toBe(2);
    const calls = c.query.mock.calls as [string, unknown[]][];
    const derive = calls[1][0];
    expect(derive).toContain("p.name LIKE 'estimation.%' OR p.name LIKE 'master.%'");
    expect(derive).toContain("p.name LIKE 'parametric.%'");
    expect(derive).toContain('NOT EXISTS (SELECT 1 FROM user_estimation_access');   // never overrides explicit grants
    const inserts = calls.filter(([sql]) => sql.includes('INSERT INTO user_estimation_access')).map(([, p]) => p);
    expect(inserts).toEqual([['a', 'SP'], ['b', 'SP'], ['b', 'PE']]);
    const audits = calls.filter(([sql]) => sql.includes('estimation_access_migrated'));
    expect(audits).toHaveLength(2);
    expect(calls[calls.length - 1][1]?.[0]).toBe(BACKFILL_MARKER);
  });
});

// ─── User management scenarios ───────────────────────────────────────────────
const actor = (roles: string[], modules: ('SP' | 'PE')[], extra: Partial<JwtPayload> = {}): JwtPayload => ({
  userId: `${roles[0]}-${modules.join('')}`, email: 'a@x', username: 'actor', roles,
  permissions: ['user.create', 'user.update', 'user.read'], projectIds: '*', departmentIds: '*', modules, ...extra,
});
const gsa = actor(['Global Super Admin'], ['SP', 'PE']);
const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response & { status: jest.Mock; json: jest.Mock });
const body = (modules: string[], extra: Record<string, unknown> = {}) => ({
  firstName: 'N', lastName: 'U', username: 'new_user', email: 'n@u.com', password: 'Pass@1234', roleIds: [], modules, ...extra,
});

/** Mocks for a successful create; returns the module rows inserted. */
function primeCreate() {
  mockQueryOne.mockResolvedValueOnce(null);                       // no duplicate
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.startsWith('INSERT INTO users')) return [{ id: 'new-id' }];
    return [];
  });
  mockQueryOne.mockResolvedValue({ id: 'new-id', estimation_modules: [] });
}
const insertedModules = () => mockQuery.mock.calls
  .filter(c => String(c[0]).includes('INSERT INTO user_estimation_access')).map(c => c[1][1]);

describe('createUser — module access', () => {
  it.each([
    ['GSA creates an SP-only Admin', gsa, ['SP']],
    ['GSA creates a PE-only Admin', gsa, ['PE']],
    ['GSA creates an Admin with both', gsa, ['SP', 'PE']],
    ['SP-only Admin creates an SP-only user', actor(['Admin'], ['SP']), ['SP']],
    ['PE-only Admin creates a PE-only user', actor(['Admin'], ['PE']), ['PE']],
    ['both-module Admin creates an SP-only user', actor(['Admin'], ['SP', 'PE']), ['SP']],
    ['both-module Admin creates a PE-only user', actor(['Admin'], ['SP', 'PE']), ['PE']],
    ['both-module Admin creates a both-module user', actor(['Admin'], ['SP', 'PE']), ['SP', 'PE']],
  ])('%s', async (_l, who, modules) => {
    primeCreate();
    const r = res();
    await users.createUser({ user: who, body: body(modules) } as unknown as Request, r);
    expect(r.status).toHaveBeenCalledWith(201);
    expect(insertedModules()).toEqual(modules);
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'estimation_access_granted', newValue: { modules } }));
  });

  it.each([
    ['SP-only Admin grants PE', actor(['Admin'], ['SP']), ['PE']],
    ['SP-only Admin grants both', actor(['Admin'], ['SP']), ['SP', 'PE']],
    ['PE-only Admin grants SP', actor(['Admin'], ['PE']), ['SP']],
    ['PE-only Admin grants both', actor(['Admin'], ['PE']), ['SP', 'PE']],
  ])('403: %s', async (_l, who, modules) => {
    mockQueryOne.mockResolvedValueOnce(null);
    mockQuery.mockResolvedValue([]);
    const r = res();
    await users.createUser({ user: who, body: body(modules) } as unknown as Request, r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(mockQuery.mock.calls.some(c => String(c[0]).startsWith('INSERT INTO users'))).toBe(false);
  });

  it('rejects a user without any module (validation)', async () => {
    await expect(users.createUser({ user: gsa, body: body([]) } as unknown as Request, res())).rejects.toThrow(/at least one estimation module/);
    await expect(users.createUser({ user: gsa, body: { ...body(['SP']), modules: undefined } } as unknown as Request, res())).rejects.toThrow();
  });

  it('module scope combines with Department / Program scope (both must pass)', async () => {
    const peAdmin = actor(['Admin'], ['PE'], { projectIds: ['11111111-1111-1111-1111-111111111111'], departmentIds: ['22222222-2222-2222-2222-222222222222'] });
    // right module, wrong program
    mockQueryOne.mockResolvedValueOnce(null); mockQuery.mockResolvedValue([]);
    const r1 = res();
    await users.createUser({ user: peAdmin, body: body(['PE'], { projectIds: ['99999999-9999-9999-9999-999999999999'] }) } as unknown as Request, r1);
    expect(r1.status).toHaveBeenCalledWith(403);
    expect(r1.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Cannot assign programs outside your access' }));
    // right program, wrong module
    mockQueryOne.mockResolvedValueOnce(null);
    const r2 = res();
    await users.createUser({ user: peAdmin, body: body(['SP'], { projectIds: ['11111111-1111-1111-1111-111111111111'] }) } as unknown as Request, r2);
    expect(r2.status).toHaveBeenCalledWith(403);
    // right program, right module
    primeCreate();
    const r3 = res();
    await users.createUser({ user: peAdmin, body: body(['PE'], {
      projectIds: ['11111111-1111-1111-1111-111111111111'],
      departments: [{ id: '22222222-2222-2222-2222-222222222222', access_scope: 'assigned' }],
    }) } as unknown as Request, r3);
    expect(r3.status).toHaveBeenCalledWith(201);
  });
});

describe('updateUser — module access', () => {
  function primeUpdate(targetRoles: string[], current: string[], createdBy = 'creator') {
    mockQueryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('created_by') && sql.includes('json_agg(r.name)')) return { roles: targetRoles, created_by: createdBy };
      if (sql.startsWith('SELECT * FROM users')) return { id: 't1' };
      return { id: 't1', roles: targetRoles };
    });
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT module_code FROM user_estimation_access')) return current.map(module_code => ({ module_code }));
      return [];
    });
  }

  it('GSA updates an existing Admin from SP to both, audited with before/after', async () => {
    primeUpdate(['Admin'], ['SP']);
    const r = res();
    await users.updateUser({ user: gsa, params: { id: 't1' }, body: { modules: ['SP', 'PE'] } } as unknown as Request, r);
    expect(r.status).not.toHaveBeenCalled();
    expect(insertedModules()).toEqual(['SP', 'PE']);
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'estimation_access_updated',
      previousValue: { modules: ['SP'] },
      newValue: { modules: ['SP', 'PE'], added: ['PE'], removed: [] },
    }));
  });

  it('SP-only Admin cannot add PE to their user', async () => {
    const spAdmin = actor(['Admin'], ['SP']);
    primeUpdate(['User'], ['SP'], spAdmin.userId);
    const r = res();
    await users.updateUser({ user: spAdmin, params: { id: 't1' }, body: { modules: ['SP', 'PE'] } } as unknown as Request, r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(insertedModules()).toEqual([]);
  });

  it('SP-only Admin editing a both-module user keeps the PE grant they cannot manage', async () => {
    const spAdmin = actor(['Admin'], ['SP']);
    primeUpdate(['User'], ['SP', 'PE'], spAdmin.userId);
    const r = res();
    await users.updateUser({ user: spAdmin, params: { id: 't1' }, body: { modules: ['SP'] } } as unknown as Request, r);
    expect(r.status).not.toHaveBeenCalled();
    expect(insertedModules()).toEqual(['SP', 'PE']);
    expect(mockAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'estimation_access_updated' }));
  });

  it('module rows are not written for a Global Super Admin target (always both)', async () => {
    primeUpdate(['Global Super Admin'], []);
    const r = res();
    await users.updateUser({ user: gsa, params: { id: 't1' }, body: { modules: ['SP'] } } as unknown as Request, r);
    expect(insertedModules()).toEqual([]);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estimation_modules: ['SP', 'PE'] }) }));
  });

  it('rejects an empty module list on edit', async () => {
    await expect(users.updateUser({ user: gsa, params: { id: 't1' }, body: { modules: [] } } as unknown as Request, res())).rejects.toThrow();
  });
});
