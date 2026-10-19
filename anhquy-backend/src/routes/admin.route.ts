import { Router } from "express";
import { requireAuth, requirePermission } from "../middlewares/auth.middleware";
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  resetPassword,
  getRolesMatrix,
  getAllPermissions,
  grantPermission,
  revokePermission,
  getAuditLogs,
  getSystemConfigs,
  updateSystemConfig,
  getRiskThresholds,
  updateRiskThreshold,
} from "../controllers/admin.controller";

const router = Router();

/**
 * Toàn bộ admin routes yêu cầu xác thực JWT.
 */
router.use(requireAuth);

// ── Users ─────────────────────────────────────────────────────────────────────

/** GET  /api/admin/users */
router.get("/users", requirePermission("MANAGE_USERS"), getUsers);

/** GET  /api/admin/users/:id */
router.get("/users/:id", requirePermission("MANAGE_USERS"), getUserById);

/** POST /api/admin/users */
router.post("/users", requirePermission("MANAGE_USERS"), createUser);

/** PUT  /api/admin/users/:id — sửa role, active, tên (Soft Delete: is_active=false) */
router.put("/users/:id", requirePermission("MANAGE_USERS"), updateUser);

/** POST /api/admin/users/:id/reset-password */
router.post("/users/:id/reset-password", requirePermission("MANAGE_USERS"), resetPassword);

// ── Roles & Permissions Matrix ────────────────────────────────────────────────

/** GET  /api/admin/roles */
router.get("/roles", requirePermission("MANAGE_ROLES"), getRolesMatrix);

/** GET  /api/admin/permissions */
router.get("/permissions", requirePermission("MANAGE_ROLES"), getAllPermissions);

/** POST   /api/admin/roles/:roleId/permissions/:permissionId — Gán quyền */
router.post("/roles/:roleId/permissions/:permissionId", requirePermission("MANAGE_ROLES"), grantPermission);

/** DELETE /api/admin/roles/:roleId/permissions/:permissionId — Thu hồi quyền */
router.delete("/roles/:roleId/permissions/:permissionId", requirePermission("MANAGE_ROLES"), revokePermission);

// ── Audit Logs ────────────────────────────────────────────────────────────────

/** GET /api/admin/audit-logs */
router.get("/audit-logs", requirePermission("VIEW_AUDIT_LOGS"), getAuditLogs);

// ── System Configs ────────────────────────────────────────────────────────────

/** GET /api/admin/system-configs */
router.get("/system-configs", requirePermission("MANAGE_SYSTEM_CONFIGS"), getSystemConfigs);

/** PUT /api/admin/system-configs/:key */
router.put("/system-configs/:key", requirePermission("MANAGE_SYSTEM_CONFIGS"), updateSystemConfig);

// ── Risk Thresholds ───────────────────────────────────────────────────────────

/** GET /api/admin/risk-thresholds */
router.get("/risk-thresholds", requirePermission("MANAGE_SYSTEM_CONFIGS"), getRiskThresholds);

/** PUT /api/admin/risk-thresholds/:id */
router.put("/risk-thresholds/:id", requirePermission("MANAGE_SYSTEM_CONFIGS"), updateRiskThreshold);

export default router;