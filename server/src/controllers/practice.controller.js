/**
 * Controller Luyện tập theo chủ đề. Chỉ nhận request, gọi service, trả JSON.
 * Lưu ý: nếu async-handler.js export default thay vì named export, sửa dòng import.
 */

import { asyncHandler } from '../utils/async-handler.js';
import {
  getAvailableTopics,
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

  start: asyncHandler(async (req, res) => {
    const data = await startPractice(req.auth.userId, req.body);
    res.json({ success: true, message: 'Bắt đầu luyện tập', code: 'PRACTICE_STARTED', data });
  }),

  submit: asyncHandler(async (req, res) => {
    const data = await submitPractice(req.auth.userId, req.params.id, req.body?.answers);
    res.json({ success: true, message: 'Nộp bài thành công', code: 'PRACTICE_SUBMITTED', data });
  }),
};