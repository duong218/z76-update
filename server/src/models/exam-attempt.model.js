import mongoose from 'mongoose';
import { ATTEMPT_STATUS, ATTEMPT_TYPE } from './constants.js';

const examAttemptSchema = new mongoose.Schema(
  {
    examCandidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExamCandidate',
      required: true,
      index: true,
    },
    attemptType: {
      type: String,
      enum: Object.values(ATTEMPT_TYPE),
      required: true,
    },
    /**
     * MỚI — Phòng ban (vai trò) mà thí sinh thi ở LƯỢT THI này, ghi lại lúc bắt đầu lượt thi.
     * Báo cáo tính điểm theo phòng ban này (không theo phòng chính hiện tại của nhân viên) nên điểm luôn
     * hiện đúng vai trò đã thi, kể cả khi Người duyệt đề đổi vai trò cho lượt thi lại sau đó.
     * Lượt thi cũ (trước khi có trường này) để trống -> báo cáo dùng phòng chính của nhân viên như trước.
     */
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      index: true,
    },
    startedAt: { type: Date, required: true, default: Date.now },
    submittedAt: { type: Date },
    status: {
      type: String,
      enum: Object.values(ATTEMPT_STATUS),
      default: ATTEMPT_STATUS.IN_PROGRESS,
      index: true,
    },
    /** Token phiên thi — khác accessToken JWT đăng nhập (GLOSSARY.md) */
    examSessionTokenHash: { type: String, select: false },
    expiresAt: { type: Date },
    /**
     * Cập nhật mỗi lần server nhận được heartbeat / getMyExam / answer cho lượt
     * thi này trong lúc đang in_progress. Dùng để phát hiện thí sinh đã rời
     * trang thi quá lâu mà không quay lại (xem checkAndAutoSubmitIfInactive
     * trong exam-attempt.service.js).
     */
    lastActiveAt: { type: Date },
    /**
     * Lý do nếu lượt thi bị HỆ THỐNG tự động nộp thay vì thí sinh tự bấm nộp.
     * Để trống (undefined) nếu là nộp bài bình thường.
     * - inactive_timeout: rời ca thi quá 1 phút.
     * - exam_replaced: Người duyệt đề đăng kỳ thi mới (ép đăng) khi thí sinh đang làm bài -> kỳ thi cũ bị lưu trữ,
     *   hệ thống nộp và chấm bài với các đáp án đã tự lưu.
     * - exam_ended: kỳ thi hết hạn (quá endDate, tự động lưu trữ) mà lượt thi còn dở dang quá giờ làm bài -> hệ thống nộp và chấm.
     */
    autoSubmitReason: {
      type: String,
      enum: ['inactive_timeout', 'exam_replaced', 'exam_ended'],
    },
    /**
     * Số lần thí sinh rời màn hình thi trong lúc làm bài (chuyển tab / ứng dụng, khóa màn hình...).
     * Chỉ để Người duyệt đề xem dấu hiệu bất thường (AnomalyTab), KHÔNG ảnh hưởng điểm hay cơ chế tự nộp bài.
     * Lượt thi cũ (trước khi có trường này) để trống -> coi như 0.
     */
    leaveCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

examAttemptSchema.index(
  { examCandidateId: 1, attemptType: 1, status: 1 },
);

export const ExamAttempt = mongoose.model('ExamAttempt', examAttemptSchema);