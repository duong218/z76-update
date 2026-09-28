# AGENT_RULES.md — Quy tắc dùng AI Agent
## Module Thi Chuyên Môn Nội Bộ — Z176
**Người thực hiện:** Phạm Ngọc Dương — Khóa luận tốt nghiệp K67, Khoa CNTT, Học viện Nông nghiệp Việt Nam
**Đơn vị áp dụng:** Công ty TNHH MTV 76 (Nhà máy Z176) - Bộ Quốc phòng
**Trạng thái tài liệu:** Bản chính thức hoàn thiện (Áp dụng trong toàn bộ quá trình phát triển & vận hành)
**Mục đích:** Luật chơi bắt buộc khi dùng AI (Antigravity, Claude, Cursor, Codex, Gemini...) để lập trình, thiết kế và tối ưu đề tài này. Áp dụng cho cả bản thân Dương lẫn cho AI tự đọc và tuân theo.

> File này đứng trên `LIBRARY.md` và `SKILLS.md` — nghĩa là AI được phép tham khảo skill/repo trong `LIBRARY.md`, nhưng **mọi hành động phát triển và cập nhật đều phải tuân theo rule ở đây trước**.

---

## 1. Nguyên tắc tối thượng: Bảo mật dữ liệu nội bộ quân đội

1. 🔒 **Chỉ dùng dữ liệu mock/giả khi làm việc với bất kỳ AI tool nào** (kể cả Claude, Antigravity, Cursor, Codex, Gemini...). Dữ liệu thật (danh sách cán bộ/công nhân viên Z176, ngân hàng câu hỏi nghiệp vụ mật, đáp án thật, kết quả thi thật) **tuyệt đối không** được đưa vào prompt, đính kèm file, hay để AI đọc trực tiếp.
2. 🔒 Toàn bộ dữ liệu mock đặt trong `mock-data/` — AI chỉ được đọc từ thư mục này khi cần dữ liệu mẫu cho việc lập trình, seeding và test.
3. 🔒 Dữ liệu thật chỉ được nhập vào hệ thống **sau khi bàn giao/deploy nội bộ**, thao tác trực tiếp bởi Quản trị viên/Người ra đề qua giao diện hệ thống (Import Excel / Form CRUD), không thông qua AI.
4. 🔒 Nếu phát hiện thông tin thật bị lọt vào ngữ cảnh AI → dừng ngay lập tức, xóa nội dung nhạy cảm khỏi lịch sử phiên làm việc.

---

## 2. Kiểm soát tích hợp bên thứ ba & Dịch vụ Cloud

1. 🔒 **Cloudinary**: Chỉ dùng để lưu trữ ảnh minh họa cho câu hỏi (qua `question.service.js` với `imageCloudinaryId` được hash SHA-256 nội dung, bộ nhớ `memoryStorage` không lưu file rác trên đĩa). Không lưu tài liệu mật hoặc thông tin cá nhân nhân viên lên Cloudinary.
2. 🔒 **Google Drive Backup**: Module sao lưu DB (`backup.service.js`) sử dụng OAuth2 kết nối tới tài khoản Google Drive chỉ định của đơn vị (thông qua Refresh Token nội bộ, không dùng public API key).
3. 🔒 **Tài liệu ôn tập (.pdf, .docx, .xlsx)**: Lưu trữ cục bộ trên đĩa server nội bộ (`uploadDir`), stream trực tiếp qua luồng xác thực JWT (`study-document.service.js`), tuyệt đối không đẩy lên bất kỳ cloud public nào.
4. 🔒 **Không tự ý thêm SDK/API bên ngoài**: Không tích hợp các công cụ analytics công khai, error tracking cloud (như Sentry cloud, LogRocket...) gửi telemetry ra ngoài nếu chưa có sự phê duyệt của Ban CNTT Z176.

---

## 3. Quy trình Review & Đồng bộ Kiến trúc

