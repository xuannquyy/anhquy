import { Request, Response } from "express";
import {
  getUsersService,
  getUserByIdService,
  createUserService,
  updateUserService,
  resetUserPasswordService,
  getRolesWithPermissionsService,
  getAllPermissionsService,
  grantPermissionService,
  revokePermissionService,
  getAuditLogsService,
  getSystemConfigsService,
  updateSystemConfigService,
  getRiskThresholdsService,
  updateRiskThresholdService,
} from "../services/admin.service";
import prisma from "../config/prisma";

interface ServiceError extends Error {
  httpStatus?: number;
}

// ════════════════════════════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════════════════════════════

/** GET /api/admin/users */
export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, page, limit } = req.query;
    const role_id = req.query.role_id ? parseInt(req.query.role_id as string, 10) : undefined;
    const is_active =
      req.query.is_active === "true" ? true : req.query.is_active === "false" ? false : undefined;

    const result = await getUsersService({
      search: search as string | undefined,
      role_id,
      is_active,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/** GET /api/admin/users/:id */
export const getUserById = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  try {
    const user = await getUserByIdService(id);
    res.status(200).json({ user });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/** POST /api/admin/users — Admin tạo user mới */
export const createUser = async (req: Request, res: Response): Promise<void> => {
  const { email, password, full_name, role_id } = req.body;
  if (!email || !password || !full_name || !role_id) {
    res.status(400).json({ message: "email, password, full_name và role_id là bắt buộc." });
    return;
  }

  try {
    const user = await createUserService({
      email,
      password,
      full_name,
      role_id: parseInt(role_id, 10),
    });
    res.status(201).json({ message: "Tạo tài khoản thành công.", user });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * PUT /api/admin/users/:id
 * Sửa thông tin user (role, active, tên). Soft Delete: is_active = false.
 * Ghi Audit_Log — hành động nhạy cảm.
 */
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  // Admin không được tự vô hiệu hóa chính mình
  if (id === req.user!.userId && req.body.is_active === false) {
    res.status(400).json({ message: "Bạn không thể tự vô hiệu hóa tài khoản của chính mình." });
    return;
  }

  const { full_name, role_id, is_active } = req.body;

  try {
    const { oldValue, newValue } = await updateUserService(id, {
      full_name,
      role_id: role_id !== undefined ? parseInt(role_id, 10) : undefined,
      is_active,
    });

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "UPDATE",
        target_table: "Users",
        target_id: id,
        old_value: JSON.stringify(oldValue),
        new_value: JSON.stringify(newValue),
      },
    });

    res.status(200).json({ message: "Cập nhật tài khoản thành công." });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * POST /api/admin/users/:id/reset-password
 * Admin reset mật khẩu người dùng.
 * Body: { newPassword: string }
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  const { newPassword } = req.body;
  if (!newPassword || typeof newPassword !== "string") {
    res.status(400).json({ message: "newPassword là bắt buộc." });
    return;
  }

  try {
    await resetUserPasswordService(id, newPassword);

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "RESET_PASSWORD",
        target_table: "Users",
        target_id: id,
        old_value: null,
        new_value: null,
      },
    });

    res.status(200).json({ message: "Reset mật khẩu thành công." });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// ROLES & PERMISSIONS MATRIX
// ════════════════════════════════════════════════════════════════════════════════

/** GET /api/admin/roles — Lấy ma trận roles + permissions */
export const getRolesMatrix = async (_req: Request, res: Response): Promise<void> => {
  try {
    const roles = await getRolesWithPermissionsService();
    res.status(200).json({ roles });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/** GET /api/admin/permissions — Lấy toàn bộ permissions */
export const getAllPermissions = async (_req: Request, res: Response): Promise<void> => {
  try {
    const permissions = await getAllPermissionsService();
    res.status(200).json({ permissions });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * POST /api/admin/roles/:roleId/permissions/:permissionId
 * Gán permission cho role.
 * Ghi Audit_Log — hành động nhạy cảm (Đổi phân quyền).
 */
export const grantPermission = async (req: Request, res: Response): Promise<void> => {
  const roleId = parseInt(req.params["roleId"] as string, 10);
  const permissionId = parseInt(req.params["permissionId"] as string, 10);
  if (isNaN(roleId) || isNaN(permissionId)) {
    res.status(400).json({ message: "roleId hoặc permissionId không hợp lệ." });
    return;
  }

  try {
    const result = await grantPermissionService(roleId, permissionId);

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "GRANT_PERMISSION",
        target_table: "Role_Permissions",
        target_id: roleId,
        old_value: null,
        new_value: JSON.stringify(result),
      },
    });

    res.status(200).json({ message: "Gán quyền thành công.", data: result });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * DELETE /api/admin/roles/:roleId/permissions/:permissionId
 * Thu hồi permission khỏi role.
 * Ghi Audit_Log — hành động nhạy cảm.
 */
export const revokePermission = async (req: Request, res: Response): Promise<void> => {
  const roleId = parseInt(req.params["roleId"] as string, 10);
  const permissionId = parseInt(req.params["permissionId"] as string, 10);
  if (isNaN(roleId) || isNaN(permissionId)) {
    res.status(400).json({ message: "roleId hoặc permissionId không hợp lệ." });
    return;
  }

  try {
    await revokePermissionService(roleId, permissionId);

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "REVOKE_PERMISSION",
        target_table: "Role_Permissions",
        target_id: roleId,
        old_value: JSON.stringify({ role_id: roleId, permission_id: permissionId }),
        new_value: null,
      },
    });

    res.status(200).json({ message: "Thu hồi quyền thành công." });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ════════════════════════════════════════════════════════════════════════════════

/** GET /api/admin/audit-logs */
export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { action_type, target_table, page, limit } = req.query;
    const user_id = req.query.user_id ? parseInt(req.query.user_id as string, 10) : undefined;

    const result = await getAuditLogsService({
      user_id,
      action_type: action_type as string | undefined,
      target_table: target_table as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// SYSTEM_CONFIGS
// ════════════════════════════════════════════════════════════════════════════════

/** GET /api/admin/system-configs */
export const getSystemConfigs = async (_req: Request, res: Response): Promise<void> => {
  try {
    const configs = await getSystemConfigsService();
    res.status(200).json({ configs });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * PUT /api/admin/system-configs/:key
 * Cập nhật một System_Config theo config_key.
 * Body: { value: string }
 * Ghi Audit_Log — hành động nhạy cảm (Sửa cấu hình hệ thống).
 */
export const updateSystemConfig = async (req: Request, res: Response): Promise<void> => {
  const configKey = req.params["key"] as string;
  const { value } = req.body;

  if (!value || typeof value !== "string") {
    res.status(400).json({ message: "value là bắt buộc." });
    return;
  }

  try {
    const { id, oldValue, newValue } = await updateSystemConfigService(configKey, value);

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "UPDATE",
        target_table: "System_Configs",
        target_id: id,
        old_value: JSON.stringify(oldValue),
        new_value: JSON.stringify(newValue),
      },
    });

    res.status(200).json({ message: "Cập nhật cấu hình thành công." });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// RISK_THRESHOLDS
// ════════════════════════════════════════════════════════════════════════════════

/** GET /api/admin/risk-thresholds */
export const getRiskThresholds = async (_req: Request, res: Response): Promise<void> => {
  try {
    const thresholds = await getRiskThresholdsService();
    res.status(200).json({ thresholds });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * PUT /api/admin/risk-thresholds/:id
 * Cập nhật ngưỡng rủi ro.
 * Body: { min_score?, max_score?, color_code? }
 * Ghi Audit_Log — hành động nhạy cảm (Sửa cấu hình hệ thống).
 */
export const updateRiskThreshold = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  const { min_score, max_score, color_code } = req.body;

  try {
    const { oldValue, newValue } = await updateRiskThresholdService(id, {
      min_score: min_score !== undefined ? parseInt(min_score, 10) : undefined,
      max_score: max_score !== undefined ? parseInt(max_score, 10) : undefined,
      color_code,
    });

    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "UPDATE",
        target_table: "Risk_Thresholds",
        target_id: id,
        old_value: JSON.stringify(oldValue),
        new_value: JSON.stringify(newValue),
      },
    });

    res.status(200).json({ message: "Cập nhật ngưỡng rủi ro thành công." });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

