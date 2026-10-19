import { Router } from "express";
import { requireAuth, requirePermission } from "../middlewares/auth.middleware";
import { analyzeDocument, getDocumentViolations } from "../controllers/ai.controller";

const router = Router();

router.use(requireAuth);

/**
 * POST /api/documents/:id/analyze
 * Kích hoạt AI rà soát hợp đồng.
 * Yêu cầu quyền RUN_AI_AUDIT.
 */
router.post("/:id/analyze", requirePermission("RUN_AI_AUDIT"), analyzeDocument);

/**
 * GET /api/documents/:id/violations
 * Lấy danh sách lỗi vi phạm của hợp đồng (dùng trong Split-view).
 * Yêu cầu quyền VIEW_VIOLATION.
 */
router.get("/:id/violations", requirePermission("VIEW_VIOLATION"), getDocumentViolations);

export default router;