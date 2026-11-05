import React from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck, AlertTriangle, AlertOctagon, HelpCircle,
  ArrowUpRight, Info, UserCheck, AlertCircle, FileCheck2
} from 'lucide-react'

export interface SQAOverviewMetrics {
  humanConfirmationRate?: {
    value: number | null
    numerator: number
    denominator: number
    sampleSize: number
    minimumRequired?: number
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'INSUFFICIENT_DATA' | 'NO_DATA'
    description: string
  }
  analysisFailureRate?: {
    value: number | null
    numerator: number
    denominator: number
    sampleSize: number
    minimumRequired?: number
    analyzingCount: number
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'INSUFFICIENT_DATA' | 'NO_DATA'
    description: string
  }
  analysisSuccessRate: {
    value: number | null
    numerator: number
    denominator: number
    sampleSize: number
    minimumRequired?: number
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'INSUFFICIENT_DATA' | 'NO_DATA'
    description: string
  }
  analysisFailureCount: {
    value: number
    analyzingCount: number
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL'
    description: string
  }
  pendingFindings: {
    value: number
    highCount: number
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL'
    description: string
  }
  humanReviewCoverage: {
    value: number | null
    numerator: number
    denominator: number
    sampleSize: number
    minimumRequired?: number
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'INSUFFICIENT_DATA' | 'NO_DATA'
    description: string
  }
  evidenceCoverage: {
    value: number | null
    numerator: number
    denominator: number
    sampleSize: number
    minimumRequired?: number
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'INSUFFICIENT_DATA' | 'NO_DATA'
    description: string
  }
}

export interface SQADiagnosisBrief {
  code: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  title: string
  metricValue: number | string | null
  thresholdValue: number | string
  diagnosis: string
  evidence: string
  actionLabel: string
  actionUrl: string
}

interface SQAOverallStatusProps {
  overallStatus: 'HEALTHY' | 'ATTENTION' | 'CRITICAL' | 'INSUFFICIENT_DATA'
  metrics: SQAOverviewMetrics | null
  topDiagnoses: SQADiagnosisBrief[]
}

