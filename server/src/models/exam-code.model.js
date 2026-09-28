import mongoose from 'mongoose';

const examCodeSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
      index: true,
    },
    /** Mã hiển thị (vd DE-001) — unique trong phạm vi examId */
    code: { type: String, required: true, trim: true },
    /**
     * Bộ câu riêng trong mã đề thuộc bộ phận này (FR-002).
     * Assumption: mỗi ExamCode phục vụ đúng một departmentId cho phần câu riêng.
     */
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },
    /** Hash/set câu hỏi để kiểm tra trùng 100% giữa các mã đề */
    questionSetFingerprint: { type: String, index: true },
  },
  { timestamps: true },
);

examCodeSchema.index({ examId: 1, code: 1 }, { unique: true });

export const ExamCode = mongoose.model('ExamCode', examCodeSchema);
