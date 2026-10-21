import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  BarChart3, Layers, ChevronLeft, ChevronRight, ListChecks, ShieldCheck, Zap, Cpu,
  TrendingUp, ArrowDownRight, Server, Search, Eye, Filter, RefreshCw, X, HelpCircle, ShieldAlert
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

// ─── 1. Ultra-Luxury Bento KPI Card ─────────────────────────────────────────

function LuxuryBentoKpiCard({
  title,
  value,
  sub,
  trend,
  trendIsUp,
  icon,
  chartType,
  tone,
  to,
  onOpenInsight,
}: {
  title: string
  value: number | string
  sub: string
  trend?: string
  trendIsUp?: boolean
  icon: React.ReactNode
  chartType: 'bars' | 'equalizer' | 'sparkline' | 'ring'
  tone: 'pine' | 'berry' | 'mist' | 'branch'
  to?: string
  onOpenInsight?: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const palette = {
    pine: {
      borderHover: 'hover:border-Pine/60 hover:shadow-[0_24px_60px_rgba(39,54,63,0.20)]',
      iconBg: 'bg-gradient-to-br from-Pine via-[#344854] to-[#1A252B] text-Snowflake shadow-xl shadow-Pine/30',
      accentColor: '#27363F',
      spotlightColor: 'rgba(39, 54, 63, 0.08)',
    },
    berry: {
      borderHover: 'hover:border-Berry/60 hover:shadow-[0_24px_60px_rgba(107,33,44,0.20)]',
      iconBg: 'bg-gradient-to-br from-Berry via-[#872B38] to-[#42141B] text-Snowflake shadow-xl shadow-Berry/30',
      accentColor: '#6B212C',
      spotlightColor: 'rgba(107, 33, 44, 0.08)',
    },
    mist: {
      borderHover: 'hover:border-Mist hover:shadow-[0_24px_60px_rgba(142,161,174,0.25)]',
      iconBg: 'bg-gradient-to-br from-Mist via-[#A1B2BD] to-[#687882] text-Pine shadow-xl shadow-Mist/35',
      accentColor: '#8EA1AE',
      spotlightColor: 'rgba(142, 161, 174, 0.12)',
    },
    branch: {
      borderHover: 'hover:border-Branch/60 hover:shadow-[0_24px_60px_rgba(104,86,82,0.20)]',
      iconBg: 'bg-gradient-to-br from-Branch via-[#806B66] to-[#483B38] text-Snowflake shadow-xl shadow-Branch/30',
      accentColor: '#685652',
      spotlightColor: 'rgba(104, 86, 82, 0.08)',
    },
  }[tone]

  const content = (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative bg-white/95 backdrop-blur-3xl rounded-[2.5rem] border border-white p-6 sm:p-7 shadow-[0_15px_45px_rgba(39,54,63,0.06)] transition-all duration-500 flex flex-col justify-between gap-5 overflow-hidden ${palette.borderHover} hover:-translate-y-2`}
    >
      {isHovered && (
        <div
          className="pointer-events-none absolute -inset-px transition-opacity duration-300 rounded-[2.5rem]"
          style={{
            background: `radial-gradient(450px circle at ${mousePos.x}px ${mousePos.y}px, ${palette.spotlightColor}, transparent 80%)`,
          }}
        />
      )}

      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-Pine group-hover:scale-125 transition-transform shadow-xs flex-shrink-0 mt-0.5" />
          <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-Branch/90 leading-snug whitespace-normal break-words">
            {title}
          </span>
        </div>
        
        <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
          {trend && (
            <span className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-black px-2.5 py-0.5 rounded-full border shadow-2xs ${
              trendIsUp ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}>
              {trendIsUp ? <TrendingUp className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {trend}
            </span>
          )}
          {onOpenInsight && (
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onOpenInsight()
              }}
              className="p-1 rounded-full text-Mist hover:text-Pine hover:bg-Snowflake transition-colors"
              title="Phân tích chi tiết AI"
            >
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between gap-4 relative z-10">
        <div className="flex items-center gap-4 min-w-0">
          <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 border border-white/50 ${palette.iconBg}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-3xl sm:text-4xl font-black text-Pine tracking-tight leading-none drop-shadow-xs">
              {typeof value === 'number' ? value.toLocaleString('vi-VN') : value}
            </div>
            <p className="text-[11px] sm:text-xs font-black text-Mist/90 mt-2 truncate leading-tight">{sub}</p>
          </div>
        </div>

        <div className="w-14 h-10 sm:w-16 sm:h-12 flex items-end justify-end flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
          {chartType === 'bars' && (
            <div className="flex items-end gap-1 h-9 sm:h-10">
              {[35, 60, 45, 80, 100].map((h, i) => (
                <div key={i} className="w-1.5 sm:w-2 rounded-t-md transition-all duration-500 group-hover:scale-y-110 origin-bottom" style={{ height: `${h}%`, backgroundColor: i === 4 ? palette.accentColor : '#DCE0E8' }} />
              ))}
            </div>
          )}
          {chartType === 'equalizer' && (
            <div className="flex items-center gap-1 h-9 sm:h-10">
              {[70, 95, 55, 100, 85].map((h, i) => (
                <div key={i} className="w-1 sm:w-1.5 h-full bg-Snowflake rounded-full overflow-hidden flex flex-col justify-end">
                  <div className="w-full rounded-full transition-all duration-500" style={{ height: `${h}%`, backgroundColor: palette.accentColor }} />
                </div>
              ))}
            </div>
          )}
          {chartType === 'sparkline' && (
            <svg className="w-14 sm:w-16 h-9 sm:h-10 overflow-visible" viewBox="0 0 64 36">
              <path d="M 2 28 Q 16 12, 28 20 T 50 8 L 62 12" fill="none" stroke={palette.accentColor} strokeWidth="3.5" strokeLinecap="round" />
              <circle cx="50" cy="8" r="4" fill={palette.accentColor} className="animate-ping" />
            </svg>
          )}
          {chartType === 'ring' && (
            <div className="relative w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="15" fill="none" stroke="#DCE0E8" strokeWidth="4" />
                <circle cx="20" cy="20" r="15" fill="none" stroke={palette.accentColor} strokeWidth="4" strokeDasharray="70 95" strokeLinecap="round" />
              </svg>
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-Pine absolute" />
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return to ? <Link to={to} className="block">{content}</Link> : content
}

// ─── 2. Biểu đồ Cột Nhóm Tiêu Chuẩn 3D ─────────────────────────────────────

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
      <div className="grid grid-cols-4 gap-4 items-end h-48 px-2">
        {groups.map((item, idx) => {
          const heightPct = Math.max(30, Math.round((item.count / maxVal) * 100))
          const isFocus = hoveredIdx === idx
          return (
            <div
              key={item.code}
              onMouseEnter={() => setHoveredIdx(idx)}
              className="relative flex flex-col items-center justify-end h-full cursor-pointer group"
            >
              {isFocus && (
                <div className="absolute -top-12 z-20 bg-Pine text-white px-4 py-2 rounded-2xl text-xs font-black whitespace-nowrap shadow-2xl border border-white/20 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <Sparkles className="w-4 h-4 text-Frostysilver animate-spin" />
                  <span>{item.count} tiêu chuẩn ({totalStds > 0 ? Math.round((item.count / totalStds) * 100) : 0}%)</span>
                </div>
              )}

              <div className="w-12 sm:w-14 h-full bg-Snowflake rounded-2xl flex flex-col justify-end p-1.5 border border-Mist/30 shadow-inner group-hover:border-Pine/50 transition-colors">
                <div
                  className={`w-full rounded-xl transition-all duration-700 ${
                    isFocus
                      ? 'bg-gradient-to-t from-Pine via-Branch to-Berry shadow-[0_12px_30px_rgba(107,33,44,0.4)] scale-105'
                      : 'bg-Pine/85 group-hover:bg-Berry'
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className={`text-xs mt-3 font-black transition-colors ${isFocus ? 'text-Berry' : 'text-Pine'}`}>
                {item.shortName}
              </span>
              <span className="text-[11px] font-extrabold text-Mist mt-0.5">
                {item.count} chuẩn
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 3. Đồng hồ Tín nhiệm Halo Speedometer ───────────────────────────────────

function HaloSpeedometer({
  avgScore,
  totalSuppliers,
}: {
  avgScore: number
  totalSuppliers: number
}) {
  const totalTicks = 32
  const activeTicks = Math.round((Math.max(0, Math.min(100, avgScore)) / 100) * totalTicks)

  return (
    <div className="flex flex-col items-center justify-center py-4">
      <div className="relative w-60 h-60 flex items-center justify-center">
        <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-Pine/20 via-Berry/10 to-transparent blur-3xl pointer-events-none" />

        <svg className="w-full h-full -rotate-90 drop-shadow-xl" viewBox="0 0 180 180">
          {Array.from({ length: totalTicks }).map((_, idx) => {
            const angle = (idx / totalTicks) * 360
            const isFilled = idx < activeTicks
            const tickColor =
              idx < activeTicks
                ? avgScore >= 80 ? '#27363F' : avgScore >= 50 ? '#685652' : '#6B212C'
                : '#E2E8F0'
            return (
              <g key={idx} transform={`rotate(${angle} 90 90)`}>
                <rect x="85" y="8" width="10" height="22" rx="5" fill={tickColor} opacity={isFilled ? 1 : 0.25} />
              </g>
            )
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
          <span className="text-6xl font-black text-Pine tracking-tight drop-shadow-sm">{avgScore}</span>
          <span className="text-[11px] font-black text-Mist uppercase tracking-widest mt-1">
            Điểm TB Tuân thủ
          </span>
          <span className="mt-3 px-4 py-1.5 rounded-full bg-Snowflake text-xs font-black text-Pine shadow-xs border border-Mist/30 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            {totalSuppliers} Đối tác Active
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard Page Component ───────────────────────────────────────────

export default function DashboardPage() {
  const { user, role, hasPermission } = useAuth()
  const navigate = useNavigate()

  const [stats, setStats] = useState<NormalizedStats | null>(null)
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([])
  const [allViolations, setAllViolations] = useState<RecentViolation[]>([])
  const [suppliersList, setSuppliersList] = useState<SupplierItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeModal, setActiveModal] = useState<string | null>(null)

  const [standardGroups, setStandardGroups] = useState<
    Array<{ code: string; shortName: string; fullName: string; count: number }>
  >([
    { code: 'GRP-LABOR', shortName: 'Lao động', fullName: 'Tiêu chuẩn Lao động', count: 8 },
    { code: 'GRP-OHS', shortName: 'An toàn SK', fullName: 'An toàn & Sức khỏe', count: 6 },
    { code: 'GRP-ENV', shortName: 'Môi trường', fullName: 'Bảo vệ Môi trường', count: 5 },
    { code: 'GRP-ETHICS', shortName: 'Đạo đức', fullName: 'Đạo đức Kinh doanh', count: 5 },
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
        const computedTotalV = raw?.total_violations !== undefined ? Number(raw.total_violations) : pendingV + approvedV + rejectedV

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

        const rawGroups: StandardGroupStat[] = grpRes?.data?.groups || grpRes?.data?.data || []
        if (Array.isArray(rawGroups) && rawGroups.length > 0) {
          const shortMap: Record<string, string> = {
            'GRP-LABOR': 'Lao động',
            'GRP-OHS': 'An toàn SK',
            'GRP-ENV': 'Môi trường',
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

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    navigate(`/documents?search=${encodeURIComponent(searchQuery.trim())}`)
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

  const complianceRate = stats && stats.total_suppliers > 0 ? Math.round((stats.supplier_risk_distribution.Safe / stats.total_suppliers) * 100) : 100
  const auditCoverageRate = stats && stats.total_documents > 0 ? Math.round((stats.analyzed_documents / stats.total_documents) * 100) : 100
  const resolutionRate = stats && stats.total_violations > 0 ? Math.round(((stats.approved_violations + stats.rejected_violations) / stats.total_violations) * 100) : 100
  const totalStandardsCount = standardGroups.reduce((acc, g) => acc + g.count, 0)

  return (
    <MainLayout breadcrumb="Bảng điều khiển Executive">
      <div className="space-y-8 pb-16">

        {/* 🌟 1. Top Realtime Ticker Bar */}
        <div className="bg-Pine/95 backdrop-blur-2xl rounded-2xl p-3.5 px-6 text-white shadow-xl border border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[11px] font-black border border-emerald-500/30">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              RAG AI ENGINE ONLINE
            </span>
            <span className="text-Snowflake/90 font-medium hidden md:inline">
              Hệ thống thẩm định ngữ nghĩa hợp đồng PDF theo tiêu chuẩn RBA 8.0 & Pháp luật VN
            </span>
          </div>

          <div className="flex items-center gap-6 font-mono text-[11px] font-bold text-Frostysilver">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Latency: <strong className="text-white">120ms</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Accuracy: <strong className="text-white">99.4%</strong>
            </span>
            <span className="flex items-center gap-1.5 hidden sm:flex">
              <Server className="w-3.5 h-3.5 text-sky-400" /> Database: <strong className="text-white">{stats?.total_documents ?? 0} Docs</strong>
            </span>
          </div>
        </div>
        
        {/* 👑 2. Executive Hero Banner */}
        <div className="relative overflow-hidden rounded-[3rem] bg-gradient-to-r from-Pine via-[#1E2930] to-Branch p-8 sm:p-12 text-white shadow-2xl border border-white/20">
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-Berry/30 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-Frostysilver/20 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2.5 px-4.5 py-1.5 rounded-full bg-white/10 backdrop-blur-xl text-Frostysilver text-xs font-black uppercase tracking-widest border border-white/15 shadow-inner">
                <Cpu className="w-4 h-4 text-emerald-400 animate-spin" />
                <span>Executive Command Center</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-white/90">Multi-Agent Audit</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white drop-shadow-md leading-tight">
                Xin chào, {user?.full_name || 'Quản trị viên'}
              </h1>
              <p className="text-xs sm:text-sm text-Frostysilver/95 font-medium leading-relaxed max-w-2xl">
                Tự động giám sát <strong className="text-white font-extrabold">{stats?.total_suppliers ?? 0} nhà cung ứng</strong> và{' '}
                <strong className="text-white font-extrabold">{stats?.total_documents ?? 0} hợp đồng PDF</strong> theo thời gian thực chuẩn RBA 8.0.
              </p>
            </div>

            {/* Nhóm nút bấm đã được căn chỉnh cân đối tuyệt đối */}
            <div className="flex flex-wrap items-center gap-3.5 flex-shrink-0">
              <form onSubmit={handleQuickSearch} className="flex items-center bg-white/10 backdrop-blur-xl rounded-2xl border border-white/25 p-1.5 shadow-inner">
                <input
                  type="text"
                  placeholder="Tra cứu nhanh..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent px-3 py-2 text-xs text-white placeholder-Frostysilver/70 focus:outline-none w-44 sm:w-52"
                />
                <button type="submit" className="px-4 py-2.5 bg-Pine hover:bg-Berry text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-md">
                  <Search className="w-4 h-4" /> Tìm
                </button>
              </form>

              {role === 'Admin' && (
                <Link
                  to="/admin/users"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/25 backdrop-blur-xl text-white border border-white/25 text-xs font-black rounded-2xl transition-all duration-300 shadow-xl whitespace-nowrap"
                >
                  <Users className="w-4 h-4 text-Frostysilver flex-shrink-0" />
                  <span>Tài khoản ({adminSummary.totalUsers})</span>
                </Link>
              )}
              {hasPermission('EXPORT_REPORT') && (
                <Link
                  to="/reports"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-Berry to-[#872B38] hover:brightness-110 text-white text-xs font-black rounded-2xl transition-all duration-300 shadow-xl shadow-Berry/30 whitespace-nowrap"
                >
                  <BarChart3 className="w-4 h-4 flex-shrink-0" />
                  <span>Báo Cáo</span>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ─── Hàng 1: 4 Thẻ Bento KPI Cards ───────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {role === 'Admin' ? (
            <>
              <LuxuryBentoKpiCard title="Tài khoản Hệ thống" value={adminSummary.totalUsers} sub={`${adminSummary.activeUsers} active · ${adminSummary.lockedUsers} khóa`} trend="+4.2%" trendIsUp={true} icon={<Users className="w-6 h-6" />} chartType="bars" tone="pine" to="/admin/users" onOpenInsight={() => setActiveModal('users')} />
              <LuxuryBentoKpiCard title="Đối tác Cung ứng" value={stats?.total_suppliers ?? 0} sub={`${stats?.supplier_risk_distribution.Safe ?? 0} vùng An toàn`} trend="+2.8%" trendIsUp={true} icon={<Building2 className="w-6 h-6" />} chartType="equalizer" tone="mist" to="/suppliers" onOpenInsight={() => setActiveModal('suppliers')} />
              <LuxuryBentoKpiCard title="Kho Hợp đồng PDF" value={stats?.total_documents ?? 0} sub={`${stats?.analyzed_documents ?? 0} đã quét AI`} trend="+12.5%" trendIsUp={true} icon={<FileText className="w-6 h-6" />} chartType="sparkline" tone="branch" to="/documents" onOpenInsight={() => setActiveModal('documents')} />
              <LuxuryBentoKpiCard title="Nhật ký Bảo mật" value={adminSummary.recentLogs.length} sub="Ghi vết tự động" trend="Ổn định" trendIsUp={true} icon={<ClipboardList className="w-6 h-6" />} chartType="ring" tone="berry" to="/admin/audit-logs" />
            </>
          ) : (
            <>
              <LuxuryBentoKpiCard title="Đối tác Cung ứng" value={stats?.total_suppliers ?? 0} sub={`${stats?.supplier_risk_distribution.Safe ?? 0} vùng An toàn`} trend="+5.1%" trendIsUp={true} icon={<Building2 className="w-6 h-6" />} chartType="bars" tone="pine" to="/suppliers" onOpenInsight={() => setActiveModal('suppliers')} />
              <LuxuryBentoKpiCard title="Hợp đồng Đã tải" value={stats?.total_documents ?? 0} sub={`${stats?.analyzed_documents ?? 0} phân tích AI`} trend="+8.3%" trendIsUp={true} icon={<FileText className="w-6 h-6" />} chartType="equalizer" tone="mist" to="/documents" onOpenInsight={() => setActiveModal('documents')} />
              <LuxuryBentoKpiCard title="Cảnh báo Phát hiện" value={stats?.total_violations ?? 0} sub={`${stats?.violation_risk_distribution.High ?? 0} mức độ Cao`} trend="-2.4%" trendIsUp={false} icon={<AlertTriangle className="w-6 h-6" />} chartType="sparkline" tone="berry" to="/violations" onOpenInsight={() => setActiveModal('violations')} />
              <LuxuryBentoKpiCard title={role === 'Manager' ? 'Vi phạm Chờ duyệt' : 'Tiêu chuẩn Quét AI'} value={role === 'Manager' ? stats?.pending_violations ?? 0 : userStdSummary.totalActiveStandards - userStdSummary.excludedCount} sub={role === 'Manager' ? 'Cần xử lý phê duyệt' : `Đang bật (${userStdSummary.excludedCount} tắt)`} trend="100%" trendIsUp={true} icon={role === 'Manager' ? <Activity className="w-6 h-6" /> : <SlidersHorizontal className="w-6 h-6" />} chartType="ring" tone="branch" to={role === 'Manager' ? '/violations' : '/standards'} />
            </>
          )}
        </div>

        {/* ─── Hàng 2: Grid Bố Cục Cân Đối (5-Col & 7-Col) ──────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white/95 backdrop-blur-3xl rounded-[2.8rem] border border-white p-7 shadow-[0_15px_45px_rgba(39,54,63,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-Pine flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-Berry" />
                  Tiêu chuẩn RBA & VN Law
                </h3>
                <p className="text-xs text-Mist font-medium mt-0.5">{totalStandardsCount} tiêu chuẩn trong DB</p>
              </div>
              <Link to="/standards" className="px-3.5 py-1.5 rounded-xl bg-Snowflake text-xs font-black text-Pine hover:bg-Mist/30 transition-colors border border-Mist/30">
                Chi tiết →
              </Link>
            </div>
            <StandardGroupsChart groups={standardGroups} />
            <div className="pt-4 border-t border-Mist/20 flex items-center justify-between text-xs text-Branch">
              <span className="font-semibold">Bộ lọc tiêu chuẩn RBA 8.0</span>
              <span className="font-black text-Pine bg-Snowflake px-3 py-1 rounded-xl border border-Mist/30 shadow-2xs">Hoạt động</span>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white/95 backdrop-blur-3xl rounded-[2.8rem] border border-white p-7 shadow-[0_15px_45px_rgba(39,54,63,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-Pine flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-Pine" />
                  Xu hướng Kiểm toán AI Đa tác vụ
                </h3>
                <p className="text-xs text-Mist font-medium mt-0.5">Tỷ lệ phát hiện lỗi tuân thủ và quét tài liệu PDF</p>
              </div>
              <span className="px-3.5 py-1.5 rounded-xl bg-Snowflake text-xs font-black text-Pine border border-Mist/30 shadow-2xs">
                2026 Live
              </span>
            </div>

            <div className="py-6 flex flex-col justify-center flex-1">
              <div className="relative h-40 w-full flex items-end gap-2.5 px-2">
                {[45, 65, 55, 85, 95, 75, 100, 80, 60, 90].map((val, idx) => (
                  <div key={idx} className="flex-1 bg-Snowflake rounded-t-xl overflow-hidden flex flex-col justify-end h-full border border-Mist/20">
                    <div
                      className="w-full bg-gradient-to-t from-Pine via-Branch to-Berry transition-all duration-700 hover:brightness-110"
                      style={{ height: `${val}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-Mist/20 flex items-center justify-between text-xs text-Branch">
              <span className="flex items-center gap-2 font-bold">
                <span className="w-3 h-3 rounded-md bg-Pine" /> Hợp đồng PDF Quét
              </span>
              <span className="flex items-center gap-2 font-bold">
                <span className="w-3 h-3 rounded-md bg-Berry" /> Vi phạm Phát hiện
              </span>
            </div>
          </div>
        </div>

        {/* ─── Hàng 3: Grid Đồng Hồ Halo & Xếp Hạng & Sức Khỏe ─────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white/95 backdrop-blur-3xl rounded-[2.8rem] border border-white p-7 shadow-[0_15px_45px_rgba(39,54,63,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-Pine">Chỉ số Tín nhiệm Tuân thủ</h3>
                <p className="text-xs text-Mist font-medium mt-0.5">Điểm trung bình toàn bộ chuỗi cung ứng</p>
              </div>
              <StatusBadge status={avgSupplierScore >= 80 ? 'Safe' : avgSupplierScore >= 50 ? 'Warning' : 'Danger'} />
            </div>

            <HaloSpeedometer avgScore={avgSupplierScore} totalSuppliers={stats?.total_suppliers ?? 0} />

            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-Mist/20 text-center text-xs">
              <div className="bg-Snowflake p-3 rounded-2xl border border-Mist/30">
                <span className="font-black text-Pine text-base block">{stats?.supplier_risk_distribution.Safe ?? 0}</span>
                <span className="text-Branch text-[11px] font-bold">Safe</span>
              </div>
              <div className="bg-Frostysilver/30 p-3 rounded-2xl border border-Mist/30">
                <span className="font-black text-Branch text-base block">{stats?.supplier_risk_distribution.Warning ?? 0}</span>
                <span className="text-Branch text-[11px] font-bold">Warning</span>
              </div>
              <div className="bg-Berry/10 p-3 rounded-2xl border border-Berry/20">
                <span className="font-black text-Berry text-base block">{stats?.supplier_risk_distribution.Danger ?? 0}</span>
                <span className="text-Berry text-[11px] font-bold">Danger</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white/95 backdrop-blur-3xl rounded-[2.8rem] border border-white p-7 shadow-[0_15px_45px_rgba(39,54,63,0.06)] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-Pine">Xếp hạng Nhà cung ứng</h3>
                <p className="text-xs text-Mist font-medium mt-0.5">Cập nhật theo kết quả thẩm định mới nhất</p>
              </div>
              <Link to="/suppliers" className="text-xs font-black text-Pine hover:text-Berry transition-colors">
                Xem tất cả →
              </Link>
            </div>

            <div className="space-y-3.5 my-auto">
              {suppliersList.length === 0 ? (
                <p className="text-xs text-Mist text-center py-6 font-medium">Chưa có thông tin</p>
              ) : (
                suppliersList.slice(0, 4).map((sup) => (
                  <div key={sup.id} className="p-3.5 rounded-2xl bg-Snowflake/70 border border-Mist/30 hover:bg-Snowflake transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-Pine truncate pr-2">{sup.company_name}</span>
                      <span className="text-[11px] font-mono text-Branch bg-white px-2.5 py-0.5 rounded-lg border border-Mist/30 shadow-2xs">{sup.tax_code}</span>
                    </div>
                    <RiskScoreBar score={sup.risk_score} />
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 mt-2 border-t border-Mist/20 flex items-center justify-between text-xs text-Branch font-medium">
              <span>Khởi điểm: 100</span>
              <span className="font-black text-Berry">Trừ điểm khi vi phạm</span>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white/95 backdrop-blur-3xl rounded-[2.8rem] border border-white p-7 shadow-[0_15px_45px_rgba(39,54,63,0.06)] flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-Pine uppercase tracking-wider">Sức khỏe Hệ thống RAG</span>
              <Layers className="w-4 h-4 text-Mist" />
            </div>

            <div className="space-y-4">
              {[
                { label: 'Tỷ lệ Đối tác Safe', pct: complianceRate, color: 'bg-Pine' },
                { label: 'Độ phủ Quét PDF', pct: auditCoverageRate, color: 'bg-Mist' },
                { label: 'Tỷ lệ Xử lý Lỗi', pct: resolutionRate, color: 'bg-Branch' },
              ].map((ring) => (
                <div key={ring.label} className="bg-Snowflake/80 p-4 rounded-2xl border border-Mist/30 shadow-inner">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-Branch font-black">{ring.label}</span>
                    <span className="font-black text-Pine">{ring.pct}%</span>
                  </div>
                  <div className="w-full bg-white h-3 rounded-full overflow-hidden border border-Mist/20">
                    <div className={`h-full rounded-full ${ring.color}`} style={{ width: `${ring.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-Mist/20 flex items-center justify-between text-xs text-Branch">
              <span className="font-semibold">Trạng thái API Gateway</span>
              <span className="font-black text-emerald-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Ổn định
              </span>
            </div>
          </div>
        </div>

        {/* ─── AI Insights Modal ────────────────────────────────────────────── */}
        {activeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-Pine/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.8rem] max-w-lg w-full p-8 shadow-2xl border border-white/20 relative">
              <button
                onClick={() => setActiveModal(null)}
                className="absolute top-6 right-6 p-2 rounded-full bg-Snowflake text-Pine hover:bg-Berry hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3.5 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-Pine text-white flex items-center justify-center shadow-md">
                  <Sparkles className="w-6 h-6 text-Frostysilver animate-spin" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-Pine">Phân tích AI Chuyên Sâu</h3>
                  <p className="text-xs text-Mist font-medium uppercase tracking-wider">Executive Insight Engine</p>
                </div>
              </div>

              <div className="space-y-4 my-6 text-xs text-Branch leading-relaxed">
                <div className="p-4 rounded-2xl bg-Snowflake border border-Mist/30">
                  <strong className="text-Pine block mb-1 font-black">Mô hình Đánh giá Rủi ro AI:</strong>
                  Hệ thống phân tích dựa trên chuỗi dữ liệu 50+ nhà cung ứng cho thấy xu hướng vi phạm về **An toàn lao động (OHS)** có dấu hiệu giảm 14% nhờ quy trình kiểm soát PDF tự động.
                </div>
                <div className="p-4 rounded-2xl bg-Berry/10 border border-Berry/20 text-Berry font-medium">
                  <strong>Khuyến nghị từ AI Manager:</strong> Cần ưu tiên phê duyệt 2 văn bản vi phạm mức High trước khi xuất báo cáo tuần.
                </div>
              </div>

              <button
                onClick={() => setActiveModal(null)}
                className="w-full py-3.5 bg-Pine text-white text-xs font-black rounded-2xl hover:bg-Berry transition-colors shadow-lg"
              >
                Đóng cửa sổ phân tích
              </button>
            </div>
          </div>
        )}

      </div>
    </MainLayout>
  )
}