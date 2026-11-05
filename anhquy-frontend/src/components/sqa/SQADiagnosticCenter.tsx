import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2, Info
} from 'lucide-react'

export interface DiagnosticItem {
  code: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  title: string
  metricValue: number | string | null
  thresholdValue: number | string
  diagnosis: string
  evidence: string
  actionLabel: string
  actionUrl: string
  detectedAt: string
}

export interface DiagnosticsData {
  generatedAt: string
  period: { from: string; to: string }
  overallStatus: 'HEALTHY' | 'ATTENTION' | 'CRITICAL' | 'INSUFFICIENT_DATA'
  totalIssues: number
  criticalCount: number
  warningCount: number
  items: DiagnosticItem[]
}

interface SQADiagnosticCenterProps {
  data: DiagnosticsData | null
  loading: boolean
}

export const SQADiagnosticCenter: React.FC<SQADiagnosticCenterProps> = ({ data, loading }) => {
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL')

  if (loading || !data) {
    return (
      <div className="bg-white rounded-2xl border border-Mist/30 p-6 shadow-sm flex items-center justify-center min-h-[160px]">
        <span className="text-xs font-semibold text-Mist">Đang chạy engine chẩn đoán SQA...</span>
      </div>
    )
  }

  const { items, criticalCount, warningCount, totalIssues } = data

  const filteredItems = items.filter((item) => {
    if (filterSeverity === 'CRITICAL') return item.severity === 'CRITICAL'
    if (filterSeverity === 'WARNING') return item.severity === 'WARNING'
    return true
  })

  const formatDetectedTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr)
      return new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(d)
    } catch {
      return isoStr
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-Mist/30 p-4 sm:p-5 shadow-sm space-y-5">
      {/* ─── Header & Filter ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-Mist/15 pb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-Pine font-sans flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-Pine" />
            Trung tâm chẩn đoán và hành động khắc phục
          </h2>
          <p className="text-xs text-Branch/80 mt-0.5 font-medium leading-relaxed">
            Tự động đối chiếu số liệu hệ thống với các bộ quy tắc chuẩn hóa SQA-001 đến SQA-008 để phát hiện bất thường.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-Snowflake p-1 rounded-xl border border-Mist/25 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setFilterSeverity('ALL')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              filterSeverity === 'ALL' ? 'bg-Pine text-white shadow-sm' : 'text-Branch/80 hover:text-Pine'
            }`}
          >
            Tất cả ({totalIssues})
          </button>
          <button
            type="button"
            onClick={() => setFilterSeverity('CRITICAL')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              filterSeverity === 'CRITICAL' ? 'bg-rose-600 text-white shadow-sm' : 'text-rose-700 hover:text-rose-900'
            }`}
          >
            Nghiêm trọng ({criticalCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterSeverity('WARNING')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              filterSeverity === 'WARNING' ? 'bg-amber-500 text-white shadow-sm' : 'text-amber-800 hover:text-amber-950'
            }`}
          >
            Cảnh báo ({warningCount})
          </button>
        </div>
      </div>

      {/* ─── Danh sách Diagnostic Cards ─────────────────────────────────────── */}
      {filteredItems.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/20">
          <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-emerald-900">Không có phát hiện bất thường nào cần xử lý</h3>
          <p className="text-xs text-emerald-700 mt-1 max-w-lg mx-auto leading-relaxed">
            Hệ thống đang vận hành trong giới hạn ngưỡng an toàn. Mọi chỉ số phân tích, xác minh và rủi ro chuỗi cung ứng đều ổn định.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((diag) => {
            const isCrit = diag.severity === 'CRITICAL'
            return (
              <div
                key={diag.code}
                className={`p-4 rounded-xl border transition-all ${
                  isCrit
                    ? 'bg-rose-50/40 border-rose-200 hover:border-rose-300'
                    : 'bg-amber-50/40 border-amber-200 hover:border-amber-300'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white text-Pine border border-Mist/30 shadow-xs">
                        {diag.code}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        isCrit ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                      }`}>
                        {isCrit ? 'Nghiêm trọng' : 'Cảnh báo'}
                      </span>
                      <span className="text-[11px] text-Mist font-mono">
                        Ngưỡng: {diag.thresholdValue}
                      </span>
                      <span className="text-[11px] text-Mist font-mono">
                        • Phát hiện: {formatDetectedTime(diag.detectedAt)}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-Pine">{diag.title}</h3>

                    <p className="text-xs text-Branch leading-relaxed">
                      <strong className="text-Pine font-bold">Chẩn đoán: </strong>
                      {diag.diagnosis}
                    </p>

                    <p className="text-[11px] text-Branch/80 font-mono">
                      <strong className="text-Branch font-sans font-semibold">Căn cứ số liệu: </strong>
                      {diag.evidence}
                    </p>
                  </div>

                  {/* Nút Hành động Khắc phục */}
                  <div className="self-end md:self-center flex-shrink-0">
                    <Link
                      to={diag.actionUrl}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 ${
                        isCrit
                          ? 'bg-rose-600 text-white hover:bg-rose-700'
                          : 'bg-Pine text-white hover:bg-Pine/90'
                      }`}
                    >
                      <span>{diag.actionLabel}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Nguyên tắc SQA ─────────────────────────────────────────────────── */}
      <div className="pt-2 border-t border-Mist/15 text-[11px] text-Mist leading-relaxed flex items-center gap-2">
        <Info className="w-3.5 h-3.5 flex-shrink-0 text-Pine" />
        <span>
          <strong>Nguyên tắc SQA:</strong> Chẩn đoán mang tính hỗ trợ ra quyết định dựa trên dữ liệu thực tế. Quản trị viên sử dụng các nút liên kết để điều hướng trực tiếp đến chức năng nghiệp vụ tương ứng và thẩm định thủ công.
        </span>
      </div>
    </div>
  )
}
