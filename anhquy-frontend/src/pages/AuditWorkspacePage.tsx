import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ChevronLeft, AlertTriangle, CheckCircle2, XCircle,
  Shield, Globe, MapPin, BookOpen, MessageSquare, Lightbulb,
  RefreshCw, Filter, ChevronDown, ChevronUp, FileText
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
  storage_url: string
  status: string
  last_analyzed_at: string | null
  Suppliers?: { id: number; company_name: string; risk_score: number | null }
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

// ─── Risk level styles ────────────────────────────────────────────────────────

const RISK_STYLES: Record<string, { card: string; badge: string; dot: string }> = {
  High:   { card: 'border-l-4 border-l-Berry bg-Berry/5',         badge: 'bg-Berry text-white',     dot: 'bg-Berry animate-pulse' },
  Medium: { card: 'border-l-4 border-l-amber-500 bg-amber-50/40', badge: 'bg-amber-500 text-white', dot: 'bg-amber-500' },
  Low:    { card: 'border-l-4 border-l-Mist bg-Snowflake/40',     badge: 'bg-Mist text-white',      dot: 'bg-Mist' },
}

// ─── Violation Card ───────────────────────────────────────────────────────────

function ViolationCard({
  violation,
  isActive,
  onClick,
  onReview,
  canApprove,
}: {
  violation: Violation
  isActive: boolean
  onClick: () => void
  onReview: (id: number, status: 'Approved' | 'Rejected') => void
  canApprove: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const s = RISK_STYLES[violation.risk_level] || RISK_STYLES.Low

  return (
    <div
      className={`rounded-lg border border-Mist/20 mb-3 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer bg-white
        ${s.card} ${isActive ? 'ring-2 ring-Pine shadow-md' : ''}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${s.badge}`}>
              {violation.risk_level === 'High' ? 'Cao (High)' : violation.risk_level === 'Medium' ? 'Trung bình' : 'Thấp (Low)'}
            </span>
            {violation.Standards && (
              <span className="text-xs font-mono text-Pine bg-Pine/8 px-1.5 py-0.5 rounded truncate font-semibold">
                {violation.Standards.standard_code}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {violation.page_number && (
              <span className="text-xs font-semibold text-Pine bg-Frostysilver/50 px-2 py-0.5 rounded">
                Trang {violation.page_number}
              </span>
            )}
            <StatusBadge status={violation.status} />
          </div>
        </div>

        {/* Standard name */}
        {violation.Standards && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${violation.Standards.jurisdiction === 'VN' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {violation.Standards.jurisdiction === 'VN' ? <MapPin className="w-2.5 h-2.5 inline" /> : <Globe className="w-2.5 h-2.5 inline" />}
              {' '}{violation.Standards.jurisdiction || 'Global'}
            </span>
            <span className="text-xs font-semibold text-Pine line-clamp-1">{violation.Standards.name}</span>
          </div>
        )}

        {/* Violation description */}
        <p className={`text-sm text-Branch leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
          {violation.violation_desc}
        </p>
      </div>

      {/* Evidence quote */}
      <div className="px-3 pb-2">
        <div className="bg-Frostysilver/40 border border-Berry/20 rounded-md p-2.5 text-xs text-Branch italic">
          <BookOpen className="w-3.5 h-3.5 inline mr-1.5 text-Berry" />
          "{violation.evidence_quote && violation.evidence_quote.length > 160 && !expanded
            ? violation.evidence_quote.substring(0, 160) + '…'
            : violation.evidence_quote}"
        </div>
      </div>

      {/* Expanded: recommendation + actions */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {violation.recommendation && (
            <div className="flex gap-2 bg-Pine/5 border border-Pine/10 rounded-md p-2.5">
              <Lightbulb className="w-4 h-4 text-Pine mt-0.5 flex-shrink-0" />
              <p className="text-xs text-Branch leading-relaxed">
                <strong className="text-Pine">Khuyến nghị sửa đổi: </strong>
                {violation.recommendation}
              </p>
            </div>
          )}
          {/* Manager actions */}
          {canApprove && violation.status === 'Pending' && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReview(violation.id, 'Approved') }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-Berry text-white text-xs font-medium rounded-md hover:bg-Berry/90 transition-all shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Phê duyệt lỗi – Trừ điểm
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReview(violation.id, 'Rejected') }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-Mist/40 text-Branch text-xs font-medium rounded-md hover:bg-Snowflake transition-all bg-white"
              >
                <XCircle className="w-3.5 h-3.5 text-Mist" />
                Bác bỏ cảnh báo
              </button>
            </div>
          )}
          {violation.status !== 'Pending' && violation.Users && (
            <p className="text-xs text-Mist">
              Đã thẩm định bởi: <span className="font-medium text-Branch">{violation.Users.full_name}</span>
              {violation.reviewed_at && ` • ${new Date(violation.reviewed_at).toLocaleDateString('vi-VN')}`}
            </p>
          )}
        </div>
      )}

      {/* Toggle expand */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        className="w-full py-1.5 flex items-center justify-center gap-1 text-xs text-Mist hover:text-Branch hover:bg-Frostysilver/20 transition-colors border-t border-Mist/10"
      >
        {expanded ? <><ChevronUp className="w-3 h-3" />Thu gọn</> : <><ChevronDown className="w-3 h-3" />Xem chi tiết & Thẩm định</>}
      </button>
    </div>
  )
}

// ─── Split PDF Viewer with Evidence Highlighting Banner ───────────────────────

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
      {activeEvidence ? (
        <div className="bg-Frostysilver px-4 py-2.5 flex items-start gap-2.5 border-b-2 border-Berry animate-pulse">
          <Shield className="w-4 h-4 text-Berry flex-shrink-0 mt-0.5" />
          <div className="text-xs text-Pine flex-1">
            <span className="font-bold text-Berry uppercase mr-1.5">
              Bằng chứng đang định vị {activePage ? `(Trang ${activePage})` : ''}:
            </span>
            <span className="italic font-medium bg-amber-200/80 px-1.5 py-0.5 rounded text-Pine">
              "{activeEvidence}"
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-Pine text-Snowflake/80 px-4 py-2 text-xs flex items-center justify-between border-b border-white/10">
          <span>Trình xem Hợp đồng PDF gốc (Click vào thẻ vi phạm bên trái để tự động cuộn tới trang bằng chứng)</span>
        </div>
      )}
      <div className="flex-1 relative bg-gray-700">
        <iframe
          key={computedSrc}
          ref={iframeRef}
          src={computedSrc}
          className="w-full h-full border-0"
          title="PDF Viewer"
        />
        {activeEvidence && (
          <div className="absolute bottom-4 right-4 max-w-sm bg-white/95 rounded-lg shadow-lg border-2 border-Berry p-3.5">
            <div className="flex items-start gap-2">
              <MessageSquare className="w-4 h-4 text-Berry mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-Berry mb-1">
                  Đoạn văn bản vi phạm {activePage ? `· Trang ${activePage}` : ''}
                </p>
                <p className="text-xs text-Pine bg-Frostysilver/40 p-2 rounded italic leading-relaxed">
                  "{activeEvidence}"
                </p>
              </div>
            </div>
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
  const { hasPermission } = useAuth()
  const { publishEvent } = useRealtime()

  const [contractDoc, setContractDoc] = useState<DocumentDetail | null>(null)
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [activeViolationId, setActiveViolationId] = useState<number | null>(null)
  const [activeEvidence, setActiveEvidence] = useState<string | null>(null)
  const [activePage, setActivePage] = useState<number | null>(null)
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
    setActiveViolationId(v.id)
    setActiveEvidence(v.evidence_quote)
    setActivePage(v.page_number)
    if (window.innerWidth < 768) {
      setActiveTab('pdf')
    }
  }

  const handleAnalyze = async () => {
    if (!contractDoc) return
    setAnalyzing(true)
    toast.loading('AI RAG + Gemini 1.5 Flash đang rà soát hợp đồng...', { id: 'ai-scan' })
    try {
      const res = await documentApi.analyze(documentId)
      const count = res.data?.violations_count ?? res.data?.violations?.length ?? 0
      toast.success(`AI rà soát hoàn tất! Phát hiện ${count} điểm rủi ro.`, { id: 'ai-scan' })
      publishEvent({
        type: 'AI_SCAN_COMPLETED',
        title: 'AI hoàn tất rà soát hợp đồng',
        message: `Hợp đồng "${contractDoc.file_name}" đã được phân tích (${count} cảnh báo). Vui lòng thẩm định.`,
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
        toast.success(
          `Đã bác bỏ cảnh báo vi phạm. Điểm rủi ro hiện tại: ${newRisk ?? oldRisk}.`
        )
      }

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
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate('/documents')}
        className="flex items-center gap-2 text-sm text-Mist hover:text-Pine transition-colors mb-3"
      >
        <ChevronLeft className="w-4 h-4" />
        Quay lại Kho hợp đồng
      </button>

      {/* Mobile tabs */}
      <div className="flex md:hidden mb-3 border-b border-Mist/20 bg-white rounded-t-md">
        {[
          { key: 'violations', label: `Cảnh báo AI (${filteredViolations.length})` },
          { key: 'pdf',        label: 'Tài liệu PDF' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`flex-1 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'text-Pine border-b-2 border-Pine'
                : 'text-Mist hover:text-Branch'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Split-view layout */}
      <div className="flex gap-4 h-[calc(100vh-175px)]">
        {/* ── Left Column: Violations ── */}
        <div className={`flex flex-col w-full md:w-1/2 ${activeTab === 'pdf' ? 'hidden md:flex' : 'flex'}`}>
          {/* Document info + risk score */}
          <div className="bg-white rounded-lg border border-Mist/20 shadow-sm p-4 mb-3 flex-shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-Pine flex-shrink-0" />
                  <h2 className="text-sm font-bold text-Pine truncate">{contractDoc.file_name}</h2>
                  <StatusBadge status={contractDoc.status} />
                </div>
                <p className="text-xs text-Mist">
                  Đối tác: <strong className="text-Branch">{contractDoc.Suppliers?.company_name || '—'}</strong> · Loại: {contractDoc.Categories?.name || '—'}
                </p>
                {contractDoc.Suppliers && (
                  <div className="mt-2.5">
                    <p className="text-xs text-Mist mb-1">Điểm tín nhiệm & Rủi ro nhà cung ứng:</p>
                    <RiskScoreBar score={contractDoc.Suppliers.risk_score} />
                  </div>
                )}
              </div>
              {hasPermission('RUN_AI_AUDIT') && (
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzing || contractDoc.status === 'Analyzing'}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-Pine text-white text-xs font-medium rounded-md hover:bg-Pine/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex-shrink-0 shadow-sm"
                >
                  {analyzing ? (
                    <Spinner size="sm" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  {violations.length > 0 ? 'Quét lại AI' : 'Chạy quét AI'}
                </button>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                { label: 'Tổng cảnh báo', count: violations.length, color: 'text-Pine' },
                { label: 'Chờ Manager duyệt', count: pendingCount, color: 'text-amber-600' },
                { label: 'Mức độ Cao (High)', count: violations.filter((v) => v.risk_level === 'High').length, color: 'text-Berry' },
              ].map(({ label, count, color }) => (
                <div key={label} className="text-center bg-Snowflake/60 rounded-md py-1.5 border border-Mist/15">
                  <div className={`text-lg font-bold ${color}`}>{count}</div>
                  <div className="text-[11px] text-Mist">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-3 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-Mist" />
            </div>
            <select
              value={filterRisk}
              onChange={(e) => setFilterRisk(e.target.value)}
              className="flex-1 px-2.5 py-1.5 border border-Mist/40 rounded-md text-xs bg-white text-Branch focus:outline-none focus:ring-1 focus:ring-Pine/30"
            >
              <option value="">Tất cả mức độ rủi ro</option>
              <option value="High">Cao (High - Trừ 10đ)</option>
              <option value="Medium">Trung bình (Medium - Trừ 5đ)</option>
              <option value="Low">Thấp (Low - Trừ 2đ)</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="flex-1 px-2.5 py-1.5 border border-Mist/40 rounded-md text-xs bg-white text-Branch focus:outline-none focus:ring-1 focus:ring-Pine/30"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="Pending">Chờ duyệt (Pending)</option>
              <option value="Approved">Đã duyệt (Approved)</option>
              <option value="Rejected">Bác bỏ (Rejected)</option>
            </select>
          </div>

          {/* Violation list */}
          <div className="flex-1 overflow-y-auto pr-1">
            {filteredViolations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 bg-white rounded-lg border border-Mist/20 text-Mist">
                <AlertTriangle className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium text-Branch">
                  {violations.length === 0
                    ? 'Chưa có cảnh báo vi phạm nào. Hãy bấm "Chạy quét AI" để phân tích hợp đồng.'
                    : 'Không có vi phạm phù hợp với bộ lọc.'}
                </p>
              </div>
            ) : (
              filteredViolations.map((v) => (
                <ViolationCard
                  key={v.id}
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

        {/* ── Right Column: PDF Viewer (Hidden on Mobile unless PDF tab selected) ── */}
        <div className={`flex-1 rounded-lg overflow-hidden border border-Mist/30 shadow-sm ${activeTab === 'violations' ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
          {pdfUrl ? (
            <SplitPDFViewer
              pdfUrl={pdfUrl}
              activeEvidence={activeEvidence}
              activePage={activePage}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-100">
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