import { Router } from 'express';
import * as roleController from '../controllers/role.controller.js';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { requirePasswordChanged } from '../middlewares/require-password-changed.middleware.js';

const router = Router();
const adminOnly = requireRoleCodes('admin');

router.use(authenticate, adminOnly, requirePasswordChanged);

router.get('/', roleController.list);

export default router;
