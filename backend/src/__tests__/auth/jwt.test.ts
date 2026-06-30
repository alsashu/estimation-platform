import {
  signAccessToken, signRefreshToken,
  verifyAccessToken, verifyRefreshToken,
  getRefreshExpiryDate, type JwtPayload,
} from '../../auth/jwt';

const basePayload: JwtPayload = {
  userId: 'user-uuid-1',
  email: 'test@example.com',
  username: 'testuser',
  roles: ['User'],
  permissions: ['estimation.read', 'estimation.create'],
  projectIds: ['proj-1', 'proj-2'],
};

describe('JWT utilities', () => {
  describe('signAccessToken / verifyAccessToken', () => {
    it('signs and verifies a valid access token', () => {
      const token = signAccessToken(basePayload);
      expect(typeof token).toBe('string');
      const decoded = verifyAccessToken(token);
      expect(decoded.userId).toBe(basePayload.userId);
      expect(decoded.email).toBe(basePayload.email);
      expect(decoded.permissions).toEqual(basePayload.permissions);
      expect(decoded.projectIds).toEqual(basePayload.projectIds);
    });

    it('throws on tampered access token', () => {
      const token = signAccessToken(basePayload);
      const tampered = token.slice(0, -3) + 'xxx';
      expect(() => verifyAccessToken(tampered)).toThrow();
    });

    it('throws on empty string', () => {
      expect(() => verifyAccessToken('')).toThrow();
    });
  });

  describe('signRefreshToken / verifyRefreshToken', () => {
    it('signs and verifies a valid refresh token', () => {
      const token = signRefreshToken(basePayload);
      expect(typeof token).toBe('string');
      const decoded = verifyRefreshToken(token) as JwtPayload;
      expect(decoded.userId).toBe(basePayload.userId);
    });

    it('throws on tampered refresh token', () => {
      const token = signRefreshToken(basePayload);
      const tampered = token.slice(0, -3) + 'abc';
      expect(() => verifyRefreshToken(tampered)).toThrow();
    });
  });

  describe('Global Super Admin payload', () => {
    it('handles wildcard projectIds', () => {
      const gsa: JwtPayload = { ...basePayload, projectIds: '*' };
      const token = signAccessToken(gsa);
      const decoded = verifyAccessToken(token);
      expect(decoded.projectIds).toBe('*');
    });
  });

  describe('getRefreshExpiryDate', () => {
    it('returns a date approximately 7 days in the future', () => {
      const before = Date.now();
      const expiry = getRefreshExpiryDate();
      const after = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(expiry.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
      expect(expiry.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
    });
  });
});
