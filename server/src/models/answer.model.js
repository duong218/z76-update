import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
      index: true,
    },
    content: { type: String, required: true, trim: true },
    isCorrect: { type: Boolean, required: true, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

answerSchema.index({ questionId: 1, sortOrder: 1 });

export const Answer = mongoose.model('Answer', answerSchema);
