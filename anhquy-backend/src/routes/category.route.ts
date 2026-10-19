import { Router } from "express";
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controller";
import { requireAuth, requirePermission } from "../middlewares/auth.middleware";

const router = Router();

/**
 * Tất cả route Categories đều yêu cầu xác thực JWT.
 */
router.use(requireAuth);

/**
 * GET /api/categories
 * Query: category_type, is_active, search, page, limit
 */
router.get("/", requirePermission("VIEW_DOC"), getCategories);

/**
 * GET /api/categories/:id
 */
router.get("/:id", requirePermission("VIEW_DOC"), getCategoryById);

/**
 * POST /api/categories
 * Body: { category_type, name, description? }
 */
router.post("/", requirePermission("MANAGE_CATEGORIES"), createCategory);

/**
 * PUT /api/categories/:id
 * Body: { name?, description?, is_active? }
 */
router.put("/:id", requirePermission("MANAGE_CATEGORIES"), updateCategory);

/**
 * DELETE /api/categories/:id (Soft Delete → is_active = false)
 */
router.delete("/:id", requirePermission("MANAGE_CATEGORIES"), deleteCategory);

export default router;