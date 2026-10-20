import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MainLayout } from '../components/MainLayout'
import { Spinner, StatusBadge } from '../components/ui'
import { dashboardApi, documentApi, violationApi } from '../api'
import { TrendingUp, FileText, AlertTriangle, Building2, Activity, ExternalLink } from 'lucide-react'

interface NormalizedStats {
  total_suppliers: number
  total_documents: number
  analyzing_documents: number
  analyzed_documents: number
  total_violations: number
  pending_violations: number
  supplier_risk_distribution: { Safe: number; Warning: number; Danger: number }
  violation_risk_distribution: { High: number; Medium: number; Low: number }
}

interface RecentDocument {
  id: number
  file_name: string
  status: string
  uploaded_at?: string
  created_at?: string
  Suppliers?: { company_name: string }
}

interface RecentViolation {
  id: number
  document_id?: number
  violation_desc: string
  risk_level: string
  status: string
  created_at: string
  Documents?: { id?: number; file_name: string; Suppliers?: { company_name: string } }
}

function KpiCard({
  title,
  value,
  icon,
  color,
  sub,
}: {
  title: string
  value: number | string
  icon: React.ReactNode
  color: string
  sub?: string
}) {
  const [displayVal, setDisplayVal] = useState(0)
  const numVal = typeof value === 'number' ? value : 0

  useEffect(() => {
    if (numVal === 0) {
      setDisplayVal(0)
      return
    }
    let start = 0
    const step = Math.max(1, Math.ceil(numVal / 25))
    const timer = setInterval(() => {
      start += step
      if (start >= numVal) {
        setDisplayVal(numVal)
        clearInterval(timer)
      } else {
        setDisplayVal(start)
      }
    }, 25)
    return () => clearInterval(timer)
  }, [numVal])

  return (
    <div className="bg-white rounded-lg border border-Mist/20 p-5 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-lg ${color}`}>{icon}</div>
        {sub && <span className="text-xs text-Mist bg-Snowflake px-2 py-1 rounded-md">{sub}</span>}
      </div>
      <div className="text-3xl font-bold text-Pine mb-1">
        {typeof value === 'number' ? displayVal.toLocaleString('vi-VN') : value}
      </div>
      <div className="text-sm text-Mist">{title}</div>
    </div>
  )
}

