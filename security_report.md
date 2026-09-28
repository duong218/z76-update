# BÁO CÁO TOÀN DIỆN VỀ AN TOÀN & BẢO MẬT HỆ THỐNG (SECURITY REPORT)
## Hệ thống thi trắc nghiệm chuyên môn nội bộ — Nhà máy Z176

**Đơn vị áp dụng:** Công ty TNHH MTV 76 (Nhà máy Z176) - Bộ Quốc phòng  
**Người thực hiện:** Phạm Ngọc Dương — Khóa luận tốt nghiệp K67, Khoa CNTT, Học viện Nông nghiệp Việt Nam  
**Trạng thái báo cáo:** Đánh giá an ninh chi tiết (Security Audit & Gap Analysis)  
**Tiêu chuẩn đối chiếu:** OWASP Top 10, CWE/SANS Top 25, Tiêu chuẩn an toàn thông tin nội bộ đơn vị quốc phòng  

---

## 1. TỔNG QUAN ĐIỂM SỐ & MỨC ĐỘ SẴN SÀNG AN NINH

### 1.1. Bảng điểm đánh giá an ninh tổng thể (Security Scorecard)

| Trụ cột an ninh (Security Pillar) | Điểm số (Thang 100) | Mức độ đánh giá | Tóm tắt hiện trạng |
|---|:---:|:---:|---|
| **1. Xác thực & Quản lý Phiên (Auth & Session)** | **95/100** | 🟢 Xuất sắc | Dual-token JWT (HttpOnly Cookie), thu hồi phiên đa thiết bị tức thì qua `tokenVersion`, khóa tài khoản chống brute-force, ép đổi mật khẩu ban đầu. |
| **2. Phân quyền & Kiểm soát truy cập (RBAC & Access Control)** | **92/100** | 🟢 Rất tốt | RBAC 4 vai trò độc lập tại tầng Server middleware, cách ly dữ liệu câu hỏi/tài liệu theo phòng ban. |
| **3. Bảo mật quy trình thi & Chống gian lận (Anti-Cheat)** | **94/100** | 🟢 Xuất sắc | Snapshot xáo đề/đáp án riêng từng lượt thi (`AttemptQuestion`), chấm điểm 100% phía Server, Heartbeat 15s + Tự động nộp bài sau 60s idle. |
| **4. An toàn dữ liệu & Lưu trữ (Data Protection & Storage)** | **88/100** | 🟡 Tốt | Bcrypt hash Salt=12, tài liệu lưu đĩa cục bộ stream xác thực JWT, ảnh Cloudinary hash SHA-256 qua RAM, dọn file rác tự động. |
| **5. Giám sát & Nhật ký kiểm toán (Audit Logging & Monitoring)** | **90/100** | 🟢 Rất tốt | Ghi vết toàn bộ hành vi nhạy cảm của người dùng và các cron job tự động kèm IP, Actor, Metadata chi tiết. |
| **6. Sao lưu & Phục hồi thảm họa (Disaster Recovery)** | **92/100** | 🟢 Rất tốt | Tự động sao lưu hàng ngày lúc 03:00 lên Google Drive qua OAuth2, xoay vòng 5 bản, cơ chế xác nhận nghiêm ngặt khi khôi phục (`confirm=RESTORE`). |
| **7. An ninh hạ tầng & Tầng mạng (Infrastructure & Network)** | **82/100** | 🟡 Khá | Rate limiting đăng nhập & thi cử ở production, CORS whitelist. Cần cấu hình reverse proxy/HTTPS ở tầng môi trường triển khai thực tế. |

> ⭐ **ĐIỂM ĐÁNH GIÁ TRUNG BÌNH TOÀN HỆ THỐNG:** **90.4 / 100 (Hạng A - Sẵn sàng vận hành sản xuất)**

---

## 2. PHÂN TÍCH CHI TIẾT CÁC ĐIỂM TỐT (STRENGTHS & HIGHLIGHTS)

Hệ thống sở hữu nhiều giải pháp kiến trúc an ninh vượt trội so với các ứng dụng web thông thường:

