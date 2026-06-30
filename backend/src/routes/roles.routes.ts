import { Router } from 'express';
import * as roles from '../controllers/roles.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.use(authenticate);

router.get   ('/permissions',  authorize('permission.read'),   roles.listPermissions);
router.get   ('/',             authorize('role.read'),         roles.listRoles);
router.get   ('/:id',          authorize('role.read'),         roles.getRole);
router.post  ('/',             authorize('role.manage'),       roles.createRole);
router.put   ('/:id',          authorize('role.manage'),       roles.updateRole);
router.delete('/:id',          authorize('role.manage'),       roles.deleteRole);

export default router;
