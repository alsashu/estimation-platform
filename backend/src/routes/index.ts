import { Router } from 'express';
import * as sp from '../controllers/masterData.controller';
import * as est from '../controllers/estimations.controller';
import * as analysis from '../controllers/analysis.controller';
import * as auditLogs from '../controllers/auditLogs.controller';
import * as pm from '../controllers/parametricMaster.controller';
import * as pe from '../controllers/parametricEstimations.controller';
import * as pa from '../controllers/parametricAnalysis.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

// All estimation platform APIs require authentication
router.use(authenticate);

// ─── Master Data: Story Points ──────────────────────────────────────────────
router.get   ('/story-points',       authorize('master.read'),  sp.getAllStoryPoints);
router.post  ('/story-points',       authorize('master.write'), sp.createStoryPoint);
router.put   ('/story-points/:id',   authorize('master.write'), sp.updateStoryPoint);
router.delete('/story-points/:id',   authorize('master.write'), sp.deleteStoryPoint);

// ─── Master Data: Effort Estimates ──────────────────────────────────────────
router.get   ('/effort-estimates',       authorize('master.read'),  sp.getAllEffortEstimates);
router.post  ('/effort-estimates',       authorize('master.write'), sp.createEffortEstimate);
router.put   ('/effort-estimates/:id',   authorize('master.write'), sp.updateEffortEstimate);
router.delete('/effort-estimates/:id',   authorize('master.write'), sp.deleteEffortEstimate);

// ─── Master Data: Competency ─────────────────────────────────────────────────
router.get('/competency-overheads',         authorize('master.read'),  sp.getAllOverheads);
router.put('/competency-overheads/:id',     authorize('master.write'), sp.updateOverhead);
router.get('/competency-definitions',       authorize('master.read'),  sp.getAllCompetencyDefs);
router.put('/competency-definitions/:id',   authorize('master.write'), sp.updateCompetencyDef);

// ─── Definitions ─────────────────────────────────────────────────────────────
router.get('/definitions/complexity',  authorize('master.read'), sp.getComplexityDefs);
router.get('/definitions/risk',        authorize('master.read'), sp.getRiskDefs);

// ─── Estimations ─────────────────────────────────────────────────────────────
router.get   ('/estimations/calculate',  authorize('estimation.read'),   est.calculate);
router.get   ('/estimations',            authorize('estimation.read'),   est.getAll);
router.post  ('/estimations',            authorize('estimation.create'), est.create);
router.post  ('/estimations/import',     authorize('estimation.import'), est.batchImport);
router.get   ('/estimations/:id',        authorize('estimation.read'),   est.getById);
router.put   ('/estimations/:id',        authorize('estimation.update'), est.update);
router.patch ('/estimations/:id/actuals', authorize('estimation.update'), est.recordActuals);
router.delete('/estimations/:id',        authorize('estimation.delete'), est.remove);

// ─── Parametric Estimation: Master Data ─────────────────────────────────────────
router.get   ('/parametric/average-configs',           authorize('parametric.master.read'),  pm.getAllAverageConfigs);
router.post  ('/parametric/average-configs',           authorize('parametric.master.write'), pm.createAverageConfig);
router.put   ('/parametric/average-configs/:id',       authorize('parametric.master.write'), pm.updateAverageConfig);
router.patch ('/parametric/average-configs/:id/default', authorize('parametric.master.write'), pm.setDefaultAverageConfig);
router.delete('/parametric/average-configs/:id',       authorize('parametric.master.write'), pm.deleteAverageConfig);

router.get   ('/parametric/expert-configs',            authorize('parametric.master.read'),  pm.getAllExpertConfigs);
router.get   ('/parametric/expert-configs/:id',        authorize('parametric.master.read'),  pm.getExpertConfig);
router.post  ('/parametric/expert-configs',            authorize('parametric.master.write'), pm.createExpertConfig);
router.put   ('/parametric/expert-configs/:id',        authorize('parametric.master.write'), pm.updateExpertConfig);
router.patch ('/parametric/expert-configs/:id/default', authorize('parametric.master.write'), pm.setDefaultExpertConfig);
router.delete('/parametric/expert-configs/:id',        authorize('parametric.master.write'), pm.deleteExpertConfig);

// ─── Parametric Estimation ───────────────────────────────────────────────────────
router.post  ('/parametric-estimations/calculate', authorize('parametric.read'),   pe.calculatePreview);
router.get   ('/parametric-estimations',           authorize('parametric.read'),   pe.getAll);
router.post  ('/parametric-estimations',           authorize('parametric.create'), pe.create);
router.post  ('/parametric-estimations/import',    authorize('parametric.import'), pe.batchImport);
router.get   ('/parametric-estimations/:id',       authorize('parametric.read'),   pe.getById);

// ─── Analysis ────────────────────────────────────────────────────────────────
router.get('/analysis/summary',     authorize('estimation.read'), analysis.getSummary);
router.get('/analysis/complexity',  authorize('estimation.read'), analysis.getByComplexity);
router.get('/analysis/sp-bands',    authorize('estimation.read'), analysis.getSPBandSummary);
router.get('/analysis/scatter',     authorize('estimation.read'), analysis.getScatterData);
router.get('/analysis/trend',       authorize('estimation.read'), analysis.getTrend);

// ─── Parametric Analysis ──────────────────────────────────────────────────────
router.get('/parametric-analysis/summary',           authorize('parametric.read'), pa.getSummary);
router.get('/parametric-analysis/size-distribution',  authorize('parametric.read'), pa.getSizeDistribution);
router.get('/parametric-analysis/work-group',         authorize('parametric.read'), pa.getByWorkGroup);
router.get('/parametric-analysis/config',             authorize('parametric.read'), pa.getByConfig);
router.get('/parametric-analysis/trend',              authorize('parametric.read'), pa.getTrend);

// ─── Notifications (user-scoped) ─────────────────────────────────────────────
router.get  ('/notifications',              sp.getNotifications);
router.patch('/notifications/read-all',     sp.markAllNotificationsRead);
router.patch('/notifications/:id/read',     sp.markNotificationRead);

// ─── Audit Logs ───────────────────────────────────────────────────────────────
router.get('/audit-logs', authorize('audit.read'), auditLogs.listAuditLogs);

export default router;
