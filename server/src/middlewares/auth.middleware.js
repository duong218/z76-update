/**
 * Middleware xử lý Xác thực (Authentication) & Phân quyền (Authorization).
 * Đảm bảo request có token hợp lệ, kiểm tra trạng thái hoạt động của tài khoản và quyền hạn theo vai trò (Role).
 */

import { verifyAccessToken, getAuthProfile } from '../services/auth.service.js';
import { User } from '../models/index.js';
import { ApiError } from '../utils/api-error.js';

// Hàm phụ trợ tách Bearer Token từ header Authorization
function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return undefined;
  }
  return header.slice(7).trim();
}

// Middleware xác thực Access Token: giải mã JWT, kiểm tra tài khoản còn hoạt động và tokenVersion hợp lệ
export async function authenticate(req, _res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw new ApiError(401, 'Yêu cầu đăng nhập', 'AUTH_REQUIRED');
    }

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).populate('roleId');
    if (!user || !user.isActive) {
      throw new ApiError(401, 'Phiên không hợp lệ', 'AUTH_ACCESS_INVALID');
    }
    if ((user.tokenVersion ?? 0) !== (payload.tv ?? 0)) {
      throw new ApiError(401, 'Phiên đã bị thu hồi', 'AUTH_ACCESS_REVOKED');
    }

    const role = user.roleId;
    if (!role || !role.isActive) {
      throw new ApiError(403, 'Vai trò không hợp lệ', 'AUTH_ROLE_INACTIVE');
    }

    // Đính kèm thông tin danh tính người dùng vào đối tượng req.auth
    req.auth = {
      userId: user._id.toString(),
      username: user.username,
      roleId: role._id.toString(),
      roleCode: role.code,
      mustChangePassword: user.mustChangePassword,
    };

    next();
  } catch (err) {
    next(err);
  }
}

// Middleware phân quyền: chỉ cho phép các Role có mã code trong danh sách được phép truy cập
export function requireRoleCodes(...allowedCodes) {
  const allowed = new Set(allowedCodes.map((c) => c.toLowerCase()));
  return (req, _res, next) => {
    if (!req.auth?.roleCode) {
      next(new ApiError(401, 'Yêu cầu đăng nhập', 'AUTH_REQUIRED'));
      return;
    }
    if (!allowed.has(req.auth.roleCode.toLowerCase())) {
      next(new ApiError(403, 'Không có quyền truy cập', 'AUTH_FORBIDDEN'));
      return;
    }
    next();
  };
}

// Middleware tùy chọn gắn thông tin hồ sơ nhân viên đầy đủ vào req.auth.profile nếu đã xác thực
export async function attachProfileIfAuthenticated(req, _res, next) {
  if (!req.auth?.userId) {
    next();
    return;
  }
  try {
    req.auth.profile = await getAuthProfile(req.auth.userId);
  } catch {
    /* optional profile fetch fallback */
  }
  next();
}

