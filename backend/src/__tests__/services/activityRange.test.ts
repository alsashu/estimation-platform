import { Request, Response } from 'express';
import type { JwtPayload } from '../../auth/jwt';
import {
  resolveActivityRange, pickInterval, spanDays, addDays, todayIn, isValidIsoDate, isValidTimeZone,
  MAX_ACTIVITY_DAYS,
} from '../../services/activityRange';
import * as sp from '../../controllers/analysis.controller';
import * as pe from '../../controllers/parametricAnalysis.controller';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
import { query } from '../../config/database';
const mockQuery = query as jest.Mock;

// 14 Nov 2026 20:00 UTC = 15 Nov 01:30 in Kolkata
const NOW = new Date('2026-11-14T20:00:00Z');

describe('activity range helpers', () => {
  it('validates ISO calendar dates', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('14-11-2026')).toBe(false);
    expect(isValidIsoDate(undefined)).toBe(false);
  });

  it('validates time zones without letting SQL through', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Bad/Zone')).toBe(false);
    expect(isValidTimeZone("UTC'; DROP TABLE x;--")).toBe(false);
  });

  it('computes today in the caller time zone', () => {
    expect(todayIn('UTC', NOW)).toBe('2026-11-14');
    expect(todayIn('Asia/Kolkata', NOW)).toBe('2026-11-15');
    expect(todayIn('America/New_York', NOW)).toBe('2026-11-14');
  });

  it('does inclusive date arithmetic across month and leap boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(spanDays('2026-11-14', '2026-11-14')).toBe(1);
    expect(spanDays('2026-01-01', '2026-12-31')).toBe(365);
  });

  it('picks daily, weekly or monthly buckets by span', () => {
    expect(pickInterval(1)).toBe('day');
    expect(pickInterval(62)).toBe('day');
    expect(pickInterval(63)).toBe('week');
    expect(pickInterval(366)).toBe('week');
    expect(pickInterval(367)).toBe('month');
  });
});

describe('resolveActivityRange', () => {
  it('defaults to the last 30 days including today (UTC)', () => {
    expect(resolveActivityRange({}, NOW)).toEqual({ ok: true, range: { from: '2026-10-16', to: '2026-11-14', timezone: 'UTC', interval: 'day', days: 30 } });
  });

  it('anchors the default to today in the caller time zone', () => {
    const r = resolveActivityRange({ tz: 'Asia/Kolkata' }, NOW);
    expect(r).toMatchObject({ ok: true, range: { from: '2026-10-17', to: '2026-11-15' } });
  });

  it('still honours the legacy days param (clamped)', () => {
    expect(resolveActivityRange({ days: '7' }, NOW)).toMatchObject({ ok: true, range: { from: '2026-11-08', days: 7 } });
    expect(resolveActivityRange({ days: '0' }, NOW)).toMatchObject({ ok: true, range: { days: 1 } });
    expect(resolveActivityRange({ days: 'abc' }, NOW)).toMatchObject({ ok: true, range: { days: 30 } });
  });

  it('accepts a custom range', () => {
    expect(resolveActivityRange({ from: '2026-09-01', to: '2026-09-30' }, NOW))
      .toEqual({ ok: true, range: { from: '2026-09-01', to: '2026-09-30', timezone: 'UTC', interval: 'day', days: 30 } });
  });

  it('accepts the same From and To date (single day)', () => {
    expect(resolveActivityRange({ from: '2026-11-14', to: '2026-11-14' }, NOW)).toMatchObject({ ok: true, range: { days: 1, interval: 'day' } });
  });

  it('switches to weekly / monthly buckets for large ranges', () => {
    expect(resolveActivityRange({ from: '2026-01-01', to: '2026-11-14' }, NOW)).toMatchObject({ ok: true, range: { interval: 'week' } });
    expect(resolveActivityRange({ from: '2018-01-01', to: '2026-11-14' }, NOW)).toMatchObject({ ok: true, range: { interval: 'month' } });
  });

  it.each([
    [{ from: '2026-11-14', to: '2026-11-01' }, 'From Date must not be later than To Date'],
    [{ from: '2026-11-01' }, 'Both From Date and To Date are required'],
    [{ to: '2026-11-01' }, 'Both From Date and To Date are required'],
    [{ from: '2026-02-30', to: '2026-03-01' }, 'From Date must be a valid date (YYYY-MM-DD)'],
    [{ from: '2026-01-01', to: 'tomorrow' }, 'To Date must be a valid date (YYYY-MM-DD)'],
    [{ from: '2026-11-01', to: '2026-11-15' }, 'To Date cannot be in the future'],
    [{ from: '2000-01-01', to: '2026-11-14' }, `Date range cannot exceed ${MAX_ACTIVITY_DAYS} days`],
    [{ tz: 'Mars/Olympus' }, 'tz must be a valid IANA time zone (e.g. Asia/Kolkata)'],
  ])('rejects %j', (q, error) => {
    expect(resolveActivityRange(q, NOW)).toEqual({ ok: false, error });
  });

  it('judges "future" in the caller time zone', () => {
    // 15 Nov is already today in Kolkata, but tomorrow in UTC
    expect(resolveActivityRange({ from: '2026-11-01', to: '2026-11-15', tz: 'Asia/Kolkata' }, NOW)).toMatchObject({ ok: true });
    expect(resolveActivityRange({ from: '2026-11-01', to: '2026-11-15', tz: 'UTC' }, NOW)).toMatchObject({ ok: false });
  });
});

