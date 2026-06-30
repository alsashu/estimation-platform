import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  email: string;
  username: string;
  roles: string[];
  permissions: string[];
  projectIds: string[] | '*';
}

const ACCESS_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_in_production';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret_change_in_production';
const ACCESS_EXPIRES = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES } as jwt.SignOptions);
}

export function signRefreshToken(payload: Pick<JwtPayload, 'userId' | 'email'>): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): Pick<JwtPayload, 'userId' | 'email'> {
  return jwt.verify(token, REFRESH_SECRET) as Pick<JwtPayload, 'userId' | 'email'>;
}

export function getRefreshExpiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}
