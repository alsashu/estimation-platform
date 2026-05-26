import { Writable } from 'stream';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { pool } from '../config/database';

// ─── Levels & colours ─────────────────────────────────────────────────────────
const levels = { error: 0, warn: 1, info: 2, http: 3, debug: 4 };
winston.addColors({ error: 'red bold', warn: 'yellow', info: 'green', http: 'magenta', debug: 'cyan' });

const activeLevel = () =>
  process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'http' : 'debug');

// ─── Console format ────────────────────────────────────────────────────────────
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.printf(({ level, message, category, correlationId, timestamp }) => {
    const cat = category ? ` [${String(category)}]` : '';
    const cid = correlationId ? ` (${String(correlationId).slice(0, 8)})` : '';
    const ts = timestamp ? `${String(timestamp).slice(11, 23)} ` : '';
    return `${ts}${level}${cat}${cid}: ${message}`;
  }),
);

const fileFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// ─── PostgreSQL sink (Writable objectMode stream) ─────────────────────────────
const STRIP_ANSI = /\x1b\[[0-9;]*m/g;
const KNOWN = new Set([
  'timestamp', 'level', 'message', 'category', 'correlationId',
  'method', 'url', 'statusCode', 'responseTimeMs', 'ip', 'userAgent', 'errorStack',
]);

const pgStream = new Writable({
  objectMode: true,
  write(info: Record<string, unknown>, _enc: BufferEncoding, done: () => void) {
    done(); // release backpressure immediately

    setImmediate(async () => {
      try {
        const meta: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(info)) {
          if (!KNOWN.has(k)) meta[k] = v;
        }

        await pool.query(
          `INSERT INTO app_logs
             (timestamp, level, category, message, correlation_id,
              method, url, status_code, response_time_ms, ip, user_agent, error_stack, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            info.timestamp ?? new Date().toISOString(),
            String(info.level ?? '').replace(STRIP_ANSI, ''),
            info.category ?? 'general',
            info.message ?? '',
            info.correlationId ?? null,
            info.method ?? null,
            info.url ?? null,
            info.statusCode ?? null,
            info.responseTimeMs ?? null,
            info.ip ?? null,
            info.userAgent ?? null,
            info.errorStack ?? null,
            Object.keys(meta).length ? JSON.stringify(meta) : null,
          ],
        );
      } catch {
        // Silently ignore — logging must never crash the server
      }
    });
  },
});

// ─── Logger ───────────────────────────────────────────────────────────────────
const logsDir = path.join(process.cwd(), 'logs');

export const logger = winston.createLogger({
  level: activeLevel(),
  levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
  ),
  transports: [
    new winston.transports.Console({ format: consoleFormat }),

    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      format: fileFormat,
      maxFiles: '14d',
      zippedArchive: true,
    }),

    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      format: fileFormat,
      maxFiles: '7d',
      zippedArchive: true,
    }),

    new winston.transports.Stream({ stream: pgStream }),
  ],
  exitOnError: false,
});

export type LogCategory = 'api' | 'database' | 'auth' | 'system' | 'job' | 'general';

export interface LogMeta {
  category?: LogCategory;
  correlationId?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  responseTimeMs?: number;
  ip?: string;
  userAgent?: string;
  errorStack?: string;
  [key: string]: unknown;
}
