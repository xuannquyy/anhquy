import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ChevronLeft, AlertTriangle, CheckCircle2, XCircle,
  Shield, BookOpen, Lightbulb, RefreshCw, ChevronDown, ChevronUp,
  FileText, Search, Copy, ExternalLink, Sparkles,
  ZoomIn, ZoomOut, ChevronRight, Globe, MapPin,
  Edit3, Check, ClipboardCheck, TrendingDown, Layers
} from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { ConfirmModal, RiskScoreBar, StatusBadge, Spinner, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useRealtime } from '../context/RealtimeContext'
import { documentApi, violationApi } from '../api'

export interface ExportableDocument {
  id: number
  file_name: string
  file_hash?: string | null
  file_size?: number | null
  storage_url?: string
  status?: string
  uploaded_at?: string | null
  last_analyzed_at?: string | null
  Suppliers?: {
    id: number
    company_name: string
    tax_code?: string
    risk_score?: number | null
  }
  Categories?: { id: number; name: string }
}

export interface ViolationItem {
  id: number
  document_id?: number
  risk_level: 'High' | 'Medium' | 'Low'
  status: 'Pending' | 'Approved' | 'Rejected'
  violation_desc: string
  evidence_quote: string
  page_number: number | null
  recommendation: string | null
  reviewed_at?: string | null
  created_at?: string
  Standards?: {
    id: number
    standard_code: string
    name: string
    jurisdiction: string | null
    Standard_Groups?: { group_code: string; group_name: string }
  }
  Users?: { id: number; full_name: string }
}

interface HighlightBox { top: number; left: number; width: number; height: number }

interface PdfTextItem { str: string; transform: number[]; width: number; height: number }
interface PdfViewport { width: number; height: number; convertToViewportPoint: (x: number, y: number) => [number, number] }
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
      getDocument: (params: string | { url: string; cMapUrl?: string; cMapPacked?: boolean; standardFontDataUrl?: string }) => { promise: Promise<PdfDocumentProxy> }
    }
  }
}

