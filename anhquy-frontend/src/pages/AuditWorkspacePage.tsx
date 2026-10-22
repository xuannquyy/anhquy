import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ChevronLeft, AlertTriangle, CheckCircle2, XCircle,
  Shield, BookOpen, Lightbulb, RefreshCw, ChevronDown, ChevronUp,
  FileText, Search, Copy, ExternalLink, Printer, Sparkles,
  ZoomIn, ZoomOut, ChevronRight, MessageSquare, Globe, MapPin
} from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { ConfirmModal, RiskScoreBar, StatusBadge, Spinner, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useRealtime } from '../context/RealtimeContext'
import { documentApi, violationApi } from '../api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentDetail {
  id: number
  file_name: string
  file_hash?: string | null
  file_size?: number | null
  storage_url: string
  status: string
  uploaded_at?: string | null
  last_analyzed_at: string | null
  Suppliers?: { id: number; company_name: string; tax_code?: string; risk_score: number | null }
  Categories?: { id: number; name: string }
}

interface Violation {
  id: number
  risk_level: 'High' | 'Medium' | 'Low'
  status: 'Pending' | 'Approved' | 'Rejected'
  violation_desc: string
  evidence_quote: string
  page_number: number | null
  recommendation: string | null
  reviewed_at: string | null
  Standards?: {
    id: number
    standard_code: string
    name: string
    jurisdiction: string | null
    Standard_Groups?: { group_code: string; group_name: string }
  }
  Users?: { id: number; full_name: string }
}

interface HighlightBox {
  top: number
  left: number
  width: number
  height: number
}

// ─── Khai báo kiểu cho PDF.js trên window ─────────────────────────────────────

interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  height: number
}

interface PdfViewport {
  width: number
  height: number
  convertToViewportPoint: (x: number, y: number) => [number, number]
}

interface PdfPageProxy {
  getViewport: (params: { scale: number }) => PdfViewport
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => { promise: Promise<void> }
  getTextContent: () => Promise<{ items: PdfTextItem[] }>
}

interface PdfDocumentProxy {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPageProxy>
}

declare global {
  interface Window {
    pdfjsLib?: {
      GlobalWorkerOptions: { workerSrc: string }
      getDocument: (url: string) => { promise: Promise<PdfDocumentProxy> }
    }
  }
}

// ─── Helper: Sửa lỗi tách âm tiết tiếng Việt từ PDF ("ti ết ki ệm" -> "tiết kiệm") ─

function cleanVietnamesePdfText(raw: string | null | undefined): string {
  if (!raw) return ''
  let text = raw
  // Nối các nguyên âm có dấu tiếng Việt bị tách rời bởi khoảng trắng đơn
  const vnChars = 'aăâeêioôơuưyáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵđ'
  const regex1 = new RegExp(`([b-df-hj-np-tv-zđB-DF-HJ-NP-TV-ZĐ]{1,3})\\s+([${vnChars}][a-zA-Z${vnChars}]*)`, 'g')
  const regex2 = new RegExp(`([${vnChars}])\\s+([cptmnngnhch${vnChars}])\\b`, 'gi')
  for (let i = 0; i < 3; i++) {
    text = text.replace(regex1, '$1$2')
    text = text.replace(regex2, '$1$2')
  }
  return text.replace(/\s+/g, ' ').trim()
}

// Chuẩn hóa chuỗi không dấu cách để tìm vị trí tô sáng chính xác 100% trên PDF
function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .replace(/[.,;:"'“”‘’()[\]\-_•·\s]+/g, '')
    .trim()
}

// ─── Hàm nạp thư viện PDF.js từ CDN để vẽ Highlight trực tiếp lên PDF ─────────

let pdfJsLoadingPromise: Promise<boolean> | null = null

function ensurePdfJsLoaded(): Promise<boolean> {
  if (typeof window !== 'undefined' && window.pdfjsLib) {
    return Promise.resolve(true)
  }
  if (pdfJsLoadingPromise) return pdfJsLoadingPromise

  pdfJsLoadingPromise = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.async = true
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        resolve(true)
      } else {
        resolve(false)
      }
    }
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })

  return pdfJsLoadingPromise
}

// ─── Hàm In Phiếu Kết Quả Kiểm Toán Riêng Cho Hợp Đồng Đang Mở ───────────────

