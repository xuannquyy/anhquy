import React from 'react'
import { AlertTriangle, CheckCircle2, Info, X, ChevronLeft, ChevronRight, Inbox } from 'lucide-react'

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Xác nhận thực hiện',
  cancelLabel = 'Hủy bỏ',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null

  const variantConfig = {
    danger: {
      btn: 'bg-Berry text-white hover:bg-Berry/90 shadow-sm',
      iconBg: 'bg-Berry/10 text-Berry border-Berry/20',
      icon: <AlertTriangle className="w-6 h-6" />,
    },
    warning: {
      btn: 'bg-amber-600 text-white hover:bg-amber-700 shadow-sm',
      iconBg: 'bg-amber-50 text-amber-600 border-amber-200',
      icon: <AlertTriangle className="w-6 h-6" />,
    },
    info: {
      btn: 'bg-Pine text-white hover:bg-Pine/90 shadow-sm',
      iconBg: 'bg-Pine/10 text-Pine border-Pine/20',
      icon: <CheckCircle2 className="w-6 h-6" />,
    },
  }[variant]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-Pine/60 backdrop-blur-sm transition-opacity"
        onClick={onCancel}
      />
      <div className="relative z-10 bg-white rounded-lg shadow-lg border border-Mist/30 w-full max-w-md overflow-hidden transition-all duration-300">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-lg border flex items-center justify-center flex-shrink-0 ${variantConfig.iconBg}`}>
              {variantConfig.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-Pine mb-1.5">{title}</h3>
              <p className="text-Branch text-sm leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-3.5 bg-Snowflake/50 border-t border-Mist/20 flex gap-2.5 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-Branch bg-white border border-Mist/40 rounded-md hover:bg-Snowflake transition-all duration-200"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-all duration-200 ${variantConfig.btn}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

interface ModalProps {
  isOpen: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ isOpen, title, onClose, children, size = 'md' }: ModalProps) {
  if (!isOpen) return null

  const sizeMap = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-Pine/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 bg-white rounded-lg shadow-lg border border-Mist/30 w-full ${sizeMap[size]} max-h-[90vh] flex flex-col overflow-hidden`}>
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-Pine to-Pine/95 text-white">
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 text-Frostysilver" />
            <h3 className="text-base font-bold tracking-tight">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10 transition-colors p-1.5 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-6 flex-1">{children}</div>
      </div>
    </div>
  )
}

// ─── Pagination (Luôn hiển thị rõ ràng kể cả khi chỉ có 1 trang) ──────────────

interface PaginationProps {
  page: number
  total: number
  limit: number
  onPageChange: (page: number) => void
  onLimitChange?: (limit: number) => void
}

