import mongoose from 'mongoose';
import { DOCUMENT_SCOPE } from './constants.js';

const documentSchema = new mongoose.Schema(
  {
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    /** MVP: path disk local (UPLOAD_DIR); sau có thể đổi provider nội bộ */
    filePath: { type: String, required: true, trim: true },
    originalFileName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    scope: {
      type: String,
      enum: Object.values(DOCUMENT_SCOPE),
      default: DOCUMENT_SCOPE.COMMON,
    },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

documentSchema.pre('validate', function validateDocScope(next) {
  if (this.scope === DOCUMENT_SCOPE.DEPARTMENT_SPECIFIC && !this.departmentId) {
    next(new Error('departmentId is required for department-scoped documents'));
    return;
  }
  next();
});

export const StudyDocument = mongoose.model('StudyDocument', documentSchema);
