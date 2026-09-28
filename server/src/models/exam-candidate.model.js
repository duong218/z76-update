import mongoose from 'mongoose';

const examCandidateSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    examCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExamCode',
      required: true,
      index: true,
    },
    /**
     * MỚI — Số lượt thi CHÍNH THỨC bổ sung mà Người duyệt đề (leader) đã cấp
     * cho thí sinh này, ngoài lượt mặc định (MAX_OFFICIAL_ATTEMPTS = 1 trong
     * exam-attempt.service.js). Giới hạn thực tế của thí sinh cho kỳ thi này
     * = MAX_OFFICIAL_ATTEMPTS + extraAttemptsGranted.
     *
     * Đặt ở đây (thay vì trên ExamAttempt) vì đây là quyền hạn gắn với
     * {thí sinh, kỳ thi} chứ không phải một lượt thi cụ thể nào — 1 thí sinh
     * có thể được cấp lại nhiều lần trước khi dùng hết.
     */
    extraAttemptsGranted: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

examCandidateSchema.index({ examId: 1, employeeId: 1 }, { unique: true });

export const ExamCandidate = mongoose.model('ExamCandidate', examCandidateSchema);