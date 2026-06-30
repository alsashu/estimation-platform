import { Request, Response, NextFunction } from 'express';
import { authorize, authorizeAny } from '../../middleware/authorize';
import type { JwtPayload } from '../../auth/jwt';

function mockReqWithUser(permissions: string[]): Partial<Request> {
  return {
    user: {
      userId: 'u1', email: 'a@b.com', username: 'u',
      roles: ['Admin'], permissions, projectIds: '*',
    } as JwtPayload,
  };
}

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('authorize middleware', () => {
  const next = jest.fn() as NextFunction;
  beforeEach(() => jest.clearAllMocks());

  describe('authorize (all permissions required)', () => {
    it('calls next when user has all required permissions', () => {
      const req = mockReqWithUser(['user.read', 'user.create']) as Request;
      const res = mockRes() as unknown as Response;
      authorize('user.read', 'user.create')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('returns 403 when user is missing one permission', () => {
      const req = mockReqWithUser(['user.read']) as Request;
      const res = mockRes() as unknown as Response;
      authorize('user.read', 'user.create')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when user has no permissions', () => {
      const req = mockReqWithUser([]) as Request;
      const res = mockRes() as unknown as Response;
      authorize('user.read')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 401 when req.user is undefined', () => {
      const req = {} as Request;
      const res = mockRes() as unknown as Response;
      authorize('user.read')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('authorizeAny (any one permission sufficient)', () => {
    it('calls next when user has at least one required permission', () => {
      const req = mockReqWithUser(['project.read']) as Request;
      const res = mockRes() as unknown as Response;
      authorizeAny('user.read', 'project.read')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('returns 403 when user has none of the required permissions', () => {
      const req = mockReqWithUser(['estimation.read']) as Request;
      const res = mockRes() as unknown as Response;
      authorizeAny('user.read', 'user.create')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
