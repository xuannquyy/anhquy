import prisma from "../config/prisma";
import { parseDateRange } from "../validators/sqa.validator";
import { runSqaDiagnostics } from "./sqa-diagnostics.service";

/**
 * 1. GET /api/sqa/overview
 * Tổng quan trạng thái SQA và 4 KPI điều hành chính
 */
export const getSqaOverviewService = async (params: { from?: unknown; to?: unknown; period?: unknown }) => {
  const { startDate, endDate, fromStr, toStr } = parseDateRange(params.from, params.to, params.period);
  const now = new Date();

  // 1.1. Thống kê Documents trong kỳ (xét cả last_analyzed_at, analysis_completed_at và uploaded_at)
  const [analyzedDocs, errorDocs, analyzingDocs, uploadedDocs] = await Promise.all([
    prisma.documents.count({
      where: {
        status: "Analyzed",
        OR: [
          { last_analyzed_at: { gte: startDate, lte: endDate } },
          { analysis_completed_at: { gte: startDate, lte: endDate } },
          { uploaded_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
    prisma.documents.count({
      where: {
        status: "Error",
        OR: [
          { analysis_completed_at: { gte: startDate, lte: endDate } },
          { updated_at: { gte: startDate, lte: endDate } },
          { uploaded_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
    prisma.documents.count({ where: { status: "Analyzing" } }),
    prisma.documents.count({ where: { status: "Uploaded", uploaded_at: { gte: startDate, lte: endDate } } }),
  ]);

  const eligibleAttempts = analyzedDocs + errorDocs;
  const analysisSuccessRate = eligibleAttempts > 0 ? Number(((analyzedDocs / eligibleAttempts) * 100).toFixed(1)) : null;
  const failureRate = eligibleAttempts > 0 ? Number(((errorDocs / eligibleAttempts) * 100).toFixed(1)) : null;

  // 1.2. Thống kê Violations trong kỳ
  const [approvedCount, rejectedCount, pendingCount, pendingHighCount] = await Promise.all([
    prisma.violations.count({
      where: {
        status: "Approved",
        OR: [
          { reviewed_at: { gte: startDate, lte: endDate } },
          { updated_at: { gte: startDate, lte: endDate } },
          { created_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
    prisma.violations.count({
      where: {
        status: "Rejected",
        OR: [
          { reviewed_at: { gte: startDate, lte: endDate } },
          { updated_at: { gte: startDate, lte: endDate } },
          { created_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
    prisma.violations.count({ where: { status: "Pending", created_at: { gte: startDate, lte: endDate } } }),
    prisma.violations.count({ where: { status: "Pending", risk_level: "High", created_at: { gte: startDate, lte: endDate } } }),
  ]);

  const totalResolved = approvedCount + rejectedCount;
  const totalFindings = totalResolved + pendingCount;
  const humanConfirmationRate = totalResolved > 0 ? Number(((approvedCount / totalResolved) * 100).toFixed(1)) : null;
  const humanReviewCoverage = totalFindings > 0 ? Number(((totalResolved / totalFindings) * 100).toFixed(1)) : null;
  const rejectionRate = totalResolved > 0 ? Number(((rejectedCount / totalResolved) * 100).toFixed(1)) : null;

  // 1.3. Evidence Coverage (Độ đầy đủ của bằng chứng)
  // Lấy các violations trong kỳ có evidence_quote không rỗng và standard_id không null
  const violationsInPeriod = await prisma.violations.findMany({
    where: {
      OR: [
        { reviewed_at: { gte: startDate, lte: endDate } },
        { created_at: { gte: startDate, lte: endDate } },
      ],
    },
    select: { evidence_quote: true, standard_id: true },
  });

  let validEvidenceCount = 0;
  for (const v of violationsInPeriod) {
    if (v.evidence_quote && v.evidence_quote.trim().length > 0 && v.standard_id !== null) {
      validEvidenceCount++;
    }
  }

  const evidenceCoverage = totalFindings > 0 ? Number(((validEvidenceCount / totalFindings) * 100).toFixed(1)) : null;

  // 1.4. Phát hiện Stuck Documents (> 15 phút đang Analyzing)
  const stuckTimeoutDate = new Date(now.getTime() - 15 * 60 * 1000);
  const stuckDocsCount = await prisma.documents.count({
    where: {
      status: "Analyzing",
      analysis_started_at: { lt: stuckTimeoutDate },
    },
  });

  // 1.5. Nhà cung ứng nguy hiểm
  const dangerSuppliersCount = await prisma.suppliers.count({
    where: {
      is_deleted: false,
      risk_score: { lt: 50 },
    },
  });

  // 1.6. Chạy Diagnostic Engine
  const { overallStatus, items: diagnosticItems } = await runSqaDiagnostics({
    failureRate,
    totalEligibleDocs: eligibleAttempts,
    errorDocsCount: errorDocs,
    humanReviewCoverage,
    totalFindings,
    pendingHighCount,
    rejectionRate,
    resolvedFindingsCount: totalResolved,
    stuckDocsCount,
    missingEvidenceCount: Math.max(0, totalFindings - validEvidenceCount),
    dangerSuppliersCount,
  });

  // Xác định trạng thái từng KPI
  const getConfirmationStatus = (val: number | null, sample: number) => {
    if (sample === 0 || val === null) return "NO_DATA";
    if (sample < 20) return "INSUFFICIENT_DATA";
    if (val >= 80.0) return "HEALTHY";
    if (val >= 60.0) return "WARNING";
    return "CRITICAL";
  };

  const getFailureRateStatus = (rate: number | null, count: number, sample: number) => {
    if (sample === 0) return "NO_DATA";
    if (count === 0) return "HEALTHY";
    if (sample < 20) return "INSUFFICIENT_DATA";
    if (rate !== null && rate > 5.0) return "CRITICAL";
    if (rate !== null && rate > 2.0) return "WARNING";
    return "HEALTHY";
  };

  const getPendingStatus = (cnt: number, high: number) => {
    if (high > 0) return "CRITICAL";
    if (cnt > 15) return "WARNING";
    return "HEALTHY";
  };

  const getEvidenceStatus = (val: number | null, sample: number) => {
    if (sample === 0 || val === null) return "NO_DATA";
    if (sample < 20) return "INSUFFICIENT_DATA";
    if (val >= 95.0) return "HEALTHY";
    if (val >= 85.0) return "WARNING";
    return "CRITICAL";
  };

  const getSuccessRateStatus = (val: number | null, sample: number) => {
    if (sample === 0 || val === null) return "NO_DATA";
    if (sample < 20) return "INSUFFICIENT_DATA";
    if (val >= 95.0) return "HEALTHY";
    if (val >= 90.0) return "WARNING";
    return "CRITICAL";
  };

  const getCoverageStatus = (val: number | null, sample: number) => {
    if (sample === 0 || val === null) return "NO_DATA";
    if (sample < 20) return "INSUFFICIENT_DATA";
    if (val >= 80.0) return "HEALTHY";
    if (val >= 60.0) return "WARNING";
    return "CRITICAL";
  };

  return {
    generatedAt: now.toISOString(),
    period: { from: fromStr, to: toStr },
    overallStatus,
    metrics: {
      humanConfirmationRate: {
        value: humanConfirmationRate,
        numerator: approvedCount,
        denominator: totalResolved,
        sampleSize: totalResolved,
        minimumRequired: 20,
        status: getConfirmationStatus(humanConfirmationRate, totalResolved),
        description: "Tỷ lệ cảnh báo AI được Auditor xác nhận = Approved / (Approved + Rejected).",
      },
      analysisFailureRate: {
        value: failureRate,
        numerator: errorDocs,
        denominator: eligibleAttempts,
        sampleSize: eligibleAttempts,
        minimumRequired: 20,
        analyzingCount: analyzingDocs,
        status: getFailureRateStatus(failureRate, errorDocs, eligibleAttempts),
        description: "Tỷ lệ hợp đồng gặp sự cố lỗi phân tích trên tổng số lượt xử lý đủ điều kiện.",
      },
      analysisSuccessRate: {
        value: analysisSuccessRate,
        numerator: analyzedDocs,
        denominator: eligibleAttempts,
        sampleSize: eligibleAttempts,
        minimumRequired: 20,
        status: getSuccessRateStatus(analysisSuccessRate, eligibleAttempts),
        description: "Tỷ lệ hợp đồng được AI phân tích thành công = Analyzed / (Analyzed + Error).",
      },
      analysisFailureCount: {
        value: errorDocs,
        analyzingCount: analyzingDocs,
        status: errorDocs === 0 ? "HEALTHY" : errorDocs <= 2 ? "WARNING" : "CRITICAL",
        description: "Số lượng hợp đồng gặp lỗi phân tích trong khoảng thời gian đã chọn.",
      },
      pendingFindings: {
        value: pendingCount,
        highCount: pendingHighCount,
        status: getPendingStatus(pendingCount, pendingHighCount),
        description: "Tổng số phát hiện vi phạm AI đang chờ thẩm định (phê duyệt hoặc bác bỏ).",
      },
      humanReviewCoverage: {
        value: humanReviewCoverage,
        numerator: totalResolved,
        denominator: totalFindings,
        sampleSize: totalFindings,
        minimumRequired: 20,
        status: getCoverageStatus(humanReviewCoverage, totalFindings),
        description: "Tỷ lệ kết quả AI đã được con người đánh giá (Approved + Rejected) trên tổng số phát hiện.",
      },
      evidenceCoverage: {
        value: evidenceCoverage,
        numerator: validEvidenceCount,
        denominator: totalFindings,
        sampleSize: totalFindings,
        minimumRequired: 20,
        status: getEvidenceStatus(evidenceCoverage, totalFindings),
        description: "Tỷ lệ phát hiện có trích dẫn điều khoản hợp đồng và số trang đầy đủ.",
      },
    },
    topDiagnoses: diagnosticItems.slice(0, 3),
  };
};

/**
 * 2. GET /api/sqa/ai-quality
 * Thống kê chất lượng phân tích AI và xác minh của con người
 */
export const getSqaAiQualityService = async (params: { from?: unknown; to?: unknown; period?: unknown }) => {
  const { startDate, endDate, fromStr, toStr } = parseDateRange(params.from, params.to, params.period);

  const [approvedCount, rejectedCount, pendingCount, violations] = await Promise.all([
    prisma.violations.count({
      where: {
        status: "Approved",
        OR: [
          { reviewed_at: { gte: startDate, lte: endDate } },
          { updated_at: { gte: startDate, lte: endDate } },
          { created_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
    prisma.violations.count({
      where: {
        status: "Rejected",
        OR: [
          { reviewed_at: { gte: startDate, lte: endDate } },
          { updated_at: { gte: startDate, lte: endDate } },
          { created_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
    prisma.violations.count({ where: { status: "Pending", created_at: { gte: startDate, lte: endDate } } }),
    prisma.violations.findMany({
      where: {
        OR: [
          { reviewed_at: { gte: startDate, lte: endDate } },
          { created_at: { gte: startDate, lte: endDate } },
        ],
      },
      select: { risk_level: true, status: true, evidence_quote: true, page_number: true, standard_id: true },
    }),
  ]);

  const totalResolved = approvedCount + rejectedCount;
  const totalFindings = totalResolved + pendingCount;

  // Tính các tỷ lệ theo định nghĩa chuẩn B2B SQA
  const humanConfirmationRate = totalResolved > 0 ? Number(((approvedCount / totalResolved) * 100).toFixed(1)) : null;
  const rejectionRate = totalResolved > 0 ? Number(((rejectedCount / totalResolved) * 100).toFixed(1)) : null;
  const humanReviewCoverage = totalFindings > 0 ? Number(((totalResolved / totalFindings) * 100).toFixed(1)) : null;

  // Evidence Completeness
  let validEvidenceCount = 0;
  for (const v of violations) {
    if (v.evidence_quote && v.evidence_quote.trim().length > 0 && v.standard_id !== null) {
      validEvidenceCount++;
    }
  }
  const evidenceCompleteness = totalFindings > 0 ? Number(((validEvidenceCount / totalFindings) * 100).toFixed(1)) : null;

  // Phân bổ theo Risk Level
  const findingsByRisk = {
    High: { pending: 0, approved: 0, rejected: 0 },
    Medium: { pending: 0, approved: 0, rejected: 0 },
    Low: { pending: 0, approved: 0, rejected: 0 },
  };

  for (const v of violations) {
    const r = v.risk_level as "High" | "Medium" | "Low";
    if (findingsByRisk[r]) {
      if (v.status === "Approved") findingsByRisk[r].approved++;
      else if (v.status === "Rejected") findingsByRisk[r].rejected++;
      else if (v.status === "Pending") findingsByRisk[r].pending++;
    }
  }

  const isSufficientSample = totalResolved >= 20;

  return {
    period: { from: fromStr, to: toStr },
    sampleSizes: {
      totalFindings,
      totalResolved,
      minimumRequired: 20,
      isSufficient: isSufficientSample,
    },
    approvedCount,
    rejectedCount,
    pendingCount,
    humanConfirmationRate,
    rejectionRate,
    humanReviewCoverage,
    evidenceCompleteness,
    validEvidenceCount,
    missingEvidenceCount: Math.max(0, totalFindings - validEvidenceCount),
    findingsByRisk,
    dataQualityStatus: totalFindings === 0 ? "NO_DATA" : isSufficientSample ? "SUFFICIENT" : "INSUFFICIENT_DATA",
    notes: {
      humanConfirmationRate: "Tỷ lệ cảnh báo được Auditor xác nhận = Approved / (Approved + Rejected). Đây là tỷ lệ xác nhận của con người, không phải độ chính xác thực tế (Model Accuracy) do chưa có Ground Truth.",
      rejectionRate: "Tỷ lệ cảnh báo bị Auditor bác bỏ = Rejected / (Approved + Rejected). Không phải False Positive Rate (FPR) vì chưa có tập gán nhãn độc lập.",
      evidenceCompleteness: "Tỷ lệ phát hiện có đầy đủ chuỗi bằng chứng hợp đồng và tiêu chuẩn liên kết.",
    },
  };
};

/**
 * 3. GET /api/sqa/document-health
 * Tình trạng xử lý tài liệu, lỗi và thời gian phân tích
 */
export const getSqaDocumentHealthService = async (params: {
  from?: unknown;
  to?: unknown;
  period?: unknown;
  page?: unknown;
  limit?: unknown;
}) => {
  const { startDate, endDate, fromStr, toStr } = parseDateRange(params.from, params.to, params.period);
  const page = Math.max(1, parseInt(String(params.page || 1), 10) || 1);
  const limit = Math.min(100, Math.max(5, parseInt(String(params.limit || 10), 10) || 10));
  const skip = (page - 1) * limit;

  const now = new Date();
  const stuckTimeoutDate = new Date(now.getTime() - 15 * 60 * 1000);

  // Thống kê Documents
  const [totalDocuments, analyzedCount, errorCount, analyzingCount, uploadedCount, stuckCount] = await Promise.all([
    prisma.documents.count({
      where: {
        OR: [
          { uploaded_at: { gte: startDate, lte: endDate } },
          { last_analyzed_at: { gte: startDate, lte: endDate } },
          { analysis_completed_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
    prisma.documents.count({
      where: {
        status: "Analyzed",
        OR: [
          { last_analyzed_at: { gte: startDate, lte: endDate } },
          { analysis_completed_at: { gte: startDate, lte: endDate } },
          { uploaded_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
    prisma.documents.count({
      where: {
        status: "Error",
        OR: [
          { analysis_completed_at: { gte: startDate, lte: endDate } },
          { updated_at: { gte: startDate, lte: endDate } },
          { uploaded_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
    prisma.documents.count({ where: { status: "Analyzing" } }),
    prisma.documents.count({ where: { status: "Uploaded", uploaded_at: { gte: startDate, lte: endDate } } }),
    prisma.documents.count({ where: { status: "Analyzing", analysis_started_at: { lt: stuckTimeoutDate } } }),
  ]);

  const eligibleAttempts = analyzedCount + errorCount;
  const successRate = eligibleAttempts > 0 ? Number(((analyzedCount / eligibleAttempts) * 100).toFixed(1)) : null;
  const failureRate = eligibleAttempts > 0 ? Number(((errorCount / eligibleAttempts) * 100).toFixed(1)) : null;

  // Thống kê thời gian và tokens từ AI_Analysis_Logs
  const successLogs = await prisma.aI_Analysis_Logs.findMany({
    where: {
      status: "Success",
      started_at: { gte: startDate, lte: endDate },
      duration_ms: { not: null },
    },
    select: { duration_ms: true, input_tokens: true, output_tokens: true, total_tokens: true },
    orderBy: { duration_ms: "asc" },
  });

  let averageDurationMs: number | null = null;
  let p50DurationMs: number | null = null;
  let p95DurationMs: number | null = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;

  if (successLogs.length > 0) {
    const durations = successLogs.map((l) => l.duration_ms!).filter((d) => d > 0);
    if (durations.length > 0) {
      const sum = durations.reduce((acc, v) => acc + v, 0);
      averageDurationMs = Math.round(sum / durations.length);
      p50DurationMs = durations[Math.floor(durations.length * 0.5)] || averageDurationMs;
      p95DurationMs = durations[Math.floor(durations.length * 0.95)] || durations[durations.length - 1];
    }

    for (const l of successLogs) {
      totalInputTokens += l.input_tokens || 0;
      totalOutputTokens += l.output_tokens || 0;
      totalTokens += l.total_tokens || 0;
    }
  }

  // Phân loại nhóm lỗi từ Documents & AI_Analysis_Logs
  const errorLogs = await prisma.aI_Analysis_Logs.findMany({
    where: {
      status: "Failed",
      started_at: { gte: startDate, lte: endDate },
    },
    select: { error_code: true },
  });

  const errorBreakdown: Record<string, number> = {
    PDF_EXTRACTION_ERROR: 0,
    RAG_RETRIEVAL_ERROR: 0,
    GEMINI_AUTH_ERROR: 0,
    GEMINI_QUOTA_ERROR: 0,
    GEMINI_TIMEOUT: 0,
    GEMINI_RESPONSE_ERROR: 0,
    DATABASE_ERROR: 0,
    UNKNOWN_ERROR: 0,
  };

  for (const log of errorLogs) {
    const code = log.error_code || "UNKNOWN_ERROR";
    errorBreakdown[code] = (errorBreakdown[code] || 0) + 1;
  }

  // Lấy danh sách hợp đồng bị lỗi (phân trang)
  const [failedDocs, totalFailedDocs] = await Promise.all([
    prisma.documents.findMany({
      where: {
        status: "Error",
        OR: [
          { analysis_completed_at: { gte: startDate, lte: endDate } },
          { updated_at: { gte: startDate, lte: endDate } },
          { uploaded_at: { gte: startDate, lte: endDate } },
        ],
      },
      include: {
        Suppliers: { select: { id: true, company_name: true, tax_code: true } },
      },
      orderBy: { updated_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.documents.count({
      where: {
        status: "Error",
        OR: [
          { analysis_completed_at: { gte: startDate, lte: endDate } },
          { updated_at: { gte: startDate, lte: endDate } },
          { uploaded_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
  ]);

  return {
    period: { from: fromStr, to: toStr },
    summary: {
      totalDocuments,
      analyzedCount,
      errorCount,
      analyzingCount,
      uploadedCount,
      eligibleAttempts,
      successRate,
      failureRate,
      stuckCount,
    },
    performance: {
      sampleCount: successLogs.length,
      averageDurationMs,
      p50DurationMs,
      p95DurationMs,
      tokens: {
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
      },
    },
    errorBreakdown,
    failedDocuments: {
      items: failedDocs.map((d) => ({
        id: d.id,
        fileName: d.file_name,
        supplierName: d.Suppliers?.company_name || "—",
        supplierCode: d.Suppliers?.tax_code || "—",
        lastErrorCode: d.last_error_code || "UNKNOWN_ERROR",
        lastErrorMessage: d.last_error_message || "Đã xảy ra lỗi trong quá trình quét.",
        updatedAt: d.updated_at?.toISOString() || null,
        status: d.status,
      })),
      pagination: {
        page,
        limit,
        total: totalFailedDocs,
        totalPages: Math.ceil(totalFailedDocs / limit) || 1,
      },
    },
  };
};

/**
 * 4. GET /api/sqa/supplier-risk
 * Trí tuệ rủi ro chuỗi cung ứng dựa trên điểm tín nhiệm thực tế
 */
export const getSqaSupplierRiskService = async (params: { from?: unknown; to?: unknown; period?: unknown }) => {
  const { startDate, endDate, fromStr, toStr } = parseDateRange(params.from, params.to, params.period);

  // 4.1. Phân bố điểm tín nhiệm nhà cung ứng (chỉ tính is_deleted = false)
  const activeSuppliers = await prisma.suppliers.findMany({
    where: { is_deleted: false },
    select: { id: true, company_name: true, tax_code: true, risk_score: true },
  });

  const totalActiveSuppliers = activeSuppliers.length;
  let safeCount = 0;
  let warningCount = 0;
  let dangerCount = 0;
  let unscoredCount = 0;

  for (const s of activeSuppliers) {
    if (s.risk_score === null) {
      unscoredCount++;
    } else if (s.risk_score >= 80) {
      safeCount++;
    } else if (s.risk_score >= 50) {
      warningCount++;
    } else {
      dangerCount++;
    }
  }

  const supplierRiskDistribution = {
    safePercentage: totalActiveSuppliers > 0 ? Number(((safeCount / totalActiveSuppliers) * 100).toFixed(1)) : 0,
    warningPercentage: totalActiveSuppliers > 0 ? Number(((warningCount / totalActiveSuppliers) * 100).toFixed(1)) : 0,
    dangerPercentage: totalActiveSuppliers > 0 ? Number(((dangerCount / totalActiveSuppliers) * 100).toFixed(1)) : 0,
    unscoredPercentage: totalActiveSuppliers > 0 ? Number(((unscoredCount / totalActiveSuppliers) * 100).toFixed(1)) : 0,
  };

  // 4.2. Vi phạm mức High đã được duyệt (Approved) trong kỳ
  const approvedHighRiskViolationCount = await prisma.violations.count({
    where: {
      status: "Approved",
      risk_level: "High",
      OR: [
        { reviewed_at: { gte: startDate, lte: endDate } },
        { updated_at: { gte: startDate, lte: endDate } },
        { created_at: { gte: startDate, lte: endDate } },
      ],
    },
  });

  // 4.3. Top 5 nhà cung ứng rủi ro cao nhất (risk_score thấp nhất)
  const dangerSorted = [...activeSuppliers]
    .filter((s) => s.risk_score !== null)
    .sort((a, b) => (a.risk_score ?? 100) - (b.risk_score ?? 100))
    .slice(0, 5);

  const topRiskSuppliers = await Promise.all(
    dangerSorted.map(async (sup) => {
      const highApproved = await prisma.violations.count({
        where: {
          Documents: { supplier_id: sup.id },
          status: "Approved",
          risk_level: "High",
        },
      });
      return {
        id: sup.id,
        supplierCode: sup.tax_code,
        name: sup.company_name,
        riskScore: sup.risk_score,
        approvedHighCount: highApproved,
        riskLevel: (sup.risk_score ?? 100) < 50 ? "Danger" : (sup.risk_score ?? 100) < 80 ? "Warning" : "Safe",
      };
    })
  );

  // 4.4. Thống kê rủi ro theo 4 Nhóm Tiêu chuẩn (Standard_Groups)
  const standardGroups = await prisma.standard_Groups.findMany({
    select: {
      id: true,
      group_code: true,
      group_name: true,
      Standards: {
        select: {
          id: true,
        },
      },
    },
  });

  const riskByStandardGroup = await Promise.all(
    standardGroups.map(async (g) => {
      const stdIds = g.Standards.map((s) => s.id);
      const [pending, approved, rejected] = await Promise.all([
        prisma.violations.count({
          where: {
            standard_id: { in: stdIds },
            status: "Pending",
            created_at: { gte: startDate, lte: endDate },
          },
        }),
        prisma.violations.count({
          where: {
            standard_id: { in: stdIds },
            status: "Approved",
            OR: [
              { reviewed_at: { gte: startDate, lte: endDate } },
              { updated_at: { gte: startDate, lte: endDate } },
              { created_at: { gte: startDate, lte: endDate } },
            ],
          },
        }),
        prisma.violations.count({
          where: {
            standard_id: { in: stdIds },
            status: "Rejected",
            OR: [
              { reviewed_at: { gte: startDate, lte: endDate } },
              { updated_at: { gte: startDate, lte: endDate } },
              { created_at: { gte: startDate, lte: endDate } },
            ],
          },
        }),
      ]);

      const totalGroupResolved = approved + rejected;
      const totalGroupFindings = totalGroupResolved + pending;
      const confirmationRate = totalGroupResolved > 0 ? Number(((approved / totalGroupResolved) * 100).toFixed(1)) : null;

      return {
        groupId: g.id,
        groupCode: g.group_code,
        groupName: g.group_name,
        totalFindings: totalGroupFindings,
        pendingCount: pending,
        approvedCount: approved,
        rejectedCount: rejected,
        confirmationRate,
      };
    })
  );

  return {
    period: { from: fromStr, to: toStr },
    totalActiveSuppliers,
    safeCount,
    warningCount,
    dangerCount,
    unscoredCount,
    supplierRiskDistribution,
    approvedHighRiskViolationCount,
    topRiskSuppliers,
    riskByStandardGroup,
  };
};

/**
 * 5. GET /api/sqa/diagnostics
 * Danh sách chẩn đoán và hành động đề xuất
 */
export const getSqaDiagnosticsService = async (params: {
  from?: unknown;
  to?: unknown;
  period?: unknown;
  severity?: unknown;
}) => {
  const { startDate, endDate, fromStr, toStr } = parseDateRange(params.from, params.to, params.period);
  const now = new Date();

  const [analyzedDocs, errorDocs, pendingCount, pendingHighCount, approvedCount, rejectedCount] = await Promise.all([
    prisma.documents.count({
      where: {
        status: "Analyzed",
        OR: [
          { last_analyzed_at: { gte: startDate, lte: endDate } },
          { analysis_completed_at: { gte: startDate, lte: endDate } },
          { uploaded_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
    prisma.documents.count({
      where: {
        status: "Error",
        OR: [
          { analysis_completed_at: { gte: startDate, lte: endDate } },
          { updated_at: { gte: startDate, lte: endDate } },
          { uploaded_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
    prisma.violations.count({ where: { status: "Pending", created_at: { gte: startDate, lte: endDate } } }),
    prisma.violations.count({ where: { status: "Pending", risk_level: "High", created_at: { gte: startDate, lte: endDate } } }),
    prisma.violations.count({
      where: {
        status: "Approved",
        OR: [
          { reviewed_at: { gte: startDate, lte: endDate } },
          { updated_at: { gte: startDate, lte: endDate } },
          { created_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
    prisma.violations.count({
      where: {
        status: "Rejected",
        OR: [
          { reviewed_at: { gte: startDate, lte: endDate } },
          { updated_at: { gte: startDate, lte: endDate } },
          { created_at: { gte: startDate, lte: endDate } },
        ],
      },
    }),
  ]);

  const eligibleAttempts = analyzedDocs + errorDocs;
  const failureRate = eligibleAttempts > 0 ? Number(((errorDocs / eligibleAttempts) * 100).toFixed(1)) : null;
  const totalResolved = approvedCount + rejectedCount;
  const totalFindings = totalResolved + pendingCount;
  const humanReviewCoverage = totalFindings > 0 ? Number(((totalResolved / totalFindings) * 100).toFixed(1)) : null;
  const rejectionRate = totalResolved > 0 ? Number(((rejectedCount / totalResolved) * 100).toFixed(1)) : null;

  const stuckTimeoutDate = new Date(now.getTime() - 15 * 60 * 1000);
  const [stuckDocsCount, missingEvidenceCount, dangerSuppliersCount] = await Promise.all([
    prisma.documents.count({ where: { status: "Analyzing", analysis_started_at: { lt: stuckTimeoutDate } } }),
    prisma.violations.count({
      where: {
        OR: [
          { reviewed_at: { gte: startDate, lte: endDate } },
          { created_at: { gte: startDate, lte: endDate } },
        ],
        AND: [
          {
            OR: [{ evidence_quote: "" }, { standard_id: null }],
          },
        ],
      },
    }),
    prisma.suppliers.count({ where: { is_deleted: false, risk_score: { lt: 50 } } }),
  ]);

  const { overallStatus, items } = await runSqaDiagnostics({
    failureRate,
    totalEligibleDocs: eligibleAttempts,
    errorDocsCount: errorDocs,
    humanReviewCoverage,
    totalFindings,
    pendingHighCount,
    rejectionRate,
    resolvedFindingsCount: totalResolved,
    stuckDocsCount,
    missingEvidenceCount,
    dangerSuppliersCount,
  });

  let filteredItems = items;
  if (typeof params.severity === "string" && params.severity.trim()) {
    const s = params.severity.trim().toUpperCase();
    filteredItems = items.filter((i) => i.severity === s);
  }

  return {
    generatedAt: now.toISOString(),
    period: { from: fromStr, to: toStr },
    overallStatus,
    totalIssues: items.length,
    criticalCount: items.filter((i) => i.severity === "CRITICAL").length,
    warningCount: items.filter((i) => i.severity === "WARNING").length,
    items: filteredItems,
  };
};

/**
 * 6. GET /api/sqa/analysis-logs
 * Nhật ký phân tích AI chi tiết từng lần chạy
 */
export const getSqaAnalysisLogsService = async (params: {
  document_id?: unknown;
  status?: unknown;
  from?: unknown;
  to?: unknown;
  period?: unknown;
  page?: unknown;
  limit?: unknown;
}) => {
  const { startDate, endDate } = parseDateRange(params.from, params.to, params.period);
  const page = Math.max(1, parseInt(String(params.page || 1), 10) || 1);
  const limit = Math.min(100, Math.max(5, parseInt(String(params.limit || 20), 10) || 20));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    started_at: { gte: startDate, lte: endDate },
  };

  if (params.document_id) {
    const docId = parseInt(String(params.document_id), 10);
    if (!isNaN(docId)) where.document_id = docId;
  }

  if (typeof params.status === "string" && params.status.trim()) {
    where.status = params.status.trim();
  }

  const [items, total] = await Promise.all([
    prisma.aI_Analysis_Logs.findMany({
      where,
      include: {
        Documents: {
          select: {
            id: true,
            file_name: true,
            Suppliers: { select: { id: true, company_name: true, tax_code: true } },
          },
        },
      },
      orderBy: { started_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.aI_Analysis_Logs.count({ where }),
  ]);

  return {
    items: items.map((l) => ({
      id: l.id,
      documentId: l.document_id,
      fileName: l.Documents?.file_name || "—",
      supplierName: l.Documents?.Suppliers?.company_name || "—",
      modelName: l.model_name,
      promptVersion: l.prompt_version || "1.0",
      status: l.status,
      startedAt: l.started_at.toISOString(),
      completedAt: l.completed_at ? l.completed_at.toISOString() : null,
      durationMs: l.duration_ms,
      inputTokens: l.input_tokens,
      outputTokens: l.output_tokens,
      totalTokens: l.total_tokens,
      errorCode: l.error_code,
      errorMessage: l.error_message,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};
