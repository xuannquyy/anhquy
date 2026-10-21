import { useState, useEffect, useCallback, Fragment } from 'react'
import { toast } from 'sonner'
import {
  Search, Eye, ClipboardList, ChevronDown, ChevronUp,
  RefreshCw, Download
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

// ─── Diff Component (Chuẩn tông màu Winter: Berry vs Pine) ───────────────────

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
    return <p className="text-xs text-Mist italic">Không có dữ liệu thay đổi.</p>
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-Mist/30">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-Pine text-white">
            <th className="px-4 py-2.5 text-left font-extrabold w-1/4">Trường dữ liệu</th>
            <th className="px-4 py-2.5 text-left font-extrabold w-[37.5%] bg-Berry">Giá trị cũ (Old Value)</th>
            <th className="px-4 py-2.5 text-left font-extrabold w-[37.5%] bg-Pine">Giá trị mới (New Value)</th>
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
                  {oldV === undefined ? (
                    <span className="italic text-Mist">—</span>
                  ) : typeof oldV === 'object' ? (
                    JSON.stringify(oldV)
                  ) : (
                    String(oldV ?? 'null')
                  )}
                </td>
                <td className={`px-4 py-2.5 font-mono text-xs break-all ${changed ? 'text-Pine bg-Snowflake/80 font-extrabold' : 'text-Mist'}`}>
                  {newV === undefined ? (
                    <span className="italic text-Mist">—</span>
                  ) : typeof newV === 'object' ? (
                    JSON.stringify(newV)
                  ) : (
                    String(newV ?? 'null')
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Action Badge (Đồng bộ bảng màu Winter) ──────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const isDanger = ['DELETE', 'SOFT_DELETE', 'REVOKE_PERMISSION', 'LOCK', 'VIOLATION_APPROVED'].includes(action)
  const isPrimary = ['CREATE', 'UPLOAD', 'AI_ANALYZE', 'GRANT_PERMISSION', 'RESTORE'].includes(action)

  const cls = isDanger
    ? 'bg-Berry text-white'
    : isPrimary
    ? 'bg-Pine text-white'
    : 'bg-Snowflake text-Pine border border-Mist/35'

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-[11px] font-mono font-extrabold ${cls}`}>
      {action}
    </span>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ACTION_TYPES = [
  'UPDATE',
  'SOFT_DELETE',
  'RESTORE',
  'UPLOAD',
  'DELETE',
  'AI_ANALYZE',
  'VIOLATION_APPROVED',
  'VIOLATION_REJECTED',
  'GRANT_PERMISSION',
  'REVOKE_PERMISSION',
  'RESET_PASSWORD',
  'CHANGE_PASSWORD',
  'UPDATE_PROFILE',
]

const TARGET_TABLES = [
  'Users',
  'Documents',
  'Violations',
  'Suppliers',
  'Categories',
  'Standards',
  'Standard_Groups',
  'Role_Permissions',
  'System_Configs',
  'Risk_Thresholds',
]

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Filters
  const [search, setSearch]             = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [tableFilter, setTableFilter]   = useState('')
  const [page, setPage]                 = useState(1)
  const [limit, setLimit]               = useState(20)

  // Detail modal
  const [selectedLog, setSelectedLog]   = useState<AuditLog | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params: Record<string, string | number> = { page, limit }
      if (actionFilter) params.action_type = actionFilter
      if (tableFilter) params.target_table = tableFilter

      const res = await adminApi.getAuditLogs(params)
      const payload = (res as { data?: Record<string, unknown> })?.data ?? (res as unknown as Record<string, unknown>)

      const rawItems = (payload?.items ?? payload?.data ?? []) as AuditLog[]
      const rawTotal = Number(payload?.total ?? rawItems.length)

      const filteredItems = search.trim()
        ? rawItems.filter((item) => {
            const q = search.trim().toLowerCase()
            const name = item.Users?.full_name?.toLowerCase() ?? ''
            const email = item.Users?.email?.toLowerCase() ?? ''
            const act = item.action_type.toLowerCase()
            return name.includes(q) || email.includes(q) || act.includes(q)
          })
        : rawItems

      setLogs(filteredItems)
      setTotal(rawTotal)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi tải nhật ký kiểm toán'
      toast.error(msg)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page, limit, search, actionFilter, tableFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Tự động làm mới mỗi 10s nếu bật Live Stream
  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(() => {
      fetchLogs(true)
    }, 10000)
    return () => clearInterval(timer)
  }, [autoRefresh, fetchLogs])

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  const formatDate = (d: string) => {
    const dt = new Date(d)
    return dt.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const handleExportLogsCSV = () => {
    const BOM = '\uFEFF'
    const header = ['ID', 'Người thực hiện', 'Email', 'Hành động', 'Bảng dữ liệu', 'ID Mục tiêu', 'Thời gian']
    const rows = logs.map((l) => [
      l.id,
      `"${(l.Users?.full_name || 'Hệ thống').replace(/"/g, '""')}"`,
      l.Users?.email || '',
      l.action_type,
      l.target_table,
      l.target_id ?? '',
      formatDate(l.created_at),
    ])
    const csv = BOM + [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Nhat-ky-bao-mat-ANHQUY-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Đã xuất Nhật ký Kiểm toán ra file CSV.')
  }

  return (
    <MainLayout breadcrumb="Nhật ký Bảo mật">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-Pine tracking-tight flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-Berry" />
              Nhật ký Kiểm toán & Bảo mật Hệ thống
            </h1>
            <p className="text-xs sm:text-sm text-Mist mt-0.5">
              Ghi vết tự động toàn bộ thao tác nhạy cảm kèm dữ liệu trước và sau thay đổi — {total.toLocaleString('vi-VN')} bản ghi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              {autoRefresh ? 'Live 10s: Đang BẬT' : 'Tự động làm mới (10s)'}
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

        {/* Main Card */}
        <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] p-4 sm:p-5 space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
              <input
                type="text"
                placeholder="Tìm theo tên, email người thực hiện..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm border border-Mist/40 rounded-xl bg-Snowflake/20 text-Pine focus:outline-none focus:border-Pine"
              />
            </div>

            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 text-xs sm:text-sm font-bold border border-Mist/40 rounded-xl bg-white text-Pine focus:outline-none focus:border-Pine"
            >
              <option value="">Tất cả loại hành động</option>
              {ACTION_TYPES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <select
              value={tableFilter}
              onChange={(e) => { setTableFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 text-xs sm:text-sm font-bold border border-Mist/40 rounded-xl bg-white text-Pine focus:outline-none focus:border-Pine"
            >
              <option value="">Tất cả bảng dữ liệu (15 bảng)</option>
              {TARGET_TABLES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : logs.length === 0 ? (
            <EmptyState message="Chưa có bản ghi nhật ký nào phù hợp với bộ lọc." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-Mist/20">
              <table className="w-full text-xs sm:text-sm divide-y divide-Mist/15">
                <thead>
                  <tr className="bg-Pine text-white text-left">
                    <th className="px-4 py-3 font-extrabold w-8"></th>
                    <th className="px-4 py-3 font-extrabold text-xs uppercase tracking-wider">Người thực hiện</th>
                    <th className="px-4 py-3 font-extrabold text-xs uppercase tracking-wider">Hành động</th>
                    <th className="px-4 py-3 font-extrabold text-xs uppercase tracking-wider">Bảng dữ liệu</th>
                    <th className="px-4 py-3 font-extrabold text-xs uppercase tracking-wider">ID mục tiêu</th>
                    <th className="px-4 py-3 font-extrabold text-xs uppercase tracking-wider">Thời gian</th>
                    <th className="px-4 py-3 font-extrabold text-xs uppercase tracking-wider text-center">Đối chiếu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-Mist/15 bg-white">
                  {logs.map((log) => {
                    const expanded = expandedRows.has(log.id)
                    const hasChanges = log.old_value !== null || log.new_value !== null
                    return (
                      <Fragment key={log.id}>
                        <tr className="hover:bg-Snowflake/35 transition-colors">
                          <td className="px-4 py-3.5">
                            {hasChanges && (
                              <button
                                type="button"
                                onClick={() => toggleRow(log.id)}
                                className="text-Mist hover:text-Pine transition-colors"
                                title={expanded ? 'Thu gọn' : 'Xem thay đổi'}
                              >
                                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            {log.Users ? (
                              <div>
                                <p className="font-bold text-Pine text-xs sm:text-sm">{log.Users.full_name}</p>
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
                            <span className="font-mono text-xs font-bold bg-Snowflake px-2.5 py-1 rounded-xl text-Pine border border-Mist/30">
                              {log.target_table}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-xs text-Branch font-mono font-bold">
                            #{log.target_id ?? '—'}
                          </td>

                          <td className="px-4 py-3.5 text-xs text-Branch whitespace-nowrap">
                            {formatDate(log.created_at)}
                          </td>

                          <td className="px-4 py-3.5 text-center">
                            {hasChanges && (
                              <button
                                type="button"
                                onClick={() => setSelectedLog(log)}
                                title="Xem chi tiết thay đổi"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-Snowflake hover:bg-Pine hover:text-white text-Pine transition-all"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>

                        {expanded && hasChanges && (
                          <tr className="bg-Snowflake/30">
                            <td colSpan={7} className="px-6 py-4">
                              <p className="text-xs font-extrabold text-Pine mb-2 uppercase tracking-wider">
                                Bảng đối chiếu thay đổi dữ liệu (Old Value vs New Value)
                              </p>
                              <DiffTable oldVal={log.old_value} newVal={log.new_value} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && (
            <div className="pt-2 border-t border-Mist/15">
              <Pagination
                page={page}
                total={total}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={(nl) => { setLimit(nl); setPage(1) }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLog(null)}
          title={`Chi tiết Nhật ký — ${selectedLog.action_type} · ${selectedLog.target_table} #${selectedLog.target_id ?? '?'}`}
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
                <p className="font-bold text-Pine text-sm mt-0.5">{formatDate(selectedLog.created_at)}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-Pine mb-2">
                Bảng đối chiếu thay đổi dữ liệu
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