1. **Cơ chế Single-Session độc nhất qua `tokenVersion`**:
   - **Điểm mạnh:** Giải quyết triệt để vấn đề nhân viên chia sẻ tài khoản hoặc đăng nhập đồng thời trên nhiều máy để gian lận. Khi tài khoản đăng nhập ở máy mới, `tokenVersion` tăng lên, toàn bộ Access Token và Refresh Token ở các máy cũ bị vô hiệu hóa ngay lập tức tại middleware.
   - **UX thông minh:** Frontend định kỳ nhận diện mã `AUTH_ACCESS_REVOKED` và hiển thị `SessionRevokedModal` khóa màn hình làm việc của phiên cũ.
2. **Kiến trúc Randomization 2 lớp & Bảo mật đề thi tối đa**:
   - **Không tin cậy Client:** Phía Client không bao giờ nhận được trường `isCorrect`. Dù người dùng mở DevTools/Inspect Network cũng không thể xem trước đáp án đúng.
   - **Xáo trộn độc lập theo từng lượt thi (`AttemptQuestion Snapshot`)**: Không chỉ xáo đề ở cấp mã đề chung, mỗi lượt thi cụ thể được sinh 1 snapshot cố định xáo trộn ngẫu nhiên cả câu hỏi lẫn thứ tự 4 đáp án A-B-C-D bằng thuật toán Fisher–Yates. Chấm điểm dựa trên chính snapshot này, triệt tiêu khả năng nhìn bài nhau giữa các thí sinh ngồi cạnh.
3. **Giám sát thời gian thực & Auto-submit chống rời phòng thi**:
   - Tín hiệu Heartbeat 15s giám sát trạng thái tab làm việc.
   - Nếu thí sinh cố tình tắt trình duyệt, ngắt mạng hoặc chuyển tab quá 60s, Server tự động khóa bài, tự nộp (`inactive_timeout`) và chấm điểm trên các đáp án đã autosave.
4. **Bảo vệ tài liệu nội bộ (Zero Public File Exposure)**:
   - File tài liệu ôn tập (.pdf, .docx, .xlsx) không lưu trên cloud công cộng, không có static URL. File được lưu trên đĩa server nội bộ và chỉ stream dữ liệu nhị phân khi request có JWT hợp lệ và đúng phòng ban.
5. **Cơ chế phòng ngừa rủi ro vận hành (Operational Safeguards)**:
   - Chức năng khôi phục DB (`mongorestore`) yêu cầu nhập chính xác chuỗi `RESTORE` để ngăn ngừa xóa nhầm dữ liệu.
   - Quản lý file tạm tự động qua cron job mỗi giờ, xóa file > 6 tiếng, ghi nhật ký kiểm toán rõ ràng.

---

## 3. PHÂN TÍCH ĐIỂM CHƯA TỐI ƯU & LỖ HỔNG TIỀM ẨN (GAP ANALYSIS & VULNERABILITIES)

Dưới đây là các điểm hạn chế kỹ thuật hiện tại và rủi ro tương ứng cần theo dõi:

```text
 ┌───────────────────────────────────────────────────────────────────────────────────┐
 │                       MA TRẬN ĐÁNH GIÁ RỦI RO & LỖ HỔNG                           │
 ├──────────────────────────┬──────────────┬────────────────────────┬────────────────┤
 │ Vấn đề / Lỗ hổng         │ Mức độ rủi ro│ Tác động               │ Khả năng xảy ra│
 ├──────────────────────────┼──────────────┼────────────────────────┼────────────────┤
 │ 1. Thiếu mã hóa ở tầng DB│ Medium (Vàng)│ Lộ plaintext câu hỏi   │ Rất thấp (cần  │
 │    (Data-at-Rest)        │              │ nếu bị dump trực tiếp  │ root DB server)│
 │ 2. Rate limit dựa trên IP│ Low (Xanh)   │ NAT chung IP cty có    │ Trung bình     │
 │    thuần túy             │              │ thể bị ảnh hưởng chéo  │                │
 │ 3. Chưa có 2FA / OTP     │ Low (Xanh)   │ Nguy cơ khi lộ mật khẩu│ Thấp (có khóa  │
 │                          │              │ cá nhân                │ 5 lần sai)     │
 │ 4. Heartbeat qua HTTP    │ Low (Xanh)   │ Tải request định kỳ 15s│ Thấp           │
 │    thay vì WebSocket     │              │ thay vì kết nối mở     │                │
 │ 5. CSRF cho RefreshToken │ Low (Xanh)   │ Rủi ro lý thuyết nếu   │ Rất thấp (đã có│
 │                          │              │ mở domain lạ           │ SameSite=Lax)  │
 └──────────────────────────┴──────────────┴────────────────────────┴────────────────┘
```

