import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import path from "path";
import authRouter from "./routes/auth.route";
import categoryRouter from "./routes/category.route";
import supplierRouter from "./routes/supplier.route";
import standardRouter from "./routes/standard.route";
import documentRouter from "./routes/document.route";
import aiRouter from "./routes/ai.route";
import violationRouter from "./routes/violation.route";
import adminRouter from "./routes/admin.route";
import dashboardRouter from "./routes/dashboard.route";
import { cleanupOldAuditLogsService } from './services/admin.service';

const app = express();
const PORT = process.env.PORT ?? 3000;

// ── Middlewares toàn cục ──────────────────────────────────────────────────────

/** Cho phép nhận JSON body */
app.use(express.json());

/** Cho phép nhận form-urlencoded body */
app.use(express.urlencoded({ extended: true }));

/** CORS — trong production nên giới hạn origin cụ thể */
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Cho phép static serve thư mục uploads để PDF Viewer đọc được file
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
// ── Routes ───────────────────────────────────────────────────────────────────

/** Module 1 — IAM & Auth */
app.use("/api/auth", authRouter);

/** Module 2 — Supplier & Master Data */
app.use("/api/categories", categoryRouter);
app.use("/api/suppliers", supplierRouter);
app.use("/api/standards", standardRouter);
app.use("/api/documents", documentRouter);

/** Module 3 — AI Engine: analyze + violations per document */
app.use("/api/documents", aiRouter);

/** Module 4 — Audit Workflow */
app.use("/api/violations", violationRouter);
app.use("/api/dashboard", dashboardRouter);

/** Module 1 — Admin */
app.use("/api/admin", adminRouter);

/** Health check */
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: "Endpoint không tồn tại." });
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[GlobalError]", err);
  res.status(500).json({ message: "Lỗi máy chủ nội bộ." });
});

// ── Tự động quét dọn log cũ khi khởi động Server và lặp lại mỗi 24 giờ────────
cleanupOldAuditLogsService(90);
setInterval(() => {
  cleanupOldAuditLogsService(90);
}, 24 * 60 * 60 * 1000);

// ── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[ANHQUY Backend] Server đang chạy tại http://localhost:${PORT}`);
  console.log(`[ANHQUY Backend] Môi trường: ${process.env.NODE_ENV ?? "development"}`);
});

export default app;