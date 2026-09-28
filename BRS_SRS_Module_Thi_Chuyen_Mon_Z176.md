# BUSINESS REQUIREMENT / SYSTEM REQUIREMENT SPECIFICATION (SRS)
## Hệ thống thi trắc nghiệm chuyên môn nội bộ Z176

**Đơn vị áp dụng:** Công ty TNHH MTV 76 (Nhà máy Z176) - Bộ Quốc phòng
**Người thực hiện:** Phạm Ngọc Dương — Khóa luận tốt nghiệp K67, Khoa Công nghệ thông tin, Học viện Nông nghiệp Việt Nam
**Trạng thái tài liệu:** Bản chính thức hoàn thiện (Phản ánh 100% hệ thống thực tế đang vận hành)

---

## 1. GIỚI THIỆU CHUNG & BỐ CẢNH DỰ ÁN

Hệ thống thi trắc nghiệm chuyên môn nội bộ Z176 được phát triển nhằm thay thế quy trình kiểm tra năng lực thủ công và công cụ tạm thời (Google Forms). Hệ thống giải quyết triệt để các bài toán thực tế của nhà máy Z176:
- Tự động hóa quy trình soạn, đệ trình, phê duyệt và tổ chức thi.
- Đảm bảo tính minh bạch, công bằng bằng thuật toán sinh mã đề độc lập, không trùng lặp câu hỏi cho mỗi thí sinh.
- Kiểm soát nghiêm ngặt thời gian thực (realtime) quá trình làm bài của thí sinh, chống gian lận và tự động nộp bài khi phát hiện thí sinh cố tình rời khỏi phòng thi hoặc mất kết nối quá thời gian quy định.
- Thống kê, báo cáo kết quả thi theo đơn vị phòng ban chuyên môn trực quan phục vụ công tác đào tạo cán bộ định kỳ.
- Sao lưu & khôi phục dữ liệu tự động lên Google Drive, đảm bảo an toàn dữ liệu cho đơn vị.

---

## 2. VAI TRÒ VÀ PHÂN QUYỀN (ACTORS & ROLES)

Hệ thống định nghĩa 4 vai trò nghiệp vụ (Role) hoạt động thống nhất trên cơ sở dữ liệu dùng chung:

| Vai trò (Role) | Mã Code | Mô tả chức năng thực tế |
| :--- | :--- | :--- |
| **Thí sinh** | `candidate` | - Ôn tập tài liệu được cấp phép theo phòng ban (tài liệu Common + tài liệu riêng đúng phòng ban của mình).<br>- Tham gia thi chính thức (chạy đếm ngược realtime, autosave đáp án theo từng câu, xáo thứ tự câu hỏi & đáp án riêng cho từng lượt thi).<br>- Tra cứu lịch sử điểm cá nhân và xem đáp án câu sai. |
| **Người ra đề** | `examiner` | - Quản lý chủ đề thi và phòng ban chuyên môn.<br>- Nhập ngân hàng câu hỏi (hỗ trợ nhập đơn lẻ hoặc import hàng loạt từ tệp Excel, có bước preview trước khi xác nhận). Hỗ trợ tải ảnh minh họa câu hỏi trực tiếp lên Cloudinary.<br>- Upload và phân phối tài liệu ôn tập (PDF/Word/Excel) theo bộ phận, lưu trữ trên đĩa server nội bộ.<br>- Soạn thảo đề xuất kỳ thi (chọn số lượng câu hỏi chung/riêng, thời gian, ngưỡng đạt) và đệ trình lên cấp trên duyệt. |
| **Người duyệt đề** | `leader` | - Kiểm tra chi tiết và phê duyệt/từ chối/yêu cầu sửa đổi các đề xuất kỳ thi từ Examiner. Khi phê duyệt, Leader cấu hình thời gian bắt đầu và kết thúc kỳ thi (startDate/endDate).<br>- Phát hành kỳ thi chính thức (hệ thống tự sinh mã đề và phân phối cho thí sinh) hoặc lưu trữ (archive) kỳ thi đã kết thúc.<br>- Theo dõi tiến độ thi, xem báo cáo tổng hợp trực quan dạng biểu đồ (phòng ban đạt/không đạt, theo bài thi).<br>- **Cấp thêm lượt thi chính thức** cho thí sinh cụ thể khi gặp sự cố kỹ thuật bất khả kháng. |
| **Quản trị viên** | `admin` | - Quản trị người dùng (CRUD, import/preview danh sách từ Excel, xuất danh sách mật khẩu tạm).<br>- Phân quyền vai trò hệ thống, khóa/mở khóa tài khoản, reset mật khẩu.<br>- Đổi và tùy chỉnh logo đơn vị hiển thị trên hệ thống.<br>- Giám sát an ninh qua hệ thống Nhật ký hoạt động chi tiết (Audit Logs).<br>- **Quản lý Sao lưu & Khôi phục dữ liệu**: tạo bản sao lưu thủ công, xem danh sách, tải về và khôi phục dữ liệu từ Google Drive. |