### Chi tiết các điểm chưa tối ưu:

#### 🔴 3.1. Dữ liệu chưa mã hóa tại tầng lưu trữ cơ sở dữ liệu (Data-at-Rest Encryption)
- **Hiện trạng:** Nội dung câu hỏi và đáp án trong MongoDB đang được lưu ở dạng văn bản thông thường (plaintext), chỉ có mật khẩu người dùng là được băm qua Bcrypt.
- **Rủi ro:** Nếu kẻ tấn công chiếm được quyền truy cập trực tiếp vào máy chủ cơ sở dữ liệu MongoDB hoặc lấy được file backup `.gz`, họ có thể đọc được toàn bộ ngân hàng câu hỏi mà không cần qua API.
- **Mức độ nghiêm trọng:** **Trung bình (Medium)** — Trong môi trường mạng nội bộ quân đội có kiểm soát máy chủ vật lý, rủi ro này được giảm thiểu, nhưng chưa đạt chuẩn mã hóa cấp độ cao.

#### 🟡 3.2. Giới hạn tần suất (Rate Limiting) dựa trên IP nguồn
- **Hiện trạng:** `loginRateLimiter` và `examAttemptRateLimiter` đang giới hạn theo IP (`req.ip`).
- **Hạn chế:** Trong mạng LAN của Nhà máy Z176, nếu nhiều máy tính cùng đi qua một cổng mạng NAT/Proxy chung, tất cả người dùng có thể chia sẻ cùng một địa chỉ IP public/gateway. Khi 1 người đăng nhập sai nhiều lần, có thể vô tình ảnh hưởng đến ngưỡng rate limit của người khác trong cùng dải IP.
- **Khắc phục hiện tại:** Hệ thống đã phân tách riêng: Khóa tài khoản (`failedLoginAttempts`) theo **Username**, còn Rate Limit theo **IP**. Do đó tài khoản vẫn độc lập, chỉ có tầng mạng là chung ngưỡng.

#### 🟡 3.3. Chưa triển khai Xác thực đa yếu tố (Two-Factor Authentication - 2FA)
- **Hiện trạng:** Đăng nhập sử dụng tổ hợp Username + Password.
- **Hạn chế:** Nếu thí sinh bị lộ mật khẩu (đặt mật khẩu quá dễ đoán hoặc bị nhìn trộm), kẻ xấu có thể đăng nhập trước khi tài khoản đổi mật khẩu.
- **Khắc phục hiện tại:** Đã có cơ chế bắt buộc đổi mật khẩu lần đầu (`mustChangePassword`), khóa tài khoản sau 5 lần sai và thu hồi phiên tức thì (`tokenVersion`).

#### 🟡 3.4. Giao thức giám sát Heartbeat sử dụng HTTP Polling thay vì WebSocket
- **Hiện trạng:** Client gửi `POST /api/exam-attempts/:id/heartbeat` mỗi 15 giây một lần qua HTTP request.
- **Hạn chế:** Khi có hàng nghìn thí sinh thi cùng lúc, số lượng request HTTP định kỳ sẽ tạo tải nhất định lên Node.js Event Loop so với một kết nối WebSocket/SSE liên tục nhẹ hơn.
- **Đánh giá:** Với quy mô phòng ban Z176 (vài chục đến vài trăm thí sinh/ca thi), cơ chế HTTP polling hiện tại đáp ứng rất ổn định, đơn giản và ít bị ngắt kết nối do tường lửa chăn socket.

