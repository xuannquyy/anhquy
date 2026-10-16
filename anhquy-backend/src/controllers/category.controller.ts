import { Request, Response } from "express";
import {
  getCategoriesService,
  getCategoryByIdService,
  createCategoryService,
  updateCategoryService,
  deleteCategoryService,
} from "../services/category.service";
import prisma from "../config/prisma";

interface ServiceError extends Error {
  httpStatus?: number;
}

// ─── GET /api/categories ──────────────────────────────────────────────────────

/**
 * Lấy danh sách Categories với tìm kiếm, lọc, phân trang.
 * Query: category_type, is_active, search, page, limit
 */
export const getCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      category_type,
      search,
      page,
      limit,
    } = req.query;

    const is_active =
      req.query.is_active === "true"
        ? true
        : req.query.is_active === "false"
        ? false
        : undefined;

    const result = await getCategoriesService({
      category_type: category_type as string | undefined,
      is_active,
      search: search as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.status(200).json(result);
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ─── GET /api/categories/:id ──────────────────────────────────────────────────

export const getCategoryById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params["id"] as string, 10);
    if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }
    const category = await getCategoryByIdService(id);
    res.status(200).json({ category });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ─── POST /api/categories ─────────────────────────────────────────────────────

export const createCategory = async (req: Request, res: Response): Promise<void> => {
  const { category_type, name, description } = req.body;

  if (!category_type || !name) {
    res.status(400).json({ message: "category_type và name là bắt buộc." });
    return;
  }

  try {
    const category = await createCategoryService({ category_type, name, description });
    res.status(201).json({ message: "Tạo danh mục thành công.", category });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ─── PUT /api/categories/:id ──────────────────────────────────────────────────

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  const { name, description, is_active } = req.body;

  try {
    // Lấy giá trị cũ để ghi Audit_Log
    const oldCategory = await getCategoryByIdService(id);
    const updated = await updateCategoryService(id, { name, description, is_active });

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "UPDATE",
        target_table: "Categories",
        target_id: id,
        old_value: JSON.stringify({
          name: oldCategory.name,
          description: oldCategory.description,
          is_active: oldCategory.is_active,
        }),
        new_value: JSON.stringify({
          name: updated.name,
          description: updated.description,
          is_active: updated.is_active,
        }),
      },
    });

    res.status(200).json({ message: "Cập nhật danh mục thành công.", category: updated });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ─── DELETE /api/categories/:id ───────────────────────────────────────────────

/**
 * Soft Delete Category: is_active = false.
 */
export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  try {
    const oldCategory = await getCategoryByIdService(id);
    await deleteCategoryService(id);

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "SOFT_DELETE",
        target_table: "Categories",
        target_id: id,
        old_value: JSON.stringify({ is_active: oldCategory.is_active }),
        new_value: JSON.stringify({ is_active: false }),
      },
    });

    res.status(200).json({ message: "Danh mục đã được vô hiệu hóa." });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};
