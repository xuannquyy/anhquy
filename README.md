HƯỚNG DẪN CÀI ĐẶT DỰ ÁN 
Yêu cầu bắt buộc trước khi chạy:
- Đã cài đặt Node.js trên máy.
Xem version mấy: node -v
-> Nên tải v22
- Đã cài đặt SQL Server và đang chạy.

⚙️ BƯỚC 1: THIẾT LẬP BACKEND (Cơ sở dữ liệu & API)
Mở Terminal, đứng ở thư mục gốc của dự án (ANHQUY) và gõ lần lượt:
# 1. Di chuyển vào thư mục backend
cd anhquy-backend
# 2. Tải toàn bộ thư viện (Không cần gõ lại các lệnh cài đặt từng cái như lúc tạo project)
npm install
# 3. Cấu hình biến môi trường (.env):
Bạn phải tự tạo một file tên là .env nằm trong thư mục anhquy-backend và dán nội dung này vào (sửa lại mật khẩu SQL Server của máy bạn cho đúng):


DATABASE_URL="sqlserver://localhost:1433;database=anhquyDB;integratedSecurity=true;trustServerCertificate=true;"
GEMINI_API_KEY="AIzaSyBJd2z9PDUMhdfeH4KaXKCFabtUr1_u1qQ"
JWT_SECRET="anhquy_super_secret_jwt_key_change_this_in_production"
JWT_EXPIRES_IN="8h"
PORT=3000


//Nếu login bằng user và mật khẩu (nếu không thì đừng quan tâm)
//DATABASE_URL="sqlserver://localhost:1433;database=anhquyDB;user=sa;password=MatKhauCuaBan;encrypt=true;trustServerCertificate=true;"
# 4. Kích hoạt Cơ sở dữ liệu (Prisma):
- đầu tiên vào SQl tạo database anhquyDB (file anhquy/Database/anhquyDB-maytinhkhac.sql)
Vẫn ở terminal của backend, gõ tiếp các lệnh này để kết nối DB:

# Tạo bộ máy kết nối (Client) cho Prisma
npx prisma generate

# (Chỉ chạy 1 lần) Nạp cấu trúc 13 bảng vào SQL Server 
npx prisma db push

# (Chỉ chạy 1 lần) Nạp dữ liệu mẫu (Master Data) như Luật RBA, Tài khoản Admin
npx prisma db seed

# 5. Khởi chạy Server Backend
npm run dev
(Nếu thấy terminal báo Server is running on port 3000 là Backend đã sống!)

🎨 BƯỚC 2: THIẾT LẬP FRONTEND (Giao diện React)
Mở một tab Terminal MỚI (để giữ cho Backend vẫn đang chạy ở terminal cũ). Đứng ở thư mục gốc ANHQUY và gõ:

# 1. Di chuyển vào thư mục frontend
cd anhquy-frontend
# 2. Tải thư viện UI (LƯU Ý: BẮT BUỘC phải có --legacy-peer-deps để không bị lỗi thư viện PDF)
npm install --legacy-peer-deps

# 3. Khởi chạy Giao diện Frontend
npm run dev