---

## 3. LUỒNG NGHIỆP VỤ HỆ THỐNG (BUSINESS WORKFLOW)

Quy trình vận hành thực tế của hệ thống diễn ra khép kín qua các bước sau:

```text
  [Người Ra Đề] soạn ngân hàng câu hỏi (Import Excel) & Upload tài liệu ôn tập
        │
        ▼
  [Người Ra Đề] tạo Đề xuất kỳ thi (Chọn tỷ lệ Câu hỏi chung / Câu hỏi riêng bộ phận)
        │
        ▼ (Đệ trình duyệt → Thông báo đẩy tới tất cả Leader)
  [Người Duyệt Đề] thẩm định đề xuất -> Phê duyệt (cấu hình startDate/endDate) / Từ chối (nêu lý do)
        │                                 → Thông báo đẩy tới Examiner đã tạo đề xuất
        ▼ (Phát hành → Thông báo đẩy tới toàn bộ nhân viên, trừ admin & người bấm phát hành)
  [Hệ Thống] tự động sinh các mã đề thi khác nhau (đảo câu hỏi), gán mã đề theo phòng ban cho thí sinh
        │
        ▼
  [Thí Sinh] học tập tài liệu ôn tập -> Thực hiện làm bài thi (Xáo đáp án riêng/lượt thi, Realtime Heartbeat & Autosave)
        │
        ▼ (Nộp bài / Hết giờ / Mất kết nối rời phòng thi quá 1 phút)
  [Hệ Thống] khóa bài thi -> Chấm điểm tự động -> Lưu kết quả thi
        │
        ▼
  [Người Duyệt/Admin] xem báo cáo thống kê trực quan -> Xuất tệp Excel kết quả chi tiết
  [Trang chủ công khai] tra cứu kết quả thi theo mã nhân viên hoặc phòng ban (không cần đăng nhập)
```

---

## 4. CÁC TÍNH NĂNG VÀ YÊU CẦU HỆ THỐNG (SYSTEM REQUIREMENTS)

### 4.1. Quản lý Ngân hàng Câu hỏi & Tài liệu ôn tập
*   **Ngân hàng câu hỏi phân cấp**:
    *   Tổ chức theo **Chủ đề lớn** (vd: An toàn lao động, Kỹ thuật dệt may).
    *   Phân loại theo **Phạm vi áp dụng (Scope)**: **Dùng chung (Common)** (áp dụng cho toàn bộ thí sinh) hoặc **Riêng theo phòng ban (DepartmentSpecific)** (chỉ hiển thị cho công nhân viên thuộc phòng ban đó).
    *   **Loại câu hỏi (questionKind)**: **Lý thuyết (theory)** hoặc **Thực hành (practice)**.
    *   Độ khó gồm 3 mức: **Dễ (easy)**, **Trung bình (medium)**, **Khó (hard)**.
    *   Hỗ trợ 2 kiểu đáp án: **Chọn một đáp án đúng (single)** hoặc **Chọn nhiều đáp án đúng (multiple)**.
*   **Phương thức nhập liệu**: Nhập thủ công qua form giao diện hoặc **Import hàng loạt từ Excel** (có bước preview/kiểm tra tính hợp lệ dữ liệu trước khi xác nhận nhập, hệ thống tự dọn file tạm sau khi xử lý). Hỗ trợ tải ảnh minh họa câu hỏi lên Cloudinary (hash SHA-256 nội dung file ảnh làm `public_id`, dùng `memoryStorage` không lưu file tạm trên đĩa, tự xóa ảnh cũ trên Cloudinary khi thay ảnh khác).
*   **Tài liệu ôn tập độc lập**: Cho phép Examiner tải lên tài liệu ôn tập (.pdf, .doc, .docx, .xls, .xlsx, tối đa 20MB). Tài liệu được cấu hình phạm vi riêng theo phòng ban (scope: Common hoặc DepartmentSpecific). File tài liệu được **lưu trữ trực tiếp trên đĩa server nội bộ** (thư mục `uploadDir`), KHÔNG lưu trên Cloudinary. Hệ thống stream tệp tin qua API có yêu cầu xác thực JWT — thí sinh không thể tải file nếu chưa đăng nhập và chỉ xem được tài liệu đúng phòng ban của mình. Tài liệu ôn tập tách biệt hoàn toàn và không dùng để sinh đề thi tự động.

