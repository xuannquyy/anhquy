import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Filter, Download, Printer, Eye, CheckCircle2, XCircle,
  FileText, Building2, AlertTriangle, ExternalLink
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

const RISK_COLORS: Record<string, string> = {
  High:   'text-Berry',
  Medium: 'text-amber-600',
  Low:    'text-Mist',
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportToCSV(violations: Violation[]) {
  const BOM = '\uFEFF'
  const header = ['ID', 'Nhà cung ứng', 'Hợp đồng', 'Tiêu chuẩn', 'Mức độ', 'Trạng thái', 'Mô tả vi phạm', 'Bằng chứng', 'Trang', 'Khuyến nghị', 'Ngày tạo']
  const rows = violations.map((v) => [
    v.id,
    `"${(v.Documents?.Suppliers?.company_name || '').replace(/"/g, '""')}"`,
    `"${(v.Documents?.file_name || '').replace(/"/g, '""')}"`,
    `"${v.Standards?.standard_code || ''} – ${(v.Standards?.name || '').replace(/"/g, '""')}"`,
    v.risk_level === 'High' ? 'Cao' : v.risk_level === 'Medium' ? 'Trung bình' : 'Thấp',
    v.status === 'Pending' ? 'Chờ duyệt' : v.status === 'Approved' ? 'Đã duyệt' : 'Bác bỏ',
    `"${(v.violation_desc || '').replace(/"/g, '""')}"`,
    `"${(v.evidence_quote || '').replace(/"/g, '""')}"`,
    v.page_number || '',
    `"${(v.recommendation || '').replace(/"/g, '""')}"`,
    new Date(v.created_at).toLocaleDateString('vi-VN'),
  ])
  const content = BOM + [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bao-cao-kiem-toan-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.success('Đã xuất báo cáo CSV (UTF-8) thành công.')
}

// ─── Print Report ─────────────────────────────────────────────────────────────

function printReport(violations: Violation[]) {
  const highCount   = violations.filter((v) => v.risk_level === 'High').length
  const mediumCount = violations.filter((v) => v.risk_level === 'Medium').length
  const lowCount    = violations.filter((v) => v.risk_level === 'Low').length

  const tableRows = violations.map((v) => `
    <tr style="border-bottom:1px solid #eee">
      <td style="padding:8px;font-size:12px">${v.Documents?.Suppliers?.company_name || '—'}</td>
      <td style="padding:8px;font-size:12px">${v.Standards?.standard_code || '—'}</td>
      <td style="padding:8px;font-size:12px;font-weight:bold;color:${v.risk_level==='High'?'#6B212C':v.risk_level==='Medium'?'#F59E0B':'#8EA1AE'}">
        ${v.risk_level === 'High' ? 'Cao' : v.risk_level === 'Medium' ? 'Trung bình' : 'Thấp'}
      </td>
      <td style="padding:8px;font-size:12px">${v.status === 'Pending' ? 'Chờ duyệt' : v.status === 'Approved' ? 'Đã duyệt' : 'Bác bỏ'}</td>
      <td style="padding:8px;font-size:12px">${v.violation_desc || ''}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
  <title>Báo cáo Kiểm toán Chuỗi Cung ứng – ANHQUY</title>
  <style>body{font-family:"Be Vietnam Pro",sans-serif;margin:40px;color:#27363F}
    h1{font-size:22px;margin-bottom:4px}h2{font-size:16px;color:#685652;margin:20px 0 8px}
    table{width:100%;border-collapse:collapse}th{background:#27363F;color:white;padding:10px;text-align:left;font-size:12px}
    .stat{display:inline-block;background:#f5f5f5;border-radius:6px;padding:12px 20px;margin:4px;text-align:center}
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
    <div class="stat"><div class="num" style="color:#F59E0B">${mediumCount}</div><div>Trung bình</div></div>
    <div class="stat"><div class="num" style="color:#8EA1AE">${lowCount}</div><div>Thấp</div></div>
  </div>
  <h2>DANH SÁCH VI PHẠM</h2>
  <table><thead><tr><th>Nhà cung ứng</th><th>Tiêu chuẩn</th><th>Mức độ</th><th>Trạng thái</th><th>Mô tả vi phạm</th></tr></thead>
  <tbody>${tableRows}</tbody></table>
  <div class="footer">Báo cáo tự động bởi ANHQUY AI Audit System · Chỉ dùng nội bộ · Bảo mật B2B</div>
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
    <Modal isOpen={!!violation} title="Chi tiết vi phạm" onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={violation.risk_level} />
          <StatusBadge status={violation.status} />
          {violation.page_number && (
            <span className="text-xs text-Mist bg-Snowflake px-2 py-0.5 rounded-md">Trang {violation.page_number}</span>
          )}
        </div>
        {violation.Documents && (
          <div className="bg-Snowflake rounded-md p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-Mist mb-1">Hợp đồng</p>
              <p className="text-sm font-medium text-Pine">{violation.Documents.file_name}</p>
              {violation.Documents.Suppliers && (
                <p className="text-xs text-Branch mt-0.5">{violation.Documents.Suppliers.company_name}</p>
              )}
            </div>
            <Link
              to={`/audit/${violation.Documents.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-Pine text-white text-xs font-medium rounded-md hover:bg-Pine/90"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Mở PDF Split-view
            </Link>
          </div>
        )}
        {violation.Standards && (
          <div className="bg-Snowflake rounded-md p-3">
            <p className="text-xs text-Mist mb-1">Tiêu chuẩn áp dụng</p>
            <p className="text-sm font-mono text-Pine font-semibold">{violation.Standards.standard_code}</p>
            <p className="text-sm text-Branch mt-0.5">{violation.Standards.name}</p>
            <p className="text-xs text-Mist mt-0.5">Phạm vi: {violation.Standards.jurisdiction || 'Global'}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-Mist mb-1 font-medium">Mô tả vi phạm</p>
          <p className="text-sm text-Branch leading-relaxed">{violation.violation_desc}</p>
        </div>
        <div>
          <p className="text-xs text-Mist mb-1 font-medium">Bằng chứng (Trích dẫn nguyên văn trong hợp đồng)</p>
          <div className="bg-Frostysilver/30 border border-Mist/20 rounded-md p-3">
            <p className="text-sm text-Branch italic">"{violation.evidence_quote}"</p>
          </div>
        </div>
        {violation.recommendation && (
          <div>
            <p className="text-xs text-Mist mb-1 font-medium">Khuyến nghị sửa đổi</p>
            <div className="bg-Pine/5 border border-Pine/10 rounded-md p-3">
              <p className="text-sm text-Branch">{violation.recommendation}</p>
            </div>
          </div>
        )}
        {violation.status !== 'Pending' && (
          <div className="text-xs text-Mist border-t border-Mist/10 pt-3">
            Xử lý bởi: <strong className="text-Branch">{violation.Users?.full_name || 'Quản lý'}</strong>
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
  const LIMIT = 15

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
      const params: Record<string, string | number | boolean | undefined> = { page, limit: LIMIT }
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
  }, [page, filterRisk, filterStatus, filterSupplier, filterDocument])

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

      // Phát thông báo Realtime cho các tab khác
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

  const handleExportCSV = async () => {
    toast.loading('Đang chuẩn bị xuất báo cáo...', { id: 'export' })
    try {
      const res = await violationApi.getAll({ limit: 1000 })
      const data = res.data?.data || res.data || {}
      const all: Violation[] = (data as { items?: Violation[] })?.items || violations
      exportToCSV(all)
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

  return (
    <MainLayout breadcrumb="Vi phạm & Báo cáo">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-Pine">Trung tâm Thẩm định Vi phạm & Báo cáo</h1>
            <p className="text-sm text-Mist mt-0.5">Phê duyệt cảnh báo AI, tính điểm rủi ro và kết xuất báo cáo kiểm toán</p>
          </div>
          {hasPermission('EXPORT_REPORT') && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 transition-all shadow-sm"
              >
                <Download className="w-4 h-4" />
                Xuất CSV (Excel)
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2.5 border border-Pine bg-white text-Pine text-sm font-medium rounded-md hover:bg-Pine/5 transition-all"
              >
                <Printer className="w-4 h-4" />
                In / Xuất PDF Báo cáo
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-Mist" />
          </div>
          {[
            { value: filterRisk, onChange: setFilterRisk, options: [
              { value: '', label: 'Tất cả mức độ' },
              { value: 'High', label: 'Cao (High)' },
              { value: 'Medium', label: 'Trung bình' },
              { value: 'Low', label: 'Thấp (Low)' },
            ]},
            { value: filterStatus, onChange: setFilterStatus, options: [
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'Pending', label: 'Chờ duyệt' },
              { value: 'Approved', label: 'Đã duyệt' },
              { value: 'Rejected', label: 'Đã bác bỏ' },
            ]},
          ].map(({ value, onChange, options }, i) => (
            <select
              key={i}
              value={value}
              onChange={(e) => { onChange(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-Mist/40 rounded-md text-sm bg-white text-Branch focus:outline-none focus:ring-2 focus:ring-Pine/30"
            >
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
          <select
            value={filterSupplier}
            onChange={(e) => { setFilterSupplier(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-Mist/40 rounded-md text-sm bg-white text-Branch focus:outline-none focus:ring-2 focus:ring-Pine/30 min-w-[180px]"
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
            className="px-3 py-2 border border-Mist/40 rounded-md text-sm bg-white text-Branch focus:outline-none focus:ring-2 focus:ring-Pine/30 min-w-[180px]"
          >
            <option value="">Tất cả hợp đồng PDF</option>
            {documents.map((d) => <option key={d.id} value={d.id}>{d.file_name}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-Mist/20 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : violations.length === 0 ? (
            <EmptyState message="Không tìm thấy vi phạm nào" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-Mist/10">
                <thead>
                  <tr className="bg-Snowflake/60">
                    {['Nhà cung ứng / Hợp đồng', 'Tiêu chuẩn', 'Mức độ', 'Mô tả vi phạm', 'Trạng thái', 'Hành động'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-Mist uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-Mist/8">
                  {violations.map((v) => (
                    <tr key={v.id} className="hover:bg-Snowflake/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <Building2 className="w-4 h-4 text-Mist mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-Pine">{v.Documents?.Suppliers?.company_name || '—'}</p>
                            {v.Documents ? (
                              <Link
                                to={`/audit/${v.Documents.id}`}
                                className="text-xs text-Mist hover:text-Pine hover:underline flex items-center gap-1"
                              >
                                <FileText className="w-3 h-3" />{v.Documents.file_name}
                              </Link>
                            ) : (
                              <p className="text-xs text-Mist">—</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {v.Standards && (
                          <div>
                            <span className="font-mono text-xs font-semibold text-Pine">{v.Standards.standard_code}</span>
                            <p className="text-xs text-Mist mt-0.5 max-w-[150px] truncate">{v.Standards.name}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className={`w-4 h-4 ${RISK_COLORS[v.risk_level]}`} />
                          <StatusBadge status={v.risk_level} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-Branch max-w-[240px] line-clamp-2">{v.violation_desc}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={v.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDetailViolation(v)}
                            className="p-1.5 text-Pine hover:bg-Pine/8 rounded-md transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {hasPermission('APPROVE_VIOLATION') && v.status === 'Pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => setConfirmReview({ id: v.id, status: 'Approved' })}
                                className="p-1.5 text-Berry hover:bg-Berry/8 rounded-md transition-colors"
                                title="Phê duyệt lỗi – Trừ điểm"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmReview({ id: v.id, status: 'Rejected' })}
                                className="p-1.5 text-Mist hover:bg-Snowflake rounded-md transition-colors"
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
          {!loading && (
            <div className="px-4 border-t border-Mist/10">
              <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
            </div>
          )}
        </div>
      </div>

      {detailViolation && (
        <ViolationDetailModal violation={detailViolation} onClose={() => setDetailViolation(null)} />
      )}

      <ConfirmModal
        isOpen={!!confirmReview}
        title={confirmReview?.status === 'Approved' ? 'Phê duyệt vi phạm?' : 'Bác bỏ cảnh báo?'}
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