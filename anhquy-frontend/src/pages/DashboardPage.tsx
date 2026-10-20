import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { MainLayout } from '../components/MainLayout'
import { Modal, RiskScoreBar, Spinner, StatusBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import {
  dashboardApi,
  documentApi,
  violationApi,
  supplierApi,
  adminApi,
  standardApi,
} from '../api'
import {
  TrendingUp, FileText, AlertTriangle, Building2, Activity, ExternalLink,
  ShieldCheck, Users, ClipboardList, Download, Printer, Upload, Sparkles,
  CheckCircle2, Lock, SlidersHorizontal, ArrowUpRight, Calendar, Filter
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
  Documents?: { id?: number; file_name: string; Suppliers?: { company_name: string } }
  Standards?: { standard_code: string; name: string }
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

interface AdminSummary {
  totalUsers: number
  activeUsers: number
  lockedUsers: number
  recentLogs: Array<{
    id: number
    action_type: string
    target_table: string
    created_at: string
    Users?: { full_name: string; email: string } | null
  }>
}

interface UserStandardSummary {
  totalActiveStandards: number
  excludedCount: number
}

// ─── SVG Donut Chart Component (Luôn hiển thị đẹp kể cả khi = 0) ──────────────

function DonutChart({
  segments,
  centerTitle,
  centerSub,
}: {
  segments: Array<{ label: string; value: number; color: string; badgeClass: string }>
  centerTitle: string | number
  centerSub: string
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0)
  const radius = 54
  const circumference = 2 * Math.PI * radius
  let cumulativePercent = 0

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
      {/* SVG Ring */}
      <div className="relative w-36 h-36 flex items-center justify-center flex-shrink-0">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="transparent"
            stroke="#DCE0E8"
            strokeWidth="14"
          />
          {total === 0 ? (
            <circle
              cx="64"
              cy="64"
              r={radius}
              fill="transparent"
              stroke="#10B981"
              strokeWidth="14"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeOpacity={0.35}
            />
          ) : (
            segments.map((seg) => {
              if (seg.value <= 0) return null
              const pct = seg.value / total
              const dashArray = `${pct * circumference} ${circumference}`
              const dashOffset = -cumulativePercent * circumference
              cumulativePercent += pct
              return (
                <circle
                  key={seg.label}
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth="14"
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-700"
                />
              )
            })
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-extrabold text-Pine leading-none">{centerTitle}</span>
          <span className="text-[11px] font-semibold text-Mist mt-1">{centerSub}</span>
        </div>
      </div>

      {/* Legend & Progress Bars */}
      <div className="flex-1 w-full space-y-3">
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0
          return (
            <div key={seg.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
                  <span className="font-semibold text-Pine">{seg.label}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${seg.badgeClass}`}>
                  {seg.value} ({pct}%)
                </span>
              </div>
              <div className="h-2 bg-Snowflake rounded-md overflow-hidden">
                <div
                  className="h-full rounded-md transition-all duration-700"
                  style={{ width: `${total === 0 ? 0 : Math.max(pct, seg.value > 0 ? 6 : 0)}%`, backgroundColor: seg.color }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── KPI Card Pro ─────────────────────────────────────────────────────────────

function KpiCardPro({
  title,
  value,
  sub,
  icon,
  accentClass,
  to,
}: {
  title: string
  value: number | string
  sub: string
  icon: React.ReactNode
  accentClass: string
  to?: string
}) {
  const cardContent = (
    <div className="group bg-white rounded-lg border border-Mist/25 p-5 shadow-sm hover:shadow-md hover:border-Pine/30 transition-all duration-300 relative overflow-hidden">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-white shadow-sm ${accentClass}`}>
          {icon}
        </div>
        {to && (
          <span className="p-1.5 rounded-md bg-Snowflake/60 text-Mist group-hover:bg-Pine group-hover:text-white transition-colors">
            <ArrowUpRight className="w-4 h-4" />
          </span>
        )}
      </div>
      <div className="text-3xl font-extrabold text-Pine tracking-tight">
        {typeof value === 'number' ? value.toLocaleString('vi-VN') : value}
      </div>
      <div className="text-xs font-bold text-Branch mt-1">{title}</div>
      <div className="text-[11px] text-Mist mt-1 flex items-center gap-1">{sub}</div>
    </div>
  )

  return to ? <Link to={to}>{cardContent}</Link> : cardContent
}

// ─── Main Dashboard Page ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, role, hasPermission } = useAuth()

  const [stats, setStats] = useState<NormalizedStats | null>(null)
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([])
  const [recentViolations, setRecentViolations] = useState<RecentViolation[]>([])
  const [suppliersList, setSuppliersList] = useState<SupplierItem[]>([])
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

  // Report Studio Modal State
  const [exportOpen, setExportOpen] = useState(false)
  const [reportScope, setReportScope] = useState<'all' | 'violations' | 'suppliers'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [reportRiskFilter, setReportRiskFilter] = useState('')
  const [reportStatusFilter, setReportStatusFilter] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [statsRes, docsRes, violationsRes, supRes] = await Promise.all([
          dashboardApi.getStats().catch(() => ({ data: null })),
          documentApi.getAll({ page: 1, limit: 6 }).catch(() => ({ data: null })),
          violationApi.getAll({ page: 1, limit: 6 }).catch(() => ({ data: null })),
          supplierApi.getAll({ page: 1, limit: 50, is_deleted: false }).catch(() => ({ data: null })),
        ])

        const raw = statsRes?.data?.stats || statsRes?.data?.data || statsRes?.data || {}
        const pendingV = Number(raw?.violations?.by_status?.pending ?? raw?.pending_violations ?? 0)
        const approvedV = Number(raw?.violations?.by_status?.approved ?? 0)
        const rejectedV = Number(raw?.violations?.by_status?.rejected ?? 0)
        const computedTotalV =
          raw?.total_violations !== undefined
            ? Number(raw.total_violations)
            : pendingV + approvedV + rejectedV

        setStats({
          total_suppliers: Number(raw?.suppliers?.total ?? raw?.total_suppliers ?? 0),
          total_documents: Number(raw?.documents?.total ?? raw?.total_documents ?? 0),
          analyzing_documents: Number(raw?.documents?.analyzing ?? 0),
          analyzed_documents: Number(raw?.documents?.analyzed ?? 0),
          total_violations: computedTotalV,
          pending_violations: pendingV,
          approved_violations: approvedV,
          rejected_violations: rejectedV,
          supplier_risk_distribution: {
            Safe: Number(raw?.suppliers?.safe ?? raw?.supplier_risk_distribution?.Safe ?? 0),
            Warning: Number(raw?.suppliers?.warning ?? raw?.supplier_risk_distribution?.Warning ?? 0),
            Danger: Number(raw?.suppliers?.danger ?? raw?.supplier_risk_distribution?.Danger ?? 0),
          },
          violation_risk_distribution: {
            High: Number(raw?.violations?.by_risk_level?.high ?? raw?.violation_risk_distribution?.High ?? 0),
            Medium: Number(raw?.violations?.by_risk_level?.medium ?? raw?.violation_risk_distribution?.Medium ?? 0),
            Low: Number(raw?.violations?.by_risk_level?.low ?? raw?.violation_risk_distribution?.Low ?? 0),
          },
        })

        const docsData = docsRes?.data?.data || docsRes?.data || {}
        setRecentDocs((docsData as { items?: RecentDocument[] })?.items || [])

        const vData = violationsRes?.data?.data || violationsRes?.data || {}
        setRecentViolations((vData as { items?: RecentViolation[] })?.items || [])

        const sData = supRes?.data?.data || supRes?.data || {}
        setSuppliersList((sData as { items?: SupplierItem[] })?.items || [])

        // Role-specific data fetching
        if (role === 'Admin') {
          const [uRes, lRes] = await Promise.all([
            adminApi.getUsers({ page: 1, limit: 100 }).catch(() => ({ data: null })),
            adminApi.getAuditLogs({ page: 1, limit: 6 }).catch(() => ({ data: null })),
          ])
          const uPayload = uRes?.data?.data || uRes?.data || {}
          const uItems = (uPayload as { items?: Array<{ is_active: boolean }> })?.items || []
          const lPayload = lRes?.data?.data || lRes?.data || {}
          const lItems = (lPayload as { items?: AdminSummary['recentLogs'] })?.items || []

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

  // ─── Hàm xử lý Xuất Báo Cáo Đa Năng (Lọc theo Thời gian, Mức độ, Loại) ──────
  const filterByDate = (dateStr?: string) => {
    if (!dateStr) return true
    const t = new Date(dateStr).getTime()
    if (dateFrom) {
      const fromT = new Date(`${dateFrom}T00:00:00`).getTime()
      if (t < fromT) return false
    }
    if (dateTo) {
      const toT = new Date(`${dateTo}T23:59:59`).getTime()
      if (t > toT) return false
    }
    return true
  }

  const handleRunExport = async (mode: 'csv' | 'print') => {
    setExporting(true)
    try {
      const params: Record<string, string | number | undefined> = { limit: 1000 }
      if (reportRiskFilter) params.risk_level = reportRiskFilter
      if (reportStatusFilter) params.status = reportStatusFilter

      const [vRes, sRes] = await Promise.all([
        violationApi.getAll(params).catch(() => ({ data: { items: [] } })),
        supplierApi.getAll({ limit: 500, is_deleted: false }).catch(() => ({ data: { items: [] } })),
      ])

      const allViols: RecentViolation[] = (
        (vRes.data?.data || vRes.data || {}) as { items?: RecentViolation[] }
      ).items || []
      const allSups: SupplierItem[] = (
        (sRes.data?.data || sRes.data || {}) as { items?: SupplierItem[] }
      ).items || []

      const filteredViols = allViols.filter((v) => filterByDate(v.created_at))
      const filteredSups = allSups.filter((s) => filterByDate(s.created_at))

      if (mode === 'csv') {
        const BOM = '\uFEFF'
        let csvContent = BOM

        if (reportScope === 'suppliers' || reportScope === 'all') {
          csvContent += '=== BẢNG TỔNG HỢP ĐIỂM TÍN NHIỆM & RỦI RO NHÀ CUNG ỨNG ===\r\n'
          csvContent += 'ID,Tên Công Ty,Mã Số Thuế,Ngành Nghề,Điểm Tín Nhiệm,Xếp Loại,Ngày Tạo\r\n'
          filteredSups.forEach((s) => {
            const sc = s.risk_score ?? 100
            const rank = sc >= 80 ? 'An toàn' : sc >= 50 ? 'Cảnh báo' : 'Nguy hiểm'
            csvContent += `${s.id},"${s.company_name.replace(/"/g, '""')}",${s.tax_code},"${s.Categories?.name || ''}",${sc},${rank},${new Date(s.created_at).toLocaleDateString('vi-VN')}\r\n`
          })
          csvContent += '\r\n'
        }

        if (reportScope === 'violations' || reportScope === 'all') {
          csvContent += '=== BẢNG CHI TIẾT CẢNH BÁO VI PHẠM HỢP ĐỒNG ===\r\n'
          csvContent += 'ID,Nhà Cung Ứng,Hợp Đồng,Mã Tiêu Chuẩn,Mức Độ Rủi Ro,Trạng Thái,Mô Tả Vi Phạm,Ngày Phát Hiện\r\n'
          filteredViols.forEach((v) => {
            csvContent += `${v.id},"${(v.Documents?.Suppliers?.company_name || '').replace(/"/g, '""')}","${(v.Documents?.file_name || '').replace(/"/g, '""')}",${v.Standards?.standard_code || ''},${v.risk_level},${v.status},"${(v.violation_desc || '').replace(/"/g, '""')}",${new Date(v.created_at).toLocaleDateString('vi-VN')}\r\n`
          })
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Bao-Cao-Kiem-Toan-ANHQUY-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Đã xuất file Báo cáo Excel/CSV thành công!')
        setExportOpen(false)
      } else {
        const win = window.open('', '_blank')
        if (!win) {
          toast.error('Vui lòng cho phép mở Popup để in báo cáo PDF.')
          return
        }
        const supRows = filteredSups
          .map(
            (s) => `
          <tr>
            <td>${s.company_name}</td>
            <td>${s.tax_code}</td>
            <td>${s.Categories?.name || '—'}</td>
            <td><strong>${s.risk_score ?? 100}/100</strong></td>
            <td>${(s.risk_score ?? 100) >= 80 ? 'An toàn' : (s.risk_score ?? 100) >= 50 ? 'Cảnh báo' : 'Nguy hiểm'}</td>
          </tr>`
          )
          .join('')

        const violRows = filteredViols
          .map(
            (v) => `
          <tr>
            <td>${v.Documents?.Suppliers?.company_name || '—'}</td>
            <td>${v.Documents?.file_name || '—'}</td>
            <td>${v.Standards?.standard_code || '—'}</td>
            <td><strong>${v.risk_level}</strong></td>
            <td>${v.status}</td>
            <td>${v.violation_desc}</td>
          </tr>`
          )
          .join('')

        win.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
          <title>Báo cáo Kiểm toán Hệ thống ANHQUY</title>
          <style>
            body{font-family:"Be Vietnam Pro",sans-serif;margin:36px;color:#27363F}
            h1{font-size:20px;margin:0}h2{font-size:14px;margin:24px 0 8px;text-transform:uppercase;color:#6B212C}
            table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px}
            th{background:#27363F;color:#fff;padding:8px;text-align:left}
            td{padding:8px;border-bottom:1px solid #DCE0E8}
          </style></head><body>
          <div style="border-bottom:2px solid #27363F;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between">
            <div>
              <h1>BÁO CÁO TỔNG HỢP KIỂM TOÁN CHUỖI CUNG ỨNG (ANHQUY)</h1>
              <p style="font-size:12px;color:#685652;margin:4px 0 0">
                Người xuất: ${user?.full_name || ''} (${role}) · Ngày xuất: ${new Date().toLocaleString('vi-VN')}
                ${dateFrom || dateTo ? ` · Kỳ lọc: ${dateFrom || 'Đầu'} đến ${dateTo || 'Hiện tại'}` : ' · Phạm vi: Toàn bộ thời gian'}
              </p>
            </div>
            <div style="font-weight:900;font-size:24px">ANHQUY</div>
          </div>
          ${
            reportScope !== 'violations'
              ? `<h2>1. Danh sách & Điểm tín nhiệm Nhà cung ứng (${filteredSups.length})</h2>
                 <table><thead><tr><th>Tên Công ty</th><th>MST</th><th>Ngành nghề</th><th>Điểm</th><th>Mức độ</th></tr></thead><tbody>${supRows || '<tr><td colspan="5">Không có dữ liệu</td></tr>'}</tbody></table>`
              : ''
          }
          ${
            reportScope !== 'suppliers'
              ? `<h2>2. Chi tiết Cảnh báo Vi phạm Hợp đồng (${filteredViols.length})</h2>
                 <table><thead><tr><th>Đối tác</th><th>Hợp đồng</th><th>Mã Chuẩn</th><th>Rủi ro</th><th>Trạng thái</th><th>Nội dung</th></tr></thead><tbody>${violRows || '<tr><td colspan="6">Không có vi phạm nào</td></tr>'}</tbody></table>`
              : ''
          }
        </body></html>`)
        win.document.close()
        win.onload = () => {
          win.print()
          win.close()
        }
        setExportOpen(false)
      }
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <MainLayout breadcrumb="Bảng điều khiển">
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      </MainLayout>
    )
  }

  const todayStr = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const roleBannerInfo =
    role === 'Admin'
      ? {
          badge: 'TRUNG TÂM QUẢN TRỊ HỆ THỐNG (IAM & GOVERNANCE)',
          subtitle: 'Giám sát toàn vẹn phân quyền RBAC, nhật ký bảo mật, cấu hình AI và bộ tiêu chuẩn gốc.',
        }
      : role === 'Manager'
      ? {
          badge: 'TRUNG TÂM THẨM ĐỊNH PHÁP CHẾ & QUẢN TRỊ RỦI RO (MANAGER)',
          subtitle: 'Phê duyệt cảnh báo vi phạm do AI phát hiện, kiểm soát điểm tín nhiệm đối tác và kết xuất báo cáo.',
        }
      : {
          badge: 'KHÔNG GIAN KIỂM TOÁN HỢP ĐỒNG AI (AUDITOR WORKSPACE)',
          subtitle: 'Tải lên hợp đồng PDF, tùy chỉnh bộ tiêu chuẩn rà soát và kích hoạt AI RAG trích xuất bằng chứng.',
        }

  return (
    <MainLayout breadcrumb="Bảng điều khiển">
      <div className="space-y-6">
        {/* ─── 1. Executive Hero Banner (Sang trọng, phân biệt rõ từng Role) ── */}
        <div className="bg-gradient-to-r from-Pine via-Pine to-Branch rounded-lg p-6 text-white shadow-md relative overflow-hidden">
          <div
            className="absolute -right-12 -bottom-16 w-72 h-72 rounded-lg opacity-20 pointer-events-none blur-2xl"
            style={{ background: 'radial-gradient(circle, #BEB3AC 0%, transparent 70%)' }}
          />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded bg-white/15 text-Frostysilver text-[11px] font-extrabold tracking-wider uppercase">
                  {roleBannerInfo.badge}
                </span>
                <span className="text-xs text-Snowflake/70 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> {todayStr}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Xin chào, {user?.full_name || 'Quản trị viên'}!
              </h1>
              <p className="text-xs sm:text-sm text-Snowflake/80 mt-1 max-w-2xl">
                {roleBannerInfo.subtitle}
              </p>
            </div>

            {/* Quick Action Buttons theo đúng Role */}
            <div className="flex flex-wrap items-center gap-2.5">
              {hasPermission('UPLOAD_DOC') && (
                <Link
                  to="/documents"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-Pine text-xs font-extrabold rounded-md hover:bg-Snowflake transition-all shadow-sm"
                >
                  <Upload className="w-4 h-4 text-Berry" />
                  Tải lên & Quét AI Hợp đồng
                </Link>
              )}
              {role === 'Admin' && (
                <Link
                  to="/admin/users"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-Pine text-xs font-extrabold rounded-md hover:bg-Snowflake transition-all shadow-sm"
                >
                  <Users className="w-4 h-4 text-Berry" />
                  Quản lý Tài khoản ({adminSummary.totalUsers})
                </Link>
              )}
              {hasPermission('EXPORT_REPORT') && (
                <button
                  type="button"
                  onClick={() => setExportOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-Berry text-white text-xs font-extrabold rounded-md hover:bg-Berry/90 transition-all shadow-sm border border-white/15"
                >
                  <Download className="w-4 h-4" />
                  Trung tâm Xuất Báo cáo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ─── 2. Role-Adaptive KPI Cards (4 thẻ chính + Chỉ số theo Role) ─── */}
        {role === 'Admin' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCardPro
              title="Tổng Tài khoản Hệ thống"
              value={adminSummary.totalUsers}
              sub={`${adminSummary.activeUsers} đang hoạt động · ${adminSummary.lockedUsers} đã khóa`}
              icon={<Users className="w-5 h-5" />}
              accentClass="bg-Pine"
              to="/admin/users"
            />
            <KpiCardPro
              title="Đối tác Chuỗi cung ứng"
              value={stats?.total_suppliers ?? 0}
              sub={`${stats?.supplier_risk_distribution.Safe ?? 0} đối tác đạt ngưỡng An toàn`}
              icon={<Building2 className="w-5 h-5" />}
              accentClass="bg-Branch"
              to="/suppliers"
            />
            <KpiCardPro
              title="Hợp đồng lưu trữ (SHA-256)"
              value={stats?.total_documents ?? 0}
              sub={`${stats?.analyzed_documents ?? 0} hợp đồng đã quét AI`}
              icon={<FileText className="w-5 h-5" />}
              accentClass="bg-emerald-600"
              to="/documents"
            />
            <KpiCardPro
              title="Sự kiện Nhật ký Kiểm toán"
              value={adminSummary.recentLogs.length > 0 ? `${adminSummary.recentLogs[0]?.action_type}` : 'An toàn'}
              sub="Ghi vết tự động mọi thao tác nhạy cảm"
              icon={<ClipboardList className="w-5 h-5" />}
              accentClass="bg-Berry"
              to="/admin/audit-logs"
            />
          </div>
        ) : role === 'Manager' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCardPro
              title="Vi phạm Chờ Thẩm định"
              value={stats?.pending_violations ?? 0}
              sub="Cần Manager phê duyệt hoặc bác bỏ"
              icon={<Activity className="w-5 h-5" />}
              accentClass="bg-Berry"
              to="/violations"
            />
            <KpiCardPro
              title="Tổng Cảnh báo AI Phát hiện"
              value={stats?.total_violations ?? 0}
              sub={`${stats?.approved_violations ?? 0} đã duyệt · ${stats?.rejected_violations ?? 0} đã bác bỏ`}
              icon={<AlertTriangle className="w-5 h-5" />}
              accentClass="bg-amber-500"
              to="/violations"
            />
            <KpiCardPro
              title="Nhà cung ứng Đang giám sát"
              value={stats?.total_suppliers ?? 0}
              sub={`${stats?.supplier_risk_distribution.Danger ?? 0} đối tác vùng Nguy hiểm (<50đ)`}
              icon={<Building2 className="w-5 h-5" />}
              accentClass="bg-Pine"
              to="/suppliers"
            />
            <KpiCardPro
              title="Hợp đồng PDF Đã kiểm toán"
              value={stats?.analyzed_documents ?? 0}
              sub={`Trên tổng số ${stats?.total_documents ?? 0} hợp đồng tải lên`}
              icon={<FileText className="w-5 h-5" />}
              accentClass="bg-Branch"
              to="/documents"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCardPro
              title="Kho Hợp đồng PDF"
              value={stats?.total_documents ?? 0}
              sub={`${stats?.analyzed_documents ?? 0} đã quét AI · ${stats?.analyzing_documents ?? 0} đang xử lý`}
              icon={<FileText className="w-5 h-5" />}
              accentClass="bg-Pine"
              to="/documents"
            />
            <KpiCardPro
              title="Bộ Tiêu chuẩn Quét AI"
              value={userStdSummary.totalActiveStandards - userStdSummary.excludedCount}
              sub={`Đang bật (${userStdSummary.excludedCount} tiêu chuẩn đang tạm tắt)`}
              icon={<SlidersHorizontal className="w-5 h-5" />}
              accentClass="bg-emerald-600"
              to="/standards"
            />
            <KpiCardPro
              title="Cảnh báo AI Phát hiện"
              value={stats?.total_violations ?? 0}
              sub={`${stats?.pending_violations ?? 0} cảnh báo đang chờ Manager duyệt`}
              icon={<Sparkles className="w-5 h-5" />}
              accentClass="bg-Berry"
              to="/violations"
            />
            <KpiCardPro
              title="Đối tác Cung ứng"
              value={stats?.total_suppliers ?? 0}
              sub="Hồ sơ nhà cung cấp đang hoạt động"
              icon={<Building2 className="w-5 h-5" />}
              accentClass="bg-Branch"
              to="/suppliers"
            />
          </div>
        )}

        {/* ─── 3. Visual Donut Charts (Trực quan sinh động ngay cả khi = 0) ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Donut 1: Phân bổ Rủi ro Đối tác */}
          <div className="bg-white rounded-lg border border-Mist/25 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-Mist/15">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-Pine" />
                <h3 className="font-bold text-Pine text-sm">
                  Cơ cấu Tín nhiệm & Rủi ro Nhà cung ứng
                </h3>
              </div>
              <Link to="/suppliers" className="text-xs font-semibold text-Pine hover:underline">
                Chi tiết →
              </Link>
            </div>
            <DonutChart
              centerTitle={stats?.total_suppliers ?? 0}
              centerSub="Đối tác"
              segments={[
                {
                  label: 'An toàn (80–100đ)',
                  value: stats?.supplier_risk_distribution.Safe ?? 0,
                  color: '#10B981',
                  badgeClass: 'bg-emerald-50 text-emerald-700',
                },
                {
                  label: 'Cảnh báo (50–79đ)',
                  value: stats?.supplier_risk_distribution.Warning ?? 0,
                  color: '#F59E0B',
                  badgeClass: 'bg-amber-50 text-amber-700',
                },
                {
                  label: 'Nguy hiểm (<50đ)',
                  value: stats?.supplier_risk_distribution.Danger ?? 0,
                  color: '#6B212C',
                  badgeClass: 'bg-Berry/10 text-Berry',
                },
              ]}
            />
          </div>

          {/* Donut 2: Phân bổ Mức độ Cảnh báo Vi phạm */}
          <div className="bg-white rounded-lg border border-Mist/25 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-Mist/15">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-Berry" />
                <h3 className="font-bold text-Pine text-sm">
                  Phân tích Mức độ Vi phạm Hợp đồng (AI RAG)
                </h3>
              </div>
              <Link to="/violations" className="text-xs font-semibold text-Pine hover:underline">
                Thẩm định →
              </Link>
            </div>
            <DonutChart
              centerTitle={stats?.total_violations === 0 ? '100%' : stats?.total_violations ?? 0}
              centerSub={stats?.total_violations === 0 ? 'Tuân thủ' : 'Cảnh báo'}
              segments={[
                {
                  label: 'Rủi ro Cao (-10đ)',
                  value: stats?.violation_risk_distribution.High ?? 0,
                  color: '#6B212C',
                  badgeClass: 'bg-Berry/10 text-Berry',
                },
                {
                  label: 'Trung bình (-5đ)',
                  value: stats?.violation_risk_distribution.Medium ?? 0,
                  color: '#F59E0B',
                  badgeClass: 'bg-amber-50 text-amber-700',
                },
                {
                  label: 'Rủi ro Thấp (-2đ)',
                  value: stats?.violation_risk_distribution.Low ?? 0,
                  color: '#27363F',
                  badgeClass: 'bg-Snowflake text-Pine',
                },
              ]}
            />
          </div>
        </div>

        {/* ─── 4. Khu vực Chuyên biệt theo từng Role (Admin vs Manager/User) ── */}
        {role === 'Admin' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Admin Box 1: Nhật ký Kiểm toán Bảo mật Mới nhất */}
            <div className="bg-white rounded-lg border border-Mist/25 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-Mist/15 flex items-center justify-between bg-Snowflake/30">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-Pine" />
                  <h3 className="font-bold text-Pine text-sm">Nhật ký Kiểm toán Hệ thống Mới nhất</h3>
                </div>
                <Link to="/admin/audit-logs" className="text-xs font-semibold text-Pine hover:underline">
                  Xem toàn bộ →
                </Link>
              </div>
              <div className="divide-y divide-Mist/15">
                {adminSummary.recentLogs.length === 0 ? (
                  <p className="text-xs text-Mist text-center py-10">Chưa có bản ghi nhật ký nào</p>
                ) : (
                  adminSummary.recentLogs.map((log) => (
                    <div key={log.id} className="px-5 py-3 flex items-center justify-between hover:bg-Snowflake/40 transition-colors">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-Pine/10 text-Pine font-mono text-[11px] font-bold">
                            {log.action_type}
                          </span>
                          <span className="text-xs font-semibold text-Branch">
                            bảng <code className="font-mono text-Pine">{log.target_table}</code>
                          </span>
                        </div>
                        <p className="text-[11px] text-Mist mt-0.5">
                          Thực hiện bởi: <strong className="text-Branch">{log.Users?.full_name || 'Hệ thống'}</strong>
                        </p>
                      </div>
                      <span className="text-[11px] text-Mist whitespace-nowrap">
                        {new Date(log.created_at).toLocaleTimeString('vi-VN')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Admin Box 2: Lối tắt Quản trị & Ma trận RBAC */}
            <div className="bg-white rounded-lg border border-Mist/25 shadow-sm p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4 text-Berry" />
                  <h3 className="font-bold text-Pine text-sm">Trạng thái Quản trị & Phân quyền RBAC</h3>
                </div>
                <p className="text-xs text-Branch leading-relaxed mb-4">
                  Hệ thống vận hành với 3 Vai trò (<strong className="text-Pine">Admin, Manager, User</strong>) và{' '}
                  <strong className="text-Pine">19 Mã quyền hạn</strong> kiểm soát thời gian thực tới từng API.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Link
                    to="/admin/roles"
                    className="p-3.5 rounded-lg border border-Mist/30 hover:border-Pine bg-Snowflake/30 hover:bg-Snowflake/70 transition-all"
                  >
                    <p className="text-xs font-bold text-Pine">Ma trận Phân quyền RBAC</p>
                    <p className="text-[11px] text-Mist mt-1">Cấp / thu hồi quyền áp dụng tức thì</p>
                  </Link>
                  <Link
                    to="/admin/system-configs"
                    className="p-3.5 rounded-lg border border-Mist/30 hover:border-Pine bg-Snowflake/30 hover:bg-Snowflake/70 transition-all"
                  >
                    <p className="text-xs font-bold text-Pine">Cấu hình Tham số & Điểm trừ</p>
                    <p className="text-[11px] text-Mist mt-1">Điều chỉnh AI, Brute-force & Ngưỡng rủi ro</p>
                  </Link>
                  <Link
                    to="/standards"
                    className="p-3.5 rounded-lg border border-Mist/30 hover:border-Pine bg-Snowflake/30 hover:bg-Snowflake/70 transition-all"
                  >
                    <p className="text-xs font-bold text-Pine">24 Tiêu chuẩn RBA & VN Gốc</p>
                    <p className="text-[11px] text-Mist mt-1">Quản lý bộ quy chuẩn pháp lý nền tảng</p>
                  </Link>
                  <Link
                    to="/categories"
                    className="p-3.5 rounded-lg border border-Mist/30 hover:border-Pine bg-Snowflake/30 hover:bg-Snowflake/70 transition-all"
                  >
                    <p className="text-xs font-bold text-Pine">Danh mục Ngành & Hợp đồng</p>
                    <p className="text-[11px] text-Mist mt-1">Tự động ánh xạ Category_Standards</p>
                  </Link>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-Mist/15 flex items-center justify-between text-xs text-Mist">
                <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Cơ sở dữ liệu 15 bảng chuẩn 3NF
                </span>
                <span className="font-mono">SQL Server + ChromaDB</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* ─── 5. Bảng Xếp hạng Tín nhiệm Đối tác & Hợp đồng / Vi phạm Mới ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Cột 1: Bảng theo dõi điểm tín nhiệm Nhà cung ứng */}
          <div className="bg-white rounded-lg border border-Mist/25 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-Mist/15 flex items-center justify-between bg-Snowflake/30">
              <h3 className="font-bold text-Pine text-sm">Bảng Tín nhiệm Nhà cung ứng</h3>
              <Link to="/suppliers" className="text-xs font-semibold text-Pine hover:underline">
                Tất cả →
              </Link>
            </div>
            <div className="divide-y divide-Mist/15">
              {suppliersList.length === 0 ? (
                <p className="text-xs text-Mist text-center py-10">Chưa có nhà cung ứng nào</p>
              ) : (
                suppliersList.slice(0, 5).map((sup) => (
                  <div key={sup.id} className="px-5 py-3 hover:bg-Snowflake/40 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-Pine truncate pr-2">{sup.company_name}</span>
                      <span className="text-[11px] font-mono text-Mist">{sup.tax_code}</span>
                    </div>
                    <RiskScoreBar score={sup.risk_score} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cột 2: Hợp đồng mới tải lên */}
          <div className="bg-white rounded-lg border border-Mist/25 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-Mist/15 flex items-center justify-between bg-Snowflake/30">
              <h3 className="font-bold text-Pine text-sm">Hợp đồng PDF Gần đây</h3>
              <Link to="/documents" className="text-xs font-semibold text-Pine hover:underline">
                Kho hợp đồng →
              </Link>
            </div>
            <div className="divide-y divide-Mist/15">
              {recentDocs.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <FileText className="w-8 h-8 text-Mist/50 mx-auto mb-2" />
                  <p className="text-xs text-Branch font-medium">Chưa có hợp đồng PDF nào được tải lên</p>
                  {hasPermission('UPLOAD_DOC') && (
                    <Link
                      to="/documents"
                      className="inline-block mt-2 px-3 py-1.5 bg-Pine text-white text-xs font-semibold rounded-md hover:bg-Pine/90"
                    >
                      + Tải hợp đồng đầu tiên
                    </Link>
                  )}
                </div>
              ) : (
                recentDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between px-5 py-3 hover:bg-Snowflake/40 transition-colors gap-2">
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/audit/${doc.id}`}
                        className="text-xs font-bold text-Pine hover:underline truncate block"
                      >
                        {doc.file_name}
                      </Link>
                      <p className="text-[11px] text-Mist truncate">{doc.Suppliers?.company_name}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={doc.status} />
                      <Link
                        to={`/audit/${doc.id}`}
                        title="Mở Phòng Kiểm toán Split-view"
                        className="p-1 text-Mist hover:text-Pine rounded transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cột 3: Cảnh báo Vi phạm gần đây */}
          <div className="bg-white rounded-lg border border-Mist/25 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-Mist/15 flex items-center justify-between bg-Snowflake/30">
              <h3 className="font-bold text-Pine text-sm">Cảnh báo Vi phạm Mới nhất</h3>
              <Link to="/violations" className="text-xs font-semibold text-Pine hover:underline">
                Thẩm định →
              </Link>
            </div>
            <div className="divide-y divide-Mist/15">
              {recentViolations.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500/70 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-Pine">Hệ thống hiện không có cảnh báo tồn đọng</p>
                  <p className="text-[11px] text-Mist mt-0.5">Các đối tác đang duy trì mức tuân thủ tốt</p>
                </div>
              ) : (
                recentViolations.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-5 py-3 hover:bg-Snowflake/40 transition-colors gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-Pine truncate">{v.violation_desc}</p>
                      <p className="text-[11px] text-Mist truncate">
                        {v.Documents?.Suppliers?.company_name || v.Documents?.file_name}
                      </p>
                    </div>
                    <StatusBadge status={v.risk_level} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Modal Trung tâm Kết xuất Báo cáo Đa năng (Query & Full Export) ── */}
      <Modal
        isOpen={exportOpen}
        title="Trung tâm Kết xuất Báo cáo Kiểm toán (Report Studio)"
        onClose={() => setExportOpen(false)}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-Branch leading-relaxed">
            Tùy chọn xuất <strong>Toàn bộ dữ liệu</strong> hoặc lọc chi tiết theo <strong>Khoảng thời gian, Mức độ rủi ro và Trạng thái thẩm định</strong>.
          </p>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-Pine mb-1.5">
              1. Phạm vi nội dung báo cáo
            </label>
            <select
              value={reportScope}
              onChange={(e) => setReportScope(e.target.value as typeof reportScope)}
              className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm bg-white text-Pine font-medium focus:outline-none focus:border-Pine"
            >
              <option value="all">Báo cáo Toàn diện (Điểm tín nhiệm Đối tác + Chi tiết Vi phạm)</option>
              <option value="suppliers">Chỉ xuất Bảng Xếp hạng Rủi ro Nhà cung ứng</option>
              <option value="violations">Chỉ xuất Danh sách Cảnh báo Vi phạm Hợp đồng</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-Pine mb-1.5">
                Từ ngày (Tùy chọn)
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-Mist/40 rounded-md text-sm bg-white text-Branch"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-Pine mb-1.5">
                Đến ngày (Tùy chọn)
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-Mist/40 rounded-md text-sm bg-white text-Branch"
              />
            </div>
          </div>

          {reportScope !== 'suppliers' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-Pine mb-1.5">
                  Lọc Mức độ rủi ro
                </label>
                <select
                  value={reportRiskFilter}
                  onChange={(e) => setReportRiskFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-Mist/40 rounded-md text-sm bg-white text-Branch"
                >
                  <option value="">Tất cả mức độ (High, Medium, Low)</option>
                  <option value="High">Chỉ mức Cao (High)</option>
                  <option value="Medium">Chỉ mức Trung bình (Medium)</option>
                  <option value="Low">Chỉ mức Thấp (Low)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-Pine mb-1.5">
                  Lọc Trạng thái duyệt
                </label>
                <select
                  value={reportStatusFilter}
                  onChange={(e) => setReportStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-Mist/40 rounded-md text-sm bg-white text-Branch"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="Approved">Đã phê duyệt (Approved)</option>
                  <option value="Pending">Chờ thẩm định (Pending)</option>
                  <option value="Rejected">Đã bác bỏ (Rejected)</option>
                </select>
              </div>
            </div>
          )}

          <div className="bg-Snowflake/60 rounded-md p-3 border border-Mist/20 flex items-center justify-between text-xs text-Branch">
            <span className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-Pine" />
              {dateFrom || dateTo || reportRiskFilter || reportStatusFilter
                ? 'Đang áp dụng bộ lọc truy vấn tùy chỉnh'
                : 'Đang chọn xuất 100% dữ liệu toàn hệ thống'}
            </span>
            {(dateFrom || dateTo || reportRiskFilter || reportStatusFilter) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom('')
                  setDateTo('')
                  setReportRiskFilter('')
                  setReportStatusFilter('')
                }}
                className="text-Berry font-bold hover:underline"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              disabled={exporting}
              onClick={() => handleRunExport('csv')}
              className="flex-1 py-2.5 bg-Pine text-white text-xs font-bold rounded-md hover:bg-Pine/90 transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <Download className="w-4 h-4" />
              Xuất File Excel / CSV (UTF-8)
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => handleRunExport('print')}
              className="flex-1 py-2.5 bg-Berry text-white text-xs font-bold rounded-md hover:bg-Berry/90 transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              In / Xuất Báo cáo PDF
            </button>
          </div>
        </div>
      </Modal>
    </MainLayout>
  )
}