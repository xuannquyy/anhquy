# AI Skill và phạm vi kỹ thuật của dự án ANHQUY (Ethical Sourcing Auditor)

## 0. Mục đích và mức ưu tiên

Đây là tài liệu chỉ dẫn cho AI khi phân tích, thiết kế, viết code, sửa lỗi hoặc đề xuất thay đổi cho dự án **ANHQUY (Hệ thống AI Agent hỗ trợ rà soát hợp đồng và đánh giá đạo đức chuỗi cung ứng)**. AI phải tuân thủ tài liệu này cùng với yêu cầu cụ thể của người dùng.

Thứ tự ưu tiên khi có mâu thuẫn:

1. Yêu cầu mới nhất và rõ ràng của người dùng.
2. Quy định pháp lý (áp dụng tiêu chuẩn khắt khe hơn giữa RBA và Luật Việt Nam), bảo mật (RBAC, Data Masking) và toàn vẹn dữ liệu (3NF, Soft Delete).
3. Các quy tắc bắt buộc (`MUST` và `MUST NOT`) trong tài liệu này.
4. Convention, kiến trúc 3-Tier và schema hiện có trong `anhquyDB.sql` / `prisma/schema.prisma`.
5. Các quy tắc khuyến nghị (`SHOULD` và `SHOULD NOT`).

Nếu yêu cầu mới có thể làm vi phạm mục 2 hoặc 3, AI phải dừng triển khai phần đó, nêu rủi ro và hỏi xác nhận.

## 1. Nguyên tắc làm việc của AI

- `MUST` đọc `prisma/schema.prisma`, `anhquyDB.sql` và các file code liên quan trước khi thay đổi.
- `MUST` xác định rõ module, luồng xử lý (`Routes -> Middlewares -> Controllers -> Services`), dữ liệu đầu vào/đầu ra và ảnh hưởng của thay đổi.
- `MUST` thay đổi nhỏ, đúng phạm vi; không tự ý refactor hoặc đổi kiến trúc toàn hệ thống.
- `MUST` giữ tương thích tuyệt đối với 15 bảng SQL Server, tên cột và khóa chính phức hợp hiện có.
- `MUST` kiểm tra lỗi biên dịch TypeScript (`tsc`) và tính hợp lệ của Prisma Client sau mỗi thay đổi.
- `MUST` báo rõ giả định, file đã sửa, lệnh kiểm tra đã chạy và vấn đề còn tồn tại.
- `MUST NOT` tự bịa API, bảng dữ liệu, tên cột, quyền nghiệp vụ, mã màu ngoài hệ màu quy định, secret hoặc quy định pháp lý.
- `MUST NOT` đánh dấu một việc là hoàn thành khi chưa kiểm chứng.

## 2. Phạm vi công nghệ được phép

### 2.1 Công nghệ chuẩn

- **Runtime:** Node.js **v22 LTS** (Không dùng Node v23/v24+ để tránh lỗi tương thích Prisma v5).
- **Backend (`anhquy-backend`):** Node.js + Express.js + TypeScript (`CommonJS`, `ES2022`), Prisma ORM v5 (`prisma@5`, `@prisma/client@5`), `tsx` (chạy seed), `jsonwebtoken` (JWT), `bcrypt` (`saltRounds = 10`), `multer` (lưu file tại `/uploads`), `crypto` (SHA-256 `file_hash`), `pdf-parse` / `unstructured-client`.
- **Database:**
  - Relational DB: **SQL Server** (`anhquyDB` - 15 bảng chuẩn 3NF).
  - Vector DB: **ChromaDB** (lưu trữ Embeddings văn bản hợp đồng phục vụ RAG).
