# Tình huống Ngoại lệ & Hạn chế Hệ thống Z176

Tài liệu này tổng hợp các tình huống ngoại lệ (edge cases) mà hệ thống đã **chủ động xử lý** để tránh lỗi trong vận hành thực tế, cùng các **hạn chế kỹ thuật** mà dự án hiện chưa giải quyết hoặc chấp nhận đánh đổi.

---

## PHẦN A — TÌNH HUỐNG NGOẠI LỆ ĐÃ KHẮC PHỤC

### A1. Trùng lặp ngẫu nhiên mã đề khi tạo ExamCode (Retry E11000)

**Tình huống:** Hàm `buildExamCode` sinh mã đề có hậu tố ngẫu nhiên (ví dụ `D3F9A1-XUONG1-NV001-A8F1`). Trong trường hợp hi hữu trùng mã duy nhất `{examId, code}` trên MongoDB (ném lỗi `E11000`).

**Cách khắc phục:** Hàm `ensureExamCodeForEmployee` trong `exam-code-generation.service.js` chủ động bắt mã lỗi `11000`, tự động retry sinh lại mã đề mới với hậu tố ngẫu nhiên khác và tiếp tục lưu DB an toàn.

---

### A2. Publish kỳ thi bị gián đoạn giữa chừng (Idempotent Recovery theo từng nhân viên)

**Tình huống:** Quá trình publish kỳ thi đã tạo xong `ExamCode` và `ExamCandidate` cho một số nhân viên thì gặp lỗi mạng hoặc DB timeout. Leader bấm "Đăng chính thức" lại lần nữa.

**Cách khắc phục:** Hàm `generateExamCodesAndAssignCandidates` được thiết kế idempotent theo **từng nhân viên**:
- Quét danh sách nhân viên đã có `ExamCandidate` cho kỳ thi này (`alreadyAssignedIds`) → bỏ qua, không tạo lại.
- Chỉ tạo `ExamCode` và `ExamCandidate` cho những nhân viên còn thiếu (`pendingEmployees`).
- Trạng thái kỳ thi chỉ chuyển sang `published` **sau khi** sinh đề và gán thành công cho tất cả nhân viên của mọi phòng ban → không bao giờ publish dở dang.

---

### A3. Thí sinh tải lại trang / đổi thiết bị giữa chừng khi đang thi

**Tình huống:** Máy tính thí sinh bị treo, phải chuyển sang điện thoại, hoặc vô tình nhấn F5 reload trang trong lúc đang làm bài.

**Cách khắc phục:** Hàm `startAttempt` kiểm tra: nếu đang có lượt thi `in_progress` còn hạn → **trả về đúng lượt thi đó** (`resumed: true`), không tạo lượt mới và không tốn lượt thi. Snapshot `AttemptQuestion` (thứ tự câu hỏi đã xáo) và `CandidateAnswer` (đáp án đã autosave) đều được giữ nguyên trên server → thí sinh mở lại từ bất kỳ thiết bị nào vẫn thấy đúng bài thi và đáp án đã chọn trước đó.

---

### A4. Tài khoản nhân viên đã nghỉ (đã khóa) trùng mã với nhân viên mới

**Tình huống:** Nhân viên A nghỉ việc (tài khoản bị khóa `isActive: false`), sau đó nhân viên B mới vào trùng mã nhân viên hoặc trùng username với A.

**Cách khắc phục:** Hàm `createUser` trong `user.service.js` gọi `findExistingAccountForReuse` tìm theo cả `employeeCode` và `username`:
- Nếu tài khoản trùng đang **bị khóa** và role là `candidate` → tự động **tái sử dụng** (hàm `reactivateLockedAccount`): mở khóa, cập nhật hồ sơ Employee mới, đổi username nếu khác, sinh mật khẩu tạm mới, ghi audit log "Tái sử dụng tài khoản đã khóa".
- Nếu tài khoản trùng đang **hoạt động** → báo lỗi `USERNAME_EXISTS` hoặc `EMPLOYEE_CODE_ACTIVE`, không cho ghi đè.

---

### A5. Phòng ban / Chủ đề bị xóa mềm rồi tạo lại trùng tên

**Tình huống:** Quản trị viên xóa phòng ban "Kỹ thuật" (xóa mềm → `isActive: false`), sau đó tạo lại phòng ban cùng tên "Kỹ thuật" hoặc import Excel có phòng ban đó.