### 4.2. Thuật toán Sinh đề & Phân phối Mã đề thi
*   **Sinh mã đề có ràng buộc**: Khi Examiner tạo đề xuất, họ cấu hình số lượng câu hỏi của đề (ví dụ: 30 câu) và chỉ định cụ thể **Số câu hỏi dùng chung** (lý thuyết nền tảng) và **Số câu hỏi riêng theo phòng ban** trong đề thi đó. Hệ thống kiểm tra ràng buộc `commonQuestionCount + departmentQuestionCount = totalQuestions` tại tầng model validation.
*   **Sinh mã đề ngẫu nhiên độc lập cho từng thí sinh**: Khi Leader nhấn "Phát hành", hệ thống không dùng chung 1 mã đề cho cả phòng ban, mà tự động sinh ra **các mã đề riêng biệt cho từng cá nhân nhân viên** (`ExamCode` gắn theo `departmentId` và `employee`). Với mỗi người, hệ thống rút ngẫu nhiên các câu hỏi chung và câu hỏi riêng phòng ban theo kế hoạch (kèm cơ chế Smart Fallback bù câu chung nếu thiếu câu riêng), sau đó trộn ngẫu nhiên (Fisher–Yates shuffle). Thuật toán tạo `questionSetFingerprint` (SHA-256) để định danh tập câu hỏi.
*   **Gán đề thông minh & Idempotent**: Hệ thống tự động gán từng thí sinh vào mã đề được sinh riêng cho họ (`ExamCandidate`). Nếu quá trình phát hành bị ngắt quãng, hệ thống chỉ sinh bổ sung cho các nhân viên chưa được gán đề, không tạo trùng.
*   **Xáo riêng từng lượt thi (AttemptQuestion)**: Ngoài việc rút ngẫu nhiên bộ câu hỏi ở cấp mã đề cá nhân (ExamCodeQuestion), khi thí sinh bấm "Bắt đầu thi" hệ thống còn sinh thêm một **snapshot xáo riêng** cho chính lượt thi đó — xáo lại thứ tự câu hỏi VÀ xáo thứ tự các phương án trả lời (Fisher–Yates shuffle). Snapshot này cố định xuyên suốt lượt thi (không bị đổi khi thí sinh tải lại trang hay mất mạng), đảm bảo mỗi lượt thi (kể cả cùng 1 người thi lại) đều có giao diện hiển thị khác nhau.

### 4.3. Quản lý Quy trình Phê duyệt (Workflow)
*   Hệ thống kiểm soát vòng đời của một kỳ thi thông qua các trạng thái nghiêm ngặt:
    *   `draft`: Bản nháp do Examiner soạn thảo, đang cấu hình.
    *   `pending_review`: Đề xuất đã được đệ trình lên cấp trên, chờ duyệt. Hệ thống tự động gửi thông báo (notification) tới **tất cả Leader đang active**.
    *   `rejected`: Leader từ chối đề xuất và bắt buộc nhập lý do từ chối (trả về trạng thái nháp để Examiner sửa đổi). Thông báo từ chối được gửi tới **đúng Examiner đã tạo đề xuất**.
    *   `approved`: Đề xuất đã được duyệt, sẵn sàng phát hành. Leader cấu hình `startDate` và `endDate` khi phê duyệt. Thông báo được gửi tới Examiner.
    *   `published`: Kỳ thi chính thức được phát hành, hệ thống sinh mã đề tự động, gán thí sinh theo phòng ban, thí sinh có thể vào thi. Thông báo phát hành được gửi tới **tất cả user đang active, TRỪ admin và chính người bấm phát hành**.
    *   `archived`: Kỳ thi đã kết thúc, Leader thực hiện lưu trữ lịch sử và khóa toàn bộ thao tác làm bài.
