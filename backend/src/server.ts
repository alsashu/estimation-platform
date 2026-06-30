import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';

import { initDatabase } from './db/init';
import routes from './routes/index';
import monitoringRoutes from './routes/monitoring.routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/users.routes';
import projectRoutes from './routes/projects.routes';
import roleRoutes from './routes/roles.routes';
import registrationRoutes from './routes/registrations.routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { apiLimiter } from './middleware/rateLimiter';
import { logger } from './logger';
import { swaggerSpec } from './config/swagger';

dotenv.config();

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const app = express();
const PORT = process.env.PORT ?? 4000;

// ─── Security & parsing ───────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
        connectSrc: ["'self'"],
      },
    },
  }),
);
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
  exposedHeaders: ['X-Correlation-Id'],
}));
app.use(express.json({ limit: '10mb' }));

// ─── Request logging ─────────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Swagger UI ───────────────────────────────────────────────────────────────
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Estimation Platform — API Docs',
    customCss: `.swagger-ui .topbar { background: #1E3246; } .swagger-ui .topbar .link { display: none; } .swagger-ui .info .title { color: #1E3246; }`,
    swaggerOptions: { persistAuthorization: true, tryItOutEnabled: true, displayRequestDuration: true, filter: true },
  }),
);
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

// ─── Liveness ─────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() }),
);

// ─── Auth routes (public — rate limiting applied per route) ──────────────────
app.use('/api/auth', authRoutes);

// ─── Protected API routes ─────────────────────────────────────────────────────
app.use('/api', apiLimiter, routes);
app.use('/api/monitoring', monitoringRoutes);

// ─── Enterprise management routes ────────────────────────────────────────────
app.use('/api/users',         userRoutes);
app.use('/api/projects',      projectRoutes);
app.use('/api/roles',         roleRoutes);
app.use('/api/registrations', registrationRoutes);

// ─── 404 & global error handler ──────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  try {
    logger.info('Starting Estimation Platform (Enterprise)...', { category: 'system' });
    await initDatabase();
    logger.info('Database initialised', { category: 'database' });

    app.listen(PORT, () => {
      logger.info(`API server listening on http://localhost:${PORT}`, { category: 'system' });
      logger.info(`Swagger UI available at http://localhost:${PORT}/api-docs`, { category: 'system' });
      logger.info(`Health check at http://localhost:${PORT}/api/monitoring/health`, { category: 'system' });
    });
  } catch (err) {
    logger.error('Failed to start server', {
      category: 'system',
      errorStack: err instanceof Error ? err.stack : String(err),
    });
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`, { category: 'system', errorStack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${String(reason)}`, { category: 'system' });
});

start();
