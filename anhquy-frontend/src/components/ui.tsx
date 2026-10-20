import React from 'react'

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
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy bỏ',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null

  const variantStyles = {
    danger: 'bg-Berry text-white hover:bg-Berry/90',
    warning: 'bg-amber-500 text-white hover:bg-amber-600',
    info: 'bg-Pine text-white hover:bg-Pine/90',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-Pine/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative z-10 bg-white rounded-lg shadow-lg w-full max-w-md mx-4 overflow-hidden transition-all duration-300">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-Pine mb-2">{title}</h3>
          <p className="text-Branch text-sm leading-relaxed">{message}</p>
        </div>
        <div className="px-6 pb-6 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-Branch bg-Snowflake border border-Mist rounded-md hover:bg-Frostysilver transition-all duration-300"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-300 ${variantStyles[variant]}`}
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
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-Pine/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 bg-white rounded-lg shadow-lg w-full ${sizeMap[size]} mx-4 max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-Mist/30">
          <h3 className="text-lg font-semibold text-Pine">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-Mist hover:text-Branch transition-colors p-1 rounded-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto p-6 flex-1">{children}</div>
      </div>
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────

interface PaginationProps {
  page: number
  total: number
  limit: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, total, limit, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit)
  if (totalPages <= 1) return null

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

  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-Mist">
        Hiển thị {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} / {total} kết quả
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 text-sm rounded-md border border-Mist/40 text-Branch disabled:opacity-40 disabled:cursor-not-allowed hover:bg-Frostysilver transition-all duration-300"
        >
          ‹
        </button>
        {pages.map((p, idx) =>
          p === '...' ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-Mist">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p as number)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-all duration-300 ${
                p === page
                  ? 'bg-Pine text-white border-Pine'
                  : 'border-Mist/40 text-Branch hover:bg-Frostysilver'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1.5 text-sm rounded-md border border-Mist/40 text-Branch disabled:opacity-40 disabled:cursor-not-allowed hover:bg-Frostysilver transition-all duration-300"
        >
          ›
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
    Uploaded:  'bg-blue-100 text-blue-700',
    Analyzing: 'bg-amber-100 text-amber-700',
    Analyzed:  'bg-emerald-100 text-emerald-700',
    Error:     'bg-Berry/10 text-Berry',
    Pending:   'bg-amber-100 text-amber-700',
    Approved:  'bg-emerald-100 text-emerald-700',
    Rejected:  'bg-Berry/10 text-Berry',
    High:      'bg-Berry/10 text-Berry',
    Medium:    'bg-amber-100 text-amber-700',
    Low:       'bg-emerald-100 text-emerald-700',
    Safe:      'bg-emerald-100 text-emerald-700',
    Warning:   'bg-amber-100 text-amber-700',
    Danger:    'bg-Berry/10 text-Berry',
  }
  const labelMap: Record<string, string> = {
    Uploaded:  'Đã tải lên',
    Analyzing: 'Đang phân tích',
    Analyzed:  'Đã phân tích',
    Error:     'Lỗi',
    Pending:   'Chờ duyệt',
    Approved:  'Đã duyệt',
    Rejected:  'Đã từ chối',
    High:      'Cao',
    Medium:    'Trung bình',
    Low:       'Thấp',
    Safe:      'An toàn',
    Warning:   'Cảnh báo',
    Danger:    'Nguy hiểm',
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${map[status] || 'bg-Snowflake text-Branch'}`}>
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
  const label = s >= 80 ? 'An toàn' : s >= 50 ? 'Cảnh báo' : 'Nguy hiểm'

  return (
    <div className="flex items-center gap-2 min-w-[130px]">
      <div className="flex-1 bg-Snowflake rounded-md h-2.5 overflow-hidden border border-Mist/20">
        <div
          className={`h-full rounded-md transition-all duration-500 ${color}`}
          style={{ width: `${Math.max(0, Math.min(100, s))}%` }}
        />
      </div>
      <span className="text-xs font-bold text-Pine w-8 text-right">{s}đ</span>
      <span className="text-xs text-Mist hidden md:block">{label}</span>
    </div>
  )
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }[size]
  return (
    <div className={`${sizeClass} border-2 border-Mist border-t-Pine rounded-full animate-spin`} />
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({ message = 'Không có dữ liệu' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-Mist">
      <svg className="w-16 h-16 mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  )
}