*   **Examiner** chỉ có thể đệ trình lại đề xuất khi ở trạng thái `draft` hoặc `rejected`.

### 4.4. Cơ chế Giám sát & Làm bài thi thời gian thực (Realtime Security)
*   **Autosave**: Giao diện làm bài gọi API lưu trạng thái đáp án (`PATCH /exam-attempts/:id/answer`) mỗi khi thí sinh tích chọn/bỏ chọn đáp án — lưu từng câu riêng lẻ qua `CandidateAnswer` (upsert theo `{examAttemptId, questionId}`). Giúp bảo toàn bài làm khi xảy ra mất điện hoặc sập trình duyệt. Đáp án autosave chưa tính `isCorrect` — chỉ chấm thật lúc nộp bài.
*   **Realtime Heartbeat**: Cứ mỗi 15 giây (khi tab đang visible), client gửi tín hiệu heartbeat lên server (`POST /exam-attempts/:id/heartbeat`). Server cập nhật `lastActiveAt` trên ExamAttempt để duy trì trạng thái hoạt động của lượt thi.
*   **Khóa giao diện và ẩn nút thoát (Close Button Lockdown)**: Khi thí sinh bước vào trạng thái làm bài chính thức (`step === 'testing'`), nút thoát (nút "X") trên thanh tiêu đề Modal được ẩn hoàn toàn. Thí sinh bắt buộc phải tập trung làm bài và chỉ có thể kết thúc phiên thi thông qua nút "Nộp bài", hết giờ làm bài, hoặc hệ thống tự động thu bài khi vi phạm quy chế.
*   **Tự động khóa và nộp bài chống gian lận (2 lớp bảo vệ)**: 
    *   **Lớp 1 (Client-side Warning - 10 giây)**: Lắng nghe sự kiện `visibilitychange` và `window.onblur`. Nếu thí sinh chuyển tab, thu nhỏ trình duyệt hoặc mở ứng dụng khác (Alt+Tab), màn hình lập tức hiển thị cảnh báo vi phạm quy chế thi kèm đồng hồ đếm ngược 10 giây. Nếu không quay lại trong 10 giây, client tự động kích hoạt nộp bài.
    *   **Lớp 2 (Server-side Timeout - 1 phút / 60 giây)**: Nếu thí sinh tắt trình duyệt, ngắt kết nối internet hoặc vô hiệu hóa JavaScript mà **không gửi tín hiệu heartbeat hoặc thao tác bất kỳ (answer/getMyExam) lên máy chủ quá 1 phút (60 giây)**, hệ thống backend sẽ ngay lập tức **tự động nộp bài (auto-submit)** với trạng thái lượt thi chuyển sang `submitted`, lý do tự nộp là `inactive_timeout`, và chấm điểm dựa trên các đáp án đã autosave trong `CandidateAnswer`.
    *   Cơ chế phát hiện timeout được **tích hợp vào đầu mọi request** (getMyExam, recordAnswer, heartbeat) — nghĩa là dù thí sinh đổi thiết bị hay quay lại sau thời gian dài, request đầu tiên sẽ kích hoạt kiểm tra và tự động nộp bài nếu vi phạm. Nếu lượt thi vừa mới bắt đầu mà chưa có `lastActiveAt` thì không tính là bỏ đi (tránh nộp oan).
    *   Thí sinh quay lại sẽ bị chặn không cho làm tiếp và hiển thị thông báo phiên thi đã bị khóa do vi phạm quy chế hoặc rời khỏi ca thi quá thời gian quy định.
*   **Hết giờ thi (Time Expiry)**: Nếu lượt thi vượt quá `expiresAt` (= `startedAt + durationMinutes`), hệ thống chuyển trạng thái sang `expired` — thí sinh không thể tiếp tục làm bài.
*   **Resume lượt thi**: Nếu thí sinh quay lại khi vẫn còn lượt `in_progress` chưa hết hạn, hệ thống trả về đúng lượt thi đó (không tạo lượt mới, không xáo lại thứ tự câu hỏi), kèm `savedAnswers` đã autosave để khôi phục giao diện.
*   **Cấp lượt thi bổ sung**: Trong trường hợp thí sinh gặp sự cố bất khả kháng (mất mạng khách quan), Leader có quyền thao tác `POST /exam-attempts/candidates/:examCandidateId/grant-attempt` để cấp thêm 1 lượt thi chính thức. Lượt bổ sung được cộng dồn vào field `extraAttemptsGranted` trên `ExamCandidate`, số lượt tối đa thực tế = `MAX_OFFICIAL_ATTEMPTS (1) + extraAttemptsGranted`. Leader có thể cấp nhiều lần liên tiếp. Chỉ cấp được khi kỳ thi đang ở trạng thái `published`.

