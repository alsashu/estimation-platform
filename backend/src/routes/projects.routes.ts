import { Router } from 'express';
import * as proj from '../controllers/projects.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize, authorizeAny } from '../middleware/authorize';

const router = Router();

router.use(authenticate);

router.get   ('/',                         authorize('project.read'),   proj.listProjects);
router.get   ('/:id',                      authorize('project.read'),   proj.getProject);
router.post  ('/',                         authorize('project.create'), proj.createProject);
router.put   ('/:id',                      authorize('project.update'), proj.updateProject);
router.delete('/:id',                      authorize('project.delete'), proj.deleteProject);
router.post  ('/:id/users',                authorize('project.assign'), proj.assignUsers);
router.delete('/:id/users/:userId',        authorize('project.assign'), proj.removeUser);

export default router;
