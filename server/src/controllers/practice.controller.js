/**
 * Controller Luyện tập theo chủ đề. Chỉ nhận request, gọi service, trả JSON.
 * Lưu ý: nếu async-handler.js export default thay vì named export, sửa dòng import.
 */

import { asyncHandler } from '../utils/async-handler.js';
import {
  abandonPractice,
  checkPracticeAnswer,
  getActivePractice,
  getAvailableTopics,
  getPracticeAchievements,
  getPracticeProgress,
  startPractice,
  submitPractice,
} from '../services/practice.service.js';

export const practiceController = {
  topics: asyncHandler(async (req, res) => {
    const data = await getAvailableTopics(req.auth.userId);
    res.json({ success: true, message: 'OK', code: 'PRACTICE_TOPICS', data });
  }),

  progress: asyncHandler(async (req, res) => {
    const data = await getPracticeProgress(req.auth.userId);
    res.json({ success: true, message: 'OK', code: 'PRACTICE_PROGRESS', data });
  }),

  // Chuỗi ngày luyện tập liên tiếp + huy hiệu đã đạt + 1 câu động viên ngắn
  achievements: asyncHandler(async (req, res) => {
    const data = await getPracticeAchievements(req.auth.userId);
    res.json({ success: true, message: 'OK', code: 'PRACTICE_ACHIEVEMENTS', data });
  }),

  start: asyncHandler(async (req, res) => {
    const data = await startPractice(req.auth.userId, req.body);
    res.json({ success: true, message: 'Bắt đầu luyện tập', code: 'PRACTICE_STARTED', data });
  }),

  active: asyncHandler(async (req, res) => {
    const data = await getActivePractice(req.auth.userId);
    res.json({ success: true, message: 'OK', code: 'PRACTICE_ACTIVE', data });
  }),

  abandon: asyncHandler(async (req, res) => {
    const data = await abandonPractice(req.auth.userId, req.params.id);
    res.json({ success: true, message: 'Đã bỏ bài luyện', code: 'PRACTICE_ABANDONED', data });
  }),

  check: asyncHandler(async (req, res) => {
    const { questionId, selectedAnswerIds } = req.body ?? {};
    const data = await checkPracticeAnswer(
      req.auth.userId,
      req.params.id,
      questionId,
      selectedAnswerIds,
    );
    res.json({ success: true, message: 'OK', code: 'PRACTICE_CHECKED', data });
  }),

  submit: asyncHandler(async (req, res) => {
    const data = await submitPractice(req.auth.userId, req.params.id, req.body?.answers);
    res.json({ success: true, message: 'Nộp bài thành công', code: 'PRACTICE_SUBMITTED', data });
  }),
};