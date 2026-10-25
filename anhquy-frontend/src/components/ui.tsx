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
      btn: 'bg-gradient-to-r from-Berry to-[#8B2B39] text-white hover:opacity-95 shadow-[0_6px_20px_rgba(107,33,44,0.3)]',
      iconBg: 'bg-Berry/10 text-Berry border-Berry/20 shadow-inner',
      icon: <AlertTriangle className="w-6 h-6" />,
    },
    warning: {
      btn: 'bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:opacity-95 shadow-[0_6px_20px_rgba(245,158,11,0.3)]',
      iconBg: 'bg-amber-50 text-amber-600 border-amber-200 shadow-inner',
      icon: <AlertTriangle className="w-6 h-6" />,
    },
    info: {
      btn: 'bg-gradient-to-r from-Pine to-[#364954] text-white hover:opacity-95 shadow-[0_6px_20px_rgba(39,54,63,0.25)]',
      iconBg: 'bg-Pine/10 text-Pine border-Pine/20 shadow-inner',
      icon: <CheckCircle2 className="w-6 h-6" />,
    },
  }[variant]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-Branch/50 backdrop-blur-sm transition-opacity"
        onClick={onCancel}
      />
      <div className="relative z-10 bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_24px_60px_rgba(39,54,63,0.22)] border border-white w-full max-w-md overflow-hidden transition-all duration-300">
        <div className="h-1.5 w-full bg-gradient-to-r from-Pine via-Mist to-Berry" />
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center flex-shrink-0 ${variantConfig.iconBg}`}>
              {variantConfig.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-extrabold text-Pine mb-1.5 tracking-tight">{title}</h3>
              <p className="text-Branch text-sm leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-Snowflake/40 border-t border-Mist/15 flex gap-2.5 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold text-Branch bg-white border border-Mist/30 rounded-xl hover:bg-Snowflake transition-all duration-200 shadow-sm"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2 text-xs font-bold rounded-xl transition-all duration-200 ${variantConfig.btn}`}
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
      <div className="absolute inset-0 bg-Branch/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 bg-white rounded-2xl shadow-[0_25px_70px_rgba(39,54,63,0.25)] border border-white/80 w-full ${sizeMap[size]} max-h-[90vh] flex flex-col overflow-hidden`}>
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-Pine via-[#2F414C] to-Pine text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
              <Info className="w-4 h-4 text-Frostysilver" />
            </div>
            <h3 className="text-base font-extrabold tracking-tight">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/15 transition-colors p-1.5 rounded-xl"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-6 flex-1">{children}</div>
      </div>
    </div>
  )
}

// ─── Pagination (Soft Pill Bento Style) ───────────────────────────────────────

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
        <span className="bg-Snowflake/50 px-3 py-1.5 rounded-xl border border-Mist/20">
          Hiển thị <strong className="text-Pine">{startRecord}–{endRecord}</strong> /{' '}
          <strong className="text-Pine">{total}</strong> bản ghi
        </span>
        {onLimitChange && (
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="px-3 py-1.5 bg-white border border-Mist/30 rounded-xl text-xs text-Pine font-bold focus:outline-none focus:border-Pine shadow-sm"
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
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border border-Mist/30 bg-white text-Branch disabled:opacity-40 disabled:cursor-not-allowed hover:bg-Snowflake transition-all duration-200 shadow-sm"
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
              className={`min-w-[32px] py-1.5 px-2.5 text-xs font-extrabold rounded-xl border transition-all duration-200 ${
                p === page
                  ? 'bg-Pine text-white border-Pine shadow-[0_4px_12px_rgba(39,54,63,0.25)] scale-105'
                  : 'bg-white border-Mist/30 text-Branch hover:bg-Snowflake'
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
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border border-Mist/30 bg-white text-Branch disabled:opacity-40 disabled:cursor-not-allowed hover:bg-Snowflake transition-all duration-200 shadow-sm"
        >
          Sau
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── StatusBadge (Modern Soft Pill with Glowing Dot) ──────────────────────────

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const map: Record<string, { wrap: string; dot: string }> = {
    Uploaded:  { wrap: 'bg-sky-50 text-sky-700 border-sky-200/80',         dot: 'bg-sky-500' },
    Analyzing: { wrap: 'bg-amber-50 text-amber-700 border-amber-200/80',   dot: 'bg-amber-500 animate-ping' },
    Analyzed:  { wrap: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    Error:     { wrap: 'bg-Berry/10 text-Berry border-Berry/25',           dot: 'bg-Berry' },
    Pending:   { wrap: 'bg-amber-50 text-amber-700 border-amber-200/80',   dot: 'bg-amber-500' },
    Approved:  { wrap: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    Rejected:  { wrap: 'bg-Snowflake/80 text-Branch border-Mist/30',       dot: 'bg-Mist' },
    High:      { wrap: 'bg-Berry text-white border-Berry shadow-sm',       dot: 'bg-white animate-pulse' },
    Medium:    { wrap: 'bg-amber-500 text-white border-amber-500 shadow-sm', dot: 'bg-white' },
    Low:       { wrap: 'bg-Pine/10 text-Pine border-Pine/20',              dot: 'bg-Pine' },
    Safe:      { wrap: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    Warning:   { wrap: 'bg-amber-50 text-amber-700 border-amber-200',      dot: 'bg-amber-500' },
    Danger:    { wrap: 'bg-Berry/10 text-Berry border-Berry/25',           dot: 'bg-Berry animate-pulse' },
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

  const style = map[status] || { wrap: 'bg-Snowflake text-Branch border-Mist/30', dot: 'bg-Branch' }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border whitespace-nowrap ${style.wrap}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {labelMap[status] || status}
    </span>
  )
}

// ─── RiskScoreBar (Glowing Gradient Bar + Badge) ──────────────────────────────

interface RiskScoreBarProps {
  score: number | null
}

export function RiskScoreBar({ score }: RiskScoreBarProps) {
  const s = score ?? 100
  const gradient =
    s >= 80
      ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
      : s >= 50
      ? 'bg-gradient-to-r from-amber-400 to-amber-600'
      : 'bg-gradient-to-r from-Berry to-rose-700'
  const textColor =
    s >= 80
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : s >= 50
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-Berry bg-Berry/10 border-Berry/20'

  return (
    <div className="flex items-center gap-2.5 min-w-[145px]">
      <div className="flex-1 bg-Snowflake/80 rounded-xl h-2.5 overflow-hidden border border-Mist/20 p-0.5 shadow-inner">
        <div
          className={`h-full rounded-lg transition-all duration-500 ${gradient}`}
          style={{ width: `${Math.max(5, Math.min(100, s))}%` }}
        />
      </div>
      <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-lg border ${textColor}`}>
        {s}đ
      </span>
    </div>
  )
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-11 h-11' }[size]
  return (
    <div className={`${sizeClass} border-2 border-Mist/30 border-t-Pine rounded-full animate-spin`} />
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({ message = 'Không có dữ liệu hiển thị' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-Snowflake to-white border border-Mist/25 shadow-sm flex items-center justify-center text-Mist mb-3">
        <Inbox className="w-8 h-8 text-Pine/50" />
      </div>
      <p className="text-sm font-bold text-Pine">{message}</p>
    </div>
  )
}