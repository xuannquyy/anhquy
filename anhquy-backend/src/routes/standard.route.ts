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
router.get("/groups", requirePermission("VIEW_STANDARD"), getStandardGroups);

/** GET /api/standards/groups/:id */
router.get("/groups/:id", requirePermission("VIEW_STANDARD"), getStandardGroupById);

// ─── User_Excluded_Standards ──────────────────────────────────────────────────

/**
 * GET /api/standards/excluded
 * Lấy danh sách tiêu chuẩn bị loại trừ của user hiện tại.
 * Đặt TRƯỚC /:id để tránh bị "excluded" parse thành ID.
 */
router.get("/excluded", requirePermission("VIEW_STANDARD"), getMyExcludedStandards);

// ─── Standards ────────────────────────────────────────────────────────────────

/**
 * GET /api/standards
 * Query: group_id, jurisdiction, is_active, type (system|personal), search, page, limit
 */
router.get("/", requirePermission("VIEW_STANDARD"), getStandards);

/** GET /api/standards/:id */
router.get("/:id", requirePermission("VIEW_STANDARD"), getStandardById);

/**
 * POST /api/standards
 * Tạo tiêu chuẩn cá nhân — created_by tự động gắn userId.
 */
router.post("/", requirePermission("CREATE_CUSTOM_STANDARD"), createStandard);

/**
 * PUT /api/standards/:id
 * Cập nhật tiêu chuẩn (cá nhân hoặc hệ thống nếu Admin).
 */
router.put("/:id", requirePermission("CREATE_CUSTOM_STANDARD"), updateStandard);

/**
 * DELETE /api/standards/:id (Soft Delete → is_active = false)
 */
router.delete("/:id", requirePermission("CREATE_CUSTOM_STANDARD"), deleteStandard);

/**
 * POST /api/standards/:id/exclude
 * Thêm tiêu chuẩn vào danh sách loại trừ của user hiện tại.
 */
router.post("/:id/exclude", requirePermission("CREATE_CUSTOM_STANDARD"), excludeStandard);

/**
 * DELETE /api/standards/:id/exclude
 * Xóa tiêu chuẩn khỏi danh sách loại trừ (bật lại tiêu chuẩn).
 */
router.delete("/:id/exclude", requirePermission("CREATE_CUSTOM_STANDARD"), includeStandard);

export default router;