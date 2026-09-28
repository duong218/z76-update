import mongoose from 'mongoose';

/**
 * Snapshot câu hỏi + thứ tự đáp án ĐÃ XÁO RIÊNG cho từng lượt thi (ExamAttempt).
 * Sinh ra đúng 1 lần lúc bắt đầu lượt thi (xem exam-attempt.service.js#startAttempt).
 * Không xáo lại sau đó — đảm bảo thí sinh mất mạng/tải lại trang vẫn thấy đúng
 * thứ tự câu/đáp án như lúc bắt đầu, không bị đổi giữa chừng.
 *
 * Nguồn câu hỏi vẫn lấy từ ExamCodeQuestion của phòng ban (không đổi) — bảng
 * này chỉ quyết định THỨ TỰ hiển thị riêng cho từng người, không đổi tập câu hỏi.
 */
const attemptQuestionSchema = new mongoose.Schema(
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
      index: true,
    },
    orderIndex: { type: Number, required: true, min: 0 },
    /** Thứ tự đáp án đã xáo riêng cho lượt thi này — mảng answerId theo đúng thứ tự hiển thị cho thí sinh */
    answerOrder: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Answer' }],
  },
  { timestamps: true },
);

attemptQuestionSchema.index({ examAttemptId: 1, questionId: 1 }, { unique: true });
attemptQuestionSchema.index({ examAttemptId: 1, orderIndex: 1 }, { unique: true });

export const AttemptQuestion = mongoose.model('AttemptQuestion', attemptQuestionSchema);