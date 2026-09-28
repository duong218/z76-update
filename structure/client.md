# Cấu trúc client

## Phạm vi

`client/` là ứng dụng Single Page Application (SPA) xây dựng bằng React 19, Vite và Tailwind CSS v4. Sử dụng Lenis cho smooth scroll, Lucide React cho hệ thống icon, Motion cho animation vi tương tác, Recharts cho biểu đồ thống kê báo cáo. Thư mục `dist/` là đầu ra build production (không chỉnh sửa trực tiếp).

```text
client/
├── .gitignore                              # Loại trừ node_modules, dist, .env khỏi git
├── eslint.config.js                        # Cấu hình ESLint cho React/JSX (hook rules, refresh plugin)
├── index.html                              # Entry HTML, mount #root, favicon dùng logo.svg, viewport responsive
├── metadata.json                           # Metadata dự án (tên hệ thống Z176, mô tả, capabilities)
├── package.json                            # Dependencies & scripts (dev, build, lint, preview)
├── package-lock.json                       # Lockfile npm
├── vite.config.js                          # Cấu hình Vite: @vitejs/plugin-react, @tailwindcss/vite, alias @ -> /src
├── assets/                                 # Thư mục tài nguyên tĩnh cấp root
├── public/
│   ├── images/
│   │   └── HeroSection.jpg                 # Ảnh nền hero section trang chủ
│   ├── logo/
│   │   └── logo.svg                        # Logo doanh nghiệp mặc định / favicon
│   └── templates/
│       ├── Mau_Import_Cau_Hoi_Z176.xlsx    # Mẫu Excel chuẩn import câu hỏi ngân hàng đề
│       └── Mau_Import_Nhan_Vien_Z176.xlsx  # Mẫu Excel chuẩn import danh sách nhân viên
├── src/
│   ├── App.jsx                             # Component gốc: AppShell (ToastProvider + ConfirmProvider) → App (Auth, Routing, Polling, khởi tạo Lenis smooth scroll)
│   ├── data.js                             # Dữ liệu tĩnh Z176: thông tin doanh nghiệp, quy chế thi, hướng dẫn thi, dữ liệu mẫu
│   ├── index.css                           # CSS gốc, import Tailwind CSS v4 (@theme tokens, custom scrollbar, animations)
│   ├── main.jsx                            # Entry point React: render AppShell bọc trong StrictMode + ErrorBoundary
│   ├── assets/
│   │   └── images/
│   │       └── military_banner_bg_*.jpg    # Ảnh nền banner phong cách quân đội Z176
│   ├── hooks/
│   │   └── useScrollLock.js                # Hook khóa cuộn: gọi lenis.stop() + body overflow hidden khi modal/drawer mở, tự phục hồi khi đóng
│   ├── lib/
│   │   └── lenis-instance.js               # Singleton module-level lưu trữ instance Lenis active (setLenisInstance / getLenisInstance)
│   ├── components/
│   │   ├── Banner.jsx                      # Banner hiển thị tên đơn vị, tiêu đề cuộc thi, badge doanh nghiệp
│   │   ├── ChangePasswordModal.jsx         # Modal đổi mật khẩu bắt buộc lần đầu đăng nhập (mustChangePassword), useScrollLock
│   │   ├── ConfirmDialog.jsx               # Dialog xác nhận bất đồng bộ thay thế window.confirm(), hook useConfirm(), useScrollLock
│   │   ├── ContactSection.jsx              # Section thông tin liên hệ kỹ thuật + thông tin công ty Z176
│   │   ├── CTAButton.jsx                   # Nút gọi hành động chính trên trang chủ (Vào thi, Tra cứu kết quả)
│   │   ├── ErrorBoundary.jsx               # Bọc bắt lỗi render component React, hiển thị fallback UI an toàn
│   │   ├── ExamModal.jsx                   # Modal phòng thi toàn màn hình: câu hỏi, đếm giờ, autosave, heartbeat 15s, tự nộp khi vắng mặt, cảnh báo rời thi 10s, useScrollLock
│   │   ├── Footer.jsx                      # Footer trang chủ: thông tin bản quyền, liên hệ, chính sách
│   │   ├── Header.jsx                      # Header navigation: logo tùy chỉnh, menu điều hướng, user info, đăng xuất, NotificationBell, mobile drawer, useScrollLock(drawerOpen)
│   │   ├── LoginModal.jsx                  # Modal đăng nhập: form username/password, validation, gọi auth service, useScrollLock
│   │   ├── LogoSelectorModal.jsx           # Modal tùy chỉnh/chọn logo đơn vị hiển thị (dành cho Admin), useScrollLock
│   │   ├── NotificationBell.jsx            # Chuông thông báo: badge đếm chưa đọc (poll 30s), dropdown phân loại sự kiện, đọc tất cả
│   │   ├── QuickGuideSection.jsx           # Section hướng dẫn 4 bước thi trắc nghiệm trên trang chủ
│   │   ├── RegulationsSection.jsx          # Section quy chế thi trắc nghiệm chuyên môn Z176
│   │   ├── ResultsLookupSection.jsx        # Section tra cứu kết quả thi công khai theo Mã nhân viên / Phòng ban
│   │   ├── SessionRevokedModal.jsx         # Modal chặn thao tác khi phiên đăng nhập bị thu hồi (đăng nhập từ nơi khác), useScrollLock
│   │   ├── TimeAndCountdown.jsx            # Hiển thị đồng hồ thời gian thực và đếm ngược kỳ thi active
│   │   ├── Toast.jsx                       # Toast notification thông báo kết quả thao tác (success/error/info/warning)
│   │   ├── ToastContext.jsx                # React Context + Provider quản lý hàng đợi Toast toàn app, hook useToast()
│   │   └── UnitLogoDisplay.jsx             # Component hiển thị logo đơn vị (ưu tiên logo custom từ localStorage, fallback logo.svg)
│   │
│   ├── components/admin/
│   │   ├── AccountTab.jsx                  # Tab quản lý tài khoản: CRUD user, tạo inline phòng ban, import Excel 2 bước, xuất Excel credentials, phân role, khóa/mở, reset password, useScrollLock
│   │   ├── AuditLogTab.jsx                 # Tab nhật ký hệ thống: phân trang, lọc theo action/user/resource/thời gian, chi tiết metadata
│   │   ├── BackupTab.jsx                   # Tab sao lưu & phục hồi: danh sách backup Drive, tạo backup, restore file .gz với progress % và phrase xác nhận
│   │   └── OverviewTab.jsx                 # Tab tổng quan admin: thống kê tài khoản theo role, kỳ thi active, số lượng câu hỏi
│   │
│   ├── components/examiner/
│   │   ├── DepartmentTab.jsx               # Tab quản lý phòng ban: CRUD phòng ban, mã code, slug, tìm kiếm, ngừng sử dụng/khôi phục, useScrollLock
│   │   ├── ExamProposalTab.jsx             # Tab đề xuất kỳ thi: tạo mới / chỉnh sửa dự thảo (draft/rejected), cấu hình câu hỏi theo độ khó/phạm vi, thời gian thi, nộp duyệt, useScrollLock
│   │   ├── OverviewTab.jsx                 # Tab tổng quan examiner: thống kê ngân hàng câu hỏi, chủ đề, trạng thái đề xuất
│   │   ├── QuestionBankTab.jsx             # Tab ngân hàng câu hỏi: CRUD câu hỏi trắc nghiệm đơn/nhiều đáp án, upload ảnh Cloudinary, import Excel 2 bước, xóa hàng loạt, useScrollLock
│   │   ├── StudyDocumentTab.jsx            # Tab tài liệu ôn tập: upload file PDF/Word/Excel lên server nội bộ, phân quyền phòng ban, xem/tải/xóa
│   │   └── TopicTab.jsx                    # Tab chủ đề thi: CRUD chủ đề, tự động khôi phục nếu tạo trùng tên chủ đề đã xóa mềm
│   │
│   ├── components/leader/
│   │   ├── DepartmentReportTab.jsx         # Tab báo cáo phòng ban: thống kê số thí sinh, số lượt thi, tỷ lệ đạt/không đạt theo từng đơn vị
│   │   ├── DetailedResultsTab.jsx          # Tab kết quả chi tiết: danh sách bảng điểm thí sinh, bộ lọc nâng cao, xuất Excel, cấp thêm lượt thi
│   │   ├── ExamReportTab.jsx               # Tab báo cáo kỳ thi: thống kê tổng hợp kết quả theo từng kỳ thi, xuất báo cáo Excel
│   │   ├── ExamReviewTab.jsx               # Tab duyệt đề thi: xem chi tiết cấu hình đề, duyệt (approve), từ chối (reject kèm lý do), phát hành (publish), lưu trữ (archive), useScrollLock
│   │   └── OverviewTab.jsx                 # Tab tổng quan leader: biểu đồ và chỉ số hiệu suất thi toàn đơn vị
│   │
│   ├── pages/
│   │   ├── admin/AdminDashboard.jsx        # Dashboard Quản trị viên: điều phối các tab Admin (Overview, Account, AuditLog, Backup)
│   │   ├── candidate/CandidateDashboard.jsx# Dashboard Thí sinh: xem kỳ thi active, tài liệu ôn tập theo phòng ban, lịch sử làm bài, vào thi
│   │   ├── examiner/ExaminerDashboard.jsx  # Dashboard Người ra đề: điều phối các tab Examiner (Overview, QuestionBank, Topic, Department, ExamProposal, StudyDocument)
│   │   └── leader/LeaderDashboard.jsx      # Dashboard Người duyệt đề: điều phối các tab Leader (Overview, ExamReview, DepartmentReport, ExamReport, DetailedResults)
│   │
│   └── services/
│       ├── api.js                          # HTTP client trung tâm: apiRequest(), gắn Bearer token, silent refresh token với queueing, xử lý 401 & SESSION_EXPIRED_EVENT
│       ├── token-store.js                  # Module lưu trữ accessToken trong localStorage (get, save, clear, getAuthHeaders)
│       ├── auth.service.js                 # Service xác thực: loginUser, refreshAccessToken, logoutUser, fetchMe, changePassword
│       ├── admin.service.js                # Service quản trị: fetchOverviewStats, CRUD user, import/export Excel nhân viên, backup/restore API
│       ├── exam-attempt.service.js         # Service làm bài thi: fetchMyExam, startExamAttempt, submitExamAttempt, answerExamQuestion (autosave), sendExamHeartbeat
│       ├── exam-review.service.js          # Service workflow kỳ thi: fetchPendingExams, fetchApprovedExams, fetchExamHistory, approveExam, rejectExam, publishExam, archiveExam, fetchActiveExam, grantExtraAttempt
│       ├── examiner.service.js             # Service người ra đề: CRUD câu hỏi, upload ảnh câu hỏi, preview/confirm import câu hỏi, xóa hàng loạt, CRUD chủ đề, CRUD phòng ban, tạo/chỉnh sửa đề xuất kỳ thi
│       ├── notification.service.js         # Service thông báo: fetchNotifications, fetchUnreadCount, markNotificationRead, markAllNotificationsRead
│       ├── report.service.js               # Service báo cáo: fetchOverviewReport, fetchDepartmentReport, fetchExamReport, fetchDetailedResults, exportReport, lookupPublicResult, fetchMyResults
│       └── study-document.service.js       # Service tài liệu: fetchStudyDocuments, fetchCandidateDocuments, createStudyDocument, deleteStudyDocument, getStudyDocumentFileBlob
└── dist/                                   # Đầu ra build production (Vite build)
```