**Cách khắc phục:**
- `upsertDepartmentForImport` và `findOrCreateDepartmentByName` trong `department.service.js`: tìm cả bản ghi đã bị xóa mềm (`isActive: false`); nếu trùng tên/mã → **khôi phục** (bật lại `isActive: true`, cập nhật thông tin mới) thay vì tạo bản ghi mới đụng unique index.
- `createTopic` trong `topic.service.js`: tương tự, nếu tên chủ đề trùng với chủ đề đã xóa mềm → khôi phục và trả thêm cờ `restored: true` để giao diện hiển thị thông báo "đã khôi phục chủ đề cũ (bao gồm các câu hỏi cũ thuộc chủ đề này)".

---

### A6. Thí sinh bỏ thi / ngắt kết nối đột ngột

**Tình huống:** Thí sinh tắt máy tính, mất điện, hoặc cố tình đóng trình duyệt để "câu giờ" không nộp bài.

**Cách khắc phục:** Hệ thống dựng **2 lớp phòng thủ song song**:

| Lớp | Vị trí | Thời gian | Cơ chế |
|---|---|---|---|
| **Lớp 1** | Client (`ExamModal.jsx`) | 10 giây | Sự kiện `visibilitychange` / `blur` → hiện cảnh báo đếm ngược 10s → quá hạn tự gọi `submitAttempt` |
| **Lớp 2** | Server (`checkAndAutoSubmitIfInactive`) | 60 giây | Kiểm tra `lastActiveAt` tại mọi API (`getMyExam`, `recordAnswer`, `heartbeat`) → nếu idle > 60s → cưỡng chế nộp bài, chấm điểm dựa trên `CandidateAnswer` đã autosave |

Lớp 2 là lớp bảo vệ cốt lõi không thể bị vô hiệu hóa từ phía client (vì server tự tính thời gian dựa trên request).

---

### A7. Nộp bài 2 lần liên tiếp (Double-submit)

**Tình huống:** Mạng lag, thí sinh nhấn "Nộp bài" 2 lần liên tiếp hoặc client tự động nộp đúng lúc thí sinh cũng bấm nộp.

**Cách khắc phục:** Hàm `submitAttempt` kiểm tra: nếu lượt thi đã ở trạng thái `submitted` từ trước → trả về đúng `Result` đã chấm trước đó, **không chấm lại**, không tạo `Result` trùng. Tính chất idempotent.

---

### A8. Gán đề thi cho nhân viên mới tạo thất bại (nuốt lỗi an toàn + thông báo)

**Tình huống:** Trong lúc kỳ thi đang `published`, Quản trị viên tạo nhân viên mới thuộc phòng ban có ngân hàng câu hỏi không đủ → lỗi `INSUFFICIENT_QUESTIONS`.

**Cách khắc phục:** Hàm `assignEmployeeToActiveExamIfAny`:
- **Không ném lỗi ra ngoài** → tài khoản nhân viên vẫn tạo thành công bình thường.
- Ghi cảnh báo `console.error` ra log hệ thống.
- Gọi `notifyExamAssignmentFailed` gửi thông báo tới tất cả Admin và Examiner đã tạo kỳ thi, kèm tên nhân viên, phòng ban, và lý do thất bại → để người quản trị chủ động bổ sung câu hỏi.

---

### A9. File Excel import bị hỏng hoặc đổi đuôi giả

**Tình huống:** File `.txt` đổi đuôi thành `.xlsx`, hoặc file Excel bị hỏng giữa chừng lúc upload.

**Cách khắc phục:** Hàm `readImportRows` trong `question.service.js` bọc `XLSX.readFile` trong try-catch: nếu thư viện `xlsx` ném lỗi kỹ thuật (vd "Corrupted zip", "Unsupported file") → bọc lại thành `ApiError` tiếng Việt rõ ràng: *"File không đúng định dạng Excel hoặc đã bị hỏng. Vui lòng kiểm tra lại file (.xlsx) và tải lên lại."*

---

### A10. Import câu hỏi trùng lặp với ngân hàng hiện có

**Tình huống:** File Excel chứa câu hỏi giống hệt câu đã có trong DB (do import lại file cũ, hoặc copy-paste nội dung).

