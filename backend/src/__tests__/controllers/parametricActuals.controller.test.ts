/**
 * PE Estimated & Actual effort: submission, corrections, permissions, validation, audit.
 */
import { Request, Response } from 'express';
import type { JwtPayload } from '../../auth/jwt';
import * as pe from '../../controllers/parametricEstimations.controller';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
jest.mock('../../services/audit.service', () => ({ auditLog: jest.fn().mockResolvedValue(undefined) }));
import { query, queryOne } from '../../config/database';
import { auditLog } from '../../services/audit.service';
const mockQuery = query as jest.Mock;
const mockQueryOne = queryOne as jest.Mock;
const mockAudit = auditLog as jest.Mock;

const P1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const P2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const T1 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const user: JwtPayload = { userId: 'u1', email: 'u@x', username: 'u', roles: ['User'], permissions: ['parametric.create'], projectIds: [P1], departmentIds: ['d'] };
const otherUser: JwtPayload = { ...user, userId: 'u2', username: 'u2' };
const admin: JwtPayload = { ...user, userId: 'a1', username: 'admin', roles: ['Admin'], permissions: ['parametric.create', pe.CORRECT_ACTUALS_PERMISSION] };

const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response);
const req = (u: JwtPayload, body: unknown) =>
  ({ user: u, params: { id: T1 }, body, query: {}, headers: {} } as unknown as Request);

const CREATED = '2026-11-01T10:00:00.000Z';
const openTask = {
  final_estimation: '10.00', task_title: 'API', project_id: P1, created_at: CREATED,
  actual_days: null, actual_notes: null, completed_at: null, actuals_recorded_by: null,
};
const recordedTask = { ...openTask, actual_days: '8.00', actual_notes: 'first', completed_at: '2026-11-05T00:00:00.000Z', actuals_recorded_by: 'u1' };

/** The UPDATE statement's parameters. */
const updateParams = () => {
  const call = mockQuery.mock.calls.find(c => String(c[0]).includes('UPDATE parametric_estimations'));
  if (!call) throw new Error('no UPDATE issued');
  return call[1] as unknown[];
};

beforeEach(() => { mockQuery.mockReset(); mockQueryOne.mockReset(); mockAudit.mockClear(); mockQuery.mockResolvedValue([]); });