// ─── BỘ XỬ LÝ CHUẨN HÓA VĂN BẢN TIẾNG VIỆT (KHÔNG BAO GIỜ LÀM DÍNH CHỮ) ───────
export function cleanVietnamesePdfText(raw: string | null | undefined): string {
  if (!raw) return ''
  let text = raw.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()

  // 1. Tách các cụm từ bị dính liền do lỗi trích xuất PDF hoặc lưu trữ trước đó
  const unglueFixes: Array<[RegExp, string]> = [
    [/xử\s*lýmôi/gi, 'xử lý môi'],
    [/xử\s*lýnước/gi, 'xử lý nước'],
    [/xử\s*lýchất/gi, 'xử lý chất'],
    [/hóachất/gi, 'hóa chất'],
    [/vànước/gi, 'và nước'],
    [/hạichưa/gi, 'hại chưa'],
    [/mưacủa/gi, 'mưa của'],
    [/khucông/gi, 'khu công'],
    [/bảovệmôi/gi, 'bảo vệ môi'],
    [/vệmôi/gi, 'vệ môi'],
    [/giacông/gi, 'gia công'],
    [/hệt\s+hống/gi, 'hệ thống'],
    [/Yêucầu/g, 'Yêu cầu'],
    [/yêucầu/gi, 'yêu cầu'],
    [/bộnước/gi, 'bộ nước'],
    [/đơn\s*vịcó/gi, 'đơn vị có'],
    [/máyép/gi, 'máy ép'],
    [/máymóc/gi, 'máy móc'],
    [/trẻem/gi, 'trẻ em'],
    [/vàan/gi, 'và an'],
    [/chongườichưa/gi, 'cho người chưa'],
    [/chongười/gi, 'cho người'],
    [/ngườichưa/gi, 'người chưa'],
    [/hộcánhân/gi, 'hộ cá nhân'],
    [/bảohộ/gi, 'bảo hộ'],
    [/cánhân/gi, 'cá nhân'],
    [/phíytế/gi, 'phí y tế'],
    [/ytế/gi, 'y tế'],
    [/tainạn/gi, 'tai nạn'],
    [/phảitựtúc/gi, 'phải tự túc'],
    [/tựtúc/gi, 'tự túc'],
    [/muamặt/gi, 'mua mặt'],
    [/taychống/gi, 'tay chống'],
    [/môitại/gi, 'môi tại'],
    [/tựchịu/gi, 'tự chịu'],
    [/thờichịu/gi, 'thời chịu'],
    [/vàchăm/gi, 'và chăm'],
    [/sựcốmôi/gi, 'sự cố môi'],
    [/sựcố/gi, 'sự cố'],
    [/môitrường/gi, 'môi trường'],
    [/BênAtịch/g, 'Bên A tịch'],
    [/BênAcó/g, 'Bên A có'],
    [/BênA/g, 'Bên A'],
    [/BênB/g, 'Bên B'],
    [/củacông/gi, 'của công'],
    [/củangười/gi, 'của người'],
    [/bỏnội/gi, 'bỏ nội'],
    [/chocác/gi, 'cho các'],
    [/phảinộp/gi, 'phải nộp'],
    [/đồngyêucầungười/gi, 'đồng yêu cầu người'],
    [/điềucấm/gi, 'điều cấm'],
    [/giấytờtùy/gi, 'giấy tờ tùy'],
    [/giấytờ/gi, 'giấy tờ'],
    [/vàcấmyêucầu/gi, 'và cấm yêu cầu'],
    [/vàcấm/gi, 'và cấm'],
    [/sựcủa/gi, 'sự của'],
    [/vệsinh/gi, 'vệ sinh'],
    [/trìtủđiện/gi, 'trì tủ điện'],
    [/tủđiện/gi, 'tủ điện'],
    [/tiếnđộ/gi, 'tiến độ'],
    [/thaotác/gi, 'thao tác'],
    [/nguồnđiện/gi, 'nguồn điện'],
    [/phảitổ/gi, 'phải tổ'],
    [/tổchức/gi, 'tổ chức'],
    [/phươngán/gi, 'phương án'],
    [/thoáthiểm/gi, 'thoát hiểm'],
    [/cháyđịnh/gi, 'cháy định'],
    [/laođộng/gi, 'lao động'],
    [/hợpđồng/gi, 'hợp đồng'],
    [/thờigian/gi, 'thời gian'],
    [/quyđịnh/gi, 'quy định'],
    [/antoàn/gi, 'an toàn'],
    [/thanhtoán/gi, 'thanh toán'],
  ]

  for (const [pattern, replacement] of unglueFixes) {
    text = text.replace(pattern, replacement)
  }

  // 2. Ghép các âm tiết bị rớt khoảng trắng trong PDF (Sử dụng ranh giới khoảng trắng chuẩn Unicode)
  // 2a. Phụ âm đầu bị tách rời khỏi nguyên âm (vd: "Đ ể" -> "Để", "h ệ" -> "hệ")
  text = text.replace(
    /(?<=^|\s|[("“‘])(Ngh|Ng|Nh|Ch|Gh|Kh|Ph|Th|Tr|Qu|ngh|ng|nh|ch|gh|kh|ph|th|tr|qu|[bcdfghklmnpqrstvxzđĐ])\s+([aăâeêioôơuưyáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ])/g,
    '$1$2'
  )

  // 2b. Nguyên âm đôi bị tách ở giữa (vd: "ti ế t" -> "tiế t", "nư ớ c" -> "nướ c", "trư ờ ng" -> "trườ ng")
  text = text.replace(
    /([bcdđghklmnpqrstvx]*(?:i|y|u|ư|o|ô|ơ))\s+([ếệờớợềểổạấậắặ])/gi,
    '$1$2'
  )

  // 2c. Phụ âm cuối đứng cô lập một mình trước khoảng trắng hoặc dấu câu (vd: "tiế t " -> "tiết ", "thố ng " -> "thống ")
  text = text.replace(
    /([aăâeêioôơuưyáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ])\s+(ng|nh|ch|[cmnpt]|[iyaou])(?=$|\s|[.,;:"'”)?!])/gi,
    '$1$2'
  )

  // 3. Tự động tách nếu nguyên âm có dấu thanh bị dính liền vào phụ âm đầu của từ tiếp theo
  const accentedVowels = 'áàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ'
  const nextConsonants = 'bdđghklqrsvx'
  const autoSplitGlued = new RegExp(`([${accentedVowels}])([${nextConsonants}][a-zA-ZÀ-ỹ])`, 'g')
  text = text.replace(autoSplitGlued, '$1 $2')

  // Xóa khoảng trắng thừa trước dấu chấm, phẩy
  text = text.replace(/\s+([.,;!?])/g, '$1')

  return text.replace(/\s+/g, ' ').trim()
}

function normalizeForMatch(str: string): string {
  return str.toLowerCase().replace(/[.,;:"'“”‘’()[\]\-_•·\s]+/g, '').trim()
}

let pdfJsLoadingPromise: Promise<boolean> | null = null
function ensurePdfJsLoaded(): Promise<boolean> {
  if (typeof window !== 'undefined' && window.pdfjsLib) return Promise.resolve(true)
  if (pdfJsLoadingPromise) return pdfJsLoadingPromise
  pdfJsLoadingPromise = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.async = true
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        resolve(true)
      } else { resolve(false) }
    }
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
  return pdfJsLoadingPromise
}

const RISK_STYLES: Record<string, { border: string; badge: string; dot: string }> = {
  High:   { border: 'border-l-4 border-l-Berry', badge: 'bg-Berry text-white',  dot: 'bg-Berry' },
  Medium: { border: 'border-l-4 border-l-Sunny', badge: 'bg-Sunny text-Branch', dot: 'bg-Sunny' },
  Low:    { border: 'border-l-4 border-l-Pine',  badge: 'bg-Pine/15 text-Pine', dot: 'bg-Pine' },
}

function ViolationCard({ index, violation, isActive, customRedline, onSaveRedline, onClick, onReview, canApprove }: any) {
  const [expanded, setExpanded] = useState(true)
  const [isEditingRedline, setIsEditingRedline] = useState(false)
  const cleanedQuote = cleanVietnamesePdfText(violation.evidence_quote)
  const cleanedDesc = cleanVietnamesePdfText(violation.violation_desc)
  const defaultRecommendation = cleanVietnamesePdfText(violation.recommendation)
  const [draftClause, setDraftClause] = useState(customRedline || defaultRecommendation)

  const s = RISK_STYLES[violation.risk_level] || RISK_STYLES.Low

  return (
    <div onClick={onClick} className={`rounded-2xl border mb-3 overflow-hidden transition-all duration-200 cursor-pointer bg-white ${s.border} ${isActive ? 'border-Pine ring-2 ring-Pine/25 shadow-[0_8px_24px_rgba(1,75,170,0.12)]' : 'border-Mist/35 shadow-sm hover:border-Pine/40'}`}>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="w-5 h-5 rounded-lg bg-Pine text-white text-[11px] font-extrabold flex items-center justify-center flex-shrink-0">{index + 1}</span>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
            <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-xl ${s.badge}`}>
              {violation.risk_level === 'High' ? 'Rủi ro Cao (-10đ)' : violation.risk_level === 'Medium' ? 'Trung bình (-5đ)' : 'Rủi ro Thấp (-2đ)'}
            </span>
            {violation.Standards && (
              <span className="text-xs font-mono text-Pine bg-Pine/10 px-2 py-0.5 rounded-lg truncate font-extrabold border border-Pine/20">
                {violation.Standards.standard_code}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {violation.page_number && (
              <span className="text-[11px] font-extrabold text-Branch bg-Sunny/45 px-2.5 py-0.5 rounded-xl border border-Sunny">Trang {violation.page_number}</span>
            )}
            <StatusBadge status={violation.status} />
          </div>
        </div>

        {violation.Standards && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold uppercase ${violation.Standards.jurisdiction === 'VN' ? 'bg-Berry/10 text-Berry border border-Berry/20' : 'bg-Pine/10 text-Pine border border-Pine/20'}`}>
              {violation.Standards.jurisdiction === 'VN' ? <MapPin className="w-2.5 h-2.5 inline" /> : <Globe className="w-2.5 h-2.5 inline" />} {violation.Standards.jurisdiction || 'Global'}
            </span>
            <span className="text-xs font-extrabold text-Pine line-clamp-1">{violation.Standards.name}</span>
          </div>
        )}
        <p className={`text-xs sm:text-[13px] text-Branch leading-relaxed font-medium ${expanded ? '' : 'line-clamp-2'}`}>{cleanedDesc}</p>
      </div>

      <div className="px-3.5 pb-2.5">
        <div className="bg-DangerBg border-l-4 border-l-Berry border border-DangerBorder rounded-xl p-2.5 text-xs relative">
          <div className="flex items-start justify-between gap-2">
            <div className="leading-relaxed">
              <span className="inline-flex items-center gap-1 font-extrabold text-Berry text-[11px] uppercase mb-0.5">
                <BookOpen className="w-3.5 h-3.5 text-Berry" /> Điều khoản phát hiện trong dự thảo (Trang {violation.page_number ?? '?'}):
              </span>
              <p className="italic text-Merlot font-semibold">"{cleanedQuote.length > 200 && !expanded ? cleanedQuote.substring(0, 200) + '…' : cleanedQuote}"</p>
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(cleanedQuote); toast.success('Đã sao chép trích dẫn!'); }} className="p-1.5 rounded-lg bg-white text-Berry hover:bg-Berry hover:text-white transition-colors flex-shrink-0 border border-DangerBorder shadow-sm">
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-2.5">
          <div className="bg-SafeBg border-l-4 border-l-SafeGreen border border-SafeBorder rounded-xl p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-SafeGreen flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-SafeGreen" />
                {customRedline ? 'Phương án Hiệu chỉnh Điều khoản (Đã biên tập):' : 'Phương án Kiến nghị Hiệu chỉnh:'}
              </span>
              <button type="button" onClick={(e) => { e.stopPropagation(); setIsEditingRedline(!isEditingRedline) }} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold bg-white text-SafeGreen border border-SafeBorder hover:bg-SafeGreen hover:text-white transition-colors shadow-sm">
                <Edit3 className="w-3 h-3" /> {isEditingRedline ? 'Đóng' : 'Biên tập điều khoản'}
              </button>
            </div>
            {isEditingRedline ? (
              <div className="space-y-2 mt-2" onClick={(e) => e.stopPropagation()}>
                <textarea rows={3} value={draftClause} onChange={(e) => setDraftClause(e.target.value)} placeholder="Nhập nội dung điều khoản hiệu chỉnh..." className="w-full p-2.5 text-xs font-semibold border border-SafeGreen rounded-xl bg-white text-Branch focus:outline-none" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setIsEditingRedline(false)} className="px-3 py-1 text-xs font-bold text-Branch bg-white border border-Mist/40 rounded-lg">Hủy</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); onSaveRedline(violation.id, draftClause); setIsEditingRedline(false); toast.success('Đã lưu phương án hiệu chỉnh!'); }} className="inline-flex items-center gap-1 px-3 py-1 text-xs font-extrabold text-white bg-SafeGreen rounded-lg hover:opacity-90">
                    <Check className="w-3.5 h-3.5" /> Lưu vào Báo cáo
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-SafeGreen leading-relaxed font-bold">{ cleanVietnamesePdfText(customRedline || defaultRecommendation) }</p>
            )}
          </div>

          {canApprove && violation.status === 'Pending' && (
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={(e) => { e.stopPropagation(); onReview(violation.id, 'Approved') }} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-Berry text-white text-xs font-extrabold rounded-xl hover:bg-Merlot transition-colors shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5" /> Phê duyệt lỗi – Trừ điểm
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onReview(violation.id, 'Rejected') }} className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-Mist/50 text-Branch text-xs font-bold rounded-xl hover:bg-Snowflake transition-colors bg-white">
                <XCircle className="w-3.5 h-3.5 text-Mist" /> Bác bỏ cảnh báo
              </button>
            </div>
          )}
        </div>
      )}

      <button type="button" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }} className="w-full py-1.5 flex items-center justify-center gap-1 text-[11px] font-bold text-Mist hover:text-Pine hover:bg-Snowflake/40 transition-colors border-t border-Mist/15">
        {expanded ? <><ChevronUp className="w-3 h-3" />Thu gọn</> : <><ChevronDown className="w-3 h-3" />Xem Phương án Hiệu chỉnh & Thẩm định</>}
      </button>
    </div>
  )
}

