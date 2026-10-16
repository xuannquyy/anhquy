import { Router } from "express";
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
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
router.get("/", requirePermission("SUPPLIER_VIEW"), getSuppliers);

/**
 * GET /api/suppliers/:id
 */
router.get("/:id", requirePermission("SUPPLIER_VIEW"), getSupplierById);

/**
 * POST /api/suppliers
 * Body: { company_name, tax_code, industry_id?, contact_email?, contact_phone?, address? }
 */
router.post("/", requirePermission("SUPPLIER_MANAGE"), createSupplier);

/**
 * PUT /api/suppliers/:id
 * Body: { company_name?, industry_id?, contact_email?, contact_phone?, address? }
 */
router.put("/:id", requirePermission("SUPPLIER_MANAGE"), updateSupplier);

/**
 * DELETE /api/suppliers/:id (Soft Delete → is_deleted = true)
 */
router.delete("/:id", requirePermission("SUPPLIER_MANAGE"), deleteSupplier);

export default router;

