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
