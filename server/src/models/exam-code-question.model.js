import mongoose from 'mongoose';

const examCodeQuestionSchema = new mongoose.Schema(
  {
    examCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExamCode',
      required: true,
      index: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
      index: true,
    },
    orderIndex: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

examCodeQuestionSchema.index({ examCodeId: 1, questionId: 1 }, { unique: true });
examCodeQuestionSchema.index({ examCodeId: 1, orderIndex: 1 }, { unique: true });

export const ExamCodeQuestion = mongoose.model('ExamCodeQuestion', examCodeQuestionSchema);