1. Mọi code do AI sinh ra liên quan đến:
   - **Xác thực & Bảo mật phiên** (`auth.service.js`, `auth.middleware.js`, cơ chế `tokenVersion`, `failedLoginAttempts`, `lockUntil`, `mustChangePassword`).
   - **Phân quyền 4 vai trò** (`admin`, `examiner`, `leader`, `candidate` qua `requireRoleCodes`).
   - **Thuật toán sinh mã đề & phân phối đề thi** (`exam-code-generation.service.js`, `AttemptQuestion` snapshot xáo câu/đáp án riêng cho từng lượt thi).
   - **Giám sát thời gian thực & Auto-submit** (Heartbeat 15s, timeout 60s, `CandidateAnswer` autosave).
   - **Chấm điểm tự động** (tính toán `Result` hoàn toàn ở phía server theo `passThresholdPercent`).
   -> **Bắt buộc Dương đọc, hiểu rõ luồng và kiểm thử kỹ lưỡng trước khi commit/merge**.
2. Với code giao diện thuần túy (UI, Modal, Skeleton, CSS, format hiển thị): có thể merge nhanh hơn nhưng phải đảm bảo trải nghiệm người dùng mượt mà và không làm gãy responsive.
3. Trước khi hoàn tất thay đổi, đối chiếu code với `BRS_SRS_Module_Thi_Chuyen_Mon_Z176.md` và `SECURITY_BASELINE.md` để đảm bảo hệ thống luôn nhất quán.

---

## 4. Xử lý khi AI đề xuất lệch khỏi quy ước kỹ thuật

1. Nếu AI đề xuất giải pháp vi phạm kiến trúc (vd: dùng `Math.random()` thay vì thuật toán chuẩn, hardcode enum vai trò thay vì tra cứu linh hoạt, lưu token trong `localStorage` thay vì HttpOnly Cookie cho refresh token, hoặc bỏ qua middleware auth để "test nhanh") -> **từ chối, yêu cầu AI sửa lại đúng quy ước**.
2. Nếu yêu cầu có điểm chưa rõ ràng hoặc liên quan đến quyết định nghiệp vụ phức tạp -> AI phải chủ động hỏi lại hoặc đưa ra phương án phân tích kèm ưu/nhược điểm để thống nhất trước khi triển khai.
3. Luôn tuân thủ nguyên tắc: **Controller mỏng, Service dày** — mọi logic nghiệp vụ, tính toán điểm, kiểm tra ràng buộc đều nằm ở Service (`server/src/services/`).

---

## 5. Phân định phạm vi AI được tự chủ vs. Cần Dương xác nhận

| Loại công việc | AI được tự chủ thực hiện | Cần Dương xác nhận trước |
|---|:---:|:---:|
| Xây dựng UI component, CSS, Animation, Toast, Loading skeleton | ✅ | |
| Viết CRUD chuẩn (Topic, Department, Role...) | ✅ | |
| Sửa lỗi giao diện, căn chỉnh layout, tối ưu hiển thị | ✅ | |
| Viết unit test, script kiểm thử tự động, test rate-limit | ✅ | |
| Cập nhật tài liệu kỹ thuật, BRS/SRS, hướng dẫn sử dụng | ✅ | |
| Thay đổi cấu trúc Mongoose Schema (Exam, Attempt, Result...) | | ✅ |
| Sửa đổi logic phân quyền, middleware xác thực, cơ chế thu hồi phiên | | ✅ |
| Điều chỉnh thuật toán sinh đề, xáo câu hỏi/đáp án (`AttemptQuestion`) | | ✅ |
| Cấu hình sao lưu/khôi phục dữ liệu (`Backup & Restore Google Drive`) | | ✅ |
| Thao tác với dữ liệu thật hoặc cấu hình môi trường Production | | ❌ (Chỉ Dương/Quản trị viên thực hiện) |

---

## 6. Minh bạch & Ghi chép học thuật

- Ghi lại nhật ký tiến độ các phần việc chính đã thực hiện cùng AI vào tài liệu theo dõi khóa luận.
- Đảm bảo nắm vững 100% kiến trúc, luồng dữ liệu và thuật toán cốt lõi để tự tin thuyết minh và giải trình minh bạch trước Hội đồng chấm khóa luận tốt nghiệp.