### 4.5. Chấm điểm & Báo cáo kết quả
*   **Chấm điểm tự động**: Hệ thống so sánh đáp án thí sinh đã nộp với đáp án chính xác (`Answer.isCorrect`) trong DB ở phía server — không tin bất kỳ giá trị điểm/đúng-sai nào gửi từ client. Điểm số được tính theo thang điểm 100, làm tròn (`Math.round`). Chấm theo đúng tập câu hỏi trong `AttemptQuestion` snapshot (khớp chính xác với những gì thí sinh thực sự nhìn thấy trong lượt thi đó). Nộp bài idempotent: nếu đã submitted rồi (vd double-click) thì trả lại đúng Result cũ, không chấm lại.
*   **Ngưỡng điểm đạt**: Được cấu hình độc lập trên từng kỳ thi (`passThresholdPercent`, mặc định là 70%). Thí sinh có tỷ lệ câu đúng lớn hơn hoặc bằng ngưỡng này sẽ có trạng thái kết quả là `Passed (Đạt)`, ngược lại là `Failed (Không đạt)`.
*   **Tra cứu kết quả công khai**: Người dùng bên ngoài có thể tra cứu kết quả thi theo mã nhân viên/họ tên (`GET /reports/public/lookup`) hoặc xem danh sách tổng hợp theo phòng ban (`GET /reports/public/by-department`) tại trang chủ mà không cần đăng nhập hệ thống.
*   **Lịch sử kết quả cá nhân**: Thí sinh đã đăng nhập xem lịch sử kết quả thi của chính mình qua `GET /reports/my-results`.
*   **Báo cáo nội bộ cho Leader/Admin**: 
    *   Thống kê tổng quan hệ thống (`GET /reports/overview`).
    *   Kết quả theo phòng ban (`GET /reports/by-department`).
    *   Kết quả theo bài thi (`GET /reports/by-exam`).
    *   Chi tiết điểm từng thí sinh (`GET /reports/results`) — hỗ trợ phân trang, lọc theo phòng ban/trạng thái đạt/khoảng thời gian/từ khóa tìm kiếm.
*   **Xuất Excel báo cáo chuyên nghiệp**: Leader và Admin có thể tải về tệp báo cáo qua thư viện `exceljs`:
    *   `GET /reports/export`: Báo cáo tổng hợp chi tiết điểm số, số câu đúng/sai, trạng thái đạt/không đạt.
    *   `GET /reports/export-by-exam`: Báo cáo thống kê và chi tiết kết quả theo từng bài thi.

### 4.6. Hệ thống Thông báo trong ứng dụng (In-app Notification)
*   Hệ thống chuông thông báo nội bộ gửi thông báo tự động khi có sự kiện quan trọng:
    *   **`exam_submitted`**: Examiner đệ trình đề xuất → thông báo tới **tất cả user role `leader` đang active**.
    *   **`exam_approved`**: Leader phê duyệt đề xuất → thông báo tới **đúng Examiner đã tạo đề xuất**.
    *   **`exam_rejected`**: Leader từ chối đề xuất → thông báo tới **đúng Examiner đã tạo đề xuất**.
    *   **`exam_published`**: Leader phát hành kỳ thi → thông báo tới **tất cả user đang active**, TRỪ chính người bấm phát hành và role `admin`.
    *   **`exam_assignment_failed`**: Thất bại khi tự động gán thí sinh mới vào kỳ thi đang published (do ngân hàng câu hỏi thiếu) → thông báo tới **tất cả Admin active** và **Examiner tạo kỳ thi**.
*   Thông báo hỗ trợ đánh dấu đã đọc/chưa đọc, sắp xếp mới nhất trước, tối ưu truy vấn bằng compound index `{recipientUserId, isRead, createdAt}`.

