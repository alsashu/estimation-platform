import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

export interface AppError extends Error {
  statusCode?: number;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`${statusCode} ${message}`, {
    category: 'api',
    correlationId: req.correlationId,
    method: req.method,
    url: req.originalUrl,
    statusCode,
    errorStack: err.stack,
  });

  res.status(statusCode).json({ success: false, error: message });
}

export function notFound(req: Request, res: Response): void {
  logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`, {
    category: 'api',
    correlationId: req.correlationId,
    method: req.method,
    url: req.originalUrl,
    statusCode: 404,
  });
  res.status(404).json({ success: false, error: 'Route not found' });
}
