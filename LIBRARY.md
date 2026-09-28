# LIBRARY.md — Thư viện Skill/Repo cho AI Agent
**Người thực hiện:** Phạm Ngọc Dương — VNUA | **Dùng cho:** Hệ Thống Thi Trắc Nghiệm Chuyên Môn Nội Bộ Nhà Máy Z176
**Cách dùng:** Đặt file này ở root project. Paste vào AGENTS.md hoặc để nguyên tên `LIBRARY.md` — Antigravity/Codex/Claude/Cursor tự đọc khi cần chọn skill. Cần việc gì → tìm đúng nhóm bên dưới → lấy URL áp dụng luôn, không tự bịa pattern.

> ⚠️ Đề tài Z176 là dữ liệu quân đội nội bộ — chỉ dùng các skill này để tham khảo pattern/code mẫu, **không paste dữ liệu thật của đơn vị vào bất kỳ tool bên thứ 3 nào bên dưới**. Xem thêm AGENT_RULES.md / SKILLS.md.

---

## 1. Business Analysis (BA)

| Việc cần làm | Repo/Skill | Ghi chú |
|---|---|---|
| Chuyển câu trả lời khảo sát → đặc tả chuẩn | https://github.com/pssah4/digital-innovation-agents | Workflow V-Model đầy đủ: BA → Requirements Engineering → Architecture → Coding → Testing → Security Audit. Có 32 phương pháp khảo sát (stakeholder map, jobs-to-be-done...). Dùng ngay sau buổi khảo sát Z176. |
| Viết Use Case chuẩn IIBA | GitHub topic `business-analysis`, tag `usecasespec` | Chuẩn 13-field Karl Wiegers/IIBA — khớp thế mạnh Use Case/ERD/Class diagram của bạn. |
| Ma trận truy vết yêu cầu (traceability matrix) | GitHub topic `requirements-tracing`, `requirements-engineering` | Hữu ích cho báo cáo khóa luận — hội đồng thích thấy REQ → thiết kế → code → test. |

## 2. Design (UI/UX & hệ thống thiết kế)

| Việc cần làm | Repo/Skill | Ghi chú |
|---|---|---|
| Xây giao diện có gu, tránh mặc định AI | https://officialskills.sh/anthropics/skills/frontend-design | Đã dùng cho LucyClass redesign — giữ dùng tiếp cho module thi. |
| Skill thiết kế frontend của OpenAI | https://officialskills.sh/openai/skills/frontend-skill | Bản đối chiếu, có thể so sánh output với frontend-design của Anthropic. |
| Cải thiện prompt thiết kế | https://officialskills.sh/google-labs-code/skills/enhance-prompt | Dùng khi mô tả yêu cầu UI cho AI chưa đủ rõ. |
| Review thiết kế trước khi code | https://officialskills.sh/garrytan/skills/design-review, `.../design-consultation` | Review plan UI/UX trước khi implement — tránh sửa đi sửa lại. |
| Viết design doc (design-md) | https://officialskills.sh/google-labs-code/skills/design-md | Tài liệu hoá quyết định thiết kế, hữu ích khi báo cáo khóa luận. |
| Gu thẩm mỹ / taste | https://github.com/Leonxlnx/taste-skill | Tham khảo thêm hướng thẩm mỹ ngoài frontend-design. |
| UI/UX nâng cao | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | Tham khảo thêm pattern UX. |

## 3. Frontend (FE)

| Việc cần làm | Repo/Skill | Ghi chú |
|---|---|---|
| Best practice Next.js | https://officialskills.sh/vercel-labs/skills/next-best-practices | |
| Best practice React | https://officialskills.sh/vercel-labs/skills/react-best-practices | |
| Skeleton loading / trạng thái tải dữ liệu | https://github.com/dvtng/react-loading-skeleton (phổ biến nhất, 1.3M+ install/tuần) hoặc https://github.com/ShanukJ/auto-skeleton (tự sinh skeleton từ DOM, ít code hơn) | Màn hình thi online cần loading mượt khi tải câu hỏi/nộp bài — tránh trắng màn hình gây hoang mang thí sinh. |
| Web quality / performance audit (Core Web Vitals, a11y, SEO) | https://officialskills.sh/addyosmani/skills/web-quality-audit | Chạy trước demo/bảo vệ để đảm bảo UI không lỗi hiển thị, tải nhanh. |

## 4. Backend (BE)

| Việc cần làm | Repo/Skill | Ghi chú |
|---|---|---|
| Chuẩn code Node.js/Express | https://github.com/goldbergyoni/nodebestpractices | Bộ best-practice được cite nhiều nhất — error handling, security, performance, testing. Dùng review code AI sinh ra. |
| Boilerplate Express + Mongoose + JWT + role-based auth | https://github.com/hagopj13/node-express-boilerplate | Kiến trúc role-based khớp 3 role (Admin/Người ra đề/Thí sinh) của đề tài Z176. |
| Xây MCP server (nếu sau này cần AI agent tích hợp hệ thống) | https://officialskills.sh/anthropics/skills/mcp-builder | Chưa cần dùng ngay ở giai đoạn MVP. |

## 5. Database

| Việc cần làm | Repo/Skill | Ghi chú |
|---|---|---|
| Thiết kế schema MongoDB (embed vs reference, 11 pattern) | officialskills.sh/mongodb/skills/mongodb-schema-design | Áp dụng khi thiết kế bảng câu hỏi/đề thi — quyết định embed câu hỏi trong đề hay reference riêng. |
| Kết nối MongoDB | officialskills.sh/mongodb/skills/mongodb-connection | |
| Tối ưu query chậm | officialskills.sh/mongodb/skills/mongodb-query-optimizer | Dùng khi dashboard thống kê (tỷ lệ đạt, điểm trung bình...) bị chậm. |
| Sinh query từ ngôn ngữ tự nhiên | officialskills.sh/mongodb/skills/mongodb-natural-language-querying | Hỗ trợ debug nhanh khi kiểm tra dữ liệu test. |

