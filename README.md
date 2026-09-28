# HỆ THỐNG THI TRẮC NGHIỆM CHUYÊN MÔN NỘI BỘ Z176
> **SẢN PHẨM KHÓA LUẬN TỐT NGHIỆP**
> * Sinh viên thực hiện: **Phạm Ngọc Dương**
> * Mã lớp / Khóa: **K67**
> * Trường: **Học viện Nông nghiệp Việt Nam**

---

## 1. Giới thiệu chung

Hệ thống thi trắc nghiệm chuyên môn nội bộ Z176 là giải pháp phần mềm được nghiên cứu và phát triển nhằm tự động hóa quy trình tổ chức thi đánh giá năng lực, tay nghề chuyên môn dành cho cán bộ và công nhân viên tại **Nhà máy Z176 - Bộ Quốc phòng**. 

Hệ thống giúp tối ưu hóa từ khâu soạn đề đề xuất, phê duyệt & phát hành mã đề thi (tự động xáo trộn câu hỏi và đáp án), giám sát thời gian làm bài thời gian thực (realtime) với cơ chế tự động nộp bài khi thí sinh rời ca thi, cho đến khâu chấm điểm tự động và xuất báo cáo kết quả chi tiết theo định dạng Excel chuẩn.

---

## 2. Tổng quan công nghệ sử dụng

Hệ thống được phát triển theo mô hình Client-Server phân lớp rõ ràng, đảm bảo hiệu năng và tính bảo mật cao:

