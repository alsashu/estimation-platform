import { Router } from 'express';
import * as reg from '../controllers/registrations.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.use(authenticate);

router.get ('/',                    authorize('registration.approve'), reg.listRegistrations);
router.get ('/pending-count',       authorize('registration.approve'), reg.getPendingCount);
router.post('/:id/approve',         authorize('registration.approve'), reg.approveRegistration);
router.post('/:id/reject',          authorize('registration.approve'), reg.rejectRegistration);

export default router;