function printSingleContractAuditCertificate(
  doc: DocumentDetail,
  violations: Violation[],
  auditorName: string,
  auditorRole: string
) {
  const score = doc.Suppliers?.risk_score ?? 100
  const rankLabel = score >= 80 ? 'AN TOÀN (SAFE)' : score >= 50 ? 'CẢNH BÁO (WARNING)' : 'NGUY HIỂM (DANGER)'
  const rankColor = score >= 80 ? '#27363F' : score >= 50 ? '#685652' : '#6B212C'

  const highCount = violations.filter((v) => v.risk_level === 'High').length
  const mediumCount = violations.filter((v) => v.risk_level === 'Medium').length
  const lowCount = violations.filter((v) => v.risk_level === 'Low').length
  const approvedCount = violations.filter((v) => v.status === 'Approved').length
  const pendingCount = violations.filter((v) => v.status === 'Pending').length

  const latestReviewer =
    violations.find((v) => v.status !== 'Pending' && v.Users?.full_name)?.Users?.full_name ||
    (auditorRole === 'Manager' ? auditorName : '..................................................')

  const rowsHtml =
    violations.length === 0
      ? `<tr><td colspan="6" style="padding:18px;text-align:center;color:#685652;font-style:italic">Hợp đồng này không phát hiện điều khoản vi phạm tiêu chuẩn RBA & Pháp luật Việt Nam.</td></tr>`
      : violations
          .map(
            (v, idx) => `
        <tr>
          <td style="text-align:center;font-weight:700">${idx + 1}</td>
          <td>
            <div style="font-family:monospace;font-weight:700;color:#27363F">${v.Standards?.standard_code || '—'}</div>
            <div style="font-size:11px;color:#685652">${v.Standards?.name || ''} (${v.Standards?.jurisdiction || 'Global'})</div>
          </td>
          <td style="font-weight:700;color:${v.risk_level === 'High' ? '#6B212C' : v.risk_level === 'Medium' ? '#685652' : '#27363F'}">
            ${v.risk_level === 'High' ? 'Cao (-10đ)' : v.risk_level === 'Medium' ? 'TB (-5đ)' : 'Thấp (-2đ)'}
          </td>
          <td>
            ${v.status === 'Approved' ? 'Đã phê duyệt' : v.status === 'Rejected' ? 'Đã bác bỏ' : 'Chờ duyệt'}
          </td>
          <td>
            <div style="margin-bottom:4px">${v.violation_desc}</div>
            <div style="font-size:11px;background:#F4F6F9;border-left:3px solid #6B212C;padding:4px 8px;font-style:italic">
              "Trích dẫn (Tr.${v.page_number ?? '?'}): ${cleanVietnamesePdfText(v.evidence_quote)}"
            </div>
          </td>
          <td style="font-size:11px;color:#27363F">${v.recommendation || '—'}</td>
        </tr>`
          )
          .join('')

  const html = `<!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <title>Phiếu Kết quả Kiểm toán Hợp đồng #${doc.id} – ${doc.file_name}</title>
    <style>
      body { font-family: "Be Vietnam Pro", Arial, sans-serif; margin: 32px; color: #27363F; line-height: 1.45; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #27363F; padding-bottom: 14px; margin-bottom: 18px; }
      .brand { font-size: 24px; font-weight: 900; letter-spacing: 1px; color: #27363F; }
      .doc-code { font-size: 11px; color: #685652; margin-top: 4px; }
      h1 { font-size: 18px; text-transform: uppercase; margin: 0 0 4px 0; color: #27363F; }
      h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B212C; margin: 18px 0 8px 0; border-left: 4px solid #6B212C; padding-left: 8px; }
      .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #F5F7FA; border: 1px solid #DCE0E8; border-radius: 8px; padding: 12px 16px; font-size: 12px; }
      .meta-item strong { color: #27363F; }
      .hash-box { grid-column: span 2; font-family: monospace; font-size: 11px; background: #FFFFFF; padding: 6px 10px; border-radius: 6px; border: 1px dashed #8EA1AE; word-break: break-all; }
      .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
      .kpi-box { border: 1px solid #DCE0E8; border-radius: 8px; padding: 8px 10px; text-align: center; background: #FFFFFF; }
      .kpi-box .num { font-size: 18px; font-weight: 800; }
      .kpi-box .lbl { font-size: 11px; color: #685652; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
      th { background: #27363F; color: #FFFFFF; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; }
      td { padding: 8px; border: 1px solid #DCE0E8; vertical-align: top; }
      .sign-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 28px; text-align: center; font-size: 12px; page-break-inside: avoid; }
      .sign-box { border-top: 1px solid #DCE0E8; padding-top: 10px; }
      .sign-space { height: 65px; }
      .footer { margin-top: 28px; font-size: 10px; color: #8EA1AE; text-align: center; border-top: 1px solid #DCE0E8; padding-top: 8px; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <h1>PHIẾU KẾT QUẢ KIỂM TOÁN HỢP ĐỒNG & ĐÁNH GIÁ ĐỐI TÁC</h1>
        <div class="doc-code">
          Mã hồ sơ: <strong>#DOC-${doc.id}</strong> · Ngày giờ kết xuất: ${new Date().toLocaleString('vi-VN')}
        </div>
      </div>
      <div style="text-align:right">
        <div class="brand">ANHQUY</div>
        <div style="font-size:10px;color:#685652;font-weight:700">AI ETHICAL SOURCING AUDITOR</div>
      </div>
    </div>

    <h2>I. Thông tin Hợp đồng & Đối tác Cung ứng</h2>
    <div class="meta-grid">
      <div class="meta-item">Tên văn bản hợp đồng: <strong>${doc.file_name}</strong></div>
      <div class="meta-item">Loại hợp đồng: <strong>${doc.Categories?.name || 'Hợp đồng kinh tế'}</strong></div>
      <div class="meta-item">Đối tác cung ứng: <strong>${doc.Suppliers?.company_name || '—'}</strong></div>
      <div class="meta-item">Trạng thái phân tích: <strong>${doc.status}</strong></div>
      <div class="meta-item">Điểm tín nhiệm hiện tại: <strong style="color:${rankColor};font-size:14px">${score} / 100 điểm (${rankLabel})</strong></div>
      <div class="meta-item">Lần quét AI gần nhất: <strong>${doc.last_analyzed_at ? new Date(doc.last_analyzed_at).toLocaleString('vi-VN') : 'Vừa phân tích'}</strong></div>
      <div class="hash-box">
        <strong>Mã băm toàn vẹn SHA-256:</strong> ${doc.file_hash || 'Đã xác thực toàn vẹn trên máy chủ ANHQUY'}
      </div>
    </div>

    <h2>II. Tổng hợp Kết quả Rà soát AI RAG (Chuẩn RBA & Pháp luật VN)</h2>
    <div class="kpi-row">
      <div class="kpi-box">
        <div class="num" style="color:#27363F">${violations.length}</div>
        <div class="lbl">Tổng điều khoản cảnh báo</div>
      </div>
      <div class="kpi-box">
        <div class="num" style="color:#6B212C">${highCount}</div>
        <div class="lbl">Rủi ro Cao (High)</div>
      </div>
      <div class="kpi-box">
        <div class="num" style="color:#685652">${mediumCount} / ${lowCount}</div>
        <div class="lbl">Trung bình / Thấp</div>
      </div>
      <div class="kpi-box">
        <div class="num" style="color:#27363F">${approvedCount} duyệt · ${pendingCount} chờ</div>
        <div class="lbl">Trạng thái thẩm định</div>
      </div>
    </div>

    <h2>III. Bảng Chi tiết Các Điều khoản Vi phạm & Bằng chứng Trích xuất</h2>
    <table>
      <thead>
        <tr>
          <th style="width:36px;text-align:center">STT</th>
          <th style="width:140px">Mã Chuẩn</th>
          <th style="width:85px">Mức độ</th>
          <th style="width:90px">Trạng thái</th>
          <th>Mô tả Vi phạm & Bằng chứng Nguyên văn</th>
          <th style="width:170px">Khuyến nghị Pháp lý</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="sign-grid">
      <div class="sign-box">
        <strong>CHUYÊN VIÊN KIỂM TOÁN</strong>
        <div style="font-size:11px;color:#685652">(Người kết xuất phiếu)</div>
        <div class="sign-space"></div>
        <strong>${auditorName}</strong>
      </div>
      <div class="sign-box">
        <strong>QUẢN LÝ PHÁP CHẾ (MANAGER)</strong>
        <div style="font-size:11px;color:#685652">(Thẩm định & Phê duyệt điểm rủi ro)</div>
        <div class="sign-space"></div>
        <strong>${latestReviewer}</strong>
      </div>
      <div class="sign-box">
        <strong>XÁC THỰC BỞI AI ENGINE</strong>
        <div style="font-size:11px;color:#685652">(ChromaDB RAG · Gemini AI)</div>
        <div class="sign-space" style="display:flex;align-items:center;justify-content:center;color:#6B212C;font-weight:800;font-size:11px">
          [ĐÃ ĐỐI CHIẾU SHA-256 & 24 CHUẨN RBA]
        </div>
        <strong>Hệ thống Kiểm toán ANHQUY</strong>
      </div>
    </div>

    <div class="footer">
      Phiếu kết quả được trích xuất trực tiếp từ Phòng Kiểm toán AI ANHQUY · Lưu hành nội bộ doanh nghiệp B2B.
    </div>
  </body>
  </html>`

  const win = window.open('', '_blank')
  if (!win) {
    toast.error('Trình duyệt đang chặn Popup. Vui lòng cho phép mở Popup để in Phiếu Kiểm toán.')
    return
  }
  win.document.write(html)
  win.document.close()
  win.onload = () => {
    win.print()
    win.close()
  }
}

