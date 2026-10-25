import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Search, Eye, ClipboardList, ChevronDown, ChevronUp,
  RefreshCw, Download, Calendar, Users, Clock, Filter,
  Layers, ShieldAlert, CheckCircle2, FileText, Building2,
  UserCheck, AlertTriangle, Code2
} from 'lucide-react'
import { MainLayout } from '../../components/MainLayout'
import { Modal,Spinner, EmptyState } from '../../components/ui'
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

interface FriendlyChange {
  fieldLabel: string
  beforeText: string
  afterText: string
}

interface HumanReadableLog {
  moduleLabel: string
  moduleBadgeClass: string
  actionTitle: string
  narrativeSentence: string
  isSensitive: boolean
  changes: FriendlyChange[]
}

// ─── Từ điển Dịch Thuật ngữ Kỹ thuật sang Ngôn ngữ Người dùng Đời thường ─────

const MODULE_LABELS: Record<string, string> = {
  Documents:        'Hồ sơ Hợp đồng PDF',
  Violations:       'Thẩm định Vi phạm',
  Suppliers:        'Đối tác Cung ứng',
  Users:            'Tài khoản Nhân sự',
  Categories:       'Danh mục Hệ thống',
  Standards:        'Bộ Tiêu chuẩn RBA/VN',
  Role_Permissions: 'Phân quyền Vai trò',
  System_Configs:   'Cấu hình Hệ thống',
  Risk_Thresholds:  'Ngưỡng Điểm Rủi ro',
}

const ACTION_LABELS: Record<string, string> = {
  UPLOAD:             'Tải hợp đồng PDF lên',
  AI_ANALYZE:         'Quét AI rà soát hợp đồng',
  VIOLATION_APPROVED: 'Phê duyệt lỗi & Trừ điểm',
  VIOLATION_REJECTED: 'Bác bỏ cảnh báo lỗi',
  CREATE:             'Thêm mới thông tin',
  UPDATE:             'Cập nhật thông tin',
  UPDATE_PROFILE:     'Cập nhật hồ sơ cá nhân',
  DELETE:             'Xóa dữ liệu',
  SOFT_DELETE:        'Chuyển vào lưu trữ',
  RESTORE:            'Khôi phục hoạt động',
  GRANT_PERMISSION:   'Cấp quyền truy cập',
  REVOKE_PERMISSION:  'Thu hồi quyền truy cập',
  RESET_PASSWORD:     'Cấp lại mật khẩu',
  CHANGE_PASSWORD:    'Đổi mật khẩu cá nhân',
}

const FIELD_NAME_MAP: Record<string, string> = {
  file_name:        'Tên tập tin hợp đồng',
  company_name:     'Tên công ty đối tác',
  tax_code:         'Mã số thuế',
  risk_score:       'Điểm tín nhiệm',
  oldRiskScore:     'Điểm tín nhiệm trước đó',
  newRiskScore:     'Điểm tín nhiệm mới',
  status:           'Trạng thái xử lý',
  oldStatus:        'Trạng thái ban đầu',
  newStatus:        'Trạng thái sau khi duyệt',
  risk_level:       'Mức độ rủi ro',
  full_name:        'Họ và tên nhân sự',
  email:            'Địa chỉ Email',
  role_name:        'Vai trò',
  is_active:        'Trạng thái tài khoản',
  is_deleted:       'Trạng thái lưu trữ',
  contact_email:    'Email liên hệ',
  contact_phone:    'Số điện thoại',
  address:          'Địa chỉ trụ sở',
  name:             'Tên gọi',
  standard_code:    'Mã tiêu chuẩn',
  config_key:       'Tham số cấu hình',
  config_value:     'Giá trị thiết lập',
  violations_count: 'Số cảnh báo AI phát hiện',
}

const VALUE_TRANSLATION_MAP: Record<string, string> = {
  Pending:   'Chờ thẩm định',
  Approved:  'Đã phê duyệt (Trừ điểm)',
  Rejected:  'Đã bác bỏ (An toàn)',
  Uploaded:  'Mới tải lên (Chờ quét AI)',
  Analyzing: 'Đang phân tích AI',
  Analyzed:  'Đã phân tích AI xong',
  Error:     'Lỗi xử lý',
  High:      'Rủi ro Cao (-10đ)',
  Medium:    'Rủi ro Trung bình (-5đ)',
  Low:       'Rủi ro Thấp (-2đ)',
  true:      'Đang bật / Có',
  false:     'Đang tắt / Không',
}

// Các trường kỹ thuật nội bộ không cần hiển thị làm rối mắt người dùng
const IGNORED_TECHNICAL_KEYS = new Set([
  'id',
  'user_id',
  'supplier_id',
  'category_id',
  'document_id',
  'standard_id',
  'reviewed_by',
  'password_hash',
  'refresh_token',
  'refresh_token_expiry',
  'file_hash',
  'storage_url',
  'created_at',
  'updated_at',
  'uploaded_at',
  'last_analyzed_at',
  'reviewed_at',
])

