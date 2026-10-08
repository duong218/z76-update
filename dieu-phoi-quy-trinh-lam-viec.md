# Điều phối quy trình làm việc (Engineering & AI Workflow)
## Hệ thống thi trắc nghiệm chuyên môn nội bộ — Nhà máy Z176
**Người thực hiện:** Phạm Ngọc Dương — Khóa luận tốt nghiệp K67, Khoa CNTT, Học viện Nông nghiệp Việt Nam  
**Mục đích:** Quy định phương pháp làm việc, quy trình lập kế hoạch và nguyên tắc phối hợp giữa Kỹ sư phát triển và AI Coding Assistant trong dự án Z176.

---

## #1. Mặc định lập kế hoạch (Plan-First Approach)

- Chuyển sang chế độ lập kế hoạch cho **BẤT KỲ** tác vụ nào không đơn giản (từ 3 bước trở lên hoặc có tác động đến kiến trúc, CSDL Mongoose, hoặc bảo mật).
- Đối chiếu trước với các tài liệu chuẩn mực của hệ thống:
  - [`SKILLS.md`](file:///d:/code%20file/Z176-main/SKILLS.md): Quy ước công nghệ, coding convention và 6 nguyên tắc cứng không được chạm vào.
  - [`SECURITY_BASELINE.md`](file:///d:/code%20file/Z176-main/SECURITY_BASELINE.md): Checklist kiểm soát an ninh tối thiểu trước khi triển khai/merge.
  - [`GLOSSARY.md`](file:///d:/code%20file/Z176-main/GLOSSARY.md): Thuật ngữ chuẩn hóa, tên model và mã định danh.
- Nếu có sự cố bất thường xảy ra: **DỪNG** và lập kế hoạch phân tích lại ngay — không sửa mù hoặc thay đổi mã nguồn tùy tiện.
- Viết đặc tả chi tiết các đầu việc trước khi code để giảm thiểu sự mơ hồ.

## #2. Chiến lược phân tách nhiệm vụ (Subagent & Modular Execution)

- Sử dụng các tác nhân phụ (subagents) cho các công việc nghiên cứu, đọc tài liệu, đối chiếu mô hình hoặc phân tích song song để giữ ngữ cảnh chính tập trung.
- Mỗi tác vụ chỉ giải quyết một mục tiêu cụ thể (ví dụ: tối ưu truy vấn Mongoose, bổ sung validator, cập nhật giao diện component).
- Đảm bảo tính độc lập và toàn vẹn của từng tầng: Controller mỏng, Service dày, Model chặt chẽ.

## #3. Vòng lặp tự cải thiện & Truy vết bài học (Self-Improvement Loop)

- Khi phát hiện lỗi hoặc người dùng sửa chữa: Ghi nhận dạng lỗi vào nhật ký theo dõi hoặc tài liệu bài học kinh nghiệm.
- Thiết lập quy tắc kiểm tra để ngăn chặn lỗi tương tự lặp lại (ví dụ: không bao giờ để lộ trường `isCorrect` về client khi thi, luôn kiểm tra `tokenVersion`).
- Thường xuyên rà soát lại các quy tắc cốt lõi khi bắt đầu phiên làm việc mới.

## #4. Xác minh trước khi hoàn tất (Verification Before Done)

- **Tuyệt đối không** đánh dấu một tác vụ là hoàn thành nếu chưa chứng minh nó hoạt động chính xác.
- Luôn kiểm chứng:
  1. Tính đúng đắn của logic nghiệp vụ (Auth, RBAC 4 vai trò, sinh mã đề, tính điểm, xuất Excel).
  2. Tính tương thích ngược với dữ liệu cũ (ví dụ: các trường mới như `extraDepartmentIds`, `allowCommonCompensation`, `departmentScope`).
  3. Kiểm tra nhật ký kiểm toán (`AuditLog`) và đảm bảo không có rò rỉ lỗi hay stack trace ở môi trường production.
- Tự phản biện theo tiêu chuẩn kỹ sư cấp cao: *"Giải pháp này có an toàn, tối ưu và bảo mật trong môi trường quân đội Z176 hay không?"*

## #5. Yêu cầu sự tinh tế & Cân bằng (Elegance & Simplicity)

- Với những thay đổi phức tạp: Tìm giải pháp tinh tế, rõ ràng, tận dụng triệt để kiến trúc hiện có (ví dụ: dùng chung hàm xử lý import thay vì viết lặp mã).
- Tránh thiết kế dư thừa (over-engineering) cho những yêu cầu đơn giản.
- Giữ mã nguồn sạch, có chú thích bằng tiếng Việt chuẩn mực, tôn trọng coding style hiện tại của dự án.

## #6. Tự chủ sửa lỗi (Autonomous Bug Fixing)

- Khi gặp mã lỗi API hoặc lỗi kiểm thử: Dựa trực tiếp vào error code, log và cấu trúc dữ liệu để tìm nguyên nhân gốc rễ (Root Cause Analysis).
- Khắc phục triệt để, không dùng các bản vá tạm thời (hotfix chắp vá).
- Đảm bảo luồng xử lý lỗi trả về đúng cấu trúc `{ success: false, message, code }` theo chuẩn `ApiError`.

---

## Quản lý tác vụ & Quy trình triển khai

1. **Lập kế hoạch trước**: Xác định rõ các file cần chỉnh sửa và phạm vi ảnh hưởng.
2. **Kiểm tra ràng buộc**: Đối chiếu với 6 nguyên tắc cứng trong [`SKILLS.md`](file:///d:/code%20file/Z176-main/SKILLS.md).
3. **Thực hiện thay đổi**: Tác động tối thiểu, chỉ sửa những gì cần thiết.
4. **Kiểm thử & Xác minh**: Chạy thử luồng nghiệp vụ hoặc kiểm tra cú pháp mã nguồn.
5. **Ghi nhận & Cập nhật tài liệu**: Đồng bộ hóa tài liệu đặc tả ([`BRS_SRS_Module_Thi_Chuyen_Mon_Z176.md`](file:///d:/code%20file/Z176-main/BRS_SRS_Module_Thi_Chuyen_Mon_Z176.md), [`SECURITY_BASELINE.md`](file:///d:/code%20file/Z176-main/SECURITY_BASELINE.md), [`security_report.md`](file:///d:/code%20file/Z176-main/security_report.md)).

## Nguyên tắc cốt lõi

- **Ưu tiên sự đơn giản**: Tác động đến ít mã nhất có thể nhưng giải quyết triệt để vấn đề.
- **Không lười biếng**: Tìm nguyên nhân gốc rễ, tuân thủ tiêu chuẩn kỹ thuật cao cấp.
- **An toàn & Bảo mật là tiên quyết**: Tuyệt đối bảo vệ đề thi, tài liệu nội bộ và tính công bằng của kỳ thi.

