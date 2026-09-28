/**
 * Controller Quản lý Lượt thi & Quá trình làm bài thi của Thí sinh (Exam Attempt & Test Taking).
 * Hỗ trợ lấy đề thi, bắt đầu làm bài, lưu tạm câu trả lời (Autosave), Heartbeat giữ phiên và nộp bài tính điểm.
 */

import { examAttemptService } from '../services/exam-attempt.service.js';
import { writeAudit } from '../services/audit.service.js';
import { asyncHandler } from '../utils/async-handler.js';

function clientIp(req) {
  return req.ip ?? req.headers['x-forwarded-for']?.toString()?.split(',')[0]?.trim();
}

export const examAttemptController = {
  // Thí sinh lấy thông tin kỳ thi được phân công (tự động phát hiện nộp bài nếu rời tab > 1 phút)
  getMyExam: asyncHandler(async (req, res) => {
    const data = await examAttemptService.getMyExam(req.auth.userId);

    if (data.autoSubmitted) {
      await writeAudit({
        actorUserId: req.auth.userId,
        action: 'AUTO_SUBMIT_EXAM_ATTEMPT',
        resourceType: 'ExamAttempt',
        resourceId: data.attempt?.id ?? null,
        metadata: { detail: 'Tự động nộp bài do rời khỏi ca thi quá 1 phút (phát hiện lúc getMyExam)' },
        ipAddress: clientIp(req),
      });
    }

    res.json({ success: true, message: 'OK', data });
  }),

  // Bắt đầu làm bài thi chính thức hoặc tiếp tục lượt thi đang dang dở (Resume)
  start: asyncHandler(async (req, res) => {
    const data = await examAttemptService.startAttempt(req.auth.userId);

    await writeAudit({
      actorUserId: req.auth.userId,
      action: data.resumed ? 'RESUME_EXAM_ATTEMPT' : 'START_EXAM_ATTEMPT',
      resourceType: 'ExamAttempt',
      resourceId: data.attemptId,
      metadata: { detail: data.resumed ? 'Tiếp tục lượt thi đang dở' : 'Bắt đầu lượt thi chính thức' },
      ipAddress: clientIp(req),
    });

    res.status(201).json({ success: true, message: 'OK', data });
  }),

  // Thí sinh chủ động bấm Nộp bài thi -> Chấm điểm tự động và lưu kết quả
  submit: asyncHandler(async (req, res) => {
    const { answers } = req.body ?? {};
    const data = await examAttemptService.submitAttempt(req.auth.userId, req.params.id, answers);

    await writeAudit({
      actorUserId: req.auth.userId,
      action: 'SUBMIT_EXAM_ATTEMPT',
      resourceType: 'ExamAttempt',
      resourceId: req.params.id,
      metadata: { detail: `Nộp bài thi: ${data.correctCount}/${data.totalQuestions} câu đúng, ${data.score} điểm` },
      ipAddress: clientIp(req),
    });

    res.json({ success: true, message: 'Nộp bài thành công', data });
  }),

  // Lưu tạm đáp án cho từng câu hỏi (Autosave khi thí sinh tích chọn đáp án)
  answer: asyncHandler(async (req, res) => {
    const { questionId, selectedAnswerIds } = req.body ?? {};
    const data = await examAttemptService.recordAnswer(
      req.auth.userId,
      req.params.id,
      questionId,
      selectedAnswerIds,
    );
    res.json({ success: true, message: 'OK', data });
  }),

  // Heartbeat duy trì kết nối phiên làm bài (phát hiện gian lận và tự nộp bài nếu thí sinh rời tab quá lâu)
  heartbeat: asyncHandler(async (req, res) => {
    const data = await examAttemptService.heartbeat(req.auth.userId, req.params.id);

    if (data.autoSubmitReason) {
      await writeAudit({
        actorUserId: req.auth.userId,
        action: 'AUTO_SUBMIT_EXAM_ATTEMPT',
        resourceType: 'ExamAttempt',
        resourceId: req.params.id,
        metadata: { detail: 'Tự động nộp bài do rời khỏi ca thi quá 1 phút (phát hiện lúc heartbeat)' },
        ipAddress: clientIp(req),
      });
    }

    res.json({ success: true, message: 'OK', data });
  }),

  // Ban Giám khảo / Leader cấp thêm lượt thi cho thí sinh gặp sự cố bất khả kháng
  grantExtraAttempt: asyncHandler(async (req, res) => {
    const data = await examAttemptService.grantExtraAttempt(req.params.examCandidateId, req.auth.userId);

    await writeAudit({
      actorUserId: req.auth.userId,
      action: 'GRANT_EXTRA_EXAM_ATTEMPT',
      resourceType: 'ExamCandidate',
      resourceId: data.examCandidateId,
      metadata: {
        detail: `Cấp thêm lượt thi cho ${data.employeeName ?? 'thí sinh'} — kỳ thi: ${data.examTitle} (tổng lượt được cấp thêm: ${data.extraAttemptsGranted})`,
      },
      ipAddress: clientIp(req),
    });

    res.json({ success: true, message: 'Đã cấp thêm lượt thi cho thí sinh', data });
  }),
};