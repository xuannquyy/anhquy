import { Router } from "express";
import {
  getStandardGroups,
  getStandardGroupById,
  getStandards,
  getStandardById,
  createStandard,
  updateStandard,
  deleteStandard,
  getMyExcludedStandards,
  excludeStandard,
  includeStandard,
} from "../controllers/standard.controller";
import { requireAuth, requirePermission } from "../middlewares/auth.middleware";

const router = Router();

/**
 * Tất cả route Standards đều yêu cầu xác thực JWT.
 */
router.use(requireAuth);

// ─── Standard_Groups ──────────────────────────────────────────────────────────

/** GET /api/standards/groups */
router.get("/groups", requirePermission("STANDARD_VIEW"), getStandardGroups);

/** GET /api/standards/groups/:id */
router.get("/groups/:id", requirePermission("STANDARD_VIEW"), getStandardGroupById);

// ─── User_Excluded_Standards ──────────────────────────────────────────────────

/**
 * GET /api/standards/excluded
 * Lấy danh sách tiêu chuẩn bị loại trừ của user hiện tại.
 * Đặt TRƯỚC /:id để tránh bị "excluded" parse thành ID.
 */
router.get("/excluded", requirePermission("STANDARD_VIEW"), getMyExcludedStandards);

// ─── Standards ────────────────────────────────────────────────────────────────

/**
 * GET /api/standards
 * Query: group_id, jurisdiction, is_active, type (system|personal), search, page, limit
 */
router.get("/", requirePermission("STANDARD_VIEW"), getStandards);

/** GET /api/standards/:id */
router.get("/:id", requirePermission("STANDARD_VIEW"), getStandardById);

/**
 * POST /api/standards
 * Tạo tiêu chuẩn cá nhân — created_by tự động gắn userId.
 */
router.post("/", requirePermission("STANDARD_MANAGE"), createStandard);

/**
 * PUT /api/standards/:id
 * Cập nhật tiêu chuẩn (cá nhân hoặc hệ thống nếu Admin).
 */
router.put("/:id", requirePermission("STANDARD_MANAGE"), updateStandard);

/**
 * DELETE /api/standards/:id (Soft Delete → is_active = false)
 */
router.delete("/:id", requirePermission("STANDARD_MANAGE"), deleteStandard);

/**
 * POST /api/standards/:id/exclude
 * Thêm tiêu chuẩn vào danh sách loại trừ của user hiện tại.
 */
router.post("/:id/exclude", requirePermission("STANDARD_VIEW"), excludeStandard);

/**
 * DELETE /api/standards/:id/exclude
 * Xóa tiêu chuẩn khỏi danh sách loại trừ (bật lại tiêu chuẩn).
 */
router.delete("/:id/exclude", requirePermission("STANDARD_VIEW"), includeStandard);

export default router;

