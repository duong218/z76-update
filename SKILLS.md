# SKILLS.md — Quy ước kỹ thuật và Nguyên tắc phát triển
## Hệ Thống Thi Trắc Nghiệm Chuyên Môn Nội Bộ — Nhà Máy Z176
**Người thực hiện:** Phạm Ngọc Dương — VNUA | **Dự án:** Hệ thống thi trắc nghiệm chuyên môn nội bộ Z176

**Mục đích:** Là bộ quy tắc và chuẩn mực kỹ thuật bắt buộc dành cho lập trình viên và AI Coding Assistant khi phát triển, bảo trì mã nguồn trong dự án. Đảm bảo toàn bộ hệ thống nhất quán về kiến trúc, tuân thủ an toàn thông tin và quy chuẩn nghiệp vụ.

---

## 1. Công nghệ sử dụng chính thức (Tech Stack)

| Thành phần | Lựa chọn chính thức | Chi tiết kỹ thuật & Thư viện |
|---|---|---|
| **Frontend** | React 19 + Vite | SPA hiệu năng cao, React Context cho state toàn cục (`ToastContext`, `ConfirmContext`). |
| **Styling & UI** | Tailwind CSS v4 | Thiết kế tối giản, responsive mobile-first, Lucide React icons, Lenis smooth scroll, Motion micro-animations, Recharts biểu đồ. |
| **Backend** | Node.js (>=22 <25) + Express.js | Kiến trúc Controller - Service - Model phân lớp rõ ràng. |
| **Database** | MongoDB Atlas & Mongoose ODM | Lưu trữ cấu trúc dữ liệu linh hoạt (ngân hàng câu hỏi, đề thi, lượt thi, audit logs). |
| **Xác thực (Auth)** | JWT kép + Cookie HttpOnly | `accessToken` (15 phút, gửi Header) + `refreshToken` (7 ngày, httpOnly cookie) + `tokenVersion` (thu hồi phiên tức thì). |
| **Tệp tin & Đa phương tiện**| Cloudinary + Multer + exceljs/xlsx | Lưu ảnh minh họa câu hỏi, tài liệu ôn tập (.pdf, .docx, .xlsx), đọc/xuất file Excel kết quả & tài khoản nhân viên. |
| **Sao lưu đám mây** | Google Drive API (OAuth2) | Backup tự động CSDL định kỳ lúc 3h sáng (xoay vòng 5 bản lưu) và khôi phục an toàn qua giao diện Admin. |

---

## 2. Cấu trúc thư mục chuẩn của dự án

```text
HethongZ176/
├── client/                              # Ứng dụng Frontend React 19 + Vite
│   ├── public/templates/                # File Excel mẫu chuẩn (Mau_Import_Cau_Hoi, Mau_Import_Nhan_Vien)
│   └── src/
│       ├── components/
│       │   ├── admin/                   # AccountTab, AuditLogTab, BackupTab, OverviewTab
│       │   ├── examiner/                # DepartmentTab, ExamProposalTab, OverviewTab, QuestionBankTab, StudyDocumentTab, TopicTab
│       │   ├── leader/                  # DepartmentReportTab, DetailedResultsTab, ExamReportTab, ExamReviewTab, OverviewTab
│       │   ├── ConfirmDialog.jsx        # Dialog xác nhận chuẩn thay thế window.confirm()
│       │   ├── ExamModal.jsx            # Giao diện làm bài thi toàn màn hình (autosave, heartbeat, đếm giờ)
│       │   └── ToastContext.jsx         # Quản lý thông báo toast toàn hệ thống
│       ├── pages/                       # AdminDashboard, CandidateDashboard, ExaminerDashboard, LeaderDashboard
│       └── services/                    # Tầng giao tiếp API (api.js, auth, admin, examiner, exam-attempt, study-document...)
│
├── server/                              # Ứng dụng Backend Express.js REST API
│   ├── src/
│   │   ├── config/                      # db.js, env.js (validate runtime env)
│   │   ├── controllers/                 # Tầng điều phối request/response, ghi Audit Log chuẩn hóa
│   │   ├── middlewares/                 # auth.middleware, rate-limit.middleware, upload.middleware
│   │   ├── models/                      # Mongoose Schema: User, Role, Employee, Department, Topic, Question, Exam...
│   │   ├── routes/                      # Định tuyến RESTful API (/api/*)
│   │   ├── services/                    # Nghiệp vụ cốt lõi: exam, attempt, question, user, backup, study-document...
│   │   └── utils/                       # ApiError, asyncHandler
│
├── structure/                           # Tài liệu chi tiết kiến trúc (client.md, server.md)
└── GLOSSARY.md                          # Bảng thuật ngữ nghiệp vụ & tên Model chuẩn hóa
```