**Cách khắc phục:** Hệ thống tải trước toàn bộ câu hỏi `isActive: true` vào `Set` (key = `topicId|scope|departmentId|normalizedContent`), so khớp từng dòng import:
- Trùng → đưa vào danh sách `duplicates`, hiển thị ở bước preview để người dùng quyết định giữ/bỏ.
- Không trùng → đưa vào `ready`.
Tránh N+1 query bằng cách dùng `Set` thay vì query DB từng dòng.

---

### A11. Chặn xóa câu hỏi / chủ đề khi kỳ thi đang diễn ra

**Tình huống:** Examiner xóa câu hỏi thuộc chủ đề đang được kỳ thi `published` sử dụng. Dù câu hỏi đó không nằm trong đề đã sinh, nhưng nếu nhân viên mới được thêm vào → hệ thống cần tạo `ExamCode` mới và query lại `Question.isActive:true` → thiếu số lượng → lỗi `INSUFFICIENT_QUESTIONS`.

**Cách khắc phục:**
- `deactivateQuestion` và `deactivateManyQuestions`: chặn **toàn bộ** câu hỏi thuộc chủ đề đang được kỳ thi `published` dùng (theo `topicId`), kèm thông báo rõ tên kỳ thi.
- `deactivateTopic`: chặn xóa chủ đề nếu có `Exam` đang `published` tham chiếu `topicId` đó.
- Xóa hàng loạt (`deactivateManyQuestions` với filters): nếu danh sách chứa câu hỏi từ nhiều chủ đề, chỉ **loại bỏ các câu thuộc chủ đề bị chặn** khỏi danh sách xóa, xóa phần còn lại và báo rõ bao nhiêu câu bị giữ lại.

---

### A12. Phân biệt token hết hạn vs token giả mạo

**Tình huống:** Frontend không phân biệt được khi nào access token hết hạn (cần refresh) và khi nào token bị sai/giả mạo (cần logout). Trước đây cả 2 trường hợp cùng trả mã `AUTH_ACCESS_INVALID`, khiến client luôn gọi thêm 1 API `/auth/refresh` vô ích.

**Cách khắc phục:** Hàm `verifyAccessToken` phân biệt 2 loại lỗi:
- `TokenExpiredError` (token đúng chữ ký nhưng quá `exp`) → mã `AUTH_ACCESS_EXPIRED` → client tự động gọi refresh rồi thử lại request gốc.
- Các lỗi khác (sai chữ ký, bị sửa, sai định dạng) → mã `AUTH_ACCESS_INVALID` → client logout ngay, không tốn lượt gọi refresh.

---

### A13. Chỉ cho phép 1 phiên đăng nhập hoạt động tại 1 thời điểm

**Tình huống:** Nhân viên đăng nhập ở 2 trình duyệt/thiết bị khác nhau → có thể nhờ người khác thi hộ ở thiết bị thứ 2.

**Cách khắc phục:** Mỗi lần đăng nhập thành công, hàm `loginWithUsernamePassword` tự tăng `tokenVersion` → mọi access/refresh token đã cấp trước đó (ở phiên cũ) lập tức bị lệch `tv` so với DB → bị middleware `authenticate` từ chối với mã `AUTH_ACCESS_REVOKED` ở request kế tiếp. Client polling `tokenVersion` mỗi 5 giây phát hiện phiên bị thu hồi và hiện modal `SessionRevokedModal`.

---

### A14. Khóa tài khoản khi đăng nhập sai nhiều lần

**Tình huống:** Tấn công brute-force mật khẩu, hoặc nhân viên quên mật khẩu bấm thử nhiều lần.

**Cách khắc phục:** Hàm `registerFailedLogin` đếm `failedLoginAttempts`: khi vượt `accountLockMaxAttempts` → gán `lockUntil` (thời gian khóa tạm = `accountLockMinutes` phút) → lần đăng nhập tiếp theo bị chặn với mã `AUTH_LOCKED` (HTTP 423). Đăng nhập thành công sẽ reset bộ đếm về 0.

---

### A15. Bù đắp câu hỏi riêng từ pool chung khi thiếu (Smart Fallback)

