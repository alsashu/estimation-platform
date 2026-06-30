import { Request, Response, NextFunction } from 'express';

export function authorize(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }
    const userPerms = req.user.permissions ?? [];
    const hasAll = permissions.every(p => userPerms.includes(p));
    if (!hasAll) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export function authorizeAny(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }
    const userPerms = req.user.permissions ?? [];
    const hasAny = permissions.some(p => userPerms.includes(p));
    if (!hasAny) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
