import { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { signAccessToken } from '../../auth/jwt';

function mockReq(authHeader?: string): Partial<Request> {
  return { headers: authHeader ? { authorization: authHeader } : {} } as Partial<Request>;
}

function mockRes(): { status: jest.Mock; json: jest.Mock } {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  return res;
}

const next: NextFunction = jest.fn();

const payload = {
  userId: 'u1', email: 'a@b.com', username: 'tester',
  roles: ['User'], permissions: ['estimation.read'], projectIds: ['p1'] as string[],
};

describe('authenticate middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets req.user for valid Bearer token', () => {
    const token = signAccessToken(payload);
    const req = mockReq(`Bearer ${token}`) as Request;
    const res = mockRes() as unknown as Response;
    authenticate(req, res, next);
    expect(req.user?.userId).toBe('u1');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when no Authorization header', () => {
    const req = mockReq() as Request;
    const res = mockRes() as unknown as Response;
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for non-Bearer scheme', () => {
    const req = mockReq('Basic abc123') as Request;
    const res = mockRes() as unknown as Response;
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 for invalid token', () => {
    const req = mockReq('Bearer invalid.jwt.token') as Request;
    const res = mockRes() as unknown as Response;
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 for expired / tampered token', () => {
    const token = signAccessToken(payload);
    const tampered = token.slice(0, -5) + 'XXXXX';
    const req = mockReq(`Bearer ${tampered}`) as Request;
    const res = mockRes() as unknown as Response;
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
