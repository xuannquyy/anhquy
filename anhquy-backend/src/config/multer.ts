import multer from "multer";
import path from "path";
import fs from "fs";

/** Thư mục lưu file PDF vật lý */
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// Tự động tạo thư mục /uploads nếu chưa tồn tại
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Cấu hình diskStorage: lưu file vào /uploads/
 * Tên file = timestamp_ms + "_" + tên file gốc (đã sanitize)
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueName = `${Date.now()}_${sanitizedOriginalName}`;
    cb(null, uniqueName);
  },
});

/**
 * Bộ lọc file: chỉ chấp nhận PDF (MIME type = application/pdf).
 */
const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Chỉ chấp nhận file PDF."));
  }
};

/**
 * Instance multer dùng chung — giới hạn 50 MB mỗi file.
 */
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

export default upload;

