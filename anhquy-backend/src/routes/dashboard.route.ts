import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { getDashboardStats } from "../controllers/dashboard.controller";

const router = Router();

router.use(requireAuth);

/**
 * GET /api/dashboard/stats
 * Yêu cầu xác thực đăng nhập (bất kỳ role nào cũng xem được tổng quan)
 */
router.get("/stats", getDashboardStats);

export default router;