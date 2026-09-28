import express from 'express';
import { auditController } from '../controllers/audit.controller.js';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { requirePasswordChanged } from '../middlewares/require-password-changed.middleware.js';

const router = express.Router();

// Tất cả các route audit-logs đều yêu cầu đăng nhập, đổi password và role admin
router.use(authenticate);
router.use(requirePasswordChanged);
router.use(requireRoleCodes('admin'));

router.get('/', auditController.getAuditLogs);

export default router;
