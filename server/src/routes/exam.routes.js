import express from 'express';
import { examController } from '../controllers/exam.controller.js';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { requirePasswordChanged } from '../middlewares/require-password-changed.middleware.js';

const router = express.Router();

// Public route cho Homepage
router.get('/active', examController.getActive);

// Các route yêu cầu đăng nhập
router.use(authenticate);
router.use(requirePasswordChanged);

// Danh sách đề xuất (Leader/Admin xem tất cả, Examiner xem của mình)
router.get('/', requireRoleCodes('admin', 'leader', 'examiner'), examController.list);

// Quyền của Examiner
router.post('/', requireRoleCodes('examiner'), examController.create);
router.patch('/:id', requireRoleCodes('examiner'), examController.update);
router.post('/:id/submit', requireRoleCodes('examiner'), examController.submit);

// Quyền của Leader
router.post('/:id/approve', requireRoleCodes('leader'), examController.approve);
router.post('/:id/reject', requireRoleCodes('leader'), examController.reject);
router.post('/:id/publish', requireRoleCodes('leader'), examController.publish);
router.post('/:id/archive', requireRoleCodes('leader'), examController.archive);

export default router;