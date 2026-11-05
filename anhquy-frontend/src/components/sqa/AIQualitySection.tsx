import React from 'react'
import {
  UserCheck, UserX, Clock, FileCheck2, AlertCircle,
  HelpCircle, CheckCircle2, ChevronRight
} from 'lucide-react'
import { Link } from 'react-router-dom'

export interface AIQualityData {
  period: { from: string; to: string }
  sampleSizes: {
    totalFindings: number
    totalResolved: number
    minimumRequired: number
    isSufficient: boolean
  }
  approvedCount: number
  rejectedCount: number
  pendingCount: number
  humanConfirmationRate: number | null
  rejectionRate: number | null
  humanReviewCoverage: number | null
  evidenceCompleteness: number | null
  validEvidenceCount: number
  missingEvidenceCount: number
  findingsByRisk: {
    High: { pending: number; approved: number; rejected: number }
    Medium: { pending: number; approved: number; rejected: number }
    Low: { pending: number; approved: number; rejected: number }
  }
  dataQualityStatus: 'SUFFICIENT' | 'INSUFFICIENT_DATA' | 'NO_DATA'
  notes: {
    humanConfirmationRate: string
    rejectionRate: string
    evidenceCompleteness: string
  }
}

interface AIQualitySectionProps {
  data: AIQualityData | null
  loading: boolean
}

