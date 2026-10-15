1. Tải nodejs
2. Tạo file .env và điền đủ thông số
3. Tải thư viện cho Backend
cd anhquy-backend
npm install
4. Tải thư viện cho Frontend
cd anhquy-backend
npm install
5. Khởi chạy
cd anhquy-backend
npm run dev
cd ..
cd anhquy-backend
npm run dev






# 1. Tạo project React bằng Vite với template TypeScript
npm create vite@latest anhquy-frontend -- --template react-ts
chọn ESLint
# 2. Di chuyển vào thư mục frontend vừa tạo
cd anhquy-frontend

# 3. Cài đặt các thư viện nền tảng cơ bản
npm install

# 4. Cài đặt Tailwind CSS và các công cụ đi kèm
npm install -D tailwindcss@3 postcss autoprefixer

# 5. Khởi tạo file cấu hình cho Tailwind (sẽ sinh ra file tailwind.config.js và postcss.config.js)
npx tailwindcss init -p

# 6. Cài đặt thư viện xử lý PDF (Core chính của ứng dụng)
npm install @react-pdf-viewer/core@3.12.0 @react-pdf-viewer/highlight@3.12.0 pdfjs-dist@3.4.120 --legacy-peer-deps

# Quay trở lại thư mục gốc ANHQUY để chuẩn bị làm Backend
cd ..


# 1. Tạo thư mục backend và di chuyển vào đó
mkdir anhquy-backend
cd anhquy-backend

# 2. Khởi tạo project Node.js (tạo ra file package.json)
npm init -y

# 3. Cài đặt các thư viện lõi (Code chạy thực tế)
npm install express cors dotenv @prisma/client

# 4. Cài đặt các thư viện hỗ trợ lập trình (TypeScript và môi trường Dev)
npm install -D typescript ts-node @types/node @types/express @types/cors nodemon prisma

# 5. Khởi tạo cấu hình TypeScript (sẽ sinh ra file tsconfig.json)
npx tsc --init

# 6. Khởi tạo Prisma ORM (sẽ sinh ra thư mục prisma và file .env)
npx prisma init

# 7. Khôi phục lại cấu trúc thư mục kiến trúc cực đẹp mà bạn đã có ban đầu
mkdir src
cd src
mkdir config controllers middlewares models routes services vector-db