- **AI Engine:** **Gemini 1.5 Flash** qua SDK chính thức `@google/genai` (ép trả về JSON thuần túy).
- **Frontend (`anhquy-frontend`):** React.js + Vite + TypeScript, **Tailwind CSS v3**, Google Font **`Be Vietnam Pro`**, `@react-pdf-viewer/core@3.12.0` + `@react-pdf-viewer/highlight@3.12.0` + `pdfjs-dist@3.4.120` (cài với `--legacy-peer-deps`), `axios`, `react-router-dom`, `react-hook-form` + `yup`/`zod`, `react-select`, `react-diff-viewer`, `react-hot-toast` / `sonner`, SignalR/WebSocket.

### 2.2 Cấu trúc thư mục bắt buộc

- **Backend (`anhquy-backend/`):**
  - `prisma/`: `schema.prisma`, `seed.ts`.
  - `src/config/`: cấu hình Prisma, Gemini AI, Multer, biến môi trường.
  - `src/routes/`: chỉ khai báo endpoint URL và gắn middlewares.
  - `src/middlewares/`: `requireAuth`, `requirePermission(code)`, `uploadFile`.
  - `src/controllers/`: nhận request, validate input, gọi service, ghi `Audit_Logs`, trả response JSON (Không viết logic truy vấn DB/AI tại đây).
  - `src/services/`: chứa 100% logic nghiệp vụ, Prisma queries, AI RAG, tính điểm rủi ro.
  - `src/vector-db/`: xử lý ChromaDB (Smart Chunking, Embedding, Vector Search).
  - `uploads/`: lưu file PDF vật lý (bắt buộc có trong `.gitignore`).
- **Frontend (`anhquy-frontend/src/`):**
  - `api/`: nơi duy nhất cấu hình `axiosClient.ts` (Interceptors) và các hàm gọi API.
  - `components/`: Dumb UI components dùng chung (`Button`, `Card`, `Modal`, `SplitPDFViewer`).
  - `context/`: `AuthContext.tsx` quản lý Token, User, Role, Permissions.
  - `pages/`: Smart components tương ứng với 13 màn hình Sitemap.
  - `utils/`: các hàm tiện ích định dạng và kiểm tra dữ liệu.

### 2.3 Giới hạn thay đổi công nghệ

- `MUST` kiểm tra `package.json`, `tsconfig.json` và `schema.prisma` trước khi thêm thư viện.
- `MUST NOT` tự ý đổi ORM, hệ quản trị CSDL, SDK AI hoặc cấu trúc 3 lớp.
- Khi chưa có quyết định công nghệ cho tính năng mới, AI chỉ đưa tối đa 2 phương án ngắn gọn và chờ người dùng xác nhận.

## 3. Quy tắc system design & nghiệp vụ lõi

### 3.1 Phân rã Module & Vai trò (RBAC)

- **4 Module hệ thống:**
  1. **Module 1 (IAM & System Admin):** Auth, quản lý Users, ma trận `Roles` - `Permissions`, `System_Configs`.
  2. **Module 2 (Supplier & Master Data):** Quản lý `Categories`, `Suppliers`, kho file `Documents`.
  3. **Module 3 (AI Engine & RAG):** Điều phối quét ngầm, Smart Chunking vào ChromaDB, suy luận bằng Gemini 1.5 Flash.
  4. **Module 4 (Audit Workflow & Reporting):** Quản lý `Standard_Groups` & `Standards`, thẩm định Split-view (XAI), `Audit_Logs`, Dashboard & Xuất báo cáo.
- **3 Vai trò cố định (`Roles.role_name`):**
  - `Admin` (Quản trị viên): Quản lý người dùng, phân quyền, cấu hình hệ thống, tiêu chuẩn gốc. Không trực tiếp duyệt lỗi hợp đồng.
  - `Manager` (Quản lý): Phê duyệt (`Approved`) hoặc bác bỏ (`Rejected`) lỗi vi phạm trong `Violations`, quyết định điểm rủi ro của `Suppliers`.
  - `User` (Nhân viên): Upload hợp đồng, tùy chỉnh tiêu chuẩn cá nhân/loại trừ, chạy AI rà soát, xuất báo cáo sơ bộ.

### 3.2 Quy tắc AI RAG & Lọc tiêu chuẩn động

