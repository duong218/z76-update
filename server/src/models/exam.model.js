import mongoose from 'mongoose';
import { EXAM_STATUS } from './constants.js';

const examSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      index: true,
    },
    startDate: { type: Date },
    endDate: { type: Date },
    durationMinutes: { type: Number, required: true, min: 1 },
    totalQuestions: { type: Number, required: true, min: 1 },
    commonQuestionCount: { type: Number, required: true, min: 0 },
    departmentQuestionCount: { type: Number, required: true, min: 0 },
    /**
     * MỚI — Công tắc BÙ CÂU CHUNG theo từng kỳ thi (Người tạo đề đặt khi tạo/sửa đề xuất).
     * - true : phòng ban thiếu câu riêng thì bù bằng câu chung (hành vi cũ); mọi vai trò đều chọn được.
     * - false: KHÔNG bù; phòng ban chưa đủ departmentQuestionCount câu riêng bị khóa, không được chọn làm vai trò thi.
     * CỐ TÌNH KHÔNG đặt default: kỳ thi cũ (chưa có field) được code coi là đang BẬT bù để giữ nguyên hành vi trước đây
     * (xem isCommonCompensationEnabled trong exam-code-generation.service.js) -> không cần migrate dữ liệu cũ.
     * Kỳ thi tạo mới luôn được service ghi giá trị rõ ràng (mặc định false). Không đổi được sau khi kỳ thi đã công bố.
     */
    allowCommonCompensation: { type: Boolean },
    status: {
      type: String,
      enum: Object.values(EXAM_STATUS),
      default: EXAM_STATUS.DRAFT,
      index: true,
    },
    /**
     * Assumption nhóm nghiên cứu (BRS Bước 7 #1) — % câu đúng tối thiểu để đạt.
     * Cấu hình theo kỳ thi trên Exam, không đặt trong env.
     */
    passThresholdPercent: { type: Number, min: 0, max: 100, default: 70 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    publishedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
  },
  { timestamps: true },
);

examSchema.pre('validate', function validateQuestionCounts(next) {
  const sum = (this.commonQuestionCount ?? 0) + (this.departmentQuestionCount ?? 0);
  if (this.totalQuestions != null && sum !== this.totalQuestions) {
    next(
      new Error(
        'commonQuestionCount + departmentQuestionCount must equal totalQuestions',
      ),
    );
    return;
  }
  next();
});

export const Exam = mongoose.model('Exam', examSchema);