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

/** Hệ số trừ điểm theo risk_level — đọc từ System_Configs hoặc dùng mặc định */
const DEFAULT_DEDUCTIONS: Record<string, number> = {
  High: 10,
  Medium: 5,
  Low: 2,
};

/**
 * Đọc hệ số trừ điểm từ bảng System_Configs.
 * Các key: "SCORE_DEDUCT_HIGH", "SCORE_DEDUCT_MEDIUM", "SCORE_DEDUCT_LOW".
 * Nếu không tồn tại thì dùng giá trị mặc định.
 */
const getDeductionConfig = async (): Promise<Record<string, number>> => {
  const configs = await prisma.system_Configs.findMany({
    where: {
      config_key: { in: ["PENALTY_HIGH_RISK", "PENALTY_MEDIUM_RISK", "PENALTY_LOW_RISK"] },
    },
    select: { config_key: true, config_value: true },
  });

  const map: Record<string, number> = { ...DEFAULT_DEDUCTIONS };
  for (const c of configs) {
    const val = parseFloat(c.config_value);
    if (!isNaN(val)) {
      if (c.config_key === "PENALTY_HIGH_RISK") map["High"] = val;
      if (c.config_key === "PENALTY_MEDIUM_RISK") map["Medium"] = val;
      if (c.config_key === "PENALTY_LOW_RISK") map["Low"] = val;
    }
  }
  return map;
};

/**
 * Tính lại risk_score cho một supplier dựa trên tất cả Violations Approved.
 * Công thức: Score = 100 - Σ(deduction per approved violation). Min = 0.
 */
const recalculateRiskScore = async (
  supplierId: number,
  deductions: Record<string, number>,
  tx: Prisma.TransactionClient
): Promise<number> => {
  // Lấy tất cả violations đã Approved thuộc mọi documents của supplier này
  const approvedViolations = await tx.violations.findMany({
    where: {
      status: "Approved",
      Documents: { supplier_id: supplierId },
    },
    select: { risk_level: true },
  });

  let score = 100;
  for (const v of approvedViolations) {
    score -= deductions[v.risk_level] ?? 0;
  }

  return Math.max(0, score);
};

// ─── Lấy danh sách Violations để Manager thẩm định ───────────────────────────

export interface ViolationFilter {
  document_id?: number;
  supplier_id?: number;
  status?: string;
  risk_level?: string;
  page?: number;
  limit?: number;
}

export const getViolationsService = async (filter: ViolationFilter) => {
  const { document_id, supplier_id, status, risk_level, page = 1, limit = 20 } = filter;
  const skip = (page - 1) * limit;

  const where: Prisma.ViolationsWhereInput = {};
  if (document_id !== undefined) where.document_id = document_id;
  if (status) where.status = status;
  if (risk_level) where.risk_level = risk_level;

  // Lọc theo supplier_id qua Documents (join)
  if (supplier_id !== undefined) {
    where.Documents = { supplier_id };
  }

  const [items, total] = await prisma.$transaction([
    prisma.violations.findMany({
      where,
      include: {
        Documents: {
          select: {
            id: true,
            file_name: true,
            Suppliers: { select: { id: true, company_name: true } },
          },
        },
        Standards: {
          select: {
            id: true,
            standard_code: true,
            name: true,
            jurisdiction: true,
          },
        },
        Users: { select: { id: true, full_name: true } },
      },
      orderBy: [{ status: "asc" }, { created_at: "desc" }],
      skip,
      take: limit,
    }),
    prisma.violations.count({ where }),
  ]);

  return { items, total, page, limit };
};

/**
 * Lấy 1 Violation theo ID.
 */
export const getViolationByIdService = async (id: number) => {
  const v = await prisma.violations.findUnique({
    where: { id },
    include: {
      Documents: {
        include: {
          Suppliers: { select: { id: true, company_name: true, risk_score: true } },
          Categories: { select: { id: true, name: true } },
        },
      },
      Standards: true,
      Users: { select: { id: true, full_name: true } },
    },
  });
  if (!v) throw makeError("Vi phạm không tồn tại.", 404);
  return v;
};

// ─── Manager thẩm định: Approved / Rejected ───────────────────────────────────

/**
 * Manager phê duyệt hoặc bác bỏ một Violation.
 * Nếu Approved → tính lại risk_score của Supplier.
 * Toàn bộ trong 1 prisma.$transaction.
 * Trả về { oldStatus, newStatus, oldRiskScore, newRiskScore, supplierId }.
 */
export const reviewViolationService = async (
  violationId: number,
  newStatus: "Approved" | "Rejected",
  reviewerId: number
): Promise<{
  oldStatus: string;
  newStatus: string;
  oldRiskScore: number | null;
  newRiskScore: number | null;
  supplierId: number;
  violationId: number;
}> => {
  // Lấy violation hiện tại kèm supplier
  const violation = await prisma.violations.findUnique({
    where: { id: violationId },
    include: {
      Documents: {
        select: {
          supplier_id: true,
          Suppliers: { select: { id: true, risk_score: true } },
        },
      },
    },
  });

  if (!violation) throw makeError("Vi phạm không tồn tại.", 404);
  if (violation.status !== "Pending") {
    throw makeError(
      `Vi phạm này đã được xử lý trước đó (status: ${violation.status}). Không thể thẩm định lại.`,
      409
    );
  }

  const supplierId = violation.Documents.supplier_id;
  const oldRiskScore = violation.Documents.Suppliers.risk_score;
  const oldStatus = violation.status;

  // Lấy hệ số trừ điểm từ System_Configs
  const deductions = await getDeductionConfig();

  // Thực hiện trong 1 transaction: cập nhật violation + tính lại risk_score
  const result = await prisma.$transaction(async (tx) => {
    // 1. Cập nhật trạng thái Violation
    const updatedViolation = await tx.violations.update({
      where: { id: violationId },
      data: {
        status: newStatus,
        reviewed_by: reviewerId,
        reviewed_at: new Date(),
        updated_at: new Date(),
      },
    });

    // 2. Tính lại risk_score (chỉ tính lại nếu có thay đổi trạng thái Approved)
    const newRiskScore = await recalculateRiskScore(supplierId, deductions, tx);

    // 3. Cập nhật Suppliers.risk_score
    await tx.suppliers.update({
      where: { id: supplierId },
      data: { risk_score: newRiskScore, updated_at: new Date() },
    });

    return { updatedViolation, newRiskScore };
  });

  return {
    oldStatus,
    newStatus,
    oldRiskScore,
    newRiskScore: result.newRiskScore,
    supplierId,
    violationId,
  };
};