describe('PE actuals — first submission', () => {
  it('stores actual PD, derives variance/accuracy/deviation and never writes the estimate', async () => {
    mockQueryOne.mockResolvedValueOnce(openTask).mockResolvedValueOnce({ id: T1, actual_days: 8 });
    const r = res();
    await pe.recordActuals(req(user, { actual_days: 8, notes: '  done  ' }), r);

    const sql = String(mockQuery.mock.calls.find(c => String(c[0]).includes('UPDATE'))![0]);
    expect(sql).not.toMatch(/final_estimation\s*=/);
    expect(sql).not.toMatch(/detailed_estimation|average_estimation|breakdown/);
    const p = updateParams();
    expect(p.slice(0, 5)).toEqual([8, 2, 80, 20, 'done']); // actual, variance (10−8), accuracy, deviation, trimmed notes
    expect(p[6]).toBe('u1');      // updated_by / recorded_by
    expect(p[7]).toBe(false);     // not a correction → recorded_by/at set
    expect(r.json).toHaveBeenCalledWith({ success: true, data: { id: T1, actual_days: 8 } });
  });

  it('writes an "actuals_recorded" audit entry without previous values', async () => {
    mockQueryOne.mockResolvedValueOnce(openTask).mockResolvedValueOnce({});
    await pe.recordActuals(req(user, { actual_days: 12 }), res());
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
      entity: 'parametric_estimation', entityId: T1, action: 'actuals_recorded', previousValue: undefined,
      newValue: expect.objectContaining({ actual_days: 12, estimated_days: 10, variance_days: -2, accuracy_percent: 80, deviation_percent: 20 }),
    }));
  });

  it('handles a zero estimate without dividing by zero', async () => {
    mockQueryOne.mockResolvedValueOnce({ ...openTask, final_estimation: '0' }).mockResolvedValueOnce({});
    await pe.recordActuals(req(user, { actual_days: 4 }), res());
    expect(updateParams().slice(0, 4)).toEqual([4, -4, null, null]);
  });

  it('defaults completion to now when not supplied', async () => {
    mockQueryOne.mockResolvedValueOnce(openTask).mockResolvedValueOnce({});
    const before = Date.now();
    await pe.recordActuals(req(user, { actual_days: 3 }), res());
    expect(new Date(updateParams()[5] as string).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('PE actuals — validation', () => {
  it.each([
    [{}, /number|Required/i],
    [{ actual_days: 0 }, /greater than 0/],
    [{ actual_days: -3 }, /greater than 0/],
    [{ actual_days: '5' }, /number/i],
    [{ actual_days: 1.234 }, /2 decimal places/],
    [{ actual_days: 100001 }, /100,000/],
    [{ actual_days: 2, notes: 'x'.repeat(2001) }, /2,000/],
    [{ actual_days: 2, completed_at: 'yesterday' }, /ISO-8601/],
  ])('rejects %j', async (body, msg) => {
    await expect(pe.recordActuals(req(user, body), res())).rejects.toThrow(msg);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('accepts 2-decimal values like 0.15 despite floating point', async () => {
    mockQueryOne.mockResolvedValueOnce(openTask).mockResolvedValueOnce({});
    await pe.recordActuals(req(user, { actual_days: 0.15 }), res());
    expect(updateParams()[0]).toBe(0.15);
  });

  it('rejects a completion date in the future', async () => {
    mockQueryOne.mockResolvedValueOnce(openTask);
    const r = res();
    await pe.recordActuals(req(user, { actual_days: 2, completed_at: new Date(Date.now() + 86_400_000).toISOString() }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Completion date cannot be in the future' }));
  });

  it('rejects a completion date before the estimate was created', async () => {
    mockQueryOne.mockResolvedValueOnce(openTask);
    const r = res();
    await pe.recordActuals(req(user, { actual_days: 2, completed_at: '2026-10-31' }), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('accepts a date-only completion on the creation day', async () => {
    mockQueryOne.mockResolvedValueOnce(openTask).mockResolvedValueOnce({});
    const r = res();
    await pe.recordActuals(req(user, { actual_days: 2, completed_at: '2026-11-01' }), r);
    expect(r.status).not.toHaveBeenCalled();
  });

  it('404 for an unknown task', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    const r = res();
    await pe.recordActuals(req(user, { actual_days: 2 }), r);
    expect(r.status).toHaveBeenCalledWith(404);
  });

  it('403 for a task in a program the user cannot access', async () => {
    mockQueryOne.mockResolvedValueOnce({ ...openTask, project_id: P2 });
    await expect(pe.recordActuals(req(user, { actual_days: 2 }), res())).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('PE actuals — corrections', () => {
  it('the original recorder can correct their own actuals', async () => {
    mockQueryOne.mockResolvedValueOnce(recordedTask).mockResolvedValueOnce({});
    const r = res();
    await pe.recordActuals(req(user, { actual_days: 9 }), r);
    expect(r.status).not.toHaveBeenCalled();
    const p = updateParams();
    expect(p.slice(0, 5)).toEqual([9, 1, 90, 10, 'first']); // notes omitted → kept
    expect(p[5]).toBe('2026-11-05T00:00:00.000Z');         // completion date kept
    expect(p[7]).toBe(true);                                // correction → updated_by/at set, recorded_by kept
  });

  it('another user without the correction permission gets 403 and nothing is written', async () => {
    mockQueryOne.mockResolvedValueOnce(recordedTask);
    const r = res();
    await pe.recordActuals(req(otherUser, { actual_days: 9 }), r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('a user with parametric.actuals.correct can correct anyone\'s actuals, audited with previous values', async () => {
    mockQueryOne.mockResolvedValueOnce(recordedTask).mockResolvedValueOnce({});
    const r = res();
    await pe.recordActuals(req(admin, { actual_days: 11, notes: 'timesheet fix' }), r);
    expect(r.status).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'actuals_corrected',
      previousValue: { actual_days: 8, notes: 'first', completed_at: '2026-11-05T00:00:00.000Z' },
      newValue: expect.objectContaining({ actual_days: 11, notes: 'timesheet fix', variance_days: -1 }),
    }));
  });

  it('empty notes clear the stored notes', async () => {
    mockQueryOne.mockResolvedValueOnce(recordedTask).mockResolvedValueOnce({});
    await pe.recordActuals(req(user, { actual_days: 8, notes: '' }), res());
    expect(updateParams()[4]).toBeNull();
  });
});
