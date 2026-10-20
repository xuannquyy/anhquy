import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Plus, Search, Edit2, Trash2, RotateCcw, Lock, Building2,
  Eye, FileText, Mail, Phone, MapPin, ExternalLink
} from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { ConfirmModal, Modal, Pagination, RiskScoreBar, StatusBadge, Spinner, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { supplierApi, categoryApi } from '../api'

interface SupplierDoc {
  id: number
  file_name: string
  status: string
  uploaded_at: string
}

interface Supplier {
  id: number
  company_name: string
  tax_code: string
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  risk_score: number | null
  is_deleted: boolean
  created_at: string
  industry?: { id: number; name: string } | null
  Categories?: { id: number; name: string; category_type: string } | null
  Documents?: SupplierDoc[]
}

interface Category {
  id: number
  name: string
  category_type: string
}

interface SupplierFormData {
  company_name: string
  tax_code: string
  industry_id: string
  contact_email: string
  contact_phone: string
  address: string
}

const EMPTY_FORM: SupplierFormData = {
  company_name: '', tax_code: '', industry_id: '',
  contact_email: '', contact_phone: '', address: '',
}

function getRiskStatus(score: number | null): 'Safe' | 'Warning' | 'Danger' {
  const s = score ?? 100
  if (s >= 80) return 'Safe'
  if (s >= 50) return 'Warning'
  return 'Danger'
}

export default function SuppliersPage() {
  const { hasPermission } = useAuth()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [industries, setIndustries] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const LIMIT = 10

  const [search, setSearch] = useState('')
  const [filterIndustry, setFilterIndustry] = useState('')
  const [statusTab, setStatusTab] = useState<'all' | 'active' | 'deleted'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)
  const [form, setForm] = useState<SupplierFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Modal xem chi tiết nhà cung ứng & danh sách hợp đồng
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<Supplier | null>(null)

  useEffect(() => {
    categoryApi.getAll({ category_type: 'Industry', is_active: true, limit: 200 })
      .then((r) => {
        const data = r.data?.data || r.data || {}
        setIndustries((data as { items?: Category[] })?.items || [])
      })
      .catch(() => {})
  }, [])

  const fetchSuppliers = useCallback(async () => {
    setLoading(true)
    try {
      const baseParams: Record<string, string | number | boolean | undefined> = { page, limit: LIMIT }
      if (search) baseParams.search = search
      if (filterIndustry) baseParams.industry_id = filterIndustry

      if (statusTab === 'active') {
        const res = await supplierApi.getAll({ ...baseParams, is_deleted: false })
        const data = res.data?.data || res.data || {}
        setSuppliers((data as { items?: Supplier[] })?.items || [])
        setTotal((data as { total?: number })?.total || 0)
      } else if (statusTab === 'deleted') {
        const res = await supplierApi.getAll({ ...baseParams, is_deleted: true })
        const data = res.data?.data || res.data || {}
        setSuppliers((data as { items?: Supplier[] })?.items || [])
        setTotal((data as { total?: number })?.total || 0)
      } else {
        const [activeRes, deletedRes] = await Promise.all([
          supplierApi.getAll({ ...baseParams, is_deleted: false }),
          supplierApi.getAll({ ...baseParams, is_deleted: true }),
        ])
        const activeData = activeRes.data?.data || activeRes.data || {}
        const deletedData = deletedRes.data?.data || deletedRes.data || {}
        const activeItems: Supplier[] = (activeData as { items?: Supplier[] })?.items || []
        const deletedItems: Supplier[] = (deletedData as { items?: Supplier[] })?.items || []
        const totalCount =
          ((activeData as { total?: number })?.total || 0) +
          ((deletedData as { total?: number })?.total || 0)

        setSuppliers([...activeItems, ...deletedItems])
        setTotal(totalCount)
      }
    } catch {
      toast.error('Không thể tải danh sách nhà cung ứng.')
    } finally {
      setLoading(false)
    }
  }, [page, search, filterIndustry, statusTab])

  useEffect(() => { fetchSuppliers() }, [fetchSuppliers])

  const openDetail = async (s: Supplier) => {
    setDetailSupplier(s)
    if (s.is_deleted) return
    setDetailLoading(true)
    try {
      const res = await supplierApi.getById(s.id)
      const fullData = res.data?.supplier || res.data?.data || res.data
      if (fullData) setDetailSupplier(fullData as Supplier)
    } catch {
      // Giữ thông tin cơ bản nếu lỗi
    } finally {
      setDetailLoading(false)
    }
  }

  const openCreate = () => { setEditTarget(null); setForm(EMPTY_FORM); setModalOpen(true) }
  const openEdit   = (s: Supplier) => {
    if (s.is_deleted) return
    setEditTarget(s)
    setForm({
      company_name: s.company_name,
      tax_code: s.tax_code,
      industry_id: String(s.industry?.id || s.Categories?.id || ''),
      contact_email: s.contact_email || '',
      contact_phone: s.contact_phone || '',
      address: s.address || '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.company_name.trim() || !form.tax_code.trim()) {
      toast.error('Tên công ty và mã số thuế không được để trống.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        company_name: form.company_name.trim(),
        tax_code: form.tax_code.trim(),
        industry_id: form.industry_id ? Number(form.industry_id) : undefined,
        contact_email: form.contact_email || undefined,
        contact_phone: form.contact_phone || undefined,
        address: form.address || undefined,
      }
      if (editTarget) {
        await supplierApi.update(editTarget.id, payload)
        toast.success('Cập nhật nhà cung ứng thành công.')
      } else {
        await supplierApi.create(payload)
        toast.success('Thêm nhà cung ứng thành công.')
      }
      setModalOpen(false)
      fetchSuppliers()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Lưu thất bại.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      await supplierApi.delete(confirmDelete.id)
      toast.success(`Đã chuyển nhà cung ứng "${confirmDelete.company_name}" xuống lưu trữ.`)
      setConfirmDelete(null)
      fetchSuppliers()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Xóa thất bại.')
    }
  }

  const handleRestore = async () => {
    if (!confirmRestore) return
    try {
      await supplierApi.restore(confirmRestore.id)
      toast.success(`Đã khôi phục nhà cung ứng "${confirmRestore.company_name}".`)
      setConfirmRestore(null)
      fetchSuppliers()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Khôi phục thất bại.')
    }
  }

  return (
    <MainLayout breadcrumb="Nhà cung ứng">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-Pine">Nhà cung ứng</h1>
            <p className="text-sm text-Mist mt-0.5">Quản lý hồ sơ đối tác và điểm tín nhiệm chuỗi cung ứng</p>
          </div>
          {hasPermission('CREATE_SUPPLIER') && (
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 shadow-sm hover:shadow-md transition-all duration-300"
            >
              <Plus className="w-4 h-4" />
              Thêm nhà cung ứng
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-Mist/20 bg-white rounded-t-lg px-2">
          {[
            { key: 'all',     label: 'Tất cả (Đẩy dòng lưu trữ xuống cuối)' },
            { key: 'active',  label: 'Đang hoạt động' },
            { key: 'deleted', label: 'Thùng rác / Đã lưu trữ' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setStatusTab(tab.key as typeof statusTab); setPage(1) }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                statusTab === tab.key
                  ? 'border-Pine text-Pine'
                  : 'border-transparent text-Mist hover:text-Branch'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
            <input
              type="text"
              placeholder="Tìm kiếm tên công ty, mã số thuế, email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine bg-white text-Branch placeholder-Mist transition-all"
            />
          </div>
          <select
            value={filterIndustry}
            onChange={(e) => { setFilterIndustry(e.target.value); setPage(1) }}
            className="px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine bg-white text-Branch transition-all min-w-[180px]"
          >
            <option value="">Tất cả ngành nghề</option>
            {industries.map((ind) => (
              <option key={ind.id} value={ind.id}>{ind.name}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-Mist/20 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : suppliers.length === 0 ? (
            <EmptyState message="Không tìm thấy nhà cung ứng nào" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-Mist/10">
                <thead>
                  <tr className="bg-Snowflake/60">
                    {['Công ty', 'Mã số thuế', 'Email liên hệ', 'Điểm rủi ro', 'Trạng thái', 'Hành động'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-Mist uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-Mist/8">
                  {suppliers.map((s) => (
                    <tr
                      key={s.id}
                      className={`hover:bg-Snowflake/40 transition-colors ${s.is_deleted ? 'opacity-60 bg-Snowflake/60' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-Pine/8 rounded-md flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-4 h-4 text-Pine" />
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => openDetail(s)}
                              className="text-sm font-medium text-Pine hover:underline text-left"
                            >
                              {s.company_name}
                            </button>
                            {(s.industry?.name || s.Categories?.name) && (
                              <p className="text-xs text-Mist">{s.industry?.name || s.Categories?.name}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-Branch">{s.tax_code}</td>
                      <td className="px-4 py-3 text-sm text-Branch">{s.contact_email || '—'}</td>
                      <td className="px-4 py-3"><RiskScoreBar score={s.risk_score} /></td>
                      <td className="px-4 py-3">
                        {s.is_deleted ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-Snowflake text-Mist border border-Mist/30">
                            <Lock className="w-3 h-3" /> Đã lưu trữ
                          </span>
                        ) : (
                          <StatusBadge status={getRiskStatus(s.risk_score)} />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDetail(s)}
                            className="p-1.5 text-Pine hover:bg-Pine/8 rounded-md transition-colors"
                            title="Xem chi tiết hồ sơ & Lịch sử hợp đồng"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {s.is_deleted ? (
                            <>
                              <button
                                type="button"
                                disabled
                                title="Đã khóa chỉnh sửa"
                                className="p-1.5 text-Mist/40 cursor-not-allowed rounded-md"
                              >
                                <Lock className="w-4 h-4" />
                              </button>
                              {hasPermission('EDIT_SUPPLIER') && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmRestore(s)}
                                  title="Khôi phục hoạt động"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Khôi phục
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              {hasPermission('EDIT_SUPPLIER') && (
                                <button
                                  type="button"
                                  onClick={() => openEdit(s)}
                                  className="p-1.5 text-Pine hover:bg-Pine/8 rounded-md transition-colors"
                                  title="Chỉnh sửa"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                              {hasPermission('DELETE_SUPPLIER') && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(s)}
                                  className="p-1.5 text-Berry hover:bg-Berry/8 rounded-md transition-colors"
                                  title="Xóa mềm (Lưu trữ)"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
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

      {/* Supplier Detail Modal (Hồ sơ chi tiết & Lịch sử Hợp đồng) */}
      <Modal
        isOpen={!!detailSupplier}
        title={`Hồ sơ Đối tác: ${detailSupplier?.company_name || ''}`}
        onClose={() => setDetailSupplier(null)}
        size="lg"
      >
        {detailSupplier && (
          <div className="space-y-5">
            <div className="bg-Snowflake/60 rounded-lg p-4 border border-Mist/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <span className="text-xs text-Mist font-mono">MST: {detailSupplier.tax_code}</span>
                  <h4 className="text-base font-bold text-Pine">{detailSupplier.company_name}</h4>
                  <p className="text-xs text-Branch">
                    Ngành nghề: <strong>{detailSupplier.Categories?.name || detailSupplier.industry?.name || 'Chưa phân loại'}</strong>
                  </p>
                </div>
                <StatusBadge status={detailSupplier.is_deleted ? 'Error' : getRiskStatus(detailSupplier.risk_score)} />
              </div>

              <div className="mb-3">
                <p className="text-xs text-Mist mb-1">Điểm tín nhiệm & Tuân thủ RBA:</p>
                <RiskScoreBar score={detailSupplier.risk_score} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-Mist/20 text-xs text-Branch">
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-Mist flex-shrink-0" />
                  <span className="truncate">{detailSupplier.contact_email || 'Chưa có email'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-Mist flex-shrink-0" />
                  <span>{detailSupplier.contact_phone || 'Chưa có SĐT'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-Mist flex-shrink-0" />
                  <span className="truncate">{detailSupplier.address || 'Chưa cập nhật địa chỉ'}</span>
                </div>
              </div>
            </div>

            <div>
              <h5 className="text-sm font-semibold text-Pine mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Lịch sử Hợp đồng PDF đã tải lên
              </h5>
              {detailLoading ? (
                <div className="flex justify-center py-6"><Spinner size="sm" /></div>
              ) : !detailSupplier.Documents || detailSupplier.Documents.length === 0 ? (
                <p className="text-xs text-Mist italic py-4 text-center bg-Snowflake/30 rounded-md">
                  Nhà cung ứng này chưa có hợp đồng nào được tải lên.
                </p>
              ) : (
                <div className="divide-y divide-Mist/15 border border-Mist/20 rounded-md overflow-hidden">
                  {detailSupplier.Documents.map((doc) => (
                    <div key={doc.id} className="px-3.5 py-2.5 flex items-center justify-between hover:bg-Snowflake/40 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-Pine truncate">{doc.file_name}</p>
                        <p className="text-xs text-Mist">
                          Ngày tải: {new Date(doc.uploaded_at).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={doc.status} />
                        <Link
                          to={`/audit/${doc.id}`}
                          onClick={() => setDetailSupplier(null)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-Pine text-white text-xs rounded-md hover:bg-Pine/90"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Kiểm toán
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        title={editTarget ? 'Chỉnh sửa nhà cung ứng' : 'Thêm nhà cung ứng mới'}
        onClose={() => setModalOpen(false)}
        size="md"
      >
        <div className="space-y-4">
          {[
            { label: 'Tên công ty *', key: 'company_name', placeholder: 'CÔNG TY TNHH ABC', type: 'text', disabled: false },
            { label: 'Mã số thuế *', key: 'tax_code', placeholder: '0123456789', type: 'text', disabled: !!editTarget },
            { label: 'Email liên hệ', key: 'contact_email', placeholder: 'contact@company.vn', type: 'email', disabled: false },
            { label: 'Số điện thoại', key: 'contact_phone', placeholder: '0901234567', type: 'text', disabled: false },
            { label: 'Địa chỉ', key: 'address', placeholder: '123 Nguyễn Văn A, TP. Biên Hòa, Đồng Nai', type: 'text', disabled: false },
          ].map(({ label, key, placeholder, type, disabled }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-Branch mb-1.5">{label}</label>
              <input
                type={type}
                disabled={disabled}
                value={form[key as keyof SupplierFormData]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine bg-white text-Branch placeholder-Mist transition-all disabled:bg-Snowflake disabled:cursor-not-allowed"
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-Branch mb-1.5">Ngành nghề</label>
            <select
              value={form.industry_id}
              onChange={(e) => setForm((f) => ({ ...f, industry_id: e.target.value }))}
              className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine bg-white text-Branch transition-all"
            >
              <option value="">-- Chọn ngành nghề --</option>
              {industries.map((ind) => (
                <option key={ind.id} value={ind.id}>{ind.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 py-2.5 border border-Mist/40 text-Branch text-sm rounded-md hover:bg-Snowflake transition-all"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {saving ? <Spinner size="sm" /> : null}
              {editTarget ? 'Lưu thay đổi' : 'Thêm mới'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Delete */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Lưu trữ (Xóa mềm) nhà cung ứng?"
        message={`Nhà cung ứng "${confirmDelete?.company_name}" sẽ được đẩy xuống cuối bảng và khóa chỉnh sửa. Bạn có thể khôi phục lại bất cứ lúc nào.`}
        confirmLabel="Xóa mềm"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Confirm Restore */}
      <ConfirmModal
        isOpen={!!confirmRestore}
        title="Khôi phục nhà cung ứng?"
        message={`Khôi phục nhà cung ứng "${confirmRestore?.company_name}" để hoạt động trở lại bình thường.`}
        confirmLabel="Khôi phục"
        variant="info"
        onConfirm={handleRestore}
        onCancel={() => setConfirmRestore(null)}
      />
    </MainLayout>
  )
}