### 4.7. Sao lưu & Khôi phục dữ liệu (Backup & Restore)
*   **Sao lưu tự động**: Hệ thống đăng ký cron job chạy lúc **03:00 mỗi ngày** (múi giờ `Asia/Ho_Chi_Minh`), tự động chạy `mongodump` → nén `.gz` → upload lên **Google Drive** (OAuth2 với Gmail cá nhân) → xoay vòng giữ tối đa **5 bản** mới nhất, xóa bản cũ hơn. Ghi audit `BACKUP_AUTO_CREATE` hoặc `BACKUP_AUTO_FAILED`.
*   **Sao lưu thủ công**: Admin bấm nút tạo backup (`POST /api/backups`) → dump & upload Drive → xoay vòng tương tự. Ghi audit `BACKUP_MANUAL_CREATE`.
*   **Xem danh sách bản sao lưu**: `GET /api/backups` — liệt kê các bản backup trên Drive (tối đa 5, mới nhất trước).
*   **Tải về bản sao lưu**: `GET /api/backups/:fileId/download` — stream trực tiếp file từ Drive về client, ghi audit `BACKUP_DOWNLOAD`.
*   **Khôi phục dữ liệu**: `POST /api/backups/restore` — upload file `.gz` (tối đa 2GB) → `mongorestore --drop` (XÓA TOÀN BỘ dữ liệu hiện tại). Yêu cầu gửi `confirm=RESTORE` trong body để tránh thao tác nhầm. Ghi audit `BACKUP_RESTORE`.
*   Toàn bộ endpoint backup chỉ dành cho role `admin`, yêu cầu đã đổi mật khẩu.

### 4.8. Dọn dẹp file tạm tự động (Upload Cleanup)
*   Cron job chạy **mỗi giờ** (phút 0), quét thư mục `uploadDir` và xóa các file tạm có tuổi > **6 tiếng**. Đây là lưới an toàn cho các luồng preview/confirm import Excel không hoàn tất (người dùng đóng tab, đổi ý, phiên hết hạn). Luồng bình thường (confirm import câu hỏi, upload tài liệu ôn tập) đã tự xoá file sau khi xử lý xong — job này chỉ dọn phần rơi rớt lại.
*   Chạy ngay 1 lần lúc khởi động server để dọn rác tồn đọng từ trước khi server bị restart.
*   Ghi audit `UPLOAD_TMP_CLEANUP` mỗi khi có file bị xoá.

### 4.9. Tự động xóa cứng tài khoản bị khóa lâu ngày (Account Purge)
*   Cron job chạy lúc **04:00 mỗi ngày** (múi giờ `Asia/Ho_Chi_Minh`), tự động quét và xóa cứng các tài khoản bị khóa liên tục quá **6 tháng** (`lockedAt <= now - 6 tháng`).
*   **Nguyên tắc bảo vệ dữ liệu lịch sử**: Hệ thống kiểm tra dấu vết trước khi xóa. Nếu tài khoản đã từng tham gia kỳ thi (`ExamCandidate > 0`) hoặc từng là actor trong nhật ký hệ thống (`AuditLog > 0`) thì **tuyệt đối không xóa**, giữ lại vĩnh viễn nhằm đảm bảo toàn vẹn báo cáo kiểm toán.
*   Tài khoản đủ điều kiện sẽ được xóa cứng cả `User` và `Employee`, đồng thời ghi 1 bản ghi audit log tổng hợp `ACCOUNT_PURGE_AUTO` để phục vụ truy vết.

---

## 5. MÔ HÌNH DỮ LIỆU THỰC TẾ (DATABASE SCHEMA MAPPING)

Dữ liệu được lưu trữ tập trung trên MongoDB thông qua các thực thể chính sau:

