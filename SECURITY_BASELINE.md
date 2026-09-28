# SECURITY_BASELINE.md — Chuẩn bảo mật tối thiểu
## Module Thi Chuyên Môn Nội Bộ — Z176
**Người thực hiện:** Phạm Ngọc Dương — VNUA 
**Mục đích:** Cụ thể hóa mục 4 "Do-Not-Touch" trong SKILLS.md thành checklist áp dụng được — dùng để tự review code (của mình lẫn AI sinh ra) trước khi merge, và để chạy trước mỗi lần demo/deploy.

> File này đứng dưới AGENT_RULES.md và SKILLS.md về thứ tự ưu tiên, nhưng là bản chi tiết nhất về mặt kỹ thuật cho riêng chủ đề bảo mật. Khi SKILLS.md mục 4 và file này có vẻ mâu thuẫn — SKILLS.md thắng, báo lại để đồng bộ.

---

## 1. Xác thực & Phân quyền (Auth / RBAC)

- [ ] JWT access token có thời gian sống ngắn (khuyến nghị ≤ 15-30 phút), refresh token riêng, lưu ở httpOnly cookie — không lưu access token ở `localStorage`.
- [ ] Mọi route `/api/**` liên quan đề thi/đáp án/kết quả đều đi qua middleware `auth` + `role-check`, không có route "tạm bỏ qua để test" sót lại (đối chiếu SKILLS.md mục 4.4).
- [ ] 3 role (Admin / Người ra đề / Thí sinh) tách rõ quyền: Thí sinh không có endpoint nào trả về đáp án đúng trước/trong khi thi.
- [ ] Kiểm tra quyền ở **server**, không chỉ ẩn UI ở client (ẩn nút không phải là phân quyền).
- [ ] Không hardcode secret/token trong code — dùng biến môi trường (`.env`, không commit `.env` lên git).
- [ ] Có cơ chế khóa tài khoản/giới hạn số lần đăng nhập sai (chống brute-force).

## 2. Mật khẩu & Mã hóa

- [ ] Mật khẩu hash bằng `bcrypt` (hoặc `argon2`), không tự viết thuật toán hash riêng.
- [ ] Câu hỏi/đáp án đề thi: cân nhắc mã hóa ở tầng lưu trữ nếu đơn vị yêu cầu (chờ khảo sát #13, #35) — tối thiểu phải kiểm soát quyền đọc chặt ở tầng DB/API.
- [ ] Trộn câu hỏi/đáp án dùng `crypto.randomInt()` — **tuyệt đối không** `Math.random()` (SKILLS.md mục 4.5).
- [ ] Session thi (token phiên làm bài) phải random đủ mạnh, có thời hạn, hủy ngay khi nộp bài hoặc hết giờ.

## 3. Logging & Debug

- [ ] `console.log`/logger không bao giờ in ra câu hỏi/đáp án dạng rõ (plaintext) — kể cả môi trường dev (SKILLS.md mục 4.1).
- [ ] Log lỗi production không leak stack trace ra response cho client — trả về theo format chuẩn `{ success, message, code }` (đã quy định ở SKILLS.md mục 3).
- [ ] Log audit (ai làm gì, lúc nào) cho các hành động nhạy cảm: tạo/sửa/xóa câu hỏi, chấm điểm, xem đáp án, thay đổi phân quyền.
- [ ] Không dùng dịch vụ logging/error-tracking cloud (Sentry bản cloud, LogRocket...) khi chưa xác nhận với Ban CNTT Z176 (SKILLS.md mục 4.2, AGENT_RULES.md mục 2.1).

## 4. Dữ liệu & Third-party

- [ ] Không tích hợp bất kỳ SDK/API bên thứ ba nào gửi dữ liệu ra ngoài (analytics, error tracking, AI service...) nếu chưa xác nhận Ban CNTT.
- [ ] Không dùng OAuth công khai (Google/Facebook login) — môi trường nội bộ, dùng JWT tự quản lý (SKILLS.md mục 1).
- [ ] Không dùng tài khoản demo/test chứa thông tin thật của nhân viên Z176 (SKILLS.md mục 4.3).
- [ ] Dữ liệu thật chỉ nhập vào hệ thống sau khi deploy nội bộ, thao tác trực tiếp bởi người có thẩm quyền, không qua AI tool (AGENT_RULES.md mục 1.3).
- [ ] Backup dữ liệu (nếu có) không đẩy lên cloud storage công khai (Google Drive cá nhân, Dropbox...) — chỉ lưu nội bộ trừ khi Z176 cho phép.

## 5. Input & Validation

- [ ] Validate ở cả client (UX) và server (bắt buộc) — không tin dữ liệu từ client (SKILLS.md mục 3).
- [ ] Chống injection: dùng Mongoose/parameterized query, không nối chuỗi trực tiếp vào query.
- [ ] Giới hạn kích thước request/upload (nếu có upload file câu hỏi dạng ảnh/đính kèm).
- [ ] Sanitize output nếu có hiển thị nội dung do người dùng nhập (chống XSS).

## 6. Hạ tầng & Deploy (🔸 giả định tạm, chờ khảo sát #26, #29)

- [ ] HTTPS bắt buộc ở mọi môi trường có dữ liệu thật (kể cả nội bộ).
- [ ] CORS chỉ cho phép domain/nội bộ đã whitelist, không để `*` ở production.
- [ ] Biến môi trường production tách riêng khỏi dev/demo, không dùng chung secret.
- [ ] Nếu deploy bản demo lên Render/Vercel (theo LIBRARY.md mục 8) — **chỉ dùng dữ liệu mock**, không bao giờ trỏ vào dữ liệu/DB thật.
- [ ] Rate limiting cho API đăng nhập và API nộp bài thi (chống spam/DDoS đơn giản).

## 7. Trước khi merge code liên quan bảo mật (checklist nhanh)

1. [ ] Đã đối chiếu với 5 nguyên tắc cứng SKILLS.md mục 4 chưa?
2. [ ] Đã đọc từng dòng, không merge mù (AGENT_RULES.md mục 3.1) chưa?
3. [ ] Đã chạy qua bộ test tối thiểu (auth, role-check, chấm điểm) chưa?
4. [ ] Đã ghi lại vào NhatKyTienDo...xlsx: phần nào AI sinh, phần nào tự viết chưa?
5. [ ] Nếu dùng skill nhóm Bảo mật/Database trong LIBRARY.md — đã kiểm tra skill đó không tự gửi dữ liệu đi đâu chưa?

---

## 8. Việc còn để mở — chờ khảo sát chính thức

| Mục | Câu hỏi khảo sát liên quan | Ảnh hưởng |
|---|---|---|
| Mức độ mã hóa câu hỏi/đáp án bắt buộc | #13, #35 | Quyết định mã hóa tầng DB hay chỉ kiểm soát quyền đọc |
| On-premise vs cloud | #26, #29 | Ảnh hưởng yêu cầu HTTPS/CORS/hạ tầng cụ thể |
| Quy định riêng của Z176 về dùng AI/công cụ nội bộ | #28 | Có thể bổ sung thêm rule vào mục 4 (Third-party) |

---
*File này bổ sung sau khảo sát chính thức nếu Z176 có yêu cầu bảo mật đặc thù (mã hóa cấp độ mật, air-gapped network...). Đọc cùng AGENT_RULES.md và SKILLS.md mục 4 — không thay thế hai file đó.*