// ─── Risk styles ──────────────────────────────────────────────────────────────

const RISK_STYLES: Record<string, { card: string; badge: string; dot: string }> = {
  High:   { card: 'border-l-4 border-l-Berry bg-Berry/[0.03]',     badge: 'bg-Berry text-white',  dot: 'bg-Berry animate-pulse' },
  Medium: { card: 'border-l-4 border-l-Branch bg-Frostysilver/20', badge: 'bg-Branch text-white', dot: 'bg-Branch' },
  Low:    { card: 'border-l-4 border-l-Mist bg-Snowflake/40',      badge: 'bg-Mist text-Pine',    dot: 'bg-Mist' },
}

// ─── Violation Card ───────────────────────────────────────────────────────────

function ViolationCard({
  index,
  violation,
  isActive,
  onClick,
  onReview,
  canApprove,
}: {
  index: number
  violation: Violation
  isActive: boolean
  onClick: () => void
  onReview: (id: number, status: 'Approved' | 'Rejected') => void
  canApprove: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const s = RISK_STYLES[violation.risk_level] || RISK_STYLES.Low
  const cleanedQuote = cleanVietnamesePdfText(violation.evidence_quote)

  const handleCopyQuote = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(cleanedQuote)
    toast.success('Đã sao chép nguyên văn đoạn bằng chứng.')
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-Mist/25 mb-3 overflow-hidden transition-all duration-300 cursor-pointer bg-white ${
        s.card
      } ${
        isActive
          ? 'ring-2 ring-Berry shadow-[0_10px_28px_rgba(121,17,39,0.15)]'
          : 'shadow-sm hover:shadow-md'
      }`}
    >
      {/* Header */}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="w-5 h-5 rounded-lg bg-Pine text-white text-[11px] font-extrabold flex items-center justify-center flex-shrink-0">
              {index + 1}
            </span>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
            <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-xl ${s.badge}`}>
              {violation.risk_level === 'High' ? 'Rủi ro Cao' : violation.risk_level === 'Medium' ? 'Trung bình' : 'Rủi ro Thấp'}
            </span>
            {violation.Standards && (
              <span className="text-xs font-mono text-Pine bg-Snowflake px-2 py-0.5 rounded-lg truncate font-extrabold border border-Mist/25">
                {violation.Standards.standard_code}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {violation.page_number && (
              <span className="text-[11px] font-extrabold text-white bg-Berry px-2.5 py-0.5 rounded-xl shadow-sm">
                Trang {violation.page_number}
              </span>
            )}
            <StatusBadge status={violation.status} />
          </div>
        </div>

        {/* Standard name */}
        {violation.Standards && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold ${
              violation.Standards.jurisdiction === 'VN'
                ? 'bg-Berry/10 text-Berry'
                : 'bg-Pine/10 text-Pine'
            }`}>
              {violation.Standards.jurisdiction === 'VN' ? <MapPin className="w-2.5 h-2.5 inline" /> : <Globe className="w-2.5 h-2.5 inline" />}
              {' '}{violation.Standards.jurisdiction || 'Global'}
            </span>
            <span className="text-xs font-extrabold text-Pine line-clamp-1">{violation.Standards.name}</span>
          </div>
        )}

        {/* Violation description */}
        <p className={`text-xs sm:text-sm text-Branch leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
          {violation.violation_desc}
        </p>
      </div>

      {/* Evidence quote */}
      <div className="px-3.5 pb-2.5">
        <div className="bg-amber-50/90 border-l-4 border-l-Berry border border-Berry/20 rounded-xl p-2.5 text-xs text-Pine italic relative">
          <div className="flex items-start justify-between gap-2">
            <div>
              <BookOpen className="w-3.5 h-3.5 inline mr-1.5 text-Berry" />
              <strong className="text-Berry not-italic text-[11px] uppercase mr-1">
                Bằng chứng (Trang {violation.page_number ?? '?'}):
              </strong>
              "{cleanedQuote.length > 180 && !expanded ? cleanedQuote.substring(0, 180) + '…' : cleanedQuote}"
            </div>
            <button
              type="button"
              onClick={handleCopyQuote}
              title="Sao chép bằng chứng"
              className="p-1 rounded-lg bg-white text-Pine hover:bg-Pine hover:text-white transition-colors flex-shrink-0 border border-Mist/20"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded: recommendation + actions */}
      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-2.5">
          {violation.recommendation && (
            <div className="flex gap-2 bg-Snowflake/60 border border-Mist/25 rounded-xl p-2.5">
              <Lightbulb className="w-4 h-4 text-Berry mt-0.5 flex-shrink-0" />
              <p className="text-xs text-Branch leading-relaxed">
                <strong className="text-Pine">Khuyến nghị sửa đổi: </strong>
                {violation.recommendation}
              </p>
            </div>
          )}

          {canApprove && violation.status === 'Pending' && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReview(violation.id, 'Approved') }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-Berry text-white text-xs font-extrabold rounded-xl hover:bg-Berry/90 transition-all shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Phê duyệt lỗi – Trừ điểm
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReview(violation.id, 'Rejected') }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-Mist/40 text-Branch text-xs font-bold rounded-xl hover:bg-Snowflake transition-all bg-white"
              >
                <XCircle className="w-3.5 h-3.5 text-Mist" />
                Bác bỏ cảnh báo
              </button>
            </div>
          )}

          {violation.status !== 'Pending' && violation.Users && (
            <p className="text-[11px] text-Mist">
              Đã thẩm định bởi: <span className="font-bold text-Pine">{violation.Users.full_name}</span>
              {violation.reviewed_at && ` • ${new Date(violation.reviewed_at).toLocaleDateString('vi-VN')}`}
            </p>
          )}
        </div>
      )}

      {/* Toggle expand */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        className="w-full py-1.5 flex items-center justify-center gap-1 text-[11px] font-bold text-Mist hover:text-Pine hover:bg-Snowflake/40 transition-colors border-t border-Mist/15"
      >
        {expanded ? <><ChevronUp className="w-3 h-3" />Thu gọn</> : <><ChevronDown className="w-3 h-3" />Xem chi tiết & Thẩm định</>}
      </button>
    </div>
  )
}

