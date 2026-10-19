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

// ─── Standard_Groups ──────────────────────────────────────────────────────────

/**
 * Lấy toàn bộ Standard_Groups kèm số lượng tiêu chuẩn đang hoạt động.
 */
export const getStandardGroupsService = async () => {
  return prisma.standard_Groups.findMany({
    include: {
      Standards: {
        where: { is_active: true },
        select: { id: true },
      },
    },
    orderBy: { id: "asc" },
  });
};

/**
 * Lấy 1 Standard_Group theo ID kèm danh sách standards.
 */
export const getStandardGroupByIdService = async (id: number) => {
  const group = await prisma.standard_Groups.findUnique({
    where: { id },
    include: {
      Standards: {
        where: { is_active: true },
        orderBy: { standard_code: "asc" },
      },
    },
  });
  if (!group) throw makeError("Nhóm tiêu chuẩn không tồn tại.", 404);
  return group;
};

// ─── Standards ────────────────────────────────────────────────────────────────

export interface StandardFilter {
  group_id?: number;
  jurisdiction?: string;
  is_active?: boolean;
  /** null = tiêu chuẩn hệ thống; number = tiêu chuẩn của userId đó */
  created_by?: number | null;
  /** ID của người dùng đang gọi API để lọc tránh nhìn thấy tiêu chuẩn riêng của người khác */
  current_user_id?: number;
  is_admin?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateStandardInput {
  group_id: number;
  standard_code: string;
  name: string;
  jurisdiction?: "Global" | "VN";
  priority_level?: 1 | 2;
  content_i18n?: string;
  description?: string;
}

export interface UpdateStandardInput {
  name?: string;
  jurisdiction?: "Global" | "VN";
  priority_level?: 1 | 2;
  content_i18n?: string;
  description?: string;
  is_active?: boolean;
}

/**
 * Lấy danh sách Standards với lọc và phân trang.
 * Phân biệt tiêu chuẩn hệ thống (created_by IS NULL) và tiêu chuẩn cá nhân.
 */
export const getStandardsService = async (filter: StandardFilter) => {
  const {
    group_id,
    jurisdiction,
    is_active,
    created_by,
    current_user_id,
    is_admin,
    search,
    page = 1,
    limit = 20,
  } = filter;
  const skip = (page - 1) * limit;

  const where: Prisma.StandardsWhereInput = {};
  const andConditions: Prisma.StandardsWhereInput[] = [];

  if (group_id !== undefined) where.group_id = group_id;
  if (jurisdiction) where.jurisdiction = jurisdiction;
  if (is_active !== undefined) where.is_active = is_active;

  // created_by === null → lọc tiêu chuẩn hệ thống; có giá trị → lọc tiêu chuẩn cá nhân
  if (created_by === null) {
    where.created_by = null;
  } else if (created_by !== undefined) {
    where.created_by = created_by;
  } else if (!is_admin && current_user_id !== undefined) {
    // Nếu không truyền filter type và không phải Admin: chỉ lấy 24 tiêu chuẩn gốc + tiêu chuẩn riêng của user đó
    andConditions.push({
      OR: [{ created_by: null }, { created_by: current_user_id }],
    });
  }

  if (search) {
    andConditions.push({
      OR: [
        { name: { contains: search } },
        { standard_code: { contains: search } },
        { description: { contains: search } },
      ],
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  const [items, total] = await prisma.$transaction([
    prisma.standards.findMany({
      where,
      include: {
        Standard_Groups: { select: { id: true, group_code: true, group_name: true } },
        Users: { select: { id: true, full_name: true, email: true } },
      },
      orderBy: { standard_code: "asc" },
      skip,
      take: limit,
    }),
    prisma.standards.count({ where }),
  ]);

  return { items, total, page, limit };
};

/**
 * Lấy 1 Standard theo ID.
 */
export const getStandardByIdService = async (id: number) => {
  const standard = await prisma.standards.findUnique({
    where: { id },
    include: {
      Standard_Groups: true,
      Users: { select: { id: true, full_name: true, email: true } },
    },
  });
  if (!standard) throw makeError("Tiêu chuẩn không tồn tại.", 404);
  return standard;
};

/**
 * Tạo tiêu chuẩn cá nhân (created_by = userId).
 * Không được phép tạo tiêu chuẩn hệ thống qua API (created_by IS NULL là đặc quyền seed).
 * Tự động ánh xạ tiêu chuẩn mới vào các loại hợp đồng (Category_Standards) để AI sử dụng khi quét.
 */
export const createStandardService = async (data: CreateStandardInput, userId: number) => {
  const group = await prisma.standard_Groups.findUnique({ where: { id: data.group_id } });
  if (!group) throw makeError("Nhóm tiêu chuẩn không tồn tại.", 404);

  const existingCode = await prisma.standards.findUnique({
    where: { standard_code: data.standard_code.trim() },
  });
  if (existingCode) {
    throw makeError(`Mã tiêu chuẩn '${data.standard_code}' đã tồn tại.`, 409);
  }

  // Validate content_i18n là JSON hợp lệ nếu có
  if (data.content_i18n) {
    try {
      JSON.parse(data.content_i18n);
    } catch {
      throw makeError("content_i18n phải là chuỗi JSON hợp lệ dạng {\"vi\": \"...\", \"en\": \"...\"}.", 400);
    }
  }

  return prisma.$transaction(async (tx) => {
    const createdStandard = await tx.standards.create({
      data: {
        group_id: data.group_id,
        standard_code: data.standard_code.trim(),
        name: data.name.trim(),
        jurisdiction: data.jurisdiction ?? "Global",
        priority_level: data.priority_level ?? 1,
        content_i18n: data.content_i18n ?? null,
        description: data.description?.trim() ?? null,
        created_by: userId,
        is_active: true,
      },
    });

    // Tự động gắn tiêu chuẩn mới vào các danh mục loại hợp đồng (Contract_Type)
    const contractCategories = await tx.categories.findMany({
      where: { category_type: "Contract_Type" },
      select: { id: true },
    });

    if (contractCategories.length > 0) {
      await tx.category_Standards.createMany({
        data: contractCategories.map((cat) => ({
          category_id: cat.id,
          standard_id: createdStandard.id,
        })),
      });
    }

    return createdStandard;
  });
};

/**
 * Cập nhật tiêu chuẩn.
 * - Bảo vệ 24 tiêu chuẩn gốc (created_by === null): Chỉ Admin mới được phép chỉnh sửa.
 * - Tiêu chuẩn cá nhân: Chỉ người tạo ra tiêu chuẩn đó hoặc Admin mới được sửa.
 * Trả oldValue/newValue để ghi Audit_Log.
 */
export const updateStandardService = async (
  id: number,
  data: UpdateStandardInput,
  userId: number,
  isAdmin: boolean
): Promise<{ oldValue: object; newValue: object }> => {
  const existing = await prisma.standards.findUnique({ where: { id } });
  if (!existing) throw makeError("Tiêu chuẩn không tồn tại.", 404);

  // Bảo vệ 24 tiêu chuẩn gốc của hệ thống
  if (existing.created_by === null && !isAdmin) {
    throw makeError("Chỉ Admin mới được phép chỉnh sửa 24 tiêu chuẩn gốc của hệ thống.", 403);
  }

  // Bảo vệ tiêu chuẩn cá nhân của từng người dùng
  if (existing.created_by !== null && existing.created_by !== userId && !isAdmin) {
    throw makeError("Bạn chỉ có quyền chỉnh sửa tiêu chuẩn cá nhân do chính mình tạo ra.", 403);
  }

  if (data.content_i18n) {
    try {
      JSON.parse(data.content_i18n);
    } catch {
      throw makeError("content_i18n phải là chuỗi JSON hợp lệ.", 400);
    }
  }

  const updated = await prisma.standards.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.jurisdiction !== undefined && { jurisdiction: data.jurisdiction }),
      ...(data.priority_level !== undefined && { priority_level: data.priority_level }),
      ...(data.content_i18n !== undefined && { content_i18n: data.content_i18n }),
      ...(data.description !== undefined && { description: data.description.trim() }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      updated_at: new Date(),
    },
  });

  const oldValue = {
    name: existing.name,
    jurisdiction: existing.jurisdiction,
    priority_level: existing.priority_level,
    content_i18n: existing.content_i18n,
    description: existing.description,
    is_active: existing.is_active,
  };
  const newValue = {
    name: updated.name,
    jurisdiction: updated.jurisdiction,
    priority_level: updated.priority_level,
    content_i18n: updated.content_i18n,
    description: updated.description,
    is_active: updated.is_active,
  };

  return { oldValue, newValue };
};

/**
 * Soft Delete Standard: is_active = false.
 * MUST NOT dùng .delete() với tiêu chuẩn hệ thống (created_by IS NULL).
 * Trả oldValue để controller ghi Audit_Log.
 */
export const deleteStandardService = async (
  id: number,
  userId: number,
  isAdmin: boolean
): Promise<object> => {
  const existing = await prisma.standards.findUnique({ where: { id } });
  if (!existing) throw makeError("Tiêu chuẩn không tồn tại.", 404);
  if (!existing.is_active) throw makeError("Tiêu chuẩn đã bị vô hiệu hóa.", 400);

  // Tiêu chuẩn hệ thống chỉ Admin mới được ẩn
  if (existing.created_by === null && !isAdmin) {
    throw makeError("Chỉ Admin mới được ẩn tiêu chuẩn hệ thống.", 403);
  }

  // Tiêu chuẩn cá nhân: chỉ người tạo hoặc Admin được ẩn
  if (existing.created_by !== null && existing.created_by !== userId && !isAdmin) {
    throw makeError("Bạn không có quyền ẩn tiêu chuẩn này.", 403);
  }

  await prisma.standards.update({
    where: { id },
    data: { is_active: false, updated_at: new Date() },
  });

  return {
    id: existing.id,
    standard_code: existing.standard_code,
    name: existing.name,
    is_active: false,
  };
};

// ─── User_Excluded_Standards ──────────────────────────────────────────────────

/**
 * Lấy danh sách tiêu chuẩn bị loại trừ của một user.
 */
export const getUserExcludedStandardsService = async (userId: number) => {
  return prisma.user_Excluded_Standards.findMany({
    where: { user_id: userId },
    include: {
      Standards: {
        select: {
          id: true,
          standard_code: true,
          name: true,
          jurisdiction: true,
          Standard_Groups: { select: { group_code: true, group_name: true } },
        },
      },
    },
  });
};

/**
 * Thêm tiêu chuẩn vào danh sách loại trừ của user (bật loại trừ).
 * Dùng upsert để idempotent — gọi nhiều lần không bị lỗi.
 */
export const excludeStandardService = async (userId: number, standardId: number) => {
  const standard = await prisma.standards.findUnique({ where: { id: standardId } });
  if (!standard || !standard.is_active) {
    throw makeError("Tiêu chuẩn không tồn tại hoặc đã bị vô hiệu hóa.", 404);
  }

  // upsert với khóa chính phức hợp (user_id, standard_id)
  return prisma.user_Excluded_Standards.upsert({
    where: { user_id_standard_id: { user_id: userId, standard_id: standardId } },
    create: { user_id: userId, standard_id: standardId },
    update: {}, // đã tồn tại rồi, không cần cập nhật gì
  });
};

/**
 * Xóa tiêu chuẩn khỏi danh sách loại trừ của user (tắt loại trừ).
 * Dùng deleteMany để không ném lỗi nếu bản ghi không tồn tại.
 */
export const includeStandardService = async (userId: number, standardId: number) => {
  const deleted = await prisma.user_Excluded_Standards.deleteMany({
    where: { user_id: userId, standard_id: standardId },
  });

  if (deleted.count === 0) {
    throw makeError("Tiêu chuẩn này không nằm trong danh sách loại trừ.", 404);
  }

  return { user_id: userId, standard_id: standardId };
};