function SplitPDFViewer({ pdfUrl, activeViolation }: any) {
  const activePage = activeViolation?.page_number || 1
  const [viewMode, setViewMode] = useState<'xai' | 'native'>('xai')
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState<number>(activePage)
  const [numPages, setNumPages] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.25)
  const [highlights, setHighlights] = useState<HighlightBox[]>([])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const firstHighlightRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (activeViolation?.page_number) setCurrentPage(activeViolation.page_number) }, [activeViolation])

  useEffect(() => {
    let cancelled = false
    ensurePdfJsLoaded().then((loaded) => {
      if (loaded && window.pdfjsLib && !cancelled) {
        window.pdfjsLib.getDocument({
          url: pdfUrl, cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/', cMapPacked: true, standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
        }).promise.then(doc => { if (!cancelled) { setPdfDoc(doc); setNumPages(doc.numPages) } })
      }
    })
    return () => { cancelled = true }
  }, [pdfUrl])

  useEffect(() => {
    if (viewMode !== 'xai' || !pdfDoc || !canvasRef.current) return
    let cancelled = false
    pdfDoc.getPage(Math.min(Math.max(1, currentPage), pdfDoc.numPages)).then(page => {
      if (cancelled || !canvasRef.current) return
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      page.render({ canvasContext: ctx, viewport }).promise.then(async () => {
        if (cancelled) return
        if (activeViolation?.evidence_quote && currentPage === (activeViolation.page_number || 1)) {
          const textContent = await page.getTextContent()
          const normEvidence = normalizeForMatch(activeViolation.evidence_quote)
          const lines: any[] = []
          for (const item of textContent.items) {
            if (!item.str || !item.str.trim()) continue
            const y = item.transform[5]
            const existing = lines.find((l) => Math.abs(l.y - y) <= 4)
            if (existing) { existing.items.push(item); existing.norm = normalizeForMatch(existing.text += ' ' + item.str) }
            else { lines.push({ y, items: [item], text: item.str, norm: normalizeForMatch(item.str) }) }
          }
          lines.sort((a, b) => b.y - a.y)
          const matched = new Set<number>()
          if (normEvidence.length >= 6) {
            const snippets: string[] = []
            for (let i = 0; i <= normEvidence.length - 10; i += Math.max(4, Math.floor(normEvidence.length / 8))) snippets.push(normEvidence.substring(i, i + 12))
            if (snippets.length === 0) snippets.push(normEvidence)
            lines.forEach((l, idx) => { if (l.norm.length >= 4 && (normEvidence.includes(l.norm) || snippets.some(sn => l.norm.includes(sn)))) matched.add(idx) })
          }
          const boxes: HighlightBox[] = []
          matched.forEach(idx => {
            const line = lines[idx]
            let minX = Infinity, maxX = -Infinity, maxH = 14
            line.items.forEach((it: any) => {
              const x = it.transform[4], w = it.width || it.str.length * 5, h = Math.abs(it.transform[3]) || it.height || 12
              if (x < minX) minX = x; if (x + w > maxX) maxX = x + w; if (h > maxH) maxH = h
            })
            if (minX !== Infinity && maxX !== -Infinity) {
              const [vx1, vy1] = viewport.convertToViewportPoint(minX, line.y)
              const [vx2] = viewport.convertToViewportPoint(maxX, line.y)
              boxes.push({ left: Math.max(8, vx1 - 4), top: vy1 - maxH * scale * 1.35 * 0.82, width: Math.max(40, vx2 - vx1 + 8), height: maxH * scale * 1.35 })
            }
          })
          setHighlights(boxes)
          setTimeout(() => firstHighlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120)
        } else { setHighlights([]) }
      })
    })
    return () => { cancelled = true }
  }, [viewMode, pdfDoc, currentPage, scale, activeViolation])

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-Branch relative">
      <div className="bg-Pine text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-white/15">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 text-Sunny flex-shrink-0" />
          <span className="text-xs font-extrabold truncate">Trình đối chiếu (XAI Viewer)</span>
          {activeViolation?.page_number && <span className="px-2.5 py-0.5 rounded-lg bg-Sunny text-Branch text-[11px] font-extrabold shadow-sm">Trang {activeViolation.page_number}</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="flex items-center bg-white/10 p-0.5 rounded-xl border border-white/15">
            <button type="button" onClick={() => setViewMode('xai')} className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1 transition-all ${viewMode === 'xai' ? 'bg-Sunny text-Branch' : 'text-white/80 hover:text-white'}`}><Sparkles className="w-3 h-3" /> Tô sáng XAI</button>
            <button type="button" onClick={() => setViewMode('native')} className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all ${viewMode === 'native' ? 'bg-white text-Pine' : 'text-white/80 hover:text-white'}`}>PDF Gốc</button>
          </div>
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold"><ExternalLink className="w-3 h-3" /></a>
        </div>
      </div>

      {viewMode === 'xai' && (
        <div className="bg-Branch text-Snowflake px-4 py-1.5 flex items-center justify-between text-xs border-b border-white/10">
          <div className="flex items-center gap-2">
            <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1 rounded-lg bg-white/10 hover:bg-white/20"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <span className="font-mono font-bold">Trang {currentPage} / {numPages}</span>
            <button type="button" disabled={currentPage >= numPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1 rounded-lg bg-white/10 hover:bg-white/20"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setScale(s => Math.max(0.8, s - 0.15))} className="p-1 rounded-lg bg-white/10 hover:bg-white/20"><ZoomOut className="w-3.5 h-3.5" /></button>
            <span className="font-mono text-[11px] w-11 text-center">{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => setScale(s => Math.min(2.0, s + 0.15))} className="p-1 rounded-lg bg-white/10 hover:bg-white/20"><ZoomIn className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}

      <div ref={scrollContainerRef} className="flex-1 relative overflow-auto bg-[#1B2434] flex justify-center p-4">
        {viewMode === 'xai' ? (
          <div className="relative inline-block shadow-2xl rounded-sm bg-white my-auto">
            <canvas ref={canvasRef} className="block" />
            {highlights.map((box, idx) => (
              <div key={idx} ref={idx === 0 ? firstHighlightRef : undefined} style={{ top: box.top, left: box.left, width: box.width, height: box.height }} className="pointer-events-none absolute bg-Sunny/45 border-b-2 border-Berry mix-blend-multiply transition-all duration-300">
                {idx === 0 && <span className="absolute -top-6 left-0 bg-Berry text-white text-[10px] font-extrabold px-2 py-0.5 rounded shadow-md whitespace-nowrap">⚠️ VỊ TRÍ ĐIỀU KHOẢN VI PHẠM</span>}
              </div>
            ))}
          </div>
        ) : (
          <iframe src={`${pdfUrl}#page=${activePage}`} className="w-full h-full border-0 rounded-lg bg-white" />
        )}
      </div>
    </div>
  )
}

