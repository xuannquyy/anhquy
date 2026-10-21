import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";

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
// ROLES & ROLE_PERMISSIONS MATRIX
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Lấy toàn bộ Roles kèm danh sách permissions đang được gán.
 */
export const getRolesWithPermissionsService = async () => {
  return prisma.roles.findMany({
    include: {
      Role_Permissions: {
        include: {
          Permissions: { select: { id: true, permission_code: true, permission_name: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });
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
  const existing = await prisma.role_Permissions.findUnique({
    where: { role_id_permission_id: { role_id: roleId, permission_id: permissionId } },
  });
  if (!existing) throw makeError("Permission này chưa được gán cho role đó.", 404);

  await prisma.role_Permissions.delete({
    where: { role_id_permission_id: { role_id: roleId, permission_id: permissionId } },
  });
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
 * Trả { oldValue, newValue } để ghi Audit_Log.
 */
export const updateSystemConfigService = async (
  configKey: string,
  newValue: string
): Promise<{ oldValue: object; newValue: object; id: number }> => {
  const config = await prisma.system_Configs.findUnique({ where: { config_key: configKey } });
  if (!config) throw makeError(`Config key '${configKey}' không tồn tại.`, 404);

  const updated = await prisma.system_Configs.update({
    where: { config_key: configKey },
    data: { config_value: newValue.trim(), updated_at: new Date() },
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
