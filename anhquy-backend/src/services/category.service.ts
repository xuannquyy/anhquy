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

export interface CreateCategoryInput {
  category_type: "Industry" | "Contract_Type";
  name: string;
  description?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  is_active?: boolean;
}

export interface CategoryFilter {
  category_type?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── Services ────────────────────────────────────────────────────────────────

/**
 * Lấy danh sách Categories với tìm kiếm, lọc và phân trang.
 */
export const getCategoriesService = async (filter: CategoryFilter) => {
  const { category_type, is_active, search, page = 1, limit = 20 } = filter;
  const skip = (page - 1) * limit;

  const where: Prisma.CategoriesWhereInput = {};

  if (category_type) where.category_type = category_type;
  if (is_active !== undefined) where.is_active = is_active;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
    ];
  }

  const [items, total] = await prisma.$transaction([
    prisma.categories.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.categories.count({ where }),
  ]);

  return { items, total, page, limit };
};

/**
 * Lấy 1 Category theo ID.
 */
export const getCategoryByIdService = async (id: number) => {
  const category = await prisma.categories.findUnique({ where: { id } });
  if (!category) throw makeError("Danh mục không tồn tại.", 404);
  return category;
};

/**
 * Tạo mới Category.
 * Nếu category_type là 'Contract_Type', tự động ánh xạ các tiêu chuẩn đang hoạt động
 * vào bảng Category_Standards để loại hợp đồng mới sẵn sàng cho AI rà soát.
 */
export const createCategoryService = async (data: CreateCategoryInput) => {
  const validTypes = ["Industry", "Contract_Type"];
  if (!validTypes.includes(data.category_type)) {
    throw makeError("category_type phải là 'Industry' hoặc 'Contract_Type'.", 400);
  }

  return prisma.$transaction(async (tx) => {
    const newCategory = await tx.categories.create({
      data: {
        category_type: data.category_type,
        name: data.name.trim(),
        description: data.description?.trim(),
        is_active: true,
      },
    });

    // Nếu tạo Loại hợp đồng mới, tự động gắn bộ tiêu chuẩn hiện có vào Category_Standards
    if (data.category_type === "Contract_Type") {
      const activeStandards = await tx.standards.findMany({
        where: { is_active: true },
        select: { id: true },
      });

      if (activeStandards.length > 0) {
        await tx.category_Standards.createMany({
          data: activeStandards.map((s) => ({
            category_id: newCategory.id,
            standard_id: s.id,
          })),
        });
      }
    }

    return newCategory;
  });
};

/**
 * Cập nhật Category.
 */
export const updateCategoryService = async (id: number, data: UpdateCategoryInput) => {
  const existing = await prisma.categories.findUnique({ where: { id } });
  if (!existing) throw makeError("Danh mục không tồn tại.", 404);

  return prisma.categories.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description.trim() }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      updated_at: new Date(),
    },
  });
};

/**
 * Soft Delete Category: is_active = false.
 * MUST NOT dùng .delete().
 */
export const deleteCategoryService = async (id: number) => {
  const existing = await prisma.categories.findUnique({ where: { id } });
  if (!existing) throw makeError("Danh mục không tồn tại.", 404);
  if (!existing.is_active) throw makeError("Danh mục đã bị vô hiệu hóa.", 400);

  return prisma.categories.update({
    where: { id },
    data: { is_active: false, updated_at: new Date() },
  });
};