export default function AuditWorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const documentId = Number(id)
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const { publishEvent } = useRealtime()

  const [contractDoc, setContractDoc] = useState<ExportableDocument | null>(null)
  const [violations, setViolations] = useState<ViolationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [batchReviewing, setBatchReviewing] = useState(false)
  const [activeViolationId, setActiveViolationId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterRisk, setFilterRisk] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [activeTab, setActiveTab] = useState<'violations' | 'pdf'>('violations')

  const [customRedlines, setCustomRedlines] = useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem(`anhquy_redlines_doc_${documentId}`) || '{}') } catch { return {} }
  })
  const [confirmReview, setConfirmReview] = useState<{ id: number; status: 'Approved' | 'Rejected' } | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)

  const handleSaveRedline = (violationId: number, newClause: string) => {
    setCustomRedlines(prev => {
      const updated = { ...prev, [violationId]: newClause }
      localStorage.setItem(`anhquy_redlines_doc_${documentId}`, JSON.stringify(updated))
      return updated
    })
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [docRes, violRes] = await Promise.all([documentApi.getById(documentId), documentApi.getViolations(documentId).catch(() => ({ data: { violations: [] } }))])
      setContractDoc((docRes.data?.document || docRes.data?.data || docRes.data) as ExportableDocument)
      const rawViols = violRes.data?.violations || violRes.data?.items || violRes.data?.data || []
      setViolations(Array.isArray(rawViols) ? rawViols : [])
      if (Array.isArray(rawViols) && rawViols.length > 0 && activeViolationId === null) setActiveViolationId(rawViols[0].id)
    } catch { toast.error('Không thể tải dữ liệu.') } finally { setLoading(false) }
  }, [documentId, activeViolationId])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredViolations = violations.filter(v => {
    if (filterRisk && v.risk_level !== filterRisk) return false
    if (filterStatus && v.status !== filterStatus) return false
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      if (!cleanVietnamesePdfText(v.violation_desc).toLowerCase().includes(q) && !cleanVietnamesePdfText(v.evidence_quote).toLowerCase().includes(q) && !(v.Standards?.standard_code || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const activeViolation = filteredViolations.find(v => v.id === activeViolationId) || violations.find(v => v.id === activeViolationId) || filteredViolations[0] || violations[0] || null

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
        title: 'AI hoàn tất rà soát hợp đồng — Chờ thẩm định',
        message: `Hợp đồng "${contractDoc.file_name}" (${contractDoc.Suppliers?.company_name || 'Đối tác'}) vừa được AI phân tích xong với ${count} cảnh báo. Đề nghị Manager/Admin vào thẩm định.`,
        documentId,
        violationCount: count,
      })
      await fetchData()
    } catch { toast.error('Phân tích AI thất bại.', { id: 'ai-scan' }) } finally { setAnalyzing(false) }
  }

  const handleConfirmReview = async () => {
    if (!confirmReview) return
    setReviewLoading(true)
    try {
      const res = await violationApi.review(confirmReview.id, confirmReview.status)
      const result = res.data?.data || res.data
      const newRisk: number | null = result?.newRiskScore ?? result?.supplier_risk_score ?? null
      toast.success(
        confirmReview.status === 'Approved'
          ? `Đã phê duyệt vi phạm! Điểm tín nhiệm đối tác: ${newRisk !== null ? `${newRisk}đ` : 'Đã cập nhật'}.`
          : 'Đã bác bỏ cảnh báo vi phạm.'
      )
      publishEvent({
        type: 'NEW_VIOLATION',
        title: confirmReview.status === 'Approved' ? 'Quản lý đã phê duyệt vi phạm' : 'Quản lý đã bác bỏ cảnh báo',
        message: `Cảnh báo tại hợp đồng "${contractDoc?.file_name || '#'}" đã chuyển sang trạng thái ${confirmReview.status === 'Approved' ? 'Đã phê duyệt' : 'Đã bác bỏ'}${newRisk !== null ? ` (Điểm tín nhiệm: ${newRisk}đ)` : ''}.`,
        documentId,
      })
      await fetchData()
      setConfirmReview(null)
    } catch { toast.error('Thẩm định thất bại.') } finally { setReviewLoading(false) }
  }

  const handleBatchApproveAllPending = async () => {
    const pendingList = violations.filter(v => v.status === 'Pending')
    if (pendingList.length === 0) return
    setBatchReviewing(true)
    toast.loading(`Đang phê duyệt ${pendingList.length} lỗi chờ...`, { id: 'batch-review' })
    try {
      for (const item of pendingList) await violationApi.review(item.id, 'Approved')
      toast.success(`Đã phê duyệt toàn bộ ${pendingList.length} vi phạm!`, { id: 'batch-review' })
      publishEvent({
        type: 'NEW_VIOLATION',
        title: 'Quản lý đã phê duyệt hàng loạt vi phạm',
        message: `Toàn bộ ${pendingList.length} cảnh báo chờ duyệt của hợp đồng "${contractDoc?.file_name || '#'}" đã được phê duyệt.`,
        documentId,
      })
      await fetchData()
    } catch { toast.error('Lỗi duyệt hàng loạt.', { id: 'batch-review' }) } finally { setBatchReviewing(false) }
  }

  const pendingCount = violations.filter((v) => v.status === 'Pending').length
  const highCount = violations.filter((v) => v.risk_level === 'High').length
  
  const penaltyPoints = violations
  .filter((v) => v.status === 'Approved')
  .reduce((sum, v) => sum + (v.risk_level === 'High' ? 10 : v.risk_level === 'Medium' ? 5 : 2), 0)
