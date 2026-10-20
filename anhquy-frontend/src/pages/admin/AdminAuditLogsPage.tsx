import { useState, useEffect, useCallback, Fragment } from 'react'
import { toast } from 'sonner'
import { Search, Eye, ClipboardList, ChevronDown, ChevronUp } from 'lucide-react'
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

// ─── Helper: Parse chuỗi JSON từ SQL Server (old_value / new_value) ──────────

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
    return <p className="text-sm text-Mist italic">Không có dữ liệu thay đổi.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-Mist/30">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-Pine text-Snowflake">
            <th className="px-4 py-2 text-left font-medium w-1/4">Trường</th>
            <th className="px-4 py-2 text-left font-medium w-[37.5%] bg-red-900/40">Giá trị cũ (Old Value)</th>
            <th className="px-4 py-2 text-left font-medium w-[37.5%] bg-green-900/40">Giá trị mới (New Value)</th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key, idx) => {
            const oldV = parsedOld?.[key]
            const newV = parsedNew?.[key]
            const changed = JSON.stringify(oldV) !== JSON.stringify(newV)
            return (
              <tr key={key} className={`border-t border-Mist/20 ${idx % 2 === 0 ? 'bg-Snowflake' : 'bg-white'}`}>
                <td className="px-4 py-2 font-mono text-xs text-Branch font-semibold">{key}</td>
                <td className={`px-4 py-2 font-mono text-xs break-all ${changed ? 'text-red-700 bg-red-50' : 'text-Mist'}`}>
                  {oldV === undefined ? (
                    <span className="italic text-Mist">—</span>
                  ) : typeof oldV === 'object' ? (
                    JSON.stringify(oldV)
                  ) : (
                    String(oldV ?? 'null')
                  )}
                </td>
                <td className={`px-4 py-2 font-mono text-xs break-all ${changed ? 'text-green-700 bg-green-50' : 'text-Mist'}`}>
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

// ─── Action Badge ─────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, string> = {
    CREATE: 'bg-green-100 text-green-800',
    UPLOAD: 'bg-green-100 text-green-800',
    UPDATE: 'bg-blue-100 text-blue-800',
    UPDATE_PROFILE: 'bg-blue-100 text-blue-800',
    DELETE: 'bg-red-100 text-red-800',
    SOFT_DELETE: 'bg-red-100 text-red-800',
    RESTORE: 'bg-teal-100 text-teal-800',
    LOGIN: 'bg-purple-100 text-purple-800',
    LOGOUT: 'bg-gray-100 text-gray-700',
    APPROVE: 'bg-emerald-100 text-emerald-800',
    VIOLATION_APPROVED: 'bg-emerald-100 text-emerald-800',
    REJECT: 'bg-orange-100 text-orange-800',
    VIOLATION_REJECTED: 'bg-orange-100 text-orange-800',
    ANALYZE: 'bg-indigo-100 text-indigo-800',
    AI_ANALYZE: 'bg-indigo-100 text-indigo-800',
    GRANT_PERMISSION: 'bg-emerald-100 text-emerald-800',
    REVOKE_PERMISSION: 'bg-Berry/15 text-Berry',
    RESET_PASSWORD: 'bg-yellow-100 text-yellow-800',
    CHANGE_PASSWORD: 'bg-yellow-100 text-yellow-800',
    LOCK: 'bg-Berry/10 text-Berry',
    UNLOCK: 'bg-Mist/20 text-Branch',
  }
  const cls = map[action] ?? 'bg-Frostysilver text-Branch'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${cls}`}>
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
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  // Detail modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page, limit }
      if (actionFilter) params.action_type = actionFilter
      if (tableFilter) params.target_table = tableFilter

      const res = await adminApi.getAuditLogs(params)
      const payload = (res as { data?: Record<string, unknown> })?.data ?? (res as unknown as Record<string, unknown>)

      const rawItems = (payload?.items ?? payload?.data ?? []) as AuditLog[]
      const rawTotal = Number(payload?.total ?? rawItems.length)

      // Lọc nhanh trên client nếu người dùng nhập tên/email vào ô search
      const filteredItems = search.trim()
        ? rawItems.filter(item => {
            const q = search.trim().toLowerCase()
            const name = item.Users?.full_name?.toLowerCase() ?? ''
            const email = item.Users?.email?.toLowerCase() ?? ''
            const act = item.action_type.toLowerCase()
            return name.includes(q) || email.includes(q) || act.includes(q)
          })
        : rawItems

      setLogs(filteredItems)
      setTotal(rawTotal)
      setTotalPages(Math.max(1, Math.ceil(rawTotal / limit)))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi tải nhật ký kiểm toán'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [page, search, actionFilter, tableFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Reset page on filter change
  useEffect(() => {
    setPage(1)
  }, [search, actionFilter, tableFilter])

  // ── Toggle expanded row ────────────────────────────────────────────────────

  const toggleRow = (id: number) => {
    setExpandedRows(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  // ── Format helpers ─────────────────────────────────────────────────────────

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

  // Tương thích mọi kiểu khai báo PaginationProps trong components/ui
  const paginationCompatProps = {
    page,
    currentPage: page,
    total,
    limit,
    totalPages,
    onPageChange: setPage,
    onChange: setPage,
  } as unknown as Parameters<typeof Pagination>[0]

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-Pine flex items-center gap-2">
              <ClipboardList className="w-6 h-6" />
              Nhật Ký Kiểm Toán Hệ Thống
            </h1>
            <p className="text-sm text-Mist mt-1">
              Toàn bộ hành động nhạy cảm được ghi vết tự động — {total.toLocaleString('vi-VN')} bản ghi
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-Mist/30 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* User search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
              <input
                type="text"
                placeholder="Tìm theo tên / email người thực hiện..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-Mist/40 rounded-md bg-Snowflake focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine transition-all duration-200"
              />
            </div>

            {/* Action type */}
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-Mist/40 rounded-md bg-Snowflake focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine transition-all duration-200"
            >
              <option value="">Tất cả hành động</option>
              {ACTION_TYPES.map(a => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            {/* Target table */}
            <select
              value={tableFilter}
              onChange={e => setTableFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-Mist/40 rounded-md bg-Snowflake focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine transition-all duration-200"
            >
              <option value="">Tất cả bảng dữ liệu</option>
              {TARGET_TABLES.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-Mist/30 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : logs.length === 0 ? (
            <EmptyState message="Chưa có hành động nào được ghi lại trong hệ thống." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-Pine text-Snowflake text-left">
                      <th className="px-4 py-3 font-medium w-8"></th>
                      <th className="px-4 py-3 font-medium">Người thực hiện</th>
                      <th className="px-4 py-3 font-medium">Hành động</th>
                      <th className="px-4 py-3 font-medium">Bảng dữ liệu</th>
                      <th className="px-4 py-3 font-medium">ID mục tiêu</th>
                      <th className="px-4 py-3 font-medium">Thời gian</th>
                      <th className="px-4 py-3 font-medium text-center">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, idx) => {
                      const expanded = expandedRows.has(log.id)
                      const hasChanges = log.old_value !== null || log.new_value !== null
                      return (
                        <Fragment key={log.id}>
                          <tr
                            className={`border-t border-Mist/20 hover:bg-Snowflake/60 transition-colors duration-150 ${
                              idx % 2 === 0 ? '' : 'bg-Snowflake/30'
                            }`}
                          >
                            {/* Expand toggle */}
                            <td className="px-4 py-3">
                              {hasChanges && (
                                <button
                                  onClick={() => toggleRow(log.id)}
                                  className="text-Mist hover:text-Pine transition-colors"
                                  title={expanded ? 'Thu gọn' : 'Xem thay đổi'}
                                >
                                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              )}
                            </td>

                            {/* User */}
                            <td className="px-4 py-3">
                              {log.Users ? (
                                <div>
                                  <p className="font-medium text-Branch">{log.Users.full_name}</p>
                                  <p className="text-xs text-Mist">{log.Users.email}</p>
                                </div>
                              ) : (
                                <span className="text-Mist italic text-xs">Hệ thống</span>
                              )}
                            </td>

                            {/* Action */}
                            <td className="px-4 py-3">
                              <ActionBadge action={log.action_type} />
                            </td>

                            {/* Table */}
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs bg-Frostysilver/40 px-2 py-0.5 rounded text-Branch">
                                {log.target_table}
                              </span>
                            </td>

                            {/* Target ID */}
                            <td className="px-4 py-3 text-xs text-Mist font-mono">
                              #{log.target_id ?? '—'}
                            </td>

                            {/* Time */}
                            <td className="px-4 py-3 text-xs text-Branch whitespace-nowrap">
                              {formatDate(log.created_at)}
                            </td>

                            {/* View detail modal */}
                            <td className="px-4 py-3 text-center">
                              {hasChanges && (
                                <button
                                  onClick={() => setSelectedLog(log)}
                                  title="Xem chi tiết thay đổi"
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-Snowflake hover:bg-Pine hover:text-Snowflake text-Pine border border-Mist/40 transition-all duration-200"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>

                          {/* Inline expanded diff */}
                          {expanded && hasChanges && (
                            <tr className="bg-Snowflake/50 border-t border-Mist/10">
                              <td colSpan={7} className="px-6 py-4">
                                <p className="text-xs font-semibold text-Branch mb-2 uppercase tracking-wide">
                                  So sánh thay đổi nhanh (Old Value vs New Value)
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

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-Mist/20">
                <Pagination {...paginationCompatProps} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLog(null)}
          title={`Chi tiết thay đổi — ${selectedLog.action_type} · ${selectedLog.target_table} #${selectedLog.target_id ?? '?'}`}
          size="xl"
        >
          <div className="space-y-4">
            {/* Meta info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-Snowflake rounded-md px-3 py-2">
                <p className="text-xs text-Mist">Người thực hiện</p>
                <p className="font-medium text-Branch">{selectedLog.Users?.full_name ?? 'Hệ thống'}</p>
              </div>
              <div className="bg-Snowflake rounded-md px-3 py-2">
                <p className="text-xs text-Mist">Email</p>
                <p className="font-medium text-Branch">{selectedLog.Users?.email ?? '—'}</p>
              </div>
              <div className="bg-Snowflake rounded-md px-3 py-2">
                <p className="text-xs text-Mist">Thời gian</p>
                <p className="font-medium text-Branch">{formatDate(selectedLog.created_at)}</p>
              </div>
            </div>

            {/* Diff table */}
            <div>
              <p className="text-sm font-semibold text-Pine mb-2">Bảng so sánh thay đổi dữ liệu</p>
              <DiffTable oldVal={selectedLog.old_value} newVal={selectedLog.new_value} />
            </div>

            {/* Raw JSON fallback */}
            {(selectedLog.old_value || selectedLog.new_value) && (
              <details className="text-xs">
                <summary className="cursor-pointer text-Mist hover:text-Branch transition-colors py-1">
                  Xem JSON nguyên bản
                </summary>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="font-semibold text-red-700 mb-1">Old Value</p>
                    <pre className="bg-red-50 border border-red-100 rounded-md p-3 overflow-auto max-h-60 text-red-800 font-mono text-xs">
                      {JSON.stringify(parseJsonField(selectedLog.old_value), null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="font-semibold text-green-700 mb-1">New Value</p>
                    <pre className="bg-green-50 border border-green-100 rounded-md p-3 overflow-auto max-h-60 text-green-800 font-mono text-xs">
                      {JSON.stringify(parseJsonField(selectedLog.new_value), null, 2)}
                    </pre>
                  </div>
                </div>
              </details>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 text-sm rounded-md bg-Pine text-Snowflake hover:bg-Pine/80 transition-all duration-200 shadow-sm hover:shadow-md"
              >
                Đóng
              </button>
            </div>
          </div>
        </Modal>
      )}
    </MainLayout>
  )
}