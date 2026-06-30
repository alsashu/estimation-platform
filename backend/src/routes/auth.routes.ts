import { Router } from 'express';
import * as auth from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { authLimiter, registrationLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/login',           authLimiter, auth.login);
router.post('/refresh',         auth.refreshToken);
router.post('/logout',          authenticate, auth.logout);
router.get ('/me',              authenticate, auth.me);
router.post('/change-password', authenticate, auth.changePassword);
router.post('/forgot-password', authLimiter, auth.forgotPassword);
router.post('/reset-password',  authLimiter, auth.resetPassword);
router.get ('/generate-password', auth.generatePassword);
router.post('/register',        registrationLimiter, auth.register);

export default router;