export function Pagination({ page, total, limit, onPageChange, onLimitChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 4) pages.push('...')
    for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) {
      pages.push(i)
    }
    if (page < totalPages - 3) pages.push('...')
    pages.push(totalPages)
  }

  const startRecord = total === 0 ? 0 : Math.min((page - 1) * limit + 1, total)
  const endRecord = total === 0 ? 0 : Math.min(page * limit, total)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3 text-xs">
      <div className="flex items-center gap-3 text-Mist">
        <span>
          Hiển thị <strong className="text-Pine">{startRecord}–{endRecord}</strong> trong tổng số{' '}
          <strong className="text-Pine">{total}</strong> bản ghi
        </span>
        {onLimitChange && (
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="px-2 py-1 bg-Snowflake/70 border border-Mist/30 rounded-md text-xs text-Pine font-medium focus:outline-none focus:border-Pine"
          >
            {[5, 10, 15, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size} dòng / trang
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-Mist mr-2 hidden md:inline">
          Trang <strong className="text-Pine">{page}</strong> / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-Mist/40 bg-white text-Branch disabled:opacity-40 disabled:cursor-not-allowed hover:bg-Snowflake transition-all duration-200"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Trước
        </button>
        {pages.map((p, idx) =>
          p === '...' ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-Mist">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p as number)}
              className={`min-w-[30px] py-1.5 px-2.5 text-xs font-bold rounded-md border transition-all duration-200 ${
                p === page
                  ? 'bg-Pine text-white border-Pine shadow-sm'
                  : 'bg-white border-Mist/40 text-Branch hover:bg-Snowflake'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-Mist/40 bg-white text-Branch disabled:opacity-40 disabled:cursor-not-allowed hover:bg-Snowflake transition-all duration-200"
        >
          Sau
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const map: Record<string, string> = {
    Uploaded:  'bg-sky-50 text-sky-700 border border-sky-200',
    Analyzing: 'bg-amber-50 text-amber-700 border border-amber-200',
    Analyzed:  'bg-emerald-50 text-emerald-700 border border-emerald-200',
    Error:     'bg-Berry/10 text-Berry border border-Berry/20',
    Pending:   'bg-amber-50 text-amber-700 border border-amber-200',
    Approved:  'bg-emerald-50 text-emerald-700 border border-emerald-200',
    Rejected:  'bg-Snowflake text-Branch border border-Mist/30',
    High:      'bg-Berry text-white shadow-sm',
    Medium:    'bg-amber-500 text-white shadow-sm',
    Low:       'bg-Pine/10 text-Pine border border-Pine/20',
    Safe:      'bg-emerald-50 text-emerald-700 border border-emerald-200',
    Warning:   'bg-amber-50 text-amber-700 border border-amber-200',
    Danger:    'bg-Berry/10 text-Berry border border-Berry/25',
  }
  const labelMap: Record<string, string> = {
    Uploaded:  'Đã tải lên',
    Analyzing: 'Đang phân tích',
    Analyzed:  'Đã phân tích',
    Error:     'Lỗi xử lý',
    Pending:   'Chờ thẩm định',
    Approved:  'Đã phê duyệt',
    Rejected:  'Đã bác bỏ',
    High:      'Rủi ro Cao',
    Medium:    'Trung bình',
    Low:       'Rủi ro Thấp',
    Safe:      'An toàn',
    Warning:   'Cảnh báo',
    Danger:    'Nguy hiểm',
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${map[status] || 'bg-Snowflake text-Branch border border-Mist/30'}`}>
      {labelMap[status] || status}
    </span>
  )
}

// ─── RiskScoreBar (Đồng bộ chuẩn ngưỡng 80 - 50 với Database) ────────────────

interface RiskScoreBarProps {
  score: number | null
}

export function RiskScoreBar({ score }: RiskScoreBarProps) {
  const s = score ?? 100
  const color = s >= 80 ? 'bg-emerald-500' : s >= 50 ? 'bg-amber-500' : 'bg-Berry'
  const textColor = s >= 80 ? 'text-emerald-700' : s >= 50 ? 'text-amber-700' : 'text-Berry'

  return (
    <div className="flex items-center gap-2.5 min-w-[140px]">
      <div className="flex-1 bg-Snowflake rounded-md h-2.5 overflow-hidden border border-Mist/25 p-0.5">
        <div
          className={`h-full rounded-sm transition-all duration-500 ${color}`}
          style={{ width: `${Math.max(4, Math.min(100, s))}%` }}
        />
      </div>
      <span className={`text-xs font-extrabold w-11 text-right ${textColor}`}>{s}/100</span>
    </div>
  )
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-11 h-11' }[size]
  return (
    <div className={`${sizeClass} border-2 border-Mist/40 border-t-Pine rounded-md animate-spin`} />
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({ message = 'Không có dữ liệu hiển thị' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
      <div className="w-14 h-14 rounded-lg bg-Snowflake/80 border border-Mist/20 flex items-center justify-center text-Mist mb-3">
        <Inbox className="w-7 h-7" />
      </div>
      <p className="text-sm font-medium text-Branch">{message}</p>
    </div>
  )
}