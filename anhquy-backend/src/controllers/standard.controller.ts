import { Request, Response } from "express";
import {
  getStandardGroupsService,
  getStandardGroupByIdService,
  getStandardsService,
  getStandardByIdService,
  createStandardService,
  updateStandardService,
  deleteStandardService,
  getUserExcludedStandardsService,
  excludeStandardService,
  includeStandardService,
} from "../services/standard.service";
import prisma from "../config/prisma";

interface ServiceError extends Error {
  httpStatus?: number;
}

// ─── Standard_Groups ──────────────────────────────────────────────────────────

/** GET /api/standard-groups */
export const getStandardGroups = async (_req: Request, res: Response): Promise<void> => {
  try {
    const groups = await getStandardGroupsService();
    res.status(200).json({ groups });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/** GET /api/standard-groups/:id */
export const getStandardGroupById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params["id"] as string, 10);
    if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }
    const group = await getStandardGroupByIdService(id);
    res.status(200).json({ group });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ─── Standards ────────────────────────────────────────────────────────────────

/**
 * GET /api/standards
 * Query: group_id, jurisdiction, is_active, type (system|personal), page, limit, search
 * type=system  → lọc created_by IS NULL (tiêu chuẩn hệ thống)
 * type=personal → lọc created_by = userId hiện tại
 * (không có type → lấy tất cả)
 */
export const getStandards = async (req: Request, res: Response): Promise<void> => {
  try {
    const { group_id, jurisdiction, search, page, limit } = req.query;
    const typeParam = req.query.type as string | undefined;

    const is_active =
      req.query.is_active === "true" ? true : req.query.is_active === "false" ? false : undefined;

    let created_by: number | null | undefined = undefined;
    if (typeParam === "system") {
      created_by = null; // tiêu chuẩn hệ thống
    } else if (typeParam === "personal") {
      created_by = req.user!.userId; // tiêu chuẩn của user hiện tại
    }

    const result = await getStandardsService({
      group_id: group_id ? parseInt(group_id as string, 10) : undefined,
      jurisdiction: jurisdiction as string | undefined,
      is_active,
      created_by,
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

/** GET /api/standards/:id */
export const getStandardById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params["id"] as string, 10);
    if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }
    const standard = await getStandardByIdService(id);
    res.status(200).json({ standard });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * POST /api/standards
 * Tạo tiêu chuẩn cá nhân — created_by tự động gắn userId từ JWT.
 */
export const createStandard = async (req: Request, res: Response): Promise<void> => {
  const { group_id, standard_code, name, jurisdiction, priority_level, content_i18n, description } = req.body;

  if (!group_id || !standard_code || !name) {
    res.status(400).json({ message: "group_id, standard_code và name là bắt buộc." });
    return;
  }

  try {
    const parsedPriorityCreate = priority_level ? parseInt(priority_level, 10) : undefined;
    const validPriorityCreate = (parsedPriorityCreate === 1 || parsedPriorityCreate === 2) ? parsedPriorityCreate : undefined;

    const standard = await createStandardService(
      {
        group_id: parseInt(group_id, 10),
        standard_code,
        name,
        jurisdiction,
        priority_level: validPriorityCreate,
        content_i18n,
        description,
      },
      req.user!.userId
    );
    res.status(201).json({ message: "Tạo tiêu chuẩn thành công.", standard });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * PUT /api/standards/:id
 * Ghi Audit_Log — hành động nhạy cảm (Thêm/Sửa/Ẩn tiêu chuẩn).
 */
export const updateStandard = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  const { name, jurisdiction, priority_level, content_i18n, description, is_active } = req.body;

  try {
    const parsedPriorityUpdate = priority_level !== undefined ? parseInt(priority_level, 10) : undefined;
    const validPriorityUpdate = (parsedPriorityUpdate === 1 || parsedPriorityUpdate === 2) ? parsedPriorityUpdate : undefined;

    // Lấy role_name để kiểm tra isAdmin (tránh lỗi TypeScript 'role' không tồn tại trên JwtPayload)
    const userRecord = await prisma.users.findUnique({
      where: { id: req.user!.userId },
      include: { Roles: { select: { role_name: true } } },
    });
    const isAdmin = userRecord?.Roles.role_name === "Admin";

    const { oldValue, newValue } = await updateStandardService(id, {
      name,
      jurisdiction,
      priority_level: validPriorityUpdate,
      content_i18n,
      description,
      is_active,
    }, req.user!.userId, isAdmin);

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "UPDATE",
        target_table: "Standards",
        target_id: id,
        old_value: JSON.stringify(oldValue),
        new_value: JSON.stringify(newValue),
      },
    });

    res.status(200).json({ message: "Cập nhật tiêu chuẩn thành công." });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * DELETE /api/standards/:id
 * Soft Delete (is_active = false). Ghi Audit_Log.
 * Kiểm tra quyền: Admin mới được ẩn tiêu chuẩn hệ thống.
 */
export const deleteStandard = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  try {
    // Lấy role_name để kiểm tra isAdmin
    const userRecord = await prisma.users.findUnique({
      where: { id: req.user!.userId },
      include: { Roles: { select: { role_name: true } } },
    });
    const isAdmin = userRecord?.Roles.role_name === "Admin";

    const oldValue = await deleteStandardService(id, req.user!.userId, isAdmin);

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "SOFT_DELETE",
        target_table: "Standards",
        target_id: id,
        old_value: JSON.stringify({ ...oldValue, is_active: true }),
        new_value: JSON.stringify({ ...oldValue }),
      },
    });

    res.status(200).json({ message: "Tiêu chuẩn đã được ẩn khỏi hệ thống." });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ─── User_Excluded_Standards ──────────────────────────────────────────────────

/**
 * GET /api/standards/excluded
 * Lấy danh sách tiêu chuẩn bị loại trừ của user hiện tại.
 */
export const getMyExcludedStandards = async (req: Request, res: Response): Promise<void> => {
  try {
    const excluded = await getUserExcludedStandardsService(req.user!.userId);
    res.status(200).json({ excluded });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * POST /api/standards/:id/exclude
 * Thêm tiêu chuẩn vào danh sách loại trừ của user hiện tại.
 */
export const excludeStandard = async (req: Request, res: Response): Promise<void> => {
  const standardId = parseInt(req.params["id"] as string, 10);
  if (isNaN(standardId)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  try {
    await excludeStandardService(req.user!.userId, standardId);
    res.status(200).json({ message: "Đã thêm tiêu chuẩn vào danh sách loại trừ." });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * DELETE /api/standards/:id/exclude
 * Xóa tiêu chuẩn khỏi danh sách loại trừ của user (bật lại tiêu chuẩn).
 */
export const includeStandard = async (req: Request, res: Response): Promise<void> => {
  const standardId = parseInt(req.params["id"] as string, 10);
  if (isNaN(standardId)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  try {
    await includeStandardService(req.user!.userId, standardId);
    res.status(200).json({ message: "Đã bỏ tiêu chuẩn khỏi danh sách loại trừ." });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};
