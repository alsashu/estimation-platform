import { Router } from 'express';
import * as perf from '../controllers/performance.controller';
import { authorize, authorizeAny } from '../middleware/authorize';

/** Estimation Performance dashboard. Reading needs SP or PE read access; data is further limited per method. */
const router = Router();
const read = authorizeAny('estimation.read', 'parametric.read');
const manage = authorize('performance.baseline.manage');

router.get  ('/performance/dashboard',              read, perf.getDashboard);
router.get  ('/performance/breakdown',              read, perf.getBreakdown);
router.get  ('/performance/baselines',              read, perf.listBaselines);
router.post ('/performance/baselines',              read, manage, perf.createBaseline);
router.put  ('/performance/baselines/:id',          read, manage, perf.updateBaseline);
router.patch('/performance/baselines/:id/status',   read, manage, perf.setBaselineStatus);
router.get  ('/performance/settings',               read, perf.getSettings);
router.put  ('/performance/settings',               read, manage, perf.updateSettings);
router.get  ('/performance/snapshots',              read, perf.listSnapshots);
router.post ('/performance/snapshots',              read, perf.createSnapshot);
router.get  ('/performance/snapshots/:id',          read, perf.getSnapshot);

export default router;
