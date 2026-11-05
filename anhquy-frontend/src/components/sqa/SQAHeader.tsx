import React from 'react'
import { RefreshCw, Calendar, Sparkles } from 'lucide-react'

export type PeriodOption = '7d' | '30d' | '90d' | 'custom'

interface SQAHeaderProps {
  period: PeriodOption
  onPeriodChange: (period: PeriodOption) => void
  customFrom: string
  customTo: string
  onCustomFromChange: (val: string) => void
  onCustomToChange: (val: string) => void
  onRefresh: () => void
  loading: boolean
  lastUpdated: string | null
}

export const SQAHeader: React.FC<SQAHeaderProps> = ({
  period,
  onPeriodChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  onRefresh,
  loading,
  lastUpdated,
}) => {
  const formatTimeVN = (isoStr: string | null) => {
    if (!isoStr) return 'Đang cập nhật...'
    try {
      const d = new Date(isoStr)
      return new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(d)
    } catch {
      return isoStr
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-Mist/30 shadow-sm p-4 sm:p-5 space-y-4">
      {/* Hàng 1: Tiêu đề trang & Nút làm mới */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-Pine/10 text-Pine rounded-xl flex-shrink-0">
              <Sparkles className="w-5 h-5 text-Pine" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-Pine tracking-tight truncate">
                Trung tâm kiểm soát chất lượng AI
              </h1>
              <p className="text-xs sm:text-sm text-Branch/80 mt-0.5 font-medium leading-relaxed">
                Giám sát chất lượng phân tích hợp đồng, độ tin cậy bằng chứng và rủi ro chuỗi cung ứng ANHQUY.
              </p>
            </div>
          </div>
        </div>

        {/* Nút Làm mới & Cập nhật lần cuối */}
        <div className="flex items-center gap-3 self-end sm:self-center flex-shrink-0">
          <div className="text-right hidden md:block">
            <p className="text-[10px] font-bold uppercase tracking-wider text-Mist">Cập nhật lần cuối</p>
            <p className="text-xs font-semibold text-Branch font-mono">{formatTimeVN(lastUpdated)}</p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-Pine text-white text-xs font-bold rounded-xl hover:bg-Pine/90 disabled:opacity-50 transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Đang cập nhật...' : 'Làm mới'}</span>
          </button>
        </div>
      </div>

      {/* Hàng 2: Bộ lọc thời gian chuẩn Enterprise */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-Mist/20">
        <div className="flex items-center gap-1.5 bg-Snowflake p-1 rounded-xl border border-Mist/25">
          <button
            type="button"
            onClick={() => onPeriodChange('7d')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              period === '7d' ? 'bg-Pine text-white shadow-sm' : 'text-Branch/80 hover:text-Pine'
            }`}
          >
            7 ngày qua
          </button>
          <button
            type="button"
            onClick={() => onPeriodChange('30d')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              period === '30d' ? 'bg-Pine text-white shadow-sm' : 'text-Branch/80 hover:text-Pine'
            }`}
          >
            30 ngày qua
          </button>
          <button
            type="button"
            onClick={() => onPeriodChange('90d')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              period === '90d' ? 'bg-Pine text-white shadow-sm' : 'text-Branch/80 hover:text-Pine'
            }`}
          >
            90 ngày qua
          </button>
          <button
            type="button"
            onClick={() => onPeriodChange('custom')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              period === 'custom' ? 'bg-Pine text-white shadow-sm' : 'text-Branch/80 hover:text-Pine'
            }`}
          >
            Tùy chỉnh
          </button>
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-Mist/40 shadow-sm">
              <Calendar className="w-3.5 h-3.5 text-Pine" />
              <span className="text-[11px] font-bold text-Mist">Từ ngày:</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => onCustomFromChange(e.target.value)}
                className="text-xs text-Pine font-semibold outline-none cursor-pointer"
              />
            </div>
            <span className="text-Mist font-bold">đến</span>
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-Mist/40 shadow-sm">
              <Calendar className="w-3.5 h-3.5 text-Pine" />
              <span className="text-[11px] font-bold text-Mist">Đến ngày:</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => onCustomToChange(e.target.value)}
                className="text-xs text-Pine font-semibold outline-none cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
