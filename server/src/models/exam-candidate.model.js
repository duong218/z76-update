import mongoose from 'mongoose';

/**
 * MỚI — Ai là người chọn vai trò (phòng ban) mà thí sinh thi trong kỳ này:
 * - candidate: thí sinh tự chọn trước khi bấm bắt đầu thi (có hộp thoại xác nhận phía client)
 * - leader: Người duyệt đề chọn lại khi cấp thêm lượt thi cho thí sinh lỡ chọn nhầm
 * - system: thí sinh chỉ có 1 phòng ban (không có gì để chọn) — hệ thống tự khóa theo phòng chính
 */
export const ROLE_CHOSEN_BY = {
  CANDIDATE: 'candidate',
  LEADER: 'leader',
  SYSTEM: 'system',
};

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
    /**
     * MỚI — Thời điểm vai trò (phòng ban của mã đề `examCodeId`) bị KHÓA cho kỳ thi này.
     * Chưa có giá trị = thí sinh chưa xác nhận vai trò (mã đề hiện tại chỉ là mã mặc định
     * theo phòng chính). Sau khi khóa, thí sinh KHÔNG tự đổi được nữa — chỉ Người duyệt đề
     * đổi được khi cấp thêm lượt thi (xem exam-attempt.service.js#grantExtraAttempt).
     */
    roleConfirmedAt: { type: Date },
    roleChosenBy: { type: String, enum: Object.values(ROLE_CHOSEN_BY) },
  },
  { timestamps: true },
);

examCandidateSchema.index({ examId: 1, employeeId: 1 }, { unique: true });

export const ExamCandidate = mongoose.model('ExamCandidate', examCandidateSchema);