| Model | Collection | Chức năng chính |
| :--- | :--- | :--- |
| `Role` | `roles` | Lưu thông tin các vai trò hệ thống: name, code (admin, examiner, leader, candidate), description, isActive. |
| `User` | `users` | Tài khoản đăng nhập: username (unique, lowercase), passwordHash, roleId, mustChangePassword, isActive, lockedAt (mốc thời gian lần khóa gần nhất), failedLoginAttempts, lockUntil (cơ chế khóa tạm tài khoản khi đăng nhập sai nhiều lần) và tokenVersion (thu hồi phiên cũ). |
| `Employee` | `employees` | Hồ sơ cá nhân nhân viên: fullname, employeeCode (unique, sparse), dob (String — giữ format gốc), gender, phone, address, position, isActive. Liên kết 1-1 với `User` và `Department`. |
| `Department` | `departments` | Danh mục phòng ban: name (unique), code (mã phòng ban, unique, sparse, chuẩn hóa hoa + bỏ dấu), slug (tên chuẩn hóa bỏ dấu/lowercase dùng khớp import), description, isActive. |
| `Topic` | `topics` | Danh mục các chủ đề lớn của kỳ thi: name (unique), description, isActive. |
| `Question` | `questions` | Ngân hàng câu hỏi: content, questionKind (theory/practice), answerType (single/multiple), difficulty (easy/medium/hard), scope (Common/DepartmentSpecific), topicId, departmentId, imageUrl, imageCloudinaryId (Cloudinary public_id = SHA-256 hash), isActive, createdBy. |
| `Answer` | `answers` | Các phương án trả lời: questionId, content, isCorrect, sortOrder. |
| `Exam` | `exams` | Cấu hình kỳ thi và vòng đời phê duyệt: title, topicId, startDate, endDate, durationMinutes, totalQuestions, commonQuestionCount, departmentQuestionCount, status, passThresholdPercent (mặc định 70%), createdBy, approvedBy, approvedAt, publishedAt, rejectionReason. Validate ràng buộc `commonQuestionCount + departmentQuestionCount = totalQuestions`. |
| `ExamCode` | `examcodes` | Các biến thể mã đề thi: examId, code (vd DE-001, unique trong examId), departmentId (mỗi mã đề phục vụ 1 phòng ban), questionSetFingerprint (hash kiểm tra trùng). |
| `ExamCodeQuestion` | `examcodequestions` | Bảng liên kết xác định tập câu hỏi và thứ tự đảo của từng mã đề: examCodeId, questionId, orderIndex. Unique index: {examCodeId, questionId} và {examCodeId, orderIndex}. |
| `ExamCandidate` | `examcandidates` | Danh sách thí sinh được gán vào kỳ thi: examId, employeeId, examCodeId, extraAttemptsGranted (số lượt thi bổ sung do Leader cấp, mặc định 0). Unique index: {examId, employeeId}. |
| `ExamAttempt` | `examattempts` | Phiên làm bài cụ thể: examCandidateId, attemptType (practice/official), startedAt, submittedAt, status (in_progress/submitted/expired), expiresAt, examSessionTokenHash, lastActiveAt (mốc nhận heartbeat/thao tác gần nhất), autoSubmitReason (inactive_timeout nếu bị tự nộp). |
| `AttemptQuestion` | `attemptquestions` | **Snapshot câu hỏi + thứ tự đáp án đã xáo RIÊNG cho từng lượt thi**: examAttemptId, questionId, orderIndex, answerOrder (mảng answerId đã xáo). Sinh đúng 1 lần lúc bắt đầu lượt thi (Fisher–Yates), không xáo lại sau đó. Unique index: {examAttemptId, questionId} và {examAttemptId, orderIndex}. |
| `CandidateAnswer` | `candidateanswers` | Lưu đáp án thí sinh đã lựa chọn: examAttemptId, questionId, selectedAnswerIds (mảng ObjectId), isCorrect (chỉ tính khi nộp bài). Unique index: {examAttemptId, questionId}. Autosave upsert theo câu riêng lẻ. |
| `Result` | `results` | Bảng điểm kết quả cuối cùng: examAttemptId (unique), score (thang 100), correctCount, totalQuestions, passed. |
| `StudyDocument` | `studydocuments` | File tài liệu ôn tập: topicId, title, **filePath** (đường dẫn file trên đĩa server nội bộ), originalFileName, mimeType, scope (Common/DepartmentSpecific), departmentId, uploadedBy, isActive. Validate ràng buộc scope DepartmentSpecific phải có departmentId. |
| `Schedule` | `schedules` | Lịch trình kỳ thi: examId, plannedDate, note. |
| `AuditLog` | `auditlogs` | Ghi nhật ký hành động: actorUserId (null nếu job tự động), action, resourceType, resourceId, metadata (Mixed), ipAddress. Index: {createdAt: -1}. |
| `Notification` | `notifications` | Thông báo in-app: recipientUserId, type (exam_submitted/exam_approved/exam_rejected/exam_published), title, message, examId, isRead. Index: {recipientUserId, isRead, createdAt}. |

---

## 6. KHẢ NĂNG BẢO MẬT & ĐỘ TIN CẬY (SECURITY BASELINE)

