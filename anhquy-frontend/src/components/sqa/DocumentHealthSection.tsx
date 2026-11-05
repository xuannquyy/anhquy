import React from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2, AlertOctagon,
  Clock, Zap, ExternalLink, ChevronLeft, ChevronRight
} from 'lucide-react'

export interface DocumentHealthData {
  period: { from: string; to: string }
  summary: {
    totalDocuments: number
    analyzedCount: number
    errorCount: number
    analyzingCount: number
    uploadedCount: number
    eligibleAttempts: number
    successRate: number | null
    failureRate: number | null
    stuckCount: number
  }
  performance: {
    sampleCount: number
    averageDurationMs: number | null
    p50DurationMs: number | null
    p95DurationMs: number | null
    tokens: {
      totalInputTokens: number
      totalOutputTokens: number
      totalTokens: number
    }
  }
  errorBreakdown: Record<string, number>
  failedDocuments: {
    items: Array<{
      id: number
      fileName: string
      supplierName: string
      supplierCode: string
      lastErrorCode: string
      lastErrorMessage: string
      updatedAt: string | null
      status: string
    }>
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }
}

interface DocumentHealthSectionProps {
  data: DocumentHealthData | null
  loading: boolean
  onPageChange: (newPage: number) => void
}

export const DocumentHealthSection: React.FC<DocumentHealthSectionProps> = ({
  data,
  loading,
  onPageChange,
}) => {
  if (loading || !data) {
    return (
      <div className="bg-white rounded-2xl border border-Mist/30 p-6 shadow-sm flex items-center justify-center min-h-[160px]">
        <span className="text-xs font-semibold text-Mist">Đang tải dữ liệu sức khỏe xử lý hợp đồng...</span>
      </div>
    )
  }

  const { summary, performance, errorBreakdown, failedDocuments } = data

  const errorLabels: Record<string, { label: string; desc: string }> = {
    PDF_EXTRACTION_ERROR: { label: 'Lỗi trích xuất PDF / OCR', desc: 'Tệp hỏng, bị khóa mật khẩu hoặc không có lớp văn bản' },
    RAG_RETRIEVAL_ERROR: { label: 'Lỗi truy xuất RAG Embedding', desc: 'Không thể trích xuất đoạn ngữ cảnh điều khoản phù hợp' },
    GEMINI_AUTH_ERROR: { label: 'Lỗi xác thực Gemini API Key', desc: 'Khóa API không hợp lệ hoặc hết hạn' },
    GEMINI_QUOTA_ERROR: { label: 'Vượt hạn mức Quota / Tần suất gọi', desc: 'Mã lỗi 429 từ Google Gemini API' },
    GEMINI_TIMEOUT: { label: 'Quá thời gian phản hồi (Timeout)', desc: 'Thời gian chờ phản hồi mô hình AI vượt giới hạn' },
    GEMINI_RESPONSE_ERROR: { label: 'Phản hồi JSON không đúng cấu trúc', desc: 'AI không tuân thủ định dạng kết quả yêu cầu' },
    DATABASE_ERROR: { label: 'Lỗi cơ sở dữ liệu hệ thống', desc: 'Không thể ghi nhận dữ liệu vào SQL Server' },
    UNKNOWN_ERROR: { label: 'Lỗi hệ thống khác', desc: 'Ngoại lệ chưa phân loại' },
  }

  const formatMs = (ms: number | null) => {
    if (ms === null || ms === undefined || ms <= 0) return '—'
    return `${(ms / 1000).toFixed(1)}s (${ms.toLocaleString()} ms)`
  }

  return (
    <div className="bg-white rounded-2xl border border-Mist/30 p-4 sm:p-5 shadow-sm space-y-5">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-Mist/15 pb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-Pine font-sans flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-Pine" />
            Sức khỏe xử lý hợp đồng
          </h2>
          <p className="text-xs text-Branch/80 mt-0.5 font-medium leading-relaxed">
            Tổng hợp trạng thái xử lý hồ sơ hợp đồng, thời gian phân tích và theo dõi mức độ tiêu thụ tài nguyên AI.
          </p>
        </div>

        {summary.stuckCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 animate-pulse flex-shrink-0">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
            {summary.stuckCount} hợp đồng bị treo (&gt; 15 phút)
          </span>
        )}
      </div>

      {/* ─── 5 Trạng thái Tài liệu ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl border border-Mist/25 bg-Snowflake/40">
          <p className="text-[11px] font-bold uppercase tracking-wider text-Mist">Tổng hợp đồng</p>
          <p className="text-xl sm:text-2xl font-black text-Pine font-mono mt-1">{summary.totalDocuments}</p>
        </div>
        <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Đã phân tích</p>
          <p className="text-xl sm:text-2xl font-black text-emerald-700 font-mono mt-1">{summary.analyzedCount}</p>
        </div>
        <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/50">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800">Phân tích thất bại</p>
          <p className="text-xl sm:text-2xl font-black text-rose-700 font-mono mt-1">{summary.errorCount}</p>
        </div>
        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Đang phân tích</p>
          <p className="text-xl sm:text-2xl font-black text-amber-700 font-mono mt-1">{summary.analyzingCount}</p>
        </div>
        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 col-span-2 sm:col-span-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Chờ xử lý (Mới tải)</p>
          <p className="text-xl sm:text-2xl font-black text-slate-800 font-mono mt-1">{summary.uploadedCount}</p>
        </div>
      </div>

      {/* ─── Thời gian xử lý & Tiêu thụ Token ───────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Thời gian xử lý hợp đồng */}
        <div className="p-4 rounded-xl border border-Mist/25 bg-Snowflake/30 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-Pine font-mono flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-Pine" />
            Thời gian xử lý hợp đồng thực tế (Latency)
          </h3>
          {performance.sampleCount > 0 ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-white rounded-lg border border-Mist/20 shadow-xs">
                <p className="text-[10px] font-bold text-Mist uppercase">Trung bình</p>
                <p className="text-xs font-black text-Pine font-mono mt-1">{formatMs(performance.averageDurationMs)}</p>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-Mist/20 shadow-xs">
                <p className="text-[10px] font-bold text-Mist uppercase">P50 (Trung vị)</p>
                <p className="text-xs font-black text-Pine font-mono mt-1">{formatMs(performance.p50DurationMs)}</p>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-Mist/20 shadow-xs">
                <p className="text-[10px] font-bold text-Mist uppercase">P95 (Đỉnh cao)</p>
                <p className="text-xs font-black text-Berry font-mono mt-1">{formatMs(performance.p95DurationMs)}</p>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center rounded-lg bg-white border border-Mist/20 text-xs text-Mist">
              Chưa có dữ liệu đo thời gian thực tế trong khoảng thời gian này
            </div>
          )}
          <p className="text-[10px] text-Mist italic">
            * Dữ liệu ghi nhận từ nhật ký phân tích AI ({performance.sampleCount} lượt chạy thành công).
          </p>
        </div>

        {/* Tiêu thụ Token Gemini thực tế */}
        <div className="p-4 rounded-xl border border-Mist/25 bg-Snowflake/30 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-Pine font-mono flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-600" />
            Mức độ tiêu thụ Token Gemini (Usage Metadata)
          </h3>
          {performance.tokens.totalTokens > 0 ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-white rounded-lg border border-Mist/20 shadow-xs">
                <p className="text-[10px] font-bold text-Mist uppercase">Prompt Input</p>
                <p className="text-xs font-black text-Pine font-mono mt-1">
                  {performance.tokens.totalInputTokens.toLocaleString()}
                </p>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-Mist/20 shadow-xs">
                <p className="text-[10px] font-bold text-Mist uppercase">Output</p>
                <p className="text-xs font-black text-Pine font-mono mt-1">
                  {performance.tokens.totalOutputTokens.toLocaleString()}
                </p>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-Mist/20 shadow-xs">
                <p className="text-[10px] font-bold text-Mist uppercase">Tổng Token</p>
                <p className="text-xs font-black text-Pine font-mono mt-1">
                  {performance.tokens.totalTokens.toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center rounded-lg bg-white border border-Mist/20 text-xs text-Mist">
              Chưa có dữ liệu usageMetadata từ Gemini API trong kỳ
            </div>
          )}
          <p className="text-[10px] text-Mist italic">
            * Chỉ ghi nhận số lượng token thực tế do Google Gemini API trả về, không ước tính chi phí giả định.
          </p>
        </div>
      </div>

      {/* ─── Bảng Phân loại Mã Lỗi ─────────────────────────────────────────── */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-Pine font-mono">
          Phân loại mã lỗi phát sinh trong quá trình quét
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {Object.entries(errorBreakdown).map(([code, count]) => {
            const info = errorLabels[code] || { label: code, desc: 'Lỗi hệ thống' }
            return (
              <div
                key={code}
                className={`p-3 rounded-xl border transition-all ${
                  count > 0 ? 'bg-rose-50/50 border-rose-200' : 'bg-white border-Mist/20 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[10px] font-bold text-Pine truncate" title={code}>
                    {code}
                  </span>
                  <span className={`text-xs font-black font-mono px-2 py-0.5 rounded flex-shrink-0 ${
                    count > 0 ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {count}
                  </span>
                </div>
                <p className="text-xs font-bold text-Pine mt-1 line-clamp-1">{info.label}</p>
                <p className="text-[10px] text-Mist mt-0.5 line-clamp-1">{info.desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── Danh sách Hợp đồng gặp lỗi phân tích ───────────────────────────── */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-Pine font-mono">
            Danh sách hợp đồng gặp lỗi phân tích ({failedDocuments.pagination.total} tài liệu)
          </h3>
          <Link
            to="/documents?status=Error"
            className="text-xs font-bold text-Berry hover:text-Pine inline-flex items-center gap-1 transition-colors flex-shrink-0"
          >
            <span>Mở kho hợp đồng lỗi</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        {failedDocuments.items.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/20">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
            <p className="text-xs font-bold text-Pine">Không có hợp đồng nào gặp sự cố lỗi trong khoảng thời gian này</p>
            <p className="text-[11px] text-Mist mt-0.5">Tất cả tài liệu đều được phân tích thành công hoặc đang ở trạng thái an toàn.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-Mist/20">
            <table className="w-full text-xs text-left min-w-[600px]">
              <thead className="bg-Snowflake text-Pine font-black uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3">Hợp đồng</th>
                  <th className="px-4 py-3">Nhà cung ứng</th>
                  <th className="px-4 py-3">Mã lỗi</th>
                  <th className="px-4 py-3">Chi tiết lỗi</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-Mist/15 font-medium text-Branch">
                {failedDocuments.items.map((doc) => (
                  <tr key={doc.id} className="hover:bg-Snowflake/40">
                    <td className="px-4 py-3">
                      <span className="font-bold text-Pine block truncate max-w-xs">{doc.fileName}</span>
                      <span className="text-[10px] text-Mist font-mono">ID: #{doc.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-Branch block truncate max-w-[180px]">{doc.supplierName}</span>
                      <span className="text-[10px] text-Mist font-mono block">{doc.supplierCode}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                        {doc.lastErrorCode}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-[11px]" title={doc.lastErrorMessage}>
                      {doc.lastErrorMessage}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/audit/${doc.id}`}
                        className="text-xs font-bold text-Pine hover:text-Berry inline-flex items-center gap-1"
                      >
                        <span>Chi tiết</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Phân trang danh sách lỗi */}
        {failedDocuments.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-Mist">
              Trang {failedDocuments.pagination.page} / {failedDocuments.pagination.totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onPageChange(failedDocuments.pagination.page - 1)}
                disabled={failedDocuments.pagination.page <= 1}
                className="p-1.5 rounded-lg border border-Mist/30 hover:bg-Snowflake disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onPageChange(failedDocuments.pagination.page + 1)}
                disabled={failedDocuments.pagination.page >= failedDocuments.pagination.totalPages}
                className="p-1.5 rounded-lg border border-Mist/30 hover:bg-Snowflake disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
