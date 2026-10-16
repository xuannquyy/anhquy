import { Router } from "express";
import { login, getMe, changePassword } from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router = Router();

/**
 * POST /api/auth/login
 * Public — không cần token.
 * Body: { email: string, password: string }
 */
router.post("/login", login);

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

export default router;