- `MUST` giữ nguyên vẹn 24 tiêu chuẩn gốc (`created_by IS NULL`, `is_active = 1`) trong bảng `Standards`.
- **Công thức lấy bộ tiêu chuẩn khi quét AI:**
  `Active Standards = (Tiêu chuẩn gốc [created_by IS NULL] + Tiêu chuẩn riêng của User [created_by = user.id]) - Các tiêu chuẩn bị User loại trừ trong bảng User_Excluded_Standards` (chỉ lấy `is_active = true` và thuộc `Category_Standards` của loại hợp đồng).
- **Data Masking:** `MUST` dùng Regex ẩn danh CCCD/CMND, Mã số thuế, Số tài khoản thành `[REDACTED]` trước khi gửi văn bản sang ChromaDB hoặc Gemini API.
- **Nguyên tắc pháp lý:** Nếu có mâu thuẫn giữa chuẩn RBA (`Global`) và Pháp luật Việt Nam (`VN`), AI bắt buộc áp dụng tiêu chuẩn khắt khe hơn, bảo vệ người lao động và môi trường tốt hơn.
- **Định dạng Output AI:** Ép Gemini trả về JSON thuần túy theo cấu trúc `{"findings": [{"standard_id": number, "risk_level": "High"|"Medium"|"Low", "violation_desc": string, "evidence_quote": string, "page_number": number|null, "recommendation": string}]}`. Câu `evidence_quote` phải trích dẫn chính xác nguyên văn trong hợp đồng để Frontend highlight trên PDF.

### 3.3 Quy tắc tính điểm rủi ro (Risk Scoring)

- `MUST NOT` tự động trừ điểm `Suppliers.risk_score` khi AI mới tạo cảnh báo (`status = 'Pending'`).
- Điểm rủi ro chỉ được tính lại khi `Manager` cập nhật trạng thái lỗi sang `Approved` hoặc `Rejected`:
  - Khởi tạo `Score = 100`.
  - Lấy toàn bộ `Violations` có `status = 'Approved'` thuộc tất cả `Documents` của `supplier_id` đó.
  - Mức trừ mặc định: `High` (-10đ), `Medium` (-5đ), `Low` (-2đ) (đọc từ `System_Configs`). Nếu `Score < 0` thì gán bằng `0`.
  - Cập nhật `Suppliers.risk_score`, `Violations.reviewed_by` và `Violations.reviewed_at` trong cùng một Transaction.

## 4. Quy tắc database (SQL Server & Prisma ORM)

### 4.1 Quy trình Database-First

- `MUST` tuân thủ luồng Database-First: Cập nhật `anhquyDB.sql` -> Chạy trên SQL Server -> `npx prisma db pull` -> `npx prisma generate` -> `npx prisma db seed`.
- `MUST` sử dụng Prisma Client (hoặc `prisma.$transaction`) cho mọi thao tác dữ liệu; tuyệt đối không nối chuỗi SQL thủ công.
- `MUST NOT` dùng Stored Procedure trừ khi có yêu cầu mới từ người dùng.

### 4.2 Khế ước 15 bảng dữ liệu (`anhquyDB.sql`) — Không được tự suy diễn tên cột

