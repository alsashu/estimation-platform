import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
      startTime: number;
    }
  }
}

// Paths that should not be logged (too noisy)
const SILENT_PATHS = new Set(['/health', '/health/live', '/health/ready']);

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  req.startTime = Date.now();
  res.setHeader('X-Correlation-Id', req.correlationId);

  const { method, originalUrl: url, ip } = req;
  const userAgent = req.headers['user-agent'];

  if (!SILENT_PATHS.has(url)) {
    logger.http(`→ ${method} ${url}`, {
      category: 'api',
      correlationId: req.correlationId,
      method,
      url,
      ip,
      userAgent,
    });
  }

  res.on('finish', () => {
    const responseTimeMs = Date.now() - req.startTime;
    const { statusCode } = res;

    if (SILENT_PATHS.has(url)) return;

    const level =
      statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'http';

    logger[level](`← ${method} ${url} ${statusCode} ${responseTimeMs}ms`, {
      category: 'api',
      correlationId: req.correlationId,
      method,
      url,
      statusCode,
      responseTimeMs,
      ip,
      userAgent,
      ...(statusCode >= 500 && { errorStack: `HTTP ${statusCode} on ${method} ${url}` }),
    });
  });

  next();
}
