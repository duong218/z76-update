import mongoose from 'mongoose';

/** StarUML `result` — GLOSSARY gọi ExamResult; giữ collection `results`. */
const resultSchema = new mongoose.Schema(
  {
    examAttemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExamAttempt',
      required: true,
      unique: true,
      index: true,
    },
    score: { type: Number, required: true, min: 0, max: 100 },
    correctCount: { type: Number, required: true, min: 0 },
    totalQuestions: { type: Number, required: true, min: 1 },
    passed: { type: Boolean, required: true },
  },
  { timestamps: true },
);

export const Result = mongoose.model('Result', resultSchema);
