import { Request, Response } from 'express';
import { pool } from '../config/database';
import { logger } from '../logger';
import os from 'os';
import fs from 'fs';
import path from 'path';

interface ServiceCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTimeMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

async function checkDatabase(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const result = await pool.query(
      'SELECT NOW() AS server_time, version() AS pg_version',
    );
    const row = result.rows[0] as { server_time: Date; pg_version: string };
    return {
      status: 'healthy',
      responseTimeMs: Date.now() - start,
      details: {
        serverTime: row.server_time,
        pgVersion: row.pg_version.split(' ').slice(0, 2).join(' '),
        poolTotal: pool.totalCount,
        poolIdle: pool.idleCount,
        poolWaiting: pool.waitingCount,
      },
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      responseTimeMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Database unreachable',
    };
  }
}

function checkMemory(): ServiceCheck {
  const { heapUsed, heapTotal, rss, external } = process.memoryUsage();
  const usagePct = (heapUsed / heapTotal) * 100;
  return {
    status: usagePct > 90 ? 'unhealthy' : usagePct > 70 ? 'degraded' : 'healthy',
    responseTimeMs: 0,
    details: {
      heapUsedMb: Math.round(heapUsed / 1048576),
      heapTotalMb: Math.round(heapTotal / 1048576),
      rssMb: Math.round(rss / 1048576),
      externalMb: Math.round(external / 1048576),
      usagePercent: Math.round(usagePct),
    },
  };
}

function checkSystem(): ServiceCheck {
  const load = os.loadavg();
  const cpus = os.cpus().length;
  const loadPct = (load[0] / cpus) * 100;
  return {
    status: loadPct > 90 ? 'unhealthy' : loadPct > 70 ? 'degraded' : 'healthy',
    responseTimeMs: 0,
    details: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpuCount: cpus,
      loadAvg1m: +load[0].toFixed(2),
      loadAvg5m: +load[1].toFixed(2),
      loadAvg15m: +load[2].toFixed(2),
      totalMemoryMb: Math.round(os.totalmem() / 1048576),
      freeMemoryMb: Math.round(os.freemem() / 1048576),
    },
  };
}

async function checkLogStorage(): Promise<ServiceCheck> {
  const start = Date.now();
  const logsDir = path.join(process.cwd(), 'logs');
  try {
    await fs.promises.access(logsDir, fs.constants.W_OK);
    const files = await fs.promises.readdir(logsDir);
    let totalBytes = 0;
    for (const f of files) {
      try {
        const stat = await fs.promises.stat(path.join(logsDir, f));
        totalBytes += stat.size;
      } catch {}
    }
    return {
      status: 'healthy',
      responseTimeMs: Date.now() - start,
      details: {
        directory: logsDir,
        fileCount: files.length,
        totalSizeMb: +(totalBytes / 1048576).toFixed(2),
      },
    };
  } catch {
    return {
      status: 'degraded',
      responseTimeMs: Date.now() - start,
      message: 'Log directory not accessible — file logging disabled',
    };
  }
}

async function checkLogDatabase(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '1 hour')::int AS last_hour,
              COUNT(*) FILTER (WHERE level = 'error' AND timestamp > NOW() - INTERVAL '24 hours')::int AS errors_24h
       FROM app_logs`,
    );
    const row = result.rows[0] as { total: number; last_hour: number; errors_24h: number };
    return {
      status: 'healthy',
      responseTimeMs: Date.now() - start,
      details: row,
    };
  } catch {
    return {
      status: 'degraded',
      responseTimeMs: Date.now() - start,
      message: 'app_logs table not yet initialised',
    };
  }
}

export async function getDetailedHealth(_req: Request, res: Response): Promise<void> {
  const start = Date.now();

  const [database, logStorage, logDatabase] = await Promise.all([
    checkDatabase(),
    checkLogStorage(),
    checkLogDatabase(),
  ]);
  const memory = checkMemory();
  const system = checkSystem();

  const services = { api: { status: 'healthy' as const, responseTimeMs: 0 }, database, memory, system, logStorage, logDatabase };
  const statuses = Object.values(services).map((s) => s.status);
  const overall = statuses.includes('unhealthy') ? 'unhealthy' : statuses.includes('degraded') ? 'degraded' : 'healthy';

  logger.info(`Health check: ${overall}`, { category: 'system' });

  res.status(overall === 'unhealthy' ? 503 : 200).json({
    status: overall,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    version: '1.0.0',
    environment: process.env.NODE_ENV ?? 'development',
    responseTimeMs: Date.now() - start,
    services,
  });
}

export function getLiveness(_req: Request, res: Response): void {
  res.json({ status: 'alive', timestamp: new Date().toISOString(), uptime: process.uptime() });
}

export async function getReadiness(_req: Request, res: Response): Promise<void> {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'not-ready', timestamp: new Date().toISOString(), reason: 'database unavailable' });
  }
}
