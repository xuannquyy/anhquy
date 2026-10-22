import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { toast } from 'sonner'
import {
  Search, Eye, ClipboardList, ChevronDown, ChevronUp,
  RefreshCw, Download, Calendar, Users, Clock, Filter, Layers
} from 'lucide-react'
import { MainLayout } from '../../components/MainLayout'
import { Modal, Pagination, Spinner, EmptyState } from '../../components/ui'
import { adminApi } from '../../api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: number
  user_id: number | null
  action_type: string
  target_table: string
  target_id: number | null
  old_value: Record<string, unknown> | string | null
  new_value: Record<string, unknown> | string | null
  ip_address?: string | null
  created_at: string
  Users?: {
    id: number
    full_name: string
    email: string
  } | null
}

// Nhãn tiếng Việt dễ hiểu cho các hành động hệ thống
const ACTION_LABELS: Record<string, string> = {
  CREATE:             'Tạo mới dữ liệu',
  UPLOAD:             'Tải lên hợp đồng PDF',
  UPDATE:             'Cập nhật thông tin',
  UPDATE_PROFILE:     'Cập nhật hồ sơ cá nhân',
  DELETE:             'Xóa dữ liệu',
  SOFT_DELETE:        'Xóa mềm / Lưu trữ',
  RESTORE:            'Khôi phục hoạt động',
  AI_ANALYZE:         'Chạy quét AI hợp đồng',
  VIOLATION_APPROVED: 'Phê duyệt lỗi – Trừ điểm',
  VIOLATION_REJECTED: 'Bác bỏ cảnh báo AI',
  GRANT_PERMISSION:   'Cấp quyền hạn RBAC',
  REVOKE_PERMISSION:  'Thu hồi quyền hạn RBAC',
  RESET_PASSWORD:     'Admin cấp lại mật khẩu',
  CHANGE_PASSWORD:    'Đổi mật khẩu cá nhân',
}

// ─── Helper: Parse chuỗi JSON từ SQL Server ──────────────────────────────────

function parseJsonField(val: unknown): Record<string, unknown> | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (!trimmed) return null
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
      return { value: parsed }
    } catch {
      return { value: trimmed }
    }
  }
  if (typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>
  }
  return null
}

// ─── Diff Component ───────────────────────────────────────────────────────────