function RiskDistributionBar({
  data,
  type,
}: {
  data: Record<string, number>
  type: 'supplier' | 'violation'
}) {
  const total = Object.values(data).reduce((a, b) => a + b, 0)
  if (total === 0) return <p className="text-sm text-Mist py-4 text-center">Chưa có dữ liệu thống kê</p>

  const supplierColors: Record<string, { bar: string; label: string; text: string }> = {
    Safe:    { bar: 'bg-emerald-500', label: 'An toàn (80–100đ)',   text: 'text-emerald-600' },
    Warning: { bar: 'bg-amber-500',   label: 'Cảnh báo (50–79đ)',   text: 'text-amber-600' },
    Danger:  { bar: 'bg-Berry',       label: 'Nguy hiểm (<50đ)',    text: 'text-Berry' },
  }
  const violationColors: Record<string, { bar: string; label: string; text: string }> = {
    High:   { bar: 'bg-Berry',       label: 'Mức độ Cao (High)',        text: 'text-Berry' },
    Medium: { bar: 'bg-amber-500',   label: 'Trung bình (Medium)',      text: 'text-amber-600' },
    Low:    { bar: 'bg-emerald-500', label: 'Mức độ Thấp (Low)',        text: 'text-emerald-600' },
  }
  const colors = type === 'supplier' ? supplierColors : violationColors

  return (
    <div className="space-y-3">
      {Object.entries(data).map(([key, val]) => {
        const pct = total > 0 ? Math.round((val / total) * 100) : 0
        const cfg = colors[key] || { bar: 'bg-Mist', label: key, text: 'text-Mist' }
        return (
          <div key={key}>
            <div className="flex justify-between text-xs mb-1">
              <span className={`font-medium ${cfg.text}`}>{cfg.label}</span>
              <span className="text-Mist">{val} ({pct}%)</span>
            </div>
            <div className="bg-Snowflake rounded-md h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-md transition-all duration-700 ${cfg.bar}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<NormalizedStats | null>(null)
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([])
  const [recentViolations, setRecentViolations] = useState<RecentViolation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [statsRes, docsRes, violationsRes] = await Promise.all([
          dashboardApi.getStats().catch(() => ({ data: null })),
          documentApi.getAll({ page: 1, limit: 5 }).catch(() => ({ data: null })),
          violationApi.getAll({ page: 1, limit: 5, status: 'Pending' }).catch(() => ({ data: null })),
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
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  if (loading) {
    return (
      <MainLayout breadcrumb="Tổng quan">
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout breadcrumb="Tổng quan">
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Nhà cung ứng hoạt động"
            value={stats?.total_suppliers ?? 0}
            icon={<Building2 className="w-5 h-5 text-white" />}
            color="bg-Pine"
            sub="Đối tác"
          />
          <KpiCard
            title="Hợp đồng đã tải lên"
            value={stats?.total_documents ?? 0}
            icon={<FileText className="w-5 h-5 text-white" />}
            color="bg-Branch"
            sub={`${stats?.analyzed_documents ?? 0} đã phân tích`}
          />
          <KpiCard
            title="Tổng cảnh báo phát hiện"
            value={stats?.total_violations ?? 0}
            icon={<AlertTriangle className="w-5 h-5 text-white" />}
            color="bg-Berry"
            sub="RBA & Luật VN"
          />
          <KpiCard
            title="Vi phạm chờ thẩm định"
            value={stats?.pending_violations ?? 0}
            icon={<Activity className="w-5 h-5 text-white" />}
            color="bg-amber-500"
            sub="Cần xử lý"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-Mist/20 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-Pine" />
              <h3 className="font-semibold text-Pine text-sm">Phân bổ Nhà cung ứng theo Ngưỡng Rủi ro</h3>
            </div>
            <RiskDistributionBar
              data={stats?.supplier_risk_distribution ?? { Safe: 0, Warning: 0, Danger: 0 }}
              type="supplier"
            />
          </div>
          <div className="bg-white rounded-lg border border-Mist/20 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-Berry" />
              <h3 className="font-semibold text-Pine text-sm">Phân bổ Cảnh báo Vi phạm theo Mức độ</h3>
            </div>
            <RiskDistributionBar
              data={stats?.violation_risk_distribution ?? { High: 0, Medium: 0, Low: 0 }}
              type="violation"
            />
          </div>
        </div>

        {/* Recent tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Documents */}
          <div className="bg-white rounded-lg border border-Mist/20 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-Mist/10 flex items-center justify-between">
              <h3 className="font-semibold text-Pine text-sm">Hợp đồng mới nhất</h3>
              <Link to="/documents" className="text-xs text-Mist hover:text-Pine transition-colors">
                Xem tất cả →
              </Link>
            </div>
            <div className="divide-y divide-Mist/10">
              {recentDocs.length === 0 ? (
                <p className="text-sm text-Mist text-center py-8">Chưa có hợp đồng nào</p>
              ) : (
                recentDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between px-5 py-3 hover:bg-Snowflake/50 transition-colors gap-3">
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/audit/${doc.id}`}
                        className="text-sm font-medium text-Pine hover:underline truncate block"
                      >
                        {doc.file_name}
                      </Link>
                      <p className="text-xs text-Mist truncate">{doc.Suppliers?.company_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={doc.status} />
                      <Link
                        to={`/audit/${doc.id}`}
                        title="Mở Phòng Kiểm toán AI"
                        className="p-1 text-Mist hover:text-Pine rounded transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pending Violations */}
          <div className="bg-white rounded-lg border border-Mist/20 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-Mist/10 flex items-center justify-between">
              <h3 className="font-semibold text-Pine text-sm">Vi phạm chờ thẩm định</h3>
              <Link to="/violations" className="text-xs text-Mist hover:text-Pine transition-colors">
                Xem tất cả →
              </Link>
            </div>
            <div className="divide-y divide-Mist/10">
              {recentViolations.length === 0 ? (
                <p className="text-sm text-Mist text-center py-8">Không có vi phạm chờ xử lý</p>
              ) : (
                recentViolations.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-5 py-3 hover:bg-Snowflake/50 transition-colors gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-Pine truncate">{v.violation_desc}</p>
                      <p className="text-xs text-Mist truncate">{v.Documents?.Suppliers?.company_name || v.Documents?.file_name}</p>
                    </div>
                    <StatusBadge status={v.risk_level} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}