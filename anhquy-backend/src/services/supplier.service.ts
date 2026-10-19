import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";

/** Kiểu lỗi service kèm HTTP status */
interface ServiceError extends Error {
  httpStatus: number;
}

const makeError = (message: string, httpStatus: number): ServiceError => {
  const err = new Error(message) as ServiceError;
  err.httpStatus = httpStatus;
  return err;
};

// ─── Kiểu dữ liệu đầu vào ────────────────────────────────────────────────────

export interface CreateSupplierInput {
  company_name: string;
  tax_code: string;
  industry_id?: number;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
}

export interface UpdateSupplierInput {
  company_name?: string;
  industry_id?: number | null;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
}

export interface SupplierFilter {
  search?: string;
  industry_id?: number;
  is_deleted?: boolean;
  page?: number;
  limit?: number;
}

// ─── Services ────────────────────────────────────────────────────────────────

/**
 * Lấy danh sách Suppliers với tìm kiếm, lọc và phân trang.
 * Mặc định chỉ lấy is_deleted = false.
 */
export const getSuppliersService = async (filter: SupplierFilter) => {
  const { search, industry_id, is_deleted = false, page = 1, limit = 20 } = filter;
  const skip = (page - 1) * limit;

  const where: Prisma.SuppliersWhereInput = {
    is_deleted,
  };

  if (industry_id !== undefined) where.industry_id = industry_id;
  if (search) {
    where.OR = [
      { company_name: { contains: search } },
      { tax_code: { contains: search } },
      { contact_email: { contains: search } },
    ];
  }

  const [items, total] = await prisma.$transaction([
    prisma.suppliers.findMany({
      where,
      include: {
        Categories: { select: { id: true, name: true, category_type: true } },
      },
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.suppliers.count({ where }),
  ]);

  return { items, total, page, limit };
};

/**
 * Lấy 1 Supplier theo ID (cả soft-deleted nếu cần).
 */
export const getSupplierByIdService = async (id: number) => {
  const supplier = await prisma.suppliers.findUnique({
    where: { id },
    include: {
      Categories: { select: { id: true, name: true, category_type: true } },
      Documents: {
        where: {},
        select: { id: true, file_name: true, status: true, uploaded_at: true },
        orderBy: { uploaded_at: "desc" },
        take: 10,
      },
    },
  });
  if (!supplier) throw makeError("Nhà cung cấp không tồn tại.", 404);
  if (supplier.is_deleted) throw makeError("Nhà cung cấp đã bị xóa khỏi hệ thống.", 404);
  return supplier;
};

/**
 * Tạo mới Supplier.
 * Kiểm tra tax_code không được trùng.
 */
export const createSupplierService = async (data: CreateSupplierInput) => {
  const existing = await prisma.suppliers.findUnique({
    where: { tax_code: data.tax_code },
  });
  if (existing) {
    throw makeError(`Mã số thuế '${data.tax_code}' đã tồn tại trong hệ thống.`, 409);
  }

  if (data.industry_id) {
    const category = await prisma.categories.findUnique({ where: { id: data.industry_id } });
    if (!category || !category.is_active || category.category_type !== "Industry") {
      throw makeError("industry_id không hợp lệ hoặc không phải loại 'Industry'.", 400);
    }
  }

  return prisma.suppliers.create({
    data: {
      company_name: data.company_name.trim(),
      tax_code: data.tax_code.trim(),
      industry_id: data.industry_id ?? null,
      contact_email: data.contact_email?.trim() ?? null,
      contact_phone: data.contact_phone?.trim() ?? null,
      address: data.address?.trim() ?? null,
      risk_score: 100,
      is_deleted: false,
    },
  });
};

/**
 * Cập nhật thông tin Supplier.
 * Ghi Audit_Log do hành động nhạy cảm — trả oldValue để controller ghi log.
 */
export const updateSupplierService = async (
  id: number,
  data: UpdateSupplierInput
): Promise<{ oldValue: object; newValue: object }> => {
  const existing = await prisma.suppliers.findUnique({ where: { id } });
  if (!existing) throw makeError("Nhà cung cấp không tồn tại.", 404);
  if (existing.is_deleted) throw makeError("Không thể sửa nhà cung cấp đã bị xóa.", 400);

  if (data.industry_id !== undefined && data.industry_id !== null) {
    const category = await prisma.categories.findUnique({ where: { id: data.industry_id } });
    if (!category || !category.is_active || category.category_type !== "Industry") {
      throw makeError("industry_id không hợp lệ hoặc không phải loại 'Industry'.", 400);
    }
  }

  const updated = await prisma.suppliers.update({
    where: { id },
    data: {
      ...(data.company_name !== undefined && { company_name: data.company_name.trim() }),
      ...(data.industry_id !== undefined && { industry_id: data.industry_id }),
      ...(data.contact_email !== undefined && { contact_email: data.contact_email.trim() }),
      ...(data.contact_phone !== undefined && { contact_phone: data.contact_phone.trim() }),
      ...(data.address !== undefined && { address: data.address.trim() }),
      updated_at: new Date(),
    },
  });

  // Lọc trường nhạy cảm trước khi trả ra để ghi Audit_Log
  const oldValue = {
    company_name: existing.company_name,
    industry_id: existing.industry_id,
    contact_email: existing.contact_email,
    contact_phone: existing.contact_phone,
    address: existing.address,
  };
  const newValue = {
    company_name: updated.company_name,
    industry_id: updated.industry_id,
    contact_email: updated.contact_email,
    contact_phone: updated.contact_phone,
    address: updated.address,
  };

  return { oldValue, newValue };
};

/**
 * Soft Delete Supplier: is_deleted = true.
 * MUST NOT dùng .delete().
 * Trả oldValue để controller ghi Audit_Log.
 */
export const deleteSupplierService = async (id: number): Promise<object> => {
  const existing = await prisma.suppliers.findUnique({ where: { id } });
  if (!existing) throw makeError("Nhà cung cấp không tồn tại.", 404);
  if (existing.is_deleted) throw makeError("Nhà cung cấp đã bị xóa.", 400);

  await prisma.suppliers.update({
    where: { id },
    data: { is_deleted: true, updated_at: new Date() },
  });

  return {
    id: existing.id,
    company_name: existing.company_name,
    tax_code: existing.tax_code,
  };
};

// Khôi phục Nhà cung cấp từ Thùng rác (PATCH /api/suppliers/:id/restore)
export const restoreSupplierService = async (id: number) => {
  const supplier = await prisma.suppliers.findUnique({ where: { id } });
  if (!supplier) throw makeError("Nhà cung cấp không tồn tại.", 404);
  if (!supplier.is_deleted) throw makeError("Nhà cung cấp này đang hoạt động, không cần khôi phục.", 400);

  const restored = await prisma.suppliers.update({
    where: { id },
    data: { is_deleted: false, updated_at: new Date() },
  });

  return restored;
};