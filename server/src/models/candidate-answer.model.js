import mongoose from 'mongoose';

const candidateAnswerSchema = new mongoose.Schema(
  {
    examAttemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExamAttempt',
      required: true,
      index: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    selectedAnswerIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Answer' },
    ],
    isCorrect: { type: Boolean },
  },
  { timestamps: true },
);

candidateAnswerSchema.index({ examAttemptId: 1, questionId: 1 }, { unique: true });

export const CandidateAnswer = mongoose.model('CandidateAnswer', candidateAnswerSchema);