### Client (Frontend)
*   **Framework**: [React 19](https://react.dev/) & [Vite](https://vite.dev/) (Tối ưu tốc độ tải và xây dựng gói bundle cực nhanh).
*   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) (Hệ thống thiết kế tối giản, hiện đại và chuẩn Responsive).
*   **Hiệu ứng & Hoạt ảnh**: [Lenis Smooth Scroll](https://github.com/darkroomengineering/lenis) (Cuộn trang mượt mà) & [Motion](https://motion.dev/) (Micro-animations sinh động).
*   **Trực quan hóa dữ liệu**: [Recharts](https://recharts.org/) (Biểu đồ thống kê kết quả thi cho Admin & Leader).
*   **Icons**: [Lucide React](https://lucide.dev/).

### Server (Backend)
*   **Runtime**: Node.js (Phiên bản `>=22.0.0 <25.0.0`).
*   **Framework**: Express.js (Xây dựng API RESTful).
*   **Cơ sở dữ liệu**: MongoDB & Mongoose ODM.
*   **Xác thực & Bảo mật**:
    *   Xác thực kép **JWT** (`accessToken` lưu client, `refreshToken` trong `httpOnly cookie`).
    *   Cơ chế **`tokenVersion`** thu hồi phiên tức thì trên mọi thiết bị khi phát hiện đăng nhập mới hoặc đổi mật khẩu.
    *   `Helmet` bảo vệ các HTTP headers, `CORS` cấu hình an toàn cho phép giao tiếp Client-Server.
    *   `express-rate-limit` giới hạn tần suất các yêu cầu nhạy cảm: Đăng nhập theo IP và Thao tác thi theo **userId** (chống nghẽn phòng thi lớn dùng chung NAT/IP).
*   **Tiến trình tự động (Cron Schedulers)**:
    *   **Sao lưu đám mây**: Tự động backup CSDL lên Google Drive lúc 03:00 hàng ngày (giữ tối đa 5 bản lưu xoay vòng) và hỗ trợ khôi phục an toàn.
    *   **Dọn file tạm**: Tự động dọn dẹp file tạm quá 6 tiếng trong thư mục upload mỗi giờ.
    *   **Dọn tài khoản khóa lâu**: Tự động quét và xóa cứng các tài khoản bị khóa liên tục quá 6 tháng không có vết lịch sử thi/audit lúc 04:00 hàng ngày.
*   **Xử lý tệp tin & Đa phương tiện**: `exceljs` & `xlsx` (đọc/xuất báo cáo Excel chuyên nghiệp); `multer` + `Cloudinary` hỗ trợ tải ảnh minh họa câu hỏi và tài liệu ôn tập.

---

## 3. Quản lý và Lưu trữ dữ liệu

Hệ thống tổ chức dữ liệu một cách chặt chẽ và lưu trữ trên các nền tảng đám mây hiện đại:

| Loại dữ liệu | Nguồn gốc / Cơ chế hoạt động | Nơi lưu trữ chính |
| :--- | :--- | :--- |
| **Thông tin tài khoản, cấu trúc tổ chức** | Được import ban đầu qua file Excel chuẩn của nhà máy hoặc do Admin khởi tạo trực tiếp trên giao diện. | **MongoDB Atlas** (Cơ sở dữ liệu đám mây dạng NoSQL). |
| **Ngân hàng đề thi & Câu hỏi** | Do Người ra đề (`examiner`) biên soạn hoặc import hàng loạt qua Excel, phân loại theo độ khó, chủ đề và phạm vi. | **MongoDB Atlas** (Chứa nội dung văn bản, đáp án và liên kết ảnh). |
| **Hình ảnh minh họa câu hỏi** | Được tải lên từ máy tính của Người ra đề khi soạn thảo ngân hàng đề. | **Cloudinary** (Lưu trữ và tối ưu hóa hình ảnh đám mây). |
| **Tài liệu ôn tập (.pdf, .docx, .xlsx)** | Do Người ra đề / Admin tải lên nhằm hỗ trợ thí sinh ôn luyện lý thuyết theo từng phòng ban chuyên môn. | **Cloudinary** (Dạng raw resources, xem/tải trực tuyến qua Stream bảo mật). |
| **Kết quả và Lịch sử thi** | Do máy chủ tự động chấm điểm ngay sau khi thí sinh nộp bài hoặc khi ca thi tự động hết giờ. | **MongoDB Atlas** (Bảng kết quả `results` và chi tiết đáp án thí sinh chọn `candidate-answers`). |
| **Bản sao lưu CSDL (.gz)** | Được hệ thống dump và nén tự động định kỳ 3h sáng hoặc sao lưu thủ công từ giao diện Admin. | **Google Drive** (Lưu trữ an toàn trên Google Drive OAuth2 cá nhân, tự xoay vòng). |
| **Nhật ký hệ thống (Audit Logs)** | Tự động ghi lại các hành động nhạy cảm của người dùng (tạo/sửa/xóa user, reset mật khẩu, sao lưu, duyệt đề, gỡ tài liệu...). | **MongoDB Atlas** (Bảng `auditlogs` chuẩn hóa tại Controller, phục vụ kiểm toán an ninh). |

---

## 4. Mô hình Phân quyền người dùng

Hệ thống phân chia rõ ràng 4 nhóm vai trò nghiệp vụ khác nhau:

```text
               ┌─────────────── Đăng Nhập Hệ Thống ───────────────┐
               │                                                  │
       [ Thí sinh ]         [ Người ra đề ]        [ Người duyệt ]     [ Quản trị viên ]
       (candidate)            (examiner)              (leader)             (admin)
            │                      │                      │                   │
  - Học tập tài liệu     - Quản lý chủ đề       - Duyệt đề đề xuất   - Quản trị tài khoản
  - Làm bài kiểm tra     - Biên soạn câu hỏi    - Phát hành kỳ thi   - Xem Audit Log
  - Xem điểm cá nhân     - Quản lý phòng ban    - Xem báo cáo tổng   - Sao lưu & Phục hồi
                         - Đề xuất đề thi       - Cấp thêm lượt thi  - Thống kê toàn bộ
```

1.  **Thí sinh (Candidate)**: Học tập tài liệu ôn tập được phân phối riêng cho phòng ban mình, vào phòng thi thực hiện làm bài kiểm tra trắc nghiệm (có tự động lưu đáp án và giữ nhịp heartbeat), tra cứu kết quả thi cá nhân.
2.  **Người ra đề (Examiner)**: Quản lý phòng ban, chủ đề, biên soạn ngân hàng câu hỏi (đơn/nhiều đáp án, ảnh minh họa), upload tài liệu ôn tập và soạn thảo đề xuất kỳ thi đệ trình lên cấp trên duyệt.
3.  **Người duyệt đề (Leader)**: Phê duyệt/từ chối đề thi, phát hành kỳ thi chính thức (tự động sinh các mã đề thi ngẫu nhiên cho thí sinh), xem thống kê kết quả thi toàn diện theo kỳ thi / phòng ban, xuất file Excel kết quả, và cấp thêm lượt thi khi cần thiết.
4.  **Quản trị viên (Admin)**: Quản trị tài khoản (tạo mới, tạo nhanh phòng ban inline, import/export Excel tài khoản kèm mật khẩu tạm, phân quyền, khóa/mở khóa, reset mật khẩu), sao lưu & khôi phục toàn bộ CSDL qua Google Drive, cấu hình logo đơn vị, và theo dõi nhật ký hệ thống (Audit Logs).

---

## 5. Tính năng nổi bật

*   ⚡ **Hệ thống làm bài thi thông minh**: Tự động lưu đáp án ngay khi chọn (Autosave), đếm ngược thời gian, kiểm tra nhịp tim (Heartbeat 15s/lần) và tự động thu bài nếu thí sinh rời ca thi quá 1 phút.
*   🎲 **Xáo trộn mã đề ngẫu nhiên**: Khi duyệt phát hành, hệ thống tự động trộn ngẫu nhiên thứ tự câu hỏi và thứ tự các phương án trả lời để tạo ra các mã đề khác nhau cho thí sinh.
*   📊 **Báo cáo & Xuất dữ liệu chuyên nghiệp**: Thống kê tỉ lệ đạt/không đạt trực quan bằng biểu đồ Recharts, xuất báo cáo kết quả và danh sách tài khoản thí sinh ra định dạng Excel chuẩn.
*   🛡️ **Bảo mật & Kiểm toán toàn diện**: Phát hiện và chặn đăng nhập đồng thời qua `tokenVersion`, rate limit theo `userId` chống nghẽn phòng thi, ghi vết toàn bộ hoạt động nhạy cảm vào Audit Log với nhãn tiếng Việt chuẩn hóa.
*   💾 **Sao lưu đám mây tự động & Khôi phục an toàn**: Tự động backup CSDL lên Google Drive lúc 3h sáng mỗi ngày, hỗ trợ Admin tải bản sao lưu và khôi phục CSDL trực tiếp có thanh tiến trình % trực quan.
*   🧹 **Tự động dọn dẹp hệ thống**: Cron job định kỳ dọn file tạm rác trong thư mục upload và xóa cứng an toàn các tài khoản bị khóa liên tục quá 6 tháng không có vết lịch sử thi.

---

## 6. Hướng dẫn cài đặt & Khởi chạy cục bộ (Local Development)

### Yêu cầu môi trường
*   **Node.js**: Phiên bản `>= 22.0.0 < 25.0.0`
*   **MongoDB**: MongoDB Atlas hoặc MongoDB Community Server cục bộ
*   **Tài khoản Cloudinary & Google Cloud Console** (dành cho tính năng upload ảnh, tài liệu và sao lưu Drive)

### Các bước thực hiện

1.  **Clone mã nguồn dự án:**
    ```bash
    git clone https://github.com/duong218/Z176.git
    cd Z176
    ```

2.  **Cài đặt dependencies:**
    ```bash
    # Cài đặt cho Server
    cd server
    npm install

    # Cài đặt cho Client
    cd ../client
    npm install
    ```

3.  **Cấu hình biến môi trường:**
    *   Tạo file `server/.env` dựa trên file mẫu `server/.env.example` và điền đầy đủ các thông số kết nối DB, JWT Secret, Cloudinary, Google Drive credentials...
    *   Tạo file `client/.env` với nội dung trỏ API URL: `VITE_API_URL=http://localhost:5000/api`

4.  **Khởi tạo dữ liệu mẫu (Seed Data):**
    ```bash
    cd server
    npm run seed
    ```

5.  **Chạy ứng dụng ở môi trường phát triển (Dev):**
    ```bash
    # Chạy Server (tại thư mục server)
    npm run dev

    # Chạy Client (tại thư mục client ở một terminal khác)
    npm run dev
    ```

---
*Bản quyền sản phẩm thuộc về tác giả Phạm Ngọc Dương - Sinh viên K67 - Khoa Công nghệ thông tin - Học viện Nông nghiệp Việt Nam.*