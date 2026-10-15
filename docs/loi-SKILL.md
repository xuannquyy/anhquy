# AI Skill và Phạm vi Kỹ thuật của Dự án ANHQUY (Ethical Sourcing Auditor)

## 0. Mục đích và Mức ưu tiên

Đây là tài liệu chỉ dẫn bắt buộc (System Prompt / Engineering Guideline) dành cho AI khi phân tích, thiết kế, viết code, sửa lỗi hoặc đề xuất thay đổi cho hệ thống **ANHQUY - AI Agent hỗ trợ rà soát hợp đồng và đánh giá đạo đức chuỗi cung ứng (Ethical Sourcing Auditor)**. AI phải tuân thủ nghiêm ngặt tài liệu này cùng với yêu cầu cụ thể của người dùng.

Thứ tự ưu tiên khi có mâu thuẫn:

1. Yêu cầu mới nhất và rõ ràng của người dùng.
2. Quy định pháp lý (Nguyên tắc áp dụng chuẩn khắt khe hơn giữa RBA & Luật Việt Nam), bảo mật (Data Masking, RBAC) và toàn vẹn dữ liệu (3NF, Soft Delete) của hệ thống.
3. Các quy tắc bắt buộc (`MUST` và `MUST NOT`) trong tài liệu này.
4. Convention, cấu trúc 3-Tier Backend, cấu trúc Component Frontend và schema hiện có trong `anhquyDB.sql` / `schema.prisma`.
5. Các quy tắc khuyến nghị (`SHOULD` và `SHOULD NOT`).

Nếu yêu cầu mới có thể làm vi phạm mục 2 hoặc 3, AI phải dừng triển khai phần đó, nêu rõ rủi ro kỹ thuật/nghiệp vụ và hỏi xác nhận từ người dùng.

---

## 1. Nguyên tắc Làm việc của AI

- `MUST` đọc kỹ `prisma/schema.prisma`, `anhquyDB.sql` và các file liên quan trong `src/` trước khi viết hoặc sửa code.
- `MUST` xác định rõ chức năng thuộc Module nào (Module 1 đến 4), Trang nào (Page 1 đến 13), luồng dữ liệu đầu vào/đầu ra và ảnh hưởng đến các bảng liên kết.
- `MUST` thay đổi nhỏ, đúng phạm vi; không tự ý refactor cấu trúc thư mục hoặc đổi tên cột/bảng trong Database.
- `MUST` giữ tương thích tuyệt đối với 15 bảng trong SQL Server, các khóa chính phức hợp (Composite Keys) và quy trình Database-First hiện có.
- `MUST` kiểm tra lỗi biên dịch TypeScript (`tsc`), tính hợp lệ của Prisma Client và báo cáo rõ các file đã tạo/sửa.
- `MUST NOT` tự bịa thêm bảng dữ liệu, cột dữ liệu, quyền nghiệp vụ, mã màu ngoài bảng màu quy định hoặc quy định pháp lý không có căn cứ.
- `MUST NOT` viết logic nghiệp vụ, gọi Database hoặc gọi AI trực tiếp trong `controllers/` (Backend) hoặc gọi `fetch`/`axios` trực tiếp trong `pages/` và `components/` (Frontend).
- `MUST NOT` đánh dấu một việc là hoàn thành khi chưa kiểm chứng luồng chạy và xử lý lỗi.

---

## 2. Phạm vi Công nghệ và Cấu trúc Dự án (Tech Stack & Folder Structure)

### 2.1 Công nghệ chuẩn bắt buộc

- **Runtime & Environment:** Node.js **v22 LTS** (Tuyệt đối không dùng Node v23/v24+ gây lỗi tương thích với Prisma 5).
- **Backend (`anhquy-backend`):**
  - Framework: Node.js + Express.js viết bằng **TypeScript** (`CommonJS`, `ES2022`).
  - ORM: **Prisma v5** (`prisma@5`, `@prisma/client@5`), trình chạy seed `tsx`.
  - Xác thực & Bảo mật: `jsonwebtoken` (JWT), `bcrypt` (`saltRounds = 10`).
  - Xử lý File & PDF: `multer` (lưu vật lý tại `/uploads`), `crypto` (băm SHA-256 kiểm tra trùng file), `pdf-parse` hoặc `unstructured-client` (trích xuất văn bản giữ cấu trúc).
  - AI & RAG Engine: **Gemini 1.5 Flash** thông qua SDK chính thức `@google/genai` (ép trả về JSON thuần túy), kết hợp **ChromaDB** (lưu trữ Vector Embeddings cho văn bản hợp đồng).