export const AIQualitySection: React.FC<AIQualitySectionProps> = ({ data, loading }) => {
  if (loading || !data) {
    return (
      <div className="bg-white rounded-2xl border border-Mist/30 p-6 shadow-sm flex items-center justify-center min-h-[160px]">
        <span className="text-xs font-semibold text-Mist">Đang tải số liệu chất lượng phân tích AI...</span>
      </div>
    )
  }

  const { sampleSizes, findingsByRisk } = data

  return (
    <div className="bg-white rounded-2xl border border-Mist/30 p-4 sm:p-5 shadow-sm space-y-5">
      {/* ─── Header Section ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-Mist/15 pb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-Pine font-sans flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-Pine" />
            Chất lượng phân tích AI và xác minh của con người
          </h2>
          <p className="text-xs text-Branch/80 mt-0.5 font-medium leading-relaxed">
            Đo lường mức độ đồng thuận giữa kết quả quét AI và quyết định của kiểm toán viên trên cơ sở bằng chứng thực tế.
          </p>
        </div>

        {/* Trạng thái cỡ mẫu */}
        <div className="flex-shrink-0">
          {sampleSizes.totalFindings === 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-50 text-slate-600 border border-slate-200">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
              Chưa có dữ liệu phát hiện
            </span>
          ) : sampleSizes.isSufficient ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Đủ dữ liệu đánh giá ({sampleSizes.totalResolved} / &ge;{sampleSizes.minimumRequired} mẫu)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              Chưa đủ mẫu ({sampleSizes.totalResolved} / &ge;{sampleSizes.minimumRequired} mẫu)
            </span>
          )}
        </div>
      </div>

      {/* ─── 4 Chỉ số Cốt lõi ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Chỉ số 1: Được kiểm toán viên xác nhận */}
        <div className="rounded-xl border border-Mist/25 p-4 bg-Snowflake/30 flex flex-col justify-between hover:border-Pine/30 transition-all">
          <div>
            <div className="flex items-center justify-between text-Mist">
              <span className="text-xs font-bold text-Branch truncate">Được xác nhận (Approved)</span>
              <UserCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-Pine font-mono">
                {data.approvedCount}
              </span>
              <span className="text-xs font-bold text-Mist">phát hiện</span>
            </div>
            <p className="mt-1 text-xs text-Branch/80 font-medium">
              Tỷ lệ xác nhận: <strong className="text-Pine font-mono font-bold">
                {data.humanConfirmationRate !== null ? `${data.humanConfirmationRate}%` : 'Chưa có dữ liệu'}
              </strong>
            </p>
          </div>
          <p className="mt-3 pt-2 border-t border-Mist/15 text-[10px] text-Mist leading-tight italic">
            * Tỷ lệ xác nhận của con người = Approved / (Approved + Rejected).
          </p>
        </div>

        {/* Chỉ số 2: Bị kiểm toán viên bác bỏ */}
        <div className="rounded-xl border border-Mist/25 p-4 bg-Snowflake/30 flex flex-col justify-between hover:border-Pine/30 transition-all">
          <div>
            <div className="flex items-center justify-between text-Mist">
              <span className="text-xs font-bold text-Branch truncate">Bị bác bỏ (Rejected)</span>
              <UserX className="w-4 h-4 text-Berry flex-shrink-0" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className={`text-2xl sm:text-3xl font-black font-mono ${
                data.rejectedCount > 0 ? 'text-Berry' : 'text-Pine'
              }`}>
                {data.rejectedCount}
              </span>
              <span className="text-xs font-bold text-Mist">phát hiện</span>
            </div>
            <p className="mt-1 text-xs text-Branch/80 font-medium">
              Tỷ lệ bác bỏ: <strong className={`font-mono font-bold ${(data.rejectionRate ?? 0) > 20 ? 'text-Berry' : 'text-Pine'}`}>
                {data.rejectionRate !== null ? `${data.rejectionRate}%` : 'Chưa có dữ liệu'}
              </strong>
            </p>
          </div>
          <p className="mt-3 pt-2 border-t border-Mist/15 text-[10px] text-Mist leading-tight italic">
            * Tỷ lệ bác bỏ = Rejected / (Approved + Rejected).
          </p>
        </div>

        {/* Chỉ số 3: Tỷ lệ bao phủ xác minh */}
        <div className="rounded-xl border border-Mist/25 p-4 bg-Snowflake/30 flex flex-col justify-between hover:border-Pine/30 transition-all">
          <div>
            <div className="flex items-center justify-between text-Mist">
              <span className="text-xs font-bold text-Branch truncate">Bao phủ xác minh</span>
              <Clock className="w-4 h-4 text-Pine flex-shrink-0" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-Pine font-mono">
                {data.humanReviewCoverage !== null
                  ? `${data.humanReviewCoverage}%`
                  : (sampleSizes.totalFindings === 0 ? 'Chưa có dữ liệu' : '0%')}
              </span>
            </div>
            <p className="mt-1 text-xs text-Branch/80 font-medium">
              Đã thẩm định: <strong className="text-Pine font-mono font-bold">{sampleSizes.totalResolved}</strong> / {sampleSizes.totalFindings} phát hiện
            </p>
          </div>
          <p className="mt-3 pt-2 border-t border-Mist/15 text-[10px] text-Mist leading-tight italic">
            * Tỷ lệ phát hiện AI đã được con người xử lý (Approved + Rejected).
          </p>
        </div>

        {/* Chỉ số 4: Độ đầy đủ bằng chứng */}
        <div className="rounded-xl border border-Mist/25 p-4 bg-Snowflake/30 flex flex-col justify-between hover:border-Pine/30 transition-all">
          <div>
            <div className="flex items-center justify-between text-Mist">
              <span className="text-xs font-bold text-Branch truncate">Độ đầy đủ bằng chứng</span>
              <FileCheck2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-Pine font-mono">
                {data.evidenceCompleteness !== null
                  ? `${data.evidenceCompleteness}%`
                  : 'Chưa có dữ liệu'}
              </span>
            </div>
            <p className="mt-1 text-xs text-Branch/80 font-medium">
              Có trích dẫn: <strong className="text-Pine font-mono font-bold">{data.validEvidenceCount}</strong> / {sampleSizes.totalFindings} phát hiện
            </p>
          </div>
          <p className="mt-3 pt-2 border-t border-Mist/15 text-[10px] text-Mist leading-tight italic">
            * Tỷ lệ phát hiện có trích đoạn điều khoản và số trang đối chiếu.
          </p>
        </div>
      </div>

      {/* ─── Ma trận phân bổ theo Mức độ rủi ro ───────────────────────────────── */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-Pine font-mono">
            Phân bổ phát hiện theo mức độ rủi ro & tiến độ thẩm định
          </h3>
          <Link
            to="/violations?status=Pending"
            className="text-xs font-bold text-Berry hover:text-Pine inline-flex items-center gap-1 transition-colors flex-shrink-0"
          >
            <span>Thẩm định ngay ({data.pendingCount} chờ)</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto rounded-xl border border-Mist/20">
          <table className="w-full text-xs text-left min-w-[540px]">
            <thead className="bg-Snowflake text-Pine font-black uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3">Mức độ rủi ro</th>
                <th className="px-4 py-3 text-center">Chờ thẩm định</th>
                <th className="px-4 py-3 text-center">Đã xác nhận</th>
                <th className="px-4 py-3 text-center">Đã bác bỏ</th>
                <th className="px-4 py-3 text-right">Tổng cộng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-Mist/15 font-medium text-Branch">
              <tr className="hover:bg-Snowflake/40">
                <td className="px-4 py-3 font-bold text-Berry flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-Berry flex-shrink-0" />
                  Mức 1 · High (Nghiêm trọng)
                </td>
                <td className="px-4 py-3 text-center font-mono font-bold text-Berry">
                  {findingsByRisk.High.pending}
                </td>
                <td className="px-4 py-3 text-center font-mono text-emerald-700 font-bold">
                  {findingsByRisk.High.approved}
                </td>
                <td className="px-4 py-3 text-center font-mono text-Mist">
                  {findingsByRisk.High.rejected}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-Pine">
                  {findingsByRisk.High.pending + findingsByRisk.High.approved + findingsByRisk.High.rejected}
                </td>
              </tr>
              <tr className="hover:bg-Snowflake/40">
                <td className="px-4 py-3 font-bold text-amber-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  Mức 2 · Medium (Trung bình)
                </td>
                <td className="px-4 py-3 text-center font-mono text-amber-700">
                  {findingsByRisk.Medium.pending}
                </td>
                <td className="px-4 py-3 text-center font-mono text-emerald-700 font-bold">
                  {findingsByRisk.Medium.approved}
                </td>
                <td className="px-4 py-3 text-center font-mono text-Mist">
                  {findingsByRisk.Medium.rejected}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-Pine">
                  {findingsByRisk.Medium.pending + findingsByRisk.Medium.approved + findingsByRisk.Medium.rejected}
                </td>
              </tr>
              <tr className="hover:bg-Snowflake/40">
                <td className="px-4 py-3 font-bold text-slate-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                  Mức 3 · Low (Thấp / Khuyến nghị)
                </td>
                <td className="px-4 py-3 text-center font-mono text-slate-600">
                  {findingsByRisk.Low.pending}
                </td>
                <td className="px-4 py-3 text-center font-mono text-emerald-700 font-bold">
                  {findingsByRisk.Low.approved}
                </td>
                <td className="px-4 py-3 text-center font-mono text-Mist">
                  {findingsByRisk.Low.rejected}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-Pine">
                  {findingsByRisk.Low.pending + findingsByRisk.Low.approved + findingsByRisk.Low.rejected}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Callout Minh bạch Liêm chính Số liệu Khoa học ────────────────── */}
      <div className="p-3.5 rounded-xl border border-Pine/20 bg-Pine/5 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-Pine flex-shrink-0 mt-0.5" />
        <div className="text-xs text-Pine leading-relaxed space-y-1">
          <p className="font-bold">
            Quy chuẩn liêm chính khoa học & Không tự gán ghép các chỉ số Precision / Recall / F1 giả lập:
          </p>
          <p className="text-Branch/85 text-[11px]">
            Hệ thống ANHQUY cam kết không công bố các chỉ số học thuật như Precision, Recall hay F1 khi chưa có tập dữ liệu chuẩn (Ground Truth) được gắn nhãn độc lập bởi hội đồng chuyên gia pháp lý. Mọi tỷ lệ xác nhận và bác bỏ trên bảng điều khiển đều phản ánh chính xác 100% dữ liệu thẩm định thực tế trong hệ thống.
          </p>
        </div>
      </div>
    </div>
  )
}