const currentScore = Math.max(0, 100 - penaltyPoints)
  
  const pendingPenaltyPoints = violations
    .filter((v) => v.status === 'Pending')
    .reduce((sum, v) => sum + (v.risk_level === 'High' ? 10 : v.risk_level === 'Medium' ? 5 : 2), 0)
  const simulatedNextScore = Math.max(0, currentScore - pendingPenaltyPoints)

  const backendOrigin = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '')
  const pdfUrl = contractDoc && contractDoc.storage_url ? `${backendOrigin}/${contractDoc.storage_url.replace(/^\/+/, '')}` : ''

  if (loading) return <MainLayout breadcrumb="Phòng Kiểm toán AI"><div className="flex justify-center h-64"><Spinner size="lg" /></div></MainLayout>
  if (!contractDoc) return <MainLayout breadcrumb="Phòng Kiểm toán AI"><EmptyState message="Không tìm thấy hợp đồng" /></MainLayout>

  const activeKpiTab = filterStatus === '' && filterRisk === '' ? 'all' : filterStatus === 'Pending' ? 'pending' : filterRisk === 'High' ? 'high' : 'custom'

  return (
    <MainLayout breadcrumb={`Kiểm toán: ${contractDoc.file_name}`}>
      {/* ── Top Action Bar: Nút Bảng Tổng Hợp đứng yên, đổi màu mượt khi rê chuột (Không nhấp nháy) ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <button type="button" onClick={() => navigate('/documents')} className="inline-flex items-center gap-1.5 text-xs font-extrabold text-Pine bg-white px-3.5 py-2 rounded-2xl border border-Mist/40 hover:bg-Snowflake transition-colors shadow-sm">
          <ChevronLeft className="w-4 h-4" /> Quay lại Kho PDF
        </button>
        {hasPermission('EXPORT_REPORT') && (
          <button
            type="button"
            onClick={() => navigate(`/audit/${documentId}/summary`)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-Berry text-white text-xs font-extrabold rounded-2xl hover:bg-Branch transition-colors duration-200 shadow-sm"
          >
            <ClipboardCheck className="w-4 h-4 text-Sunny" />
            Báo Cáo Thẩm Định Tổng Hợp
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex md:hidden mb-3 bg-white p-1 rounded-2xl border border-Mist/25">
        <button onClick={() => setActiveTab('violations')} className={`flex-1 py-2 text-xs font-extrabold rounded-xl ${activeTab === 'violations' ? 'bg-Pine text-white shadow-sm' : 'text-Branch'}`}>Cảnh báo AI</button>
        <button onClick={() => setActiveTab('pdf')} className={`flex-1 py-2 text-xs font-extrabold rounded-xl ${activeTab === 'pdf' ? 'bg-Pine text-white shadow-sm' : 'text-Branch'}`}>Tài liệu PDF</button>
      </div>

      <div className="flex gap-4 h-[calc(100vh-175px)]">
        {/* LEFT COLUMN */}
        <div className={`flex flex-col w-full md:w-[48%] ${activeTab === 'pdf' ? 'hidden md:flex' : 'flex'}`}>
          <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(10,16,32,0.06)] p-4 mb-3 flex-shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-Pine flex-shrink-0" />
                  <h2 className="text-sm font-extrabold text-Pine truncate">{contractDoc.file_name}</h2>
                  <StatusBadge status={contractDoc.status || 'Analyzed'} />
                </div>
                <p className="text-xs text-Mist">Đối tác: <strong className="text-Branch">{contractDoc.Suppliers?.company_name || '—'}</strong></p>
                <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-Snowflake/40 px-3 py-2 rounded-2xl border border-Mist/20">
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-Branch mb-1">Điểm tín nhiệm hiện tại:</p>
                    <RiskScoreBar score={currentScore} />
                  </div>
                  {pendingCount > 0 && (
                    <div className="text-right flex-shrink-0 border-t sm:border-t-0 sm:border-l border-Mist/25 pt-1.5 sm:pt-0 sm:pl-3">
                      <span className="text-[10px] font-bold text-Mist block">Dự báo sau duyệt:</span>
                      <span className="text-xs font-extrabold text-Berry flex items-center justify-end gap-1"><TrendingDown className="w-3.5 h-3.5" />{simulatedNextScore}đ (-{pendingPenaltyPoints}đ)</span>
                    </div>
                  )}
                </div>
              </div>
              {hasPermission('RUN_AI_AUDIT') && (
                <button type="button" onClick={handleAnalyze} disabled={analyzing || contractDoc.status === 'Analyzing'} className="flex items-center gap-1.5 px-4 py-2.5 bg-Berry text-white text-xs font-extrabold rounded-2xl hover:bg-Merlot disabled:opacity-60 transition-colors shadow-sm">
                  {analyzing ? <Spinner size="sm" /> : <RefreshCw className="w-3.5 h-3.5" />} Quét AI
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 bg-Snowflake/60 p-1.5 rounded-2xl border border-Mist/25">
              <button onClick={() => { setFilterStatus(''); setFilterRisk('') }} className={`text-center rounded-xl py-2 px-2 transition-all ${activeKpiTab === 'all' ? 'bg-Pine text-white shadow-md' : 'bg-white/70 text-Branch'}`}>
                <div className="text-lg font-extrabold">{violations.length}</div>
                <div className="text-[11px] font-bold">Tổng cảnh báo</div>
              </button>
              <button onClick={() => { setFilterStatus('Pending'); setFilterRisk('') }} className={`text-center rounded-xl py-2 px-2 transition-all ${activeKpiTab === 'pending' ? 'bg-Sunny text-Branch shadow-md ring-2 ring-Branch/15' : 'bg-white/70 text-Branch'}`}>
                <div className="text-lg font-extrabold">{pendingCount}</div>
                <div className="text-[11px] font-bold">Chờ duyệt</div>
              </button>
              <button onClick={() => { setFilterRisk('High'); setFilterStatus('') }} className={`text-center rounded-xl py-2 px-2 transition-all ${activeKpiTab === 'high' ? 'bg-Berry text-white shadow-md' : 'bg-white/70 text-Branch'}`}>
                <div className="text-lg font-extrabold">{highCount}</div>
                <div className="text-[11px] font-bold">Rủi ro Cao</div>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-3 flex-shrink-0">
            <div className="relative flex-1"><Search className="w-3.5 h-3.5 text-Mist absolute left-3 top-1/2 -translate-y-1/2" /><input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Tìm mã chuẩn, từ khóa..." className="w-full pl-8 pr-3 py-2 border border-Mist/40 rounded-xl text-xs bg-white text-Branch focus:outline-none focus:border-Pine" /></div>
            <div className="flex gap-2">
              <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)} className="px-2.5 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Branch focus:outline-none focus:border-Pine"><option value="">Mọi mức độ</option><option value="High">Cao</option><option value="Medium">Trung bình</option><option value="Low">Thấp</option></select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-2.5 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Branch focus:outline-none focus:border-Pine"><option value="">Mọi trạng thái</option><option value="Pending">Chờ duyệt</option><option value="Approved">Đã duyệt</option><option value="Rejected">Bác bỏ</option></select>
              {hasPermission('APPROVE_VIOLATION') && pendingCount > 1 && <button onClick={handleBatchApproveAllPending} disabled={batchReviewing} className="px-3 py-2 bg-Berry text-white text-xs font-extrabold rounded-xl hover:bg-Merlot transition-colors shadow-sm"><Layers className="w-3.5 h-3.5 inline mr-1" />Duyệt hết</button>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {filteredViolations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 bg-white rounded-3xl border border-Mist/20 text-Mist px-4 text-center">
                <AlertTriangle className="w-10 h-10 mb-3 text-Pine/40" />
                <p className="text-sm font-bold text-Branch">{violations.length === 0 ? 'Hợp đồng này không có cảnh báo vi phạm nào.' : 'Không có cảnh báo nào trong Tab / bộ lọc đang chọn.'}</p>
                {(filterRisk || filterStatus || searchQuery) && <button onClick={() => { setFilterRisk(''); setFilterStatus(''); setSearchQuery('') }} className="mt-3 px-3.5 py-1.5 rounded-xl bg-Pine text-white text-xs font-extrabold">Xem lại tất cả</button>}
              </div>
            ) : (
              filteredViolations.map((v, idx) => (
                <ViolationCard key={v.id} index={idx} violation={v} isActive={activeViolation?.id === v.id} customRedline={customRedlines[v.id]} onSaveRedline={handleSaveRedline} onClick={() => { setActiveViolationId(v.id); if (window.innerWidth < 768) setActiveTab('pdf') }} onReview={(vid, status) => setConfirmReview({ id: vid, status })} canApprove={hasPermission('APPROVE_VIOLATION')} />
              ))
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className={`flex-1 rounded-3xl overflow-hidden border border-Mist/30 shadow-[0_10px_28px_rgba(10,16,32,0.08)] ${activeTab === 'violations' ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
          {pdfUrl ? <SplitPDFViewer pdfUrl={pdfUrl} activeViolation={activeViolation} /> : <div className="flex-1 flex items-center justify-center bg-Snowflake"><p className="text-sm text-Mist">Không tìm thấy đường dẫn file PDF</p></div>}
        </div>
      </div>

      <ConfirmModal isOpen={!!confirmReview} title={confirmReview?.status === 'Approved' ? 'Phê duyệt vi phạm & Trừ điểm?' : 'Bác bỏ cảnh báo AI?'} message={confirmReview?.status === 'Approved' ? 'Xác nhận điều khoản này vi phạm tiêu chuẩn. Điểm rủi ro sẽ bị trừ ngay lập tức.' : 'Bác bỏ cảnh báo này (False Positive).'} confirmLabel={confirmReview?.status === 'Approved' ? 'Phê duyệt – Trừ điểm' : 'Bác bỏ cảnh báo'} variant={confirmReview?.status === 'Approved' ? 'danger' : 'warning'} onConfirm={handleConfirmReview} onCancel={() => setConfirmReview(null)} />
      {reviewLoading && <div className="fixed inset-0 z-50 flex items-center justify-center bg-Branch/20 backdrop-blur-sm"><Spinner size="lg" /></div>}
    </MainLayout>
  )
}