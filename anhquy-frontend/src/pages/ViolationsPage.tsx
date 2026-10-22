import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Download, Printer, Eye, CheckCircle2, XCircle,
  FileText, Building2, AlertTriangle, ExternalLink, Search,
  BarChart3, Clock, ChevronDown, ChevronUp, Layers, ListFilter
} from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { ConfirmModal, Modal, Pagination, StatusBadge, Spinner, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useRealtime } from '../context/RealtimeContext'
import { violationApi, supplierApi, documentApi } from '../api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Violation {
  id: number
  document_id?: number
  risk_level: 'High' | 'Medium' | 'Low'
  status: 'Pending' | 'Approved' | 'Rejected'
  violation_desc: string
  evidence_quote: string
  page_number: number | null
  recommendation: string | null
  reviewed_at: string | null
  created_at: string
  Documents?: {
    id: number
    file_name: string
    Suppliers?: { id: number; company_name: string }
  }
  Standards?: {
    id: number
    standard_code: string
    name: string
    jurisdiction: string | null
  }
  Users?: { id: number; full_name: string }
}

interface Supplier { id: number; company_name: string }
interface DocOption { id: number; file_name: string }

// Làm sạch ký tự xuống dòng và khoảng trắng thừa từ PDF
function cleanText(str: string | null | undefined): string {
  if (!str) return ''
  return str.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Xuất File Excel (.xls) Có Kẻ Bảng & Chia Cột Chuẩn 100% ──────────────────

function exportViolationsToExcel(violations: Violation[]) {
  const rowsHtml = violations
    .map((v, idx) => {
      const riskText = v.risk_level === 'High' ? 'Cao (-10đ)' : v.risk_level === 'Medium' ? 'Trung bình (-5đ)' : 'Thấp (-2đ)'
      const riskColor = v.risk_level === 'High' ? '#791127' : v.risk_level === 'Medium' ? '#B45309' : '#334155'
      const statusText = v.status === 'Pending' ? 'Chờ thẩm định' : v.status === 'Approved' ? 'Đã phê duyệt' : 'Đã bác bỏ'
      const statusBg = v.status === 'Approved' ? '#DCFCE7' : v.status === 'Pending' ? '#FEF3C7' : '#F1F5F9'

      return `
        <tr>
          <td style="text-align:center;font-weight:bold">${idx + 1}</td>
          <td style="font-weight:bold;color:#0B132B">${escapeHtml(v.Documents?.Suppliers?.company_name || '—')}</td>
          <td>${escapeHtml(v.Documents?.file_name || '—')}</td>
          <td style="font-family:Consolas,monospace;font-weight:bold">${escapeHtml(v.Standards?.standard_code || '—')}</td>
          <td>${escapeHtml(v.Standards?.name || '—')}</td>
          <td style="font-weight:bold;color:${riskColor};text-align:center">${riskText}</td>
          <td style="background:${statusBg};text-align:center;font-weight:bold">${statusText}</td>
          <td style="text-align:center">${v.page_number ?? '—'}</td>
          <td>${escapeHtml(cleanText(v.violation_desc))}</td>
          <td style="font-style:italic;color:#334155">"${escapeHtml(cleanText(v.evidence_quote))}"</td>
          <td>${escapeHtml(cleanText(v.recommendation))}</td>
          <td style="text-align:center">${new Date(v.created_at).toLocaleDateString('vi-VN')}</td>
        </tr>`
    })
    .join('')

  const excelHtml = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <style>
      body { font-family: "Times New Roman", Arial, sans-serif; font-size: 11pt; }
      table { border-collapse: collapse; width: 100%; }
      th { background-color: #0B132B; color: #FFFFFF; font-weight: bold; padding: 10px 8px; border: 1px solid #334155; text-align: center; vertical-align: middle; }
      td { padding: 8px; border: 1px solid #CBD5E1; vertical-align: top; mso-number-format:"\\@"; }
      .title { font-size: 16pt; font-weight: bold; color: #0B132B; text-align: left; border: none; padding: 6px 0; }
      .subtitle { font-size: 10pt; color: #475569; text-align: left; border: none; padding-bottom: 12px; }
    </style>
  </head>
  <body>
    <table>
      <tr><td colspan="12" class="title">BÁO CÁO THẨM ĐỊNH VI PHẠM HỢP ĐỒNG & ĐẠO ĐỨC CHUỖI CUNG ỨNG (ANHQUY AI)</td></tr>
      <tr><td colspan="12" class="subtitle">Ngày kết xuất: ${new Date().toLocaleString('vi-VN')} · Tổng số cảnh báo: ${violations.length}</td></tr>
      <thead>
        <tr>
          <th style="width:45px">STT</th>
          <th style="width:220px">Nhà cung ứng</th>
          <th style="width:210px">Tên Hợp đồng PDF</th>
          <th style="width:110px">Mã Chuẩn</th>
          <th style="width:180px">Tên Tiêu chuẩn</th>
          <th style="width:100px">Mức độ</th>
          <th style="width:120px">Trạng thái</th>
          <th style="width:65px">Trang</th>
          <th style="width:280px">Mô tả vi phạm</th>
          <th style="width:300px">Bằng chứng trích xuất</th>
          <th style="width:260px">Khuyến nghị sửa đổi</th>
          <th style="width:95px">Ngày phát hiện</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </body>
  </html>`

  const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Bao-cao-vi-pham-ANHQUY-${new Date().toISOString().slice(0, 10)}.xls`
  a.click()
  URL.revokeObjectURL(url)
  toast.success('Đã xuất file Bảng tính Excel (.xls) có kẻ khung chuẩn xác!')
}

// ─── Print Report ─────────────────────────────────────────────────────────────

function printReport(violations: Violation[]) {
  const highCount   = violations.filter((v) => v.risk_level === 'High').length
  const mediumCount = violations.filter((v) => v.risk_level === 'Medium').length
  const lowCount    = violations.filter((v) => v.risk_level === 'Low').length

  const tableRows = violations.map((v, i) => `
    <tr style="border-bottom:1px solid #DCE0E8">
      <td style="padding:8px;font-size:12px;text-align:center">${i + 1}</td>
      <td style="padding:8px;font-size:12px;font-weight:bold">${v.Documents?.Suppliers?.company_name || '—'}</td>
      <td style="padding:8px;font-size:12px">${v.Standards?.standard_code || '—'}</td>
      <td style="padding:8px;font-size:12px;font-weight:bold;color:${v.risk_level==='High'?'#6B212C':v.risk_level==='Medium'?'#685652':'#27363F'}">
        ${v.risk_level === 'High' ? 'Cao' : v.risk_level === 'Medium' ? 'Trung bình' : 'Thấp'}
      </td>
      <td style="padding:8px;font-size:12px">${v.status === 'Pending' ? 'Chờ duyệt' : v.status === 'Approved' ? 'Đã duyệt' : 'Bác bỏ'}</td>
      <td style="padding:8px;font-size:12px">${cleanText(v.violation_desc)}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
  <title>Báo cáo Kiểm toán Chuỗi Cung ứng – ANHQUY</title>
  <style>body{font-family:"Be Vietnam Pro",sans-serif;margin:40px;color:#27363F}
    h1{font-size:22px;margin-bottom:4px}h2{font-size:16px;color:#685652;margin:20px 0 8px}
    table{width:100%;border-collapse:collapse}th{background:#27363F;color:white;padding:10px;text-align:left;font-size:12px}
    .stat{display:inline-block;background:#DCE0E8;border-radius:8px;padding:12px 20px;margin:4px;text-align:center}
    .stat .num{font-size:28px;font-weight:700}.footer{margin-top:40px;font-size:11px;color:#8EA1AE;text-align:center}
    @media print{button{display:none!important}}</style></head><body>
  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #27363F;padding-bottom:16px;margin-bottom:20px">
    <div>
      <div style="font-size:14px;color:#8EA1AE;letter-spacing:1px">HỆ THỐNG KIỂM TOÁN CHUỖI CUNG ỨNG</div>
      <h1>BÁO CÁO KIỂM TOÁN VI PHẠM HỢP ĐỒNG</h1>
      <div style="font-size:12px;color:#685652">Ngày xuất: ${new Date().toLocaleDateString('vi-VN')} · ANHQUY AI Audit · RBA Compliant</div>
    </div>
    <div style="text-align:right;font-size:28px;font-weight:900;color:#27363F;letter-spacing:-1px">ANHQUY</div>
  </div>
  <h2>TỔNG HỢP PHÂN TÍCH</h2>
  <div>
    <div class="stat"><div class="num" style="color:#27363F">${violations.length}</div><div>Tổng vi phạm</div></div>
    <div class="stat"><div class="num" style="color:#6B212C">${highCount}</div><div>Mức độ Cao</div></div>
    <div class="stat"><div class="num" style="color:#685652">${mediumCount}</div><div>Trung bình</div></div>
    <div class="stat"><div class="num" style="color:#27363F">${lowCount}</div><div>Thấp</div></div>
  </div>
  <h2>DANH SÁCH VI PHẠM</h2>
  <table><thead><tr><th style="width:40px">STT</th><th>Nhà cung ứng</th><th>Tiêu chuẩn</th><th>Mức độ</th><th>Trạng thái</th><th>Mô tả vi phạm</th></tr></thead>
  <tbody>${tableRows}</tbody></table>
  <div class="footer">Báo cáo tự động bởi ANHQUY AI Audit System · Bảo mật B2B</div>
  </body></html>`

  const win = window.open('', '_blank')
  if (!win) { toast.error('Trình duyệt đã chặn popup. Vui lòng cho phép popup để in báo cáo.'); return }
  win.document.write(html)
  win.document.close()
  win.onload = () => { win.print(); win.close() }
}

// ─── Violation Detail Modal ───────────────────────────────────────────────────

function ViolationDetailModal({
  violation,
  onClose,
}: {
  violation: Violation
  onClose: () => void
}) {
  return (
    <Modal isOpen={!!violation} title="Chi tiết Cảnh báo Vi phạm" onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <StatusBadge status={violation.risk_level} />
          <StatusBadge status={violation.status} />
          {violation.page_number && (
            <span className="text-xs font-extrabold text-Pine bg-Snowflake px-2.5 py-1 rounded-xl">
              Trang {violation.page_number}
            </span>
          )}
        </div>
        {violation.Documents && (
          <div className="bg-Snowflake/60 rounded-2xl p-3.5 flex items-center justify-between border border-Mist/20">
            <div>
              <p className="text-xs text-Mist mb-0.5">Hợp đồng PDF</p>
              <p className="text-sm font-extrabold text-Pine">{violation.Documents.file_name}</p>
              {violation.Documents.Suppliers && (
                <p className="text-xs font-semibold text-Branch mt-0.5">{violation.Documents.Suppliers.company_name}</p>
              )}
            </div>
            <Link
              to={`/audit/${violation.Documents.id}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Pine/90 shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Mở PDF Split-view
            </Link>
          </div>
        )}
        {violation.Standards && (
          <div className="bg-Snowflake/60 rounded-2xl p-3.5 border border-Mist/20">
            <p className="text-xs text-Mist mb-1">Tiêu chuẩn áp dụng</p>
            <p className="text-sm font-mono text-Pine font-extrabold">{violation.Standards.standard_code}</p>
            <p className="text-sm font-semibold text-Branch mt-0.5">{violation.Standards.name}</p>
            <p className="text-xs text-Mist mt-0.5">Phạm vi: {violation.Standards.jurisdiction || 'Global'}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-Pine mb-1">Mô tả vi phạm</p>
          <p className="text-sm text-Branch leading-relaxed">{cleanText(violation.violation_desc)}</p>
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-Pine mb-1">Bằng chứng (Trích dẫn nguyên văn)</p>
          <div className="bg-Frostysilver/30 border border-Berry/20 rounded-2xl p-3.5">
            <p className="text-sm text-Pine italic">"{cleanText(violation.evidence_quote)}"</p>
          </div>
        </div>
        {violation.recommendation && (
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-Pine mb-1">Khuyến nghị sửa đổi</p>
            <div className="bg-Snowflake/50 border border-Mist/25 rounded-2xl p-3.5">
              <p className="text-sm text-Branch">{cleanText(violation.recommendation)}</p>
            </div>
          </div>
        )}
        {violation.status !== 'Pending' && (
          <div className="text-xs text-Mist border-t border-Mist/15 pt-3">
            Thẩm định bởi: <strong className="text-Pine">{violation.Users?.full_name || 'Quản lý'}</strong>
            {violation.reviewed_at && ` · ${new Date(violation.reviewed_at).toLocaleString('vi-VN')}`}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ViolationsPage() {
  const { hasPermission } = useAuth()
  const { publishEvent } = useRealtime()
  const [searchParams, setSearchParams] = useSearchParams()

  const [violations, setViolations] = useState<Violation[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [documents, setDocuments] = useState<DocOption[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)

  // Chế độ hiển thị: 'grouped' (Gom theo từng Công ty để không lặp lại tên công ty) hoặc 'flat'
  const [displayMode, setDisplayMode] = useState<'grouped' | 'flat'>('grouped')
  const [collapsedCompanies, setCollapsedCompanies] = useState<Set<string>>(new Set())

  const [search, setSearch]                 = useState('')
  const [filterRisk, setFilterRisk]         = useState('')
  const [filterStatus, setFilterStatus]     = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterDocument, setFilterDocument] = useState(() => searchParams.get('document_id') || '')

  const [detailViolation, setDetailViolation] = useState<Violation | null>(null)
  const [confirmReview, setConfirmReview] = useState<{ id: number; status: 'Approved' | 'Rejected' } | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)

  useEffect(() => {
    supplierApi.getAll({ limit: 500 }).then((r) => {
      const data = r.data?.data || r.data || {}
      setSuppliers((data as { items?: Supplier[] })?.items || [])
    }).catch(() => {})

    documentApi.getAll({ limit: 500 }).then((r) => {
      const data = r.data?.data || r.data || {}
      setDocuments((data as { items?: DocOption[] })?.items || [])
    }).catch(() => {})
  }, [])

  const fetchViolations = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean | undefined> = { page, limit }
      if (filterRisk) params.risk_level = filterRisk
      if (filterStatus) params.status = filterStatus
      if (filterSupplier) params.supplier_id = filterSupplier
      if (filterDocument) params.document_id = filterDocument

      const res = await violationApi.getAll(params)
      const data = res.data?.data || res.data || {}
      setViolations((data as { items?: Violation[] })?.items || [])
      setTotal((data as { total?: number })?.total || 0)
    } catch {
      toast.error('Không thể tải danh sách vi phạm.')
    } finally {
      setLoading(false)
    }
  }, [page, limit, filterRisk, filterStatus, filterSupplier, filterDocument])

  useEffect(() => { fetchViolations() }, [fetchViolations])

  const handleConfirmReview = async () => {
    if (!confirmReview) return
    setReviewLoading(true)
    try {
      const targetViolation = violations.find((v) => v.id === confirmReview.id)
      const res = await violationApi.review(confirmReview.id, confirmReview.status)
      const result = res.data?.data || res.data
      const newRisk: number | null =
        result?.supplier_risk_score ?? result?.newRiskScore ?? null

      if (confirmReview.status === 'Approved') {
        toast.success(
          newRisk !== null
            ? `Đã phê duyệt vi phạm! Điểm rủi ro đối tác cập nhật thành: ${newRisk} điểm.`
            : 'Đã phê duyệt vi phạm!'
        )
      } else {
        toast.success('Đã bác bỏ cảnh báo vi phạm.')
      }

      publishEvent({
        type: 'NEW_VIOLATION',
        title: confirmReview.status === 'Approved' ? 'Quản lý đã phê duyệt vi phạm' : 'Quản lý đã bác bỏ cảnh báo',
        message: `Vi phạm tại hợp đồng "${targetViolation?.Documents?.file_name || '#'}" vừa được chuyển sang trạng thái ${
          confirmReview.status === 'Approved' ? 'Đã duyệt' : 'Đã bác bỏ'
        }${newRisk !== null ? ` (Điểm đối tác: ${newRisk}đ)` : ''}.`,
        documentId: targetViolation?.Documents?.id,
      })

      setViolations((prev) =>
        prev.map((v) => v.id === confirmReview.id ? { ...v, status: confirmReview.status } : v)
      )
      setConfirmReview(null)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Thẩm định thất bại.')
    } finally {
      setReviewLoading(false)
    }
  }

  const handleExportExcel = async () => {
    toast.loading('Đang kết xuất bảng tính Excel...', { id: 'export' })
    try {
      const res = await violationApi.getAll({ limit: 1000 })
      const data = res.data?.data || res.data || {}
      const all: Violation[] = (data as { items?: Violation[] })?.items || violations
      exportViolationsToExcel(all)
      toast.dismiss('export')
    } catch {
      toast.error('Xuất báo cáo thất bại.', { id: 'export' })
    }
  }

  const handlePrint = async () => {
    const res = await violationApi.getAll({ limit: 1000 }).catch(() => null)
    const data = res?.data?.data || res?.data || {}
    const all: Violation[] = (data as { items?: Violation[] })?.items || violations
    printReport(all)
  }

  const displayedViolations = useMemo(() => {
    if (!search.trim()) return violations
    const q = search.trim().toLowerCase()
    return violations.filter(
      (v) =>
        (v.violation_desc || '').toLowerCase().includes(q) ||
        (v.evidence_quote || '').toLowerCase().includes(q) ||
        (v.Standards?.standard_code || '').toLowerCase().includes(q) ||
        (v.Documents?.Suppliers?.company_name || '').toLowerCase().includes(q)
    )
  }, [violations, search])

  // Gom nhóm theo từng Công ty để không lặp lại tên công ty trên mỗi dòng
  const companyGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        companyKey: string
        companyName: string
        items: Violation[]
        contracts: Map<number, string>
        highCount: number
        pendingCount: number
        approvedCount: number
      }
    >()

    displayedViolations.forEach((v) => {
      const cName = v.Documents?.Suppliers?.company_name || 'Đối tác chưa xác định'
      if (!map.has(cName)) {
        map.set(cName, {
          companyKey: cName,
          companyName: cName,
          items: [],
          contracts: new Map(),
          highCount: 0,
          pendingCount: 0,
          approvedCount: 0,
        })
      }
      const grp = map.get(cName)!
      grp.items.push(v)
      if (v.Documents?.id) {
        grp.contracts.set(v.Documents.id, v.Documents.file_name)
      }
      if (v.risk_level === 'High') grp.highCount++
      if (v.status === 'Pending') grp.pendingCount++
      if (v.status === 'Approved') grp.approvedCount++
    })

    // Ưu tiên đưa công ty còn nhiều lỗi Chờ duyệt lên đầu
    return Array.from(map.values()).sort((a, b) => b.pendingCount - a.pendingCount || b.items.length - a.items.length)
  }, [displayedViolations])

  const toggleCompanyCollapse = (key: string) => {
    setCollapsedCompanies((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const pendingCount = violations.filter((v) => v.status === 'Pending').length
  const highCount = violations.filter((v) => v.risk_level === 'High').length

  return (
    <MainLayout breadcrumb="Thẩm định Vi phạm">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-Pine tracking-tight">Trung tâm Thẩm định Vi phạm</h1>
            <p className="text-xs sm:text-sm text-Mist mt-0.5">
              Gom nhóm trực quan theo từng Nhà cung ứng giúp thẩm định nhanh mà không bị lặp thông tin
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Chuyển chế độ Gom nhóm theo Công ty vs Bảng phẳng */}
            <div className="flex items-center bg-white p-1 rounded-2xl border border-Mist/30 shadow-sm">
              <button
                type="button"
                onClick={() => setDisplayMode('grouped')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                  displayMode === 'grouped' ? 'bg-Pine text-white' : 'text-Branch hover:text-Pine'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Gom theo Công ty ({companyGroups.length})
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('flat')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                  displayMode === 'flat' ? 'bg-Pine text-white' : 'text-Branch hover:text-Pine'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Tất cả dòng
              </button>
            </div>

            {hasPermission('EXPORT_REPORT') && (
              <>
                <Link
                  to="/reports"
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-Berry text-white text-xs font-extrabold rounded-2xl hover:bg-Berry/90 transition-all shadow-sm"
                >
                  <BarChart3 className="w-4 h-4" />
                  Báo cáo theo Kỳ
                </Link>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-2xl hover:bg-Pine/90 transition-all shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Xuất Excel
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 border border-Mist/40 bg-white text-Pine text-xs font-extrabold rounded-2xl hover:bg-Snowflake transition-all shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  In nhanh
                </button>
              </>
            )}
          </div>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Pine text-white flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Tổng cảnh báo ({companyGroups.length} công ty)</p>
              <p className="text-xl font-extrabold text-Pine">{total}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Mist text-white flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Chờ Manager thẩm định</p>
              <p className="text-xl font-extrabold text-Pine">{pendingCount}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Berry text-white flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Vi phạm mức độ Cao (High)</p>
              <p className="text-xl font-extrabold text-Berry">{highCount}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-Mist absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm từ khóa, mã chuẩn..."
                className="w-full pl-9 pr-3 py-2 border border-Mist/40 rounded-xl text-xs bg-Snowflake/30 text-Pine focus:outline-none focus:border-Pine"
              />
            </div>

            <select
              value={filterRisk}
              onChange={(e) => { setFilterRisk(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
            >
              <option value="">Tất cả mức độ</option>
              <option value="High">Cao (High)</option>
              <option value="Medium">Trung bình (Medium)</option>
              <option value="Low">Thấp (Low)</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="Pending">Chờ thẩm định</option>
              <option value="Approved">Đã phê duyệt</option>
              <option value="Rejected">Đã bác bỏ</option>
            </select>

            <select
              value={filterSupplier}
              onChange={(e) => { setFilterSupplier(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
            >
              <option value="">Tất cả nhà cung ứng</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
            </select>

            <select
              value={filterDocument}
              onChange={(e) => {
                const val = e.target.value
                setFilterDocument(val)
                setPage(1)
                if (val) setSearchParams({ document_id: val })
                else setSearchParams({})
              }}
              className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
            >
              <option value="">Tất cả hợp đồng PDF</option>
              {documents.map((d) => <option key={d.id} value={d.id}>{d.file_name}</option>)}
            </select>
          </div>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════
            NỘI DUNG CHÍNH: CHẾ ĐỘ GOM NHÓM THEO CÔNG TY (MẶC ĐỊNH)
        ═════════════════════════════════════════════════════════════════════ */}
        {loading ? (
          <div className="flex justify-center py-16 bg-white rounded-3xl"><Spinner size="lg" /></div>
        ) : displayedViolations.length === 0 ? (
          <div className="bg-white rounded-3xl p-8">
            <EmptyState message="Không tìm thấy cảnh báo vi phạm nào" />
          </div>
        ) : displayMode === 'grouped' ? (
          <div className="space-y-4">
            {companyGroups.map((group) => {
              const isCollapsed = collapsedCompanies.has(group.companyKey)
              const contractEntries = Array.from(group.contracts.entries())

              return (
                <div
                  key={group.companyKey}
                  className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] overflow-hidden"
                >
                  {/* ── Thanh Header của từng Công ty (Chỉ hiện tên công ty 1 lần duy nhất) ── */}
                  <div
                    onClick={() => toggleCompanyCollapse(group.companyKey)}
                    className="px-5 py-4 bg-Snowflake/45 hover:bg-Snowflake/70 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-Mist/20"
                  >
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-Pine text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-extrabold text-Pine">
                            {group.companyName}
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-xl bg-Pine text-white text-xs font-extrabold">
                            {group.items.length} lỗi phát hiện
                          </span>
                        </div>

                        {/* Danh sách file PDF của công ty này */}
                        <div className="flex flex-wrap items-center gap-3 mt-1">
                          {contractEntries.map(([docId, fileName]) => (
                            <Link
                              key={docId}
                              to={`/audit/${docId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs font-bold text-Berry hover:underline"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              {fileName}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Các huy hiệu tóm tắt trạng thái của Công ty */}
                    <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
                      {group.highCount > 0 && (
                        <span className="px-3 py-1 rounded-xl bg-Berry/10 text-Berry border border-Berry/20 text-xs font-extrabold">
                          {group.highCount} Rủi ro Cao
                        </span>
                      )}
                      {group.pendingCount > 0 ? (
                        <span className="px-3 py-1 rounded-xl bg-amber-100 text-amber-800 text-xs font-extrabold">
                          {group.pendingCount} Chờ thẩm định
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-extrabold">
                          Đã xử lý xong ({group.approvedCount} duyệt)
                        </span>
                      )}

                      <button
                        type="button"
                        className="p-1.5 rounded-xl bg-white border border-Mist/30 text-Pine hover:bg-Pine hover:text-white transition-colors"
                        title={isCollapsed ? 'Mở rộng danh sách lỗi' : 'Thu gọn'}
                      >
                        {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* ── Bảng danh sách các lỗi bên trong Công ty (Không lặp lại cột Công ty) ── */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-Mist/15">
                        <thead>
                          <tr className="bg-Snowflake/25 text-left">
                            <th className="px-4 py-2.5 text-[11px] font-extrabold text-Mist uppercase tracking-wider w-12 text-center">STT</th>
                            <th className="px-4 py-2.5 text-[11px] font-extrabold text-Mist uppercase tracking-wider w-48">Mã & Tên Tiêu chuẩn</th>
                            <th className="px-4 py-2.5 text-[11px] font-extrabold text-Mist uppercase tracking-wider w-32">Mức độ</th>
                            <th className="px-4 py-2.5 text-[11px] font-extrabold text-Mist uppercase tracking-wider">Mô tả vi phạm & Bằng chứng</th>
                            <th className="px-4 py-2.5 text-[11px] font-extrabold text-Mist uppercase tracking-wider w-36">Trạng thái</th>
                            <th className="px-4 py-2.5 text-[11px] font-extrabold text-Mist uppercase tracking-wider w-32 text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-Mist/15 bg-white">
                          {group.items.map((v, idx) => (
                            <tr key={v.id} className="hover:bg-Snowflake/30 transition-colors">
                              <td className="px-4 py-3 text-xs font-extrabold text-Mist text-center">
                                {idx + 1}
                              </td>
                              <td className="px-4 py-3">
                                {v.Standards && (
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono text-xs font-extrabold text-Pine bg-Snowflake px-2 py-0.5 rounded-lg border border-Mist/25">
                                        {v.Standards.standard_code}
                                      </span>
                                      {v.page_number && (
                                        <span className="text-[11px] font-bold text-Berry bg-Berry/10 px-1.5 py-0.5 rounded">
                                          Tr.{v.page_number}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs font-semibold text-Branch mt-1 line-clamp-1" title={v.Standards.name}>
                                      {v.Standards.name}
                                    </p>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge status={v.risk_level} />
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-xs sm:text-sm font-semibold text-Pine line-clamp-2">
                                  {cleanText(v.violation_desc)}
                                </p>
                                {v.evidence_quote && (
                                  <p className="text-xs text-Mist italic line-clamp-1 mt-0.5">
                                    "{cleanText(v.evidence_quote)}"
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge status={v.status} />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setDetailViolation(v)}
                                    className="p-1.5 text-Pine bg-Snowflake/60 hover:bg-Pine hover:text-white rounded-xl transition-colors"
                                    title="Xem chi tiết"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  {hasPermission('APPROVE_VIOLATION') && v.status === 'Pending' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmReview({ id: v.id, status: 'Approved' })}
                                        className="px-2.5 py-1 bg-Berry text-white hover:bg-Berry/90 text-xs font-extrabold rounded-xl transition-colors flex items-center gap-1 shadow-sm"
                                        title="Phê duyệt lỗi – Trừ điểm"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Duyệt
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmReview({ id: v.id, status: 'Rejected' })}
                                        className="p-1.5 text-Branch bg-Snowflake hover:bg-Mist/30 rounded-xl transition-colors"
                                        title="Bác bỏ cảnh báo"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          /* ═══════════════════════════════════════════════════════════════════
             CHẾ ĐỘ 2: BẢNG PHẲNG TẤT CẢ DÒNG (KHI CẦN ĐỐI CHIẾU CHUNG)
          ═══════════════════════════════════════════════════════════════════ */
          <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] p-4 sm:p-5">
            <div className="overflow-x-auto rounded-2xl border border-Mist/20">
              <table className="min-w-full divide-y divide-Mist/15">
                <thead>
                  <tr className="bg-Pine text-white">
                    {['Nhà cung ứng / Hợp đồng', 'Tiêu chuẩn', 'Mức độ', 'Mô tả vi phạm', 'Trạng thái', 'Thao tác'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-Mist/15 bg-white">
                  {displayedViolations.map((v) => (
                    <tr key={v.id} className="hover:bg-Snowflake/35 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-bold text-Pine">{v.Documents?.Suppliers?.company_name || '—'}</p>
                        {v.Documents && (
                          <Link
                            to={`/audit/${v.Documents.id}`}
                            className="text-xs text-Mist hover:text-Pine hover:underline flex items-center gap-1 mt-0.5"
                          >
                            <FileText className="w-3 h-3" />{v.Documents.file_name}
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {v.Standards && (
                          <div>
                            <span className="font-mono text-xs font-extrabold text-Pine bg-Snowflake px-2 py-0.5 rounded-lg">
                              {v.Standards.standard_code}
                            </span>
                            <p className="text-xs text-Branch mt-1 max-w-[160px] truncate">{v.Standards.name}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={v.risk_level} />
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-xs sm:text-sm text-Branch max-w-[260px] line-clamp-2">{cleanText(v.violation_desc)}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={v.status} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailViolation(v)}
                            className="p-1.5 text-Pine hover:bg-Snowflake rounded-xl transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {hasPermission('APPROVE_VIOLATION') && v.status === 'Pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => setConfirmReview({ id: v.id, status: 'Approved' })}
                                className="p-1.5 text-Berry hover:bg-Berry/10 rounded-xl transition-colors"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmReview({ id: v.id, status: 'Rejected' })}
                                className="p-1.5 text-Branch hover:bg-Snowflake rounded-xl transition-colors"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && (
          <div className="bg-white rounded-3xl border border-white px-5 py-2 shadow-sm">
            <Pagination
              page={page}
              total={total}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={(nl) => { setLimit(nl); setPage(1) }}
            />
          </div>
        )}
      </div>

      {detailViolation && (
        <ViolationDetailModal violation={detailViolation} onClose={() => setDetailViolation(null)} />
      )}

      <ConfirmModal
        isOpen={!!confirmReview}
        title={confirmReview?.status === 'Approved' ? 'Phê duyệt vi phạm & Trừ điểm?' : 'Bác bỏ cảnh báo?'}
        message={
          confirmReview?.status === 'Approved'
            ? 'Xác nhận vi phạm và trừ điểm rủi ro nhà cung ứng ngay lập tức.'
            : 'Bác bỏ cảnh báo này. Điểm rủi ro sẽ không thay đổi.'
        }
        confirmLabel={confirmReview?.status === 'Approved' ? 'Phê duyệt – Trừ điểm' : 'Bác bỏ'}
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