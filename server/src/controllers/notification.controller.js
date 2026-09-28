/**
 * Controller Quản lý Thông báo Người dùng (Notification Management).
 * Hỗ trợ lấy danh sách thông báo cá nhân, đếm số lượng chưa đọc và đánh dấu đã đọc.
 */

import { notificationService } from '../services/notification.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ApiError } from '../utils/api-error.js';

export const notificationController = {
  // Lấy danh sách thông báo gửi tới người dùng đang đăng nhập
  list: asyncHandler(async (req, res) => {
    const data = await notificationService.listForUser(req.auth.userId);
    res.json({ success: true, message: 'OK', data });
  }),

  // Đếm số lượng thông báo chưa đọc
  unreadCount: asyncHandler(async (req, res) => {
    const count = await notificationService.countUnread(req.auth.userId);
    res.json({ success: true, message: 'OK', data: { count } });
  }),

  // Đánh dấu một thông báo cụ thể là đã đọc
  markRead: asyncHandler(async (req, res) => {
    const data = await notificationService.markAsRead(req.params.id, req.auth.userId);
    if (!data) {
      throw new ApiError(404, 'Không tìm thấy thông báo', 'NOTIFICATION_NOT_FOUND');
    }
    res.json({ success: true, message: 'Đã đánh dấu đã đọc', data });
  }),

  // Đánh dấu tất cả thông báo của người dùng là đã đọc
  markAllRead: asyncHandler(async (req, res) => {
    await notificationService.markAllAsRead(req.auth.userId);
    res.json({ success: true, message: 'Đã đánh dấu tất cả đã đọc' });
  }),
};