1. `Roles`: `id`, `role_name` (UNIQUE), `description`.
2. `Permissions`: `id`, `permission_code` (UNIQUE), `permission_name`.
3. `Role_Permissions`: Khóa chính phức hợp `(role_id, permission_id)` — **Không có cột `id`**.
4. `Users`: `id`, `email` (UNIQUE), `password_hash`, `full_name`, `role_id`, `is_active`, `failed_login_attempts`, `locked_until`, `refresh_token`, `refresh_token_expiry`, `created_at`, `updated_at`.
5. `Categories`: `id`, `category_type` (`'Industry'` | `'Contract_Type'`), `name`, `description`, `is_active`, `created_at`, `updated_at`.
6. `Suppliers`: `id`, `company_name`, `tax_code` (UNIQUE), `industry_id` (FK -> `Categories.id`), `contact_email`, `contact_phone`, `address`, `risk_score`, `is_deleted`, `created_at`, `updated_at`.
7. `Standard_Groups`: `id`, `group_code` (UNIQUE: `'GRP-LABOR'`, `'GRP-OHS'`, `'GRP-ENV'`, `'GRP-ETHICS'`), `group_name`, `description` — **Không có cột `color_code`**.
8. `Standards`: `id`, `group_id` (FK -> `Standard_Groups.id`), `standard_code` (UNIQUE), `name`, `jurisdiction` (`'Global'` | `'VN'`), `priority_level` (`1` | `2`), `content_i18n` (chuỗi JSON `{"vi": "...", "en": "..."}`), `description`, `created_by` (`NULL` hoặc `Users.id`), `is_active`, `created_at`, `updated_at`.
9. `Category_Standards`: Khóa chính phức hợp `(category_id, standard_id)` — **Không có cột `id`**.
10. `User_Excluded_Standards`: Khóa chính phức hợp `(user_id, standard_id)` — **Không có cột `id`**.
11. `Documents`: `id`, `supplier_id`, `category_id`, `file_name`, `file_size`, `file_type`, `file_hash`, `storage_url`, `status` (`'Uploaded'` | `'Analyzing'` | `'Analyzed'` | `'Error'`), `uploaded_at`, `last_analyzed_at`, `updated_at`.
12. `Violations`: `id`, `document_id`, `standard_id`, `risk_level` (`'High'` | `'Medium'` | `'Low'`), `violation_desc`, `evidence_quote`, `page_number`, `recommendation`, `status` (`'Pending'` | `'Approved'` | `'Rejected'`), `reviewed_by`, `reviewed_at`, `created_at`, `updated_at` — **Không có cột `supplier_id`** (phải join qua `Documents`).
13. `Audit_Logs`: `id`, `user_id`, `action_type`, `target_table`, `target_id`, `old_value`, `new_value`, `created_at`.
14. `System_Configs`: `id`, `config_key` (UNIQUE), `config_value`, `description`, `created_at`, `updated_at`.
15. `Risk_Thresholds`: `id`, `level_name` (`'Safe'` | `'Warning'` | `'Danger'`), `min_score`, `max_score`, `color_code`, `created_at`, `updated_at`.

### 4.3 Quy tắc toàn vẹn & Xóa mềm (Soft Delete)

- `MUST NOT` xóa cứng (`.delete()`) bản ghi ở các bảng `Users` (dùng `is_active = false`), `Suppliers` (dùng `is_deleted = true`), `Standards` (`is_active = false`), `Categories` (`is_active = false`).
- `MUST` kiểm tra trùng mã băm `file_hash` (SHA-256) trong bảng `Documents` trước khi cho phép lưu hợp đồng mới.

## 5. Quy tắc security & audit log

- **Xác thực & Chống Brute-force:**
  - Hash mật khẩu bằng `bcrypt` (`saltRounds = 10`).
  - Đăng nhập sai tăng `failed_login_attempts += 1`. Chạm ngưỡng 5 lần (`MAX_LOGIN_ATTEMPTS`) thì khóa tài khoản `locked_until = Now + 15 phút` (`ACCOUNT_LOCK_MINUTES`). Đăng nhập đúng phải reset về `0` và `null`.
- **Phân quyền Server-side:**
  - Mọi route nghiệp vụ phải qua middleware `requireAuth` và `requirePermission(permission_code)` đối chiếu trực tiếp bảng `Role_Permissions`. Không tin tưởng `user_id` hoặc `role` từ client gửi lên.
- **Audit Trail bắt buộc:**
  - Mọi thao tác nhạy cảm (Duyệt/Bác bỏ lỗi, Thêm/Sửa/Ẩn tiêu chuẩn, Sửa nhà cung cấp, Đổi phân quyền, Sửa cấu hình hệ thống) `MUST` ghi vào `Audit_Logs` kèm `old_value` và `new_value` dạng chuỗi JSON (loại bỏ `password_hash`, `refresh_token`).

