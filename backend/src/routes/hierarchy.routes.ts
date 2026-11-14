import { Router } from 'express';
import * as dept from '../controllers/departments.controller';
import * as bl from '../controllers/baselines.controller';
import * as lookup from '../controllers/hierarchyLookup.controller';
import * as effort from '../controllers/effort.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize, authorizeAny } from '../middleware/authorize';

const router = Router();
router.use(authenticate);

// ─── Departments ──────────────────────────────────────────────────────────────
router.get   ('/departments',                  authorize('department.read'),   dept.listDepartments);
router.get   ('/departments/:id',              authorize('department.read'),   dept.getDepartment);
router.post  ('/departments',                  authorize('department.create'), dept.createDepartment);
router.put   ('/departments/:id',              authorize('department.update'), dept.updateDepartment);
router.patch ('/departments/:id/status',       authorize('department.update'), dept.setDepartmentStatus);
router.get   ('/departments/:id/users',        authorize('department.read'),   dept.listDepartmentUsers);
router.post  ('/departments/:id/users',        authorize('department.assign'), dept.assignDepartmentUsers);
router.delete('/departments/:id/users/:userId', authorize('department.assign'), dept.removeDepartmentUser);

// ─── Baselines ────────────────────────────────────────────────────────────────
router.get   ('/baselines',              authorize('baseline.read'),   bl.listBaselines);
router.get   ('/baselines/:id',          authorize('baseline.read'),   bl.getBaseline);
router.post  ('/baselines',              authorize('baseline.create'), bl.createBaseline);
router.put   ('/baselines/:id',          authorize('baseline.update'), bl.updateBaseline);
router.patch ('/baselines/:id/status',   authorize('baseline.update'), bl.setBaselineStatus);
router.delete('/baselines/:id',          authorize('baseline.delete'), bl.deleteBaseline);

// ─── Components / Subcomponents (optional levels) ─────────────────────────────
router.get   ('/components',             authorize('baseline.read'),    bl.listComponents);
router.post  ('/components',             authorize('component.manage'), bl.createComponent);
router.put   ('/components/:id',         authorize('component.manage'), bl.updateComponent);
router.delete('/components/:id',         authorize('component.manage'), bl.deleteComponent);
router.get   ('/subcomponents',          authorize('baseline.read'),    bl.listSubcomponents);
router.post  ('/subcomponents',          authorize('component.manage'), bl.createSubcomponent);
router.put   ('/subcomponents/:id',      authorize('component.manage'), bl.updateSubcomponent);
router.delete('/subcomponents/:id',      authorize('component.manage'), bl.deleteSubcomponent);

// ─── Header context + cascading dropdown lookups (any authenticated user, permission-filtered) ──
router.get('/hierarchy/context',               lookup.getMyContext);
router.get('/hierarchy/lookup/departments',    lookup.lookupDepartments);
router.get('/hierarchy/lookup/programs',       lookup.lookupPrograms);
router.get('/hierarchy/lookup/baselines',      lookup.lookupBaselines);
router.get('/hierarchy/lookup/components',     lookup.lookupComponents);
router.get('/hierarchy/lookup/subcomponents',  lookup.lookupSubcomponents);

// ─── Estimated vs Actual aggregation ──────────────────────────────────────────
router.get('/hierarchy/effort', authorizeAny('estimation.read', 'parametric.read'), (req, res, next) => {
  // Module-specific read permission: SP needs estimation.read, PE needs parametric.read
  const needed = req.query.module === 'pe' ? 'parametric.read' : 'estimation.read';
  if (!req.user!.permissions.includes(needed)) {
    res.status(403).json({ success: false, error: 'Insufficient permissions' });
    return;
  }
  next();
}, effort.getEffort);

export default router;
