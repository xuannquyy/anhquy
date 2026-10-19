import prisma from "../config/prisma";

export const getDashboardStatsService = async () => {
  // 1. Thống kê Suppliers theo ngưỡng rủi ro
  const activeSuppliers = await prisma.suppliers.findMany({
    where: { is_deleted: false },
    select: { id: true, risk_score: true },
  });

  const totalSuppliers = activeSuppliers.length;
  let safeCount = 0;
  let warningCount = 0;
  let dangerCount = 0;

  for (const s of activeSuppliers) {
    const score = s.risk_score ?? 100;
    if (score >= 80) safeCount++;
    else if (score >= 50) warningCount++;
    else dangerCount++;
  }

  // 2. Thống kê Documents
  const totalDocuments = await prisma.documents.count();
  const analyzingDocuments = await prisma.documents.count({ where: { status: "Analyzing" } });
  const analyzedDocuments = await prisma.documents.count({ where: { status: "Analyzed" } });

  // 3. Thống kê Violations theo status và risk_level
  const pendingViolations = await prisma.violations.count({ where: { status: "Pending" } });
  const approvedViolations = await prisma.violations.count({ where: { status: "Approved" } });
  const rejectedViolations = await prisma.violations.count({ where: { status: "Rejected" } });

  const highRiskViolations = await prisma.violations.count({ where: { risk_level: "High" } });
  const mediumRiskViolations = await prisma.violations.count({ where: { risk_level: "Medium" } });
  const lowRiskViolations = await prisma.violations.count({ where: { risk_level: "Low" } });

  return {
    suppliers: {
      total: totalSuppliers,
      safe: safeCount,
      warning: warningCount,
      danger: dangerCount,
    },
    documents: {
      total: totalDocuments,
      analyzing: analyzingDocuments,
      analyzed: analyzedDocuments,
    },
    violations: {
      by_status: {
        pending: pendingViolations,
        approved: approvedViolations,
        rejected: rejectedViolations,
      },
      by_risk_level: {
        high: highRiskViolations,
        medium: mediumRiskViolations,
        low: lowRiskViolations,
      },
    },
  };
};