// ─── Helper: Parse JSON an toàn ───────────────────────────────────────────────

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

function formatFriendlyValue(rawVal: unknown): string {
  if (rawVal === null || rawVal === undefined || rawVal === '') return '—'
  const str = typeof rawVal === 'object' ? JSON.stringify(rawVal) : String(rawVal)
  return VALUE_TRANSLATION_MAP[str] || str
}

// ─── Bộ biên dịch Log Kỹ thuật sang Câu chuyện Tiếng Việt Đời thường ──────────

function buildHumanReadableLog(log: AuditLog): HumanReadableLog {
  const act = (log.action_type || '').toUpperCase()
  const tbl = log.target_table || ''
  const oldObj = parseJsonField(log.old_value) || {}
  const newObj = parseJsonField(log.new_value) || {}

  const moduleLabel = MODULE_LABELS[tbl] || 'Hệ thống chung'
  const actionTitle = ACTION_LABELS[act] || act

  // Xác định thao tác nhạy cảm / quan trọng (Xóa, Trừ điểm, Khóa, Phân quyền)
  const isSensitive = [
    'DELETE',
    'SOFT_DELETE',
    'VIOLATION_APPROVED',
    'REVOKE_PERMISSION',
    'GRANT_PERMISSION',
    'RESET_PASSWORD',
  ].includes(act)

  const moduleBadgeClass =
    tbl === 'Violations'
      ? 'bg-Berry/10 text-Berry border-Berry/20'
      : tbl === 'Documents'
      ? 'bg-Pine/10 text-Pine border-Pine/20'
      : tbl === 'Suppliers'
      ? 'bg-SafeBg text-SafeGreen border-SafeBorder'
      : 'bg-Snowflake text-Branch border-Mist/30'

  // Trích xuất tên đối tượng dễ hiểu từ JSON (nếu có)
  const fileName = String(newObj.file_name || oldObj.file_name || '')
  const companyName = String(newObj.company_name || oldObj.company_name || '')
  const targetPerson = String(newObj.full_name || oldObj.full_name || newObj.email || oldObj.email || '')
  const oldScore = oldObj.risk_score ?? newObj.oldRiskScore
  const newScore = newObj.risk_score ?? newObj.newRiskScore

  let narrativeSentence = ''

  if (act === 'UPLOAD' || (act === 'CREATE' && tbl === 'Documents')) {
    narrativeSentence = fileName
      ? `Đã tải hợp đồng PDF "${fileName}" lên kho lưu trữ để chờ rà soát.`
      : `Đã tải một hồ sơ hợp đồng PDF mới lên hệ thống.`
  } else if (act === 'AI_ANALYZE') {
    const vCount = newObj.violations_count ?? newObj.violationCount
    narrativeSentence = fileName
      ? `Đã chạy AI phân tích hợp đồng "${fileName}"${vCount !== undefined ? ` (phát hiện ${vCount} điểm rủi ro)` : ''}.`
      : `Đã kích hoạt AI rà soát điều khoản hợp đồng PDF${log.target_id ? ` (Mã hồ sơ #${log.target_id})` : ''}.`
  } else if (act === 'VIOLATION_APPROVED') {
    narrativeSentence =
      oldScore !== undefined && newScore !== undefined
        ? `Đã phê duyệt một điều khoản vi phạm và cập nhật điểm tín nhiệm đối tác từ ${oldScore} điểm xuống ${newScore} điểm.`
        : `Đã phê duyệt xác nhận lỗi vi phạm trong hợp đồng và trừ điểm tín nhiệm đối tác.`
  } else if (act === 'VIOLATION_REJECTED') {
    narrativeSentence = `Đã bác bỏ một cảnh báo AI (xác nhận điều khoản hợp lệ, giữ nguyên điểm đối tác).`
  } else if (act === 'DELETE' && tbl === 'Documents') {
    narrativeSentence = fileName
      ? `Đã xóa vĩnh viễn hợp đồng "${fileName}" khỏi hệ thống.`
      : `Đã xóa một hồ sơ hợp đồng PDF khỏi hệ thống.`
  } else if (tbl === 'Suppliers') {
    if (act === 'CREATE') {
      narrativeSentence = `Đã thêm nhà cung ứng mới${companyName ? `: "${companyName}"` : ''} vào hệ thống.`
    } else if (act === 'SOFT_DELETE' || act === 'DELETE') {
      narrativeSentence = `Đã tạm ngưng và đưa đối tác${companyName ? ` "${companyName}"` : ''} vào danh sách lưu trữ.`
    } else if (act === 'RESTORE') {
      narrativeSentence = `Đã khôi phục hoạt động cho đối tác${companyName ? ` "${companyName}"` : ''}.`
    } else {
      narrativeSentence = `Đã cập nhật thông tin hồ sơ của đối tác${companyName ? ` "${companyName}"` : ''}.`
    }
  } else if (tbl === 'Users') {
    if (act === 'CREATE') {
      narrativeSentence = `Đã tạo tài khoản nhân sự mới${targetPerson ? ` cho "${targetPerson}"` : ''}.`
    } else if (act === 'RESET_PASSWORD' || act === 'CHANGE_PASSWORD') {
      narrativeSentence = `Đã cập nhật hoặc cấp lại mật khẩu bảo mật${targetPerson ? ` cho tài khoản "${targetPerson}"` : ''}.`
    } else {
      narrativeSentence = `Đã cập nhật thông tin tài khoản nhân sự${targetPerson ? ` "${targetPerson}"` : ''}.`
    }
  } else if (tbl === 'Role_Permissions') {
    narrativeSentence =
      act === 'GRANT_PERMISSION'
        ? 'Đã cấp thêm quyền hạn chức năng cho vai trò trong hệ thống.'
        : 'Đã thu hồi quyền hạn chức năng của vai trò trong hệ thống.'
  } else {
    narrativeSentence = `Đã thực hiện thao tác "${actionTitle.toLowerCase()}" tại mục ${moduleLabel}.`
  }

  // Xây dựng danh sách thay đổi dễ hiểu (Bỏ qua các khóa kỹ thuật rườm rà)
  const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)])).filter(
    (k) => !IGNORED_TECHNICAL_KEYS.has(k)
  )

  const changes: FriendlyChange[] = []
  allKeys.forEach((k) => {
    const bVal = oldObj[k]
    const aVal = newObj[k]
    if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      changes.push({
        fieldLabel: FIELD_NAME_MAP[k] || k,
        beforeText: formatFriendlyValue(bVal),
        afterText: formatFriendlyValue(aVal),
      })
    }
  })

  return {
    moduleLabel,
    moduleBadgeClass,
    actionTitle,
    narrativeSentence,
    isSensitive,
    changes,
  }
}