## Quản lý Trạng thái (State Management)

Dự án sử dụng chiến lược quản lý trạng thái phân tán, chủ yếu dựa trên React Context và Local State:

- **Auth State**: Quản lý tập trung tại `App.jsx` (lưu trữ `user`, `role`, `mustChangePassword`) truyền xuống các component con dưới dạng props hoặc qua các component bọc (Wrapper).
- **Global UI State**: Sử dụng Context API.
  - `ToastContext`: Cung cấp hàm `showToast(msg, type)` / `addToast()` để hiển thị thông báo ở mọi nơi mà không cần truyền props.
  - `ConfirmDialog (ConfirmContext)`: Quản lý hiển thị dialog xác nhận bất đồng bộ qua hook `useConfirm()`.
- **Scroll Lock**: Module-level singleton (`lib/lenis-instance.js`) + hook (`hooks/useScrollLock.js`) quản lý trạng thái khóa cuộn khi modal/drawer mở. Tự động gọi `lenis.stop()` + `document.body.style.overflow = 'hidden'` khi `isLocked = true`, phục hồi khi `isLocked = false`. Được tích hợp vào tất cả modal và drawer trong hệ thống.
- **Local State**: Các form, danh sách, modal quản lý trạng thái độc lập bằng `useState`, `useReducer`, `useRef`.

