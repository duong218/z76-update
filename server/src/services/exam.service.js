/**
 * Service Quản lý Kỳ thi (Exam Service).
 * Xử lý các nghiệp vụ: Đề xuất kỳ thi, Gửi duyệt, Phê duyệt/Từ chối, Xuất bản kỳ thi (Publish) và Lưu trữ (Archive).
 */

import { Exam, Topic } from '../models/index.js';
import { EXAM_STATUS } from '../models/constants.js';
import { ApiError } from '../utils/api-error.js';
import { generateExamCodesAndAssignCandidates } from './exam-code-generation.service.js';
import { notificationService } from './notification.service.js';

export const examService = {
  // Lấy danh sách kỳ thi theo bộ lọc (trạng thái, người tạo, chủ đề)
  async listExams(filters = {}) {
    const { status, createdBy, topicId } = filters;
    const query = {};
    if (status) query.status = status;
    if (createdBy) query.createdBy = createdBy;
    if (topicId) query.topicId = topicId;

    const exams = await Exam.find(query)
      .populate('topicId', 'name')
      .populate('createdBy', 'username fullName')
      .populate('approvedBy', 'username fullName')
      .sort({ createdAt: -1 })
      .lean();

    return exams;
  },

  // Examiner tạo bản thảo đề xuất kỳ thi mới (DRAFT)
  async createExamProposal(payload, userId) {
    const { title, topicId, durationMinutes, totalQuestions, commonQuestionCount, departmentQuestionCount, passThresholdPercent } = payload;

    const topic = await Topic.findById(topicId);
    if (!topic) throw new ApiError(404, 'Không tìm thấy chủ đề', 'TOPIC_NOT_FOUND');

    const exam = new Exam({
      title,
      topicId,
      durationMinutes,
      totalQuestions,
      commonQuestionCount,
      departmentQuestionCount,
      passThresholdPercent,
      createdBy: userId,
      status: EXAM_STATUS.DRAFT,
    });
    await exam.save();
    return exam;
  },

  // MỚI — Examiner sửa lại đề xuất của chính mình (áp dụng cho đề đang ở
  // trạng thái draft hoặc rejected — cùng điều kiện với submitExamForReview).
  // Sau khi sửa, đề TỰ ĐỘNG quay về draft (kể cả khi đang rejected) và xoá
  // rejectionReason cũ — vì nội dung đã đổi, lý do từ chối trước đó không
  // còn phản ánh đúng đề hiện tại nữa. Examiner cần bấm "Gửi duyệt" lại như
  // bình thường sau khi sửa, KHÔNG tự động gửi duyệt ngay trong hàm này —
  // để họ có cơ hội xem lại lần cuối trước khi gửi.
  async updateExamProposal(examId, payload, userId) {
    const exam = await Exam.findOne({ _id: examId, createdBy: userId });
    if (!exam) throw new ApiError(404, 'Không tìm thấy kỳ thi', 'EXAM_NOT_FOUND');

    if (![EXAM_STATUS.DRAFT, EXAM_STATUS.REJECTED].includes(exam.status)) {
      throw new ApiError(400, 'Kỳ thi không ở trạng thái hợp lệ để chỉnh sửa', 'EXAM_INVALID_STATUS');
    }

    const { title, topicId, durationMinutes, totalQuestions, commonQuestionCount, departmentQuestionCount, passThresholdPercent } = payload;

    if (topicId && String(topicId) !== String(exam.topicId)) {
      const topic = await Topic.findById(topicId);
      if (!topic) throw new ApiError(404, 'Không tìm thấy chủ đề', 'TOPIC_NOT_FOUND');
    }

    exam.title = title;
    exam.topicId = topicId;
    exam.durationMinutes = durationMinutes;
    exam.totalQuestions = totalQuestions;
    exam.commonQuestionCount = commonQuestionCount;
    exam.departmentQuestionCount = departmentQuestionCount;
    exam.passThresholdPercent = passThresholdPercent;
    exam.status = EXAM_STATUS.DRAFT;
    exam.rejectionReason = undefined;

    await exam.save();
    return exam;
  },

  // Examiner gửi duyệt đề xuất kỳ thi -> Chuyển trạng thái sang PENDING_REVIEW và bắn thông báo tới Leader
  async submitExamForReview(examId, userId) {
    const exam = await Exam.findOne({ _id: examId, createdBy: userId });
    if (!exam) throw new ApiError(404, 'Không tìm thấy kỳ thi', 'EXAM_NOT_FOUND');

    if (![EXAM_STATUS.DRAFT, EXAM_STATUS.REJECTED].includes(exam.status)) {
      throw new ApiError(400, 'Kỳ thi không ở trạng thái hợp lệ để gửi duyệt', 'EXAM_INVALID_STATUS');
    }

    exam.status = EXAM_STATUS.PENDING_REVIEW;
    await exam.save();

    try {
      await notificationService.notifyExamSubmitted(exam);
    } catch (err) {
      console.error('notifyExamSubmitted failed:', err);
    }

    return exam;
  },

  // Leader phê duyệt kỳ thi (APPROVED) và ấn định khung thời gian thi
  async approveExam(examId, { startDate, endDate }, leaderId) {
    if (!startDate || !endDate) {
      throw new ApiError(400, 'Vui lòng cung cấp ngày bắt đầu và kết thúc', 'EXAM_DATES_REQUIRED');
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      throw new ApiError(400, 'Ngày kết thúc phải sau ngày bắt đầu', 'EXAM_DATES_INVALID');
    }

    const exam = await Exam.findById(examId);
    if (!exam) throw new ApiError(404, 'Không tìm thấy kỳ thi', 'EXAM_NOT_FOUND');
    if (exam.status !== EXAM_STATUS.PENDING_REVIEW) {
      throw new ApiError(400, 'Kỳ thi không ở trạng thái chờ duyệt', 'EXAM_INVALID_STATUS');
    }

    exam.status = EXAM_STATUS.APPROVED;
    exam.startDate = start;
    exam.endDate = end;
    exam.approvedBy = leaderId;
    exam.approvedAt = new Date();
    await exam.save();

    try {
      await notificationService.notifyExamApproved(exam);
    } catch (err) {
      console.error('notifyExamApproved failed:', err);
    }

    return exam;
  },

  // Leader từ chối đề xuất kỳ thi (REJECTED) kèm lý do
  async rejectExam(examId, rejectionReason, leaderId) {
    if (!rejectionReason?.trim()) {
      throw new ApiError(400, 'Vui lòng cung cấp lý do từ chối', 'REASON_REQUIRED');
    }

    const exam = await Exam.findById(examId);
    if (!exam) throw new ApiError(404, 'Không tìm thấy kỳ thi', 'EXAM_NOT_FOUND');
    if (exam.status !== EXAM_STATUS.PENDING_REVIEW) {
      throw new ApiError(400, 'Kỳ thi không ở trạng thái chờ duyệt', 'EXAM_INVALID_STATUS');
    }

    exam.status = EXAM_STATUS.REJECTED;
    exam.rejectionReason = rejectionReason;
    exam.approvedBy = leaderId;
    await exam.save();

    try {
      await notificationService.notifyExamRejected(exam);
    } catch (err) {
      console.error('notifyExamRejected failed:', err);
    }

    return exam;
  },

  // Công bố kỳ thi chính thức (PUBLISHED): Sinh các bộ mã đề thi, gán thí sinh và lưu trữ kỳ thi cũ
  async publishExam(examId, leaderId) {
    const exam = await Exam.findById(examId);
    if (!exam) throw new ApiError(404, 'Không tìm thấy kỳ thi', 'EXAM_NOT_FOUND');
    if (exam.status !== EXAM_STATUS.APPROVED) {
      throw new ApiError(400, 'Chỉ có thể phát hành kỳ thi đã được duyệt', 'EXAM_INVALID_STATUS');
    }

    // Sinh mã đề và gán thí sinh
    await generateExamCodesAndAssignCandidates(exam);

    // Chuyển kỳ thi đang publish trước đó về trạng thái lưu trữ ARCHIVED
    await Exam.updateMany(
      { status: EXAM_STATUS.PUBLISHED },
      { $set: { status: EXAM_STATUS.ARCHIVED } }
    );

    exam.status = EXAM_STATUS.PUBLISHED;
    exam.publishedAt = new Date();
    await exam.save();

    try {
      await notificationService.notifyExamPublished(exam, leaderId);
    } catch (err) {
      console.error('notifyExamPublished failed:', err);
    }

    return exam;
  },

  // Lưu trữ (ARCHIVE) một kỳ thi đã duyệt mà Leader quyết định không xuất bản nữa
  async archiveExam(examId, leaderId) {
    const exam = await Exam.findById(examId);
    if (!exam) throw new ApiError(404, 'Không tìm thấy kỳ thi', 'EXAM_NOT_FOUND');
    if (exam.status !== EXAM_STATUS.APPROVED) {
      throw new ApiError(400, 'Chỉ có thể bỏ qua kỳ thi đang ở trạng thái chờ phát hành', 'EXAM_INVALID_STATUS');
    }

    exam.status = EXAM_STATUS.ARCHIVED;
    exam.approvedBy = leaderId;
    await exam.save();
    return exam;
  },

  // Lấy kỳ thi đang phát hành chính thức hiện tại
  async getActiveExam() {
    const exam = await Exam.findOne({ status: EXAM_STATUS.PUBLISHED })
      .populate('topicId', 'name')
      .lean();
    return exam;
  },
};