# Z176 — Module thi chuyên môn (Hệ thống thực tế)

Thư mục này chứa tài liệu đặc tả kỹ thuật và mô hình dữ liệu chính thức của hệ thống thi trắc nghiệm chuyên môn nội bộ Z176.

## Cấu trúc thư mục dự án

- **[client/](file:///c:/Users/duong/Desktop/HethongZ176/client)** — Ứng dụng client React 19 + Vite + Tailwind CSS v4. Chi tiết: [client.md](file:///c:/Users/duong/Desktop/HethongZ176/structure/client.md).
- **[server/](file:///c:/Users/duong/Desktop/HethongZ176/server)** — Ứng dụng server-side Express API + MongoDB/Mongoose. Chi tiết: [server.md](file:///c:/Users/duong/Desktop/HethongZ176/structure/server.md).
- **[docs/](file:///c:/Users/duong/Desktop/HethongZ176/docs)** — Tài liệu phân tích và thiết kế hệ thống.
  - [MONGOOSE_SCHEMA.md](file:///c:/Users/duong/Desktop/HethongZ176/docs/MONGOOSE_SCHEMA.md) — Mô hình cơ sở dữ liệu MongoDB/Mongoose.
  - [AUTH_API.md](file:///c:/Users/duong/Desktop/HethongZ176/docs/AUTH_API.md) — Mô tả cơ chế xác thực JWT, phân quyền và Rate Limiting.
  - [sinh-de-tu-dong.md](file:///c:/Users/duong/Desktop/HethongZ176/docs/sinh-de-tu-dong.md) — Thuật toán sinh đề và tạo mã đề thi.
  - [luong-lam-bai-thi.md](file:///c:/Users/duong/Desktop/HethongZ176/docs/luong-lam-bai-thi.md) — Thiết kế luồng làm bài thi realtime và cơ chế giám sát.
  - [THNGOAILE.md](file:///c:/Users/duong/Desktop/HethongZ176/docs/THNGOAILE.md) — Tổng hợp 23 tình huống ngoại lệ đã khắc phục & các hạn chế kỹ thuật của hệ thống.
- **[mock-data/](file:///c:/Users/duong/Desktop/HethongZ176/mock-data)** — Thư mục chứa dữ liệu mẫu chuẩn hóa để hỗ trợ phát triển (seed database) và cung cấp cấu trúc cho các AI Agent trợ lý.

## Chạy nhanh (Môi trường Dev)

### Terminal 1 — Backend (Server)
```bash
cd server
npm install
# Tạo và cấu hình tệp .env (tham khảo .env.example)
# Chạy dự án ở chế độ phát triển (watch mode)
npm run dev
```

### Terminal 2 — Frontend (Client)
```bash
cd client
npm install
# Chạy ứng dụng Vite dev server (cổng 3000)
npm run dev
```

## Quy ước phát triển
- Luôn tôn trọng bảo mật dữ liệu của nhà máy Z176. Không sử dụng thông tin nhân sự/đề thi thật trong tệp mock dữ liệu.
- Cấu hình CORS của server cần chấp nhận nguồn từ client (mặc định là `http://localhost:3000` hoặc theo cấu hình `.env`).