---

## 3. Quy chuẩn lập trình (Coding Conventions)

1. **Phân chia trách nhiệm (Controller mỏng — Service dày):**
   * **Controller**: Nhận input (`req.params`, `req.body`), gọi Service thực thi nghiệp vụ, ghi Audit Log (nếu là hành động nhạy cảm) và trả về response JSON qua `res.json({ message, data })`.
   * **Service**: Chứa toàn bộ business logic, validate dữ liệu, truy vấn database qua Model, ném lỗi qua `throw new ApiError(statusCode, code, message)`.
2. **Quy chuẩn ghi Audit Log:**
   * Ghi **tập trung tại Controller** sau khi service hoàn thành thao tác thành công (tránh ghi trùng lặp ở service).
   * Sử dụng mã hành động chuẩn tiếng Anh (`CREATE_USER`, `LOCK_USER`, `UPDATE_QUESTION`, `BACKUP_RESTORE`...) và luôn truyền đầy đủ `actorUserId: req.auth.userId`, `resourceType`, `metadata.detail`.
3. **Naming Conventions:**
   * `camelCase` cho biến, hàm, tham số (ví dụ: `loadData`, `newDepartmentId`, `examCandidateId`).
   * `PascalCase` cho React Components, Context và Mongoose Models (ví dụ: `AccountTab`, `ExamAttempt`).
   * `UPPER_SNAKE_CASE` cho hằng số và Enum (ví dụ: `QUESTION_SCOPE`, `ACTION_LABELS`).
   * `kebab-case` cho tên file routes và services (ví dụ: `exam-attempt.service.js`, `study-document.routes.js`).
4. **React Performance & Hooks:**
   * Bọc các hàm fetch dữ liệu trong `useCallback` khi truyền vào `useEffect` dependency.
   * Sử dụng `useRef` lưu các giá trị filter/search không cần kích hoạt re-render để tránh gọi lại API liên tục khi gõ phím.
   * Ưu tiên dùng `useConfirm()` từ `ConfirmDialog.jsx` thay vì `window.confirm()`.

---

## 4. Danh sách Nguyên tắc cứng (Bảo mật & Toàn vẹn) 🔒

Các nguyên tắc sau đây **tuyệt đối không được vi phạm**:

1. 🔒 **Bảo mật đề thi & Đáp án:** Không bao giờ trả về trường đáp án đúng (`isCorrect`) về client của Thí sinh trước hoặc trong khi đang làm bài thi.
2. 🔒 **Sinh số ngẫu nhiên an toàn:** Tuyệt đối không dùng `Math.random()` cho thuật toán trộn câu hỏi, xáo trộn đáp án hoặc sinh mã ngẫu nhiên liên quan đến bảo mật — phải sử dụng `crypto.randomInt()` hoặc các hàm ngẫu nhiên bảo mật tương đương.
3. 🔒 **Xác thực & Phân quyền đa lớp:** Mọi API thao tác dữ liệu đều phải đi qua `authenticate` (kiểm tra JWT + `tokenVersion`) và `requireRoleCodes(...)` để kiểm soát đúng quyền hạn của từng vai trò (`admin`, `examiner`, `leader`, `candidate`).
4. 🔒 **Thu hồi phiên làm việc tức thì:** Khi tài khoản đăng nhập ở thiết bị mới, đổi mật khẩu hoặc bị admin khóa/reset mật khẩu, trường `tokenVersion` trên model `User` phải được tăng lên (`+1`) để vô hiệu hóa toàn bộ phiên cũ.
5. 🔒 **Không rò rỉ dữ liệu nhạy cảm:** Không in log mật khẩu, đáp án đề thi hoặc stacktrace lỗi nội bộ ra response client ở môi trường production.
6. 🔒 **Không dùng tài khoản thật khi kiểm thử:** Dữ liệu thử nghiệm hoặc mock data cho AI chỉ dùng thông tin giả lập, không sử dụng dữ liệu định danh thật của cán bộ, công nhân viên Nhà máy Z176.

---
*Bản quyền sản phẩm thuộc về tác giả Phạm Ngọc Dương - Sinh viên K67 - Khoa Công nghệ thông tin - Học viện Nông nghiệp Việt Nam.*