## Tích hợp API và Gọi dữ liệu (API Integration & Data Fetching)

- **Axios / Fetch Helper (`api.js`)**: Cấu hình URL cơ sở (`VITE_API_URL`), credentials.
- **Interceptor Flow**:
  - Request: Tự động gắn header `Authorization: Bearer <token>` bằng token lấy từ `token-store.js`.
  - Response: Bắt lỗi 401 (Unauthorized). Gọi luồng *Silent Refresh Token* ngầm (`/api/auth/refresh`) để cấp lại access token.
  - **Queueing Mechanism**: Khi refresh đang chạy, mọi request gọi API khác sẽ bị tạm giữ (push vào queue) và chỉ được thực thi tiếp khi refresh thành công (tránh gọi refresh nhiều lần liên tiếp).
- **Custom Event `SESSION_EXPIRED_EVENT`**: Khi refresh thất bại hoặc tokenVersion bị thu hồi, hệ thống phát event để đẩy user ra ngoài (hiển thị modal thông báo và xóa token).

## Routing và Phân quyền Giao diện (Routing & Role-based UI)

- Không sử dụng thư viện Routing bên thứ 3 mà dùng luồng điều hướng (conditional rendering) thủ công gọn nhẹ qua trạng thái Auth tại `App.jsx`.
- **Tầng bảo vệ (Guards)**: `App.jsx` quyết định load trang chủ hay dashboard dựa vào role của `user` trả về từ `/api/auth/me`.
- Dashboard của từng vai trò được tải dựa vào role code (`admin`, `examiner`, `leader`, `candidate`).
- Nếu user truy cập trái phép tab của người khác, UI mặc định sẽ không render component tab đó.

## Tiêu chuẩn UI/CSS (Tailwind v4)

- **Cấu hình**: Sử dụng Tailwind CSS v4 không cần cấu hình phức tạp trong `tailwind.config.js`, sử dụng cú pháp import CSS nội tuyến `@theme` trong `index.css`.
- **Thiết kế Responsive**: Mobile-first cho toàn bộ layout. Tab/Dashboard sử dụng Flexbox/CSS Grid.
- **Animations**:
  - Sử dụng thư viện `Motion` (Framer Motion) hoặc Tailwind classes (`animate-spin`, `transition-all`) cho vi tương tác (micro-interactions).
  - Tối ưu cuộn trang: Sử dụng thư viện `Lenis` tạo hiệu ứng cuộn mượt (Smooth Scrolling) trên trang chủ, quản lý instance qua singleton (`lenis-instance.js`) và hook `useScrollLock` khóa cuộn khi overlay mở.
- **Icons**: Sử dụng bộ `lucide-react`, đồng nhất SVG format cho toàn bộ hệ thống (dễ dàng tùy chỉnh `size` và `strokeWidth`).
