import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Upload, FileText, Search, Trash2, Cpu, Eye, CheckCircle,
  AlertTriangle, Clock, XCircle, Hash, Copy, Sparkles, Filter, ShieldCheck, Layers, ArrowUpRight
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
  Uploaded:  <Clock className="w-4 h-4 text-Pine" />,
  Analyzing: <Cpu className="w-4 h-4 text-Branch animate-pulse" />,
  Analyzed:  <CheckCircle className="w-4 h-4 text-emerald-600" />,
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
  }, [])

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean | undefined> = { page, limit }
      if (filterStatus) params.status = filterStatus
      if (filterSupplier) params.supplier_id = filterSupplier
      if (filterCategory) params.category_id = filterCategory
      const res = await documentApi.getAll(params)
      const data = res.data?.data || res.data || {}
      setDocuments((data as { items?: ContractDoc[] })?.items || [])
      setTotal((data as { total?: number })?.total || 0)
    } catch {
      toast.error('Không thể tải danh sách hợp đồng.')
    } finally {
      setLoading(false)
    }
  }, [page, limit, filterStatus, filterSupplier, filterCategory])

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

  const analyzedCount = documents.filter((d) => d.status === 'Analyzed').length
  const uploadedCount = documents.filter((d) => d.status === 'Uploaded').length

  return (
    <MainLayout breadcrumb="Kho hợp đồng PDF">
      <div className="space-y-8 pb-16">
        
        {/* 🌟 1. Banner Hiện Đại & Bắt Mắt */}
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-tr from-Pine via-[#24333D] to-Branch p-8 sm:p-10 text-white shadow-2xl border border-white/10">
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-80 h-80 bg-Berry/35 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-xs font-black border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                SECURE RAG VAULT
              </span>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">Quản Lý & Kiểm Toán Hợp Đồng</h1>
              <p className="text-xs sm:text-sm text-Frostysilver max-w-xl font-medium leading-relaxed">
                Hệ thống lưu trữ tài liệu thông minh tích hợp mã hóa SHA-256 chống giả mạo và bóc tách điều khoản tự động bằng AI.
              </p>
            </div>
            {hasPermission('UPLOAD_DOC') && (
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-gradient-to-r from-Berry to-[#872B38] hover:brightness-110 text-white text-xs font-black rounded-2xl transition-all duration-300 shadow-xl shadow-Berry/40 active:scale-95 flex-shrink-0"
              >
                <Upload className="w-4 h-4" />
                <span>Tải lên hợp đồng PDF mới</span>
              </button>
            )}
          </div>
        </div>

        {/* 🌟 2. 3 Thẻ Thống Kê (KPI Cards) Thiết Kế Mới */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white rounded-3xl border border-Mist/30 p-6 shadow-[0_10px_30px_rgba(39,54,63,0.04)] flex items-center gap-5 hover:border-Pine transition-all">
            <div className="w-14 h-14 rounded-2xl bg-Pine text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-Pine/30">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-Mist uppercase tracking-wider">Tổng số hợp đồng</p>
              <p className="text-3xl font-black text-Pine mt-1">{total}</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-Mist/30 p-6 shadow-[0_10px_30px_rgba(39,54,63,0.04)] flex items-center gap-5 hover:border-emerald-500 transition-all">
            <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-600/30">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-Mist uppercase tracking-wider">Đã phân tích AI</p>
              <p className="text-3xl font-black text-emerald-700 mt-1">{analyzedCount}</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-Mist/30 p-6 shadow-[0_10px_30px_rgba(39,54,63,0.04)] flex items-center gap-5 hover:border-Berry transition-all">
            <div className="w-14 h-14 rounded-2xl bg-Berry text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-Berry/30">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-Mist uppercase tracking-wider">Chờ quét AI</p>
              <p className="text-3xl font-black text-Berry mt-1">{uploadedCount}</p>
            </div>
          </div>
        </div>

        {/* 🌟 3. Khu vực Tìm kiếm, Bộ lọc & Bảng Dữ Liệu */}
        <div className="bg-white rounded-[2.5rem] border border-Mist/25 shadow-[0_15px_50px_rgba(39,54,63,0.06)] p-6 sm:p-8 space-y-6">
          
          {/* Thanh tìm kiếm và bộ lọc */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
              <input
                type="text"
                placeholder="Tìm tên file, nhà cung ứng..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-bold focus:outline-none focus:border-Pine bg-Snowflake/50 text-Pine placeholder-Mist transition-colors"
              />
            </div>
            <select
              value={filterSupplier}
              onChange={(e) => { setFilterSupplier(e.target.value); setPage(1) }}
              className="px-4 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-black focus:outline-none focus:border-Pine bg-white text-Pine cursor-pointer shadow-2xs"
            >
              <option value="">Tất cả nhà cung ứng</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setPage(1) }}
              className="px-4 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-black focus:outline-none focus:border-Pine bg-white text-Pine cursor-pointer shadow-2xs"
            >
              <option value="">Tất cả loại hợp đồng</option>
              {contractTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
              className="px-4 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-black focus:outline-none focus:border-Pine bg-white text-Pine cursor-pointer shadow-2xs"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="Uploaded">Đã tải lên</option>
              <option value="Analyzing">Đang phân tích</option>
              <option value="Analyzed">Đã phân tích</option>
              <option value="Error">Lỗi xử lý</option>
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : filteredDocs.length === 0 ? (
            <EmptyState message="Không tìm thấy hợp đồng PDF nào" />
          ) : (
            <>
              {/* Bảng dữ liệu Desktop */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-Mist/20">
                <table className="min-w-full divide-y divide-Mist/15">
                  <thead>
                    <tr className="bg-Pine text-white">
                      {['Tên file PDF', 'Nhà cung ứng', 'Loại Hợp đồng', 'Dung lượng', 'Mã băm SHA-256', 'Trạng thái', 'Thao tác'].map((h) => (
                        <th key={h} className="px-5 py-4 text-left text-xs font-black uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-Mist/15 bg-white">
                    {filteredDocs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-Snowflake/60 transition-colors group">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-Pine/10 text-Pine flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                              <FileText className="w-5 h-5" />
                            </div>
                            <Link
                              to={`/audit/${doc.id}`}
                              className="text-sm font-black text-Pine hover:text-Berry transition-colors max-w-[220px] truncate"
                              title={doc.file_name}
                            >
                              {doc.file_name}
                            </Link>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs font-black text-Branch whitespace-nowrap">
                          {doc.Suppliers?.company_name || '—'}
                        </td>
                        <td className="px-5 py-4 text-xs text-Branch whitespace-nowrap">
                          <span className="px-3 py-1 rounded-xl bg-Snowflake text-Pine font-black border border-Mist/20">
                            {doc.Categories?.name || '—'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs font-mono text-Mist whitespace-nowrap font-bold">
                          {formatBytes(doc.file_size)}
                        </td>
                        <td className="px-5 py-4">
                          {doc.file_hash ? (
                            <button
                              type="button"
                              onClick={() => copyHash(doc.file_hash!)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-Snowflake hover:bg-Pine hover:text-white text-Pine text-xs font-mono transition-colors font-bold shadow-2xs"
                              title={`Click để sao chép SHA-256: ${doc.file_hash}`}
                            >
                              <Hash className="w-3 h-3" />
                              <span>{doc.file_hash.substring(0, 10)}…</span>
                              <Copy className="w-3 h-3 opacity-70" />
                            </button>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            {STATUS_ICON[doc.status]}
                            <StatusBadge status={doc.status} />
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/audit/${doc.id}`}
                              title="Mở Phòng Kiểm toán AI"
                              className="inline-flex items-center gap-1 px-3 py-2 bg-Snowflake text-Pine hover:bg-Pine hover:text-white text-xs font-black rounded-xl transition-all shadow-2xs"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Kiểm toán
                            </Link>

                            {hasPermission('RUN_AI_AUDIT') && doc.status !== 'Analyzing' && (
                              <button
                                type="button"
                                onClick={() => handleAnalyze(doc)}
                                disabled={analyzingIds.has(doc.id)}
                                title="Kích hoạt AI rà soát ngay"
                                className="inline-flex items-center gap-1 px-3 py-2 bg-Berry text-white hover:brightness-110 text-xs font-black rounded-xl transition-all disabled:opacity-40 shadow-sm"
                              >
                                {analyzingIds.has(doc.id) ? <Spinner size="sm" /> : <Cpu className="w-3.5 h-3.5" />}
                                Quét AI
                              </button>
                            )}

                            {hasPermission('DELETE_DOC') && (
                              <button
                                type="button"
                                disabled={doc.status === 'Analyzing'}
                                onClick={() => setConfirmDelete(doc)}
                                title="Xóa hợp đồng"
                                className="p-2 text-Berry hover:bg-Berry/10 rounded-xl transition-colors disabled:opacity-30"
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

              {/* Danh sách thẻ Mobile */}
              <div className="md:hidden grid grid-cols-1 gap-4">
                {filteredDocs.map((doc) => (
                  <div key={doc.id} className="rounded-2xl border border-Mist/30 bg-white p-4 shadow-sm space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/audit/${doc.id}`} className="text-sm font-black text-Pine truncate">
                        {doc.file_name}
                      </Link>
                      <StatusBadge status={doc.status} />
                    </div>
                    <p className="text-xs text-Branch font-black">
                      {doc.Suppliers?.company_name} · <span className="text-Mist">{doc.Categories?.name}</span>
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-Mist/15">
                      <span className="text-xs font-mono text-Mist font-bold">{formatBytes(doc.file_size)}</span>
                      <div className="flex items-center gap-2">
                        <Link to={`/audit/${doc.id}`} className="px-3 py-1.5 bg-Snowflake text-Pine text-xs font-black rounded-xl">
                          Kiểm toán
                        </Link>
                        {hasPermission('RUN_AI_AUDIT') && doc.status !== 'Analyzing' && (
                          <button
                            type="button"
                            onClick={() => handleAnalyze(doc)}
                            disabled={analyzingIds.has(doc.id)}
                            className="px-3 py-1.5 bg-Berry text-white text-xs font-black rounded-xl"
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
            <div className="pt-4 border-t border-Mist/15">
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
        <div className="space-y-5">
          <div
            ref={dropRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-3xl p-8 text-center transition-all duration-300 ${
              isDragging ? 'border-Pine bg-Pine/5 scale-[1.01]' : 'border-Mist/40 hover:border-Pine hover:bg-Snowflake/50'
            }`}
          >
            {uploadFile ? (
              <div className="flex items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-Mist/25 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-Pine/10 text-Pine flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-black text-Pine truncate">{uploadFile.name}</p>
                    <p className="text-xs font-mono text-Mist font-bold">{formatBytes(uploadFile.size)}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setUploadFile(null)} className="text-Berry hover:text-Berry/70">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 text-Pine mx-auto mb-3" />
                <p className="text-sm font-black text-Pine">Kéo & thả file PDF vào đây</p>
                <p className="text-xs text-Mist mt-1 font-medium">hoặc bấm chọn từ máy tính</p>
                <label className="inline-block mt-4 px-5 py-2.5 bg-Pine text-white text-xs font-black rounded-xl cursor-pointer hover:bg-Berry transition-all shadow-md">
                  Chọn file PDF
                  <input type="file" accept="application/pdf" onChange={handleFileInput} className="hidden" />
                </label>
                <p className="text-xs font-bold text-Mist mt-3">Tối đa 50 MB · Chỉ nhận định dạng PDF</p>
              </>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-1.5">Nhà cung ứng *</label>
              <select
                value={uploadSupplierId}
                onChange={(e) => setUploadSupplierId(e.target.value)}
                className="w-full px-4 py-3 border border-Mist/30 rounded-xl text-sm font-black focus:outline-none focus:border-Pine bg-white text-Pine shadow-2xs cursor-pointer"
              >
                <option value="">-- Chọn nhà cung ứng --</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-1.5">Loại hợp đồng *</label>
              <select
                value={uploadCategoryId}
                onChange={(e) => setUploadCategoryId(e.target.value)}
                className="w-full px-4 py-3 border border-Mist/30 rounded-xl text-sm font-black focus:outline-none focus:border-Pine bg-white text-Pine shadow-2xs cursor-pointer"
              >
                <option value="">-- Chọn loại hợp đồng --</option>
                {contractTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-Snowflake/80 rounded-2xl p-4 border border-Mist/25">
            <ShieldCheck className="w-5 h-5 text-Pine mt-0.5 flex-shrink-0" />
            <p className="text-xs text-Branch leading-relaxed font-medium">
              Hệ thống tự động băm <strong>SHA-256</strong> để chống tải trùng hợp đồng.
              Nội dung nhạy cảm sẽ được ẩn danh bằng <strong>Data Masking</strong> trước khi gửi vào AI.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setUploadOpen(false); setUploadFile(null) }}
              className="flex-1 py-3 border border-Mist/30 text-Branch text-xs font-black rounded-xl hover:bg-Snowflake transition-all"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
              className="flex-1 py-3 bg-Pine text-white text-xs font-black rounded-xl hover:bg-Berry disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-Pine/20"
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