import { Router } from "express";
import { requireAuth, requirePermission } from "../middlewares/auth.middleware";
import {
  getOverview,
  getAiQuality,
  getDocumentHealth,
  getSupplierRisk,
  getDiagnostics,
  getAnalysisLogs,
} from "../controllers/sqa.controller";

const router = Router();

// Toàn bộ API SQA yêu cầu đăng nhập và có quyền VIEW_SQA
router.use(requireAuth);
router.use(requirePermission("VIEW_SQA"));

router.get("/overview", getOverview);
router.get("/ai-quality", getAiQuality);
router.get("/document-health", getDocumentHealth);
router.get("/supplier-risk", getSupplierRisk);
router.get("/diagnostics", getDiagnostics);
router.get("/analysis-logs", getAnalysisLogs);

export default router;

