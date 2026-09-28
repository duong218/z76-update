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
     */
    autoSubmitReason: {
      type: String,
      enum: ['inactive_timeout'],
    },
  },
  { timestamps: true },
);

examAttemptSchema.index(
  { examCandidateId: 1, attemptType: 1, status: 1 },
);

export const ExamAttempt = mongoose.model('ExamAttempt', examAttemptSchema);