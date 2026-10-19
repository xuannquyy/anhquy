import { Router } from "express";
import { requireAuth, requirePermission } from "../middlewares/auth.middleware";
import {
  getViolations,
  getViolationById,
  reviewViolation,
} from "../controllers/violation.controller";

const router = Router();

router.use(requireAuth);

/**
 * GET /api/violations
 * Lấy danh sách Violations với lọc.
 * Query: document_id, supplier_id, status, risk_level, page, limit
 */
router.get("/", requirePermission("VIEW_VIOLATION"), getViolations);

/**
 * GET /api/violations/:id
 * Lấy chi tiết 1 Violation.
 */
router.get("/:id", requirePermission("VIEW_VIOLATION"), getViolationById);

/**
 * PATCH /api/violations/:id/review
 * Manager thẩm định Violation: Approved hoặc Rejected.
 * Body: { status: "Approved" | "Rejected" }
 */
router.patch("/:id/review", requirePermission("APPROVE_VIOLATION"), reviewViolation);

export default router;