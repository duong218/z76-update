import mongoose from 'mongoose';

const practiceQuestionSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    selectedAnswerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Answer' }],
    isCorrect: { type: Boolean, default: false },
  },
  { _id: false },
);

const practiceSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    topicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }],
    difficulty: { type: String, default: 'all' },
    questions: { type: [practiceQuestionSchema], default: [] },
    totalQuestions: { type: Number, required: true },
    correctCount: { type: Number, default: 0 },
    /** 0 = không giới hạn thời gian */
    timeLimitSec: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['in_progress', 'submitted', 'expired'],
      default: 'in_progress',
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date },
  },
  { timestamps: true },
);

practiceSessionSchema.index({ userId: 1, status: 1, submittedAt: -1 });

export const PracticeSession = mongoose.model('PracticeSession', practiceSessionSchema);