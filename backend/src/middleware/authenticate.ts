import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../auth/jwt';
import { getEffectiveModules, filterPermissionsByModules, sameModules } from '../services/estimationAccess.service';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Response header sent when the caller's live module access differs from their token. Its value is the live
 * module list ("SP,PE", "PE", "none") so the client can update its navigation via /auth/me only when needed.
 */
export const ACCESS_CHANGED_HEADER = 'X-Access-Changed';

/**
 * Verifies the Bearer token, then applies estimation module access LIVE:
 * `req.user.modules` comes from the database (short cache) and `req.user.permissions` loses every
 * permission of a module the user does not currently hold. The token carries role permissions only,
 * so neither an old token nor a tampered client state can widen access.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }
  let payload: JwtPayload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return;
  }

  try {
    const modules = await getEffectiveModules(payload.userId, payload.roles ?? []);
    if (!sameModules(payload.modules ?? [], modules)) res.setHeader(ACCESS_CHANGED_HEADER, modules.join(',') || 'none');
    req.user = {
      ...payload,
      modules,
      permissions: filterPermissionsByModules(payload.permissions ?? [], modules),
    };
    next();
  } catch (err) {
    next(err); // fail closed: no module lookup, no access
  }
}
