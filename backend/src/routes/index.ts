import { Router } from 'express';
import * as sp from '../controllers/masterData.controller';
import * as est from '../controllers/estimations.controller';
import * as analysis from '../controllers/analysis.controller';

const router = Router();

// ─── Master Data: Story Points ──────────────────────────────────────────────
router.get   ('/story-points',       sp.getAllStoryPoints);
router.post  ('/story-points',       sp.createStoryPoint);
router.put   ('/story-points/:id',   sp.updateStoryPoint);
router.delete('/story-points/:id',   sp.deleteStoryPoint);

// ─── Master Data: Effort Estimates ──────────────────────────────────────────
router.get   ('/effort-estimates',       sp.getAllEffortEstimates);
router.post  ('/effort-estimates',       sp.createEffortEstimate);
router.put   ('/effort-estimates/:id',   sp.updateEffortEstimate);
router.delete('/effort-estimates/:id',   sp.deleteEffortEstimate);

// ─── Master Data: Competency ─────────────────────────────────────────────────
router.get('/competency-overheads',         sp.getAllOverheads);
router.put('/competency-overheads/:id',     sp.updateOverhead);
router.get('/competency-definitions',       sp.getAllCompetencyDefs);
router.put('/competency-definitions/:id',   sp.updateCompetencyDef);

// ─── Definitions ─────────────────────────────────────────────────────────────
router.get('/definitions/complexity',  sp.getComplexityDefs);
router.get('/definitions/risk',        sp.getRiskDefs);

// ─── Estimations ─────────────────────────────────────────────────────────────
router.get   ('/estimations/calculate',  est.calculate);
router.get   ('/estimations',            est.getAll);
router.post  ('/estimations',            est.create);
router.get   ('/estimations/:id',        est.getById);
router.put   ('/estimations/:id',        est.update);
router.patch ('/estimations/:id/actuals', est.recordActuals);
router.delete('/estimations/:id',        est.remove);

// ─── Analysis ────────────────────────────────────────────────────────────────
router.get('/analysis/summary',     analysis.getSummary);
router.get('/analysis/complexity',  analysis.getByComplexity);
router.get('/analysis/sp-bands',    analysis.getSPBandSummary);
router.get('/analysis/scatter',     analysis.getScatterData);
router.get('/analysis/trend',       analysis.getTrend);

// ─── Notifications ───────────────────────────────────────────────────────────
router.get  ('/notifications',              sp.getNotifications);
router.patch('/notifications/read-all',     sp.markAllNotificationsRead);
router.patch('/notifications/:id/read',     sp.markNotificationRead);

export default router;