## 6. Bảo mật (ưu tiên cao nhất — đơn vị quân đội)

| Việc cần làm | Repo/Skill | Ghi chú |
|---|---|---|
| Rà soát cấu hình mặc định không an toàn | https://officialskills.sh/trailofbits/skills/insecure-defaults | Chạy trước khi deploy bản demo. |
| Checklist bảo mật tổng quát | https://officialskills.sh/openai/skills/security-best-practices | Đối chiếu với SECURITY_BASELINE.md đã soạn. |
| Hỏi lại khi yêu cầu chưa rõ (tránh AI tự đoán sai phần nhạy cảm) | https://officialskills.sh/trailofbits/skills/ask-questions-if-underspecified | Đặc biệt hữu ích với các task liên quan phân quyền/đề thi — không để AI tự suy đoán. |
| Review code tìm lỗ hổng bảo mật (Python/JS/TS/Go) | officialskills.sh — mục "security vulnerability review" trong OpenAI skills | Dùng trước khi merge code liên quan đề thi/đáp án. |

## 7. Testing / Debug

| Việc cần làm | Repo/Skill | Ghi chú |
|---|---|---|
| Sinh test Jest (unit/integration) | officialskills.sh — Jest test generator (mục testing trong registry) | Viết test cho service tính điểm, phân quyền — phần nhạy cảm nhất. |
| E2E test luồng thi online | https://officialskills.sh/anthropics/skills/webapp-testing (Playwright) | Test kịch bản: mất mạng giữa chừng, đăng xuất giữa chừng — đúng 2 rủi ro đã liệt kê trong bảng rủi ro dự án. |
| Debug UI trực tiếp trong lúc code | officialskills.sh/openai/skills/playwright-interactive | Giữ session browser sống khi sửa code, đỡ reload liên tục. |

## 8. Tối ưu / Hiệu năng

| Việc cần làm | Repo/Skill | Ghi chú |
|---|---|---|
| Đo performance thực tế trên trình duyệt | officialskills.sh — "web performance measurement" (PerformanceAPI, mục testing/performance trong registry) | Đo thời gian tải trang thi — quan trọng nếu mạng khu sản xuất không ổn định (rủi ro #29 trong khảo sát). |
| Tối ưu MongoDB query | Xem mục 5 — mongodb-query-optimizer | |
| Deploy hạ tầng | https://officialskills.sh/openai/skills/netlify-deploy, `.../render-deploy` | Dùng cho bản demo nếu chưa deploy on-premise được. |

## 9. AI Tools / Workflow

| Việc cần làm | Repo/Skill | Ghi chú |
|---|---|---|
| Bộ công cụ mở rộng năng lực & quy trình agent (Superpowers) | https://github.com/obra/superpowers | Bộ kỹ năng & workflow mở rộng cho AI coding agent (Claude Code, Cursor, Codex...), hỗ trợ tự động hóa luồng làm việc, lập kế hoạch, kiểm thử và tương tác hệ thống. |
| Xây MCP server | https://officialskills.sh/anthropics/skills/mcp-builder | (trùng mục 4, giữ ở đây để dễ tra theo nhóm AI Tools) |
| Buộc AI hỏi lại khi thiếu thông tin | https://officialskills.sh/trailofbits/skills/ask-questions-if-underspecified | |

## 10. Docs / Báo cáo khóa luận

| Việc cần làm | Repo/Skill | Ghi chú |
|---|---|---|
| Tạo/chỉnh file Word báo cáo | https://officialskills.sh/anthropics/skills/docx | Dùng cho báo cáo khóa luận chính thức. |
| Đồng biên soạn tài liệu dài | https://officialskills.sh/anthropics/skills/doc-coauthoring | Hữu ích khi viết chương phân tích thiết kế. |
| Tạo Word/PDF (bản thay thế) | https://officialskills.sh/minimax-ai/skills/minimax-docx, `.../minimax-pdf` | Đối chiếu output nếu bản Anthropic không hợp định dạng. |

## 11. Workflows (Google Workspace)

| Việc cần làm | Repo/Skill | Ghi chú |
|---|---|---|
| Thao tác Google Docs | https://officialskills.sh/googleworkspace/skills/gws-docs | Nếu GVHD/Z176 yêu cầu làm việc qua Google Docs. |
| Thao tác Google Drive | https://officialskills.sh/googleworkspace/skills/gws-drive | |

---

## Cách AI đọc file này

1. Xác định task thuộc nhóm nào (1 task có thể thuộc nhiều nhóm — ví dụ "màn hình thi online có skeleton loading" = nhóm 3 + nhóm 7).
2. Lấy URL tương ứng: `npx skills add <url>` (nếu là officialskills.sh) hoặc đọc trực tiếp SKILL.md/README nếu là repo GitHub thường.
3. Không có skill nào khớp → báo lại cho Dương thay vì tự bịa cách làm.
4. Luôn đối chiếu với danh sách "Do-Not-Touch" trong SKILLS.md trước khi áp dụng bất kỳ skill nào liên quan đến dữ liệu đề thi/đáp án/tài khoản.
5. Với các skill thuộc nhóm 6 (Bảo mật) — ưu tiên đọc kỹ trước khi apply tự động, không chạy hàng loạt không giám sát trên dữ liệu thật.

---
*File hợp nhất từ AGENTS.md gốc + bổ sung theo nhóm. Chỉ thêm repo đã kiểm chứng qua tìm kiếm, không tự bịa nguồn.*