// ─── Controllers ─────────────────────────────────────────────────────────────
const P1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const D1 = '11111111-1111-1111-1111-111111111111';
const B1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const gsa: JwtPayload = { userId: 'g', email: 'g@x', username: 'g', roles: ['Global Super Admin'], permissions: [], projectIds: '*', departmentIds: '*' };
const user: JwtPayload = { userId: 'u', email: 'u@x', username: 'u', roles: ['User'], permissions: [], projectIds: [P1], departmentIds: [D1] };
const mkRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response & { status: jest.Mock; json: jest.Mock });
const mkReq = (u: JwtPayload, q: Record<string, unknown> = {}) => ({ user: u, query: q } as unknown as Request);

beforeEach(() => mockQuery.mockReset());

describe.each([
  ['SP', sp.getTrend, 'FROM estimations e', 'e.'],
  ['PE', pe.getTrend, 'FROM parametric_estimations p', 'p.'],
])('%s getTrend', (_label, getTrend, fromClause, alias) => {
  it('filters by date range in SQL, zero-fills buckets and returns meta', async () => {
    mockQuery.mockResolvedValueOnce([{ date: '2026-11-01', total: 0 }]);
    const res = mkRes();
    await getTrend(mkReq(gsa, { from: '2026-11-01', to: '2026-11-10', tz: 'Asia/Kolkata' }), res);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain(fromClause);
    expect(sql).toContain('generate_series');
    expect(sql).toContain(`${alias}created_at >= (b.d_from::timestamp AT TIME ZONE b.tz)`);
    expect(params).toEqual(['2026-11-01', '2026-11-10', 'Asia/Kolkata', 'day']);
    expect(res.json).toHaveBeenCalledWith({
      success: true, data: [{ date: '2026-11-01', total: 0 }],
      meta: { from: '2026-11-01', to: '2026-11-10', timezone: 'Asia/Kolkata', interval: 'day', days: 10 },
    });
  });

  it('applies Department / Program / Baseline filters before the range params', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await getTrend(mkReq(gsa, { departmentId: D1, programId: P1, baselineId: B1, from: '2026-01-01', to: '2026-06-30' }), mkRes());
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain(`${alias}department_id = $1`);
    expect(sql).toContain(`${alias}project_id = $2`);
    expect(sql).toContain(`${alias}baseline_id = $3`);
    expect(sql).toContain('$4::date AS d_from');
    expect(params).toEqual([D1, P1, B1, '2026-01-01', '2026-06-30', 'UTC', 'week']);
  });

  it('restricts non-global users to their programs', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await getTrend(mkReq(user, { from: '2026-11-01', to: '2026-11-02' }), mkRes());
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain(`${alias}project_id = ANY($1::uuid[])`);
    expect(params[0]).toEqual([P1]);
  });

  it('rejects an inverted range with 400 and never queries', async () => {
    const res = mkRes();
    await getTrend(mkReq(gsa, { from: '2026-11-10', to: '2026-11-01' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'From Date must not be later than To Date' });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('series specifics', () => {
  it('SP counts creations by created_at and completions by completed_at', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await sp.getTrend(mkReq(gsa, {}), mkRes());
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("e.status = 'completed' AND e.completed_at IS NOT NULL AND e.completed_at >=");
  });

  it('PE splits manual and Excel-imported records', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await pe.getTrend(mkReq(gsa, {}), mkRes());
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("COUNT(*) FILTER (WHERE p.source = 'manual') AS manual");
    expect(sql).toContain("COUNT(*) FILTER (WHERE p.source = 'excel_import') AS excel_import");
  });
});
