jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
import type { JwtPayload } from '../../auth/jwt';
import { allowedMethods, readFilters, scopeSql, type PerfFilters } from '../../services/performanceData';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const D1 = '33333333-3333-4333-8333-333333333333';

const user = (o: Partial<JwtPayload> = {}): JwtPayload => ({
  userId: 'u', email: 'u@x', username: 'u', roles: ['User'], permissions: ['estimation.read', 'parametric.read'],
  projectIds: [P1], departmentIds: [D1], ...o,
});
const NOW = { from: '2026-01-01', to: '2026-01-31', timezone: 'UTC', interval: 'day' as const, days: 31 };
const filters = (o: Partial<PerfFilters> = {}): PerfFilters => ({ programIds: [], methods: ['SP', 'PE'], range: NOW, ...o });

describe('allowedMethods / readFilters', () => {
  it('maps read permissions (already module-filtered) to methods', () => {
    expect(allowedMethods(user())).toEqual(['SP', 'PE']);
    expect(allowedMethods(user({ permissions: ['parametric.read'] }))).toEqual(['PE']);
    expect(allowedMethods(undefined)).toEqual([]);
  });

  it('BOTH degrades to the methods the user holds; an explicit method they lack is 403', () => {
    const pe = user({ permissions: ['parametric.read'] });
    expect(readFilters({ from: '2026-01-01', to: '2026-01-31' }, pe, 90).methods).toEqual(['PE']);
    expect(() => readFilters({ method: 'SP' }, pe, 90)).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() => readFilters({}, user({ permissions: [] }), 90)).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it('parses multiple programs and validates ids, method and dates', () => {
    const f = readFilters({ programIds: `${P1},${P2},${P1}`, departmentId: D1, from: '2026-01-01', to: '2026-01-31', tz: 'Asia/Kolkata' }, user(), 90);
    expect(f.programIds).toEqual([P1, P2]);
    expect(f.range).toMatchObject({ from: '2026-01-01', to: '2026-01-31', timezone: 'Asia/Kolkata', interval: 'day' });
    expect(() => readFilters({ programIds: 'nope' }, user(), 90)).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => readFilters({ method: 'ALL' }, user(), 90)).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => readFilters({ from: '2026-02-01', to: '2026-01-01' }, user(), 90)).toThrow(/From Date/);
    expect(() => readFilters({ from: '2026-01-01', to: '2999-01-01' }, user(), 90)).toThrow(/future/);
  });

  it('uses the configured default range when no dates are given', () => {
    expect(readFilters({}, user(), 90).range.days).toBe(90);
  });
});

describe('scopeSql', () => {
  it('global users are only narrowed by the filters', () => {
    const params: unknown[] = [];
    expect(scopeSql(user({ projectIds: '*' }), filters({ departmentId: D1 }), params)).toBe(' AND t.department_id = $1');
    expect(params).toEqual([D1]);
  });

  it('non-global users are always limited to their programs', () => {
    const params: unknown[] = ['x'];
    expect(scopeSql(user(), filters({ programIds: [P1] }), params))
      .toBe(' AND t.project_id = ANY($2::uuid[]) AND t.project_id = ANY($3::uuid[])');
    expect(params).toEqual(['x', [P1], [P1]]);
  });

  it('inaccessible programs are dropped; none left → no rows', () => {
    const params: unknown[] = [];
    expect(scopeSql(user(), filters({ programIds: [P1, P2] }), params)).toContain('ANY($2::uuid[])');
    expect(params[1]).toEqual([P1]);
  });

  it.each([
    ['program outside the user scope', filters({ programIds: [P2] })],
    ['department outside the user scope', filters({ departmentId: '44444444-4444-4444-8444-444444444444' })],
  ])('denied scope (%s) returns 1=0 and binds no parameters (regression)', (_l, f) => {
    const params: unknown[] = ['from', 'to', 'tz'];
    expect(scopeSql(user(), f, params)).toBe(' AND 1=0');
    expect(params).toEqual(['from', 'to', 'tz']);
  });

  it('user without programs or without a session sees nothing', () => {
    expect(scopeSql(user({ projectIds: [] }), filters(), [])).toBe(' AND 1=0');
    expect(scopeSql(undefined, filters(), [])).toBe(' AND 1=0');
  });
});
