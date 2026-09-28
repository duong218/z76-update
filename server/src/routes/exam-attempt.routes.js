import express from 'express';
import { examAttemptController } from '../controllers/exam-attempt.controller.js';
import { authenticate, requireRoleCodes } from '../middlewares/auth.middleware.js';
import { requirePasswordChanged } from '../middlewares/require-password-changed.middleware.js';
import { examAttemptRateLimiter } from '../middlewares/rate-limit.middleware.js';

const router = express.Router();

router.use(authenticate);
router.use(requirePasswordChanged);

// Các route dành cho thí sinh (candidate) — trước đây áp dụng
// requireRoleCodes('candidate') cho TOÀN BỘ router bằng router.use(), nay
// chuyển xuống áp dụng riêng cho từng route để có chỗ thêm route dành cho
// leader (grant-attempt) bên dưới mà không bị chặn nhầm.
router.get('/my-exam', requireRoleCodes('candidate'), examAttemptController.getMyExam);
router.post('/start', requireRoleCodes('candidate'), examAttemptRateLimiter, examAttemptController.start);
router.post('/:id/submit', requireRoleCodes('candidate'), examAttemptRateLimiter, examAttemptController.submit);
router.patch('/:id/answer', requireRoleCodes('candidate'), examAttemptRateLimiter, examAttemptController.answer);
router.post('/:id/heartbeat', requireRoleCodes('candidate'), examAttemptRateLimiter, examAttemptController.heartbeat);

// MỚI — Người duyệt đề (leader) cấp thêm 1 lượt thi chính thức cho 1 thí sinh
// cụ thể trong 1 kỳ thi cụ thể, xác định qua examCandidateId (lấy từ
// GET /api/reports/results, field `examCandidateId`).
router.post(
  '/candidates/:examCandidateId/grant-attempt',
  requireRoleCodes('leader'),
  examAttemptController.grantExtraAttempt,
);

export default router;