// ─── Helpers Thời gian ────────────────────────────────────────────────────────

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
  return `${weekday}, ngày ${d}/${m}/${y}`
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)

  // 2 Chế độ hiển thị:
  // 'timeline': Xem trực quan theo Ngày -> Nhân sự -> Việc đã làm
  // 'daily_json': Bảng Gộp 1 Dòng / 1 Ngày (Đúng ý giảng viên hướng dẫn)
  const [viewMode, setViewMode] = useState<'timeline' | 'daily_json'>('timeline')

  // Bộ lọc thân thiện với người dùng
  const [dateFrom, setDateFrom]             = useState('')
  const [dateTo, setDateTo]                 = useState('')
  const [search, setSearch]                 = useState('')
  const [moduleFilter, setModuleFilter]     = useState('')
  const [onlySensitive, setOnlySensitive]   = useState(false)

  // State chọn Ngày & Nhân sự
  const [selectedDateKey, setSelectedDateKey] = useState<string>('')
  const [selectedUserKey, setSelectedUserKey] = useState<string>('ALL')

  // Mở rộng xem chi tiết thay đổi hoặc xem Modal Gói Nhật ký Ngày
  const [expandedLogIds, setExpandedLogIds] = useState<Set<number>>(new Set())
  const [dailyModalGroup, setDailyModalGroup] = useState<{
    dateKey: string
    logs: AuditLog[]
  } | null>(null)

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params: Record<string, string | number> = { page: 1, limit: 250 }
      if (moduleFilter) params.target_table = moduleFilter

      const res = await adminApi.getAuditLogs(params)
      const payload = (res as { data?: Record<string, unknown> })?.data ?? (res as unknown as Record<string, unknown>)
      const rawItems = (payload?.items ?? payload?.data ?? []) as AuditLog[]

      setLogs(rawItems)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải nhật ký hoạt động'
      toast.error(msg)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [moduleFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(() => fetchLogs(true), 10000)
    return () => clearInterval(timer)
  }, [autoRefresh, fetchLogs])

  // 1. Lọc danh sách theo điều kiện người dùng chọn
  const filteredLogs = useMemo(() => {
    return logs.filter((item) => {
      const dateKey = toLocalDateKey(item.created_at)
      if (dateFrom && dateKey < dateFrom) return false
      if (dateTo && dateKey > dateTo) return false

      const info = buildHumanReadableLog(item)
      if (onlySensitive && !info.isSensitive) return false

      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const name = item.Users?.full_name?.toLowerCase() ?? 'hệ thống'
        const email = item.Users?.email?.toLowerCase() ?? ''
        const narrative = info.narrativeSentence.toLowerCase()
        const title = info.actionTitle.toLowerCase()
        if (!name.includes(q) && !email.includes(q) && !narrative.includes(q) && !title.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [logs, dateFrom, dateTo, onlySensitive, search])

  // 2. Gom nhóm theo NGÀY (Mỗi ngày là 1 bản ghi tổng hợp gồm: Những ai làm gì trong ngày đó)
  const dateGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        dateKey: string
        logs: AuditLog[]
        sensitiveCount: number
        usersSummary: Map<
          string,
          {
            userKey: string
            fullName: string
            email: string
            actionCounts: Record<string, number>
            logs: AuditLog[]
          }
        >
      }
    >()

    filteredLogs.forEach((log) => {
      const dk = toLocalDateKey(log.created_at)
      if (!map.has(dk)) {
        map.set(dk, {
          dateKey: dk,
          logs: [],
          sensitiveCount: 0,
          usersSummary: new Map(),
        })
      }
      const grp = map.get(dk)!
      grp.logs.push(log)

      const readable = buildHumanReadableLog(log)
      if (readable.isSensitive) grp.sensitiveCount++

      const uKey = log.Users?.email || 'SYSTEM'
      if (!grp.usersSummary.has(uKey)) {
        grp.usersSummary.set(uKey, {
          userKey: uKey,
          fullName: log.Users?.full_name || 'Hệ thống tự động',
          email: log.Users?.email || 'Tác vụ nền',
          actionCounts: {},
          logs: [],
        })
      }
      const uEntry = grp.usersSummary.get(uKey)!
      uEntry.logs.push(log)
      uEntry.actionCounts[readable.actionTitle] = (uEntry.actionCounts[readable.actionTitle] || 0) + 1
    })

    return Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey))
  }, [filteredLogs])

  useEffect(() => {
    if (dateGroups.length > 0 && (!selectedDateKey || !dateGroups.some((d) => d.dateKey === selectedDateKey))) {
      setSelectedDateKey(dateGroups[0].dateKey)
      setSelectedUserKey('ALL')
    }
  }, [dateGroups, selectedDateKey])

  const activeDateGroup = useMemo(
    () => dateGroups.find((d) => d.dateKey === selectedDateKey) || null,
    [dateGroups, selectedDateKey]
  )

  const usersInSelectedDate = useMemo(() => {
    if (!activeDateGroup) return []
    return Array.from(activeDateGroup.usersSummary.values()).sort((a, b) => b.logs.length - a.logs.length)
  }, [activeDateGroup])

  const logsInSelectedDateAndUser = useMemo(() => {
    if (!activeDateGroup) return []
    if (selectedUserKey === 'ALL') return activeDateGroup.logs
    return activeDateGroup.logs.filter((l) => (l.Users?.email || 'SYSTEM') === selectedUserKey)
  }, [activeDateGroup, selectedUserKey])

  const toggleExpandLog = (id: number) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const formatTimeOnly = (d: string) =>
    new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // Xuất Báo cáo Nhật ký theo Ngày (1 Dòng / 1 Ngày đúng ý thầy)
  const handleExportDailySummaryExcel = () => {
    const rowsHtml = dateGroups
      .map((grp, idx) => {
        const usersList = Array.from(grp.usersSummary.values())
        const whoText = usersList.map((u) => u.fullName).join(', ')
        const whatText = usersList
          .map((u) => {
            const detail = Object.entries(u.actionCounts)
              .map(([actName, cnt]) => `${cnt} lần ${actName.toLowerCase()}`)
              .join(', ')
            return `• ${u.fullName}: ${detail}`
          })
          .join('<br/>')

        return `
          <tr>
            <td style="text-align:center;font-weight:bold">${idx + 1}</td>
            <td style="text-align:center;font-weight:bold;color:#014BAA">${grp.dateKey}</td>
            <td style="font-weight:bold">${whoText} (${usersList.length} người)</td>
            <td>${whatText}</td>
            <td style="text-align:center;font-weight:bold">${grp.logs.length} hoạt động</td>
          </tr>`
      })
      .join('')

    const excelHtml = `\uFEFF<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/><style>table{border-collapse:collapse}th{background:#014BAA;color:#fff;padding:8px;border:1px solid #0A1020}td{padding:8px;border:1px solid #CBD5E1;vertical-align:top}</style></head><body><table><thead><tr><th>STT</th><th>Ngày ghi nhận</th><th>Những nhân sự tham gia</th><th>Tóm tắt công việc đã làm trong ngày</th><th>Tổng số thao tác</th></tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`

    const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Nhat-ky-hoat-dong-theo-ngay-${new Date().toISOString().slice(0, 10)}.xls`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Đã xuất Bảng tổng hợp nhật ký theo ngày (.xls)!')
  }

  const totalSensitiveCount = useMemo(
    () => filteredLogs.filter((l) => buildHumanReadableLog(l).isSensitive).length,
    [filteredLogs]
  )

  return (
    <MainLayout breadcrumb="Nhật ký Hoạt động">
      <div className="space-y-4">
        {/* ─── 1. HEADER THÂN THIỆN VỚI NGƯỜI DÙNG ──────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-Pine tracking-tight flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-Pine" />
              Nhật ký Hoạt động & Tra cứu Sự cố
            </h1>
            <p className="text-xs sm:text-sm text-Branch/75 mt-0.5">
              Theo dõi trực quan mỗi ngày có những ai làm việc, đã thực hiện những gì và kiểm tra nhanh khi xảy ra sự cố
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Chuyển đổi giữa: Xem trực quan theo Ngày & Bảng Gộp 1 Dòng / Ngày */}
            <div className="flex items-center bg-white p-1 rounded-2xl border border-Mist/30 shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode('timeline')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-1.5 ${
                  viewMode === 'timeline' ? 'bg-Pine text-white' : 'text-Branch hover:text-Pine'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Xem theo Ngày & Nhân sự
              </button>
              <button
                type="button"
                onClick={() => setViewMode('daily_json')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-1.5 ${
                  viewMode === 'daily_json' ? 'bg-Pine text-white' : 'text-Branch hover:text-Pine'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Bảng Gộp Theo Ngày (1 dòng/ngày)
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-extrabold border transition-colors ${
                autoRefresh
                  ? 'bg-Pine text-white border-Pine shadow-sm'
                  : 'bg-white text-Pine border-Mist/40 hover:bg-Snowflake'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Tự động cập nhật: BẬT' : 'Làm mới'}
            </button>

            <button
              type="button"
              onClick={handleExportDailySummaryExcel}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-Pine text-white text-xs font-extrabold rounded-2xl hover:bg-Branch shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-Sunny" />
              Xuất Báo cáo Ngày
            </button>
          </div>
        </div>

        {/* ─── 2. 3 THẺ TÓM TẮT TRỰC QUAN (MÀU CHỦ ĐẠO PINE #014BAA) ─────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-Pine text-white rounded-3xl p-4 shadow-md flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-white/15 text-Sunny flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-Snowflake/85">Ngày đang kiểm tra</p>
                <p className="text-base sm:text-lg font-black text-white">
                  {activeDateGroup ? formatVietnameseDateHeader(activeDateGroup.dateKey) : 'Chưa có dữ liệu'}
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-xl bg-Sunny text-Branch text-xs font-extrabold">
              {activeDateGroup?.logs.length ?? 0} việc
            </span>
          </div>

          <div className="bg-white rounded-3xl border border-Mist/25 p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-Pine/10 text-Pine flex items-center justify-center flex-shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-Mist">Nhân sự làm việc trong ngày</p>
                <p className="text-xl font-black text-Pine">
                  {usersInSelectedDate.length} <span className="text-xs font-bold text-Branch">người tham gia</span>
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-xl bg-Snowflake text-Pine text-xs font-extrabold">
              {dateGroups.length} ngày lưu trữ
            </span>
          </div>

          <button
            type="button"
            onClick={() => setOnlySensitive(!onlySensitive)}
            className={`text-left rounded-3xl border p-4 transition-colors flex items-center justify-between ${
              onlySensitive
                ? 'bg-Berry text-white border-Berry shadow-md'
                : 'bg-white text-Branch border-Mist/25 hover:border-Berry/40 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                onlySensitive ? 'bg-white/20 text-white' : 'bg-DangerBg text-Berry'
              }`}>
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-xs font-bold ${onlySensitive ? 'text-white/85' : 'text-Mist'}`}>
                  Tra cứu Sự cố (Xóa / Trừ điểm)
                </p>
                <p className={`text-xl font-black ${onlySensitive ? 'text-white' : 'text-Berry'}`}>
                  {totalSensitiveCount} <span className="text-xs font-bold">thao tác quan trọng</span>
                </p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold ${
              onlySensitive ? 'bg-Sunny text-Branch' : 'bg-DangerBg text-Berry'
            }`}>
              {onlySensitive ? 'Đang lọc' : 'Bấm để lọc'}
            </span>
          </button>
        </div>

        {/* ─── 3. THANH BỘ LỌC ĐỜI THƯỜNG (KHÔNG CÒN TÊN BẢNG SQL) ───────────── */}
        <div className="bg-white rounded-3xl border border-Mist/25 shadow-sm p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-extrabold uppercase text-Pine mb-1">Từ ngày</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold border border-Mist/40 rounded-xl bg-Snowflake/20 text-Branch focus:outline-none focus:border-Pine"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase text-Pine mb-1">Đến ngày</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold border border-Mist/40 rounded-xl bg-Snowflake/20 text-Branch focus:outline-none focus:border-Pine"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase text-Pine mb-1">Mục công việc</label>
              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold border border-Mist/40 rounded-xl bg-white text-Branch focus:outline-none focus:border-Pine"
              >
                <option value="">Tất cả mục công việc</option>
                <option value="Documents">Hồ sơ Hợp đồng PDF</option>
                <option value="Violations">Thẩm định & Phê duyệt Vi phạm</option>
                <option value="Suppliers">Đối tác Cung ứng</option>
                <option value="Users">Tài khoản Nhân sự</option>
                <option value="Role_Permissions">Phân quyền Vai trò</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase text-Pine mb-1">Tìm theo tên hoặc việc làm</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-Mist" />
                <input
                  type="text"
                  placeholder="Nhập tên nhân sự, tên hợp đồng..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs border border-Mist/40 rounded-xl bg-Snowflake/20 text-Branch focus:outline-none focus:border-Pine"
                />
              </div>
            </div>
          </div>

          {(dateFrom || dateTo || moduleFilter || onlySensitive || search) && (
            <div className="mt-3 pt-2.5 border-t border-Mist/15 flex items-center justify-between text-xs">
              <span className="text-Branch font-semibold flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-Pine" />
                Kết quả lọc: <strong className="text-Pine">{filteredLogs.length} hoạt động</strong> trong{' '}
                <strong className="text-Pine">{dateGroups.length} ngày</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  setDateFrom('')
                  setDateTo('')
                  setModuleFilter('')
                  setOnlySensitive(false)
                  setSearch('')
                }}
                className="text-Berry font-extrabold hover:underline"
              >
                Đặt lại mặc định
              </button>
            </div>
          )}
        </div>

        {/* ═════════════════════════════════════════════════════════════════════
            NỘI DUNG CHÍNH: CHẾ ĐỘ 1 (TIMELINE) HOẶC CHẾ ĐỘ 2 (1 DÒNG / NGÀY)
        ═════════════════════════════════════════════════════════════════════ */}
        {loading ? (
          <div className="flex items-center justify-center py-20 bg-white rounded-3xl">
            <Spinner size="lg" />
          </div>
        ) : dateGroups.length === 0 ? (
          <div className="bg-white rounded-3xl p-8">
            <EmptyState message="Không tìm thấy hoạt động nào trong khoảng thời gian đã chọn." />
          </div>
        ) : viewMode === 'timeline' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* ── CỘT TRÁI (4/12): DANH SÁCH NGÀY THÁNG NĂM ── */}
            <div className="lg:col-span-4 bg-white rounded-3xl border border-Mist/25 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-Pine flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-Pine" />
                  1. Chọn Ngày Cần Xem ({dateGroups.length})
                </h2>
                <span className="text-[11px] font-semibold text-Mist">Mới nhất trước</span>
              </div>

              <div className="space-y-2.5 max-h-[65vh] overflow-y-auto pr-1">
                {dateGroups.map((grp) => {
                  const isSelected = grp.dateKey === selectedDateKey
                  const userNames = Array.from(grp.usersSummary.values())
                    .map((u) => u.fullName)
                    .join(', ')

                  return (
                    <button
                      key={grp.dateKey}
                      type="button"
                      onClick={() => {
                        setSelectedDateKey(grp.dateKey)
                        setSelectedUserKey('ALL')
                      }}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-colors ${
                        isSelected
                          ? 'bg-Pine text-white border-Pine shadow-md'
                          : 'bg-Snowflake/30 hover:bg-Snowflake/70 text-Branch border-Mist/25'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs sm:text-sm font-extrabold">
                          {formatVietnameseDateHeader(grp.dateKey)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold flex-shrink-0 ${
                            isSelected ? 'bg-Sunny text-Branch' : 'bg-white text-Pine border border-Mist/30'
                          }`}
                        >
                          {grp.logs.length} việc
                        </span>
                      </div>

                      <p className={`text-[11px] truncate ${isSelected ? 'text-Snowflake/90' : 'text-Mist font-semibold'}`}>
                        Nhân sự: {userNames}
                      </p>

                      {grp.sensitiveCount > 0 && (
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-extrabold">
                          <span
                            className={`px-2 py-0.5 rounded ${
                              isSelected ? 'bg-Berry text-white' : 'bg-DangerBg text-Berry border border-DangerBorder'
                            }`}
                          >
                            Có {grp.sensitiveCount} thao tác xóa / trừ điểm
                          </span>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── CỘT PHẢI (8/12): HÔM ĐÓ CÓ NHỮNG AI & HỌ ĐÃ LÀM GÌ ── */}
            <div className="lg:col-span-8 space-y-4">
              {/* KHỐI A: Tóm tắt những ai đã làm việc trong ngày đang chọn */}
              <div className="bg-white rounded-3xl border border-Mist/25 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-Pine flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-Pine" />
                      2. Trong {formatVietnameseDateHeader(selectedDateKey)} có những ai làm việc?
                    </h2>
                    <p className="text-xs text-Mist font-semibold mt-0.5">
                      Bấm vào tên một người để chỉ xem các công việc người đó đã thực hiện
                    </p>
                  </div>

                  {selectedUserKey !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setSelectedUserKey('ALL')}
                      className="text-xs font-extrabold text-Pine hover:underline"
                    >
                      Xem lại tất cả mọi người ({activeDateGroup?.logs.length ?? 0} việc)
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {usersInSelectedDate.map((u) => {
                    const isSelectedUser = selectedUserKey === u.userKey
                    const summaryText = Object.entries(u.actionCounts)
                      .map(([actTitle, count]) => `${count} lần ${actTitle.toLowerCase()}`)
                      .join(' · ')

                    return (
                      <button
                        key={u.userKey}
                        type="button"
                        onClick={() => setSelectedUserKey(isSelectedUser ? 'ALL' : u.userKey)}
                        className={`p-3.5 rounded-2xl border text-left transition-colors ${
                          isSelectedUser
                            ? 'bg-Pine text-white border-Pine shadow-md'
                            : 'bg-Snowflake/30 hover:bg-Snowflake/70 text-Branch border-Mist/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 ${
                                isSelectedUser ? 'bg-Sunny text-Branch' : 'bg-Pine text-white'
                              }`}
                            >
                              {u.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-extrabold truncate">{u.fullName}</p>
                              <p className={`text-[11px] truncate ${isSelectedUser ? 'text-Snowflake/80' : 'text-Mist'}`}>
                                {u.email}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold flex-shrink-0 ${
                              isSelectedUser ? 'bg-white text-Pine' : 'bg-white text-Pine border border-Mist/30'
                            }`}
                          >
                            {u.logs.length} việc
                          </span>
                        </div>

                        <p className={`text-xs leading-relaxed mt-1 ${
                          isSelectedUser ? 'text-Sunny font-semibold' : 'text-Branch/85 font-medium'
                        }`}>
                          Đã làm: {summaryText}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* KHỐI B: Dòng thời gian chi tiết bằng câu tiếng Việt tự nhiên */}
              <div className="bg-white rounded-3xl border border-Mist/25 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-Mist/20">
                  <div>
                    <h2 className="text-sm font-extrabold text-Pine flex items-center gap-2">
                      <Clock className="w-4 h-4 text-Pine" />
                      3. Chi tiết từng công việc đã thực hiện ({logsInSelectedDateAndUser.length} hoạt động)
                    </h2>
                    <p className="text-xs text-Mist font-semibold mt-0.5">
                      Sắp xếp theo thứ tự thời gian trong ngày để dễ dàng đối chiếu khi cần kiểm tra sự cố
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {logsInSelectedDateAndUser.map((log) => {
                    const info = buildHumanReadableLog(log)
                    const isExpanded = expandedLogIds.has(log.id)
                    const hasFriendlyChanges = info.changes.length > 0

                    return (
                      <div
                        key={log.id}
                        className={`rounded-2xl border transition-colors overflow-hidden ${
                          info.isSensitive
                            ? 'border-l-4 border-l-Berry border-DangerBorder bg-DangerBg/20'
                            : 'border-Mist/25 bg-Snowflake/20 hover:bg-Snowflake/40'
                        }`}
                      >
                        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            {/* Mốc giờ rõ ràng */}
                            <div className={`px-2.5 py-1.5 rounded-xl font-mono text-xs font-extrabold flex-shrink-0 ${
                              info.isSensitive ? 'bg-Berry text-white' : 'bg-Pine text-white'
                            }`}>
                              {formatTimeOnly(log.created_at)}
                            </div>

                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs sm:text-sm font-black text-Pine">
                                  {log.Users?.full_name || 'Hệ thống tự động'}
                                </span>
                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${info.moduleBadgeClass}`}>
                                  {info.moduleLabel}
                                </span>
                                {info.isSensitive && (
                                  <span className="px-2 py-0.5 rounded-lg bg-Berry text-white text-[10px] font-extrabold">
                                    Thao tác quan trọng
                                  </span>
                                )}
                              </div>

                              {/* Câu văn tiếng Việt tự nhiên mô tả đúng việc đã làm */}
                              <p className="text-xs sm:text-[13px] font-semibold text-Branch leading-relaxed">
                                {info.narrativeSentence}
                              </p>
                            </div>
                          </div>

                          {hasFriendlyChanges && (
                            <button
                              type="button"
                              onClick={() => toggleExpandLog(log.id)}
                              className="px-3 py-1.5 rounded-xl bg-white border border-Mist/35 text-xs font-extrabold text-Pine hover:bg-Pine hover:text-white transition-colors flex items-center gap-1 self-end sm:self-center flex-shrink-0 shadow-sm"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              {isExpanded ? 'Thu gọn' : 'Xem chi tiết thay đổi'}
                            </button>
                          )}
                        </div>

                        {/* Hộp so sánh Trước và Sau bằng Tiếng Việt 100% */}
                        {isExpanded && hasFriendlyChanges && (
                          <div className="px-4 pb-4 pt-2 border-t border-Mist/20 bg-white">
                            <p className="text-[11px] font-extrabold uppercase text-Pine mb-2">
                              Nội dung thay đổi cụ thể:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {info.changes.map((ch, idx) => (
                                <div key={idx} className="p-2.5 rounded-xl bg-Snowflake/35 border border-Mist/25 text-xs">
                                  <span className="font-extrabold text-Branch block mb-1">{ch.fieldLabel}:</span>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {ch.beforeText !== '—' && (
                                      <>
                                        <span className="px-2 py-0.5 rounded bg-DangerBg text-Berry line-through font-semibold">
                                          {ch.beforeText}
                                        </span>
                                        <span className="text-Mist font-bold">→</span>
                                      </>
                                    )}
                                    <span className="px-2 py-0.5 rounded bg-SafeBg text-SafeGreen font-extrabold">
                                      {ch.afterText}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
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
             CHẾ ĐỘ 2: BẢNG GỘP THEO NGÀY (MỖI NGÀY 1 HÀNG DUY NHẤT ĐÚNG Ý THẦY)
          ═══════════════════════════════════════════════════════════════════ */
          <div className="bg-white rounded-3xl border border-Mist/25 shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-Mist/20">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-Pine">
                  Bảng Nhật ký Gộp Theo Ngày (Mỗi ngày 1 dòng tổng hợp)
                </h2>
                <p className="text-xs text-Mist font-semibold mt-0.5">
                  Toàn bộ nhân sự và công việc thực hiện trong cùng một ngày được gom gọn trên một hàng duy nhất
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-Mist/25">
              <table className="w-full text-xs divide-y divide-Mist/20">
                <thead>
                  <tr className="bg-Pine text-white text-left">
                    <th className="px-4 py-3 font-extrabold uppercase w-44">Ngày ghi nhận</th>
                    <th className="px-4 py-3 font-extrabold uppercase w-56">Những ai tham gia</th>
                    <th className="px-4 py-3 font-extrabold uppercase">Tổng hợp các việc đã làm trong ngày (Gộp 1 hàng)</th>
                    <th className="px-4 py-3 font-extrabold uppercase text-center w-36">Chi tiết / JSON</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-Mist/15 bg-white">
                  {dateGroups.map((grp) => {
                    const usersList = Array.from(grp.usersSummary.values())
                    return (
                      <tr key={grp.dateKey} className="hover:bg-Snowflake/30 transition-colors">
                        <td className="px-4 py-3.5 align-top">
                          <span className="font-extrabold text-Pine block text-xs sm:text-sm">
                            {formatVietnameseDateHeader(grp.dateKey)}
                          </span>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-Snowflake text-Branch font-bold text-[11px]">
                            Tổng: {grp.logs.length} hoạt động
                          </span>
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {usersList.map((u) => (
                              <span
                                key={u.userKey}
                                className="px-2.5 py-1 rounded-xl bg-Pine/10 text-Pine font-extrabold text-[11px]"
                              >
                                {u.fullName} ({u.logs.length})
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 align-top space-y-1.5">
                          {usersList.map((u) => {
                            const summaryLine = Object.entries(u.actionCounts)
                              .map(([actTitle, cnt]) => `${cnt} lần ${actTitle.toLowerCase()}`)
                              .join(', ')
                            return (
                              <div key={u.userKey} className="text-xs text-Branch leading-relaxed">
                                <strong className="text-Pine">• {u.fullName}:</strong> {summaryLine}.
                              </div>
                            )
                          })}
                        </td>

                        <td className="px-4 py-3.5 align-top text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDateKey(grp.dateKey)
                                setSelectedUserKey('ALL')
                                setViewMode('timeline')
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-Pine text-white hover:bg-Branch font-extrabold text-[11px] transition-colors"
                            >
                              Mở dòng thời gian
                            </button>
                            <button
                              type="button"
                              onClick={() => setDailyModalGroup({ dateKey: grp.dateKey, logs: grp.logs })}
                              className="p-1.5 rounded-xl bg-Snowflake text-Pine hover:bg-Pine hover:text-white transition-colors"
                              title="Xem gói dữ liệu JSON gộp theo ngày"
                            >
                              <Code2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal Xem Gói JSON Gộp Theo Ngày (Để minh họa cho Giảng viên khi bảo vệ) */}
      {dailyModalGroup && (
        <Modal
          isOpen={true}
          onClose={() => setDailyModalGroup(null)}
          title={`Bản ghi Tổng hợp Ngày ${dailyModalGroup.dateKey}`}
          size="xl"
        >
          <div className="space-y-4">
            <p className="text-xs text-Branch leading-relaxed">
              Dữ liệu hoạt động của cả ngày <strong>{dailyModalGroup.dateKey}</strong> được tổng hợp thành một đối tượng JSON duy nhất theo cấu trúc phân cấp:
            </p>
            <pre className="bg-Branch text-Snowflake p-4 rounded-2xl text-xs font-mono overflow-x-auto max-h-96">
              {JSON.stringify(
                {
                  date: dailyModalGroup.dateKey,
                  total_activities: dailyModalGroup.logs.length,
                  actors: Array.from(
                    dailyModalGroup.logs.reduce((acc, l) => {
                      const actor = l.Users?.full_name || 'Hệ thống'
                      const info = buildHumanReadableLog(l)
                      if (!acc.has(actor)) acc.set(actor, [])
                      acc.get(actor)!.push({
                        time: formatTimeOnly(l.created_at),
                        action: info.actionTitle,
                        detail: info.narrativeSentence,
                      })
                      return acc
                    }, new Map<string, unknown[]>())
                  ).map(([actorName, activities]) => ({
                    actor: actorName,
                    activities_count: activities.length,
                    activities,
                  })),
                },
                null,
                2
              )}
            </pre>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setDailyModalGroup(null)}
                className="px-5 py-2 rounded-xl bg-Pine text-white text-xs font-extrabold"
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