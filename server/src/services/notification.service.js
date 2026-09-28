/**
 * Service Thông báo Hệ thống (Notification Service).
 * Tự động gửi thông báo theo các sự kiện: Nộp đề xuất thi, Phê duyệt/Từ chối, Công bố kỳ thi và Cảnh báo phát đề lỗi.
 */

import { Notification, User, Role } from '../models/index.js';

function formatDateTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('vi-VN');
}

export const notificationService = {
  // Tạo 1 thông báo cho một người dùng cụ thể
  async create({ recipientUserId, type, title, message, examId }) {
    return Notification.create({ recipientUserId, type, title, message, examId });
  },

  // Tạo hàng loạt thông báo cho danh sách nhiều người nhận
  async createMany(recipientUserIds, { type, title, message, examId }) {
    if (!recipientUserIds?.length) return [];
    const docs = recipientUserIds.map((recipientUserId) => ({
      recipientUserId,
      type,
      title,
      message,
      examId,
    }));
    return Notification.insertMany(docs);
  },

  // Sự kiện: Examiner gửi duyệt đề xuất -> Báo cho tất cả Leader đang hoạt động
  async notifyExamSubmitted(exam) {
    const leaderRole = await Role.findOne({ code: 'leader' }).select('_id').lean();
    if (!leaderRole?._id) return [];

    const leaders = await User.find({ isActive: true, roleId: leaderRole._id })
      .select('_id')
      .lean();
    const recipientIds = leaders.map((u) => u._id);

    return this.createMany(recipientIds, {
      type: 'exam_submitted',
      title: 'Có đề xuất kỳ thi mới chờ duyệt',
      message: `Kỳ thi "${exam.title}" vừa được gửi duyệt, đang chờ bạn phê duyệt hoặc từ chối.`,
      examId: exam._id,
    });
  },

  // Sự kiện: Leader phê duyệt đề xuất -> Báo cho Examiner người tạo đề xuất
  async notifyExamApproved(exam) {
    if (!exam?.createdBy) return null;
    return this.create({
      recipientUserId: exam.createdBy,
      type: 'exam_approved',
      title: 'Đề xuất kỳ thi đã được phê duyệt',
      message: `Kỳ thi "${exam.title}" đã được phê duyệt. Thời gian diễn ra: ${formatDateTime(exam.startDate)} - ${formatDateTime(exam.endDate)}.`,
      examId: exam._id,
    });
  },

  // Sự kiện: Leader từ chối đề xuất -> Báo cho Examiner kèm lý do từ chối
  async notifyExamRejected(exam) {
    if (!exam?.createdBy) return null;
    return this.create({
      recipientUserId: exam.createdBy,
      type: 'exam_rejected',
      title: 'Đề xuất kỳ thi đã bị từ chối',
      message: `Kỳ thi "${exam.title}" đã bị từ chối. Lý do: ${exam.rejectionReason || 'Không có lý do'}.`,
      examId: exam._id,
    });
  },

  // Sự kiện: Leader công bố chính thức kỳ thi -> Báo cho tất cả thí sinh và cán bộ liên quan
  async notifyExamPublished(exam, publisherId) {
    const adminRole = await Role.findOne({ code: 'admin' }).select('_id').lean();

    const query = { isActive: true, _id: { $ne: publisherId } };
    if (adminRole?._id) {
      query.roleId = { $ne: adminRole._id };
    }

    const recipients = await User.find(query).select('_id').lean();
    const recipientIds = recipients.map((u) => u._id);

    return this.createMany(recipientIds, {
      type: 'exam_published',
      title: 'Kỳ thi mới được đăng chính thức',
      message: `Kỳ thi "${exam.title}" đã được đăng chính thức. Thời gian: ${formatDateTime(exam.startDate)} - ${formatDateTime(exam.endDate)}.`,
      examId: exam._id,
    });
  },

  // Cảnh báo: Ngân hàng đề không đủ câu hỏi để gán cho nhân viên mới -> Báo cho Examiner và Admin
  async notifyExamAssignmentFailed({ exam, employee, department, reason }) {
    const adminRole = await Role.findOne({ code: 'admin' }).select('_id').lean();
    const admins = adminRole?._id
      ? await User.find({ isActive: true, roleId: adminRole._id }).select('_id').lean()
      : [];

    const recipientIds = admins.map((u) => u._id);
    if (exam.createdBy) {
      const createdByStr = exam.createdBy.toString();
      if (!recipientIds.some((id) => id.toString() === createdByStr)) {
        recipientIds.push(exam.createdBy);
      }
    }
    if (recipientIds.length === 0) return [];

    const employeeLabel = employee?.fullname || employee?.employeeCode || 'Nhân viên mới';
    const departmentLabel = department?.name || 'phòng ban của nhân viên này';

    return this.createMany(recipientIds, {
      type: 'exam_assignment_failed',
      title: 'Có thí sinh chưa được phát đề thi',
      message: `Thí sinh "${employeeLabel}" (phòng ban "${departmentLabel}") chưa được phát đề cho kỳ thi "${exam.title}" do ngân hàng câu hỏi không đủ số lượng${reason ? ` (${reason})` : ''}. Vui lòng import/bổ sung thêm câu hỏi cho phòng ban này để hệ thống tự động gán đề.`,
      examId: exam._id,
    });
  },

  // Lấy danh sách thông báo theo người nhận
  async listForUser(userId, { limit = 30 } = {}) {
    return Notification.find({ recipientUserId: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('examId', 'title')
      .lean();
  },

  // Đếm số lượng thông báo chưa đọc
  async countUnread(userId) {
    return Notification.countDocuments({ recipientUserId: userId, isRead: false });
  },

  // Đánh dấu 1 thông báo là đã đọc
  async markAsRead(notificationId, userId) {
    return Notification.findOneAndUpdate(
      { _id: notificationId, recipientUserId: userId },
      { $set: { isRead: true } },
      { new: true },
    ).lean();
  },

  // Đánh dấu tất cả thông báo của người dùng là đã đọc
  async markAllAsRead(userId) {
    await Notification.updateMany(
      { recipientUserId: userId, isRead: false },
      { $set: { isRead: true } },
    );
  },
};