- **Database:**
  - Metadata & Relational DB: **SQL Server** (`anhquyDB`) chuẩn hóa 3NF gồm 15 bảng vật lý và 13 Nonclustered Indexes.
  - Vector DB: **ChromaDB** (phục vụ Smart Chunking & Semantic Retrieval).
- **Frontend (`anhquy-frontend`):**
  - Core: React.js + Vite + TypeScript.
  - Styling: **Tailwind CSS v3** + Google Font **`Be Vietnam Pro`**.
  - PDF Engine: `@react-pdf-viewer/core@3.12.0`, `@react-pdf-viewer/highlight@3.12.0`, `pdfjs-dist@3.4.120` (cài đặt với `--legacy-peer-deps`, bắt buộc đăng ký Web Worker ở `main.tsx`).
  - Thư viện chuẩn UI/UX: `axios` (kèm Interceptors), `react-router-dom` (`ProtectedRoute`), `react-hook-form` + `yup`/`zod`, `react-select` (Lazy loading/Searchable), `react-diff-viewer` (hiển thị JSON diff cho `Audit_Logs`), `react-hot-toast` hoặc `sonner` (thay thế hoàn toàn `window.alert()`).

### 2.2 Cấu trúc thư mục chuẩn (Full-stack)

```text
📁 ANHQUY
├── 📁 anhquy-backend/                # ⚙️ MÁY CHỦ API (Node.js + Express + TypeScript)
│   ├── 📁 prisma/
│   │   ├── 📄 schema.prisma          # Khai báo 15 bảng đồng bộ từ SQL Server (prisma db pull)
│   │   └── 📄 seed.ts                # Nạp Master Data (Roles, Permissions, Users, 4 Groups, 24 Standards VI-EN...)
│   ├── 📁 src/
│   │   ├── 📁 config/                # Cấu hình Prisma Client, Gemini AI, Multer, biến môi trường
│   │   ├── 📁 controllers/           # Nhận Request, Validate input, gọi Services, ghi Audit Log, trả JSON
│   │   ├── 📁 middlewares/           # requireAuth, requirePermission(code), uploadFile, errorHandler
│   │   ├── 📁 routes/                # Định tuyến API (auth.route.ts, audit.route.ts, supplier.route.ts...)
│   │   ├── 📁 services/              # TRÁI TIM BACKEND: AI RAG, tính điểm rủi ro, truy vấn Prisma
│   │   ├── 📁 vector-db/             # Xử lý ChromaDB (Smart Chunking, Embedding, Vector Search)
│   │   └── 📄 server.ts              # Khởi động Express Server & WebSocket/SignalR
│   ├── 📁 uploads/                   # Lưu trữ vật lý file PDF tải lên (Bắt buộc đưa vào .gitignore)
│   ├── 📄 .env                       # DATABASE_URL, GEMINI_API_KEY, JWT_SECRET
│   ├── 📄 package.json
│   └── 📄 tsconfig.json
│
└── 📁 anhquy-frontend/               # 🎨 GIAO DIỆN NGƯỜI DÙNG (React + Vite + TypeScript)
    ├── 📁 public/
    ├── 📁 src/
    │   ├── 📁 api/                   # Nơi DUY NHẤT chứa axiosClient.ts và các file gọi API
    │   ├── 📁 assets/                # Hình ảnh (images/logo-nentrongsuot.png), icons
    │   ├── 📁 components/            # Dumb Components dùng chung (Button, Card, Modal, SplitPDFViewer)
    │   ├── 📁 context/               # Global State: AuthContext.tsx (Token, User, Role, Permissions)
    │   ├── 📁 pages/                 # Smart Components (13 màn hình theo Sitemap)
    │   ├── 📁 utils/                 # Hàm tiện ích (formatDate, formatScore, validateEmail)
    │   ├── 📄 App.tsx                # Thiết lập React Router & ProtectedRoute
    │   ├── 📄 main.tsx               # Khởi tạo React & Đăng ký Web Worker cho PDF.js
    │   └── 📄 index.css              # Nhúng Tailwind directives & font Be Vietnam Pro
    ├── 📄 .env                       # VITE_API_URL=http://localhost:3000
    ├── 📄 tailwind.config.js         # Khai báo hệ màu Winter (Snowflake, Frostysilver, Pine, Mist, Branch, Berry)
    ├── 📄 package.json
    └── 📄 tsconfig.json