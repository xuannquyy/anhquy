import { Request, Response } from "express";
import { runAiScanService, getViolationsByDocumentService } from "../services/ai.service";
import prisma from "../config/prisma";

interface ServiceError extends Error {
  httpStatus?: number;
}

/**
 * POST /api/documents/:id/analyze
 * Kích hoạt AI scan cho một Document.
 * Yêu cầu: requireAuth + requirePermission("DOCUMENT_ANALYZE")
 */
export const analyzeDocument = async (req: Request, res: Response): Promise<void> => {
  const documentId = parseInt(req.params["id"] as string, 10);
  if (isNaN(documentId)) {
    res.status(400).json({ message: "ID hợp đồng không hợp lệ." });
    return;
  }

  try {
    // runAiScanService trả về ngay với { status: "Analyzing", message, documentId }
    // Pipeline AI thực sự chạy nền (fire-and-forget).
    const result = await runAiScanService(documentId, req.user!.userId);

    // Ghi Audit_Log cho hành động kích hoạt AI scan
    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: "AI_ANALYZE",
        target_table: "Documents",
        target_id: documentId,
        old_value: null,
        new_value: JSON.stringify({
          status: result.status,
          message: result.message,
          documentId: result.documentId,
        }),
      },
    });

    // HTTP 202 Accepted — báo client biết request được chấp nhận và đang xử lý nền.
    // Client cần polling GET /api/documents/:id để theo dõi khi status chuyển "Analyzed"/"Error".
    res.status(202).json({
      status: result.status,
      message: result.message,
      documentId: result.documentId,
    });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message ?? "Lỗi máy chủ khi phân tích." });
  }
};

/**
 * GET /api/documents/:id/violations
 * Lấy danh sách Violations của một Document (Split-view).
 * Yêu cầu: requireAuth + requirePermission("DOCUMENT_VIEW")
 */
export const getDocumentViolations = async (req: Request, res: Response): Promise<void> => {
  const documentId = parseInt(req.params["id"] as string, 10);
  if (isNaN(documentId)) {
    res.status(400).json({ message: "ID hợp đồng không hợp lệ." });
    return;
  }

  try {
    const violations = await getViolationsByDocumentService(documentId);
    res.status(200).json({ violations });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

