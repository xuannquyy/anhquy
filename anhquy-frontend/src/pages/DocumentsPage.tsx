import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Upload, FileText, Search, Trash2, Cpu, Eye, CheckCircle,
  AlertTriangle, Clock, XCircle, Hash
} from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { ConfirmModal, Modal, Pagination, StatusBadge, Spinner, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useRealtime } from '../context/RealtimeContext'
import { documentApi, supplierApi, categoryApi } from '../api'

interface ContractDoc {
  id: number
  file_name: string
  file_hash: string | null
  file_size: number | null
  status: 'Uploaded' | 'Analyzing' | 'Analyzed' | 'Error'
  storage_url: string
  last_analyzed_at: string | null
  uploaded_at?: string
  created_at?: string
  Suppliers?: { id: number; company_name: string }
  Categories?: { id: number; name: string }
}

interface Supplier { id: number; company_name: string }
interface Category { id: number; name: string; category_type: string }

const STATUS_ICON: Record<string, React.ReactNode> = {
  Uploaded:  <Clock className="w-4 h-4 text-blue-500" />,
  Analyzing: <Cpu className="w-4 h-4 text-amber-500 animate-pulse" />,
  Analyzed:  <CheckCircle className="w-4 h-4 text-emerald-500" />,
  Error:     <XCircle className="w-4 h-4 text-Berry" />,
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function DocumentsPage() {
  const { hasPermission } = useAuth()
  const { publishEvent } = useRealtime()

  const [documents, setDocuments] = useState<ContractDoc[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [contractTypes, setContractTypes] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const LIMIT = 10

  const [filterStatus, setFilterStatus] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
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
  }, [])

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean | undefined> = { page, limit: LIMIT }
      if (filterStatus) params.status = filterStatus
      if (filterSupplier) params.supplier_id = filterSupplier
      const res = await documentApi.getAll(params)
      const data = res.data?.data || res.data || {}
      setDocuments((data as { items?: ContractDoc[] })?.items || [])
      setTotal((data as { total?: number })?.total || 0)
    } catch {
      toast.error('Không thể tải danh sách hợp đồng.')
    } finally {
      setLoading(false)
    }
  }, [page, filterStatus, filterSupplier])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type === 'application/pdf') {
      setUploadFile(file)
    } else {
      toast.error('Chỉ chấp nhận file định dạng PDF.')
    }
  }
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.type !== 'application/pdf') { toast.error('Chỉ chấp nhận file định dạng PDF.'); return }
      setUploadFile(file)
    }
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
      await documentApi.upload(formData)
      toast.success('Tải lên hợp đồng PDF thành công.')
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
      publishEvent({
        type: 'AI_SCAN_COMPLETED',
        title: 'AI hoàn tất rà soát hợp đồng',
        message: `Hợp đồng "${doc.file_name}" (${doc.Suppliers?.company_name || 'N/A'}) đã phân tích xong với ${vCount} cảnh báo. Vui lòng thẩm định.`,
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

  const filteredDocs = search
    ? documents.filter((d) =>
        d.file_name.toLowerCase().includes(search.toLowerCase()) ||
        (d.Suppliers?.company_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : documents

  return (
    <MainLayout breadcrumb="Kho hợp đồng PDF">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-Pine">Kho hợp đồng PDF</h1>
            <p className="text-sm text-Mist mt-0.5">Tải lên, kiểm tra SHA-256 và kích hoạt AI RAG kiểm toán điều khoản</p>
          </div>
          {hasPermission('UPLOAD_DOC') && (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 shadow-sm hover:shadow-md transition-all duration-300"
            >
              <Upload className="w-4 h-4" />
              Tải lên hợp đồng PDF
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
            <input
              type="text"
              placeholder="Tìm kiếm tên file, nhà cung ứng..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine bg-white text-Branch placeholder-Mist transition-all"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
            className="px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white text-Branch min-w-[160px]"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="Uploaded">Đã tải lên</option>
            <option value="Analyzing">Đang phân tích</option>
            <option value="Analyzed">Đã phân tích</option>
            <option value="Error">Lỗi</option>
          </select>
          <select
            value={filterSupplier}
            onChange={(e) => { setFilterSupplier(e.target.value); setPage(1) }}
            className="px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white text-Branch min-w-[180px]"
          >
            <option value="">Tất cả nhà cung ứng</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-Mist/20 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : filteredDocs.length === 0 ? (
            <EmptyState message="Không tìm thấy hợp đồng nào" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-Mist/10">
                <thead>
                  <tr className="bg-Snowflake/60">
                    {['Tên file PDF', 'Nhà cung ứng', 'Loại HĐ', 'Kích thước', 'Mã băm SHA-256', 'Trạng thái', 'Hành động'].map((h) => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-Mist uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-Mist/8">
                  {filteredDocs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-Snowflake/40 transition-colors">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-Pine flex-shrink-0" />
                          <Link
                            to={`/audit/${doc.id}`}
                            className="text-sm font-medium text-Pine hover:underline max-w-[200px] truncate"
                            title={doc.file_name}
                          >
                            {doc.file_name}
                          </Link>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-Branch whitespace-nowrap">
                        {doc.Suppliers?.company_name || '—'}
                      </td>
                      <td className="px-3 py-3 text-sm text-Branch whitespace-nowrap">
                        {doc.Categories?.name || '—'}
                      </td>
                      <td className="px-3 py-3 text-sm text-Mist whitespace-nowrap">
                        {formatBytes(doc.file_size)}
                      </td>
                      <td className="px-3 py-3">
                        {doc.file_hash ? (
                          <div className="flex items-center gap-1" title={`SHA-256: ${doc.file_hash}`}>
                            <Hash className="w-3 h-3 text-Mist flex-shrink-0" />
                            <code className="text-xs text-Mist font-mono bg-Snowflake px-1.5 py-0.5 rounded">
                              {doc.file_hash.substring(0, 12)}…
                            </code>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {STATUS_ICON[doc.status]}
                          <StatusBadge status={doc.status} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {/* Open Split-view Audit Workspace */}
                          <Link
                            to={`/audit/${doc.id}`}
                            title="Mở Phòng Kiểm toán AI (Split-view)"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-Pine/10 text-Pine hover:bg-Pine hover:text-white text-xs font-medium rounded-md transition-all"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Kiểm toán
                          </Link>

                          {/* Analyze button */}
                          {hasPermission('RUN_AI_AUDIT') && doc.status !== 'Analyzing' && (
                            <button
                              type="button"
                              onClick={() => handleAnalyze(doc)}
                              disabled={analyzingIds.has(doc.id)}
                              title="Kích hoạt AI rà soát ngay"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-Pine text-white hover:bg-Pine/90 text-xs font-medium rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {analyzingIds.has(doc.id) ? (
                                <Spinner size="sm" />
                              ) : (
                                <Cpu className="w-3.5 h-3.5" />
                              )}
                              Quét AI
                            </button>
                          )}

                          {/* Delete */}
                          {hasPermission('DELETE_DOC') && (
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(doc)}
                              title="Xóa hợp đồng tải nhầm"
                              className="p-1.5 text-Berry hover:bg-Berry/10 rounded-md transition-colors"
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
          )}
          {!loading && (
            <div className="px-4 border-t border-Mist/10">
              <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={uploadOpen}
        title="Tải lên hợp đồng PDF"
        onClose={() => { setUploadOpen(false); setUploadFile(null) }}
        size="md"
      >
        <div className="space-y-4">
          {/* Drag & Drop Zone */}
          <div
            ref={dropRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ${
              isDragging ? 'border-Pine bg-Pine/5' : 'border-Mist/40 hover:border-Pine/40 hover:bg-Snowflake/50'
            }`}
          >
            {uploadFile ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-Pine" />
                <div className="text-left">
                  <p className="text-sm font-medium text-Pine">{uploadFile.name}</p>
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
                <p className="text-sm font-medium text-Branch">Kéo & thả file PDF vào đây</p>
                <p className="text-xs text-Mist mt-1">hoặc</p>
                <label className="inline-block mt-2 px-4 py-2 bg-Pine text-white text-sm rounded-md cursor-pointer hover:bg-Pine/90 transition-all">
                  Chọn file PDF
                  <input type="file" accept="application/pdf" onChange={handleFileInput} className="hidden" />
                </label>
                <p className="text-xs text-Mist mt-2">Tối đa 50 MB · Chỉ nhận định dạng PDF</p>
              </>
            )}
          </div>

          {/* Metadata */}
          <div>
            <label className="block text-sm font-medium text-Branch mb-1.5">Nhà cung ứng *</label>
            <select
              value={uploadSupplierId}
              onChange={(e) => setUploadSupplierId(e.target.value)}
              className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white text-Branch transition-all"
            >
              <option value="">-- Chọn nhà cung ứng --</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-Branch mb-1.5">Loại hợp đồng *</label>
            <select
              value={uploadCategoryId}
              onChange={(e) => setUploadCategoryId(e.target.value)}
              className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white text-Branch transition-all"
            >
              <option value="">-- Chọn loại hợp đồng --</option>
              {contractTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Bảo mật note */}
          <div className="flex items-start gap-2 bg-Pine/5 rounded-md p-3 border border-Pine/10">
            <AlertTriangle className="w-4 h-4 text-Pine mt-0.5 flex-shrink-0" />
            <p className="text-xs text-Branch leading-relaxed">
              Hệ thống sẽ tự động tính toán mã băm <strong>SHA-256</strong> để chống tải trùng hợp đồng.
              Nội dung nhạy cảm (CCCD, MST, STK) sẽ được ẩn danh bằng{' '}
              <strong>Data Masking</strong> trước khi gửi vào AI.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setUploadOpen(false); setUploadFile(null) }}
              className="flex-1 py-2.5 border border-Mist/40 text-Branch text-sm rounded-md hover:bg-Snowflake transition-all"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
              className="flex-1 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {uploading ? <Spinner size="sm" /> : <Upload className="w-4 h-4" />}
              Tải lên
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Xóa hợp đồng?"
        message={`Hợp đồng "${confirmDelete?.file_name}" và các cảnh báo liên quan sẽ bị xóa khỏi hệ thống.`}
        confirmLabel="Xóa hợp đồng"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </MainLayout>
  )
}