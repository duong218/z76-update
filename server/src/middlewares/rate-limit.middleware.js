/**
 * Middleware giới hạn tần suất gửi yêu cầu (Rate Limiting).
 * Ngăn chặn tấn công brute-force mật khẩu và chống spam request gian lận trong quá trình làm bài thi.
 */

import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

// Giới hạn tần suất đăng nhập (theo IP) để chống dò quét mật khẩu (brute-force)
export const loginRateLimiter = env.isProduction
  ? rateLimit({
      windowMs: env.loginRateLimitWindowMinutes * 60 * 1000,
      max: env.loginRateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: 'Quá nhiều lần đăng nhập. Thử lại sau.',
        code: 'AUTH_RATE_LIMIT',
      },
    })
  : (req, res, next) => next(); // Bỏ qua trong môi trường dev/test để tiện kiểm thử

// Giới hạn tần suất thao tác thi (start/answer/heartbeat/submit) định danh theo userId
// Tránh nghẽn chung mạng LAN/NAT khi hàng trăm thí sinh thi cùng lúc từ một địa chỉ IP
export const examAttemptRateLimiter = env.isProduction
  ? rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.auth?.userId ?? req.ip,
      message: {
        success: false,
        message: 'Thao tác quá nhanh, vui lòng thử lại sau.',
        code: 'EXAM_ATTEMPT_RATE_LIMIT',
      },
    })
  : (req, res, next) => next(); // Bỏ qua trong môi trường dev/test