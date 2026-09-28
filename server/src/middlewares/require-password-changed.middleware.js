/**
 * Middleware kiểm tra trạng thái đổi mật khẩu bắt buộc.
 * Bắt buộc người dùng (đặc biệt là tài khoản khởi tạo mặc định) phải đổi mật khẩu trước khi thao tác nghiệp vụ khác.
 */

import { ApiError } from '../utils/api-error.js';

// Chặn truy cập nghiệp vụ nếu tài khoản có cờ mustChangePassword = true
export function requirePasswordChanged(req, _res, next) {
  if (req.auth?.mustChangePassword) {
    next(
      new ApiError(
        403,
        'Vui lòng đổi mật khẩu trước khi sử dụng chức năng này',
        'AUTH_MUST_CHANGE_PASSWORD',
      ),
    );
    return;
  }
  next();
}

