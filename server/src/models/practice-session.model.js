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
    /** Chế độ 'instant': đã kiểm tra đúng/sai câu này -> khóa đáp án, không cho đổi */
    checked: { type: Boolean, default: false },
    /**
     * Ảnh chụp đáp án đúng lúc bắt đầu bài luyện (chỉ dùng phía server, KHÔNG gửi xuống client).
     * Chấm điểm theo bản này để không bị ảnh hưởng nếu người ra đề sửa/xóa câu hỏi giữa chừng.
     */
    correctAnswerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Answer' }],
    /** Thứ tự đáp án đã xáo, để tiếp tục bài dở vẫn hiện đúng thứ tự cũ */
    optionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Answer' }],
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
    /** instant = biết đúng/sai ngay từng câu; exam = làm hết rồi mới chấm */
    mode: { type: String, enum: ['instant', 'exam'], default: 'exam' },
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