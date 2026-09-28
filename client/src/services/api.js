import { getAccessToken, saveAccessToken, clearAccessToken } from './token-store.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Tên sự kiện phát ra khi phiên đăng nhập không thể tự làm mới được nữa
// (refresh token cũng hết hạn/không hợp lệ) — App.jsx lắng nghe sự kiện này
// để hiện SessionRevokedModal và đưa người dùng về màn hình đăng nhập.
// Dùng CustomEvent trên window thay vì gọi thẳng 1 callback, vì api.js là
// module thuần (không phải React component/hook) nên không thể tự có state
// hay gọi trực tiếp vào cây component — event là cách decouple gọn nhất.
export const SESSION_EXPIRED_EVENT = 'z176:session-expired';

function notifySessionExpired(message) {
  clearAccessToken();
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { message } }));
}

// Gom nhiều request bị 401 cùng lúc (vd nhiều tab component cùng gọi API khi
// mount) thành ĐÚNG 1 lần gọi /auth/refresh — các request còn lại "xếp hàng"
// chờ chung 1 Promise thay vì mỗi request tự bắn 1 request refresh riêng
// (vừa lãng phí vừa có thể tạo race-condition, refresh token bị dùng lại
// nhiều lần nếu server refresh token là 1-lần-dùng).
let refreshPromise = null;

async function performRefresh() {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    let code;
    try {
      code = (await response.json())?.code;
    } catch {
      /* không phải JSON */
    }
    const err = new Error('Không thể làm mới phiên đăng nhập');
    err.status = response.status;
    err.code = code;
    throw err;
  }

  const body = await response.json();
  const accessToken = body?.data?.accessToken;
  if (!accessToken) {
    throw new Error('Phản hồi làm mới phiên không hợp lệ');
  }
  saveAccessToken(accessToken);
  return accessToken;
}

function refreshAccessTokenOnce() {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doFetch(path, options) {
  const { headers, ...requestOptions } = options;
  return fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      ...(requestOptions.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...requestOptions,
  });
}

// Các request Bearer luôn tự đọc header Authorization tại thời điểm gọi qua
// getAuthHeaders() ở nơi gọi apiRequest (auth.service.js, admin.service.js...).
// Sau khi refresh xong token mới, header cũ trong `options` đã lỡ đóng gói
// access token CŨ — nên khi retry, phải build lại header Authorization bằng
// token mới thay vì tái dùng nguyên `options.headers` ban đầu.
function withFreshAuthHeader(options) {
  const token = getAccessToken();
  if (!token) return options;
  const hadAuthHeader = Object.keys(options.headers ?? {}).some(
    (k) => k.toLowerCase() === 'authorization',
  );
  if (!hadAuthHeader) return options;
  return {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  };
}

export async function apiRequest(path, options = {}, { _isRetry = false } = {}) {
  const response = await doFetch(path, options);

  if (!response.ok) {
    let serverMessage;
    let serverCode;
    try {
      const body = await response.json();
      serverMessage = body.message;
      serverCode = body.code; // ApiError phía server luôn kèm code (vd AUTH_ACCESS_REVOKED)
    } catch {
      /* response không phải JSON */
    }

    // Access token hết hạn (không phải bị thu hồi/khoá) -> thử tự làm mới rồi
    // gọi lại request gốc ĐÚNG 1 LẦN. Không retry nếu:
    // - đây đã là lần retry rồi (tránh loop vô hạn nếu refresh "thành công"
    //   nhưng token mới vẫn bị 401 vì lý do khác)
    // - request này chính là /auth/refresh (tránh tự gọi lại chính nó)
    if (
      response.status === 401 &&
      serverCode === 'AUTH_ACCESS_EXPIRED' &&
      !_isRetry &&
      !path.startsWith('/auth/refresh')
    ) {
      try {
        await refreshAccessTokenOnce();
        const retryOptions = withFreshAuthHeader(options);
        return apiRequest(path, retryOptions, { _isRetry: true });
      } catch (refreshErr) {
        // Refresh token cũng hết hạn/không hợp lệ -> phiên thật sự đã hết,
        // báo cho App.jsx để đưa người dùng về màn hình đăng nhập.
        notifySessionExpired('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        throw refreshErr;
      }
    }

    // 401 nhưng KHÔNG phải do hết hạn (vd AUTH_ACCESS_REVOKED — bị đăng nhập
    // nơi khác/đổi mật khẩu nơi khác) -> không có ích gì khi refresh, vì
    // refresh token cùng user cũng đã bị thu hồi theo cùng cơ chế tokenVersion.
    // Giữ nguyên hành vi cũ: ném lỗi để nơi gọi (hoặc polling AUTH_ACCESS_REVOKED
    // có sẵn trong App.jsx) tự xử lý.
    const err = new Error(serverMessage || `Lỗi máy chủ (${response.status})`);
    err.status = response.status;
    err.code = serverCode;
    throw err;
  }

  return response.status === 204 ? null : response.json();
}

export { API_BASE_URL };