# HỆ THỐNG THI TRẮC NGHIỆM CHUYÊN MÔN NỘI BỘ Z176
> **SẢN PHẨM KHÓA LUẬN TỐT NGHIỆP**
> * Sinh viên thực hiện: **Phạm Ngọc Dương**
> * Mã lớp / Khóa: **K67**
> * Trường: **Học viện Nông nghiệp Việt Nam**

---

## 1. Giới thiệu chung

Hệ thống thi trắc nghiệm chuyên môn nội bộ Z176 là giải pháp phần mềm được nghiên cứu và phát triển nhằm tự động hóa toàn diện quy trình tổ chức thi đánh giá năng lực, tay nghề chuyên môn và bồi dưỡng nghiệp vụ dành cho cán bộ, công nhân viên tại **Nhà máy Z176 - Bộ Quốc phòng**. 

Hệ thống quản lý khép kín từ khâu biên soạn ngân hàng câu hỏi (phân định rõ ràng mục đích **Thi chính thức** vs **Ôn tập**), chuyển đổi mục đích sử dụng thông minh, đề xuất & phê duyệt kỳ thi, tự động xáo trộn và sinh mã đề thi độc lập theo từng thí sinh (thuật toán Fisher–Yates), giám sát phòng thi thời gian thực (Autosave, Heartbeat 15s, tự nộp bài khi mất kết nối/vắng mặt), phân hệ **Luyện tập cá nhân** tự do (chế độ kiểm tra ngay từng câu hoặc làm bài có bấm giờ), cho đến khâu chấm điểm tự động và kết xuất báo cáo thống kê chuyên sâu.

---

## 2. Tổng quan công nghệ sử dụng

Hệ thống được phát triển theo mô hình Client-Server phân lớp rõ ràng, đảm bảo hiệu năng và tính bảo mật cao:

### Client (Frontend)
*   **Framework**: [React 19](https://react.dev/) & [Vite](https://vite.dev/) (Tối ưu tốc độ tải và xây dựng gói bundle cực nhanh).
*   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) (Hệ thống thiết kế hiện đại, responsive mobile-first, tuân thủ token `@theme`).
*   **Hiệu ứng & Hoạt ảnh**: [Lenis Smooth Scroll](https://github.com/darkroomengineering/lenis) (Cuộn trang mượt mà kết hợp hook `useScrollLock` quản lý singleton khi mở modal/drawer) & [Motion](https://motion.dev/) (Micro-animations sinh động).
*   **Trực quan hóa dữ liệu**: [Recharts](https://recharts.org/) (Biểu đồ thống kê kết quả thi, phân tích năng lực và tiến độ luyện tập).
*   **Icons**: [Lucide React](https://lucide.dev/).

### Server (Backend)
*   **Runtime**: Node.js (Phiên bản `>=22.0.0 <25.0.0`).
*   **Framework**: Express.js (Kiến trúc RESTful API chuẩn mực).
*   **Cơ sở dữ liệu**: MongoDB & Mongoose ODM.
*   **Xác thực & Bảo mật**:
    *   Xác thực kép **JWT** (`accessToken` ngắn hạn lưu client, `refreshToken` dài hạn trong `httpOnly cookie`).
    *   Cơ chế **`tokenVersion`** thu hồi phiên tức thì trên mọi thiết bị khi phát hiện đăng nhập mới hoặc đổi mật khẩu.
    *   `Helmet` bảo vệ các HTTP headers, `CORS` cấu hình an toàn cho phép giao tiếp Client-Server.
    *   `express-rate-limit` giới hạn tần suất các yêu cầu nhạy cảm: Đăng nhập theo IP và Thao tác phòng thi theo **userId** (chống nghẽn phòng thi lớn dùng chung NAT/IP).
*   **Tiến trình tự động (Cron Schedulers)**:
    *   **Sao lưu đám mây**: Tự động backup CSDL lên Google Drive lúc 03:00 hàng ngày (giữ tối đa 5 bản lưu xoay vòng) và hỗ trợ khôi phục an toàn.
    *   **Dọn file tạm**: Tự động dọn dẹp file tạm quá 6 tiếng trong thư mục upload mỗi giờ.
    *   **Dọn tài khoản khóa lâu**: Tự động quét và xóa cứng các tài khoản bị khóa liên tục quá 6 tháng không có vết lịch sử thi/audit lúc 04:00 hàng ngày.
*   **Xử lý tệp tin & Đa phương tiện**: `exceljs` & `xlsx` (đọc/xuất báo cáo Excel chuyên nghiệp); `multer` + `Cloudinary SDK` (tải và quản lý ảnh câu hỏi); Lưu trữ & stream tài liệu học tập an toàn trên máy chủ nội bộ.

---

## 3. Quản lý và Lưu trữ dữ liệu

Hệ thống tổ chức dữ liệu một cách chặt chẽ và lưu trữ trên các nền tảng đám mây hiện đại:

| Loại dữ liệu | Nguồn gốc / Cơ chế hoạt động | Nơi lưu trữ chính |
| :--- | :--- | :--- |
| **Thông tin tài khoản, cấu trúc tổ chức** | Được import ban đầu qua file Excel chuẩn của nhà máy hoặc do Admin khởi tạo trực tiếp trên giao diện. | **MongoDB Atlas** (Cơ sở dữ liệu NoSQL). |
| **Ngân hàng câu hỏi (Thi & Ôn tập)** | Do Người ra đề (`examiner`) biên soạn hoặc import qua Excel, phân tách mục đích `usage` (`exam` - bảo mật tuyệt đối cho thi chính thức; `practice` - mở cho thí sinh tự luyện tập). | **MongoDB Atlas** (Chứa nội dung văn bản, đáp án và liên kết ảnh). |
| **Hình ảnh minh họa câu hỏi** | Được tải lên từ máy tính của Người ra đề khi soạn thảo ngân hàng đề. | **Cloudinary** (Lưu trữ và tối ưu hóa hình ảnh đám mây). |
| **Tài liệu ôn tập (.pdf, .docx, .xlsx)** | Do Người ra đề / Admin tải lên nhằm hỗ trợ thí sinh ôn luyện lý thuyết theo từng phòng ban chuyên môn. | **Máy chủ nội bộ (Disk Storage)** (Phân quyền truy cập theo phòng ban, xem trực tuyến hoặc tải về qua API Stream an toàn). |
| **Kết quả và Lịch sử thi** | Do máy chủ tự động chấm điểm ngay sau khi thí sinh nộp bài hoặc khi ca thi tự động hết giờ. | **MongoDB Atlas** (Bảng kết quả `results`, chi tiết bài làm `candidate-answers` và phiên luyện tập `practice-sessions`). |
| **Bản sao lưu CSDL (.gz)** | Được hệ thống dump và nén tự động định kỳ 3h sáng hoặc sao lưu thủ công từ giao diện Admin. | **Google Drive** (Lưu trữ an toàn trên Google Drive OAuth2 cá nhân, tự xoay vòng). |
| **Nhật ký hệ thống (Audit Logs)** | Tự động ghi lại các hành động nghiệp vụ và an ninh (tạo/sửa/xóa user, reset mật khẩu, sao lưu, duyệt đề, chuyển đổi ngân hàng câu hỏi, chặn hành động vi phạm...). Hỗ trợ tìm kiếm theo tên, mã nhân viên và phòng ban. | **MongoDB Atlas** (Bảng `auditlogs` chuẩn hóa tại Controller, phục vụ kiểm toán an ninh). |

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
  - Luyện tập tự do      - Biên soạn câu hỏi    - Phát hành kỳ thi   - Xem Audit Log
  - Thi trực tuyến       - Phân loại ngân hàng  - Xem báo cáo tổng   - Sao lưu & Phục hồi
  - Xem lịch sử điểm     - Quản lý phòng ban    - Cấp thêm lượt thi  - Thống kê toàn bộ
                         - Đề xuất đề thi
```

1.  **Thí sinh (Candidate)**:
    *   Học tập tài liệu ôn tập được phân phối riêng cho phòng ban mình.
    *   Tự do **Luyện tập cá nhân** theo chủ đề tự chọn (chọn số câu, thời gian, độ khó, chế độ kiểm tra ngay từng câu hoặc làm bài thi thử).
    *   Vào phòng thi thực hiện làm bài kiểm tra trắc nghiệm chính thức (có tự động lưu đáp án và giữ nhịp heartbeat), tra cứu lịch sử kết quả thi cá nhân.
2.  **Người ra đề (Examiner)**:
    *   Quản lý phòng ban, chủ đề chuyên môn.
    *   Biên soạn ngân hàng câu hỏi (đơn/nhiều đáp án, ảnh minh họa), nhập câu hỏi hàng loạt từ Excel 2 bước.
    *   Phân tách và chuyển đổi câu hỏi giữa 2 ngân hàng **Thi chính thức** và **Ôn tập** (hệ thống tự động chặn chuyển sang Ôn tập nếu chủ đề đang có kỳ thi diễn ra nhằm chống lộ đề).
    *   Upload và phân quyền tài liệu ôn tập cho từng phòng ban.
    *   Soạn thảo đề xuất cấu trúc kỳ thi đệ trình lên cấp trên duyệt.
3.  **Người duyệt đề (Leader)**:
    *   Phê duyệt/từ chối đề xuất kỳ thi kèm lý do chi tiết.
    *   Phát hành kỳ thi chính thức (tự động kích hoạt thuật toán sinh mã đề độc lập cho từng thí sinh).
    *   Theo dõi và xem thống kê kết quả thi toàn diện theo kỳ thi / phòng ban, xuất file Excel kết quả chuẩn mẫu.
    *   Cấp thêm lượt thi chính thức cho thí sinh gặp sự cố bất khả kháng.
4.  **Quản trị viên (Admin)**:
    *   Quản trị tài khoản người dùng (tạo mới đơn lẻ, tạo nhanh phòng ban inline, import/export Excel tài khoản kèm mật khẩu tạm, phân quyền, khóa/mở khóa, reset mật khẩu).
    *   Sao lưu & khôi phục toàn bộ CSDL qua Google Drive với tiến trình trực quan và mã xác nhận an toàn.
    *   Cấu hình logo đơn vị hiển thị, theo dõi nhật ký kiểm toán hệ thống (Audit Logs) có bộ lọc tìm kiếm thông minh theo nhân viên / phòng ban.

---

## 5. Tính năng nổi bật

*   ⚡ **Phòng thi chính thức thông minh**: Tự động lưu đáp án ngay khi chọn (Autosave), đếm ngược thời gian, kiểm tra nhịp tim (Heartbeat 15s/lần) và tự động thu bài nếu thí sinh rời ca thi quá 1 phút.
*   🎯 **Phân hệ Luyện tập cá nhân chuyên sâu**: Thí sinh chủ động chọn chủ đề, số câu (5/10/20/30 câu), giới hạn thời gian và độ khó. Hỗ trợ 2 chế độ: **Kiểm tra ngay** (biết đúng/sai và lời giải ngay từng câu) hoặc **Mô phỏng thi** (làm bài hoàn chỉnh rồi mới chấm).
*   🔒 **Phân tách Ngân hàng Đề & Chống lộ đề thi**: Phân tách rạch ròi ngân hàng *Thi chính thức* (tuyệt đối bảo mật) và *Ôn tập* (cho phép xem đáp án). Khi chuyển câu hỏi sang ngân hàng Ôn tập, hệ thống tự động kiểm tra và chặn toàn bộ thao tác nếu chủ đề đang nằm trong kỳ thi đang phát hành (`published`).
*   🎲 **Xáo trộn mã đề ngẫu nhiên (Fisher–Yates)**: Khi phát hành kỳ thi, hệ thống tự động trộn ngẫu nhiên thứ tự câu hỏi và thứ tự các phương án trả lời độc lập cho từng thí sinh, đảm bảo không có mã đề nào trùng lặp.
*   📊 **Báo cáo & Xuất dữ liệu chuyên nghiệp**: Thống kê tỉ lệ đạt/không đạt trực quan bằng biểu đồ Recharts, xuất báo cáo kết quả và danh sách tài khoản thí sinh ra định dạng Excel chuẩn.
*   🛡️ **Bảo mật & Kiểm toán toàn diện**: Phát hiện và chặn đăng nhập đồng thời qua `tokenVersion`, rate limit theo `userId` chống nghẽn phòng thi, ghi vết toàn bộ hoạt động nhạy cảm vào Audit Log với nhãn tiếng Việt chuẩn hóa.
*   💾 **Sao lưu đám mây tự động & Khôi phục an toàn**: Tự động backup CSDL lên Google Drive lúc 3h sáng mỗi ngày, hỗ trợ Admin tải bản sao lưu và khôi phục CSDL trực tiếp có thanh tiến trình % trực quan.
*   🧹 **Tự động dọn dẹp hệ thống**: Cron job định kỳ dọn file tạm rác trong thư mục upload và xóa cứng an toàn các tài khoản bị khóa liên tục quá 6 tháng không có vết lịch sử thi.

---

## 6. Hướng dẫn cài đặt & Khởi chạy cục bộ (Local Development)

### Yêu cầu môi trường
*   **Node.js**: Phiên bản `>= 22.0.0 < 25.0.0`
*   **MongoDB**: MongoDB Atlas hoặc MongoDB Community Server cục bộ
*   **Tài khoản Cloudinary & Google Cloud Console** (dành cho tính năng upload ảnh câu hỏi và sao lưu Drive)

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