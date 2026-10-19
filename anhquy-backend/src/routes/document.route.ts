import { Router, Request, Response, NextFunction } from "express";
import { MulterError } from "multer";
import upload from "../config/multer";
import {
  getDocuments,
  getDocumentById,
  uploadDocument,
  handleMulterError,
  deleteDocument,
} from "../controllers/document.controller";
import { requireAuth, requirePermission } from "../middlewares/auth.middleware";

const router = Router();

/**
 * Tất cả route Documents đều yêu cầu xác thực JWT.
 */
router.use(requireAuth);

/**
 * GET /api/documents
 * Query: supplier_id, category_id, status, page, limit
 */
router.get("/", requirePermission("VIEW_DOC"), getDocuments);

/**
 * GET /api/documents/:id
 */
router.get("/:id", requirePermission("VIEW_DOC"), getDocumentById);

/**
 * POST /api/documents/upload
 * multipart/form-data field "contract" chứa file PDF.
 * Body fields: supplier_id (string→number), category_id (string→number).
 *
 * Multer được gắn trực tiếp để bắt lỗi file trước controller.
 */
router.post(
  "/upload",
  requirePermission("UPLOAD_DOC"),
  (req: Request, res: Response, next: NextFunction) => {
    const multerSingle = upload.single("contract");
    multerSingle(req, res, (err: unknown) => {
      if (err instanceof MulterError || err instanceof Error) {
        handleMulterError(err, req, res);
        return;
      }
      next();
    });
  },
  uploadDocument
);

router.delete("/:id", requirePermission("DELETE_DOC"), deleteDocument);

export default router;