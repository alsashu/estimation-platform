import { Router } from 'express';
import { getDetailedHealth, getLiveness, getReadiness } from '../controllers/health.controller';
import { getLogs, getLogStats, clearOldLogs } from '../controllers/logs.controller';

const router = Router();

// ─── Health ───────────────────────────────────────────────────────────────────
router.get('/health',       getDetailedHealth);
router.get('/health/live',  getLiveness);
router.get('/health/ready', getReadiness);

// ─── Logs ─────────────────────────────────────────────────────────────────────
router.get   ('/logs',       getLogs);
router.get   ('/logs/stats', getLogStats);
router.delete('/logs',       clearOldLogs);

export default router;
