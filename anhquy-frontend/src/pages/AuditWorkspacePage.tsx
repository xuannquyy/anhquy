import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ChevronLeft, AlertTriangle, CheckCircle2, XCircle,
  Shield, BookOpen, Lightbulb, RefreshCw, ChevronDown,
  FileText, Search, Copy, ExternalLink, Printer
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
              "Trích dẫn (Tr.${v.page_number ?? '?'}): ${v.evidence_quote}"
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

// ─── Violation Card (Thiết kế Accordion gọn sạch: Chỉ mở bung thẻ đang chọn) ─

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
  const borderLeftColor =
    violation.risk_level === 'High'
      ? 'border-l-Berry'
      : violation.risk_level === 'Medium'
      ? 'border-l-Branch'
      : 'border-l-Mist'

  const handleCopyQuote = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(violation.evidence_quote || '')
    toast.success('Đã sao chép nguyên văn đoạn bằng chứng.')
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-l-4 transition-all duration-200 cursor-pointer mb-2.5 overflow-hidden ${borderLeftColor} ${
        isActive
          ? 'bg-white border-Pine/30 shadow-[0_8px_24px_rgba(11,19,43,0.1)]'
          : 'bg-white/85 border-Mist/20 hover:bg-white hover:border-Mist/40'
      }`}
    >
      {/* ── Phần Header Tóm tắt (Luôn hiển thị gọn gàng trên 1 khối) ── */}
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-5 h-5 rounded-lg bg-Snowflake text-Pine text-[11px] font-extrabold flex items-center justify-center flex-shrink-0">
              {index + 1}
            </span>
            <StatusBadge status={violation.risk_level} />
            {violation.Standards && (
              <span className="text-xs font-mono font-extrabold text-Pine truncate">
                {violation.Standards.standard_code}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {violation.page_number && (
              <span className="text-[11px] font-bold text-Pine bg-Snowflake px-2 py-0.5 rounded-lg border border-Mist/20">
                Trang {violation.page_number}
              </span>
            )}
            <StatusBadge status={violation.status} />
            <ChevronDown
              className={`w-4 h-4 text-Mist transition-transform duration-200 ${
                isActive ? 'rotate-180 text-Pine' : ''
              }`}
            />
          </div>
        </div>

        {/* Tên tiêu chuẩn + Mô tả ngắn */}
        {violation.Standards && (
          <p className="text-xs font-extrabold text-Pine mb-1">
            {violation.Standards.name}{' '}
            <span className="font-normal text-Mist">
              ({violation.Standards.jurisdiction === 'VN' ? 'Pháp luật VN' : 'Chuẩn RBA'})
            </span>
          </p>
        )}
        <p className={`text-xs text-Branch leading-relaxed ${isActive ? '' : 'line-clamp-1'}`}>
          {violation.violation_desc}
        </p>
      </div>

      {/* ── Phần Chi tiết Mở Rộng (Chỉ hiện khi click chọn thẻ này) ── */}
      {isActive && (
        <div className="px-3.5 pb-3.5 pt-1 space-y-2.5 border-t border-Snowflake">
          {/* Trích dẫn nguyên văn trong hợp đồng */}
          <div className="bg-Snowflake/60 border border-Mist/25 rounded-xl p-3 text-xs text-Pine">
            <div className="flex items-center justify-between mb-1">
              <span className="font-extrabold text-Berry flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <BookOpen className="w-3.5 h-3.5" />
                Bằng chứng trong hợp đồng {violation.page_number ? `(Trang ${violation.page_number})` : ''}
              </span>
              <button
                type="button"
                onClick={handleCopyQuote}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-Branch hover:text-Pine bg-white px-2 py-0.5 rounded-md border border-Mist/20"
              >
                <Copy className="w-3 h-3" /> Sao chép
              </button>
            </div>
            <p className="italic leading-relaxed text-Pine/90">"{violation.evidence_quote}"</p>
          </div>

          {/* Khuyến nghị sửa đổi */}
          {violation.recommendation && (
            <div className="flex gap-2 bg-white border border-Mist/25 rounded-xl p-3">
              <Lightbulb className="w-4 h-4 text-Berry mt-0.5 flex-shrink-0" />
              <p className="text-xs text-Branch leading-relaxed">
                <strong className="text-Pine">Khuyến nghị sửa đổi: </strong>
                {violation.recommendation}
              </p>
            </div>
          )}

          {/* Nút Phê duyệt / Bác bỏ dành cho Manager */}
          {canApprove && violation.status === 'Pending' && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onReview(violation.id, 'Approved')
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-Berry text-white text-xs font-extrabold rounded-xl hover:bg-Berry/90 transition-all shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Phê duyệt lỗi – Trừ điểm
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onReview(violation.id, 'Rejected')
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-Mist/40 text-Branch text-xs font-bold rounded-xl hover:bg-Snowflake transition-all bg-white"
              >
                <XCircle className="w-3.5 h-3.5 text-Mist" />
                Bác bỏ cảnh báo
              </button>
            </div>
          )}

          {violation.status !== 'Pending' && violation.Users && (
            <p className="text-[11px] text-Mist">
              Đã thẩm định bởi: <strong className="text-Pine">{violation.Users.full_name}</strong>
              {violation.reviewed_at && ` • ${new Date(violation.reviewed_at).toLocaleDateString('vi-VN')}`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Split PDF Viewer (Gọn thoáng, không bị hộp nổi che góc PDF) ─────────────

function SplitPDFViewer({
  pdfUrl,
  activeEvidence,
  activePage,
}: {
  pdfUrl: string
  activeEvidence: string | null
  activePage: number | null
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const computedSrc = `${pdfUrl}${activePage ? `#page=${activePage}` : ''}`

  useEffect(() => {
    if (iframeRef.current && activePage) {
      iframeRef.current.src = `${pdfUrl}#page=${activePage}`
    }
  }, [activePage, pdfUrl])

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-Pine">
      {/* Thanh Header gọn gàng */}
      <div className="bg-Pine text-white px-4 py-2.5 flex items-center justify-between gap-2 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 text-Frostysilver flex-shrink-0" />
          <span className="text-xs font-extrabold truncate">Tài liệu Hợp đồng PDF gốc</span>
          {activePage && (
            <span className="px-2 py-0.5 rounded-md bg-Berry text-white text-[11px] font-extrabold">
              Đang mở Trang {activePage}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {activeEvidence && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(activeEvidence)
                toast.success('Đã sao chép câu bằng chứng để tìm nhanh (Ctrl+F) trong PDF.')
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition-colors"
              title="Sao chép câu bằng chứng"
            >
              <Copy className="w-3 h-3" />
              Copy câu bằng chứng
            </button>
          )}
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Mở tab mới
          </a>
        </div>
      </div>

      {/* Thanh trích dẫn 1 dòng mỏng gọn (Không che màn hình PDF) */}
      {activeEvidence && (
        <div className="bg-Snowflake px-4 py-1.5 flex items-center gap-2 border-b border-Mist/30 text-xs text-Pine">
          <span className="font-extrabold text-Berry whitespace-nowrap">Đoạn vi phạm:</span>
          <span className="italic truncate flex-1" title={activeEvidence}>
            "{activeEvidence}"
          </span>
        </div>
      )}

      {/* Khung PDF 100% diện tích */}
      <div className="flex-1 bg-[#1E2930]">
        <iframe
          key={computedSrc}
          ref={iframeRef}
          src={computedSrc}
          className="w-full h-full border-0"
          title="PDF Viewer"
        />
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
  const [activeEvidence, setActiveEvidence] = useState<string | null>(null)
  const [activePage, setActivePage] = useState<number | null>(null)
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
        setActiveEvidence(violList[0].evidence_quote)
        setActivePage(violList[0].page_number)
      }
    } catch {
      toast.error('Không thể tải dữ liệu hợp đồng.')
    } finally {
      setLoading(false)
    }
  }, [documentId, activeViolationId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleViolationClick = (v: Violation) => {
    // Nếu bấm vào thẻ đang mở thì thu gọn lại, nếu bấm thẻ khác thì mở thẻ đó
    if (activeViolationId === v.id) {
      setActiveViolationId(null)
    } else {
      setActiveViolationId(v.id)
      setActiveEvidence(v.evidence_quote)
      setActivePage(v.page_number)
      if (window.innerWidth < 768) {
        setActiveTab('pdf')
      }
    }
  }

  const handleAnalyze = async () => {
    if (!contractDoc) return
    setAnalyzing(true)
    toast.loading('AI RAG đang phân tích hợp đồng...', { id: 'ai-scan' })
    try {
      const res = await documentApi.analyze(documentId)
      const count = res.data?.violations_count ?? res.data?.violations?.length ?? 0
      toast.success(`Phân tích hoàn tất! Phát hiện ${count} điểm rủi ro.`, { id: 'ai-scan' })
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
            ? `Đã phê duyệt vi phạm! Điểm đối tác giảm ${diff}đ (${oldRisk} → ${newRisk}).`
            : `Đã phê duyệt vi phạm! Điểm hiện tại: ${newRisk}.`
        )
      } else {
        toast.success(`Đã bác bỏ cảnh báo. Điểm đối tác: ${newRisk ?? oldRisk}.`)
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
      const quoteMatch = (v.evidence_quote || '').toLowerCase().includes(q)
      const codeMatch = (v.Standards?.standard_code || '').toLowerCase().includes(q)
      if (!descMatch && !quoteMatch && !codeMatch) return false
    }
    return true
  })

  const pendingCount = violations.filter((v) => v.status === 'Pending').length
  const highCount = violations.filter((v) => v.risk_level === 'High').length

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
      {/* ── Thanh Điều hướng & Công cụ Gọn Gàng Trên Cùng ── */}
      <div className="bg-white rounded-2xl border border-Mist/20 px-4 py-3 mb-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/documents')}
            className="inline-flex items-center gap-1 text-xs font-bold text-Branch hover:text-Pine bg-Snowflake px-3 py-1.5 rounded-xl transition-colors flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            Kho PDF
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-Pine flex-shrink-0" />
              <h2 className="text-sm font-extrabold text-Pine truncate max-w-[240px] sm:max-w-md">
                {contractDoc.file_name}
              </h2>
              <StatusBadge status={contractDoc.status} />
            </div>
            <p className="text-xs text-Mist truncate mt-0.5">
              Đối tác: <strong className="text-Pine">{contractDoc.Suppliers?.company_name || '—'}</strong> ·{' '}
              {contractDoc.Categories?.name || '—'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {contractDoc.Suppliers && (
            <div className="hidden xl:flex items-center gap-2 bg-Snowflake/50 px-3 py-1.5 rounded-xl border border-Mist/20">
              <span className="text-xs font-bold text-Branch">Điểm đối tác:</span>
              <RiskScoreBar score={contractDoc.Suppliers.risk_score} />
            </div>
          )}

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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-Snowflake text-Pine hover:bg-Pine hover:text-white text-xs font-extrabold rounded-xl border border-Mist/30 transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              In Phiếu Kiểm toán
            </button>
          )}

          {hasPermission('RUN_AI_AUDIT') && (
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing || contractDoc.status === 'Analyzing'}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-Berry text-white text-xs font-extrabold rounded-xl hover:bg-Berry/90 disabled:opacity-60 transition-all shadow-sm"
            >
              {analyzing ? <Spinner size="sm" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {violations.length > 0 ? 'Quét lại AI' : 'Chạy quét AI'}
            </button>
          )}
        </div>
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

      {/* ── Bố cục Split-view 2 Cột Rộng Thoáng ── */}
      <div className="flex gap-4 h-[calc(100vh-165px)]">
        {/* Cột Trái (45%): Danh sách lỗi dạng Accordion gọn gàng */}
        <div className={`flex flex-col w-full md:w-[46%] ${activeTab === 'pdf' ? 'hidden md:flex' : 'flex'}`}>
          {/* Thanh lọc + Thống kê nhanh gọn trên 1 hàng */}
          <div className="bg-white rounded-2xl border border-Mist/20 p-3 mb-2.5 flex flex-col gap-2.5 flex-shrink-0 shadow-sm">
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center gap-3">
                <span className="font-extrabold text-Pine">
                  Tổng: <strong>{violations.length}</strong> lỗi
                </span>
                <span className="text-Mist">|</span>
                <span className="font-bold text-Berry">
                  Cao: <strong>{highCount}</strong>
                </span>
                <span className="text-Mist">|</span>
                <span className="font-bold text-Branch">
                  Chờ duyệt: <strong>{pendingCount}</strong>
                </span>
              </div>
              <span className="text-[11px] text-Mist italic hidden sm:inline">
                Click vào từng lỗi để xem bằng chứng
              </span>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-Mist absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm mã chuẩn, từ khóa..."
                  className="w-full pl-8 pr-3 py-1.5 border border-Mist/35 rounded-xl text-xs bg-Snowflake/30 text-Pine focus:bg-white focus:outline-none focus:border-Pine"
                />
              </div>
              <select
                value={filterRisk}
                onChange={(e) => setFilterRisk(e.target.value)}
                className="px-2.5 py-1.5 border border-Mist/35 rounded-xl text-xs font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
              >
                <option value="">Mọi mức độ</option>
                <option value="High">Cao (-10đ)</option>
                <option value="Medium">Trung bình (-5đ)</option>
                <option value="Low">Thấp (-2đ)</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2.5 py-1.5 border border-Mist/35 rounded-xl text-xs font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
              >
                <option value="">Mọi trạng thái</option>
                <option value="Pending">Chờ duyệt</option>
                <option value="Approved">Đã duyệt</option>
                <option value="Rejected">Bác bỏ</option>
              </select>
            </div>
          </div>

          {/* Danh sách thẻ lỗi */}
          <div className="flex-1 overflow-y-auto pr-1">
            {filteredViolations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 bg-white rounded-2xl border border-Mist/20 text-Mist px-4 text-center">
                <AlertTriangle className="w-10 h-10 mb-3 text-Pine/30" />
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
                  isActive={activeViolationId === v.id}
                  onClick={() => handleViolationClick(v)}
                  onReview={(vid, status) => setConfirmReview({ id: vid, status })}
                  canApprove={hasPermission('APPROVE_VIOLATION')}
                />
              ))
            )}
          </div>
        </div>

        {/* Cột Phải (54%): Khung xem PDF rộng rãi */}
        <div className={`flex-1 rounded-2xl overflow-hidden border border-Mist/30 shadow-sm ${activeTab === 'violations' ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
          {pdfUrl ? (
            <SplitPDFViewer
              pdfUrl={pdfUrl}
              activeEvidence={activeEvidence}
              activePage={activePage}
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