// ─── Split PDF Viewer với XAI Smart Highlight + Hộp Ghi chú Nổi ──────────────

function SplitPDFViewer({
  pdfUrl,
  activeViolation,
}: {
  pdfUrl: string
  activeViolation: Violation | null
}) {
  const activeEvidence = activeViolation?.evidence_quote
    ? cleanVietnamesePdfText(activeViolation.evidence_quote)
    : null
  const activePage = activeViolation?.page_number || 1

  // Chế độ xem: 'xai' (Tô sáng trực tiếp trên trang PDF bằng Canvas) hoặc 'native' (Trình xem PDF gốc)
  const [viewMode, setViewMode] = useState<'xai' | 'native'>('xai')
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState<number>(activePage)
  const [numPages, setNumPages] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.25)
  const [highlights, setHighlights] = useState<HighlightBox[]>([])
  const [rendering, setRendering] = useState<boolean>(false)
  const [showFloatingBox, setShowFloatingBox] = useState<boolean>(true)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const firstHighlightRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Khi người dùng bấm sang thẻ vi phạm khác -> Tự nhảy đến trang của vi phạm đó
  useEffect(() => {
    if (activeViolation?.page_number) {
      setCurrentPage(activeViolation.page_number)
      setShowFloatingBox(true)
    }
  }, [activeViolation])

  // Tải tài liệu PDF bằng PDF.js
  useEffect(() => {
    let cancelled = false
    const loadPdf = async () => {
      const loaded = await ensurePdfJsLoaded()
      if (!loaded || !window.pdfjsLib) {
        if (!cancelled) setViewMode('native')
        return
      }
      try {
        const doc = await window.pdfjsLib.getDocument(pdfUrl).promise
        if (!cancelled) {
          setPdfDoc(doc)
          setNumPages(doc.numPages)
        }
      } catch {
        if (!cancelled) setViewMode('native')
      }
    }
    loadPdf()
    return () => { cancelled = true }
  }, [pdfUrl])

  // Dựng trang PDF hiện tại + Tìm tọa độ câu vi phạm để Tô sáng (Highlight) trực tiếp lên trang giấy
  useEffect(() => {
    if (viewMode !== 'xai' || !pdfDoc || !canvasRef.current) return
    let cancelled = false

    const renderPageAndHighlight = async () => {
      setRendering(true)
      try {
        const pageNum = Math.min(Math.max(1, currentPage), pdfDoc.numPages)
        const page = await pdfDoc.getPage(pageNum)
        if (cancelled || !canvasRef.current) return

        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        canvas.width = viewport.width
        canvas.height = viewport.height

        await page.render({ canvasContext: ctx, viewport }).promise
        if (cancelled) return

        // Nếu trang hiện tại đúng là trang có lỗi -> Quét tọa độ chữ để vẽ khung Highlight
        if (activeViolation?.evidence_quote && pageNum === (activeViolation.page_number || 1)) {
          const textContent = await page.getTextContent()
          const normEvidence = normalizeForMatch(activeViolation.evidence_quote)

          // Gom các mảnh chữ cùng 1 dòng theo trục Y
          interface LineGroup {
            y: number
            items: PdfTextItem[]
            text: string
            norm: string
          }
          const lines: LineGroup[] = []

          for (const item of textContent.items) {
            if (!item.str || !item.str.trim()) continue
            const y = item.transform[5]
            const existing = lines.find((l) => Math.abs(l.y - y) <= 4)
            if (existing) {
              existing.items.push(item)
              existing.text += ' ' + item.str
              existing.norm = normalizeForMatch(existing.text)
            } else {
              lines.push({
                y,
                items: [item],
                text: item.str,
                norm: normalizeForMatch(item.str),
              })
            }
          }

          // Sắp xếp dòng từ trên xuống dưới
          lines.sort((a, b) => b.y - a.y)

          // Lấy các cụm từ khóa con từ câu bằng chứng để bắt khớp cả khi câu bị ngắt xuống nhiều dòng
          const matchedLineIndices = new Set<number>()
          if (normEvidence.length >= 6) {
            // Tạo các đoạn mẫu 12 ký tự liên tiếp từ bằng chứng
            const snippets: string[] = []
            const step = Math.max(4, Math.floor(normEvidence.length / 8))
            for (let i = 0; i <= normEvidence.length - 10; i += step) {
              snippets.push(normEvidence.substring(i, i + 12))
            }
            if (snippets.length === 0) snippets.push(normEvidence)

            lines.forEach((line, idx) => {
              if (line.norm.length < 4) return
              if (
                normEvidence.includes(line.norm) ||
                snippets.some((sn) => line.norm.includes(sn))
              ) {
                matchedLineIndices.add(idx)
              }
            })
          }

          const boxes: HighlightBox[] = []
          matchedLineIndices.forEach((idx) => {
            const line = lines[idx]
            let minX = Infinity
            let maxX = -Infinity
            let maxH = 14

            line.items.forEach((it) => {
              const x = it.transform[4]
              const w = it.width || it.str.length * 5
              const h = Math.abs(it.transform[3]) || it.height || 12
              if (x < minX) minX = x
              if (x + w > maxX) maxX = x + w
              if (h > maxH) maxH = h
            })

            if (minX !== Infinity && maxX !== -Infinity) {
              const [vx1, vy1] = viewport.convertToViewportPoint(minX, line.y)
              const [vx2] = viewport.convertToViewportPoint(maxX, line.y)
              const boxHeight = maxH * scale * 1.35
              boxes.push({
                left: Math.max(8, vx1 - 4),
                top: vy1 - boxHeight * 0.82,
                width: Math.max(40, vx2 - vx1 + 8),
                height: boxHeight,
              })
            }
          })

          setHighlights(boxes)

          // Tự động cuộn khung PDF tới đúng vị trí dòng được tô sáng
          setTimeout(() => {
            firstHighlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }, 120)
        } else {
          setHighlights([])
        }
      } catch {
        setHighlights([])
      } finally {
        if (!cancelled) setRendering(false)
      }
    }

    renderPageAndHighlight()
    return () => { cancelled = true }
  }, [viewMode, pdfDoc, currentPage, scale, activeViolation])

  const computedNativeSrc = `${pdfUrl}${activePage ? `#page=${activePage}` : ''}`

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-Pine relative">
      {/* ── 1. Thanh Điều khiển Trình đối chiếu PDF (XAI Viewer) ── */}
      <div className="bg-Pine text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 text-Frostysilver flex-shrink-0" />
          <span className="text-xs font-extrabold truncate">
            Trình đối chiếu Hợp đồng PDF (XAI Viewer)
          </span>
          {activeViolation?.page_number && (
            <span className="px-2.5 py-0.5 rounded-lg bg-Berry text-white text-[11px] font-extrabold shadow-sm">
              Trang {activeViolation.page_number}
            </span>
          )}
        </div>

        {/* Chuyển chế độ Tô sáng XAI vs PDF Gốc + Phóng to/Thu nhỏ */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="flex items-center bg-white/10 p-0.5 rounded-xl border border-white/15">
            <button
              type="button"
              onClick={() => setViewMode('xai')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition-all ${
                viewMode === 'xai' ? 'bg-Berry text-white shadow-sm' : 'text-Snowflake/80 hover:text-white'
              }`}
              title="Tự động tô màu vàng/đỏ trực tiếp lên đoạn vi phạm trên trang PDF"
            >
              <Sparkles className="w-3 h-3" />
              Tô sáng XAI
            </button>
            <button
              type="button"
              onClick={() => setViewMode('native')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all ${
                viewMode === 'native' ? 'bg-white text-Pine shadow-sm' : 'text-Snowflake/80 hover:text-white'
              }`}
              title="Xem bằng trình đọc PDF mặc định của trình duyệt"
            >
              PDF Gốc
            </button>
          </div>

          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Mở rộng PDF
          </a>
        </div>
      </div>

      {/* ── 2. Banner Bằng chứng đang định vị nổi bật ở đầu PDF (Khôi phục như ảnh cũ) ── */}
      {activeEvidence && (
        <div className="bg-Frostysilver px-4 py-2.5 flex items-start gap-2.5 border-b-2 border-Berry">
          <Shield className="w-4 h-4 text-Berry flex-shrink-0 mt-0.5" />
          <div className="text-xs text-Pine flex-1">
            <span className="font-extrabold text-Berry uppercase mr-1.5">
              BẰNG CHỨNG TRÍCH XUẤT {activeViolation?.page_number ? `(TRANG ${activeViolation.page_number})` : ''}:
            </span>
            <span className="italic font-semibold bg-amber-200/90 px-1.5 py-0.5 rounded text-Pine">
              "{activeEvidence}"
            </span>
          </div>
        </div>
      )}

      {/* ── 3. Thanh điều hướng trang & Zoom khi ở chế độ XAI Highlight ── */}
      {viewMode === 'xai' && (
        <div className="bg-[#1A242B] text-Snowflake px-4 py-1.5 flex items-center justify-between text-xs border-b border-white/10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono font-bold">
              Trang {currentPage} / {numPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= numPages}
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              className="p-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-amber-300 font-semibold hidden sm:inline">
              {highlights.length > 0
                ? `Đã đánh dấu ${highlights.length} dòng vi phạm trên trang này`
                : 'Đang hiển thị trang tài liệu'}
            </span>
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.8, Number((s - 0.15).toFixed(2))))}
              className="p-1 rounded-lg bg-white/10 hover:bg-white/20"
              title="Thu nhỏ"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] w-11 text-center">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(2.0, Number((s + 0.15).toFixed(2))))}
              className="p-1 rounded-lg bg-white/10 hover:bg-white/20"
              title="Phóng to"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── 4. Khung hiển thị Tài liệu PDF + Lớp Tô Sáng Trực Tiếp ── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 relative overflow-auto bg-[#232D36] flex justify-center p-4"
      >
        {viewMode === 'xai' ? (
          <div className="relative inline-block shadow-2xl rounded-sm bg-white my-auto">
            {rendering && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-20 flex items-center justify-center">
                <Spinner size="md" />
              </div>
            )}
            <canvas ref={canvasRef} className="block" />

            {/* Các vệt Tô sáng màu Vàng/Đỏ đè trực tiếp lên đúng dòng chữ vi phạm trên tờ PDF */}
            {highlights.map((box, idx) => (
              <div
                key={idx}
                ref={idx === 0 ? firstHighlightRef : undefined}
                style={{
                  top: `${box.top}px`,
                  left: `${box.left}px`,
                  width: `${box.width}px`,
                  height: `${box.height}px`,
                }}
                className="pointer-events-none absolute bg-amber-300/45 border-b-2 border-Berry mix-blend-multiply transition-all duration-300"
              >
                {idx === 0 && (
                  <span className="absolute -top-6 left-0 bg-Berry text-white text-[10px] font-extrabold px-2 py-0.5 rounded shadow-md whitespace-nowrap">
                    ⚠️ VỊ TRÍ ĐIỀU KHOẢN VI PHẠM ({activeViolation?.Standards?.standard_code || 'RBA'})
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <iframe
            key={computedNativeSrc}
            ref={iframeRef}
            src={computedNativeSrc}
            className="w-full h-full border-0 rounded-lg bg-white"
            title="PDF Viewer"
          />
        )}

        {/* ── 5. Hộp Ghi chú Nổi góc dưới bên phải (Khôi phục đúng như ảnh image_2fe6fd.jpg) ── */}
        {activeEvidence && (
          <div className="fixed md:absolute bottom-4 right-4 z-30 max-w-sm bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_12px_35px_rgba(0,0,0,0.35)] border-2 border-Berry overflow-hidden">
            <div className="bg-Berry text-white px-3.5 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-extrabold">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>
                  Đoạn văn bản vi phạm {activeViolation?.page_number ? `· Trang ${activeViolation.page_number}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(activeEvidence)
                    toast.success('Đã sao chép đoạn văn bản vi phạm.')
                  }}
                  className="p-1 hover:bg-white/20 rounded"
                  title="Sao chép"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowFloatingBox(!showFloatingBox)}
                  className="p-1 hover:bg-white/20 rounded"
                  title={showFloatingBox ? 'Thu nhỏ' : 'Mở rộng'}
                >
                  {showFloatingBox ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            {showFloatingBox && (
              <div className="p-3">
                <p className="text-xs text-Pine bg-amber-50/90 border border-Berry/20 p-2.5 rounded-xl italic leading-relaxed max-h-36 overflow-y-auto">
                  "{activeEvidence}"
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AuditWorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const documentId = Number(id)
  const navigate = useNavigate()
  const { hasPermission, user, role } = useAuth()
  const { publishEvent } = useRealtime()

  const [contractDoc, setContractDoc] = useState<DocumentDetail | null>(null)
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [activeViolationId, setActiveViolationId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [filterRisk, setFilterRisk] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'violations' | 'pdf'>('violations')

  const [confirmReview, setConfirmReview] = useState<{ id: number; status: 'Approved' | 'Rejected' } | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [docRes, violRes] = await Promise.all([
        documentApi.getById(documentId),
        documentApi.getViolations(documentId).catch(() => ({ data: { violations: [] } })),
      ])

      const rawDoc = docRes.data?.document || docRes.data?.data || docRes.data
      setContractDoc(rawDoc as DocumentDetail)

      const rawViols =
        violRes.data?.violations ||
        violRes.data?.items ||
        violRes.data?.data ||
        violRes.data ||
        []
      const violList: Violation[] = Array.isArray(rawViols) ? rawViols : []
      setViolations(violList)

      if (violList.length > 0 && activeViolationId === null) {
        setActiveViolationId(violList[0].id)
      }
    } catch {
      toast.error('Không thể tải dữ liệu hợp đồng.')
    } finally {
      setLoading(false)
    }
  }, [documentId, activeViolationId])

  useEffect(() => { fetchData() }, [fetchData])

  const activeViolation =
    violations.find((v) => v.id === activeViolationId) || violations[0] || null

  const handleViolationClick = (v: Violation) => {
    setActiveViolationId(v.id)
    if (window.innerWidth < 768) {
      setActiveTab('pdf')
    }
  }

  const handleAnalyze = async () => {
    if (!contractDoc) return
    setAnalyzing(true)
    toast.loading('AI RAG đang rà soát hợp đồng...', { id: 'ai-scan' })
    try {
      const res = await documentApi.analyze(documentId)
      const count = res.data?.violations_count ?? res.data?.violations?.length ?? 0
      toast.success(`AI rà soát hoàn tất! Phát hiện ${count} điểm rủi ro.`, { id: 'ai-scan' })
      publishEvent({
        type: 'AI_SCAN_COMPLETED',
        title: 'AI hoàn tất rà soát hợp đồng',
        message: `Hợp đồng "${contractDoc.file_name}" đã được phân tích (${count} cảnh báo).`,
        documentId,
        violationCount: count,
      })
      await fetchData()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Phân tích AI thất bại.', { id: 'ai-scan' })
    } finally {
      setAnalyzing(false)
    }
  }

  const handleConfirmReview = async () => {
    if (!confirmReview) return
    setReviewLoading(true)
    try {
      const oldRisk = contractDoc?.Suppliers?.risk_score ?? 100
      const res = await violationApi.review(confirmReview.id, confirmReview.status)
      const result = res.data?.data || res.data
      const newRisk: number | null =
        result?.supplier_risk_score ?? result?.newRiskScore ?? null

      if (confirmReview.status === 'Approved' && newRisk !== null) {
        const diff = oldRisk - newRisk
        toast.success(
          diff > 0
            ? `Đã phê duyệt vi phạm! Điểm nhà cung ứng giảm ${diff} điểm (${oldRisk} → ${newRisk}).`
            : `Đã phê duyệt vi phạm! Điểm rủi ro hiện tại: ${newRisk}.`
        )
      } else {
        toast.success(`Đã bác bỏ cảnh báo. Điểm rủi ro hiện tại: ${newRisk ?? oldRisk}.`)
      }

      publishEvent({
        type: 'NEW_VIOLATION',
        title: confirmReview.status === 'Approved' ? 'Quản lý đã phê duyệt vi phạm' : 'Quản lý đã bác bỏ cảnh báo',
        message: `Cảnh báo tại hợp đồng "${contractDoc?.file_name || '#'}" vừa được cập nhật.`,
        documentId,
      })

      setViolations((prev) =>
        prev.map((v) => v.id === confirmReview.id ? { ...v, status: confirmReview.status } : v)
      )
      if (contractDoc && newRisk !== null) {
        setContractDoc((prev) => prev ? {
          ...prev,
          Suppliers: prev.Suppliers ? { ...prev.Suppliers, risk_score: newRisk } : prev.Suppliers
        } : prev)
      }
      setConfirmReview(null)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Thẩm định thất bại.')
    } finally {
      setReviewLoading(false)
    }
  }

  const filteredViolations = violations.filter((v) => {
    if (filterRisk && v.risk_level !== filterRisk) return false
    if (filterStatus && v.status !== filterStatus) return false
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      const descMatch = (v.violation_desc || '').toLowerCase().includes(q)
      const quoteMatch = cleanVietnamesePdfText(v.evidence_quote).toLowerCase().includes(q)
      const codeMatch = (v.Standards?.standard_code || '').toLowerCase().includes(q)
      if (!descMatch && !quoteMatch && !codeMatch) return false
    }
    return true
  })

  const pendingCount = violations.filter((v) => v.status === 'Pending').length

  const backendOrigin = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '')
  const pdfUrl = contractDoc ? `${backendOrigin}/${contractDoc.storage_url.replace(/^\/+/, '')}` : ''

  if (loading) {
    return (
      <MainLayout breadcrumb="Phòng Kiểm toán AI">
        <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
      </MainLayout>
    )
  }

  if (!contractDoc) {
    return (
      <MainLayout breadcrumb="Phòng Kiểm toán AI">
        <EmptyState message="Không tìm thấy hợp đồng" />
      </MainLayout>
    )
  }

  return (
    <MainLayout breadcrumb={`Kiểm toán: ${contractDoc.file_name}`}>
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <button
          type="button"
          onClick={() => navigate('/documents')}
          className="inline-flex items-center gap-2 text-xs font-extrabold text-Pine bg-white px-3.5 py-2 rounded-2xl border border-Mist/30 hover:bg-Snowflake transition-colors shadow-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          Quay lại Kho hợp đồng PDF
        </button>

        {hasPermission('EXPORT_REPORT') && (
          <button
            type="button"
            onClick={() =>
              printSingleContractAuditCertificate(
                contractDoc,
                violations,
                user?.full_name || 'Chuyên viên Kiểm toán',
                role || 'User'
              )
            }
            className="inline-flex items-center gap-2 px-4 py-2 bg-Pine text-white text-xs font-extrabold rounded-2xl hover:bg-Pine/90 transition-all shadow-sm"
          >
            <Printer className="w-3.5 h-3.5 text-Frostysilver" />
            In Phiếu Kết quả Kiểm toán Hợp đồng
          </button>
        )}
      </div>

      {/* Mobile tabs */}
      <div className="flex md:hidden mb-3 bg-white p-1 rounded-2xl border border-Mist/25">
        {[
          { key: 'violations', label: `Cảnh báo AI (${filteredViolations.length})` },
          { key: 'pdf',        label: 'Tài liệu PDF' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all ${
              activeTab === tab.key ? 'bg-Pine text-white shadow-sm' : 'text-Branch'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Split-view layout */}
      <div className="flex gap-4 h-[calc(100vh-175px)]">
        {/* ── Left Column: Violations ── */}
        <div className={`flex flex-col w-full md:w-[48%] ${activeTab === 'pdf' ? 'hidden md:flex' : 'flex'}`}>
          {/* Document info + 3 KPI Boxes (Giống bố cục ảnh image_2fe6fd.jpg) */}
          <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] p-4 mb-3 flex-shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-Pine flex-shrink-0" />
                  <h2 className="text-sm font-extrabold text-Pine truncate">{contractDoc.file_name}</h2>
                  <StatusBadge status={contractDoc.status} />
                </div>
                <p className="text-xs text-Mist">
                  Đối tác: <strong className="text-Pine">{contractDoc.Suppliers?.company_name || '—'}</strong> · Loại: {contractDoc.Categories?.name || '—'}
                </p>
                {contractDoc.Suppliers && (
                  <div className="mt-2.5">
                    <p className="text-[11px] font-bold text-Branch mb-1">Điểm tín nhiệm & Rủi ro nhà cung ứng:</p>
                    <RiskScoreBar score={contractDoc.Suppliers.risk_score} />
                  </div>
                )}
              </div>
              {hasPermission('RUN_AI_AUDIT') && (
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzing || contractDoc.status === 'Analyzing'}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-Berry text-white text-xs font-extrabold rounded-2xl hover:bg-Berry/90 disabled:opacity-60 transition-all flex-shrink-0 shadow-sm"
                >
                  {analyzing ? <Spinner size="sm" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {violations.length > 0 ? 'Quét lại AI' : 'Chạy quét AI'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                { label: 'Tổng cảnh báo', count: violations.length, color: 'text-Pine' },
                { label: 'Chờ Manager duyệt', count: pendingCount, color: 'text-Branch' },
                { label: 'Mức độ Cao (High)', count: violations.filter((v) => v.risk_level === 'High').length, color: 'text-Berry' },
              ].map(({ label, count, color }) => (
                <div key={label} className="text-center bg-Snowflake/60 rounded-2xl py-1.5 border border-Mist/20">
                  <div className={`text-lg font-extrabold ${color}`}>{count}</div>
                  <div className="text-[11px] font-semibold text-Mist">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-Mist absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã chuẩn, từ khóa bằng chứng..."
                className="w-full pl-8 pr-3 py-2 border border-Mist/40 rounded-xl text-xs bg-white text-Pine focus:outline-none focus:border-Pine"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterRisk}
                onChange={(e) => setFilterRisk(e.target.value)}
                className="px-2.5 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
              >
                <option value="">Mọi mức độ</option>
                <option value="High">Cao (-10đ)</option>
                <option value="Medium">Trung bình (-5đ)</option>
                <option value="Low">Thấp (-2đ)</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2.5 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
              >
                <option value="">Mọi trạng thái</option>
                <option value="Pending">Chờ duyệt</option>
                <option value="Approved">Đã duyệt</option>
                <option value="Rejected">Bác bỏ</option>
              </select>
            </div>
          </div>

          {/* Violation list */}
          <div className="flex-1 overflow-y-auto pr-1">
            {filteredViolations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 bg-white rounded-3xl border border-Mist/20 text-Mist px-4 text-center">
                <AlertTriangle className="w-10 h-10 mb-3 text-Pine/40" />
                <p className="text-sm font-bold text-Pine">
                  {violations.length === 0
                    ? 'Chưa có cảnh báo vi phạm nào. Hãy bấm "Chạy quét AI" để phân tích hợp đồng.'
                    : 'Không có vi phạm phù hợp với bộ lọc.'}
                </p>
              </div>
            ) : (
              filteredViolations.map((v, idx) => (
                <ViolationCard
                  key={v.id}
                  index={idx}
                  violation={v}
                  isActive={activeViolation?.id === v.id}
                  onClick={() => handleViolationClick(v)}
                  onReview={(vid, status) => setConfirmReview({ id: vid, status })}
                  canApprove={hasPermission('APPROVE_VIOLATION')}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Right Column: PDF Viewer with Direct XAI Highlight ── */}
        <div className={`flex-1 rounded-3xl overflow-hidden border border-Mist/30 shadow-[0_10px_28px_rgba(39,54,63,0.08)] ${activeTab === 'violations' ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
          {pdfUrl ? (
            <SplitPDFViewer
              pdfUrl={pdfUrl}
              activeViolation={activeViolation}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-Snowflake">
              <p className="text-sm text-Mist">Không tìm thấy đường dẫn file PDF</p>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Review Modal */}
      <ConfirmModal
        isOpen={!!confirmReview}
        title={confirmReview?.status === 'Approved' ? 'Phê duyệt vi phạm & Trừ điểm?' : 'Bác bỏ cảnh báo AI?'}
        message={
          confirmReview?.status === 'Approved'
            ? 'Xác nhận điều khoản này vi phạm tiêu chuẩn. Điểm rủi ro của nhà cung ứng sẽ được tính toán lại và trừ điểm ngay lập tức.'
            : 'Bác bỏ cảnh báo này (False Positive). Điểm rủi ro của nhà cung ứng sẽ được giữ nguyên.'
        }
        confirmLabel={confirmReview?.status === 'Approved' ? 'Phê duyệt – Trừ điểm' : 'Bác bỏ cảnh báo'}
        variant={confirmReview?.status === 'Approved' ? 'danger' : 'warning'}
        onConfirm={handleConfirmReview}
        onCancel={() => setConfirmReview(null)}
      />
      {reviewLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-Pine/20 backdrop-blur-sm">
          <Spinner size="lg" />
        </div>
      )}
    </MainLayout>
  )
}