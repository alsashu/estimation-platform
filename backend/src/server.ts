import 'express-async-errors';
import dotenv from 'dotenv';
import app from './app';
import { initDatabase } from './db/init';
import { logger } from './logger';

dotenv.config();

const PORT = process.env.PORT ?? 4000;

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
