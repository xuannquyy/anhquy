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
import {
  FileText, AlertTriangle, Building2, Activity, ExternalLink,
  Users, ClipboardList, Upload, Sparkles,
  CheckCircle2, SlidersHorizontal, ArrowUpRight, Calendar as CalendarIcon,
  BarChart3, Layers, ChevronLeft, ChevronRight, ListChecks
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

interface StandardGroupStat {
  id: number
  group_code: string
  group_name: string
  Standards?: Array<{ id: number }>
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

// ─── 1. Thẻ KPI Bento chuẩn tông màu Winter (Không còn các nhãn vô nghĩa) ────

function BentoKpiCard({
  title,
  value,
  sub,
  icon,
  chartType,
  tone,
  to,
}: {
  title: string
  value: number | string
  sub: string
  icon: React.ReactNode
  chartType: 'bars' | 'equalizer' | 'sparkline' | 'ring'
  tone: 'pine' | 'berry' | 'mist' | 'branch'
  to?: string
}) {
  // Chỉ sử dụng đúng 6 mã màu của bangtongmau.jpg & image_1ab65a.jpg
  const palette = {
    pine:   { iconBg: 'bg-Pine text-Snowflake',       stroke: '#27363F', fill: '#8EA1AE' },
    berry:  { iconBg: 'bg-Berry text-Snowflake',      stroke: '#6B212C', fill: '#BEB3AC' },
    mist:   { iconBg: 'bg-Mist text-Pine',            stroke: '#8EA1AE', fill: '#27363F' },
    branch: { iconBg: 'bg-Branch text-Snowflake',     stroke: '#685652', fill: '#BEB3AC' },
  }[tone]

  const content = (
    <div className="group bg-white/95 backdrop-blur-md rounded-3xl border border-white p-5 shadow-[0_10px_28px_rgba(39,54,63,0.06)] hover:shadow-[0_16px_36px_rgba(39,54,63,0.12)] hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-extrabold text-Branch mb-2.5 truncate">
          {title}
        </div>

        <div className="flex items-center gap-3.5">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0 ${palette.iconBg}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-2xl sm:text-3xl font-extrabold text-Pine tracking-tight leading-none">
              {typeof value === 'number' ? value.toLocaleString('vi-VN') : value}
            </div>
            <p className="text-[11px] font-semibold text-Mist mt-1 truncate">{sub}</p>
          </div>
        </div>
      </div>

      {/* Đồ họa Mini chuẩn bảng màu Winter */}
      <div className="w-20 h-14 flex items-end justify-end flex-shrink-0">
        {chartType === 'bars' && (
          <div className="flex items-end gap-1.5 h-12">
            {[40, 65, 50, 85, 100].map((h, i) => (
              <div
                key={i}
                className="w-2.5 rounded-t-md transition-all duration-500 group-hover:scale-y-110 origin-bottom"
                style={{
                  height: `${h}%`,
                  backgroundColor: i === 4 ? palette.stroke : '#DCE0E8',
                }}
              />
            ))}
          </div>
        )}
        {chartType === 'equalizer' && (
          <div className="flex items-center gap-1.5 h-12">
            {[75, 95, 60, 100, 80, 90].map((h, i) => (
              <div key={i} className="w-1.5 h-full bg-Snowflake rounded-full overflow-hidden flex flex-col justify-end">
                <div
                  className="w-full rounded-full transition-all duration-500"
                  style={{ height: `${h}%`, backgroundColor: i % 2 === 0 ? palette.stroke : palette.fill }}
                />
              </div>
            ))}
          </div>
        )}
        {chartType === 'sparkline' && (
          <svg className="w-20 h-12 overflow-visible" viewBox="0 0 80 48">
            <path
              d="M 4 38 Q 20 18, 34 28 T 62 12 L 76 18"
              fill="none"
              stroke={palette.stroke}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="34" cy="28" r="3" fill={palette.fill} />
            <circle cx="62" cy="12" r="3.5" fill={palette.stroke} />
          </svg>
        )}
        {chartType === 'ring' && (
          <div className="relative w-12 h-12 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="18" fill="none" stroke="#DCE0E8" strokeWidth="5" />
              <circle
                cx="24"
                cy="24"
                r="18"
                fill="none"
                stroke={palette.stroke}
                strokeWidth="5"
                strokeDasharray="88 113"
                strokeLinecap="round"
              />
            </svg>
            <ArrowUpRight className="w-4 h-4 text-Pine absolute" />
          </div>
        )}
      </div>
    </div>
  )

  return to ? <Link to={to}>{content}</Link> : content
}

// ─── 2. Biểu đồ Cột 4 Nhóm Tiêu chuẩn RBA & Pháp luật VN (Chuẩn logic 100%) ──

function StandardGroupsChart({
  groups,
}: {
  groups: Array<{ code: string; shortName: string; fullName: string; count: number }>
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number>(0)
  const maxVal = Math.max(8, ...groups.map((g) => g.count))
  const totalStds = groups.reduce((acc, g) => acc + g.count, 0)

  return (
    <div className="pt-6 pb-2 flex flex-col justify-between flex-1">
      <div className="grid grid-cols-4 gap-4 items-end h-40 px-3">
        {groups.map((item, idx) => {
          const heightPct = Math.max(25, Math.round((item.count / maxVal) * 100))
          const isFocus = hoveredIdx === idx
          return (
            <div
              key={item.code}
              onMouseEnter={() => setHoveredIdx(idx)}
              className="relative flex flex-col items-center justify-end h-full cursor-pointer group"
            >
              {/* Tooltip nổi khi rê chuột */}
              {isFocus && (
                <div className="absolute -top-9 z-10 bg-Pine text-white px-3 py-1 rounded-xl text-[11px] font-extrabold whitespace-nowrap shadow-lg flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-Frostysilver" />
                  <span>{item.count} tiêu chuẩn ({totalStds > 0 ? Math.round((item.count / totalStds) * 100) : 0}%)</span>
                </div>
              )}

              {/* Cột Pill mang sắc thái Berry & Pine của image_1ab65a.jpg */}
              <div className="w-8 sm:w-10 h-full bg-Snowflake/70 rounded-2xl flex flex-col justify-end p-1 border border-Mist/20">
                <div
                  className={`w-full rounded-xl transition-all duration-500 ${
                    isFocus
                      ? 'bg-gradient-to-t from-Pine via-Branch to-Berry shadow-[0_6px_18px_rgba(107,33,44,0.35)]'
                      : 'bg-Pine/85 group-hover:bg-Berry'
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className={`text-xs mt-2.5 font-extrabold ${isFocus ? 'text-Berry' : 'text-Pine'}`}>
                {item.shortName}
              </span>
              <span className="text-[10px] font-semibold text-Mist">
                {item.count} chuẩn
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 3. Đồng hồ Đo Tín nhiệm Chia Vạch (Winter Palette) ─────────────────────

function SegmentedSpeedometer({
  avgScore,
  totalSuppliers,
}: {
  avgScore: number
  totalSuppliers: number
}) {
  const totalTicks = 28
  const activeTicks = Math.round((Math.max(0, Math.min(100, avgScore)) / 100) * totalTicks)

  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div className="relative w-44 h-44 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
          {Array.from({ length: totalTicks }).map((_, idx) => {
            const angle = (idx / totalTicks) * 360
            const isFilled = idx < activeTicks
            const tickColor =
              idx < activeTicks
                ? avgScore >= 80
                  ? '#27363F'
                  : avgScore >= 50
                  ? '#685652'
                  : '#6B212C'
                : '#DCE0E8'
            return (
              <g key={idx} transform={`rotate(${angle} 80 80)`}>
                <rect
                  x="77"
                  y="8"
                  width="6"
                  height="16"
                  rx="3"
                  fill={tickColor}
                  opacity={isFilled ? 1 : 0.55}
                />
                <rect
                  x="78"
                  y="28"
                  width="4"
                  height="8"
                  rx="2"
                  fill={isFilled ? '#8EA1AE' : '#DCE0E8'}
                  opacity={isFilled ? 0.85 : 0.35}
                />
              </g>
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-extrabold text-Pine tracking-tight">{avgScore}</span>
          <span className="text-[11px] font-bold text-Mist uppercase tracking-wider mt-0.5">
            Điểm TB / 100
          </span>
          <span className="mt-1 px-2.5 py-0.5 rounded-lg bg-Snowflake text-[10px] font-bold text-Pine">
            {totalSuppliers} đối tác
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── 4. Biểu đồ Sóng Khu vực Mượt (Pine & Berry Editorial Contrast) ──────────

function SmoothAreaWaveChart({
  docsCount,
  violsCount,
}: {
  docsCount: number
  violsCount: number
}) {
  const months = ['T5', 'T6', 'T7', 'T8', 'T9', 'T10']

  return (
    <div className="pt-2">
      <div className="relative h-44 w-full">
        <svg className="w-full h-full overflow-visible" viewBox="0 0 480 160" preserveAspectRatio="none">
          <defs>
            <linearGradient id="pineWaveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8EA1AE" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#DCE0E8" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="berryWaveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6B212C" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#6B212C" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[30, 70, 110, 145].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="480"
              y2={y}
              stroke="#DCE0E8"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
          ))}

          {/* Sóng 1: Hợp đồng (Pine / Mist) */}
          <path
            d="M 0 120 C 60 110, 95 65, 160 75 C 225 85, 270 40, 340 48 C 395 55, 435 24, 480 28 L 480 150 L 0 150 Z"
            fill="url(#pineWaveGrad)"
          />
          <path
            d="M 0 120 C 60 110, 95 65, 160 75 C 225 85, 270 40, 340 48 C 395 55, 435 24, 480 28"
            fill="none"
            stroke="#27363F"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Sóng 2: Cảnh báo Rủi ro (Berry) */}
          <path
            d="M 0 138 C 70 130, 120 105, 190 95 C 250 86, 300 115, 365 82 C 415 60, 445 70, 480 62 L 480 150 L 0 150 Z"
            fill="url(#berryWaveGrad)"
          />
          <path
            d="M 0 138 C 70 130, 120 105, 190 95 C 250 86, 300 115, 365 82 C 415 60, 445 70, 480 62"
            fill="none"
            stroke="#6B212C"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          <circle cx="340" cy="48" r="5" fill="#27363F" stroke="#FFFFFF" strokeWidth="2" />
          <rect x="292" y="14" width="96" height="22" rx="6" fill="#27363F" />
          <text x="340" y="29" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="bold">
            {docsCount} Hợp đồng PDF
          </text>

          <circle cx="190" cy="95" r="4.5" fill="#6B212C" stroke="#FFFFFF" strokeWidth="2" />
          <rect x="145" y="64" width="90" height="20" rx="6" fill="#6B212C" />
          <text x="190" y="78" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="bold">
            {violsCount} Cảnh báo
          </text>
        </svg>
      </div>
      <div className="flex justify-between px-3 pt-1 text-[11px] font-bold text-Mist">
        {months.map((m) => (
          <span key={m}>{m}/2026</span>
        ))}
      </div>
    </div>
  )
}

// ─── 5. Lịch Kiểm toán Mini ──────────────────────────────────────────────────

function MiniAuditCalendar({ activeDays }: { activeDays: Set<number> }) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.getDate()

  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const blanks = Array.from({ length: (firstDayOfWeek + 6) % 7 })
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-extrabold text-Pine uppercase tracking-wider">
          Tháng {month + 1}, {year}
        </span>
        <div className="flex items-center gap-1 text-Mist">
          <span className="w-6 h-6 rounded-lg bg-Snowflake/60 flex items-center justify-center">
            <ChevronLeft className="w-3.5 h-3.5" />
          </span>
          <span className="w-6 h-6 rounded-lg bg-Snowflake/60 flex items-center justify-center">
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold text-Mist mb-1.5">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {blanks.map((_, idx) => (
          <span key={`b-${idx}`} className="h-7" />
        ))}
        {days.map((d) => {
          const isToday = d === today
          const hasEvent = activeDays.has(d)
          return (
            <div
              key={d}
              className={`h-7 rounded-xl flex items-center justify-center font-bold transition-all relative ${
                isToday
                  ? 'bg-Berry text-white shadow-md scale-105'
                  : hasEvent
                  ? 'bg-Pine/15 text-Pine font-extrabold'
                  : 'text-Branch hover:bg-Snowflake/60'
              }`}
            >
              {d}
              {hasEvent && !isToday && (
                <span className="w-1 h-1 rounded-full bg-Berry absolute bottom-1" />
              )}
            </div>
          )
        })}
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
  const [standardGroups, setStandardGroups] = useState<
    Array<{ code: string; shortName: string; fullName: string; count: number }>
  >([
    { code: 'GRP-LABOR',  shortName: 'Lao động',   fullName: 'Tiêu chuẩn Lao động', count: 8 },
    { code: 'GRP-OHS',    shortName: 'An toàn SK', fullName: 'An toàn & Sức khỏe',  count: 6 },
    { code: 'GRP-ENV',    shortName: 'Môi trường', fullName: 'Bảo vệ Môi trường',   count: 5 },
    { code: 'GRP-ETHICS', shortName: 'Đạo đức',    fullName: 'Đạo đức Kinh doanh',  count: 5 },
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
          documentApi.getAll({ page: 1, limit: 10 }).catch(() => ({ data: null })),
          violationApi.getAll({ page: 1, limit: 10 }).catch(() => ({ data: null })),
          supplierApi.getAll({ page: 1, limit: 50, is_deleted: false }).catch(() => ({ data: null })),
          standardApi.getGroups().catch(() => ({ data: null })),
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
        setAllViolations((vData as { items?: RecentViolation[] })?.items || [])

        const sData = supRes?.data?.data || supRes?.data || {}
        setSuppliersList((sData as { items?: SupplierItem[] })?.items || [])

        // Lấy đúng 4 Nhóm Tiêu chuẩn từ DB
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

  const avgSupplierScore = useMemo(() => {
    if (suppliersList.length === 0) return 100
    const sum = suppliersList.reduce((acc, s) => acc + (s.risk_score ?? 100), 0)
    return Math.round(sum / suppliersList.length)
  }, [suppliersList])

  const activeCalendarDays = useMemo(() => {
    const set = new Set<number>()
    recentDocs.forEach((d) => {
      const dt = new Date(d.uploaded_at || d.created_at || '')
      if (!isNaN(dt.getTime())) set.add(dt.getDate())
    })
    allViolations.forEach((v) => {
      const dt = new Date(v.created_at)
      if (!isNaN(dt.getTime())) set.add(dt.getDate())
    })
    return set
  }, [recentDocs, allViolations])

  if (loading) {
    return (
      <MainLayout breadcrumb="Bảng điều khiển">
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      </MainLayout>
    )
  }

  const complianceRate =
    stats && stats.total_suppliers > 0
      ? Math.round((stats.supplier_risk_distribution.Safe / stats.total_suppliers) * 100)
      : 100
  const auditCoverageRate =
    stats && stats.total_documents > 0
      ? Math.round((stats.analyzed_documents / stats.total_documents) * 100)
      : 100
  const resolutionRate =
    stats && stats.total_violations > 0
      ? Math.round(((stats.approved_violations + stats.rejected_violations) / stats.total_violations) * 100)
      : 100

  const totalStandardsCount = standardGroups.reduce((acc, g) => acc + g.count, 0)

  return (
    <MainLayout breadcrumb="Bảng điều khiển">
      <div className="space-y-5">
        {/* ─── Top Greeting Bar + Link sang Trang Xuất Báo Cáo (/reports) ──── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-1">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-Pine tracking-tight">
              Xin chào, {user?.full_name || 'Quản trị viên'}
            </h1>
            <p className="text-xs sm:text-sm text-Branch mt-0.5">
              Hệ thống đang giám sát <strong className="text-Pine">{stats?.total_suppliers ?? 0} đối tác</strong> và{' '}
              <strong className="text-Pine">{stats?.total_documents ?? 0} hợp đồng PDF</strong> theo thời gian thực.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {role === 'Admin' && (
              <Link
                to="/admin/users"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-Pine border border-Mist/40 text-xs font-extrabold rounded-2xl hover:bg-Snowflake transition-all shadow-sm"
              >
                <Users className="w-4 h-4 text-Berry" />
                Tài khoản ({adminSummary.totalUsers})
              </Link>
            )}
            {hasPermission('EXPORT_REPORT') && (
              <Link
                to="/reports"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-Berry text-white text-xs font-extrabold rounded-2xl hover:bg-Berry/90 transition-all shadow-[0_8px_20px_rgba(107,33,44,0.28)]"
              >
                <BarChart3 className="w-4 h-4" />
                Xuất Báo Cáo Kiểm Toán
              </Link>
            )}
          </div>
        </div>

        {/* ─── Hàng 1: 4 Thẻ KPI Bento chuẩn tông màu Winter (Không gắn nhãn thừa) ─ */}
        {role === 'Admin' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <BentoKpiCard
              title="Tài khoản Hệ thống"
              value={adminSummary.totalUsers}
              sub={`${adminSummary.activeUsers} hoạt động · ${adminSummary.lockedUsers} khóa`}
              icon={<Users className="w-5 h-5" />}
              chartType="bars"
              tone="pine"
              to="/admin/users"
            />
            <BentoKpiCard
              title="Đối tác Cung ứng"
              value={stats?.total_suppliers ?? 0}
              sub={`${stats?.supplier_risk_distribution.Safe ?? 0} đối tác đạt mức An toàn`}
              icon={<Building2 className="w-5 h-5" />}
              chartType="equalizer"
              tone="mist"
              to="/suppliers"
            />
            <BentoKpiCard
              title="Kho Hợp đồng PDF"
              value={stats?.total_documents ?? 0}
              sub={`${stats?.analyzed_documents ?? 0} hợp đồng đã quét AI`}
              icon={<FileText className="w-5 h-5" />}
              chartType="sparkline"
              tone="branch"
              to="/documents"
            />
            <BentoKpiCard
              title="Nhật ký Bảo mật"
              value={adminSummary.recentLogs.length}
              sub="Ghi vết tự động mọi thao tác"
              icon={<ClipboardList className="w-5 h-5" />}
              chartType="ring"
              tone="berry"
              to="/admin/audit-logs"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <BentoKpiCard
              title="Đối tác Cung ứng"
              value={stats?.total_suppliers ?? 0}
              sub={`${stats?.supplier_risk_distribution.Safe ?? 0} đối tác vùng An toàn`}
              icon={<Building2 className="w-5 h-5" />}
              chartType="bars"
              tone="pine"
              to="/suppliers"
            />
            <BentoKpiCard
              title="Hợp đồng Đã tải"
              value={stats?.total_documents ?? 0}
              sub={`${stats?.analyzed_documents ?? 0} đã phân tích bằng AI`}
              icon={<FileText className="w-5 h-5" />}
              chartType="equalizer"
              tone="mist"
              to="/documents"
            />
            <BentoKpiCard
              title="Cảnh báo Phát hiện"
              value={stats?.total_violations ?? 0}
              sub={`${stats?.violation_risk_distribution.High ?? 0} lỗi mức độ Cao`}
              icon={<AlertTriangle className="w-5 h-5" />}
              chartType="sparkline"
              tone="berry"
              to="/violations"
            />
            <BentoKpiCard
              title={role === 'Manager' ? 'Vi phạm Chờ duyệt' : 'Tiêu chuẩn Quét AI'}
              value={
                role === 'Manager'
                  ? stats?.pending_violations ?? 0
                  : userStdSummary.totalActiveStandards - userStdSummary.excludedCount
              }
              sub={
                role === 'Manager'
                  ? 'Cần phê duyệt hoặc bác bỏ'
                  : `Đang bật (${userStdSummary.excludedCount} tạm tắt)`
              }
              icon={role === 'Manager' ? <Activity className="w-5 h-5" /> : <SlidersHorizontal className="w-5 h-5" />}
              chartType="ring"
              tone="branch"
              to={role === 'Manager' ? '/violations' : '/standards'}
            />
          </div>
        )}

        {/* ─── Hàng 2: Bento Grid 3 Cột (4 Nhóm Tiêu chuẩn + Sóng Xu hướng + 3 Vòng tròn) ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Khối 1 (4 cột): Phân bổ 4 Nhóm Tiêu chuẩn RBA & Pháp luật VN */}
          <div className="lg:col-span-4 bg-white rounded-3xl border border-white p-5 shadow-[0_10px_28px_rgba(39,54,63,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-Pine flex items-center gap-1.5">
                  <ListChecks className="w-4 h-4 text-Berry" />
                  Phân bổ Bộ Tiêu chuẩn RBA & VN
                </h3>
                <p className="text-[11px] text-Mist font-semibold mt-0.5">
                  Cơ cấu {totalStandardsCount} tiêu chuẩn theo 4 nhóm pháp lý
                </p>
              </div>
              <Link
                to="/standards"
                className="px-2.5 py-1 rounded-xl bg-Snowflake text-[11px] font-extrabold text-Pine hover:bg-Mist/30 transition-colors"
              >
                {totalStandardsCount} Chuẩn →
              </Link>
            </div>

            <StandardGroupsChart groups={standardGroups} />

            <div className="pt-2.5 border-t border-Mist/15 flex items-center justify-between text-[11px] text-Branch font-medium">
              <span>Chuẩn RBA 8.0 & Bộ luật Lao động VN</span>
              <span className="font-extrabold text-Berry">Đang kích hoạt</span>
            </div>
          </div>

          {/* Khối 2 (5 cột): Smooth Area Wave Chart */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-white p-5 shadow-[0_10px_28px_rgba(39,54,63,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-Pine">Xu hướng Kiểm toán & Phát hiện Rủi ro</h3>
                <p className="text-[11px] text-Mist font-semibold mt-0.5">
                  Biểu đồ đối sánh Hợp đồng tải lên và Cảnh báo AI
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-bold">
                <span className="flex items-center gap-1 text-Pine">
                  <span className="w-2.5 h-2.5 rounded-full bg-Pine" /> Hợp đồng
                </span>
                <span className="flex items-center gap-1 text-Berry">
                  <span className="w-2.5 h-2.5 rounded-full bg-Berry" /> Cảnh báo
                </span>
              </div>
            </div>

            <SmoothAreaWaveChart
              docsCount={stats?.total_documents ?? 0}
              violsCount={stats?.total_violations ?? 0}
            />

            <div className="pt-2.5 border-t border-Mist/15 flex items-center justify-between text-[11px] text-Branch font-medium">
              <span>Phân tích ngữ nghĩa hợp đồng PDF tự động</span>
              <Link to="/documents" className="font-extrabold text-Pine hover:underline">
                Mở Kho PDF →
              </Link>
            </div>
          </div>

          {/* Khối 3 (3 cột): 3 Vòng tròn Sức khỏe Hệ thống (Phối màu Berry + Mist + Frostysilver) */}
          <div className="lg:col-span-3 bg-gradient-to-b from-Pine to-Pine rounded-3xl p-4 text-white shadow-[0_15px_35px_rgba(39,54,63,0.22)] flex flex-col justify-between gap-2.5">
            <div className="px-1 flex items-center justify-between">
              <span className="text-xs font-extrabold tracking-wide text-Snowflake">Chỉ số Sức khỏe Hệ thống</span>
              <Layers className="w-4 h-4 text-Frostysilver" />
            </div>

            {[
              { label: 'Tỷ lệ Đối tác An toàn', pct: complianceRate, stroke: '#DCE0E8' },
              { label: 'Độ phủ Quét AI PDF', pct: auditCoverageRate, stroke: '#8EA1AE' },
              { label: 'Tỷ lệ Xử lý Cảnh báo', pct: resolutionRate, stroke: '#BEB3AC' },
            ].map((ring) => {
              const r = 20
              const c = 2 * Math.PI * r
              const dash = `${(ring.pct / 100) * c} ${c}`
              return (
                <div
                  key={ring.label}
                  className="bg-white/[0.08] backdrop-blur-md border border-white/10 rounded-2xl px-3.5 py-2.5 flex items-center justify-between"
                >
                  <div>
                    <p className="text-[11px] font-bold text-Snowflake/80">{ring.label}</p>
                    <p className="text-lg font-extrabold text-Sunny mt-0.5">{ring.pct}%</p>
                  </div>
                  <div className="relative w-12 h-12 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
                      <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4.5" />
                      <circle
                        cx="24"
                        cy="24"
                        r={r}
                        fill="none"
                        stroke={ring.stroke}
                        strokeWidth="4.5"
                        strokeDasharray={dash}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-[10px] font-extrabold text-Snowflake">{ring.pct}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ─── Hàng 3: Đồng hồ Điểm Tín nhiệm + Xếp hạng Đối tác + Lịch Kiểm toán ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Cột 1: Đồng hồ Điểm Tín nhiệm */}
          <div className="lg:col-span-4 bg-white rounded-3xl border border-white p-5 shadow-[0_10px_28px_rgba(39,54,63,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-Pine">Đồng hồ Điểm Tín nhiệm</h3>
                <p className="text-[11px] text-Mist font-semibold mt-0.5">Trung bình cộng toàn chuỗi cung ứng</p>
              </div>
              <StatusBadge status={avgSupplierScore >= 80 ? 'Safe' : avgSupplierScore >= 50 ? 'Warning' : 'Danger'} />
            </div>

            <SegmentedSpeedometer
              avgScore={avgSupplierScore}
              totalSuppliers={stats?.total_suppliers ?? 0}
            />

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-Mist/15 text-center text-[11px]">
              <div className="bg-Snowflake/70 rounded-xl py-1.5">
                <span className="font-extrabold text-Pine block">{stats?.supplier_risk_distribution.Safe ?? 0}</span>
                <span className="text-Branch text-[10px]">An toàn</span>
              </div>
              <div className="bg-Frostysilver/35 rounded-xl py-1.5">
                <span className="font-extrabold text-Branch block">{stats?.supplier_risk_distribution.Warning ?? 0}</span>
                <span className="text-Branch text-[10px]">Cảnh báo</span>
              </div>
              <div className="bg-Berry/10 rounded-xl py-1.5">
                <span className="font-extrabold text-Berry block">{stats?.supplier_risk_distribution.Danger ?? 0}</span>
                <span className="text-Berry text-[10px]">Nguy hiểm</span>
              </div>
            </div>
          </div>

          {/* Cột 2: Xếp hạng Điểm Nhà cung ứng */}
          <div className="lg:col-span-4 bg-white rounded-3xl border border-white p-5 shadow-[0_10px_28px_rgba(39,54,63,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-extrabold text-Pine">Xếp hạng Điểm Nhà cung ứng</h3>
                <p className="text-[11px] text-Mist font-semibold mt-0.5">Theo dõi điểm tuân thủ RBA từng đơn vị</p>
              </div>
              <Link to="/suppliers" className="text-xs font-extrabold text-Pine hover:underline">
                Tất cả →
              </Link>
            </div>

            <div className="space-y-3 my-auto">
              {suppliersList.length === 0 ? (
                <p className="text-xs text-Mist text-center py-8">Chưa có nhà cung ứng</p>
              ) : (
                suppliersList.slice(0, 4).map((sup) => (
                  <div key={sup.id} className="p-2.5 rounded-2xl bg-Snowflake/40 hover:bg-Snowflake/80 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-extrabold text-Branch truncate pr-2">{sup.company_name}</span>
                      <span className="text-[10px] font-mono text-Branch">{sup.tax_code}</span>
                    </div>
                    <RiskScoreBar score={sup.risk_score} />
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 mt-2 border-t border-Mist/15 flex items-center justify-between text-[11px] text-Branch font-medium">
              <span>Khởi tạo mặc định: 100 điểm</span>
              <span className="font-bold text-Berry">Trừ điểm khi Manager duyệt</span>
            </div>
          </div>

          {/* Cột 3: Lịch Kiểm toán */}
          <div className="lg:col-span-4 bg-white rounded-3xl border border-white p-5 shadow-[0_10px_28px_rgba(39,54,63,0.06)] flex flex-col justify-between">
            <MiniAuditCalendar activeDays={activeCalendarDays} />

            <div className="mt-3 pt-3 border-t border-Mist/15 space-y-2">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-Pine flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-Berry" />
                Hoạt động mới nhất
              </p>
              {recentDocs.length === 0 ? (
                <div className="flex items-center justify-between bg-Snowflake/40 px-3 py-2 rounded-xl text-xs">
                  <span className="text-Branch font-medium">Sẵn sàng nhận hợp đồng PDF mới</span>
                  <Link to="/documents" className="text-Pine font-extrabold hover:underline">
                    + Tải lên
                  </Link>
                </div>
              ) : (
                recentDocs.slice(0, 2).map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/audit/${doc.id}`}
                    className="flex items-center justify-between bg-Snowflake/40 hover:bg-Snowflake/80 px-3 py-2 rounded-xl transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-extrabold text-Pine truncate">{doc.file_name}</p>
                      <p className="text-[10px] text-Mist truncate">{doc.Suppliers?.company_name}</p>
                    </div>
                    <StatusBadge status={doc.status} />
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ─── Hàng 4: Hợp đồng PDF gần đây & Cảnh báo / Nhật ký ────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Bảng trái: Hợp đồng PDF gần đây */}
          <div className="bg-white rounded-3xl border border-white p-5 shadow-[0_10px_28px_rgba(39,54,63,0.06)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-Pine">Hợp đồng PDF Đang theo dõi</h3>
              <Link to="/documents" className="text-xs font-extrabold text-Pine hover:underline">
                Kho hợp đồng →
              </Link>
            </div>
            <div className="space-y-2.5">
              {recentDocs.length === 0 ? (
                <div className="text-center py-8 bg-Snowflake/30 rounded-2xl">
                  <FileText className="w-8 h-8 text-Mist mx-auto mb-2" />
                  <p className="text-xs font-bold text-Pine">Chưa có hợp đồng PDF nào</p>
                  {hasPermission('UPLOAD_DOC') && (
                    <Link
                      to="/documents"
                      className="inline-flex items-center gap-1.5 mt-2 px-3.5 py-1.5 bg-Pine text-white text-xs font-bold rounded-xl"
                    >
                      <Upload className="w-3.5 h-3.5" /> Tải lên ngay
                    </Link>
                  )}
                </div>
              ) : (
                recentDocs.slice(0, 4).map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-Snowflake/35 hover:bg-Snowflake/70 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-Pine text-white flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <Link
                          to={`/audit/${doc.id}`}
                          className="text-xs font-extrabold text-Pine hover:underline truncate block"
                        >
                          {doc.file_name}
                        </Link>
                        <p className="text-[11px] text-Mist truncate">{doc.Suppliers?.company_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={doc.status} />
                      <Link
                        to={`/audit/${doc.id}`}
                        className="p-1.5 rounded-xl bg-white text-Pine hover:bg-Pine hover:text-white transition-colors shadow-sm"
                        title="Mở Phòng Kiểm toán Split-view"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Bảng phải: Nhật ký Admin hoặc Cảnh báo Vi phạm */}
          {role === 'Admin' ? (
            <div className="bg-white rounded-3xl border border-white p-5 shadow-[0_10px_28px_rgba(39,54,63,0.06)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-extrabold text-Pine">Nhật ký Kiểm toán Bảo mật Gần đây</h3>
                <Link to="/admin/audit-logs" className="text-xs font-extrabold text-Pine hover:underline">
                  Xem toàn bộ →
                </Link>
              </div>
              <div className="space-y-2.5">
                {adminSummary.recentLogs.length === 0 ? (
                  <p className="text-xs text-Mist text-center py-8">Chưa có bản ghi nhật ký</p>
                ) : (
                  adminSummary.recentLogs.slice(0, 4).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-Snowflake/35 hover:bg-Snowflake/70 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-lg bg-Pine text-Sunny font-mono text-[10px] font-semibold">
                            {log.action_type}
                          </span>
                          <span className="text-xs font-bold text-Pine">{log.target_table}</span>
                        </div>
                        <p className="text-[11px] text-Mist mt-0.5">
                          Thực hiện bởi: <strong className="text-Branch">{log.Users?.full_name || 'Hệ thống'}</strong>
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-Mist">
                        {new Date(log.created_at).toLocaleTimeString('vi-VN')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-white p-5 shadow-[0_10px_28px_rgba(39,54,63,0.06)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-extrabold text-Pine">Cảnh báo Vi phạm Cần chú ý</h3>
                <Link to="/violations" className="text-xs font-extrabold text-Pine hover:underline">
                  Trung tâm thẩm định →
                </Link>
              </div>
              <div className="space-y-2.5">
                {allViolations.length === 0 ? (
                  <div className="text-center py-8 bg-Snowflake/30 rounded-2xl">
                    <CheckCircle2 className="w-8 h-8 text-Pine mx-auto mb-2" />
                    <p className="text-xs font-bold text-Pine">Không có cảnh báo vi phạm tồn đọng</p>
                    <p className="text-[11px] text-Mist mt-0.5">Chuỗi cung ứng đang tuân thủ tốt tiêu chuẩn RBA</p>
                  </div>
                ) : (
                  allViolations.slice(0, 4).map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-Snowflake/35 hover:bg-Snowflake/70 transition-colors gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold text-Pine truncate">{v.violation_desc}</p>
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
          )}
        </div>
      </div>
    </MainLayout>
  )
}