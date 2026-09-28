/**
 * Cấu hình ứng dụng Express chính.
 * Thiết lập các middleware bảo mật, CORS, body parser, đăng ký route và xử lý lỗi tập trung.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { ApiError } from './utils/api-error.js';

export function createApp() {
  const app = express();

  // --- Cấu hình Middleware Bảo mật & Phân tích Request ---
  app.use(helmet()); // Bảo vệ các HTTP header bảo mật
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true, // Cho phép truyền cookie qua CORS
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // --- Route kiểm tra tình trạng dịch vụ (Health check) ---
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, message: 'OK', code: 'HEALTH_OK' });
  });

  // --- Đăng ký toàn bộ API Routes ---
  app.use('/api', apiRoutes);

  // --- Xử lý 404 cho các Route không tồn tại ---
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      message: 'Không tìm thấy tài nguyên',
      code: 'NOT_FOUND',
    });
  });

  // --- Middleware tập trung xử lý lỗi toàn cục (Global Error Handler) ---
  app.use((err, _req, res, _next) => {
    const statusCode = err.statusCode ?? 500;
    const isApiError = err instanceof ApiError;
    const message =
      env.isProduction && !isApiError && statusCode === 500
        ? 'Lỗi máy chủ'
        : (err.message ?? 'Lỗi máy chủ');
    res.status(statusCode).json({
      success: false,
      message,
      code: err.code ?? 'INTERNAL_ERROR',
    });
  });

  return app;
}

