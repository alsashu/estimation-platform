import { Router } from 'express';
import * as users from '../controllers/users.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.use(authenticate);

router.get   ('/',                    authorize('user.read'),     users.listUsers);
router.get   ('/:id',                 authorize('user.read'),     users.getUser);
router.post  ('/',                    authorize('user.create'),   users.createUser);
router.put   ('/:id',                 authorize('user.update'),   users.updateUser);
router.patch ('/:id/active',          authorize('user.activate'), users.setUserActive);
router.delete('/:id',                 authorize('user.delete'),   users.deleteUser);
router.post  ('/:id/reset-password',  authorize('user.update'),   users.adminResetPassword);

export default router;
