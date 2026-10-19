import { Request, Response } from "express";
import {
  getSuppliersService,
  getSupplierByIdService,
  createSupplierService,
  updateSupplierService,
  deleteSupplierService,
  restoreSupplierService,
} from "../services/supplier.service";
import prisma from "../config/prisma";

interface ServiceError extends Error {
  httpStatus?: number;
}

// ─── GET /api/suppliers ───────────────────────────────────────────────────────

/**
 * Lấy danh sách Suppliers, mặc định ẩn các bản ghi is_deleted = true.
 * Query: search, industry_id, is_deleted, page, limit
 */
export const getSuppliers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, page, limit } = req.query;
    const industry_id = req.query.industry_id ? parseInt(req.query.industry_id as string, 10) : undefined;
    const is_deleted =
      req.query.is_deleted === "true" ? true : req.query.is_deleted === "false" ? false : false;

    const result = await getSuppliersService({
      search: search as string | undefined,
      industry_id,
      is_deleted,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.status(200).json(result);
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ─── GET /api/suppliers/:id ───────────────────────────────────────────────────

export const getSupplierById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params["id"] as string, 10);
    if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }
    const supplier = await getSupplierByIdService(id);
    res.status(200).json({ supplier });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ─── POST /api/suppliers ──────────────────────────────────────────────────────

export const createSupplier = async (req: Request, res: Response): Promise<void> => {
  const { company_name, tax_code, industry_id, contact_email, contact_phone, address } = req.body;

  if (!company_name || !tax_code) {
    res.status(400).json({ message: "company_name và tax_code là bắt buộc." });
    return;
  }

  try {
    const supplier = await createSupplierService({
      company_name,
      tax_code,
      industry_id: industry_id ? parseInt(industry_id, 10) : undefined,
      contact_email,
      contact_phone,
      address,
    });
    res.status(201).json({ message: "Tạo nhà cung cấp thành công.", supplier });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ─── PUT /api/suppliers/:id ───────────────────────────────────────────────────

export const updateSupplier = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  const { company_name, industry_id, contact_email, contact_phone, address } = req.body;

  try {
    const { oldValue, newValue } = await updateSupplierService(id, {
      company_name,
      industry_id: industry_id !== undefined ? (industry_id === null ? null : parseInt(industry_id, 10)) : undefined,
      contact_email,
      contact_phone,
      address,
    });

    // Hành động nhạy cảm: bắt buộc ghi Audit_Log
    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "UPDATE",
        target_table: "Suppliers",
        target_id: id,
        old_value: JSON.stringify(oldValue),
        new_value: JSON.stringify(newValue),
      },
    });

    res.status(200).json({ message: "Cập nhật nhà cung cấp thành công." });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ─── DELETE /api/suppliers/:id ────────────────────────────────────────────────

/**
 * Soft Delete Supplier: is_deleted = true.
 * Bắt buộc ghi Audit_Log theo SKILL.md.
 */
export const deleteSupplier = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  try {
    const oldValue = await deleteSupplierService(id);

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "SOFT_DELETE",
        target_table: "Suppliers",
        target_id: id,
        old_value: JSON.stringify({ ...oldValue, is_deleted: false }),
        new_value: JSON.stringify({ ...oldValue, is_deleted: true }),
      },
    });

    res.status(200).json({ message: "Nhà cung cấp đã được xóa khỏi hệ thống." });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};


export const restoreSupplier = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  try {
    const restored = await restoreSupplierService(id);

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "RESTORE",
        target_table: "Suppliers",
        target_id: id,
        old_value: JSON.stringify({ is_deleted: true }),
        new_value: JSON.stringify({ is_deleted: false }),
      },
    });

    res.status(200).json({ message: "Khôi phục nhà cung cấp thành công.", supplier: restored });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};