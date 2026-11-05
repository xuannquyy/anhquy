import prisma from "../config/prisma";

export type SQASeverity = "CRITICAL" | "WARNING" | "INFO";
export type SQAOverallStatus = "HEALTHY" | "ATTENTION" | "CRITICAL" | "INSUFFICIENT_DATA";

export interface SQADiagnosticItem {
  code: string;
  severity: SQASeverity;
  title: string;
  metricValue: number | string | null;
  thresholdValue: number | string;
  diagnosis: string;
  evidence: string;
  actionLabel: string;
  actionUrl: string;
  detectedAt: string;
}

export interface DiagnosticsInput {
  failureRate: number | null;
  totalEligibleDocs: number;
  errorDocsCount: number;
  humanReviewCoverage: number | null;
  totalFindings: number;
  pendingHighCount: number;
  rejectionRate: number | null;
  resolvedFindingsCount: number;
  stuckDocsCount: number;
  missingEvidenceCount: number;
  dangerSuppliersCount: number;
}

/**
 * Đọc bảng SQA_Thresholds từ Database để lấy ngưỡng động (với fallback chuẩn an toàn)
 */
export const getSqaThresholdsMap = async (): Promise<Record<string, { warning: number; critical: number; minSample: number }>> => {
  const defaults: Record<string, { warning: number; critical: number; minSample: number }> = {
    ANALYSIS_FAILURE_RATE: { warning: 2.0, critical: 5.0, minSample: 20 },
    ANALYSIS_SUCCESS_RATE: { warning: 95.0, critical: 90.0, minSample: 20 },
    HUMAN_REVIEW_COVERAGE: { warning: 80.0, critical: 60.0, minSample: 20 },
    REJECTION_RATE: { warning: 10.0, critical: 20.0, minSample: 20 },
    EVIDENCE_COMPLETENESS: { warning: 95.0, critical: 85.0, minSample: 20 },
    STUCK_ANALYSIS_TIMEOUT_MINUTES: { warning: 10.0, critical: 15.0, minSample: 1 },
  };

  try {
    const list = await prisma.sQA_Thresholds.findMany({
      where: { is_active: true },
    });
    for (const item of list) {
      defaults[item.metric_code] = {
        warning: item.warning_value,
        critical: item.critical_value,
        minSample: item.minimum_sample_size,
      };
    }
  } catch {
    // Giữ defaults nếu có lỗi kết nối
  }

  return defaults;
};

/**
 * Chạy engine chẩn đoán SQA tuân thủ nghiêm ngặt 8 quy tắc SQA-001 -> SQA-008
 */
