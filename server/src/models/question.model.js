import mongoose from 'mongoose';
import {
  ANSWER_TYPE,
  DIFFICULTY,
  QUESTION_KIND,
  QUESTION_SCOPE,
} from './constants.js';

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

export const Question = mongoose.model('Question', questionSchema);