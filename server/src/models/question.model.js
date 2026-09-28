import mongoose from 'mongoose';
import {
  ANSWER_TYPE,
  DIFFICULTY,
  QUESTION_KIND,
  QUESTION_SCOPE,
  QUESTION_USAGE,
} from './constants.js';

/**
 * Bộ lọc theo mục đích sử dụng, dùng chung cho mọi truy vấn rút câu hỏi.
 * - PRACTICE: chỉ lấy đúng câu có usage = 'practice'.
 * - Mọi giá trị khác (kể cả thiếu tham số): lấy các câu KHÔNG phải 'practice',
 *   nên câu cũ chưa có trường usage vẫn thuộc ngân hàng thi và không bao giờ lọt sang ôn tập.
 */
export function questionUsageFilter(usage) {
  if (usage === QUESTION_USAGE.PRACTICE) return { usage: QUESTION_USAGE.PRACTICE };
  return { usage: { $ne: QUESTION_USAGE.PRACTICE } };
}

const questionSchema = new mongoose.Schema(
  {
    content: { type: String, required: true, trim: true },
    /** UML `type` — tách rõ loại nội dung vs dạng đáp án (BRS FR-001) */
    questionKind: {
      type: String,
      enum: Object.values(QUESTION_KIND),
      required: true,
    },
    answerType: {
      type: String,
      enum: Object.values(ANSWER_TYPE),
      required: true,
    },
    difficulty: {
      type: String,
      enum: Object.values(DIFFICULTY),
      required: true,
    },
    scope: {
      type: String,
      enum: Object.values(QUESTION_SCOPE),
      required: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      index: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      index: true,
    },
    /** Cloudinary public id / URL — DEMO-ONLY upload */
    imageUrl: { type: String, trim: true },
    /**
     * public_id thật trên Cloudinary tương ứng với imageUrl (= hash SHA-256
     * nội dung file ảnh, xem uploadQuestionImageBuffer trong
     * question.service.js). Dùng để gọi Cloudinary destroy khi thay ảnh
     * khác hoặc xoá asset không còn dùng nữa. Không tự sinh ngẫu nhiên.
     */
    imageCloudinaryId: { type: String, trim: true },
    /** Mục đích sử dụng: thi chính thức (mặc định) hoặc ôn tập — xem QUESTION_USAGE trong constants.js */
    usage: {
      type: String,
      enum: Object.values(QUESTION_USAGE),
      default: QUESTION_USAGE.EXAM,
    },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

questionSchema.pre('validate', function validateDepartmentScope(next) {
  if (this.scope === QUESTION_SCOPE.DEPARTMENT_SPECIFIC && !this.departmentId) {
    next(new Error('departmentId is required when scope is DepartmentSpecific'));
    return;
  }
  if (this.scope === QUESTION_SCOPE.COMMON) {
    this.departmentId = undefined;
  }
  next();
});

questionSchema.index({ topicId: 1, scope: 1, departmentId: 1, isActive: 1 });
questionSchema.index({ usage: 1, topicId: 1, isActive: 1 });

export const Question = mongoose.model('Question', questionSchema);