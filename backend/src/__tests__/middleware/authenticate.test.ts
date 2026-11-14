import { Request, Response, NextFunction } from 'express';
import { signAccessToken, type JwtPayload } from '../../auth/jwt';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
import { query } from '../../config/database';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { invalidateUserModules } from '../../services/estimationAccess.service';
const mockQuery = query as jest.Mock;

function mockReq(authHeader?: string): Request {
  return { headers: authHeader ? { authorization: authHeader } : {} } as unknown as Request;
}
function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader: jest.fn() } as unknown as Response & {
    status: jest.Mock; json: jest.Mock; setHeader: jest.Mock;
  };
}

const ROLE_PERMS = ['estimation.read', 'estimation.create', 'master.read', 'parametric.read', 'parametric.import', 'parametric.master.read', 'user.read', 'department.read'];
const payload: JwtPayload = {
  userId: 'u1', email: 'a@b.com', username: 'tester',
  roles: ['Admin'], permissions: ROLE_PERMS, projectIds: ['p1'], modules: ['SP', 'PE'],
};
const rows = (...m: string[]) => m.map(module_code => ({ module_code }));

let next: jest.Mock;
beforeEach(() => { mockQuery.mockReset(); invalidateUserModules(); next = jest.fn(); });

async function run(token: string) {
  const req = mockReq(`Bearer ${token}`);
  const res = mockRes();
  await authenticate(req, res, next as unknown as NextFunction);
  return { req, res };
}

describe('authenticate middleware', () => {
  it('sets req.user for a valid Bearer token', async () => {
    mockQuery.mockResolvedValueOnce(rows('SP', 'PE'));
    const { req, res } = await run(signAccessToken(payload));
    expect(req.user?.userId).toBe('u1');
    expect(req.user?.modules).toEqual(['SP', 'PE']);
    expect(req.user?.permissions).toEqual(ROLE_PERMS);
    expect(next).toHaveBeenCalledWith();
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('SP-only user loses every PE permission (role unchanged)', async () => {
    mockQuery.mockResolvedValueOnce(rows('SP'));
    const { req } = await run(signAccessToken({ ...payload, modules: ['SP'] }));
    expect(req.user?.permissions).toEqual(['estimation.read', 'estimation.create', 'master.read', 'user.read', 'department.read']);
  });

  it('PE-only user loses every SP permission, including SP master data', async () => {
    mockQuery.mockResolvedValueOnce(rows('PE'));
    const { req } = await run(signAccessToken({ ...payload, modules: ['PE'] }));
    expect(req.user?.permissions).toEqual(['parametric.read', 'parametric.import', 'parametric.master.read', 'user.read', 'department.read']);
  });

  it('applies a revocation immediately even though the token still lists the module', async () => {
    mockQuery.mockResolvedValueOnce(rows('SP'));      // PE was revoked after the token was issued
    const { req, res } = await run(signAccessToken(payload));
    expect(req.user?.modules).toEqual(['SP']);
    expect(req.user?.permissions).not.toContain('parametric.read');
    expect(res.setHeader).toHaveBeenCalledWith('X-Access-Changed', 'SP');
  });

  it('applies a new grant immediately (token issued before the grant)', async () => {
    mockQuery.mockResolvedValueOnce(rows('SP', 'PE'));
    const { req, res } = await run(signAccessToken({ ...payload, modules: ['SP'] }));
    expect(req.user?.permissions).toContain('parametric.read');
    expect(res.setHeader).toHaveBeenCalledWith('X-Access-Changed', 'SP,PE');
  });

  it('a user with no modules keeps only non-module permissions', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const { req } = await run(signAccessToken({ ...payload, modules: [] }));
    expect(req.user?.permissions).toEqual(['user.read', 'department.read']);
  });

  it('Global Super Admin always has both modules without a lookup', async () => {
    const { req } = await run(signAccessToken({ ...payload, roles: ['Global Super Admin'], modules: ['SP', 'PE'] }));
    expect(mockQuery).not.toHaveBeenCalled();
    expect(req.user?.modules).toEqual(['SP', 'PE']);
  });

  it('caches the lookup and re-reads after invalidation', async () => {
    mockQuery.mockResolvedValue(rows('SP', 'PE'));
    const token = signAccessToken(payload);
    await run(token); await run(token);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    invalidateUserModules('u1');
    await run(token);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the module lookup fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const { req } = await run(signAccessToken(payload));
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('end-to-end with authorize: PE API → 403 for an SP-only user, 200 path for PE', async () => {
    mockQuery.mockResolvedValueOnce(rows('SP'));
    const { req } = await run(signAccessToken(payload));
    const res = mockRes();
    const after = jest.fn();
    authorize('parametric.read')(req, res, after);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(after).not.toHaveBeenCalled();
    authorize('estimation.read')(req, mockRes(), after);
    expect(after).toHaveBeenCalled();
  });

  it.each([
    ['no Authorization header', undefined],
    ['non-Bearer scheme', 'Basic abc123'],
    ['invalid token', 'Bearer invalid.jwt.token'],
  ])('returns 401 for %s', async (_l, header) => {
    const req = mockReq(header);
    const res = mockRes();
    await authenticate(req, res, next as unknown as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for a tampered token (e.g. modules edited client-side)', async () => {
    const token = signAccessToken({ ...payload, modules: ['SP'] });
    const [h, , sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, modules: ['SP', 'PE'], roles: ['Global Super Admin'] })).toString('base64url');
    const { res } = await run(`${h}.${forged}.${sig}`);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
