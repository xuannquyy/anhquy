import { Router } from "express";
import {
  login,
  refreshToken,
  logout,
  getMe,
  changePassword,
  updateProfile,
} from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router = Router();

/**
 * POST /api/auth/login
 * Public — không cần token.
 * Body: { email: string, password: string }
 */
router.post("/login", login);

/**
 * POST /api/auth/refresh-token
 * Public — dùng refresh_token để lấy access token mới khi hết hạn.
 * Body: { refresh_token: string }
 */
router.post("/refresh-token", refreshToken);

/**
 * POST /api/auth/logout
 * Protected — cần JWT hợp lệ.
 * Xóa refresh_token của user trong cơ sở dữ liệu.
 */
router.post("/logout", requireAuth, logout);

/**
 * GET /api/auth/me
 * Protected — cần JWT hợp lệ.
 * Trả thông tin cá nhân của user đang đăng nhập.
 */
router.get("/me", requireAuth, getMe);

/**
 * PUT /api/auth/change-password
 * Protected — cần JWT hợp lệ.
 * Body: { oldPassword: string, newPassword: string }
 */
router.put("/change-password", requireAuth, changePassword);

/**
 * PUT /api/auth/profile
 * Protected — cần JWT hợp lệ.
 * Body: { full_name: string }
 */
router.put("/profile", requireAuth, updateProfile);

export default router;