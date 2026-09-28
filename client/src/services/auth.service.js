import { apiRequest } from './api.js';
import { getAccessToken, saveAccessToken, clearAccessToken, getAuthHeaders } from './token-store.js';

// Giữ nguyên các hàm getAccessToken/saveAccessToken/clearAccessToken/getAuthHeaders
// re-export từ token-store.js để KHÔNG phải sửa import ở mọi file khác đang
// dùng `from './auth.service.js'` (admin.service.js, examiner.service.js...).
// Việc lưu trữ token thật sự nằm ở token-store.js vì api.js cũng cần dùng nó
// để tự refresh khi access token hết hạn — nếu để ở auth.service.js như cũ sẽ
// tạo import vòng (api.js -> auth.service.js -> api.js).
export { getAccessToken, saveAccessToken, clearAccessToken, getAuthHeaders };

// ── API calls ──────────────────────────────────────────────────

/**
 * Đăng nhập bằng username + password.
 * Server trả { success, data: { accessToken, user } } + set httpOnly refresh cookie.
 */
export async function loginUser(username, password) {
  const result = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (result?.data?.accessToken) {
    saveAccessToken(result.data.accessToken);
  }
  return result.data; // { accessToken, user }
}

/**
 * Refresh access token (dựa vào httpOnly cookie — FE không cần gửi gì thêm).
 * Lưu ý: cơ chế tự-refresh-khi-401 chính giờ nằm ở api.js (gọi thẳng
 * fetch('/auth/refresh') nội bộ, không qua hàm này) để tránh việc nhiều
 * request refresh chạy song song. Hàm này vẫn được giữ lại cho nơi nào muốn
 * chủ động refresh thủ công (vd sau khi lấy lại focus tab).
 */
export async function refreshAccessToken() {
  const result = await apiRequest('/auth/refresh', {
    method: 'POST',
  });
  if (result?.data?.accessToken) {
    saveAccessToken(result.data.accessToken);
  }
  return result.data;
}

/**
 * Lấy profile user hiện tại (cần Bearer token).
 */
export async function fetchMe() {
  const result = await apiRequest('/auth/me', {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return result.data; // { id, username, roleCode, roleName, mustChangePassword }
}

/**
 * Đăng xuất — invalidate refresh token trên server, xóa token local.
 */
export async function logoutUser() {
  try {
    await apiRequest('/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } catch {
    /* server có thể không phản hồi — vẫn xóa token local */
  }
  clearAccessToken();
}

/**
 * Đổi mật khẩu tài khoản hiện tại.
 */
export async function changePassword(currentPassword, newPassword) {
  const result = await apiRequest('/auth/change-password', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return result;
}