export const runSqaDiagnostics = async (
  input: DiagnosticsInput
): Promise<{ overallStatus: SQAOverallStatus; items: SQADiagnosticItem[] }> => {
  const thresholds = await getSqaThresholdsMap();
  const items: SQADiagnosticItem[] = [];
  const detectedAt = new Date().toISOString();

  // SQA-006: Stuck Analysis (Tài liệu Analyzing vượt quá timeout cấu hình)
  if (input.stuckDocsCount > 0) {
    items.push({
      code: "SQA-006",
      severity: "CRITICAL",
      title: "Hợp đồng bị treo trong quá trình phân tích AI",
      metricValue: input.stuckDocsCount,
      thresholdValue: 0,
      diagnosis: `Có ${input.stuckDocsCount} hợp đồng đang ở trạng thái 'Analyzing' vượt quá ngưỡng thời gian tối đa (> 15 phút).`,
      evidence: `${input.stuckDocsCount} tài liệu có analysis_started_at vượt quá timeout.`,
      actionLabel: "Kiểm tra hợp đồng đang phân tích",
      actionUrl: "/documents?status=Analyzing",
      detectedAt,
    });
  }

  // SQA-004: High-Risk Pending Findings (Phát hiện rủi ro cao chưa được xác minh)
  if (input.pendingHighCount > 0) {
    items.push({
      code: "SQA-004",
      severity: "CRITICAL",
      title: "Phát hiện vi phạm nghiêm trọng (High) chờ Auditor xác minh",
      metricValue: input.pendingHighCount,
      thresholdValue: 0,
      diagnosis: `Có ${input.pendingHighCount} cảnh báo vi phạm mức High đang chờ thẩm định, ảnh hưởng trực tiếp đến chuỗi cung ứng.`,
      evidence: `${input.pendingHighCount} bản ghi Violations có status = 'Pending' và risk_level = 'High'.`,
      actionLabel: "Ưu tiên thẩm định vi phạm High",
      actionUrl: "/violations?status=Pending&risk_level=High",
      detectedAt,
    });
  }

  // SQA-001 & SQA-002: Analysis Failure Rate
  const failTh = thresholds.ANALYSIS_FAILURE_RATE;
  if (input.failureRate !== null && input.totalEligibleDocs >= 5) {
    if (input.failureRate > failTh.critical) {
      items.push({
        code: "SQA-001",
        severity: "CRITICAL",
        title: "Tỷ lệ phân tích hợp đồng thất bại ở mức nghiêm trọng",
        metricValue: `${input.failureRate}%`,
        thresholdValue: `> ${failTh.critical}%`,
        diagnosis: `Tỷ lệ phân tích thất bại đạt ${input.failureRate}% (${input.errorDocsCount}/${input.totalEligibleDocs} hợp đồng), vượt ngưỡng nghiêm trọng.`,
        evidence: `Mẫu số: ${input.totalEligibleDocs} hợp đồng đã xử lý; Thất bại: ${input.errorDocsCount} hợp đồng mang trạng thái Error.`,
        actionLabel: "Xem danh sách hợp đồng lỗi",
        actionUrl: "/documents?status=Error",
        detectedAt,
      });
    } else if (input.failureRate > failTh.warning) {
      items.push({
        code: "SQA-002",
        severity: "WARNING",
        title: "Tỷ lệ phân tích hợp đồng thất bại cần chú ý",
        metricValue: `${input.failureRate}%`,
        thresholdValue: `> ${failTh.warning}%`,
        diagnosis: `Tỷ lệ phân tích thất bại đạt ${input.failureRate}%, nằm trong vùng cảnh báo (${failTh.warning}% - ${failTh.critical}%).`,
        evidence: `${input.errorDocsCount}/${input.totalEligibleDocs} hợp đồng gặp lỗi xử lý.`,
        actionLabel: "Kiểm tra hợp đồng phân tích lỗi",
        actionUrl: "/documents?status=Error",
        detectedAt,
      });
    }
  }

  // SQA-003: Pending Review Backlog
  const reviewTh = thresholds.HUMAN_REVIEW_COVERAGE;
  if (
    input.humanReviewCoverage !== null &&
    input.totalFindings >= 20 &&
    input.humanReviewCoverage < reviewTh.critical
  ) {
    items.push({
      code: "SQA-003",
      severity: "WARNING",
      title: "Độ bao phủ xác minh của con người còn thấp (Tồn đọng Pending)",
      metricValue: `${input.humanReviewCoverage}%`,
      thresholdValue: `< ${reviewTh.critical}%`,
      diagnosis: `Chỉ mới có ${input.humanReviewCoverage}% phát hiện được Auditor phê duyệt hoặc bác bỏ trên tổng số ${input.totalFindings} phát hiện.`,
      evidence: `Tổng findings: ${input.totalFindings}, đã giải quyết: ${input.resolvedFindingsCount}, còn Pending: ${input.totalFindings - input.resolvedFindingsCount}.`,
      actionLabel: "Mở danh sách vi phạm tồn đọng",
      actionUrl: "/violations?status=Pending",
      detectedAt,
    });
  }

  // SQA-005: High Rejection Rate
  const rejTh = thresholds.REJECTION_RATE;
  if (
    input.rejectionRate !== null &&
    input.resolvedFindingsCount >= 20 &&
    input.rejectionRate > rejTh.critical
  ) {
    items.push({
      code: "SQA-005",
      severity: "WARNING",
      title: "Tỷ lệ cảnh báo bị Auditor bác bỏ ở mức cao",
      metricValue: `${input.rejectionRate}%`,
      thresholdValue: `> ${rejTh.critical}%`,
      diagnosis: `Auditor đã bác bỏ ${input.rejectionRate}% trong số ${input.resolvedFindingsCount} kết quả đã thẩm định. Cần kiểm tra lại độ khắt khe của bộ tiêu chuẩn.`,
      evidence: `Số cảnh báo bị Rejected vượt quá ngưỡng ${rejTh.critical}%.`,
      actionLabel: "Kiểm tra danh sách tiêu chuẩn",
      actionUrl: "/standards",
      detectedAt,
    });
  }

  // SQA-007: Missing Evidence
  if (input.missingEvidenceCount > 0) {
    items.push({
      code: "SQA-007",
      severity: "WARNING",
      title: "Phát hiện cảnh báo thiếu trích dẫn bằng chứng hợp đồng",
      metricValue: input.missingEvidenceCount,
      thresholdValue: 0,
      diagnosis: `Có ${input.missingEvidenceCount} phát hiện chưa có đoạn trích bằng chứng (evidence_quote) đầy đủ hoặc thiếu số trang.`,
      evidence: `COUNT(Violations WHERE evidence_quote IS NULL OR LTRIM(RTRIM(evidence_quote)) = '') = ${input.missingEvidenceCount}.`,
      actionLabel: "Kiểm tra danh sách phát hiện",
      actionUrl: "/violations",
      detectedAt,
    });
  }

  // SQA-008: Supplier High Risk
  if (input.dangerSuppliersCount > 0) {
    items.push({
      code: "SQA-008",
      severity: "WARNING",
      title: "Có nhà cung ứng trong vùng rủi ro báo động đỏ (Điểm tín nhiệm < 50)",
      metricValue: input.dangerSuppliersCount,
      thresholdValue: 0,
      diagnosis: `Có ${input.dangerSuppliersCount} nhà cung ứng đang có điểm tín nhiệm dưới 50, cần giám sát chặt chẽ hợp đồng hợp tác.`,
      evidence: `Suppliers.risk_score < 50 và is_deleted = false.`,
      actionLabel: "Xem danh sách nhà cung ứng rủi ro",
      actionUrl: "/suppliers",
      detectedAt,
    });
  }

  // Sắp xếp thứ tự ưu tiên: CRITICAL trước, sau đó WARNING
  items.sort((a, b) => {
    const order: Record<SQASeverity, number> = { CRITICAL: 1, WARNING: 2, INFO: 3 };
    return order[a.severity] - order[b.severity];
  });

  // Xác định overallStatus
  let overallStatus: SQAOverallStatus = "HEALTHY";
  if (items.some((i) => i.severity === "CRITICAL")) {
    overallStatus = "CRITICAL";
  } else if (items.some((i) => i.severity === "WARNING")) {
    overallStatus = "ATTENTION";
  } else if (input.totalEligibleDocs === 0 && input.totalFindings === 0) {
    overallStatus = "INSUFFICIENT_DATA";
  }

  return { overallStatus, items };
};