## 6. Quy tắc Frontend & UI/UX

- **Hệ màu Winter (60-30-10) trong `tailwind.config.js`:**
  - 60% Nền: `Snowflake` (`#DCE0E8` - nền chính), `Frostysilver` (`#BEB3AC` - nền phụ/highlight PDF `bg-Frostysilver/40`).
  - 30% Cấu trúc & Chữ: `Pine` (`#27363F` - tiêu đề, Primary Button), `Branch` (`#685652` - văn bản hợp đồng), `Mist` (`#8EA1AE` - viền `border-Mist`, chú thích).
  - 10% Cảnh báo AI: `Berry` (`#6B212C` - nút/nhãn nguy hiểm, viền nhấp nháy lỗi PDF).
- **Quy tắc Component & Kỹ thuật:**
  - `MUST` dùng font `Be Vietnam Pro`, bo góc `rounded-md` (6px) hoặc `rounded-lg` (8px), hiệu ứng `transition-all duration-300 ease-in-out`. Không dùng `rounded-full`.
  - `MUST NOT` dùng `window.alert()` hoặc `window.confirm()`; bắt buộc dùng `react-hot-toast` / `sonner` và Custom Modal.
  - `MUST` đăng ký Web Worker cho `pdfjs-dist` tại `main.tsx` để chống treo trình duyệt khi mở PDF nhiều trang.
  - `MUST` ẩn khung PDF trên màn hình Mobile (`hidden md:block`) tại trang Phòng Kiểm toán AI (Split-view).
  - `MUST` dùng `react-hook-form` + `yup`/`zod` cho form, `react-select` cho dropdown lớn, `react-diff-viewer` cho trang xem `Audit_Logs`, và thiết kế 2 Tab `[Đang hoạt động]` / `[Đã lưu trữ]` cho các danh sách có Soft Delete.

## 7. Quy trình xử lý yêu cầu

1. Xác định yêu cầu thuộc Module nào, liên quan đến bảng nào trong 15 bảng và quyền (`permission_code`) nào.
2. Đọc `schema.prisma` và các file trong `routes/`, `controllers/`, `services/` hoặc `src/pages/` liên quan.
3. Chọn giải pháp nhỏ nhất đúng kiến trúc 3 lớp (Backend) hoặc Smart/Dumb Component (Frontend).
4. Thực hiện thay đổi theo từng bước; không trộn refactor không liên quan.
5. Cập nhật `seed.ts` hoặc cấu hình liên quan nếu có thay đổi Master Data.
6. Chạy kiểm tra biên dịch TypeScript và kiểm tra luồng lỗi (400, 401, 403, 404, 500).
7. Báo cáo rõ các file đã tạo/sửa, kiểm tra đã chạy và việc cần người dùng xác nhận.

## 8. Khi phải hỏi lại hoặc dừng

AI phải hỏi người dùng trước khi tiếp tục nếu:

- Yêu cầu đòi xóa cứng (Hard Delete) dữ liệu hoặc sửa cấu trúc 15 bảng trong `anhquyDB.sql`.
- Yêu cầu thay đổi công thức lọc tiêu chuẩn động, nguyên tắc pháp lý RBA/VN hoặc công thức trừ điểm rủi ro.
- Công nghệ, thư viện ngoài danh mục chuẩn chưa được quy định.
- Cần thông tin môi trường thật (`GEMINI_API_KEY`, cấu hình server production).

## 9. Tiêu chí hoàn thành

- Code đúng phạm vi, tuân thủ kiến trúc 3 lớp (Backend) và quy chuẩn UI/UX Winter (Frontend).
- Khớp 100% với tên bảng, tên cột và khóa chính phức hợp trong `prisma/schema.prisma`.
- Đã kiểm tra đầy đủ phân quyền `requirePermission`, Soft Delete, Data Masking và ghi `Audit_Logs`.
- Không để lại secret hard-code, `window.alert()`, debug code thừa hoặc lỗi biên dịch TypeScript.
