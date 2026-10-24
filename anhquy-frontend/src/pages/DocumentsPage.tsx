import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Upload, FileText, Search, Trash2, Cpu, Eye, CheckCircle,
  AlertTriangle, Clock, XCircle, Hash, Copy, ClipboardCheck
} from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { ConfirmModal, Modal, Pagination, StatusBadge, Spinner, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useRealtime } from '../context/RealtimeContext'
import { documentApi, supplierApi, categoryApi, adminApi } from '../api'
import type { ExportableDocument } from './AuditWorkspacePage'

interface ContractDoc extends ExportableDocument {
  id: number
  file_name: string
  file_hash: string | null
  file_size: number | null
  status: 'Uploaded' | 'Analyzing' | 'Analyzed' | 'Error'
  storage_url: string
  last_analyzed_at: string | null
  uploaded_at?: string
  created_at?: string
  Suppliers?: { id: number; company_name: string; risk_score?: number | null }
  Categories?: { id: number; name: string }
}

interface Supplier { id: number; company_name: string }
interface Category { id: number; name: string; category_type: string }

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function DocumentsPage() {
  const { hasPermission } = useAuth()
  const { publishEvent } = useRealtime()
  const navigate = useNavigate()

  const [documents, setDocuments] = useState<ContractDoc[]>([])
  const [allDocsSummary, setAllDocsSummary] = useState<ContractDoc[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [contractTypes, setContractTypes] = useState<Category[]>([])
  const [maxUploadMb, setMaxUploadMb] = useState<number>(20)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  const [filterStatus, setFilterStatus] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [search, setSearch] = useState('')

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadSupplierId, setUploadSupplierId] = useState('')
  const [uploadCategoryId, setUploadCategoryId] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  const [confirmDelete, setConfirmDelete] = useState<ContractDoc | null>(null)
  const [analyzingIds, setAnalyzingIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    supplierApi.getAll({ limit: 500 }).then((r) => {
      const data = r.data?.data || r.data || {}
      setSuppliers((data as { items?: Supplier[] })?.items || [])
    }).catch(() => {})

    categoryApi.getAll({ category_type: 'Contract_Type', is_active: true, limit: 200 }).then((r) => {
      const data = r.data?.data || r.data || {}
      setContractTypes((data as { items?: Category[] })?.items || [])
    }).catch(() => {})

    adminApi.getSystemConfigs().then((r) => {
      const list = r.data?.configs || r.data?.items || r.data?.data || []
      if (Array.isArray(list)) {
        const found = list.find((c: { config_key: string; config_value: string }) => c.config_key === 'MAX_UPLOAD_SIZE_MB')
        if (found && Number(found.config_value) > 0) {
          setMaxUploadMb(Number(found.config_value))
        }
      }
    }).catch(() => {})
  }, [])

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean | undefined> = { page, limit }
      if (filterStatus) params.status = filterStatus
      if (filterSupplier) params.supplier_id = filterSupplier
      if (filterCategory) params.category_id = filterCategory

      const [res, summaryRes] = await Promise.all([
        documentApi.getAll(params),
        documentApi.getAll({ limit: 500 }).catch(() => null),
      ])

      const data = res.data?.data || res.data || {}
      setDocuments((data as { items?: ContractDoc[] })?.items || [])
      setTotal((data as { total?: number })?.total || 0)

      if (summaryRes) {
        const sData = summaryRes.data?.data || summaryRes.data || {}
        setAllDocsSummary((sData as { items?: ContractDoc[] })?.items || [])
      }
    } catch {
      toast.error('Không thể tải danh sách hợp đồng.')
    } finally {
      setLoading(false)
    }
  }, [page, limit, filterStatus, filterSupplier, filterCategory])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  const validateAndSetFile = (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Chỉ chấp nhận file định dạng PDF.')
      return
    }
    if (file.size > maxUploadMb * 1024 * 1024) {
      toast.error(`Dung lượng file vượt quá giới hạn cho phép (${maxUploadMb} MB).`)
      return
    }
    setUploadFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndSetFile(file)
  }
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) validateAndSetFile(file)
  }

  const handleUpload = async () => {
    if (!uploadFile) { toast.error('Chưa chọn file PDF.'); return }
    if (!uploadSupplierId) { toast.error('Vui lòng chọn nhà cung ứng.'); return }
    if (!uploadCategoryId) { toast.error('Vui lòng chọn loại hợp đồng.'); return }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('contract', uploadFile)
      formData.append('supplier_id', uploadSupplierId)
      formData.append('category_id', uploadCategoryId)
      const res = await documentApi.upload(formData)
      const createdDoc = res.data?.document || res.data?.data || res.data
      const supplierName = suppliers.find((s) => String(s.id) === String(uploadSupplierId))?.company_name || 'Đối tác'

      toast.success('Tải lên hợp đồng PDF thành công.')

      // Bắn thông báo Realtime ngay khi tải lên để Admin/Manager nắm bắt
      publishEvent({
        type: 'AI_SCAN_COMPLETED',
        title: 'Hợp đồng PDF mới vừa được tải lên',
        message: `Hợp đồng "${uploadFile.name}" (${supplierName}) đã được tải lên kho lưu trữ. Đề nghị kích hoạt quét AI và thẩm định.`,
        documentId: createdDoc?.id,
      })

      setUploadOpen(false)
      setUploadFile(null)
      setUploadSupplierId('')
      setUploadCategoryId('')
      fetchDocuments()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Tải lên thất bại.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      await documentApi.delete(confirmDelete.id)
      toast.success(`Đã xóa hợp đồng "${confirmDelete.file_name}".`)
      setConfirmDelete(null)
      fetchDocuments()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Xóa thất bại.')
    }
  }

  const handleAnalyze = async (doc: ContractDoc) => {
    if (analyzingIds.has(doc.id)) return
    setAnalyzingIds((prev) => new Set(prev).add(doc.id))
    toast.loading(`Đang kích hoạt AI rà soát hợp đồng "${doc.file_name}"...`, { id: `analyze-${doc.id}` })
    try {
      const res = await documentApi.analyze(doc.id)
      const vCount = res.data?.violations_count ?? res.data?.violations?.length ?? 0
      toast.success(`Phân tích hoàn tất: "${doc.file_name}" (${vCount} cảnh báo)`, { id: `analyze-${doc.id}` })

      // Thông báo Realtime cho Manager/Admin vào duyệt kết quả AI
      publishEvent({
        type: 'AI_SCAN_COMPLETED',
        title: 'AI hoàn tất rà soát hợp đồng — Chờ thẩm định',
        message: `Hợp đồng "${doc.file_name}" (${doc.Suppliers?.company_name || 'Đối tác'}) đã phân tích xong với ${vCount} cảnh báo. Đề nghị Manager/Admin vào thẩm định.`,
        documentId: doc.id,
        violationCount: vCount,
      })
      fetchDocuments()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Phân tích AI thất bại.', { id: `analyze-${doc.id}` })
      fetchDocuments()
    } finally {
      setAnalyzingIds((prev) => { const s = new Set(prev); s.delete(doc.id); return s })
    }
  }

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash)
    toast.success('Đã sao chép toàn bộ mã băm SHA-256.')
  }

  const filteredDocs = search.trim()
    ? documents.filter((d) =>
        d.file_name.toLowerCase().includes(search.toLowerCase()) ||
        (d.Suppliers?.company_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : documents

  const sourceForCount = allDocsSummary.length > 0 ? allDocsSummary : documents
  const totalAllCount = allDocsSummary.length > 0 ? allDocsSummary.length : total
  const analyzedCount = sourceForCount.filter((d) => d.status === 'Analyzed').length
  const uploadedCount = sourceForCount.filter((d) => d.status === 'Uploaded').length

  return (
    <MainLayout breadcrumb="Kho hợp đồng PDF">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-Branch tracking-tight">Kho Hợp đồng PDF</h1>
            <p className="text-xs sm:text-sm text-Branch/75 mt-0.5">
              Lưu trữ toàn vẹn bằng mã băm SHA-256 và bóc tách điều khoản vi phạm bằng AI RAG
            </p>
          </div>
          {hasPermission('UPLOAD_DOC') && (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-2xl hover:bg-Pine/90 shadow-sm hover:shadow-md transition-all duration-200"
            >
              <Upload className="w-4 h-4" />
              Tải lên hợp đồng PDF
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => { setFilterStatus(''); setPage(1) }}
            className={`text-left rounded-3xl border p-4 transition-all cursor-pointer flex items-center justify-between ${
              filterStatus === ''
                ? 'bg-Pine text-white border-Pine shadow-md'
                : 'bg-white text-Branch border-white hover:border-Pine/40 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                filterStatus === '' ? 'bg-white/20 text-white' : 'bg-Pine/10 text-Pine'
              }`}>
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-xs font-bold ${filterStatus === '' ? 'text-white/85' : 'text-Branch/70'}`}>
                  Tổng số hợp đồng
                </p>
                <p className={`text-xl font-extrabold ${filterStatus === '' ? 'text-white' : 'text-Pine'}`}>
                  {totalAllCount}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg ${
              filterStatus === '' ? 'bg-Sunny text-Branch' : 'bg-Snowflake text-Branch/70'
            }`}>
              Tất cả
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setFilterStatus('Analyzed'); setPage(1) }}
            className={`text-left rounded-3xl border p-4 transition-all cursor-pointer flex items-center justify-between ${
              filterStatus === 'Analyzed'
                ? 'bg-SafeGreen text-white border-SafeGreen shadow-md'
                : 'bg-white text-Branch border-white hover:border-SafeGreen/40 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                filterStatus === 'Analyzed' ? 'bg-white/20 text-white' : 'bg-SafeBg text-SafeGreen'
              }`}>
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-xs font-bold ${filterStatus === 'Analyzed' ? 'text-white/85' : 'text-Branch/70'}`}>
                  Đã phân tích AI
                </p>
                <p className={`text-xl font-extrabold ${filterStatus === 'Analyzed' ? 'text-white' : 'text-SafeGreen'}`}>
                  {analyzedCount}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg ${
              filterStatus === 'Analyzed' ? 'bg-white text-SafeGreen' : 'bg-SafeBg text-SafeGreen'
            }`}>
              Đã quét
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setFilterStatus('Uploaded'); setPage(1) }}
            className={`text-left rounded-3xl border p-4 transition-all cursor-pointer flex items-center justify-between ${
              filterStatus === 'Uploaded'
                ? 'bg-Berry text-white border-Berry shadow-md'
                : 'bg-white text-Branch border-white hover:border-Berry/40 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                filterStatus === 'Uploaded' ? 'bg-white/20 text-white' : 'bg-DangerBg text-Berry'
              }`}>
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-xs font-bold ${filterStatus === 'Uploaded' ? 'text-white/85' : 'text-Branch/70'}`}>
                  Chờ kích hoạt quét AI
                </p>
                <p className={`text-xl font-extrabold ${filterStatus === 'Uploaded' ? 'text-white' : 'text-Berry'}`}>
                  {uploadedCount}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg ${
              filterStatus === 'Uploaded' ? 'bg-Sunny text-Branch' : 'bg-DangerBg text-Berry'
            }`}>
              Chờ quét
            </span>
          </button>
        </div>

        {/* Filter & Table Card */}
        <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(10,16,32,0.06)] p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
              <input
                type="text"
                placeholder="Tìm tên file, đối tác..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-Mist/40 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-Pine bg-Snowflake/30 text-Branch placeholder-Mist"
              />
            </div>
            <select
              value={filterSupplier}
              onChange={(e) => { setFilterSupplier(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-Mist/40 rounded-xl text-xs sm:text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Branch"
            >
              <option value="">Tất cả nhà cung ứng</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-Mist/40 rounded-xl text-xs sm:text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Branch"
            >
              <option value="">Tất cả loại hợp đồng</option>
              {contractTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-Mist/40 rounded-xl text-xs sm:text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Branch"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="Uploaded">Đã tải lên (Chờ quét)</option>
              <option value="Analyzing">Đang phân tích</option>
              <option value="Analyzed">Đã phân tích AI</option>
              <option value="Error">Lỗi xử lý</option>
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : filteredDocs.length === 0 ? (
            <EmptyState message="Không tìm thấy hợp đồng PDF nào thuộc mục đang chọn" />
          ) : (
            <>
              {/* 1. Desktop Table */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-Mist/20">
                <table className="min-w-full divide-y divide-Mist/15">
                  <thead>
                    <tr className="bg-Pine text-white">
                      {['Tài liệu Hợp đồng PDF', 'Đối tác & Phân loại', 'Mã toàn vẹn SHA-256', 'Trạng thái', 'Thao tác Kiểm toán & Báo cáo'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-Mist/15 bg-white">
                    {filteredDocs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-Snowflake/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-Pine/10 text-Pine flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <Link
                                to={`/audit/${doc.id}`}
                                className="text-sm font-extrabold text-Branch hover:text-Pine hover:underline block truncate max-w-xs transition-colors"
                                title={doc.file_name}
                              >
                                {doc.file_name}
                              </Link>
                              <span className="text-[11px] text-Mist">
                                Dung lượng: {formatBytes(doc.file_size)}
                                {(doc.uploaded_at || doc.created_at) &&
                                  ` · Tải lên: ${new Date(doc.uploaded_at || doc.created_at!).toLocaleDateString('vi-VN')}`}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-xs font-extrabold text-Branch">{doc.Suppliers?.company_name || '—'}</p>
                          <span className="inline-block mt-0.5 text-[11px] font-semibold text-Mist">
                            {doc.Categories?.name || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {doc.file_hash ? (
                            <button
                              type="button"
                              onClick={() => copyHash(doc.file_hash!)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-Snowflake hover:bg-Branch hover:text-white text-Branch text-xs font-mono transition-colors"
                              title={`Click để sao chép SHA-256: ${doc.file_hash}`}
                            >
                              <Hash className="w-3 h-3 text-Pine" />
                              <span>{doc.file_hash.substring(0, 10)}…</span>
                              <Copy className="w-3 h-3 opacity-70" />
                            </button>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={doc.status} />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <Link
                              to={`/audit/${doc.id}`}
                              title="Mở Phòng Kiểm toán AI (Split-view)"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-Pine text-white hover:bg-Pine/90 text-xs font-extrabold rounded-xl transition-colors shadow-sm"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Mở Kiểm toán
                            </Link>

                            {doc.status === 'Analyzed' && hasPermission('EXPORT_REPORT') && (
                              <button
                                type="button"
                                onClick={() => navigate(`/audit/${doc.id}/summary`)}
                                title="Mở Báo cáo Thẩm định Hợp đồng"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-SafeBg text-SafeGreen border border-SafeBorder hover:bg-SafeGreen hover:text-white text-xs font-extrabold rounded-xl transition-colors shadow-sm"
                              >
                                <ClipboardCheck className="w-3.5 h-3.5" />
                                Báo Cáo Tổng Hợp
                              </button>
                            )}

                            {hasPermission('RUN_AI_AUDIT') && doc.status !== 'Analyzing' && (
                              <button
                                type="button"
                                onClick={() => handleAnalyze(doc)}
                                disabled={analyzingIds.has(doc.id)}
                                title="Kích hoạt AI rà soát ngay"
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-Berry text-white hover:bg-Merlot text-xs font-extrabold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                              >
                                {analyzingIds.has(doc.id) ? (
                                  <Spinner size="sm" />
                                ) : (
                                  <Cpu className="w-3.5 h-3.5" />
                                )}
                                {doc.status === 'Analyzed' ? 'Quét lại' : 'Quét AI'}
                              </button>
                            )}

                            {hasPermission('DELETE_DOC') && (
                              <button
                                type="button"
                                disabled={doc.status === 'Analyzing'}
                                onClick={() => setConfirmDelete(doc)}
                                title={doc.status === 'Analyzing' ? 'Không thể xóa khi đang quét AI' : 'Xóa hợp đồng'}
                                className="p-1.5 text-Berry hover:bg-DangerBg rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 2. Mobile Cards */}
              <div className="md:hidden grid grid-cols-1 gap-3">
                {filteredDocs.map((doc) => (
                  <div key={doc.id} className="rounded-2xl border border-Mist/25 bg-white p-4 shadow-sm space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/audit/${doc.id}`} className="text-sm font-extrabold text-Branch truncate">
                        {doc.file_name}
                      </Link>
                      <StatusBadge status={doc.status} />
                    </div>
                    <p className="text-xs text-Branch font-semibold">
                      {doc.Suppliers?.company_name} · <span className="text-Mist">{doc.Categories?.name}</span>
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-Mist/15">
                      <span className="text-[11px] font-mono text-Mist">{formatBytes(doc.file_size)}</span>
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/audit/${doc.id}`}
                          className="px-3 py-1.5 bg-Pine text-white text-xs font-extrabold rounded-xl"
                        >
                          Kiểm toán
                        </Link>
                        {hasPermission('RUN_AI_AUDIT') && doc.status !== 'Analyzing' && (
                          <button
                            type="button"
                            onClick={() => handleAnalyze(doc)}
                            disabled={analyzingIds.has(doc.id)}
                            className="px-3 py-1.5 bg-Berry text-white text-xs font-extrabold rounded-xl"
                          >
                            Quét AI
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!loading && (
            <div className="pt-2 border-t border-Mist/15">
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
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={uploadOpen}
        title="Tải lên Hợp đồng PDF"
        onClose={() => { setUploadOpen(false); setUploadFile(null) }}
        size="md"
      >
        <div className="space-y-4">
          <div
            ref={dropRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 ${
              isDragging ? 'border-Pine bg-Pine/5' : 'border-Mist/40 hover:border-Pine/40 hover:bg-Snowflake/40'
            }`}
          >
            {uploadFile ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-Pine" />
                <div className="text-left">
                  <p className="text-sm font-extrabold text-Branch">{uploadFile.name}</p>
                  <p className="text-xs text-Mist">{formatBytes(uploadFile.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadFile(null)}
                  className="ml-2 text-Berry hover:text-Berry/70"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-Mist mx-auto mb-3" />
                <p className="text-sm font-bold text-Branch">Kéo & thả file PDF vào đây</p>
                <p className="text-xs text-Mist mt-1">hoặc</p>
                <label className="inline-block mt-2 px-4 py-2 bg-Pine text-white text-xs font-extrabold rounded-xl cursor-pointer hover:bg-Pine/90 transition-all shadow-sm">
                  Chọn file PDF từ máy tính
                  <input type="file" accept="application/pdf" onChange={handleFileInput} className="hidden" />
                </label>
                <p className="text-xs font-semibold text-Mist mt-2">
                  Tối đa {maxUploadMb} MB · Chỉ nhận định dạng PDF
                </p>
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Branch mb-1.5">Nhà cung ứng *</label>
            <select
              value={uploadSupplierId}
              onChange={(e) => setUploadSupplierId(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Branch"
            >
              <option value="">-- Chọn nhà cung ứng --</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Branch mb-1.5">Loại hợp đồng *</label>
            <select
              value={uploadCategoryId}
              onChange={(e) => setUploadCategoryId(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Branch"
            >
              <option value="">-- Chọn loại hợp đồng --</option>
              {contractTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex items-start gap-2.5 bg-Snowflake/60 rounded-2xl p-3.5 border border-Mist/25">
            <AlertTriangle className="w-4 h-4 text-Berry mt-0.5 flex-shrink-0" />
            <p className="text-xs text-Branch leading-relaxed">
              Hệ thống tự động băm <strong>SHA-256</strong> để chống tải trùng hợp đồng.
              Nội dung nhạy cảm (CCCD, MST, STK) sẽ được ẩn danh bằng{' '}
              <strong>Data Masking</strong> trước khi gửi vào AI.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setUploadOpen(false); setUploadFile(null) }}
              className="flex-1 py-2.5 border border-Mist/40 text-Branch text-xs font-bold rounded-xl hover:bg-Snowflake transition-all"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
              className="flex-1 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Pine/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {uploading ? <Spinner size="sm" /> : <Upload className="w-4 h-4" />}
              Tải lên hệ thống
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Xác nhận xóa hợp đồng?"
        message={`Hợp đồng "${confirmDelete?.file_name}" và các cảnh báo liên quan sẽ bị xóa khỏi hệ thống.`}
        confirmLabel="Xóa hợp đồng"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </MainLayout>
  )
}