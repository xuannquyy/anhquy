import { Router } from "express";
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  restoreSupplier,
} from "../controllers/supplier.controller";
import { requireAuth, requirePermission } from "../middlewares/auth.middleware";

const router = Router();

/**
 * Tất cả route Suppliers đều yêu cầu xác thực JWT.
 */
router.use(requireAuth);

/**
 * GET /api/suppliers
 * Query: search, industry_id, is_deleted, page, limit
 */
router.get("/", requirePermission("VIEW_SUPPLIER"), getSuppliers);

/**
 * GET /api/suppliers/:id
 */
router.get("/:id", requirePermission("VIEW_SUPPLIER"), getSupplierById);

/**
 * POST /api/suppliers
 * Body: { company_name, tax_code, industry_id?, contact_email?, contact_phone?, address? }
 */
router.post("/", requirePermission("CREATE_SUPPLIER"), createSupplier);

/**
 * PUT /api/suppliers/:id
 * Body: { company_name?, industry_id?, contact_email?, contact_phone?, address? }
 */
router.put("/:id", requirePermission("EDIT_SUPPLIER"), updateSupplier);

/**
 * DELETE /api/suppliers/:id (Soft Delete → is_deleted = true)
 */
router.delete("/:id", requirePermission("DELETE_SUPPLIER"), deleteSupplier);

router.patch("/:id/restore", requirePermission("EDIT_SUPPLIER"), restoreSupplier);

export default router;

