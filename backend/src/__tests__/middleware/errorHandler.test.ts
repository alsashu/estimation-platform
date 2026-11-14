import { Request, Response } from 'express';
import { z } from 'zod';

jest.mock('../../logger', () => ({ logger: { error: jest.fn(), warn: jest.fn() } }));
import { errorHandler } from '../../middleware/errorHandler';
import { HierarchyError } from '../../services/hierarchy.service';

const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response);
const req = { originalUrl: '/x', method: 'GET' } as Request;

function run(err: unknown) {
  const r = res();
  errorHandler(err as Error, req, r, jest.fn());
  return { status: (r.status as jest.Mock).mock.calls[0][0], body: (r.json as jest.Mock).mock.calls[0][0] };
}

describe('errorHandler', () => {
  it('maps Zod validation errors to 400 with field paths', () => {
    let err: unknown;
    try { z.object({ name: z.string() }).parse({}); } catch (e) { err = e; }
    const { status, body } = run(err);
    expect(status).toBe(400);
    expect(body.error).toContain('name');
  });

  it('honours HierarchyError status codes', () => {
    expect(run(new HierarchyError('nope', 403)).status).toBe(403);
    expect(run(new HierarchyError('bad')).status).toBe(400);
  });

  it.each([
    ['23505', 409],
    ['23503', 400],
    ['23514', 400],
    ['22P02', 400],
  ])('maps PostgreSQL error %s to %i', (code, expected) => {
    expect(run(Object.assign(new Error('pg'), { code })).status).toBe(expected);
  });

  it('defaults to 500', () => {
    expect(run(new Error('boom'))).toEqual({ status: 500, body: { success: false, error: 'boom' } });
  });
});