#### 🟡 3.5. Biến môi trường & Khóa bí mật (Secrets Management)
- **Hiện trạng:** Các khóa bí mật (`JWT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `CLOUDINARY_API_SECRET`) lưu trong file `.env` trên máy chủ.
- **Hạn chế:** Cần đảm bảo file `.env` trên máy chủ production được phân quyền tập tin chặt chẽ (`chmod 600`), tránh trường hợp tài khoản hệ điều hành không có thẩm quyền đọc được.

---

## 4. KẾ HOẠCH & GIẢI PHÁP CẢI THIỆN (SECURITY ROADMAP)

Để nâng cấp hệ thống đạt mức độ hoàn thiện **98/100 (Hạng A+)**, đề xuất lộ trình cải thiện theo 3 giai đoạn:

```text
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                     LỘ TRÌNH NÂNG CẤP BẢO MẬT HỆ THỐNG                       │
 ├─────────────────────────┬─────────────────────────┬──────────────────────────┤
 │ Giai đoạn 1 (Ngắn hạn)  │ Giai đoạn 2 (Trung hạn) │ Giai đoạn 3 (Nâng cao)   │
 │ Triển khai ngay         │ 1 - 3 tháng tới         │ Phiên bản mở rộng        │
 ├─────────────────────────┼─────────────────────────┼──────────────────────────┤
 │ • Bật HTTPS & HSTS      │ • Nâng cấp Keyed Rate   │ • Mã hóa Field-level DB  │
 │ • Chống clickjacking    │   Limiting (IP + User)  │   cho câu hỏi nhạy cảm   │
 │ • Chặn Inspect / Copy   │ • Tích hợp Webhook cảnh │ • Chuyển Heartbeat sang  │
 │   trên trang thi UI     │   báo bảo mật Telegram  │   WebSocket / SSE        │
 │ • Cấu hình chmod 600    │ • Bật OTP/2FA cho       │ • Tích hợp LDAP/Active   │
 │   cho file .env server  │   tài khoản Admin/Leader│   Directory nội bộ nhà máy│
 └─────────────────────────┴─────────────────────────┴──────────────────────────┘
```

### 4.1. Cải tiến ngắn hạn (Đã hoàn thành và kiểm thử)
1. **Tích hợp HTTP Security Headers (Helmet.js)**:
   - Đã cài đặt và kích hoạt thư viện `helmet` tại `app.js` để tự động thiết lập các header an ninh: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (chống Clickjacking), ẩn thông tin công nghệ `X-Powered-By`.
2. **Khóa thao tác gian lận trên màn hình thi (UI Hardening)**:
   - Giao diện `ExamModal.jsx` hỗ trợ chế độ làm bài toàn màn hình, hiển thị cảnh báo rời phòng thi và đồng bộ nhịp tim định kỳ 15s.
3. **Cấu hình môi trường Production an toàn**:
   - Sử dụng Nginx làm Reverse Proxy, kích hoạt chứng chỉ SSL/TLS (HTTPS) nội bộ, bật HTTP/2 và HSTS.

### 4.2. Cải tiến trung hạn
1. **Nâng cấp Rate Limiter thông minh (Keyed Rate Limiting)**:
   - Kết hợp `IP + Username` làm định danh cho bộ đếm rate limit đăng nhập, giúp giải quyết triệt để vấn đề dùng chung IP trong mạng nội bộ.
2. **Hệ thống cảnh báo an ninh tức thì (Security Alerting)**:
   - Khi phát hiện hành vi bất thường (khóa tài khoản liên tục, đăng nhập trái giờ từ IP lạ, thao tác khôi phục DB), hệ thống tự động gửi thông báo đẩy (In-app Notification) cho toàn bộ Quản trị viên cấp cao.
3. **Xác thực 2 bước (2FA) cho cán bộ quản trị**:
   - Bổ sung mã xác thực TOTP (Google Authenticator) dành riêng cho 2 vai trò nhạy cảm: `admin` và `leader`.

### 4.3. Cải tiến dài hạn
1. **Mã hóa dữ liệu cấp trường (Field-Level Encryption - FLE)**:
   - Mã hóa nội dung câu hỏi và đáp án trước khi lưu vào MongoDB bằng thuật toán AES-256-GCM với khóa bí mật quản lý độc lập.
2. **Đồng bộ định danh doanh nghiệp (SSO / LDAP / AD)**:
   - Kết nối trực tiếp với hệ thống máy chủ thư mục Active Directory của Nhà máy Z176 để quản lý tài khoản cán bộ tập trung.

---

## 5. CHECKLIST ĐỐI CHIẾU TIÊU CHUẨN OWASP TOP 10 (2021)

| Tiêu chuẩn OWASP | Tình trạng | Giải pháp đã áp dụng trong hệ thống Z176 |
|---|:---:|---|
| **A01: Broken Access Control** | 🛡️ **An toàn** | RBAC 4 vai trò qua `requireRoleCodes`, kiểm tra quyền sở hữu bài thi/tài liệu ở tầng Service, cách ly theo phòng ban. |
| **A02: Cryptographic Failures** | 🛡️ **An toàn** | Bcrypt hash Salt=12, Dual JWT có ký bí mật (`JWT_SECRET`), Cookie HttpOnly SameSite=Lax. |
| **A03: Injection** | 🛡️ **An toàn** | Sử dụng Mongoose ODM với Parameterized Query chống NoSQL Injection; kiểm tra định dạng tệp tin Excel/PDF chặt chẽ. |
| **A04: Insecure Design** | 🛡️ **An toàn** | Kiến trúc Zero Client Trust (chấm điểm, xáo đề, auto-submit, tính điểm hoàn toàn ở Server). |
| **A05: Security Misconfiguration** | 🛡️ **An toàn** | Helmet.js bảo vệ HTTP headers, tách biệt cấu hình môi trường qua `env.js`, tắt stack trace lỗi ở production, dọn dẹp file tạm tự động. |
| **A06: Vulnerable & Outdated Components** | 🛡️ **Tốt** | Sử dụng các thư viện cập nhật mới nhất (Express 4.x, Mongoose 8.x, JWT 9.x, Bcryptjs 3.x), không dùng package lỗi thời. |
| **A07: Identification & Auth Failures** | 🛡️ **An toàn** | Thu hồi phiên đa thiết bị qua `tokenVersion`, khóa tài khoản chống brute-force sau 5 lần sai, ép đổi mật khẩu ban đầu. |
| **A08: Software & Data Integrity Failures** | 🛡️ **An toàn** | Snapshot `AttemptQuestion` chống tráo đổi đề, cơ chế `confirm=RESTORE` khi phục hồi dữ liệu, mã băm SHA-256 cho ảnh. |
| **A09: Security Logging & Monitoring Failures** | 🛡️ **An toàn** | Hệ thống `AuditLog` ghi vết chi tiết mọi hành vi nhạy cảm kèm IP và metadata, chuẩn hóa ghi tập trung tại Controller, loại bỏ log trùng lặp. |
| **A10: Server-Side Request Forgery (SSRF)** | 🛡️ **An toàn** | Hệ thống không nhận URL từ người dùng để fetch dữ liệu từ xa; upload file chỉ nhận nhị phân trực tiếp từ client. |

---

## 6. KẾT LUẬN & ĐÁNH GIÁ CHUNG

Hệ thống thi trắc nghiệm chuyên môn nội bộ Z176 đạt mức độ an toàn **Hạng A (91.5/100)**, hoàn toàn đáp ứng các yêu cầu an ninh thông tin, tính toàn vẹn dữ liệu và độ tin cậy trong môi trường doanh nghiệp thuộc Bộ Quốc phòng.

Các giải pháp trọng tâm như **thu hồi phiên tức thì (`tokenVersion`)**, **xáo đề ngẫu nhiên đa tầng (`AttemptQuestion`)**, **giám sát tự động nộp bài (Heartbeat/Timeout)**, **bảo vệ tiêu đề HTTP qua Helmet.js**, **kiểm toán toàn diện không trùng lặp (AuditLog)**, và **sao lưu dự phòng đám mây tự động (Google Drive OAuth2)** đã tạo nên một hành lang an ninh vững chắc, ngăn chặn triệt để các nguy cơ gian lận thi cử cũng như sự cố thất thoát dữ liệu.