export const SQAOverallStatus: React.FC<SQAOverallStatusProps> = ({
  overallStatus,
  metrics,
  topDiagnoses,
}) => {
  const getOverallBadge = () => {
    switch (overallStatus) {
      case 'HEALTHY':
        return {
          bg: 'bg-emerald-50/80 border-emerald-300 text-emerald-900',
          dot: 'bg-emerald-500',
          icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />,
          label: 'HỆ THỐNG VẬN HÀNH TỐT',
          desc: 'Các chỉ số phân tích AI, độ tin cậy bằng chứng và quy trình xác minh của kiểm toán viên đều nằm trong giới hạn an toàn.',
        }
      case 'ATTENTION':
        return {
          bg: 'bg-amber-50/80 border-amber-300 text-amber-900',
          dot: 'bg-amber-500',
          icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
          label: 'HỆ THỐNG CẦN CHÚ Ý',
          desc: 'Phát hiện một số chỉ số SQA vượt ngưỡng cảnh báo. Đề nghị kiểm toán viên rà soát các đề xuất hành động bên dưới.',
        }
      case 'CRITICAL':
        return {
          bg: 'bg-rose-50/80 border-rose-300 text-rose-900',
          dot: 'bg-rose-500 animate-pulse',
          icon: <AlertOctagon className="w-5 h-5 text-rose-600" />,
          label: 'CẢNH BÁO MỨC NGHIÊM TRỌNG',
          desc: 'Hệ thống ghi nhận sự cố phân tích hoặc vi phạm rủi ro cao tồn đọng, cần quản trị viên can thiệp xử lý ngay.',
        }
      default:
        return {
          bg: 'bg-slate-50 border-slate-300 text-slate-800',
          dot: 'bg-slate-400',
          icon: <HelpCircle className="w-5 h-5 text-slate-600" />,
          label: 'CHƯA ĐỦ DỮ LIỆU ĐÁNH GIÁ',
          desc: 'Số lượng hợp đồng hoặc vi phạm trong kỳ chưa đạt số lượng mẫu tối thiểu (&ge; 20 mẫu) để đánh giá độ tin cậy.',
        }
    }
  }

  const overall = getOverallBadge()

  // Helper chuyển đổi mã trạng thái sang tiếng Việt và màu sắc Tailwind tương ứng
  const translateStatus = (
    status: string | undefined,
    sampleSize?: number,
    minRequired: number = 20
  ) => {
    switch (status) {
      case 'HEALTHY':
        return { label: 'Tốt', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
      case 'WARNING':
      case 'ATTENTION':
        return { label: 'Cần chú ý', cls: 'bg-amber-100 text-amber-800 border-amber-200' }
      case 'CRITICAL':
        return { label: 'Nghiêm trọng', cls: 'bg-rose-100 text-rose-800 border-rose-200' }
      case 'NO_DATA':
        return { label: 'Chưa có dữ liệu', cls: 'bg-slate-100 text-slate-600 border-slate-200' }
      case 'INSUFFICIENT_DATA':
      default:
        if (sampleSize !== undefined && sampleSize > 0) {
          return {
            label: `Chưa đủ mẫu (${sampleSize}/${minRequired})`,
            cls: 'bg-slate-100 text-slate-700 border-slate-200',
          }
        }
        return { label: 'Chưa có dữ liệu', cls: 'bg-slate-100 text-slate-600 border-slate-200' }
    }
  }

  // Lấy dữ liệu cho 4 KPI chính theo đặc tả SQA
  const confirmRate = metrics?.humanConfirmationRate
  const failRate = metrics?.analysisFailureRate
  const pending = metrics?.pendingFindings
  const evidence = metrics?.evidenceCoverage

  return (
    <div className="space-y-4">
      {/* ─── A. Thẻ Trạng thái SQA Tổng thể ────────────────────────────────────── */}
      <div className={`rounded-2xl border p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 ${overall.bg} shadow-sm`}>
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-white rounded-xl shadow-sm border border-black/5 flex-shrink-0">
            {overall.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${overall.dot}`} />
              <h2 className="text-sm font-black tracking-wider uppercase font-sans">{overall.label}</h2>
            </div>
            <p className="text-xs mt-1 text-black/75 max-w-3xl leading-relaxed">{overall.desc}</p>
          </div>
        </div>
      </div>

      {/* ─── B. 4 KPI Điều hành Cốt lõi (Bố trí trên cùng 1 hàng khi màn hình rộng) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Tỷ lệ xác nhận của kiểm toán viên */}
        <div className="bg-white rounded-2xl border border-Mist/30 p-4 sm:p-5 shadow-sm hover:border-Pine/40 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-Pine/10 text-Pine flex items-center justify-center flex-shrink-0">
                  <UserCheck className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-Branch truncate" title="Tỷ lệ xác nhận của kiểm toán viên">
                  Xác nhận của kiểm toán viên
                </span>
              </div>
              <div className="group/tip relative cursor-help flex-shrink-0">
                <Info className="w-3.5 h-3.5 text-Mist/80" />
                <div className="absolute right-0 bottom-full mb-1 hidden group-hover/tip:block z-30 w-56 p-2 bg-Pine text-white text-[11px] rounded-lg shadow-lg">
                  {confirmRate?.description || 'Tỷ lệ cảnh báo được Auditor xác nhận = Approved / (Approved + Rejected).'}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-Pine font-mono tracking-tight">
                {confirmRate?.value !== null && confirmRate?.value !== undefined
                  ? `${confirmRate.value}%`
                  : 'Chưa có dữ liệu'}
              </span>
            </div>

            <p className="mt-1 text-xs text-Branch/80 font-medium">
              Số lượng mẫu: <strong className="text-Pine font-mono">{confirmRate?.numerator ?? 0}</strong> / {confirmRate?.denominator ?? 0} kết quả
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-Mist/15 flex items-center justify-between text-[11px]">
            <span className="text-Mist font-medium">Ngưỡng: &ge; 80%</span>
            {(() => {
              const st = translateStatus(confirmRate?.status, confirmRate?.sampleSize, confirmRate?.minimumRequired ?? 20)
              return (
                <span className={`px-2 py-0.5 rounded-md font-bold border text-[10px] ${st.cls}`}>
                  {st.label}
                </span>
              )
            })()}
          </div>
        </div>

        {/* KPI 2: Tỷ lệ lỗi phân tích */}
        <div className="bg-white rounded-2xl border border-Mist/30 p-4 sm:p-5 shadow-sm hover:border-Pine/40 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-rose-50 text-Berry flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-Branch truncate" title="Tỷ lệ lỗi phân tích hợp đồng">
                  Tỷ lệ lỗi phân tích
                </span>
              </div>
              <div className="group/tip relative cursor-help flex-shrink-0">
                <Info className="w-3.5 h-3.5 text-Mist/80" />
                <div className="absolute right-0 bottom-full mb-1 hidden group-hover/tip:block z-30 w-56 p-2 bg-Pine text-white text-[11px] rounded-lg shadow-lg">
                  {failRate?.description || 'Tỷ lệ lỗi phân tích = Error / (Analyzed + Error).'}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-1.5">
              <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${
                (failRate?.numerator ?? 0) > 0 ? 'text-Berry' : 'text-Pine'
              }`}>
                {failRate?.value !== null && failRate?.value !== undefined
                  ? `${failRate.value}%`
                  : (failRate?.denominator === 0 ? 'Chưa có dữ liệu' : '0%')}
              </span>
            </div>

            <p className="mt-1 text-xs text-Branch/80 font-medium">
              Lỗi: <strong className="text-Berry font-mono">{failRate?.numerator ?? 0}</strong> / {failRate?.denominator ?? 0} hợp đồng
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-Mist/15 flex items-center justify-between text-[11px]">
            <span className="text-Mist font-medium">Ngưỡng: &le; 2% (0 lỗi)</span>
            {(() => {
              const st = translateStatus(failRate?.status, failRate?.sampleSize, failRate?.minimumRequired ?? 20)
              return (
                <span className={`px-2 py-0.5 rounded-md font-bold border text-[10px] ${st.cls}`}>
                  {st.label}
                </span>
              )
            })()}
          </div>
        </div>

        {/* KPI 3: Số phát hiện đang chờ thẩm định */}
        <div className="bg-white rounded-2xl border border-Mist/30 p-4 sm:p-5 shadow-sm hover:border-Pine/40 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-Branch truncate" title="Số phát hiện đang chờ thẩm định">
                  Chờ thẩm định
                </span>
              </div>
              <div className="group/tip relative cursor-help flex-shrink-0">
                <Info className="w-3.5 h-3.5 text-Mist/80" />
                <div className="absolute right-0 bottom-full mb-1 hidden group-hover/tip:block z-30 w-56 p-2 bg-Pine text-white text-[11px] rounded-lg shadow-lg">
                  {pending?.description || 'Số cảnh báo vi phạm AI phát hiện đang chờ kiểm toán viên thẩm định.'}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-1.5">
              <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${
                (pending?.value ?? 0) > 0 ? 'text-amber-700' : 'text-Pine'
              }`}>
                {pending?.value ?? 0}
              </span>
              <span className="text-xs font-bold text-Mist">phát hiện</span>
            </div>

            <p className="mt-1 text-xs text-Branch/80 font-medium">
              Rủi ro High tồn đọng: <strong className={`font-mono ${(pending?.highCount ?? 0) > 0 ? 'text-Berry font-bold' : 'text-Pine'}`}>
                {pending?.highCount ?? 0}
              </strong>
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-Mist/15 flex items-center justify-between text-[11px]">
            <span className="text-Mist font-medium">High tồn đọng: 0</span>
            {(() => {
              const st = translateStatus(pending?.status)
              return (
                <span className={`px-2 py-0.5 rounded-md font-bold border text-[10px] ${st.cls}`}>
                  {st.label}
                </span>
              )
            })()}
          </div>
        </div>

        {/* KPI 4: Độ đầy đủ bằng chứng */}
        <div className="bg-white rounded-2xl border border-Mist/30 p-4 sm:p-5 shadow-sm hover:border-Pine/40 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                  <FileCheck2 className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-Branch truncate" title="Độ đầy đủ bằng chứng trích dẫn">
                  Độ đầy đủ bằng chứng
                </span>
              </div>
              <div className="group/tip relative cursor-help flex-shrink-0">
                <Info className="w-3.5 h-3.5 text-Mist/80" />
                <div className="absolute right-0 bottom-full mb-1 hidden group-hover/tip:block z-30 w-56 p-2 bg-Pine text-white text-[11px] rounded-lg shadow-lg">
                  {evidence?.description || 'Tỷ lệ phát hiện có trích dẫn điều khoản hợp đồng và số trang đầy đủ.'}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-Pine font-mono tracking-tight">
                {evidence?.value !== null && evidence?.value !== undefined
                  ? `${evidence.value}%`
                  : 'Chưa có dữ liệu'}
              </span>
            </div>

            <p className="mt-1 text-xs text-Branch/80 font-medium">
              Số lượng mẫu: <strong className="text-Pine font-mono">{evidence?.numerator ?? 0}</strong> / {evidence?.denominator ?? 0} phát hiện
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-Mist/15 flex items-center justify-between text-[11px]">
            <span className="text-Mist font-medium">Ngưỡng: &ge; 95%</span>
            {(() => {
              const st = translateStatus(evidence?.status, evidence?.sampleSize, evidence?.minimumRequired ?? 20)
              return (
                <span className={`px-2 py-0.5 rounded-md font-bold border text-[10px] ${st.cls}`}>
                  {st.label}
                </span>
              )
            })()}
          </div>
        </div>
      </div>

      {/* ─── C. Chẩn đoán Điều hành (Executive Diagnosis · Top 3 Cảnh báo Ưu tiên) ─── */}
      {topDiagnoses.length > 0 && (
        <div className="bg-white rounded-2xl border border-Mist/30 p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-Pine font-mono flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-Berry" />
              Chẩn đoán điều hành (Top 3 cảnh báo ưu tiên xử lý)
            </h3>
            <span className="text-[11px] text-Mist font-medium">Tự động phát hiện theo chuẩn quy tắc SQA-001 đến SQA-008</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topDiagnoses.map((diag) => {
              const isCrit = diag.severity === 'CRITICAL'
              return (
                <div
                  key={diag.code}
                  className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                    isCrit ? 'bg-rose-50/40 border-rose-200 hover:border-rose-300' : 'bg-amber-50/40 border-amber-200 hover:border-amber-300'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white text-Pine border border-Mist/30 shadow-xs">
                        {diag.code}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        isCrit ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                      }`}>
                        {isCrit ? 'Nghiêm trọng' : 'Cảnh báo'}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-Pine line-clamp-1">{diag.title}</h4>
                    <p className="text-[11px] text-Branch/85 leading-relaxed line-clamp-2">{diag.diagnosis}</p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-black/5 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-Mist truncate">Căn cứ: {diag.thresholdValue}</span>
                    <Link
                      to={diag.actionUrl}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-Pine hover:text-Berry transition-colors flex-shrink-0"
                    >
                      <span>{diag.actionLabel}</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
