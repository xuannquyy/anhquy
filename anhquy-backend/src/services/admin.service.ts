import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { GoogleGenAI } from "@google/genai";

interface ServiceError extends Error {
  httpStatus: number;
}

const makeError = (message: string, httpStatus: number): ServiceError => {
  const err = new Error(message) as ServiceError;
  err.httpStatus = httpStatus;
  return err;
};

// ════════════════════════════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════════════════════════════

export interface UserFilter {
  search?: string;
  role_id?: number;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateUserInput {
  email: string;
  password: string;
  full_name: string;
  role_id: number;
}

export interface UpdateUserInput {
  full_name?: string;
  role_id?: number;
  is_active?: boolean;
}

/**
 * Lấy danh sách Users (loại bỏ password_hash và refresh_token khỏi response).
 */
export const getUsersService = async (filter: UserFilter) => {
  const { search, role_id, is_active, page = 1, limit = 20 } = filter;
  const skip = (page - 1) * limit;

  const where: Prisma.UsersWhereInput = {};
  if (role_id !== undefined) where.role_id = role_id;
  if (is_active !== undefined) where.is_active = is_active;
  if (search) {
    where.OR = [
      { full_name: { contains: search } },
      { email: { contains: search } },
    ];
  }

  const [items, total] = await prisma.$transaction([
    prisma.users.findMany({
      where,
      select: {
        id: true,
        email: true,
        full_name: true,
        role_id: true,
        is_active: true,
        failed_login_attempts: true,
        locked_until: true,
        created_at: true,
        updated_at: true,
        Roles: { select: { id: true, role_name: true } },
      },
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.users.count({ where }),
  ]);

  return { items, total, page, limit };
};

/**
 * Lấy 1 User theo ID (không trả password_hash, refresh_token).
 */
export const getUserByIdService = async (id: number) => {
  const user = await prisma.users.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      full_name: true,
      role_id: true,
      is_active: true,
      failed_login_attempts: true,
      locked_until: true,
      created_at: true,
      updated_at: true,
      Roles: { select: { id: true, role_name: true, description: true } },
    },
  });
  if (!user) throw makeError("Người dùng không tồn tại.", 404);
  return user;
};

/**
 * Tạo mới User (Admin tạo thủ công).
 * Hash mật khẩu bằng bcrypt saltRounds = 10.
 */
export const createUserService = async (data: CreateUserInput) => {
  const existing = await prisma.users.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) throw makeError(`Email '${data.email}' đã được sử dụng.`, 409);

  const role = await prisma.roles.findUnique({ where: { id: data.role_id } });
  if (!role) throw makeError("Role không tồn tại.", 404);
  if (role.is_active === false) throw makeError("Không thể gán người dùng vào vai trò đã bị vô hiệu hóa hoặc đã xóa.", 400);

  if (data.password.length < 8) {
    throw makeError("Mật khẩu phải có ít nhất 8 ký tự.", 400);
  }

  const hashedPw = await bcrypt.hash(data.password, 10);

  const user = await prisma.users.create({
    data: {
      email: data.email.trim().toLowerCase(),
      password_hash: hashedPw,
      full_name: data.full_name.trim(),
      role_id: data.role_id,
      is_active: true,
      failed_login_attempts: 0,
    },
    select: {
      id: true,
      email: true,
      full_name: true,
      role_id: true,
      is_active: true,
      created_at: true,
      Roles: { select: { role_name: true } },
    },
  });

  return user;
};

/**
 * Cập nhật User (Admin sửa role, active, tên).
 * Trả { oldValue, newValue } để controller ghi Audit_Log.
 * Soft Delete: is_active = false (MUST NOT dùng .delete()).
 */
