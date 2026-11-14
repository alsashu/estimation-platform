import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger';

export interface AppError extends Error {
  statusCode?: number;
  /** PostgreSQL error code (e.g. 23505 unique_violation, 23503 foreign_key_violation) */
  code?: string;
}

/** Maps errors that are really client mistakes (validation / constraint violations) to 4xx. */
function resolveStatus(err: AppError): { status: number; message: string } {
  if (err instanceof ZodError) {
    const message = err.issues
      .map(i => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ');
    return { status: 400, message: message || 'Invalid request' };
  }
  if (err.statusCode) return { status: err.statusCode, message: err.message };
  switch (err.code) {
    case '23505': return { status: 409, message: 'A record with the same unique value already exists' };
    case '23503': return { status: 400, message: 'Invalid reference: the related record does not exist or does not match the hierarchy' };
    case '23514': return { status: 400, message: 'The record violates a data integrity rule' };
    case '22P02': return { status: 400, message: 'Invalid identifier format' };
    default:      return { status: 500, message: err.message || 'Internal Server Error' };
  }
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const { status: statusCode, message } = resolveStatus(err);

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
