# Cơ chế xác thực & Phân quyền (Auth API)

Hệ thống Z176 áp dụng cơ chế xác thực kép thông qua JSON Web Token (JWT) kết hợp giữa Access Token ngắn hạn và Refresh Token dài hạn lưu trữ trong HttpOnly Cookie để đảm bảo an toàn tối đa.

## Các Endpoint Xác thực

| Method | Path | Xác thực | Mô tả |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/auth/login` | Public | Đăng nhập hệ thống. Nhận vào `{ username, password }`. Trả về `accessToken` ở JSON body; set `refreshToken` vào Cookie bảo mật với thuộc tính `httpOnly`, `secure`, `sameSite: 'strict'`. |
| **POST** | `/api/auth/refresh` | Cookie | Sử dụng `refreshToken` trong cookie để cấp mới cặp token. Có cơ chế rotate token tự động. |
| **POST** | `/api/auth/logout` | Bearer | Đăng xuất người dùng. Thu hồi refresh token bằng cách tăng `tokenVersion` trong database của User, xóa cookie. |
| **GET** | `/api/auth/me` | Bearer | Trả về thông tin chi tiết tài khoản của người dùng hiện tại kèm theo thông tin vai trò (`role`) và hồ sơ nhân viên (`employee`). |
| **POST** | `/api/auth/change-password` | Bearer | Đổi mật khẩu tài khoản. Nhận `{ currentPassword, newPassword }`. Trường `mustChangePassword` chuyển thành `false` sau khi đổi thành công. |

## Quy trình Khởi động hệ thống (Database Seeding)
- Khi khởi động server lần đầu hoặc bật flag `SEED_ON_START`, hệ thống tự động kiểm tra và khởi tạo 4 vai trò mặc định (`admin`, `examiner`, `leader`, `candidate`) vào collection `roles`.
- Đồng thời, tạo tài khoản quản trị ban đầu dựa trên biến môi trường `ADMIN_SEED_EMAIL` (hoặc `ADMIN_SEED_USERNAME`) và `ADMIN_SEED_PASSWORD`. Tài khoản này được set `mustChangePassword: true` để yêu cầu bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.

## Kiểm soát đăng nhập nhiều thiết bị & Thu hồi phiên (Session Revocation)
- Mỗi User lưu một trường `tokenVersion` (kiểu số nguyên) trong database.
- Mỗi khi người dùng thực hiện đăng nhập mới thành công hoặc đổi mật khẩu, `tokenVersion` trên DB của User sẽ tăng lên 1 đơn vị.
- Khi verify JWT, middleware `authenticate` sẽ giải mã access token để so sánh `tokenVersion` được đính kèm trong token với `tokenVersion` hiện tại của User trong cơ sở dữ liệu. Nếu không khớp (do tài khoản vừa đăng nhập ở thiết bị khác), token cũ ngay lập tức bị vô hiệu hóa (trả lỗi `401 Unauthorized` với mã `AUTH_ACCESS_REVOKED`).
- Client định kỳ 5 giây sẽ gọi API kiểm tra hoạt động hoặc lắng nghe lỗi 401 để kích hoạt `SessionRevokedModal`, ngăn chặn thí sinh gian lận thi cử bằng cách đăng nhập tài khoản của mình trên nhiều thiết bị.

## Giới hạn tần suất gọi API (Rate Limiting)
- **Đăng nhập (`/api/auth/login`)**: Áp dụng `loginRateLimiter` theo địa chỉ IP (chỉ bật ở production) nhằm ngăn chặn tấn công brute-force mật khẩu. Khi sai quá 5 lần, tài khoản bị tạm khóa trong 15 phút (`lockUntil`).
- **Phòng thi (`/api/exam-attempts/*`)**: Áp dụng `examAttemptRateLimiter` theo **`userId`** (`keyGenerator: (req) => req.auth?.userId ?? req.ip`) với giới hạn 100 req/phút/user — đảm bảo mỗi thí sinh có hạn ngạch độc lập, giải quyết triệt để tình trạng nghẽn/chặn nhầm khi hàng chục, hàng trăm thí sinh thi cùng lúc sau 1 địa chỉ IP/NAT mạng LAN công ty.

## Cách thức lưu trữ ở Client
- **Access Token**: Được lưu tạm thời trong `localStorage` / bộ nhớ biến thông qua `token-store.js`. Đính kèm trong header `Authorization: Bearer <token>` ở mỗi request.
- **Refresh Token**: Được lưu hoàn toàn ở HttpOnly Cookie phía Backend quản lý, tự động đính kèm khi gọi API `/api/auth/refresh` bằng cơ chế `credentials: 'include'`.
- Khi client mount ứng dụng, tiến hành gọi API `/api/auth/refresh` đầu tiên để lấy Access Token ban đầu (Silent Refresh). Quá trình refresh có cơ chế Request Queueing để tránh gọi refresh đồng thời nhiều lần.