export const updateUserService = async (
  id: number,
  data: UpdateUserInput
): Promise<{ oldValue: object; newValue: object }> => {
  const existing = await prisma.users.findUnique({
    where: { id },
    select: { id: true, full_name: true, role_id: true, is_active: true },
  });
  if (!existing) throw makeError("Người dùng không tồn tại.", 404);

  if (data.role_id !== undefined) {
    const role = await prisma.roles.findUnique({ where: { id: data.role_id } });
    if (!role) throw makeError("Role không tồn tại.", 404);
    if (role.is_active === false) throw makeError("Không thể gán người dùng vào vai trò đã bị vô hiệu hóa hoặc đã xóa.", 400);
  }

  const updated = await prisma.users.update({
    where: { id },
    data: {
      ...(data.full_name !== undefined && { full_name: data.full_name.trim() }),
      ...(data.role_id !== undefined && { role_id: data.role_id }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      // Tự động gỡ khóa Brute-force khi Admin kích hoạt hoặc bấm Gỡ khóa
      ...(data.is_active === true && {
        failed_login_attempts: 0,
        locked_until: null,
      }),
      updated_at: new Date(),
    },
    select: { id: true, full_name: true, role_id: true, is_active: true },
  });

  const oldValue = {
    full_name: existing.full_name,
    role_id: existing.role_id,
    is_active: existing.is_active,
  };
  const newValue = {
    full_name: updated.full_name,
    role_id: updated.role_id,
    is_active: updated.is_active,
  };

  return { oldValue, newValue };
};

/**
 * Reset mật khẩu user (Admin).
 * Không ghi mật khẩu vào Audit_Log.
 */
export const resetUserPasswordService = async (id: number, newPassword: string): Promise<void> => {
  const user = await prisma.users.findUnique({ where: { id } });
  if (!user) throw makeError("Người dùng không tồn tại.", 404);
  if (newPassword.length < 8) throw makeError("Mật khẩu phải có ít nhất 8 ký tự.", 400);

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.users.update({
    where: { id },
    data: {
      password_hash: hashed,
      failed_login_attempts: 0,
      locked_until: null,
      updated_at: new Date(),
    },
  });
};

// ════════════════════════════════════════════════════════════════════════════════
// ROLES & ROLE_PERMISSIONS MATRIX (RBAC)
// ════════════════════════════════════════════════════════════════════════════════

export interface CreateRoleInput {
  role_name: string;
  description?: string;
}

export interface UpdateRoleInput {
  role_name?: string;
  description?: string;
  is_active?: boolean;
}

/**
 * Lấy toàn bộ Roles kèm danh sách permissions đang được gán và danh sách Users.
 * @param includeInactive - Mặc định false (chỉ lấy roles đang hoạt động).
 */
export const getRolesWithPermissionsService = async (includeInactive = false) => {
  return prisma.roles.findMany({
    where: includeInactive ? {} : { is_active: true },
    include: {
      Role_Permissions: {
        include: {
          Permissions: { select: { id: true, permission_code: true, permission_name: true } },
        },
      },
      Users: {
        where: { is_active: true },
        select: {
          id: true,
          full_name: true,
          email: true,
          is_active: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
};

/**
 * Lấy chi tiết 1 Role theo ID kèm permissions và users đang được gán.
 */
export const getRoleByIdService = async (id: number) => {
  const role = await prisma.roles.findUnique({
    where: { id },
    include: {
      Role_Permissions: {
        include: {
          Permissions: { select: { id: true, permission_code: true, permission_name: true } },
        },
      },
      Users: {
        where: { is_active: true },
        select: { id: true, full_name: true, email: true, is_active: true },
      },
    },
  });
  if (!role) throw makeError("Vai trò không tồn tại.", 404);
  return role;
};

/**
 * Tạo mới một Role trong hệ thống.
 * - Kiểm tra trùng tên vai trò (không phân biệt hoa thường và chuẩn hóa khoảng trắng).
 * - Vai trò mới ban đầu chưa có quyền nào.
 */
export const createRoleService = async (data: CreateRoleInput) => {
  const trimmedName = data.role_name ? data.role_name.trim() : "";
  if (!trimmedName) throw makeError("Tên vai trò không được để trống.", 400);

  // Kiểm tra trùng lặp tên vai trò
  const allRoles = await prisma.roles.findMany();
  const normalizedName = trimmedName.toLowerCase();
  const duplicate = allRoles.find(
    (r) => r.role_name.trim().toLowerCase() === normalizedName
  );

  if (duplicate) {
    if (duplicate.is_active === false) {
      throw makeError(
        `Vai trò '${duplicate.role_name}' đã từng tồn tại và hiện đang bị vô hiệu hóa. Bạn có thể khôi phục lại vai trò này.`,
        409
      );
    }
    throw makeError(`Tên vai trò '${trimmedName}' đã tồn tại trong hệ thống.`, 409);
  }

  const role = await prisma.roles.create({
    data: {
      role_name: trimmedName,
      description: data.description ? data.description.trim() : null,
      is_active: true,
    },
    include: {
      Role_Permissions: {
        include: {
          Permissions: { select: { id: true, permission_code: true, permission_name: true } },
        },
      },
      Users: {
        select: { id: true, full_name: true, email: true, is_active: true },
      },
    },
  });

  return role;
};

/**
 * Chỉnh sửa thông tin vai trò (tên, mô tả, trạng thái hoạt động).
 * - Giữ nguyên ID vai trò, không làm mất quyền hoặc người dùng được gán.
 * - Bảo vệ vai trò Admin hệ thống.
 */
export const updateRoleService = async (
  id: number,
  data: UpdateRoleInput
): Promise<{ oldValue: object; newValue: object; role: object }> => {
  const existing = await prisma.roles.findUnique({
    where: { id },
    include: {
      Role_Permissions: {
        include: {
          Permissions: { select: { id: true, permission_code: true, permission_name: true } },
        },
      },
    },
  });
  if (!existing) throw makeError("Vai trò không tồn tại.", 404);

  const isAdminRole = existing.role_name.trim().toLowerCase() === "admin";
  if (isAdminRole) {
    if (data.role_name !== undefined && data.role_name.trim().toLowerCase() !== "admin") {
      throw makeError("Không thể thay đổi tên của vai trò Quản trị viên (Admin) mặc định.", 400);
    }
    if (data.is_active === false) {
      throw makeError("Không thể vô hiệu hóa vai trò Quản trị viên (Admin) mặc định.", 400);
    }
  }

  // Không cho phép sửa thuộc tính của vai trò đã xóa mềm (trừ khi hành động là kích hoạt lại)
  if (existing.is_active === false && data.is_active !== true) {
    throw makeError("Không thể chỉnh sửa vai trò đã bị vô hiệu hóa. Vui lòng khôi phục trước.", 400);
  }

  if (data.role_name !== undefined) {
    const trimmedName = data.role_name.trim();
    if (!trimmedName) throw makeError("Tên vai trò không được để trống.", 400);

    const otherRoles = await prisma.roles.findMany({ where: { id: { not: id } } });
    const hasDup = otherRoles.some(
      (r) => r.role_name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (hasDup) {
      throw makeError(`Tên vai trò '${trimmedName}' đã được sử dụng bởi một vai trò khác.`, 409);
    }
  }

  const updated = await prisma.roles.update({
    where: { id },
    data: {
      ...(data.role_name !== undefined && { role_name: data.role_name.trim() }),
      ...(data.description !== undefined && { description: data.description.trim() }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
    },
    include: {
      Role_Permissions: {
        include: {
          Permissions: { select: { id: true, permission_code: true, permission_name: true } },
        },
      },
      Users: {
        where: { is_active: true },
        select: { id: true, full_name: true, email: true, is_active: true },
      },
    },
  });

  const oldValue = {
    role_name: existing.role_name,
    description: existing.description,
    is_active: existing.is_active,
  };
  const newValue = {
    role_name: updated.role_name,
    description: updated.description,
    is_active: updated.is_active,
  };

  return { oldValue, newValue, role: updated };
};

/**
 * Xóa mềm (Soft Delete) vai trò:
 * - Gán is_active = false (không xóa vật lý khỏi cơ sở dữ liệu).
 * - Chặn xóa Admin.
 * - Chặn xóa nếu còn người dùng đang gán vai trò này.
 * - Chặn xóa vai trò cuối cùng có quyền quản trị.
 */
export const deleteRoleService = async (
  id: number
): Promise<{ oldValue: object; newValue: object }> => {
  const existing = await prisma.roles.findUnique({
    where: { id },
    include: {
      Role_Permissions: {
        include: { Permissions: { select: { permission_code: true } } },
      },
    },
  });
  if (!existing) throw makeError("Vai trò không tồn tại.", 404);

  if (existing.role_name.trim().toLowerCase() === "admin") {
    throw makeError("Không thể xóa vai trò Quản trị viên (Admin) mặc định của hệ thống.", 400);
  }

  // Kiểm tra người dùng đang gán
  const activeUsersCount = await prisma.users.count({
    where: { role_id: id, is_active: true },
  });
  if (activeUsersCount > 0) {
    throw makeError(
      `Vai trò '${existing.role_name}' đang được gán cho ${activeUsersCount} người dùng đang hoạt động. Vui lòng chuyển các người dùng này sang vai trò khác trước khi xóa.`,
      400
    );
  }

  // Kiểm tra vai trò quản trị cuối cùng
  const hasAdminPerm = existing.Role_Permissions.some(
    (rp) => rp.Permissions.permission_code === "MANAGE_ROLES" || rp.Permissions.permission_code === "MANAGE_USERS"
  );
  if (hasAdminPerm) {
    const otherAdminRoles = await prisma.roles.count({
      where: {
        id: { not: id },
        is_active: true,
        Role_Permissions: {
          some: {
            Permissions: {
              permission_code: { in: ["MANAGE_ROLES", "MANAGE_USERS"] },
            },
          },
        },
      },
    });
    if (otherAdminRoles === 0) {
      throw makeError("Không thể xóa vai trò cuối cùng đang có quyền quản trị hệ thống.", 400);
    }
  }

  const updated = await prisma.roles.update({
    where: { id },
    data: { is_active: false },
  });

  const oldValue = { id: existing.id, role_name: existing.role_name, is_active: existing.is_active };
  const newValue = { id: updated.id, role_name: updated.role_name, is_active: false };

  return { oldValue, newValue };
};

/**
 * Khôi phục vai trò đã xóa mềm (Soft Delete).
 */
export const restoreRoleService = async (
  id: number
): Promise<{ oldValue: object; newValue: object; role: object }> => {
  const existing = await prisma.roles.findUnique({ where: { id } });
  if (!existing) throw makeError("Vai trò không tồn tại.", 404);

  const restored = await prisma.roles.update({
    where: { id },
    data: { is_active: true },
    include: {
      Role_Permissions: {
        include: {
          Permissions: { select: { id: true, permission_code: true, permission_name: true } },
        },
      },
      Users: {
        where: { is_active: true },
        select: { id: true, full_name: true, email: true, is_active: true },
      },
    },
  });

  return {
    oldValue: { id: existing.id, is_active: existing.is_active },
    newValue: { id: restored.id, is_active: true },
    role: restored,
  };
};

/**
 * Lấy toàn bộ Permissions (để render ma trận).
 */
export const getAllPermissionsService = async () => {
  return prisma.permissions.findMany({ orderBy: { permission_code: "asc" } });
};

/**
 * Gán permission cho role (upsert để idempotent).
 * Trả thông tin để ghi Audit_Log.
 */
export const grantPermissionService = async (
  roleId: number,
  permissionId: number
): Promise<{ role_id: number; permission_id: number }> => {
  const role = await prisma.roles.findUnique({ where: { id: roleId } });
  if (!role) throw makeError("Role không tồn tại.", 404);
  if (role.is_active === false) {
    throw makeError("Không thể cấp quyền cho vai trò đã bị vô hiệu hóa hoặc đã xóa.", 400);
  }

  const permission = await prisma.permissions.findUnique({ where: { id: permissionId } });
  if (!permission) throw makeError("Permission không tồn tại.", 404);

  await prisma.role_Permissions.upsert({
    where: { role_id_permission_id: { role_id: roleId, permission_id: permissionId } },
    create: { role_id: roleId, permission_id: permissionId },
    update: {},
  });

  return { role_id: roleId, permission_id: permissionId };
};

/**
 * Thu hồi permission khỏi role.
 * Trả thông tin để ghi Audit_Log.
 */
export const revokePermissionService = async (
  roleId: number,
  permissionId: number
): Promise<void> => {
  const role = await prisma.roles.findUnique({ where: { id: roleId } });
  if (!role) throw makeError("Role không tồn tại.", 404);
  if (role.is_active === false) {
    throw makeError("Không thể thu hồi quyền của vai trò đã bị vô hiệu hóa.", 400);
  }

  // Bảo vệ vai trò Admin khỏi mất quyền quản trị
  if (role.role_name.trim().toLowerCase() === "admin") {
    const perm = await prisma.permissions.findUnique({ where: { id: permissionId } });
    if (perm && ["MANAGE_ROLES", "MANAGE_USERS", "MANAGE_SYSTEM_CONFIGS", "VIEW_AUDIT_LOGS"].includes(perm.permission_code)) {
      throw makeError(`Không thể thu hồi quyền quản trị tối cao '${perm.permission_code}' khỏi vai trò Admin.`, 400);
    }
  }

  const existing = await prisma.role_Permissions.findUnique({
    where: { role_id_permission_id: { role_id: roleId, permission_id: permissionId } },
  });
  if (!existing) throw makeError("Permission này chưa được gán cho role đó.", 404);

  await prisma.role_Permissions.delete({
    where: { role_id_permission_id: { role_id: roleId, permission_id: permissionId } },
  });
};

/**
 * Đồng bộ hóa toàn bộ danh sách permissions của một vai trò trong 1 Transaction an toàn.
 * Tránh tình trạng cập nhật nửa vời khi thao tác hàng loạt.
 */
export const syncRolePermissionsService = async (
  roleId: number,
  permissionIds: number[]
): Promise<{ oldValue: object; newValue: object }> => {
  const role = await prisma.roles.findUnique({
    where: { id: roleId },
    include: { Role_Permissions: { select: { permission_id: true } } },
  });
  if (!role) throw makeError("Vai trò không tồn tại.", 404);
  if (role.is_active === false) {
    throw makeError("Không thể phân quyền cho vai trò đã bị vô hiệu hóa hoặc đã xóa.", 400);
  }

  // Bảo vệ vai trò Admin
  if (role.role_name.trim().toLowerCase() === "admin") {
    const essentialCodes = ["MANAGE_ROLES", "MANAGE_USERS", "MANAGE_SYSTEM_CONFIGS", "VIEW_AUDIT_LOGS"];
    const essentialPerms = await prisma.permissions.findMany({
      where: { permission_code: { in: essentialCodes } },
      select: { id: true, permission_code: true },
    });
    const targetSet = new Set(permissionIds);
    for (const ep of essentialPerms) {
      if (!targetSet.has(ep.id)) {
        throw makeError(
          `Không thể thu hồi quyền quản trị tối cao '${ep.permission_code}' khỏi vai trò Admin.`,
          400
        );
      }
    }
  }

  const oldPermIds = role.Role_Permissions.map((rp) => rp.permission_id);

  await prisma.$transaction(async (tx) => {
    // Xóa những quyền bị bỏ
    await tx.role_Permissions.deleteMany({
      where: {
        role_id: roleId,
        permission_id: { notIn: permissionIds },
      },
    });

    // Cấp những quyền mới
    for (const pid of permissionIds) {
      await tx.role_Permissions.upsert({
        where: { role_id_permission_id: { role_id: roleId, permission_id: pid } },
        create: { role_id: roleId, permission_id: pid },
        update: {},
      });
    }
  });

  return {
    oldValue: { role_id: roleId, permission_ids: oldPermIds },
    newValue: { role_id: roleId, permission_ids: permissionIds },
  };
};

/**
 * Gán trực tiếp người dùng vào vai trò và tự động áp dụng toàn bộ quyền của vai trò đó.
 */
export const assignUserRoleService = async (
  userId: number,
  roleId: number
): Promise<{ oldValue: object; newValue: object; user: object }> => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, full_name: true, email: true, role_id: true, is_active: true },
  });
  if (!user) throw makeError("Người dùng không tồn tại.", 404);

  const role = await prisma.roles.findUnique({ where: { id: roleId } });
  if (!role) throw makeError("Vai trò không tồn tại.", 404);
  if (role.is_active === false) {
    throw makeError("Không thể gán người dùng vào vai trò đã bị vô hiệu hóa hoặc đã xóa.", 400);
  }

  const updated = await prisma.users.update({
    where: { id: userId },
    data: { role_id: roleId, updated_at: new Date() },
    select: {
      id: true,
      full_name: true,
      email: true,
      role_id: true,
      Roles: { select: { id: true, role_name: true } },
    },
  });

  return {
    oldValue: { user_id: userId, role_id: user.role_id },
    newValue: { user_id: userId, role_id: roleId },
    user: updated,
  };
};

// ════════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ════════════════════════════════════════════════════════════════════════════════

export interface AuditLogFilter {
  user_id?: number;
  action_type?: string;
  target_table?: string;
  page?: number;
  limit?: number;
}

/**
 * Lấy Audit_Logs với lọc và phân trang (Admin only).
 */
export const getAuditLogsService = async (filter: AuditLogFilter) => {
  const { user_id, action_type, target_table, page = 1, limit = 50 } = filter;
  const skip = (page - 1) * limit;

  const where: Prisma.Audit_LogsWhereInput = {};
  if (user_id !== undefined) where.user_id = user_id;
  if (action_type) where.action_type = { contains: action_type };
  if (target_table) where.target_table = target_table;

  const [items, total] = await prisma.$transaction([
    prisma.audit_Logs.findMany({
      where,
      include: {
        Users: { select: { id: true, full_name: true, email: true } },
      },
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.audit_Logs.count({ where }),
  ]);

  return { items, total, page, limit };
};

// ════════════════════════════════════════════════════════════════════════════════
// SYSTEM_CONFIGS
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Lấy toàn bộ System_Configs.
 */
export const getSystemConfigsService = async () => {
  return prisma.system_Configs.findMany({ orderBy: { config_key: "asc" } });
};

/**
 * Cập nhật giá trị một System_Config theo config_key.
 * Tích hợp tự động Test Gemini API Key trước khi lưu vào Database.
 */
export const updateSystemConfigService = async (
  configKey: string,
  newValue: string
): Promise<{ oldValue: object; newValue: object; id: number }> => {
  const config = await prisma.system_Configs.findUnique({ where: { config_key: configKey } });
  if (!config) throw makeError(`Config key '${configKey}' không tồn tại.`, 404);

  const trimmedVal = typeof newValue === "string" ? newValue.trim() : "";

  // ── KIỂM TRA NGẦM GEMINI API KEY NẾU KHÔNG ĐỂ TRỐNG ──
  if (configKey === "GEMINI_API_KEY" && trimmedVal !== "") {
    try {
      // Đọc động tên model đang được cấu hình trong hệ thống (AI_MODEL_NAME)
      const modelConfig = await prisma.system_Configs.findUnique({
        where: { config_key: "AI_MODEL_NAME" },
      });
      const targetModel = modelConfig?.config_value?.trim() || "gemini-2.5-flash";

      const genai = new GoogleGenAI({ apiKey: trimmedVal });
      // Test kết nối bằng đúng Model mà doanh nghiệp đang cài đặt
      await genai.models.generateContent({
        model: targetModel,
        contents: "Test connection",
        config: { maxOutputTokens: 5 },
      });
    } catch (error: unknown) {
      const errStr = error instanceof Error ? error.message : String(error);
      const isActualKeyError = /401|403|api.?key|permission_denied|invalid/i.test(errStr);

      if (isActualKeyError) {
        throw makeError(
          "Google Gemini API Key không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại key của doanh nghiệp!",
          400
        );
      }
      console.warn("[Admin Service] Cảnh báo test kết nối (vẫn cho phép lưu):", errStr);
    }
  }

  const updated = await prisma.system_Configs.update({
    where: { config_key: configKey },
    data: { config_value: trimmedVal, updated_at: new Date() },
  });

  return {
    id: updated.id,
    oldValue: { config_key: configKey, config_value: config.config_value },
    newValue: { config_key: configKey, config_value: updated.config_value },
  };
};

// ════════════════════════════════════════════════════════════════════════════════
// RISK_THRESHOLDS
// ════════════════════════════════════════════════════════════════════════════════

export interface UpdateRiskThresholdInput {
  min_score?: number;
  max_score?: number;
  color_code?: string;
}

/**
 * Lấy toàn bộ Risk_Thresholds.
 */
export const getRiskThresholdsService = async () => {
  return prisma.risk_Thresholds.findMany({ orderBy: { min_score: "asc" } });
};

/**
 * Cập nhật một Risk_Threshold theo ID.
 * Trả { oldValue, newValue } để ghi Audit_Log.
 */
export const updateRiskThresholdService = async (
  id: number,
  data: UpdateRiskThresholdInput
): Promise<{ oldValue: object; newValue: object }> => {
  const existing = await prisma.risk_Thresholds.findUnique({ where: { id } });
  if (!existing) throw makeError("Risk threshold không tồn tại.", 404);

  if (data.min_score !== undefined && data.max_score !== undefined) {
    if (data.min_score >= data.max_score) {
      throw makeError("min_score phải nhỏ hơn max_score.", 400);
    }
  }

  const updated = await prisma.risk_Thresholds.update({
    where: { id },
    data: {
      ...(data.min_score !== undefined && { min_score: data.min_score }),
      ...(data.max_score !== undefined && { max_score: data.max_score }),
      ...(data.color_code !== undefined && { color_code: data.color_code.trim() }),
      updated_at: new Date(),
    },
  });

  const oldValue = {
    level_name: existing.level_name,
    min_score: existing.min_score,
    max_score: existing.max_score,
    color_code: existing.color_code,
  };
  const newValue = {
    level_name: updated.level_name,
    min_score: updated.min_score,
    max_score: updated.max_score,
    color_code: updated.color_code,
  };

  return { oldValue, newValue };
};

/**
 * Tự động dọn dẹp Audit_Logs cũ để tối ưu dung lượng Database.
 * - Xóa các bản ghi cũ hơn retentionDays (mặc định 90 ngày).
 * - Được gọi tự động định kỳ bởi Server mà không làm chậm request của người dùng.
 */
export const cleanupOldAuditLogsService = async (retentionDays = 90): Promise<number> => {
  try {
    // Đọc cấu hình số ngày lưu log từ System_Configs (nếu có), mặc định 90 ngày
    const config = await prisma.system_Configs.findUnique({
      where: { config_key: 'AUDIT_LOG_RETENTION_DAYS' },
    });
    const days = config ? Math.max(7, Number(config.config_value) || retentionDays) : retentionDays;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await prisma.audit_Logs.deleteMany({
      where: {
        created_at: {
          lt: cutoffDate,
        },
      },
    });

    if (result.count > 0) {
      console.log(`[Auto-Cleanup] Đã tự động dọn dẹp ${result.count} bản ghi Audit_Logs cũ hơn ${days} ngày.`);
    }
    return result.count;
  } catch (error) {
    console.error('[Auto-Cleanup] Lỗi khi dọn dẹp Audit_Logs:', error);
    return 0;
  }
};