**Tình huống:** Phòng ban X cần 5 câu riêng nhưng ngân hàng chỉ có 3 câu riêng → nếu chặn hẳn thì cả kỳ thi không publish được chỉ vì 1 phòng ban thiếu 2 câu riêng.

**Cách khắc phục:** `validateQuestionAvailability` trong `exam-code-generation.service.js` tự động bù 2 câu thiếu từ pool câu hỏi Chung (`commonPickCount = commonQuestionCount + shortfall`). Chỉ ném lỗi khi **tổng 2 pool (Chung + Riêng)** vẫn không đủ tổng số câu của đề thi.

---

### A16. Ảnh câu hỏi dùng chung trên Cloudinary (Content-addressable)

**Tình huống:** 2 câu hỏi import ảnh giống hệt nhau → tạo 2 bản sao asset trên Cloudinary, tốn dung lượng.

**Cách khắc phục:** `uploadQuestionImageBuffer` tính `SHA-256` nội dung ảnh làm `public_id` + `overwrite: true` → ảnh giống nhau tự dùng chung 1 asset, import/upload lại đúng ảnh cũ sẽ ghi đè thay vì tạo bản sao.

---

### A17. File tạm import bị bỏ dở không dọn (Upload Cleanup Scheduler)

**Tình huống:** Người dùng upload file Excel import, xem preview rồi đóng tab/đổi ý → file tạm nằm lại trên đĩa vĩnh viễn.

**Cách khắc phục:** Scheduler `upload-cleanup.scheduler.js` chạy mỗi giờ, xóa file tạm trong `uploadDir` cũ hơn 6 tiếng. Ghi audit log `UPLOAD_TMP_CLEANUP` để truy vết. Chạy ngay 1 lần lúc server khởi động để dọn rác tồn đọng.

---

### A18. Audit log bị ghi trùng 2 dòng cho cùng 1 hành động

**Tình huống:** Cả service (vd `createUser`) lẫn controller (vd `user.controller.js`) cùng ghi audit log → mỗi lần tạo tài khoản bị ghi 2 dòng log (1 dòng có chi tiết từ controller, 1 dòng từ service không có metadata).

**Cách khắc phục:** Loại bỏ audit log khỏi tầng service, chỉ giữ ở controller (nơi có đủ context: action chuẩn, `metadata.detail`, `ipAddress`). Ghi chú rõ trong code "*Audit: KHÔNG ghi ở đây nữa*" để tránh lặp lại lỗi.

---

### A19. Import Excel với cột tiếng Việt có dấu / không dấu / hoa-thường

**Tình huống:** File Excel có tiêu đề cột "Chủ đề", "CHU DE", "chude", "Chủ Đề" → hệ thống cần nhận diện tất cả đều là cùng 1 cột.

**Cách khắc phục:** Hàm `normalizeKey` trong `question.service.js` và `user.service.js`:
1. Lowercase → thay `đ` thành `d` (vì `normalize('NFD')` không tách được chữ đ) → `normalize('NFD')` bỏ dấu → loại khoảng trắng.
2. Map enum (`DIFFICULTY_MAP`, `KIND_MAP`, `SCOPE_MAP`) được build bằng `buildNormalizedMap` với cùng hàm `normalizeKey`, đảm bảo key từ Excel luôn khớp key trong map.

---

### A20. Xóa ảnh Cloudinary lỗi không chặn luồng cập nhật câu hỏi

**Tình huống:** Examiner đổi ảnh câu hỏi → cần xóa ảnh cũ trên Cloudinary. Nếu Cloudinary API bị timeout hoặc ảnh đã bị xóa tay từ trước → không được chặn việc cập nhật câu hỏi trong DB.

**Cách khắc phục:** Hàm `deleteQuestionImage` bọc `cloudinary.uploader.destroy` trong try-catch, chỉ `console.error` nếu lỗi, không throw.

---

### A21. Path Traversal khi confirm import bằng token

**Tình huống:** Client gửi token import dạng `../../etc/passwd` → đọc file ngoài thư mục upload.

