import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Eye, CheckCircle2, XCircle,
  FileText, Building2, AlertTriangle, Search,
  Clock, ArrowRight, Layers, LayoutGrid
} from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { ConfirmModal, Modal, Pagination, RiskScoreBar, StatusBadge, Spinner, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useRealtime } from '../context/RealtimeContext'
import { violationApi, supplierApi, documentApi } from '../api'
import { cleanVietnamesePdfText } from './AuditWorkspacePage'
import CompanyViolationDetailView from './CompanyViolationDetailView'
import type { DetailViolation, CompanyViolationGroup, ContractGroupItem } from './CompanyViolationDetailView'

interface Supplier { id: number; company_name: string; risk_score?: number | null }
interface DocOption { id: number; file_name: string }

function ViolationDetailModal({
  violation,
  onClose,
}: {
  violation: DetailViolation
  onClose: () => void
}) {
  return (
    <Modal isOpen={true} title="Chi tiết Cảnh báo & Phương án Hiệu chỉnh" onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <StatusBadge status={violation.risk_level} />
          <StatusBadge status={violation.status} />
          {violation.page_number && (
            <span className="text-xs font-extrabold text-Branch bg-Sunny/45 px-2.5 py-1 rounded-xl">
              Trang {violation.page_number}
            </span>
          )}
        </div>
        {violation.Documents && (
          <div className="bg-Snowflake/50 rounded-2xl p-3.5 flex items-center justify-between border border-Mist/25">
            <div>
              <p className="text-xs text-Mist mb-0.5">Hợp đồng PDF</p>
              <p className="text-sm font-extrabold text-Pine">{violation.Documents.file_name}</p>
              {violation.Documents.Suppliers && (
                <p className="text-xs font-semibold text-Branch mt-0.5">{violation.Documents.Suppliers.company_name}</p>
              )}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-Pine mb-1">Mô tả vi phạm</p>
          <p className="text-sm text-Branch leading-relaxed font-medium">{cleanVietnamesePdfText(violation.violation_desc)}</p>
        </div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-Berry mb-1">
            Bằng chứng phát hiện trong hợp đồng
          </p>
          <div className="bg-DangerBg border-l-4 border-l-Berry border border-DangerBorder rounded-2xl p-3.5">
            <p className="text-sm text-Merlot italic font-semibold">"{cleanVietnamesePdfText(violation.evidence_quote)}"</p>
          </div>
        </div>
        {violation.recommendation && (
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-SafeGreen mb-1">
              Phương án kiến nghị hiệu chỉnh điều khoản
            </p>
            <div className="bg-SafeBg border-l-4 border-l-SafeGreen border border-SafeBorder rounded-2xl p-3.5">
              <p className="text-sm text-SafeGreen font-bold">{cleanVietnamesePdfText(violation.recommendation)}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default function ViolationsPage() {
  const { hasPermission, user } = useAuth()
  const { publishEvent } = useRealtime()
  const [searchParams, setSearchParams] = useSearchParams()

  const [violations, setViolations] = useState<DetailViolation[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [documents, setDocuments] = useState<DocOption[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)

  const [displayMode, setDisplayMode] = useState<'companies' | 'flat'>('companies')
  const [selectedCompanyKey, setSelectedCompanyKey] = useState<string | null>(null)

  const [search, setSearch]                 = useState('')
  const [filterRisk, setFilterRisk]         = useState('')
  const [filterStatus, setFilterStatus]     = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterDocument, setFilterDocument] = useState(() => searchParams.get('document_id') || '')

  const [detailViolation, setDetailViolation] = useState<DetailViolation | null>(null)
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
      if (filterSupplier) params.supplier_id = filterSupplier
      if (filterDocument) params.document_id = filterDocument

      const res = await violationApi.getAll(params)
      const data = res.data?.data || res.data || {}
      setViolations((data as { items?: DetailViolation[] })?.items || [])
      setTotal((data as { total?: number })?.total || 0)
    } catch {
      toast.error('Không thể tải danh sách vi phạm.')
    } finally {
      setLoading(false)
    }
  }, [page, limit, filterSupplier, filterDocument])

  useEffect(() => { fetchViolations() }, [fetchViolations])

  // 1. Duyệt từng cảnh báo đơn lẻ + Bắn thông báo Realtime để các bộ phận biết xuất báo cáo
  const handleConfirmReview = async () => {
    if (!confirmReview) return
    setReviewLoading(true)
    try {
      const targetViolation = violations.find((v) => v.id === confirmReview.id)
      const docId = targetViolation?.Documents?.id
      const docName = targetViolation?.Documents?.file_name || '#'
      const remainingPendingInDoc = violations.filter(
        (v) => v.Documents?.id === docId && v.status === 'Pending' && v.id !== confirmReview.id
      ).length

      const res = await violationApi.review(confirmReview.id, confirmReview.status)
      const result = res.data?.data || res.data
      const newRisk: number | null = result?.supplier_risk_score ?? result?.newRiskScore ?? null

      if (confirmReview.status === 'Approved') {
        toast.success(
          newRisk !== null
            ? `Đã phê duyệt vi phạm! Điểm tín nhiệm đối tác cập nhật: ${newRisk} điểm.`
            : 'Đã phê duyệt vi phạm!'
        )
      } else {
        toast.success('Đã bác bỏ cảnh báo vi phạm.')
      }

      publishEvent({
        type: 'NEW_VIOLATION',
        title:
          remainingPendingInDoc === 0
            ? 'Hoàn tất thẩm định hợp đồng — Sẵn sàng xuất Báo cáo'
            : confirmReview.status === 'Approved'
            ? 'Quản lý đã phê duyệt cảnh báo vi phạm'
            : 'Quản lý đã bác bỏ cảnh báo',
        message:
          remainingPendingInDoc === 0
            ? `Hợp đồng "${docName}" đã được ${user?.full_name || 'Quản lý'} thẩm định hoàn tất 100%${newRisk !== null ? ` (Điểm đối tác: ${newRisk}đ)` : ''}. Hiện đã có thể xem và xuất Báo cáo Thẩm định.`
            : `Cảnh báo tại hợp đồng "${docName}" vừa được chuyển sang trạng thái ${
                confirmReview.status === 'Approved' ? 'Đã phê duyệt' : 'Đã bác bỏ'
              } (Còn ${remainingPendingInDoc} cảnh báo chờ duyệt).`,
        documentId: docId,
      })

      await fetchViolations()
      setConfirmReview(null)
    } catch {
      toast.error('Thẩm định thất bại.')
    } finally {
      setReviewLoading(false)
    }
  }

  // 2. Duyệt hàng loạt toàn bộ lỗi chờ + Bắn thông báo Realtime sẵn sàng xuất Báo cáo
  const handleBatchApproveContract = async (pendingList: DetailViolation[]) => {
    if (pendingList.length === 0) return
    setReviewLoading(true)
    toast.loading(`Đang phê duyệt ${pendingList.length} lỗi chờ...`, { id: 'batch-v' })
    try {
      let latestScore: number | null = null
      for (const item of pendingList) {
        const res = await violationApi.review(item.id, 'Approved')
        const result = res.data?.data || res.data
        latestScore = result?.supplier_risk_score ?? result?.newRiskScore ?? latestScore
      }
      const firstDoc = pendingList[0]?.Documents
      const companyName = firstDoc?.Suppliers?.company_name || 'Đối tác'

      toast.success(`Đã phê duyệt toàn bộ ${pendingList.length} cảnh báo! Hồ sơ đã sẵn sàng xuất báo cáo.`, { id: 'batch-v' })

      // Phát thông báo Realtime lên chuông cho toàn hệ thống
      publishEvent({
        type: 'NEW_VIOLATION',
        title: 'Hoàn tất phê duyệt hợp đồng — Sẵn sàng xuất Báo cáo',
        message: `${user?.full_name || 'Quản lý'} đã phê duyệt toàn bộ ${pendingList.length} cảnh báo của "${firstDoc?.file_name || companyName}"${latestScore !== null ? ` (Điểm tín nhiệm mới: ${latestScore}đ)` : ''}. Các bộ phận đã có thể xuất Báo cáo Thẩm định.`,
        documentId: firstDoc?.id,
      })

      await fetchViolations()
    } catch {
      toast.error('Có lỗi khi phê duyệt hàng loạt.', { id: 'batch-v' })
    } finally {
      setReviewLoading(false)
    }
  }

  const displayedViolations = useMemo(() => {
    return violations.filter((v) => {
      if (filterRisk && v.risk_level !== filterRisk) return false
      if (filterStatus && v.status !== filterStatus) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const descMatch = cleanVietnamesePdfText(v.violation_desc).toLowerCase().includes(q)
        const quoteMatch = cleanVietnamesePdfText(v.evidence_quote).toLowerCase().includes(q)
        const codeMatch = (v.Standards?.standard_code || '').toLowerCase().includes(q)
        const compMatch = (v.Documents?.Suppliers?.company_name || '').toLowerCase().includes(q)
        if (!descMatch && !quoteMatch && !codeMatch && !compMatch) return false
      }
      return true
    })
  }, [violations, filterRisk, filterStatus, search])

  const companyGroups = useMemo(() => {
    const map = new Map<string, CompanyViolationGroup>()

    const computeCurrentScore = (cName: string) => {
      const allCompanyViolations = violations.filter(
        (v) => (v.Documents?.Suppliers?.company_name || 'Đối tác chưa xác định') === cName
      )
      const penalty = allCompanyViolations
        .filter((v) => v.status === 'Approved')
        .reduce((sum, v) => sum + (v.risk_level === 'High' ? 10 : v.risk_level === 'Medium' ? 5 : 2), 0)
      return Math.max(0, 100 - penalty)
    }

    displayedViolations.forEach((v) => {
      const cName = v.Documents?.Suppliers?.company_name || 'Đối tác chưa xác định'
      if (!map.has(cName)) {
        map.set(cName, {
          companyKey: cName,
          companyId: v.Documents?.Suppliers?.id,
          companyName: cName,
          riskScore: computeCurrentScore(cName),
          items: [],
          contractsMap: new Map<number, ContractGroupItem>(),
          highCount: 0,
          pendingCount: 0,
          approvedCount: 0,
        })
      }
      const grp = map.get(cName)!
      grp.items.push(v)
      if (v.risk_level === 'High') grp.highCount++
      if (v.status === 'Pending') grp.pendingCount++
      if (v.status === 'Approved') grp.approvedCount++

      if (v.Documents?.id) {
        const dId = v.Documents.id
        if (!grp.contractsMap.has(dId)) {
          grp.contractsMap.set(dId, {
            docId: dId,
            fileName: v.Documents.file_name,
            violations: [],
            highCount: 0,
            pendingCount: 0,
            approvedCount: 0,
          })
        }
        const cEntry = grp.contractsMap.get(dId)!
        cEntry.violations.push(v)
        if (v.risk_level === 'High') cEntry.highCount++
        if (v.status === 'Pending') cEntry.pendingCount++
        if (v.status === 'Approved') cEntry.approvedCount++
      }
    })

    return Array.from(map.values()).sort(
      (a, b) => b.pendingCount - a.pendingCount || b.highCount - a.highCount || b.items.length - a.items.length
    )
  }, [displayedViolations, violations])

  const selectedCompanyGroup = useMemo(
    () => companyGroups.find((g) => g.companyKey === selectedCompanyKey) || null,
    [companyGroups, selectedCompanyKey]
  )

  const activeKpiTab: 'all' | 'pending' | 'high' | 'custom' =
    filterStatus === '' && filterRisk === ''
      ? 'all'
      : filterStatus === 'Pending' && filterRisk === ''
      ? 'pending'
      : filterRisk === 'High' && filterStatus === ''
      ? 'high'
      : 'custom'

  const handleSelectKpiTab = (tab: 'all' | 'pending' | 'high') => {
    if (tab === 'all') {
      setFilterStatus('')
      setFilterRisk('')
    } else if (tab === 'pending') {
      setFilterStatus('Pending')
      setFilterRisk('')
    } else if (tab === 'high') {
      setFilterRisk('High')
      setFilterStatus('')
    }
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
            <p className="text-xs sm:text-sm text-Branch/75 mt-0.5">
              Chọn từng Công ty Đối tác để rà soát các Hợp đồng vi phạm, phê duyệt lỗi và kết xuất Báo cáo Thẩm định Tổng hợp
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!selectedCompanyGroup && (
              <div className="flex items-center bg-white p-1 rounded-2xl border border-Mist/30 shadow-sm">
                <button
                  type="button"
                  onClick={() => setDisplayMode('companies')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-1.5 ${
                    displayMode === 'companies' ? 'bg-Pine text-white' : 'text-Branch hover:text-Pine'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Thẻ Công ty ({companyGroups.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode('flat')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-1.5 ${
                    displayMode === 'flat' ? 'bg-Pine text-white' : 'text-Branch hover:text-Pine'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Bảng phẳng ({displayedViolations.length})
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 3 Khung KPI Hoạt Động Như 3 Tabs Lọc Dữ Liệu */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => handleSelectKpiTab('all')}
            className={`text-left rounded-3xl border p-4 transition-colors cursor-pointer flex items-center justify-between ${
              activeKpiTab === 'all'
                ? 'bg-Pine text-white border-Pine shadow-md'
                : 'bg-white text-Branch border-white hover:border-Pine/40 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                activeKpiTab === 'all' ? 'bg-white/20 text-white' : 'bg-Pine/10 text-Pine'
              }`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-xs font-bold ${activeKpiTab === 'all' ? 'text-white/85' : 'text-Branch/70'}`}>
                  Tổng cảnh báo ({companyGroups.length} công ty)
                </p>
                <p className={`text-xl font-extrabold ${activeKpiTab === 'all' ? 'text-white' : 'text-Pine'}`}>
                  {violations.length}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg ${
              activeKpiTab === 'all' ? 'bg-Sunny text-Branch' : 'bg-Snowflake text-Branch/70'
            }`}>
              Tất cả
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectKpiTab('pending')}
            className={`text-left rounded-3xl border p-4 transition-colors cursor-pointer flex items-center justify-between ${
              activeKpiTab === 'pending'
                ? 'bg-Sunny text-Branch border-Sunny shadow-md ring-2 ring-Branch/15'
                : 'bg-white text-Branch border-white hover:border-Sunny shadow-sm'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                activeKpiTab === 'pending' ? 'bg-Branch text-Sunny' : 'bg-Sunny/30 text-Branch'
              }`}>
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-Branch/80">Chờ Manager thẩm định</p>
                <p className="text-xl font-extrabold text-Branch">{pendingCount}</p>
              </div>
            </div>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-white text-Branch">
              Chờ duyệt
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectKpiTab('high')}
            className={`text-left rounded-3xl border p-4 transition-colors cursor-pointer flex items-center justify-between ${
              activeKpiTab === 'high'
                ? 'bg-Berry text-white border-Berry shadow-md'
                : 'bg-white text-Branch border-white hover:border-Berry/40 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                activeKpiTab === 'high' ? 'bg-white/20 text-white' : 'bg-DangerBg text-Berry'
              }`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-xs font-bold ${activeKpiTab === 'high' ? 'text-white/85' : 'text-Branch/70'}`}>
                  Vi phạm mức độ Cao (High)
                </p>
                <p className={`text-xl font-extrabold ${activeKpiTab === 'high' ? 'text-white' : 'text-Berry'}`}>
                  {highCount}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg ${
              activeKpiTab === 'high' ? 'bg-Sunny text-Branch' : 'bg-DangerBg text-Berry'
            }`}>
              Rủi ro Cao
            </span>
          </button>
        </div>

        {/* Nếu đang chọn 1 Công ty -> Mở sang View Chi tiết của Công ty đó */}
        {selectedCompanyGroup ? (
          <CompanyViolationDetailView
            companyGroup={selectedCompanyGroup}
            canApprove={hasPermission('APPROVE_VIOLATION')}
            canExport={hasPermission('EXPORT_REPORT')}
            auditorName={user?.full_name || 'Chuyên viên Kiểm toán'}
            onBack={() => setSelectedCompanyKey(null)}
            onReviewSingle={(vid, status) => setConfirmReview({ id: vid, status })}
            onBatchApproveContract={handleBatchApproveContract}
            onOpenDetailModal={(v) => setDetailViolation(v)}
          />
        ) : (
          <>
            {/* Thanh Bộ lọc tìm kiếm */}
            <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(10,16,32,0.06)] p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-Mist absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm tên công ty, mã chuẩn..."
                    className="w-full pl-9 pr-3 py-2 border border-Mist/40 rounded-xl text-xs bg-Snowflake/30 text-Branch focus:outline-none focus:border-Pine"
                  />
                </div>

                <select
                  value={filterRisk}
                  onChange={(e) => { setFilterRisk(e.target.value); setPage(1) }}
                  className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Branch focus:outline-none focus:border-Pine"
                >
                  <option value="">Tất cả mức độ</option>
                  <option value="High">Cao (High)</option>
                  <option value="Medium">Trung bình (Medium)</option>
                  <option value="Low">Thấp (Low)</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
                  className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Branch focus:outline-none focus:border-Pine"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="Pending">Chờ thẩm định</option>
                  <option value="Approved">Đã phê duyệt</option>
                  <option value="Rejected">Đã bác bỏ</option>
                </select>

                <select
                  value={filterSupplier}
                  onChange={(e) => { setFilterSupplier(e.target.value); setPage(1) }}
                  className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Branch focus:outline-none focus:border-Pine"
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
                  className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Branch focus:outline-none focus:border-Pine"
                >
                  <option value="">Tất cả hợp đồng PDF</option>
                  {documents.map((d) => <option key={d.id} value={d.id}>{d.file_name}</option>)}
                </select>
              </div>
            </div>

            {/* NỘI DUNG CẤP ĐỘ 1: LƯỚI THẺ CÔNG TY */}
            {loading ? (
              <div className="flex justify-center py-16 bg-white rounded-3xl"><Spinner size="lg" /></div>
            ) : displayedViolations.length === 0 ? (
              <div className="bg-white rounded-3xl p-8">
                <EmptyState message="Không tìm thấy cảnh báo vi phạm nào thuộc Tab đang chọn" />
              </div>
            ) : displayMode === 'companies' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {companyGroups.map((group) => {
                  const contractsArr = Array.from(group.contractsMap.values())
                  return (
                    <div
                      key={group.companyKey}
                      onClick={() => setSelectedCompanyKey(group.companyKey)}
                      className="bg-white rounded-3xl border border-white hover:border-Pine p-5 shadow-[0_10px_28px_rgba(10,16,32,0.06)] hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-2xl bg-Pine text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                              <Building2 className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm sm:text-base font-extrabold text-Pine truncate" title={group.companyName}>
                                {group.companyName}
                              </h3>
                              <p className="text-xs text-Mist font-semibold mt-0.5">
                                {contractsArr.length} Hợp đồng PDF có cảnh báo
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-Snowflake/40 px-3 py-2 rounded-2xl border border-Mist/20 mb-3">
                          <div className="flex items-center justify-between text-[11px] font-bold text-Branch mb-1">
                            <span>Điểm tín nhiệm hiện tại:</span>
                          </div>
                          <RiskScoreBar score={group.riskScore ?? 100} />
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                          <div className="bg-Snowflake/50 rounded-xl py-2 px-1 border border-Mist/20">
                            <div className="text-base font-extrabold text-Pine">{group.items.length}</div>
                            <div className="text-[10px] font-bold text-Branch/70">Tổng lỗi</div>
                          </div>
                          <div className="bg-WarnBg rounded-xl py-2 px-1 border border-Sunny">
                            <div className="text-base font-extrabold text-Branch">{group.pendingCount}</div>
                            <div className="text-[10px] font-bold text-Branch/80">Chờ duyệt</div>
                          </div>
                          <div className="bg-DangerBg rounded-xl py-2 px-1 border border-DangerBorder">
                            <div className="text-base font-extrabold text-Berry">{group.highCount}</div>
                            <div className="text-[10px] font-bold text-Berry">Rủi ro Cao</div>
                          </div>
                        </div>

                        <div className="space-y-1.5 mb-4">
                          <p className="text-[11px] font-extrabold uppercase text-Mist">Hợp đồng liên quan:</p>
                          {contractsArr.slice(0, 2).map((c) => (
                            <div
                              key={c.docId}
                              className="flex items-center justify-between text-xs bg-Snowflake/30 px-2.5 py-1.5 rounded-xl border border-Mist/20"
                            >
                              <span className="font-bold text-Branch truncate flex items-center gap-1.5 max-w-[70%]">
                                <FileText className="w-3.5 h-3.5 text-Pine flex-shrink-0" />
                                {c.fileName}
                              </span>
                              <span className="text-[11px] font-extrabold text-Berry">{c.violations.length} lỗi</span>
                            </div>
                          ))}
                          {contractsArr.length > 2 && (
                            <p className="text-[11px] text-Pine font-bold pl-1">
                              + {contractsArr.length - 2} hợp đồng khác...
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-Mist/15 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedCompanyKey(group.companyKey)
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-Pine text-white group-hover:bg-Branch text-xs font-extrabold transition-colors shadow-sm"
                        >
                          Xem Hợp đồng & Duyệt lỗi
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* CHẾ ĐỘ 2: BẢNG PHẲNG TẤT CẢ DÒNG */
              <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(10,16,32,0.06)] p-4 sm:p-5">
                <div className="overflow-x-auto rounded-2xl border border-Mist/20">
                  <table className="min-w-full divide-y divide-Mist/15">
                    <thead>
                      <tr className="bg-Pine text-white">
                        {['Nhà cung ứng / Hợp đồng', 'Tiêu chuẩn', 'Mức độ', 'Lỗi vi phạm (Đỏ) & Khuyến nghị (Xanh)', 'Trạng thái', 'Thao tác'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-Mist/15 bg-white">
                      {displayedViolations.map((v) => (
                        <tr key={v.id} className="hover:bg-Snowflake/35 transition-colors">
                          <td className="px-4 py-3.5">
                            <p className="text-xs font-extrabold text-Pine">{v.Documents?.Suppliers?.company_name || '—'}</p>
                            {v.Documents && (
                              <Link
                                to={`/audit/${v.Documents.id}`}
                                className="text-[11px] text-Branch/70 hover:text-Pine hover:underline flex items-center gap-1 mt-0.5 font-semibold"
                              >
                                <FileText className="w-3 h-3 text-Pine" />{v.Documents.file_name}
                              </Link>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            {v.Standards && (
                              <div>
                                <span className="font-mono text-xs font-extrabold text-Pine bg-Pine/10 px-2 py-0.5 rounded-lg">
                                  {v.Standards.standard_code}
                                </span>
                                <p className="text-xs text-Branch mt-1 max-w-[160px] truncate">{v.Standards.name}</p>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge status={v.risk_level} />
                          </td>
                          <td className="px-4 py-3.5 max-w-md space-y-1">
                            <p className="text-xs text-Berry font-semibold line-clamp-1">
                              • Lỗi: {cleanVietnamesePdfText(v.violation_desc)}
                            </p>
                            {v.recommendation && (
                              <p className="text-xs text-SafeGreen font-bold line-clamp-1">
                                • Sửa: {cleanVietnamesePdfText(v.recommendation)}
                              </p>
                            )}
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
                                    className="p-1.5 text-Berry hover:bg-DangerBg rounded-xl transition-colors"
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

            {!loading && displayMode === 'flat' && (
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
          </>
        )}
      </div>

      {detailViolation && (
        <ViolationDetailModal
          violation={detailViolation}
          onClose={() => setDetailViolation(null)}
        />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-Branch/20 backdrop-blur-sm">
          <Spinner size="lg" />
        </div>
      )}
    </MainLayout>
  )
}