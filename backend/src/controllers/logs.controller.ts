import { Request, Response } from 'express';
import { pool } from '../config/database';
import { logger } from '../logger';

export async function getLogs(req: Request, res: Response): Promise<void> {
  const {
    level, category, search, from, to, correlationId,
    limit = '100', offset = '0',
  } = req.query as Record<string, string>;

  const conds: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (level && level !== 'all') {
    conds.push(`level = $${p++}`); params.push(level);
  }
  if (category && category !== 'all') {
    conds.push(`category = $${p++}`); params.push(category);
  }
  if (search) {
    conds.push(`(message ILIKE $${p} OR url ILIKE $${p})`);
    params.push(`%${search}%`); p++;
  }
  if (correlationId) {
    conds.push(`correlation_id = $${p++}`); params.push(correlationId);
  }
  if (from) {
    conds.push(`timestamp >= $${p++}`); params.push(new Date(from));
  }
  if (to) {
    conds.push(`timestamp <= $${p++}`); params.push(new Date(to));
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);

  const [dataRes, countRes] = await Promise.all([
    pool.query(
      `SELECT id, timestamp, level, category, message,
              correlation_id AS "correlationId", method, url,
              status_code AS "statusCode", response_time_ms AS "responseTimeMs",
              ip, user_agent AS "userAgent", error_stack AS "errorStack", metadata
       FROM app_logs ${where}
       ORDER BY timestamp DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, lim, off],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM app_logs ${where}`,
      params,
    ),
  ]);

  res.json({
    success: true,
    data: dataRes.rows,
    total: (countRes.rows[0] as { total: number }).total,
    limit: lim,
    offset: off,
  });
}

export async function getLogStats(_req: Request, res: Response): Promise<void> {
  const [byLevel, byCategory, recentErrors, hourlyTrend] = await Promise.all([
    pool.query<{ level: string; count: number }>(
      `SELECT level, COUNT(*)::int AS count
       FROM app_logs WHERE timestamp > NOW() - INTERVAL '24 hours'
       GROUP BY level ORDER BY count DESC`,
    ),
    pool.query<{ category: string; count: number }>(
      `SELECT category, COUNT(*)::int AS count
       FROM app_logs WHERE timestamp > NOW() - INTERVAL '24 hours'
       GROUP BY category ORDER BY count DESC`,
    ),
    pool.query(
      `SELECT id, timestamp, level, message, url,
              status_code AS "statusCode", correlation_id AS "correlationId"
       FROM app_logs
       WHERE level = 'error' AND timestamp > NOW() - INTERVAL '1 hour'
       ORDER BY timestamp DESC LIMIT 10`,
    ),
    pool.query(
      `SELECT DATE_TRUNC('hour', timestamp) AS hour,
              COUNT(*)::int                                           AS total,
              COUNT(*) FILTER (WHERE level = 'error')::int           AS errors,
              COUNT(*) FILTER (WHERE level = 'warn')::int            AS warnings,
              COUNT(*) FILTER (WHERE level = 'http')::int            AS requests,
              COALESCE(AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL), 0)::int AS avg_response_ms
       FROM app_logs
       WHERE timestamp > NOW() - INTERVAL '24 hours'
       GROUP BY hour ORDER BY hour ASC`,
    ),
  ]);

  res.json({
    success: true,
    data: {
      byLevel: byLevel.rows,
      byCategory: byCategory.rows,
      recentErrors: recentErrors.rows,
      hourlyTrend: hourlyTrend.rows,
    },
  });
}

export async function clearOldLogs(req: Request, res: Response): Promise<void> {
  const days = Math.max(Number((req.query as Record<string, string>).days) || 7, 1);
  const result = await pool.query(
    `DELETE FROM app_logs WHERE timestamp < NOW() - ($1 || ' days')::INTERVAL`,
    [days],
  );
  logger.info(`Log cleanup: ${result.rowCount} entries deleted (older than ${days}d)`, {
    category: 'system',
    correlationId: req.correlationId,
  });
  res.json({ success: true, deleted: result.rowCount, olderThanDays: days });
}