**Cách khắc phục:** Hàm `resolveImportTokenPath` lấy `path.basename(token)` và kiểm tra `safe !== token` → từ chối nếu token chứa bất kỳ ký tự đường dẫn nào (`/`, `\`, `..`).

---

### A22. Rate Limiting theo userId thay vì IP — tránh chặn nhầm phòng thi lớn

**Tình huống:** Trong phòng thi lớn (50–100+ thí sinh cùng mạng LAN công ty), tất cả thí sinh đều chia sẻ chung 1 IP công cộng (NAT). Rate limiter mặc định (`express-rate-limit`) đếm theo IP → heartbeat mỗi 15s + autosave mỗi lần đổi đáp án từ hàng chục thí sinh cộng dồn vào **cùng 1 bộ đếm** → dễ chạm giới hạn 100 req/phút/IP → một số thí sinh bị từ chối tạm thời (HTTP 429) dù hành vi cá nhân hoàn toàn hợp lệ.

**Cách khắc phục:** Middleware `examAttemptRateLimiter` trong `rate-limit.middleware.js` sử dụng `keyGenerator: (req) => req.auth?.userId ?? req.ip` — đếm rate limit theo **userId** thay vì IP. Vì hệ thống chỉ cho phép 1 phiên đăng nhập/tài khoản tại 1 thời điểm (xem A13 — `tokenVersion`), `userId` là định danh ổn định và duy nhất cho mỗi thí sinh → mỗi người có bộ đếm riêng, không bị ảnh hưởng bởi người khác cùng mạng. Fallback về `req.ip` khi chưa có `req.auth` (phòng trường hợp thứ tự middleware bị đổi trong tương lai, dù `examAttemptRateLimiter` luôn đặt sau `authenticate` trên route).

---

### A23. Tự động xóa cứng tài khoản bị khóa liên tục quá 6 tháng (Account Purge Scheduler)

**Tình huống:** Tài khoản nhân viên đã nghỉ việc bị khóa lâu ngày tích tụ làm tăng dung lượng cơ sở dữ liệu. Tuy nhiên, nếu xóa cứng bừa bãi sẽ làm mồ côi hoặc gãy liên kết dữ liệu lịch sử thi cử (`ExamCandidate`) và nhật ký hệ thống (`AuditLog`).

**Cách khắc phục:**
- Khi khóa tài khoản (`toggleUserLock`), hệ thống ghi nhận thời điểm khóa vào trường `User.lockedAt`. Nếu tài khoản được mở khóa, `lockedAt` được xóa về `undefined` (đảm bảo đồng hồ 6 tháng tự động reset nếu bị khóa lại).
- Scheduler `account-purge.scheduler.js` chạy lúc **04:00 hàng ngày** gọi `purgeExpiredLockedAccounts`:
  1. Lọc các tài khoản `isActive: false` và có `lockedAt <= now - 6 tháng` liên tục.
  2. Kiểm tra dấu vết lịch sử (`hasHistoricalFootprint`): Nếu tài khoản **đã từng tham gia kỳ thi** (`ExamCandidate > 0`) hoặc **từng là actor trong nhật ký hệ thống** (`AuditLog > 0`) → **Tuyệt đối không xóa**, giữ lại vĩnh viễn để bảo vệ tính toàn vẹn báo cáo/kiểm toán.
  3. Chỉ xóa cứng cả `User` và `Employee` đối với tài khoản không có vết lịch sử, đồng thời ghi 1 dòng audit log tổng hợp `ACCOUNT_PURGE_AUTO` để truy vết.
  4. Các tài khoản khóa từ trước khi có tính năng này (`lockedAt` là `null`) sẽ được giữ an toàn, không xóa tự động.

---

## PHẦN B — HẠN CHẾ HIỆN TẠI CỦA DỰ ÁN

### B1. Chỉ hỗ trợ tối đa 1 kỳ thi `published` tại 1 thời điểm

Hệ thống thiết kế "**single active exam**": khi publish kỳ thi mới, tất cả kỳ thi `published` trước đó tự động chuyển sang `archived`. Các API phòng thi (`resolveCandidateContext`) luôn query `Exam.findOne({ status: 'published' })`.

**Hệ quả:** Không thể tổ chức 2 kỳ thi song song (ví dụ An toàn Lao động cho Xưởng 1 và Kiểm tra Chuyên môn cho Phòng Kỹ thuật cùng lúc).

---

### B2. Không có hệ thống WebSocket / Real-time

Hệ thống hiện dùng **HTTP polling** (client gọi API định kỳ) thay vì WebSocket:
- Client polling `tokenVersion` mỗi 5 giây để phát hiện phiên bị thu hồi.
- Thông báo (Notification) cần refresh trang hoặc chờ polling để hiển thị.

**Hệ quả:** Độ trễ phản hồi lên tới 5 giây khi phiên bị thu hồi. Không có push notification tức thì.

---

### B3. Không có Transaction MongoDB (Atomicity hạn chế)

Các thao tác liên quan nhiều collection (tạo User + Employee + gán ExamCandidate, hoặc publish kỳ thi tạo ExamCode + ExamCodeQuestion + ExamCandidate) được thực hiện **tuần tự** mà không gói trong MongoDB Transaction. Nếu lỗi xảy ra giữa chừng:
- Tạo User thành công nhưng Employee lỗi → có rollback thủ công `User.deleteOne`.
- Publish kỳ thi lỗi giữa chừng → có cơ chế idempotent recovery (Mục A2) nhưng **không rollback tự động** dữ liệu đã ghi.

**Hệ quả:** Trong trường hợp hiếm gặp (crash server giữa lúc ghi), có thể tồn tại dữ liệu mồ côi cần xử lý thủ công.

---

### B4. Chỉ xóa mềm các thực thể nghiệp vụ (Phòng ban, Chủ đề, Câu hỏi)

Đối với các thực thể cốt lõi như Phòng ban (`Department`), Chủ đề (`Topic`), và Câu hỏi (`Question`), hệ thống chỉ hỗ trợ xóa mềm (`isActive: false`) để bảo toàn tính toàn vẹn tham chiếu với các đề thi đã phát hành và kết quả thi trong quá khứ. Chưa có công cụ quản trị (Purge Tool) để xóa cứng các danh mục này. (Riêng tài khoản người dùng đã có cơ chế tự động dọn dẹp an toàn sau 6 tháng khóa — xem Mục A23).

**Hệ quả:**
- Các danh mục câu hỏi, chủ đề, phòng ban đã xóa mềm vẫn chiếm dung lượng và tồn tại trong cơ sở dữ liệu.
- Ràng buộc duy nhất (Unique index) trên trường như `slug` (Department) hoặc `name` (Topic) vẫn lưu giữ bản ghi cũ → khi tạo mới trùng tên, hệ thống phải kích hoạt luồng "khôi phục" thay vì tạo bản ghi hoàn toàn mới.

---

### B5. Backup / Restore phụ thuộc hoàn toàn vào công cụ bên ngoài

- **mongodump / mongorestore** phải được cài sẵn trên server (`mongodb-database-tools`). Nếu chưa cài → API backup trả lỗi `BACKUP_TOOL_NOT_FOUND`.
- **Google Drive** lưu bản backup qua OAuth2 cá nhân (không phải Service Account do hạn chế quota Drive cá nhân). Refresh token có thể hết hạn nếu Google thu hồi quyền truy cập hoặc không sử dụng trong thời gian dài.
- Restore (`--drop`) **xóa toàn bộ dữ liệu hiện tại** trước khi khôi phục → không có cơ chế merge hoặc partial restore.

---

### B6. Lưu trữ ảnh câu hỏi phụ thuộc Cloudinary (dịch vụ bên ngoài)

Ảnh câu hỏi được upload lên Cloudinary. Nếu Cloudinary gặp sự cố hoặc tài khoản bị khóa:
- Upload ảnh mới sẽ thất bại.
- Ảnh hiện có vẫn hiển thị được (đã lưu URL tĩnh).
- Xóa ảnh cũ lỗi được nuốt im lặng, không ảnh hưởng luồng cập nhật câu hỏi (Mục A20).

**Hệ quả:** Không có bản sao ảnh nội bộ. Nếu mất truy cập Cloudinary, toàn bộ ảnh câu hỏi sẽ không hiển thị được.

---

### B7. Heartbeat và Timeout dựa trên đồng hồ server (không đồng bộ client)

- `lastActiveAt` được gán `new Date()` ở **phía server**, không dùng timestamp từ client.
- `INACTIVITY_TIMEOUT_MS = 60_000` (1 phút) là hằng số cứng, không cấu hình qua giao diện.

**Hệ quả:**
- Nếu thí sinh có mạng rất chậm (latency > 15s), heartbeat có thể tới server muộn → server tính `idleMs` dài hơn thực tế → có thể bị auto-submit sớm hơn mong muốn (trường hợp cực kỳ hiếm).
- Admin không thể điều chỉnh timeout qua giao diện mà phải sửa code.

---

### B8. Không hỗ trợ thi thử (Practice Mode)

Model `ExamAttempt` có trường `attemptType` với giá trị `official` và `practice`, nhưng hiện tại **chỉ xử lý** `official`. Không có API hay giao diện cho chế độ thi thử.

**Hệ quả:** Thí sinh không có cách luyện tập trước khi thi chính thức trong hệ thống.

---

### B9. Thiếu cơ chế tự động kết thúc kỳ thi khi hết hạn (`endDate`)

Kỳ thi có `startDate` và `endDate` nhưng hệ thống **không có** scheduler tự động chuyển trạng thái từ `published` sang `archived` khi `endDate` đã qua. Kỳ thi chỉ kết thúc khi Leader chủ động publish kỳ thi mới (kỳ thi cũ bị archive), hoặc thao tác thủ công.

**Hệ quả:** Kỳ thi có thể "mở" vô thời hạn dù `endDate` đã qua, cho tới khi Leader can thiệp.

---

### B10. Phân trang (Pagination) chỉ hỗ trợ offset-based

API danh sách câu hỏi (`listQuestions`) sử dụng `skip(offset).limit(pageSize)`. Khi dataset lớn (hàng chục nghìn câu hỏi), MongoDB phải duyệt qua toàn bộ offset trước khi trả kết quả → hiệu năng giảm ở các trang cuối.

**Hệ quả:** Chưa ảnh hưởng ở quy mô hiện tại (nhà máy Z176), nhưng có thể gặp vấn đề nếu mở rộng cho nhiều đơn vị hoặc tích lũy dữ liệu lâu dài.

---

### B11. Không có phân quyền chi tiết theo phòng ban cho Examiner

Mọi Examiner đều có thể tạo, sửa, xóa câu hỏi **bất kỳ phòng ban nào** (không giới hạn theo phòng ban mà Examiner quản lý). Tương tự, Examiner có thể tạo đề xuất kỳ thi cho bất kỳ chủ đề nào.

**Hệ quả:** Phù hợp với quy mô nhỏ (1 Examiner quản lý toàn bộ ngân hàng câu hỏi), nhưng thiếu cơ chế kiểm soát khi có nhiều Examiner thuộc nhiều phòng ban khác nhau.

---

### B12. Không hỗ trợ câu hỏi tự luận hoặc media ngoài ảnh tĩnh

Hệ thống chỉ hỗ trợ câu hỏi trắc nghiệm:
- **Đơn đáp án** (`single`): Chọn đúng 1 đáp án đúng.
- **Nhiều đáp án** (`multiple`): Chọn đúng và đủ tất cả đáp án đúng.

Không hỗ trợ: câu hỏi tự luận, câu hỏi kéo-thả, câu hỏi sắp xếp thứ tự, hoặc câu hỏi có video/audio đính kèm.

---

### B13. Mật khẩu tạm 6 chữ số (độ an toàn thấp cho giai đoạn chuyển giao)

Mật khẩu tạm sinh bằng `crypto.randomInt(100000, 999999)` — chỉ 6 chữ số, dễ gõ nhưng không mạnh. Thí sinh bắt buộc phải đổi mật khẩu lần đầu đăng nhập (`mustChangePassword`), nhưng nếu file Excel xuất danh sách tài khoản (`exportCandidateCredentialsExcel`) bị lộ trước khi nhân viên đổi mật khẩu → toàn bộ tài khoản trong file bị lộ.

**Hệ quả:** Cần bảo mật chặt chẽ file Excel chứa mật khẩu tạm (đã có cảnh báo trong file xuất).

---

### B14. Không có log truy cập hệ thống (Access Log) chi tiết

Audit log chỉ ghi các hành động nghiệp vụ (tạo tài khoản, xóa câu hỏi, backup...). Không ghi log truy cập HTTP chi tiết (IP, User-Agent, thời gian phản hồi, status code) cho mọi request.

**Hệ quả:** Khó truy vết khi cần điều tra sự cố bảo mật hoặc phân tích hiệu năng. Có thể bổ sung bằng reverse proxy (Nginx access log) nhưng chưa tích hợp sẵn.
