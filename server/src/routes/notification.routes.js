import express from 'express';
import { notificationController } from '../controllers/notification.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Mọi role đều có chuông thông báo riêng của mình — chỉ cần đăng nhập,
// không giới hạn theo role (khác /api/audit-logs chỉ dành cho admin).
router.use(authenticate);

router.get('/', notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.patch('/:id/read', notificationController.markRead);
router.patch('/read-all', notificationController.markAllRead);

export default router;