- **Ngăn ngừa đăng nhập nhiều thiết bị**: Mỗi khi người dùng đăng nhập mới thành công, hệ thống tự động tăng `tokenVersion` trên model `User` -> vô hiệu hóa tức thì toàn bộ access token và refresh token cũ đang lưu hành ở các thiết bị trước đó (middleware `authenticate` so sánh `payload.tv` với `user.tokenVersion`, lệch là từ chối với mã `AUTH_ACCESS_REVOKED`). Client định kỳ sẽ phát hiện và hiển thị `SessionRevokedModal` chặn màn hình thao tác của phiên cũ.
- **Khóa tài khoản tạm thời khi đăng nhập sai nhiều lần**: Hệ thống đếm `failedLoginAttempts` qua mỗi lần đăng nhập thất bại. Khi vượt ngưỡng `ACCOUNT_LOCK_MAX_ATTEMPTS` (mặc định 5 lần), tài khoản bị khóa trong khoảng `ACCOUNT_LOCK_MINUTES` (mặc định 15 phút). Đăng nhập thành công sẽ reset bộ đếm về 0.
- **Bắt buộc đổi mật khẩu lần đầu**: Tài khoản được admin tạo (import Excel hoặc seed) có cờ `mustChangePassword = true`. Middleware `requirePasswordChanged` chặn mọi thao tác nghiệp vụ cho tới khi người dùng hoàn tất đổi mật khẩu (API đổi mật khẩu xóa cờ này).
- **Xác thực JWT đôi (Access + Refresh Token)**: Access token ngắn hạn (`JWT_ACCESS_EXPIRES_IN`, mặc định 15 phút), refresh token dài hạn (`JWT_REFRESH_EXPIRES_IN`, mặc định 7 ngày, lưu qua httpOnly cookie `sameSite: lax`, `secure` ở production). Refresh token cũng kiểm tra `tokenVersion` — bị thu hồi cùng lúc khi đăng nhập thiết bị mới.
- **Bảo mật file tài liệu**: Tài liệu ôn tập lưu trên đĩa server nội bộ, không có URL tĩnh công khai. API tải file yêu cầu xác thực JWT và kiểm tra quyền truy cập theo phòng ban (candidate chỉ xem tài liệu Common + đúng phòng ban của mình). Server stream file nhị phân trực tiếp, đảm bảo chỉ nhân viên có tài khoản hợp lệ mới xem được tài liệu.
- **Rate Limiting**: 
    - **Đăng nhập**: Giới hạn `LOGIN_RATE_LIMIT_MAX` (mặc định 5) request trong cửa sổ `LOGIN_RATE_LIMIT_WINDOW_MINUTES` (mặc định 15 phút) trên mỗi IP. Chỉ active ở production.
    - **Lượt thi**: Giới hạn 100 request/phút theo **userId** (`keyGenerator: (req) => req.auth?.userId ?? req.ip`) cho toàn bộ luồng thao tác bài thi (start, answer, heartbeat, submit) — đảm bảo mỗi thí sinh có hạn ngạch độc lập, giải quyết triệt để tình trạng nghẽn/chặn nhầm khi hàng chục, hàng trăm thí sinh thi cùng lúc sau 1 địa chỉ IP/NAT mạng LAN công ty. Chỉ active ở production.
- **Audit Logging**: Mọi hành vi nhạy cảm của người dùng (tạo/sửa/xóa tài khoản, import nhân viên, khóa/mở khóa tài khoản, thay đổi quyền, đổi logo hệ thống, chỉnh sửa ngân hàng đề, tạo/đệ trình/phê duyệt/từ chối/phát hành/lưu trữ kỳ thi, sao lưu/khôi phục dữ liệu, dọn file tạm) đều được hệ thống ghi vết vào bộ sưu tập `auditlogs` kèm `actorUserId`, `ipAddress`, và `metadata` chi tiết, phục vụ thanh tra an ninh bảo mật nội bộ. Các job tự động (backup cron, upload cleanup, account purge) ghi audit với `actorUserId = null`.
- **Seed Admin tự động**: Khi khởi động server lần đầu (hoặc khi `SEED_ON_START=true`), hệ thống tự tạo tài khoản admin với mật khẩu tạm và cờ `mustChangePassword = true` (production), đảm bảo luôn có quyền quản trị ban đầu mà không lộ mật khẩu mặc định.