function DiffTable({
  oldVal,
  newVal,
}: {
  oldVal: Record<string, unknown> | string | null
  newVal: Record<string, unknown> | string | null
}) {
  const parsedOld = parseJsonField(oldVal)
  const parsedNew = parseJsonField(newVal)

  const allKeys = Array.from(
    new Set([
      ...Object.keys(parsedOld ?? {}),
      ...Object.keys(parsedNew ?? {}),
    ])
  )

  if (allKeys.length === 0) {
    return <p className="text-xs text-Mist italic">Không có dữ liệu thay đổi chi tiết.</p>
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-Mist/30">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-Pine text-white">
            <th className="px-4 py-2.5 text-left font-extrabold w-1/4">Trường thông tin</th>
            <th className="px-4 py-2.5 text-left font-extrabold w-[37.5%] bg-Berry">Trước khi sửa (Old Value)</th>
            <th className="px-4 py-2.5 text-left font-extrabold w-[37.5%] bg-Pine">Sau khi sửa (New Value)</th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key, idx) => {
            const oldV = parsedOld?.[key]
            const newV = parsedNew?.[key]
            const changed = JSON.stringify(oldV) !== JSON.stringify(newV)
            return (
              <tr key={key} className={`border-t border-Mist/20 ${idx % 2 === 0 ? 'bg-Snowflake/40' : 'bg-white'}`}>
                <td className="px-4 py-2.5 font-mono text-xs text-Pine font-extrabold">{key}</td>
                <td className={`px-4 py-2.5 font-mono text-xs break-all ${changed ? 'text-Berry bg-Berry/[0.06] font-semibold' : 'text-Mist'}`}>
                  {oldV === undefined ? '—' : typeof oldV === 'object' ? JSON.stringify(oldV) : String(oldV ?? 'null')}
                </td>
                <td className={`px-4 py-2.5 font-mono text-xs break-all ${changed ? 'text-Pine bg-Snowflake/80 font-extrabold' : 'text-Mist'}`}>
                  {newV === undefined ? '—' : typeof newV === 'object' ? JSON.stringify(newV) : String(newV ?? 'null')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Action Badge ─────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const isDanger = ['DELETE', 'SOFT_DELETE', 'REVOKE_PERMISSION', 'LOCK', 'VIOLATION_APPROVED'].includes(action)
  const isPrimary = ['CREATE', 'UPLOAD', 'AI_ANALYZE', 'GRANT_PERMISSION', 'RESTORE'].includes(action)

  const cls = isDanger
    ? 'bg-Berry text-white'
    : isPrimary
    ? 'bg-Pine text-white'
    : 'bg-Snowflake text-Pine border border-Mist/35'

  return (
    <div className="inline-flex flex-col">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold w-fit ${cls}`}>
        {ACTION_LABELS[action] || action}
      </span>
      <span className="text-[10px] font-mono text-Mist mt-0.5">{action}</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ACTION_TYPES = Object.keys(ACTION_LABELS)

const TARGET_TABLES = [
  'Users',
  'Documents',
  'Violations',
  'Suppliers',
  'Categories',
  'Standards',
  'Role_Permissions',
  'System_Configs',
  'Risk_Thresholds',
]

// Chuyển ngày sang chuỗi YYYY-MM-DD theo múi giờ địa phương
function toLocalDateKey(isoStr: string): string {
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return 'Không xác định'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatVietnameseDateHeader(dateKey: string): string {
  const [y, m, d] = dateKey.split('-')
  if (!y || !m || !d) return dateKey
  const dt = new Date(Number(y), Number(m) - 1, Number(d))
  const weekday = dt.toLocaleDateString('vi-VN', { weekday: 'long' })
  return `${weekday}, ${d}/${m}/${y}`
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Chế độ xem: 'drilldown' (Theo Ngày -> Nhân sự -> Hành động) hoặc 'table' (Bảng phẳng)
  const [viewMode, setViewMode] = useState<'drilldown' | 'table'>('drilldown')

  // Bộ lọc truy vấn Thời gian & Điều kiện
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [search, setSearch]             = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [tableFilter, setTableFilter]   = useState('')

  // State cho chế độ Drill-down 3 bước
  const [selectedDateKey, setSelectedDateKey] = useState<string>('')
  const [selectedUserKey, setSelectedUserKey] = useState<string>('ALL')

  // Phân trang cho chế độ Bảng tổng hợp
  const [page, setPage]   = useState(1)
  const [limit, setLimit] = useState(20)

  // Detail modal
  const [selectedLog, setSelectedLog]   = useState<AuditLog | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      // Lấy tập dữ liệu rộng (limit 200) để gom nhóm theo Ngày -> Nhân sự -> Hành động mượt mà
      const params: Record<string, string | number> = { page: 1, limit: 200 }
      if (actionFilter) params.action_type = actionFilter
      if (tableFilter) params.target_table = tableFilter

      const res = await adminApi.getAuditLogs(params)
      const payload = (res as { data?: Record<string, unknown> })?.data ?? (res as unknown as Record<string, unknown>)
      const rawItems = (payload?.items ?? payload?.data ?? []) as AuditLog[]

      setLogs(rawItems)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi tải nhật ký kiểm toán'
      toast.error(msg)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [actionFilter, tableFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(() => fetchLogs(true), 10000)
    return () => clearInterval(timer)
  }, [autoRefresh, fetchLogs])

  // 1. Lọc danh sách logs theo Từ ngày - Đến ngày & Ô tìm kiếm
  const filteredLogs = useMemo(() => {
    return logs.filter((item) => {
      const dateKey = toLocalDateKey(item.created_at)
      if (dateFrom && dateKey < dateFrom) return false
      if (dateTo && dateKey > dateTo) return false

      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const name = item.Users?.full_name?.toLowerCase() ?? 'hệ thống'
        const email = item.Users?.email?.toLowerCase() ?? ''
        const act = item.action_type.toLowerCase()
        const tbl = item.target_table.toLowerCase()
        if (!name.includes(q) && !email.includes(q) && !act.includes(q) && !tbl.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [logs, dateFrom, dateTo, search])

  // 2. Gom nhóm theo NGÀY (Bước 1)
  const dateGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        dateKey: string
        logs: AuditLog[]
        uniqueUsers: Set<string>
      }
    >()

    filteredLogs.forEach((log) => {
      const dk = toLocalDateKey(log.created_at)
      if (!map.has(dk)) {
        map.set(dk, { dateKey: dk, logs: [], uniqueUsers: new Set() })
      }
      const grp = map.get(dk)!
      grp.logs.push(log)
      grp.uniqueUsers.add(log.Users?.email || 'system')
    })

    return Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey))
  }, [filteredLogs])

  // Tự động chọn ngày mới nhất khi dữ liệu tải xong
  useEffect(() => {
    if (dateGroups.length > 0 && (!selectedDateKey || !dateGroups.some((d) => d.dateKey === selectedDateKey))) {
      setSelectedDateKey(dateGroups[0].dateKey)
      setSelectedUserKey('ALL')
    }
  }, [dateGroups, selectedDateKey])

  // 3. Danh sách NHÂN SỰ hoạt động trong Ngày đang chọn (Bước 2)
  const usersInSelectedDate = useMemo(() => {
    const targetDateGroup = dateGroups.find((d) => d.dateKey === selectedDateKey)
    if (!targetDateGroup) return []

    const userMap = new Map<
      string,
      {
        userKey: string
        fullName: string
        email: string
        logs: AuditLog[]
      }
    >()

    targetDateGroup.logs.forEach((l) => {
      const uKey = l.Users?.email || 'SYSTEM'
      if (!userMap.has(uKey)) {
        userMap.set(uKey, {
          userKey: uKey,
          fullName: l.Users?.full_name || 'Hệ thống tự động',
          email: l.Users?.email || 'Tác vụ nền',
          logs: [],
        })
      }
      userMap.get(uKey)!.logs.push(l)
    })

    return Array.from(userMap.values()).sort((a, b) => b.logs.length - a.logs.length)
  }, [dateGroups, selectedDateKey])

  // 4. Danh sách HÀNH ĐỘNG chi tiết của Nhân sự đó trong Ngày đang chọn (Bước 3)
  const actionsInSelectedDateAndUser = useMemo(() => {
    const targetDateGroup = dateGroups.find((d) => d.dateKey === selectedDateKey)
    if (!targetDateGroup) return []
    if (selectedUserKey === 'ALL') return targetDateGroup.logs
    return targetDateGroup.logs.filter((l) => (l.Users?.email || 'SYSTEM') === selectedUserKey)
  }, [dateGroups, selectedDateKey, selectedUserKey])

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  const formatTimeOnly = (d: string) =>
    new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const formatDateFull = (d: string) =>
    new Date(d).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const handleExportLogsCSV = () => {
      const rowsHtml = filteredLogs
        .map(
          (l, idx) => `
        <tr>
          <td style="text-align:center;font-weight:bold">${idx + 1}</td>
          <td style="text-align:center">${toLocalDateKey(l.created_at)}</td>
          <td style="text-align:center">${formatTimeOnly(l.created_at)}</td>
          <td style="font-weight:bold">${l.Users?.full_name || 'Hệ thống'}</td>
          <td>${l.Users?.email || '—'}</td>
          <td style="font-weight:bold;color:#791127">${ACTION_LABELS[l.action_type] || l.action_type}</td>
          <td>${l.target_table}</td>
          <td style="text-align:center">${l.target_id ?? '—'}</td>
        </tr>`
        )
        .join('')
  
      const excelHtml = `\uFEFF<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/><style>table{border-collapse:collapse}th{background:#0B132B;color:#fff;padding:8px;border:1px solid #334155}td{padding:7px;border:1px solid #CBD5E1}</style></head><body><table><thead><tr><th>STT</th><th>Ngày</th><th>Giờ</th><th>Người thực hiện</th><th>Email</th><th>Thao tác</th><th>Bảng dữ liệu</th><th>ID Mục tiêu</th></tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`
  
      const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Nhat-ky-bao-mat-ANHQUY-${new Date().toISOString().slice(0, 10)}.xls`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Đã xuất Nhật ký Kiểm toán ra file Excel (.xls)!')
    }

  const pagedTableLogs = filteredLogs.slice((page - 1) * limit, page * limit)

  return (
    <MainLayout breadcrumb="Nhật ký Bảo mật">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-Pine tracking-tight flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-Berry" />
              Truy vấn Nhật ký Kiểm toán & Bảo mật
            </h1>
            <p className="text-xs sm:text-sm text-Mist mt-0.5">
              Tra cứu theo trình tự: Chọn Ngày tháng năm → Xem những ai hoạt động trong ngày → Xem chi tiết từng thao tác
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Chuyển chế độ xem */}
            <div className="flex items-center bg-white p-1 rounded-2xl border border-Mist/30 shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode('drilldown')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                  viewMode === 'drilldown' ? 'bg-Pine text-white' : 'text-Branch hover:text-Pine'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Tra cứu theo Ngày & Nhân sự
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                  viewMode === 'table' ? 'bg-Pine text-white' : 'text-Branch hover:text-Pine'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Bảng tổng hợp
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-extrabold border transition-all ${
                autoRefresh
                  ? 'bg-Berry text-white border-Berry shadow-sm'
                  : 'bg-white text-Pine border-Mist/40 hover:bg-Snowflake'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Live 10s: BẬT' : 'Làm mới tự động'}
            </button>

            <button
              type="button"
              onClick={handleExportLogsCSV}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-2xl hover:bg-Pine/90 shadow-sm transition-all"
            >
              <Download className="w-4 h-4" />
              Xuất CSV
            </button>
          </div>
        </div>

        {/* ── Thanh Bộ lọc Thời gian (Từ ngày -> Đến ngày) & Điều kiện ── */}
        <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-extrabold uppercase text-Pine mb-1">Từ ngày</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold border border-Mist/40 rounded-xl bg-Snowflake/20 text-Pine focus:outline-none focus:border-Pine"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase text-Pine mb-1">Đến ngày</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold border border-Mist/40 rounded-xl bg-Snowflake/20 text-Pine focus:outline-none focus:border-Pine"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase text-Pine mb-1">Loại thao tác</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold border border-Mist/40 rounded-xl bg-white text-Pine focus:outline-none focus:border-Pine"
              >
                <option value="">Tất cả thao tác</option>
                {ACTION_TYPES.map((a) => (
                  <option key={a} value={a}>{ACTION_LABELS[a]} ({a})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase text-Pine mb-1">Bảng dữ liệu</label>
              <select
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold border border-Mist/40 rounded-xl bg-white text-Pine focus:outline-none focus:border-Pine"
              >
                <option value="">Tất cả bảng dữ liệu</option>
                {TARGET_TABLES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase text-Pine mb-1">Tìm kiếm nhanh</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-Mist" />
                <input
                  type="text"
                  placeholder="Tên, email, hành động..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-Mist/40 rounded-xl bg-Snowflake/20 text-Pine focus:outline-none focus:border-Pine"
                />
              </div>
            </div>
          </div>

          {(dateFrom || dateTo || actionFilter || tableFilter || search) && (
            <div className="mt-3 pt-3 border-t border-Mist/15 flex items-center justify-between text-xs">
              <span className="text-Branch flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-Berry" />
                Đang lọc: Tìm thấy <strong className="text-Pine">{filteredLogs.length}</strong> sự kiện trong{' '}
                <strong className="text-Pine">{dateGroups.length}</strong> ngày
              </span>
              <button
                type="button"
                onClick={() => {
                  setDateFrom('')
                  setDateTo('')
                  setActionFilter('')
                  setTableFilter('')
                  setSearch('')
                }}
                className="text-Berry font-extrabold hover:underline"
              >
                Xóa bộ lọc
              </button>
            </div>
          )}
        </div>

        {/* ═════════════════════════════════════════════════════════════════════
            CHẾ ĐỘ 1: TRUY VẤN PHÂN CẤP 3 BƯỚC (NGÀY -> NHÂN SỰ -> HÀNH ĐỘNG)
        ═════════════════════════════════════════════════════════════════════ */}
        {loading ? (
          <div className="flex items-center justify-center py-20 bg-white rounded-3xl">
            <Spinner size="lg" />
          </div>
        ) : dateGroups.length === 0 ? (
          <div className="bg-white rounded-3xl p-8">
            <EmptyState message="Không có nhật ký hoạt động nào trong khoảng thời gian này." />
          </div>
        ) : viewMode === 'drilldown' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* ── BƯỚC 1 (Cột trái - 4 cột): Danh sách Ngày tháng năm ── */}
            <div className="lg:col-span-4 bg-white rounded-3xl border border-white p-4 shadow-[0_10px_28px_rgba(39,54,63,0.06)]">
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-Pine flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-Berry" />
                  1. Chọn Ngày ({dateGroups.length} ngày)
                </h3>
                <span className="text-[11px] text-Mist">Mới nhất lên đầu</span>
              </div>

              <div className="space-y-2 max-h-[68vh] overflow-y-auto pr-1">
                {dateGroups.map((grp) => {
                  const isSelected = grp.dateKey === selectedDateKey
                  return (
                    <button
                      key={grp.dateKey}
                      type="button"
                      onClick={() => {
                        setSelectedDateKey(grp.dateKey)
                        setSelectedUserKey('ALL')
                      }}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-200 ${
                        isSelected
                          ? 'bg-Pine text-white border-Pine shadow-md'
                          : 'bg-Snowflake/35 hover:bg-Snowflake/80 text-Pine border-Mist/25'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs sm:text-sm font-extrabold">
                          {formatVietnameseDateHeader(grp.dateKey)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold ${
                            isSelected ? 'bg-Berry text-white' : 'bg-white text-Pine border border-Mist/30'
                          }`}
                        >
                          {grp.logs.length} thao tác
                        </span>
                      </div>
                      <div className={`flex items-center gap-3 text-[11px] ${isSelected ? 'text-Frostysilver' : 'text-Branch'}`}>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {grp.uniqueUsers.size} nhân sự hoạt động
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── BƯỚC 2 & BƯỚC 3 (Cột phải - 8 cột): Nhân sự trong ngày & Dòng thời gian hành động ── */}
            <div className="lg:col-span-8 space-y-4">
              {/* BƯỚC 2: Trong ngày đó có những ai hoạt động? */}
              <div className="bg-white rounded-3xl border border-white p-5 shadow-[0_10px_28px_rgba(39,54,63,0.06)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-Pine flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-Berry" />
                      2. Nhân sự hoạt động trong {formatVietnameseDateHeader(selectedDateKey)}
                    </h3>
                    <p className="text-xs text-Mist mt-0.5">
                      Bấm vào từng nhân sự để xem riêng những việc người đó đã làm trong ngày
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {/* Thẻ Xem tất cả mọi người trong ngày */}
                  <button
                    type="button"
                    onClick={() => setSelectedUserKey('ALL')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      selectedUserKey === 'ALL'
                        ? 'bg-Berry text-white border-Berry shadow-sm'
                        : 'bg-Snowflake/40 hover:bg-Snowflake text-Pine border-Mist/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold">Tất cả nhân sự</span>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold ${
                        selectedUserKey === 'ALL' ? 'bg-white text-Berry' : 'bg-Pine text-white'
                      }`}>
                        {dateGroups.find((d) => d.dateKey === selectedDateKey)?.logs.length ?? 0} việc
                      </span>
                    </div>
                    <p className={`text-[11px] mt-1 ${selectedUserKey === 'ALL' ? 'text-white/85' : 'text-Mist'}`}>
                      Toàn bộ hoạt động trong ngày
                    </p>
                  </button>

                  {/* Thẻ từng Nhân sự hoạt động trong ngày đó */}
                  {usersInSelectedDate.map((u) => {
                    const isActiveUser = selectedUserKey === u.userKey
                    return (
                      <button
                        key={u.userKey}
                        type="button"
                        onClick={() => setSelectedUserKey(u.userKey)}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          isActiveUser
                            ? 'bg-Pine text-white border-Pine shadow-sm'
                            : 'bg-white hover:bg-Snowflake/50 text-Pine border-Mist/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                                isActiveUser ? 'bg-white text-Pine' : 'bg-Pine text-white'
                              }`}
                            >
                              {u.fullName.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-extrabold truncate">{u.fullName}</span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold flex-shrink-0 ${
                              isActiveUser ? 'bg-Berry text-white' : 'bg-Snowflake text-Pine'
                            }`}
                          >
                            {u.logs.length} việc
                          </span>
                        </div>
                        <p className={`text-[11px] font-mono truncate mt-1.5 ${isActiveUser ? 'text-Frostysilver' : 'text-Mist'}`}>
                          {u.email}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* BƯỚC 3: Chi tiết từng hành động theo giờ:phút:giây */}
              <div className="bg-white rounded-3xl border border-white p-5 shadow-[0_10px_28px_rgba(39,54,63,0.06)]">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-Mist/15">
                  <div>
                    <h3 className="text-sm font-extrabold text-Pine flex items-center gap-2">
                      <Clock className="w-4 h-4 text-Berry" />
                      3. Nhật ký thao tác chi tiết ({actionsInSelectedDateAndUser.length} hành động)
                    </h3>
                    <p className="text-xs text-Mist mt-0.5">
                      {selectedUserKey === 'ALL'
                        ? `Đang hiển thị toàn bộ thao tác trong ${formatVietnameseDateHeader(selectedDateKey)}`
                        : `Đang lọc riêng các thao tác của: ${selectedUserKey}`}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {actionsInSelectedDateAndUser.map((log) => {
                    const expanded = expandedRows.has(log.id)
                    const hasChanges = log.old_value !== null || log.new_value !== null

                    return (
                      <div
                        key={log.id}
                        className="rounded-2xl border border-Mist/25 bg-Snowflake/20 hover:bg-Snowflake/40 transition-all overflow-hidden"
                      >
                        <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            {/* Giờ : Phút : Giây */}
                            <div className="px-2.5 py-1.5 rounded-xl bg-Pine text-white font-mono text-xs font-extrabold flex-shrink-0">
                              {formatTimeOnly(log.created_at)}
                            </div>

                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs sm:text-sm font-extrabold text-Pine">
                                  {log.Users?.full_name || 'Hệ thống'}
                                </span>
                                <span className="text-xs text-Mist">đã thực hiện</span>
                                <span className="px-2.5 py-0.5 rounded-lg bg-Berry/10 text-Berry text-xs font-extrabold">
                                  {ACTION_LABELS[log.action_type] || log.action_type}
                                </span>
                              </div>
                              <p className="text-xs text-Branch mt-1">
                                Tác động lên bảng:{' '}
                                <code className="font-mono font-bold text-Pine bg-white px-2 py-0.5 rounded border border-Mist/25">
                                  {log.target_table}
                                </code>{' '}
                                {log.target_id ? `(Bản ghi #${log.target_id})` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            {hasChanges && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => toggleRow(log.id)}
                                  className="px-3 py-1.5 rounded-xl bg-white border border-Mist/30 text-xs font-bold text-Pine hover:bg-Pine hover:text-white transition-colors flex items-center gap-1"
                                >
                                  {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  {expanded ? 'Ẩn dữ liệu' : 'Xem thay đổi'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedLog(log)}
                                  className="p-1.5 rounded-xl bg-white border border-Mist/30 text-Pine hover:bg-Pine hover:text-white transition-colors"
                                  title="Mở cửa sổ đối chiếu lớn"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {expanded && hasChanges && (
                          <div className="px-4 pb-4 pt-2 border-t border-Mist/20 bg-white">
                            <DiffTable oldVal={log.old_value} newVal={log.new_value} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ═══════════════════════════════════════════════════════════════════
             CHẾ ĐỘ 2: BẢNG TỔNG HỢP (KHI CẦN TRA CỨU DẠNG BẢNG)
          ═══════════════════════════════════════════════════════════════════ */
          <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] p-4 sm:p-5 space-y-4">
            <div className="overflow-x-auto rounded-2xl border border-Mist/20">
              <table className="w-full text-xs sm:text-sm divide-y divide-Mist/15">
                <thead>
                  <tr className="bg-Pine text-white text-left">
                    <th className="px-4 py-3 font-extrabold text-xs uppercase tracking-wider">Thời gian</th>
                    <th className="px-4 py-3 font-extrabold text-xs uppercase tracking-wider">Người thực hiện</th>
                    <th className="px-4 py-3 font-extrabold text-xs uppercase tracking-wider">Thao tác</th>
                    <th className="px-4 py-3 font-extrabold text-xs uppercase tracking-wider">Bảng dữ liệu</th>
                    <th className="px-4 py-3 font-extrabold text-xs uppercase tracking-wider text-center">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-Mist/15 bg-white">
                  {pagedTableLogs.map((log) => {
                    const hasChanges = log.old_value !== null || log.new_value !== null
                    return (
                      <Fragment key={log.id}>
                        <tr className="hover:bg-Snowflake/35 transition-colors">
                          <td className="px-4 py-3.5 text-xs font-mono text-Pine font-bold whitespace-nowrap">
                            {formatDateFull(log.created_at)}
                          </td>
                          <td className="px-4 py-3.5">
                            {log.Users ? (
                              <div>
                                <p className="font-bold text-Pine">{log.Users.full_name}</p>
                                <p className="text-[11px] font-mono text-Mist">{log.Users.email}</p>
                              </div>
                            ) : (
                              <span className="text-Mist italic text-xs">Hệ thống</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <ActionBadge action={log.action_type} />
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-mono text-xs font-bold bg-Snowflake px-2.5 py-1 rounded-xl text-Pine">
                              {log.target_table} {log.target_id ? `#${log.target_id}` : ''}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {hasChanges && (
                              <button
                                type="button"
                                onClick={() => setSelectedLog(log)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-Snowflake hover:bg-Pine hover:text-white text-Pine transition-all"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              total={filteredLogs.length}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={(nl) => { setLimit(nl); setPage(1) }}
            />
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLog(null)}
          title={`Chi tiết Nhật ký — ${ACTION_LABELS[selectedLog.action_type] || selectedLog.action_type}`}
          size="xl"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-Snowflake/60 rounded-2xl px-4 py-3 border border-Mist/20">
                <p className="text-Mist">Người thực hiện</p>
                <p className="font-extrabold text-Pine text-sm mt-0.5">{selectedLog.Users?.full_name ?? 'Hệ thống'}</p>
              </div>
              <div className="bg-Snowflake/60 rounded-2xl px-4 py-3 border border-Mist/20">
                <p className="text-Mist">Email định danh</p>
                <p className="font-mono font-bold text-Pine text-sm mt-0.5">{selectedLog.Users?.email ?? '—'}</p>
              </div>
              <div className="bg-Snowflake/60 rounded-2xl px-4 py-3 border border-Mist/20">
                <p className="text-Mist">Thời điểm ghi vết</p>
                <p className="font-bold text-Pine text-sm mt-0.5">{formatDateFull(selectedLog.created_at)}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-Pine mb-2">
                Bảng đối chiếu thay đổi dữ liệu ({selectedLog.target_table} #{selectedLog.target_id ?? '?'})
              </p>
              <DiffTable oldVal={selectedLog.old_value} newVal={selectedLog.new_value} />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2.5 text-xs font-extrabold rounded-xl bg-Pine text-white hover:bg-Pine/90 transition-all shadow-sm"
              >
                Đóng cửa sổ
              </button>
            </div>
          </div>
        </Modal>
      )}
    </MainLayout>
  )
}