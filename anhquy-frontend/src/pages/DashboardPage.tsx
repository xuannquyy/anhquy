import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MainLayout } from '../components/MainLayout'
import { RiskScoreBar, Spinner, StatusBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import {
  dashboardApi,
  documentApi,
  violationApi,
  supplierApi,
  adminApi,
  standardApi,
} from '../api'
import { cleanVietnamesePdfText } from './AuditWorkspacePage'
import {
  FileText, AlertTriangle, Building2, Activity, ExternalLink,
  Users, ClipboardList, Upload, CheckCircle2, SlidersHorizontal,
  BarChart3, ShieldAlert, ShieldCheck, ArrowRight, Award,
  PieChart, Scale, Layers
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NormalizedStats {
  total_suppliers: number
  total_documents: number
  analyzing_documents: number
  analyzed_documents: number
  total_violations: number
  pending_violations: number
  approved_violations: number
  rejected_violations: number
  supplier_risk_distribution: { Safe: number; Warning: number; Danger: number }
  violation_risk_distribution: { High: number; Medium: number; Low: number }
}

interface RecentDocument {
  id: number
  file_name: string
  status: string
  uploaded_at?: string
  created_at?: string
  Suppliers?: { id?: number; company_name: string }
  Categories?: { name: string }
}

interface RecentViolation {
  id: number
  document_id?: number
  violation_desc: string
  risk_level: string
  status: string
  created_at: string
  Documents?: { id?: number; file_name: string; Suppliers?: { id?: number; company_name: string } }
  Standards?: {
    standard_code: string
    name: string
    Standard_Groups?: { group_code: string; group_name: string }
  }
}

interface SupplierItem {
  id: number
  company_name: string
  tax_code: string
  risk_score: number | null
  is_deleted: boolean
  created_at: string
  Categories?: { name: string } | null
}

interface StandardGroupStat {
  id: number
  group_code: string
  group_name: string
  Standards?: Array<{ id: number; standard_code?: string }>
}

interface AuditLogEntry {
  id: number
  action_type: string
  target_table: string
  target_id?: number | null
  created_at: string
  Users?: { full_name: string; email: string } | null
}

interface AdminSummary {
  totalUsers: number
  activeUsers: number
  lockedUsers: number
  recentLogs: AuditLogEntry[]
}

interface UserStandardSummary {
  totalActiveStandards: number
  excludedCount: number
}

interface DomainViolationStat {
  code: string
  shortName: string
  fullName: string
  ruleCount: number
  violationCount: number
  highRiskCount: number
  pctOfTotalViolations: number
}

// ─── Bộ chuyển đổi Nhật ký Hệ thống sang Tiếng Việt dễ hiểu cho người dùng ───

function translateAuditLog(log: AuditLogEntry): {
  badgeLabel: string
  badgeClass: string
  description: string
} {
  const act = (log.action_type || '').toUpperCase()
  const tbl = (log.target_table || '').toLowerCase()

  if (act.includes('APPROVE') || (act.includes('REVIEW') && tbl.includes('violation'))) {
    return {
      badgeLabel: 'Phê duyệt lỗi',
      badgeClass: 'bg-Berry text-white',
      description: 'Đã phê duyệt vi phạm hợp đồng & trừ điểm tín nhiệm đối tác',
    }
  }
  if (act.includes('REJECT')) {
    return {
      badgeLabel: 'Bác bỏ lỗi',
      badgeClass: 'bg-Snowflake text-Branch border border-Mist/30',
      description: 'Đã bác bỏ cảnh báo AI (Không tính lỗi cho đối tác)',
    }
  }
  if (act.includes('ANALYZE') || act.includes('AI')) {
    return {
      badgeLabel: 'Quét AI RAG',
      badgeClass: 'bg-Pine text-white',
      description: 'Đã kích hoạt AI rà soát điều khoản hợp đồng PDF',
    }
  }
  if (act.includes('UPLOAD') || (act.includes('CREATE') && tbl.includes('document'))) {
    return {
      badgeLabel: 'Tải hợp đồng',
      badgeClass: 'bg-SafeBg text-SafeGreen border border-SafeBorder',
      description: 'Đã tải hồ sơ hợp đồng PDF mới lên kho lưu trữ',
    }
  }
  if (act.includes('DELETE') && tbl.includes('document')) {
    return {
      badgeLabel: 'Xóa hợp đồng',
      badgeClass: 'bg-DangerBg text-Berry border border-DangerBorder',
      description: 'Đã xóa hồ sơ hợp đồng PDF & đồng bộ lại điểm đối tác',
    }
  }
  if (tbl.includes('supplier')) {
    return {
      badgeLabel: 'Hồ sơ đối tác',
      badgeClass: 'bg-Pine/10 text-Pine border border-Pine/20',
      description: act.includes('CREATE')
        ? 'Đã thêm mới pháp nhân đối tác cung ứng'
        : act.includes('DELETE')
        ? 'Đã chuyển đối tác cung ứng vào lưu trữ'
        : 'Đã cập nhật thông tin đối tác cung ứng',
    }
  }
  if (act.includes('LOGIN')) {
    return {
      badgeLabel: 'Đăng nhập',
      badgeClass: 'bg-Snowflake text-Pine',
      description: 'Đã đăng nhập xác thực vào hệ thống kiểm toán',
    }
  }
  return {
    badgeLabel: 'Hệ thống',
    badgeClass: 'bg-Snowflake text-Branch',
    description: `Thực hiện thao tác cập nhật dữ liệu (${log.target_table})`,
  }
}

// ─── 1. Thẻ KPI Chuẩn (Hỗ trợ Hero Card màu Pine #014BAA làm điểm nhấn chính) ─

function KpiMetricCard({
  title,
  value,
  unit,
  targetText,
  footerText,
  statusLabel,
  tone,
  isPrimaryHero = false,
  progressPct,
  icon,
  to,
}: {
  title: string
  value: string | number
  unit?: string
  targetText: string
  footerText: string
  statusLabel: string
  tone: 'safe' | 'warning' | 'danger' | 'info'
  isPrimaryHero?: boolean
  progressPct: number
  icon: React.ReactNode
  to?: string
}) {
  if (isPrimaryHero) {
    const heroCard = (
      <div className="bg-Pine text-white rounded-3xl p-4 sm:p-5 shadow-[0_12px_28px_rgba(1,75,170,0.22)] hover:shadow-[0_16px_34px_rgba(1,75,170,0.3)] hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between h-full border border-Pine">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-white/15 text-Sunny flex items-center justify-center flex-shrink-0">
              {icon}
            </div>
            <span className="text-xs font-extrabold text-white leading-tight">{title}</span>
          </div>
          <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-lg bg-Sunny text-Branch flex-shrink-0">
            {statusLabel}
          </span>
        </div>

        <div className="my-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {value}
            </span>
            {unit && <span className="text-xs font-bold text-Snowflake/85">{unit}</span>}
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-Sunny transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(6, progressPct))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="text-Snowflake/90 truncate">{footerText}</span>
            <span className="text-Sunny font-bold flex-shrink-0">{targetText}</span>
          </div>
        </div>
      </div>
    )
    return to ? <Link to={to} className="block h-full">{heroCard}</Link> : heroCard
  }

  const styles = {
    safe: {
      badge: 'bg-SafeBg text-SafeGreen border-SafeBorder',
      iconBg: 'bg-Pine/10 text-Pine',
      bar: 'bg-Pine',
      num: 'text-Pine',
    },
    warning: {
      badge: 'bg-WarnBg text-Branch border-Sunny',
      iconBg: 'bg-Sunny/35 text-Branch',
      bar: 'bg-Sunny',
      num: 'text-Branch',
    },
    danger: {
      badge: 'bg-DangerBg text-Berry border-DangerBorder',
      iconBg: 'bg-DangerBg text-Berry',
      bar: 'bg-Berry',
      num: 'text-Berry',
    },
    info: {
      badge: 'bg-Snowflake text-Pine border-Mist/30',
      iconBg: 'bg-Pine/10 text-Pine',
      bar: 'bg-Pine',
      num: 'text-Pine',
    },
  }[tone]

  const card = (
    <div className="bg-white rounded-3xl border border-Mist/25 p-4 sm:p-5 shadow-[0_8px_24px_rgba(10,16,32,0.04)] hover:border-Pine/40 hover:shadow-md transition-all duration-200 flex flex-col justify-between h-full">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 ${styles.iconBg}`}>
            {icon}
          </div>
          <span className="text-xs font-extrabold text-Branch leading-tight">{title}</span>
        </div>
        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border flex-shrink-0 ${styles.badge}`}>
          {statusLabel}
        </span>
      </div>

      <div className="my-1">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-2xl sm:text-3xl font-black tracking-tight ${styles.num}`}>
            {value}
          </span>
          {unit && <span className="text-xs font-bold text-Mist">{unit}</span>}
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="w-full h-2 bg-Snowflake/80 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${styles.bar}`}
            style={{ width: `${Math.min(100, Math.max(6, progressPct))}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span className="text-Branch/75 truncate">{footerText}</span>
          <span className="text-Mist flex-shrink-0">{targetText}</span>
        </div>
      </div>
    </div>
  )

  return to ? <Link to={to} className="block h-full">{card}</Link> : card
}

// ─── 2. Biểu đồ Donut Tỷ lệ Hợp đồng Phát hiện Vi phạm ────────────────────────

function ContractViolationDonut({
  totalDocs,
  analyzedDocs,
  violatedCount,
  cleanCount,
  violatedRate,
}: {
  totalDocs: number
  analyzedDocs: number
  violatedCount: number
  cleanCount: number
  violatedRate: number
}) {
  const isAlert = violatedRate > 30
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const violatedDash = (violatedRate / 100) * circumference
  const unanalyzedCount = Math.max(0, totalDocs - analyzedDocs)

  return (
    <div className="flex flex-col justify-between flex-1 pt-2">
      <div className="flex items-center justify-center gap-5 my-auto py-2">
        <div className="relative w-36 h-36 flex items-center justify-center flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 132 132">
            {/* Nền Xanh Pine cho Hợp đồng đạt chuẩn */}
            <circle
              cx="66"
              cy="66"
              r={radius}
              fill="none"
              stroke="#014BAA"
              strokeWidth="14"
              opacity={analyzedDocs > 0 ? 0.2 : 0.15}
            />
            {violatedRate > 0 && (
              <circle
                cx="66"
                cy="66"
                r={radius}
                fill="none"
                stroke={isAlert ? '#6B212C' : '#014BAA'}
                strokeWidth="14"
                strokeDasharray={`${violatedDash} ${circumference}`}
                strokeLinecap="round"
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className={`text-2xl font-black leading-none ${isAlert ? 'text-Berry' : 'text-Pine'}`}>
              {violatedRate}%
            </span>
            <span className="text-[10px] font-extrabold text-Branch uppercase mt-1">
              HĐ Có lỗi
            </span>
            <span className="text-[9px] font-bold text-Mist mt-0.5">
              Ngưỡng &le; 30%
            </span>
          </div>
        </div>

        <div className="space-y-2 text-xs flex-1 min-w-0">
          <div className="p-2.5 rounded-2xl bg-Snowflake/45 border border-Mist/25 flex items-center justify-between">
            <span className="font-bold text-Branch flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-Berry" />
              Phát hiện lỗi
            </span>
            <span className="font-black text-Berry">{violatedCount} HĐ</span>
          </div>

          <div className="p-2.5 rounded-2xl bg-Snowflake/45 border border-Mist/25 flex items-center justify-between">
            <span className="font-bold text-Branch flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-Pine" />
              Đạt chuẩn sạch
            </span>
            <span className="font-black text-Pine">{cleanCount} HĐ</span>
          </div>

          <div className="px-2.5 py-1.5 rounded-xl bg-Pine/10 flex items-center justify-between text-[11px]">
            <span className="font-bold text-Pine">Đã phân tích AI</span>
            <span className="font-extrabold text-Pine">
              {analyzedDocs}/{totalDocs} HĐ {unanalyzedCount > 0 ? `(${unanalyzedCount} chờ)` : ''}
            </span>
          </div>
        </div>
      </div>

      <div className={`mt-3 px-3.5 py-2 rounded-2xl border text-xs font-extrabold flex items-center justify-between ${
        isAlert
          ? 'bg-WarnBg text-Branch border-Sunny'
          : 'bg-SafeBg text-SafeGreen border-SafeBorder'
      }`}>
        <span>
          {isAlert
            ? 'Tỷ lệ HĐ có điều khoản vi phạm vượt ngưỡng 30%'
            : 'Tỷ lệ hợp đồng nằm trong ngưỡng kiểm soát'}
        </span>
        <Link to="/documents" className="text-Pine underline ml-2 flex-shrink-0">
          Chi tiết
        </Link>
      </div>
    </div>
  )
}

// ─── 3. Phân tích Lỗi Vi phạm theo 4 Nhóm Pháp lý RBA/VN (Co giãn mọi số lượng lỗi) ─

function LegalDomainViolationChart({
  domainStats,
  topDomain,
  totalViolations,
}: {
  domainStats: DomainViolationStat[]
  topDomain: DomainViolationStat | null
  totalViolations: number
}) {
  return (
    <div className="flex flex-col justify-between flex-1 pt-2">
      <div className="space-y-3 my-auto">
        {domainStats.map((item) => {
          const isTopGroup = topDomain?.code === item.code && item.violationCount > 0
          return (
            <div key={item.code} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-extrabold text-Branch truncate">{item.fullName}</span>
                  {isTopGroup && (
                    <span className="px-1.5 py-0.5 rounded bg-Berry text-white text-[9px] font-extrabold uppercase flex-shrink-0">
                      Vi phạm nhiều nhất
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`font-extrabold ${isTopGroup ? 'text-Berry' : 'text-Pine'}`}>
                    {item.violationCount} lỗi
                  </span>
                  <span className="text-[11px] font-bold text-Mist">
                    ({item.pctOfTotalViolations}%)
                  </span>
                </div>
              </div>

              {/* Thanh tỷ trọng % (Dù có 5 lỗi hay 500 lỗi đều tự động chia tỷ lệ % chuẩn xác) */}
              <div className="w-full h-2.5 bg-Snowflake/80 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isTopGroup
                      ? 'bg-Berry'
                      : item.violationCount > 0
                      ? 'bg-Pine'
                      : 'bg-Mist/40'
                  }`}
                  style={{ width: `${item.violationCount > 0 ? Math.max(8, item.pctOfTotalViolations) : 3}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 px-3.5 py-2 rounded-2xl bg-Pine/10 border border-Pine/20 text-xs font-bold text-Pine flex items-center justify-between gap-2">
        <span className="truncate">
          {topDomain && totalViolations > 0
            ? `Trọng tâm sửa hợp đồng: ${topDomain.fullName} (${topDomain.violationCount}/${totalViolations} lỗi)`
            : 'Chưa phát hiện điều khoản vi phạm trên hợp đồng'}
        </span>
        <span className="text-[10px] font-extrabold uppercase flex-shrink-0">RBA v8.0</span>
      </div>
    </div>
  )
}

// ─── Main Dashboard Page ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, role, hasPermission } = useAuth()

  const [stats, setStats] = useState<NormalizedStats | null>(null)
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([])
  const [allViolations, setAllViolations] = useState<RecentViolation[]>([])
  const [suppliersList, setSuppliersList] = useState<SupplierItem[]>([])
  const [supplierFilterTab, setSupplierFilterTab] = useState<'all' | 'attention'>('all')
  const [standardGroups, setStandardGroups] = useState<
    Array<{ code: string; shortName: string; fullName: string; count: number }>
  >([
    { code: 'GRP-LABOR',  shortName: 'Lao động',   fullName: 'Tiêu chuẩn Lao động', count: 10 },
    { code: 'GRP-OHS',    shortName: 'An toàn SK', fullName: 'An toàn & Sức khỏe',  count: 5 },
    { code: 'GRP-ENV',    shortName: 'Môi trường', fullName: 'Bảo vệ Môi trường',   count: 5 },
    { code: 'GRP-ETHICS', shortName: 'Đạo đức',    fullName: 'Đạo đức Kinh doanh',  count: 4 },
  ])
  const [adminSummary, setAdminSummary] = useState<AdminSummary>({
    totalUsers: 0,
    activeUsers: 0,
    lockedUsers: 0,
    recentLogs: [],
  })
  const [userStdSummary, setUserStdSummary] = useState<UserStandardSummary>({
    totalActiveStandards: 24,
    excludedCount: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [statsRes, docsRes, violationsRes, supRes, grpRes] = await Promise.all([
          dashboardApi.getStats().catch(() => ({ data: null })),
          documentApi.getAll({ page: 1, limit: 200 }).catch(() => ({ data: null })),
          violationApi.getAll({ page: 1, limit: 500 }).catch(() => ({ data: null })),
          supplierApi.getAll({ page: 1, limit: 100, is_deleted: false }).catch(() => ({ data: null })),
          standardApi.getGroups().catch(() => ({ data: null })),
        ])

        const docsData = docsRes?.data?.data || docsRes?.data || {}
        const docsItems: RecentDocument[] = (docsData as { items?: RecentDocument[] })?.items || []
        setRecentDocs(docsItems)

        const vData = violationsRes?.data?.data || violationsRes?.data || {}
        const violsItems: RecentViolation[] = (vData as { items?: RecentViolation[] })?.items || []
        setAllViolations(violsItems)

        // Đồng bộ điểm tín nhiệm thực tế dựa trên các lỗi Approved hiện hành
        const approvedViolsList = violsItems.filter((v) => v.status === 'Approved')
        const sData = supRes?.data?.data || supRes?.data || {}
        const rawSuppliers: SupplierItem[] = (sData as { items?: SupplierItem[] })?.items || []
        const syncedSuppliers = rawSuppliers.map((s) => {
          const supApproved = approvedViolsList.filter(
            (v) =>
              v.Documents?.Suppliers?.id === s.id ||
              v.Documents?.Suppliers?.company_name === s.company_name
          )
          const penalty = supApproved.reduce(
            (sum, v) => sum + (v.risk_level === 'High' ? 10 : v.risk_level === 'Medium' ? 5 : 2),
            0
          )
          return { ...s, risk_score: Math.max(0, 100 - penalty) }
        })
        setSuppliersList(syncedSuppliers)

        const safeSupCount = syncedSuppliers.filter((s) => (s.risk_score ?? 100) >= 80).length
        const warnSupCount = syncedSuppliers.filter((s) => (s.risk_score ?? 100) >= 50 && (s.risk_score ?? 100) < 80).length
        const dangerSupCount = syncedSuppliers.filter((s) => (s.risk_score ?? 100) < 50).length

        const raw = statsRes?.data?.stats || statsRes?.data?.data || statsRes?.data || {}
        const pendingV = violsItems.length > 0
          ? violsItems.filter((v) => v.status === 'Pending').length
          : Number(raw?.violations?.by_status?.pending ?? raw?.pending_violations ?? 0)
        const approvedV = violsItems.length > 0
          ? approvedViolsList.length
          : Number(raw?.violations?.by_status?.approved ?? 0)
        const rejectedV = violsItems.length > 0
          ? violsItems.filter((v) => v.status === 'Rejected').length
          : Number(raw?.violations?.by_status?.rejected ?? 0)
        const computedTotalV = violsItems.length > 0 ? violsItems.length : pendingV + approvedV + rejectedV

        setStats({
          total_suppliers: syncedSuppliers.length || Number(raw?.suppliers?.total ?? raw?.total_suppliers ?? 0),
          total_documents: docsItems.length || Number(raw?.documents?.total ?? raw?.total_documents ?? 0),
          analyzing_documents: docsItems.filter((d) => d.status === 'Analyzing').length,
          analyzed_documents:
            docsItems.filter((d) => d.status === 'Analyzed').length ||
            Number(raw?.documents?.analyzed ?? 0),
          total_violations: computedTotalV,
          pending_violations: pendingV,
          approved_violations: approvedV,
          rejected_violations: rejectedV,
          supplier_risk_distribution: {
            Safe: syncedSuppliers.length > 0 ? safeSupCount : Number(raw?.suppliers?.safe ?? 0),
            Warning: syncedSuppliers.length > 0 ? warnSupCount : Number(raw?.suppliers?.warning ?? 0),
            Danger: syncedSuppliers.length > 0 ? dangerSupCount : Number(raw?.suppliers?.danger ?? 0),
          },
          violation_risk_distribution: {
            High: violsItems.length > 0
              ? violsItems.filter((v) => v.risk_level === 'High').length
              : Number(raw?.violations?.by_risk_level?.high ?? 0),
            Medium: violsItems.length > 0
              ? violsItems.filter((v) => v.risk_level === 'Medium').length
              : Number(raw?.violations?.by_risk_level?.medium ?? 0),
            Low: violsItems.length > 0
              ? violsItems.filter((v) => v.risk_level === 'Low').length
              : Number(raw?.violations?.by_risk_level?.low ?? 0),
          },
        })

        const rawGroups: StandardGroupStat[] = grpRes?.data?.groups || grpRes?.data?.data || []
        if (Array.isArray(rawGroups) && rawGroups.length > 0) {
          const shortMap: Record<string, string> = {
            'GRP-LABOR':  'Lao động',
            'GRP-OHS':    'An toàn SK',
            'GRP-ENV':    'Môi trường',
            'GRP-ETHICS': 'Đạo đức',
          }
          setStandardGroups(
            rawGroups.map((g) => ({
              code: g.group_code,
              shortName: shortMap[g.group_code] || g.group_name,
              fullName: g.group_name,
              count: Array.isArray(g.Standards) ? g.Standards.length : 6,
            }))
          )
        }

        if (role === 'Admin') {
          const [uRes, lRes] = await Promise.all([
            adminApi.getUsers({ page: 1, limit: 100 }).catch(() => ({ data: null })),
            adminApi.getAuditLogs({ page: 1, limit: 8 }).catch(() => ({ data: null })),
          ])
          const uPayload = uRes?.data?.data || uRes?.data || {}
          const uItems = (uPayload as { items?: Array<{ is_active: boolean }> })?.items || []
          const lPayload = lRes?.data?.data || lRes?.data || {}
          const lItems = (lPayload as { items?: AuditLogEntry[] })?.items || []

          setAdminSummary({
            totalUsers: Number((uPayload as { total?: number })?.total ?? uItems.length),
            activeUsers: uItems.filter((u) => u.is_active).length,
            lockedUsers: uItems.filter((u) => !u.is_active).length,
            recentLogs: lItems,
          })
        } else {
          const [stdRes, excRes] = await Promise.all([
            standardApi.getAll({ page: 1, limit: 100, is_active: true }).catch(() => ({ data: null })),
            standardApi.getExcluded().catch(() => ({ data: null })),
          ])
          const stdData = stdRes?.data?.data || stdRes?.data || {}
          const totalStd = Number((stdData as { total?: number })?.total ?? 24)
          const excList = excRes?.data?.excluded || excRes?.data?.data || []
          setUserStdSummary({
            totalActiveStandards: totalStd,
            excludedCount: Array.isArray(excList) ? excList.length : 0,
          })
        }
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [role])

  // ── TÍNH TOÁN CÁC CHỈ SỐ ĐÁNH GIÁ CHUỖI CUNG ỨNG & HỢP ĐỒNG ─────────────────
  const avgSupplierScore = useMemo(() => {
    if (suppliersList.length === 0) return 100
    const sum = suppliersList.reduce((acc, s) => acc + (s.risk_score ?? 100), 0)
    return Math.round(sum / suppliersList.length)
  }, [suppliersList])

  const actionableViolations = useMemo(
    () => allViolations.filter((v) => v.status !== 'Rejected'),
    [allViolations]
  )

  const contractMetrics = useMemo(() => {
    const analyzedDocs = recentDocs.filter((d) => d.status === 'Analyzed')
    const totalAnalyzed = analyzedDocs.length || stats?.analyzed_documents || 0
    const docIdsWithViolations = new Set<number>()

    actionableViolations.forEach((v) => {
      const dId = v.Documents?.id ?? v.document_id
      if (dId) docIdsWithViolations.add(dId)
    })

    const violatedCount = Math.min(totalAnalyzed, docIdsWithViolations.size)
    const cleanCount = Math.max(0, totalAnalyzed - violatedCount)
    const violatedRate = totalAnalyzed > 0 ? Math.round((violatedCount / totalAnalyzed) * 100) : 0

    return {
      totalAnalyzed,
      violatedCount,
      cleanCount,
      violatedRate,
    }
  }, [recentDocs, actionableViolations, stats])

  const domainViolationStats = useMemo((): DomainViolationStat[] => {
    const classifyGroup = (v: RecentViolation): string => {
      const explicitGrp = v.Standards?.Standard_Groups?.group_code
      if (explicitGrp) return explicitGrp
      const code = (v.Standards?.standard_code || '').toUpperCase()
      const name = (v.Standards?.name || v.violation_desc || '').toLowerCase()

      if (code.includes('BLLD') || code.includes('RBA-A') || name.includes('lao động') || name.includes('tiền lương') || name.includes('tuổi')) {
        return 'GRP-LABOR'
      }
      if (code.includes('ATLD') || code.includes('OHS') || code.includes('RBA-B') || name.includes('an toàn') || name.includes('bảo hộ') || name.includes('cháy')) {
        return 'GRP-OHS'
      }
      if (code.includes('BVMT') || code.includes('ENV') || code.includes('RBA-C') || name.includes('môi trường') || name.includes('xả thải') || name.includes('nước thải')) {
        return 'GRP-ENV'
      }
      return 'GRP-ETHICS'
    }

    const totalAct = actionableViolations.length

    return standardGroups.map((grp) => {
      const matched = actionableViolations.filter((v) => classifyGroup(v) === grp.code)
      const highMatched = matched.filter((v) => v.risk_level === 'High').length
      const pct = totalAct > 0 ? Math.round((matched.length / totalAct) * 100) : 0

      return {
        code: grp.code,
        shortName: grp.shortName,
        fullName: grp.fullName,
        ruleCount: grp.count,
        violationCount: matched.length,
        highRiskCount: highMatched,
        pctOfTotalViolations: pct,
      }
    })
  }, [standardGroups, actionableViolations])

  const topViolationDomain = useMemo(() => {
    const sorted = [...domainViolationStats].sort((a, b) => b.violationCount - a.violationCount)
    return sorted[0] && sorted[0].violationCount > 0 ? sorted[0] : null
  }, [domainViolationStats])

  // Danh sách đối tác hiển thị trong bảng (Sắp xếp từ điểm thấp lên cao, có lọc Cần chú ý <80đ)
  const sortedSuppliersForWidget = useMemo(() => {
    const sorted = [...suppliersList].sort((a, b) => (a.risk_score ?? 100) - (b.risk_score ?? 100))
    if (supplierFilterTab === 'attention') {
      return sorted.filter((s) => (s.risk_score ?? 100) < 80)
    }
    return sorted
  }, [suppliersList, supplierFilterTab])

  if (loading) {
    return (
      <MainLayout breadcrumb="Bảng điều khiển">
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      </MainLayout>
    )
  }

  const safeSupplierRate =
    stats && stats.total_suppliers > 0
      ? Math.round((stats.supplier_risk_distribution.Safe / stats.total_suppliers) * 100)
      : 100
  const auditCoverageRate =
    stats && stats.total_documents > 0
      ? Math.round((contractMetrics.totalAnalyzed / stats.total_documents) * 100)
      : 100
  const resolutionRate =
    stats && stats.total_violations > 0
      ? Math.round(((stats.approved_violations + stats.rejected_violations) / stats.total_violations) * 100)
      : 100

  const highRiskCount = stats?.violation_risk_distribution.High ?? 0
  const pendingCount = stats?.pending_violations ?? 0
  const belowSafeSuppliersCount =
    (stats?.supplier_risk_distribution.Warning ?? 0) + (stats?.supplier_risk_distribution.Danger ?? 0)

  const roleSubtitle =
    role === 'Admin'
      ? 'Giám sát Rủi ro Hợp đồng AI RAG, Điểm Tín nhiệm Đối tác & Quản trị Hệ thống'
      : role === 'Manager'
      ? 'Thẩm định Cảnh báo Vi phạm Hợp đồng & Phê duyệt Điểm Tín nhiệm Đối tác'
      : 'Rà soát Hợp đồng PDF bằng AI RAG & Đề xuất Điều khoản Hiệu chỉnh (Redline)'

  return (
    <MainLayout breadcrumb="Bảng điều khiển">
      <div className="space-y-4">
        {/* ─── 1. HEADER TỔNG QUAN ────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-1">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-Pine tracking-tight">
                Xin chào, {user?.full_name || 'Quản trị viên'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-xl bg-Pine text-white text-[11px] font-extrabold uppercase">
                {role}
              </span>
            </div>
            <p className="text-xs font-semibold text-Branch/75 mt-0.5">{roleSubtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {role === 'Admin' && (
              <Link
                to="/admin/users"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-Pine border border-Mist/35 text-xs font-extrabold rounded-2xl hover:bg-Snowflake transition-colors shadow-sm"
              >
                <Users className="w-3.5 h-3.5 text-Pine" />
                Tài khoản ({adminSummary.totalUsers})
              </Link>
            )}
            {pendingCount > 0 && (
              <Link
                to="/violations"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-Sunny text-Branch text-xs font-extrabold rounded-2xl hover:opacity-90 transition-opacity shadow-sm"
              >
                <Activity className="w-3.5 h-3.5" />
                Thẩm định {pendingCount} lỗi chờ
              </Link>
            )}
            {hasPermission('EXPORT_REPORT') && (
              <Link
                to="/reports"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-Pine text-white text-xs font-extrabold rounded-2xl hover:bg-Branch transition-colors shadow-sm"
              >
                <BarChart3 className="w-3.5 h-3.5 text-Sunny" />
                Báo Cáo Kỳ
              </Link>
            )}
          </div>
        </div>

        {/* Thanh Cảnh báo Tóm tắt 1 dòng (Dùng viền Pine/Sunny hài hòa, chỉ báo khi có lỗi chờ duyệt) */}
        {(pendingCount > 0 || belowSafeSuppliersCount > 0) && (
          <div className="bg-white border-l-4 border-l-Pine border border-Mist/30 rounded-2xl px-4 py-2.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-Pine text-white font-extrabold uppercase text-[10px]">
                <ShieldAlert className="w-3.5 h-3.5 text-Sunny" />
                Tâm điểm cần chú ý
              </span>
              <span className="font-bold text-Branch">
                Có <strong className="text-Berry">{pendingCount} cảnh báo vi phạm</strong> đang chờ thẩm định
              </span>
              {topViolationDomain && (
                <>
                  <span className="text-Mist">•</span>
                  <span className="font-semibold text-Branch">
                    Vi phạm tập trung nhiều nhất ở <strong className="text-Pine">{topViolationDomain.fullName} ({topViolationDomain.violationCount} lỗi – {topViolationDomain.pctOfTotalViolations}%)</strong>
                  </span>
                </>
              )}
            </div>
            <Link
              to="/violations"
              className="text-xs font-extrabold text-Pine hover:underline flex items-center gap-1"
            >
              Mở Trung tâm Thẩm định <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* ─── 2. HÀNG 1: 4 THẺ KPI CỐT LÕI (THẺ 1 MÀU XANH PINE #014BAA CHỦ ĐẠO) ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Thẻ 1 (Hero Pine Card): Điểm Tín nhiệm Chuỗi cung ứng */}
          <KpiMetricCard
            isPrimaryHero={true}
            title="Điểm Tín nhiệm Đối tác TB"
            value={avgSupplierScore}
            unit="/ 100 điểm"
            statusLabel={avgSupplierScore >= 80 ? 'An toàn' : 'Cảnh báo'}
            tone="safe"
            footerText={`${stats?.supplier_risk_distribution.Safe ?? 0}/${stats?.total_suppliers ?? 0} đối tác đạt chuẩn`}
            targetText="Chuẩn ≥ 80đ"
            progressPct={avgSupplierScore}
            icon={<Award className="w-4 h-4" />}
            to="/suppliers"
          />

          {/* Thẻ 2: Tỷ lệ Hợp đồng Phát hiện Vi phạm */}
          <KpiMetricCard
            title="Tỷ lệ Hợp đồng Có Lỗi"
            value={`${contractMetrics.violatedRate}%`}
            unit={`(${contractMetrics.violatedCount}/${contractMetrics.totalAnalyzed} HĐ)`}
            statusLabel={contractMetrics.violatedRate > 30 ? 'Vượt ngưỡng' : 'An toàn'}
            tone={contractMetrics.violatedRate > 30 ? 'warning' : 'safe'}
            footerText={`${contractMetrics.cleanCount} hợp đồng đạt chuẩn sạch`}
            targetText="Ngưỡng ≤ 30%"
            progressPct={contractMetrics.violatedRate}
            icon={<FileText className="w-4 h-4" />}
            to="/documents"
          />

          {/* Thẻ 3: Điều khoản Vi phạm Mức Cao */}
          <KpiMetricCard
            title="Vi phạm Mức độ Cao"
            value={highRiskCount}
            unit={`/ ${stats?.total_violations ?? 0} tổng lỗi`}
            statusLabel={highRiskCount > 0 ? 'Trừ 10đ / lỗi' : '0 lỗi Cao'}
            tone={highRiskCount >= 3 ? 'danger' : 'safe'}
            footerText={
              topViolationDomain
                ? `Nhiều nhất: ${topViolationDomain.shortName} (${topViolationDomain.violationCount} lỗi)`
                : 'Không có điều khoản nguy hiểm'
            }
            targetText="Rủi ro trọng yếu"
            progressPct={
              stats && stats.total_violations > 0
                ? Math.round((highRiskCount / stats.total_violations) * 100)
                : 0
            }
            icon={<AlertTriangle className="w-4 h-4" />}
            to="/violations"
          />

          {/* Thẻ 4: Tùy biến theo Vai trò */}
          {role === 'User' ? (
            <KpiMetricCard
              title="Bộ Tiêu chuẩn Quét AI"
              value={userStdSummary.totalActiveStandards - userStdSummary.excludedCount}
              unit={`/ ${userStdSummary.totalActiveStandards} chuẩn`}
              statusLabel={userStdSummary.excludedCount > 0 ? `Tắt ${userStdSummary.excludedCount}` : 'Đang bật 100%'}
              tone="info"
              footerText="Chuẩn RBA v8.0 & Pháp luật VN"
              targetText="Độ phủ RAG"
              progressPct={Math.round(
                ((userStdSummary.totalActiveStandards - userStdSummary.excludedCount) /
                  Math.max(1, userStdSummary.totalActiveStandards)) *
                  100
              )}
              icon={<SlidersHorizontal className="w-4 h-4" />}
              to="/standards"
            />
          ) : (
            <KpiMetricCard
              title="Tiến độ Phản hồi Duyệt"
              value={`${resolutionRate}%`}
              unit={`(${pendingCount} chờ duyệt)`}
              statusLabel={resolutionRate >= 80 ? 'Đạt SLA' : 'Cần duyệt'}
              tone={resolutionRate >= 80 ? 'safe' : 'warning'}
              footerText={`Đã xử lý ${(stats?.approved_violations ?? 0) + (stats?.rejected_violations ?? 0)}/${stats?.total_violations ?? 0} cảnh báo`}
              targetText="SLA ≥ 80%"
              progressPct={resolutionRate}
              icon={<ClipboardList className="w-4 h-4" />}
              to="/violations"
            />
          )}
        </div>

        {/* ─── 3. HÀNG 2: 2 BIỂU ĐỒ PHÂN TÍCH + 1 KHỐI PINE CHỈ SỐ KIỂM SOÁT ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Cột 1 (4/12): Biểu đồ Donut Tỷ lệ Hợp đồng Vi phạm */}
          <div className="lg:col-span-4 bg-white rounded-3xl border border-Mist/25 p-5 shadow-[0_8px_24px_rgba(10,16,32,0.04)] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-Pine flex items-center gap-1.5">
                  <PieChart className="w-4 h-4 text-Pine" />
                  Tỷ lệ Hợp đồng Vi phạm
                </h2>
                <p className="text-[11px] text-Mist font-semibold">Đối chiếu ngưỡng an toàn (&le; 30%)</p>
              </div>
              <Link to="/documents" className="text-xs font-extrabold text-Pine hover:underline">
                Kho PDF →
              </Link>
            </div>

            <ContractViolationDonut
              totalDocs={stats?.total_documents ?? 0}
              analyzedDocs={contractMetrics.totalAnalyzed}
              violatedCount={contractMetrics.violatedCount}
              cleanCount={contractMetrics.cleanCount}
              violatedRate={contractMetrics.violatedRate}
            />
          </div>

          {/* Cột 2 (4/12): Phân tích Lỗi Vi phạm theo 4 Nhóm Tiêu chuẩn RBA & VN */}
          <div className="lg:col-span-4 bg-white rounded-3xl border border-Mist/25 p-5 shadow-[0_8px_24px_rgba(10,16,32,0.04)] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-Pine flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-Pine" />
                  Nhóm Điều khoản Bị Vi phạm
                </h2>
                <p className="text-[11px] text-Mist font-semibold">
                  Phân bổ {actionableViolations.length} lỗi phát hiện theo 4 lĩnh vực
                </p>
              </div>
              <Link to="/standards" className="text-xs font-extrabold text-Pine hover:underline">
                24 Chuẩn →
              </Link>
            </div>

            <LegalDomainViolationChart
              domainStats={domainViolationStats}
              topDomain={topViolationDomain}
              totalViolations={actionableViolations.length}
            />
          </div>

          {/* Cột 3 (4/12): Khối Màu Chính PINE (#014BAA) - Chỉ số Kiểm soát Hệ thống */}
          <div className="lg:col-span-4 bg-Pine text-white rounded-3xl p-5 shadow-[0_14px_32px_rgba(1,75,170,0.22)] flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-Sunny" />
                  Chỉ số Kiểm soát Chuỗi cung ứng
                </h2>
                <p className="text-[11px] text-Snowflake/80 font-medium">
                  Đánh giá theo 3 ngưỡng vận hành chuẩn
                </p>
              </div>
            </div>

            <div className="space-y-2.5 my-auto">
              {[
                {
                  label: 'Tỷ lệ Đối tác Đạt Chuẩn An toàn',
                  sub: `${stats?.supplier_risk_distribution.Safe ?? 0}/${stats?.total_suppliers ?? 0} đối tác ≥ 80đ (${belowSafeSuppliersCount} cần chú ý)`,
                  pct: safeSupplierRate,
                  isOk: safeSupplierRate >= 80,
                },
                {
                  label: 'Độ phủ Quét AI Hợp đồng PDF',
                  sub: `Đã phân tích ${contractMetrics.totalAnalyzed}/${stats?.total_documents ?? 0} hợp đồng tải lên`,
                  pct: auditCoverageRate,
                  isOk: auditCoverageRate >= 80,
                },
                {
                  label: 'Tỷ lệ Hoàn tất Phê duyệt Lỗi',
                  sub:
                    pendingCount > 0
                      ? `Còn ${pendingCount} cảnh báo chờ Manager phê duyệt`
                      : 'Đã phê duyệt hoàn tất 100% cảnh báo',
                  pct: resolutionRate,
                  isOk: resolutionRate >= 80,
                },
              ].map((item) => {
                const r = 18
                const c = 2 * Math.PI * r
                const dash = `${(item.pct / 100) * c} ${c}`
                return (
                  <div
                    key={item.label}
                    className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-white truncate">{item.label}</p>
                      <p className="text-[11px] text-Snowflake/85 truncate mt-0.5">{item.sub}</p>
                    </div>
                    <div className="relative w-11 h-11 flex items-center justify-center flex-shrink-0">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
                        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                        <circle
                          cx="22"
                          cy="22"
                          r={r}
                          fill="none"
                          stroke={item.isOk ? '#EBBC62' : '#FECDD3'}
                          strokeWidth="4"
                          strokeDasharray={dash}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="text-[10px] font-black text-Sunny">{item.pct}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ─── 4. HÀNG 3: BẢNG ĐIỂM TÍN NHIỆM ĐỐI TÁC & KHUNG ĐIỀU HÀNH THEO VAI TRÒ ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Cột Trái (6/12): Bảng Điểm Tín nhiệm Đối tác (Có Tab lọc & Cuộn cố định, không tràn khi có 10-50 đối tác) */}
          <div className="lg:col-span-6 bg-white rounded-3xl border border-Mist/25 p-5 shadow-[0_8px_24px_rgba(10,16,32,0.04)] flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm font-extrabold text-Pine flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-Pine" />
                    Bảng Điểm Tín nhiệm Đối tác
                  </h2>
                  <p className="text-[11px] text-Mist font-semibold">
                    Xếp hạng ưu tiên từ điểm thấp nhất (Hiển thị tối đa 5 đơn vị)
                  </p>
                </div>

                {/* Bộ lọc nhanh tránh tràn danh sách khi có nhiều đối tác */}
                <div className="flex items-center gap-1 bg-Snowflake/60 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSupplierFilterTab('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-colors ${
                      supplierFilterTab === 'all' ? 'bg-Pine text-white' : 'text-Branch hover:text-Pine'
                    }`}
                  >
                    Top ưu tiên ({suppliersList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSupplierFilterTab('attention')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-colors ${
                      supplierFilterTab === 'attention' ? 'bg-Berry text-white' : 'text-Branch hover:text-Berry'
                    }`}
                  >
                    Dưới 80đ ({belowSafeSuppliersCount})
                  </button>
                </div>
              </div>

              {/* Khung cuộn cố định max-h-[250px]: Dù có 10 hay 50 đối tác vẫn giữ nguyên chiều cao đẹp mắt */}
              <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                {sortedSuppliersForWidget.length === 0 ? (
                  <div className="text-center py-8 bg-SafeBg rounded-2xl border border-SafeBorder">
                    <ShieldCheck className="w-8 h-8 text-SafeGreen mx-auto mb-1.5" />
                    <p className="text-xs font-extrabold text-SafeGreen">
                      100% đối tác đều đạt ngưỡng An toàn (&ge; 80 điểm)!
                    </p>
                  </div>
                ) : (
                  sortedSuppliersForWidget.slice(0, 5).map((sup) => {
                    const s = sup.risk_score ?? 100
                    return (
                      <div
                        key={sup.id}
                        className="p-3 rounded-2xl bg-Snowflake/35 hover:bg-Snowflake/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-Branch truncate">{sup.company_name}</p>
                          <p className="text-[10px] font-mono text-Mist">
                            MST: {sup.tax_code} · {sup.Categories?.name || 'Đối tác cung ứng'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          <div className="w-36">
                            <RiskScoreBar score={s} />
                          </div>
                          <StatusBadge status={s >= 80 ? 'Safe' : s >= 50 ? 'Warning' : 'Danger'} />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-Mist/15 flex items-center justify-between text-[11px] font-semibold text-Mist">
              <span>An toàn: &ge;80đ · Cảnh báo: 50–79đ · Đình chỉ: &lt;50đ</span>
              <Link to="/suppliers" className="text-Pine font-extrabold hover:underline">
                Xem tất cả {suppliersList.length} đối tác →
              </Link>
            </div>
          </div>

          {/* Cột Phải (6/12): Khung Điều hành theo Vai trò (Đã dịch Nhật ký Admin sang Tiếng Việt 100%) */}
          <div className="lg:col-span-6 bg-white rounded-3xl border border-Mist/25 p-5 shadow-[0_8px_24px_rgba(10,16,32,0.04)] flex flex-col justify-between">
            {role === 'Admin' ? (
              /* VIEW RIÊNG CỦA ADMIN: Nhật ký Hoạt động bằng Tiếng Việt rõ nghĩa */
              <>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-extrabold text-Pine flex items-center gap-1.5">
                        <ClipboardList className="w-4 h-4 text-Pine" />
                        Nhật ký Hoạt động Hệ thống Gần đây
                      </h2>
                      <p className="text-[11px] text-Mist font-semibold">
                        Theo dõi ai vừa tải hợp đồng, quét AI hoặc phê duyệt điểm
                      </p>
                    </div>
                    <Link to="/admin/audit-logs" className="text-xs font-extrabold text-Pine hover:underline">
                      Xem toàn bộ →
                    </Link>
                  </div>

                  <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                    {adminSummary.recentLogs.length === 0 ? (
                      <p className="text-xs text-Mist text-center py-8">Chưa có hoạt động nào được ghi nhận</p>
                    ) : (
                      adminSummary.recentLogs.slice(0, 4).map((log) => {
                        const readable = translateAuditLog(log)
                        const actorName = log.Users?.full_name || 'Quản trị viên'
                        return (
                          <div
                            key={log.id}
                            className="p-3 rounded-2xl bg-Snowflake/35 hover:bg-Snowflake/60 transition-colors flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold flex-shrink-0 ${readable.badgeClass}`}>
                                  {readable.badgeLabel}
                                </span>
                                <span className="font-extrabold text-Pine truncate">{actorName}</span>
                              </div>
                              <p className="text-[11px] font-semibold text-Branch/85 truncate">
                                {readable.description}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-[11px] font-bold text-Branch block">
                                {new Date(log.created_at).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <span className="text-[10px] text-Mist">
                                {new Date(log.created_at).toLocaleDateString('vi-VN')}
                              </span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-Mist/15 flex items-center justify-between text-[11px]">
                  <span className="text-Mist font-semibold">
                    Nhân sự hệ thống: {adminSummary.activeUsers} đang hoạt động · {adminSummary.lockedUsers} khóa
                  </span>
                  <Link to="/admin/roles" className="font-extrabold text-Pine hover:underline">
                    Ma trận Phân quyền →
                  </Link>
                </div>
              </>
            ) : role === 'Manager' ? (
              /* VIEW RIÊNG CỦA MANAGER: Hàng đợi Cảnh báo Chờ Duyệt */
              <>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-extrabold text-Pine flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-Berry" />
                        Cảnh báo Chờ Manager Phê duyệt ({pendingCount})
                      </h2>
                      <p className="text-[11px] text-Mist font-semibold">
                        Phê duyệt vi phạm để cập nhật điểm tín nhiệm đối tác
                      </p>
                    </div>
                    <Link to="/violations" className="text-xs font-extrabold text-Pine hover:underline">
                      Duyệt tất cả →
                    </Link>
                  </div>

                  <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                    {allViolations.filter((v) => v.status === 'Pending').length === 0 ? (
                      <div className="text-center py-8 bg-SafeBg rounded-2xl border border-SafeBorder">
                        <CheckCircle2 className="w-8 h-8 text-SafeGreen mx-auto mb-1.5" />
                        <p className="text-xs font-extrabold text-SafeGreen">Đã duyệt hoàn tất 100% cảnh báo!</p>
                      </div>
                    ) : (
                      allViolations
                        .filter((v) => v.status === 'Pending')
                        .slice(0, 4)
                        .map((v) => (
                          <div
                            key={v.id}
                            className="p-3 rounded-2xl bg-Snowflake/35 hover:bg-Snowflake/70 transition-colors flex items-center justify-between gap-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-extrabold text-Branch truncate">
                                {cleanVietnamesePdfText(v.violation_desc)}
                              </p>
                              <p className="text-[10px] font-semibold text-Mist truncate mt-0.5">
                                {v.Standards?.standard_code} · {v.Documents?.Suppliers?.company_name || v.Documents?.file_name}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <StatusBadge status={v.risk_level} />
                              {v.Documents?.id && (
                                <Link
                                  to={`/audit/${v.Documents.id}`}
                                  className="px-2.5 py-1 rounded-xl bg-Pine text-white hover:bg-Branch text-[11px] font-extrabold"
                                >
                                  Duyệt
                                </Link>
                              )}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-Mist/15 flex items-center justify-between text-[11px]">
                  <span className="text-Mist font-semibold">Ngưỡng SLA phản hồi: &ge; 80%</span>
                  <span className="font-extrabold text-Pine">Hiện đạt: {resolutionRate}%</span>
                </div>
              </>
            ) : (
              /* VIEW RIÊNG CỦA USER (AUDITOR): Hợp đồng PDF Đang Theo dõi */
              <>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-extrabold text-Pine flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-Pine" />
                        Hợp đồng PDF Đang Theo dõi
                      </h2>
                      <p className="text-[11px] text-Mist font-semibold">
                        Mở phòng kiểm toán Split-view để rà soát điều khoản
                      </p>
                    </div>
                    <Link to="/documents" className="text-xs font-extrabold text-Pine hover:underline">
                      Kho PDF →
                    </Link>
                  </div>

                  <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                    {recentDocs.length === 0 ? (
                      <div className="text-center py-8 bg-Snowflake/30 rounded-2xl">
                        <Upload className="w-7 h-7 text-Mist mx-auto mb-1.5" />
                        <p className="text-xs font-bold text-Pine">Chưa có hợp đồng PDF</p>
                      </div>
                    ) : (
                      recentDocs.slice(0, 4).map((doc) => (
                        <div
                          key={doc.id}
                          className="p-3 rounded-2xl bg-Snowflake/35 hover:bg-Snowflake/70 transition-colors flex items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <Link
                              to={`/audit/${doc.id}`}
                              className="text-xs font-extrabold text-Pine hover:underline truncate block"
                            >
                              {doc.file_name}
                            </Link>
                            <p className="text-[10px] text-Mist truncate">{doc.Suppliers?.company_name}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <StatusBadge status={doc.status} />
                            <Link
                              to={`/audit/${doc.id}`}
                              className="p-1.5 rounded-xl bg-white text-Pine hover:bg-Pine hover:text-white transition-colors shadow-sm"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-Mist/15 flex items-center justify-between text-[11px]">
                  <span className="text-Mist font-semibold">
                    Đã quét AI: {contractMetrics.totalAnalyzed}/{stats?.total_documents ?? 0} hợp đồng
                  </span>
                  <Link to="/documents" className="font-extrabold text-Pine hover:underline">
                    + Tải hợp đồng →
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  )
}