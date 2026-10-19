import { Request, Response } from "express";
import {
  getViolationsService,
  getViolationByIdService,
  reviewViolationService,
} from "../services/violation.service";
import prisma from "../config/prisma";

interface ServiceError extends Error {
  httpStatus?: number;
}

/**
 * GET /api/violations
 * Lấy danh sách Violations với lọc + phân trang.
 * Query: document_id, supplier_id, status, risk_level, page, limit
 */
export const getViolations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, risk_level, page, limit } = req.query;
    const document_id = req.query.document_id ? parseInt(req.query.document_id as string, 10) : undefined;
    const supplier_id = req.query.supplier_id ? parseInt(req.query.supplier_id as string, 10) : undefined;

    const result = await getViolationsService({
      document_id,
      supplier_id,
      status: status as string | undefined,
      risk_level: risk_level as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.status(200).json(result);
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * GET /api/violations/:id
 * Lấy chi tiết 1 Violation.
 */
export const getViolationById = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  try {
    const violation = await getViolationByIdService(id);
    res.status(200).json({ violation });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

/**
 * PATCH /api/violations/:id/review
 * Manager thẩm định Violation → Approved hoặc Rejected.
 * Body: { status: "Approved" | "Rejected" }
 * - Cập nhật Violation + tính lại risk_score trong 1 transaction.
 * - Ghi Audit_Log (hành động nhạy cảm: Duyệt/Bác bỏ lỗi).
 */
export const reviewViolation = async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ message: "ID không hợp lệ." }); return; }

  const { status } = req.body;

  if (!status || !["Approved", "Rejected"].includes(status)) {
    res.status(400).json({ message: "status phải là 'Approved' hoặc 'Rejected'." });
    return;
  }

  try {
    const result = await reviewViolationService(id, status as "Approved" | "Rejected", req.user!.userId);

    // Ghi Audit_Log — hành động nhạy cảm bắt buộc theo SKILL.md
    await prisma.audit_Logs.create({
      data: {
        user_id: req.user!.userId,
        action_type: status === "Approved" ? "VIOLATION_APPROVED" : "VIOLATION_REJECTED",
        target_table: "Violations",
        target_id: id,
        old_value: JSON.stringify({
          status: result.oldStatus,
          supplier_risk_score: result.oldRiskScore,
        }),
        new_value: JSON.stringify({
          status: result.newStatus,
          supplier_risk_score: result.newRiskScore,
          supplier_id: result.supplierId,
        }),
      },
    });

    res.status(200).json({
      message: `Vi phạm đã được ${status === "Approved" ? "phê duyệt" : "bác bỏ"} thành công.`,
      violation_id: result.violationId,
      new_status: result.newStatus,
      supplier_id: result.supplierId,
      supplier_risk_score: result.newRiskScore,
    });
  } catch (error) {
    const err = error as ServiceError;
    res.status(err.httpStatus ?? 500).json({ message: err.message });
  }
};

