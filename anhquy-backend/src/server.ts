import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.route";
import categoryRouter from "./routes/category.route";
import supplierRouter from "./routes/supplier.route";
import standardRouter from "./routes/standard.route";
import documentRouter from "./routes/document.route";

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

// ── Routes ───────────────────────────────────────────────────────────────────

/** Module 1 — IAM & Auth */
app.use("/api/auth", authRouter);

/** Module 2 — Supplier & Master Data */
app.use("/api/categories", categoryRouter);
app.use("/api/suppliers", supplierRouter);
app.use("/api/standards", standardRouter);
app.use("/api/documents", documentRouter);

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

// ── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[ANHQUY Backend] Server đang chạy tại http://localhost:${PORT}`);
  console.log(`[ANHQUY Backend] Môi trường: ${process.env.NODE_ENV ?? "development"}`);
});

export default app;