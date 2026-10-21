import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Plus, Search, Edit2, Trash2, RotateCcw, Lock, Building2,
  Eye, FileText, Mail, Phone, MapPin, ExternalLink, Ban,
  Download, ShieldCheck, AlertTriangle
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
  const { hasPermission, role } = useAuth()
  const canRestore = role === 'Admin' || role === 'Manager'

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [industries, setIndustries] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  const [search, setSearch]                 = useState('')
  const [filterIndustry, setFilterIndustry] = useState('')
  const [filterRiskLevel, setFilterRiskLevel] = useState<'' | 'Safe' | 'Warning' | 'Danger'>('')
  const [sortBy, setSortBy]                 = useState<'default' | 'risk_asc' | 'risk_desc'>('default')
  const [statusTab, setStatusTab]           = useState<'all' | 'active' | 'deleted'>('all')

  const [modalOpen, setModalOpen]           = useState(false)
  const [editTarget, setEditTarget]         = useState<Supplier | null>(null)
  const [form, setForm]                     = useState<SupplierFormData>(EMPTY_FORM)
  const [saving, setSaving]                 = useState(false)

  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null)
  const [detailLoading, setDetailLoading]   = useState(false)

  const [confirmDelete, setConfirmDelete]   = useState<Supplier | null>(null)
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
      const baseParams: Record<string, string | number | boolean | undefined> = { page, limit }
      if (search.trim()) baseParams.search = search.trim()
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
  }, [page, limit, search, filterIndustry, statusTab])

  useEffect(() => { fetchSuppliers() }, [fetchSuppliers])

  // Lọc theo Ngưỡng rủi ro & Sắp xếp tự động nhưng luôn giữ dòng xóa mềm ở dưới đáy
  const displayedSuppliers = useMemo(() => {
    const filtered = suppliers.filter((s) => {
      if (!filterRiskLevel) return true
      return getRiskStatus(s.risk_score) === filterRiskLevel
    })

    const activeList = filtered.filter((s) => !s.is_deleted)
    const deletedList = filtered.filter((s) => s.is_deleted)

    if (sortBy === 'risk_asc') {
      activeList.sort((a, b) => (a.risk_score ?? 100) - (b.risk_score ?? 100))
    } else if (sortBy === 'risk_desc') {
      activeList.sort((a, b) => (b.risk_score ?? 100) - (a.risk_score ?? 100))
    }

    return [...activeList, ...deletedList]
  }, [suppliers, filterRiskLevel, sortBy])

  const openDetail = async (s: Supplier) => {
    setDetailSupplier(s)
    if (s.is_deleted) return
    setDetailLoading(true)
    try {
      const res = await supplierApi.getById(s.id)
      const fullData = res.data?.supplier || res.data?.data || res.data
      if (fullData) setDetailSupplier(fullData as Supplier)
    } catch {
      // Giữ thông tin cơ bản
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
        toast.success('Cập nhật hồ sơ nhà cung ứng thành công.')
      } else {
        await supplierApi.create(payload)
        toast.success('Thêm nhà cung ứng mới thành công.')
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
      toast.success(`Đã xóa mềm đối tác "${confirmDelete.company_name}".`)
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
      toast.success(`Đã khôi phục đối tác "${confirmRestore.company_name}" hoạt động trở lại.`)
      setConfirmRestore(null)
      fetchSuppliers()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Khôi phục thất bại.')
    }
  }

  const handleExportSuppliersCSV = () => {
    const BOM = '\uFEFF'
    const header = ['ID', 'Tên Công Ty', 'Mã Số Thuế', 'Ngành Nghề', 'Email', 'Điểm Tín Nhiệm', 'Trạng Thái']
    const rows = displayedSuppliers.map((s) => [
      s.id,
      `"${s.company_name.replace(/"/g, '""')}"`,
      s.tax_code,
      `"${(s.Categories?.name || s.industry?.name || '').replace(/"/g, '""')}"`,
      s.contact_email || '',
      s.risk_score ?? 100,
      s.is_deleted ? 'Đã xóa / Lưu trữ' : 'Đang hoạt động',
    ])
    const csv = BOM + [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Danh-sach-nha-cung-ung-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Đã xuất danh sách nhà cung ứng ra CSV.')
  }

  const safeCount = suppliers.filter((s) => !s.is_deleted && (s.risk_score ?? 100) >= 80).length
  const riskCount = suppliers.filter((s) => !s.is_deleted && (s.risk_score ?? 100) < 80).length

  return (
    <MainLayout breadcrumb="Đối tác Cung ứng">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-Pine tracking-tight">Đối tác Cung ứng</h1>
            <p className="text-xs sm:text-sm text-Mist mt-0.5">
              Quản lý hồ sơ pháp lý và điểm tín nhiệm RBA của các nhà cung cấp
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasPermission('EXPORT_REPORT') && (
              <button
                type="button"
                onClick={handleExportSuppliersCSV}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-Mist/40 text-Pine text-xs font-extrabold rounded-2xl hover:bg-Snowflake transition-all shadow-sm"
              >
                <Download className="w-4 h-4" />
                Xuất CSV
              </button>
            )}
            {hasPermission('CREATE_SUPPLIER') && (
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-2xl hover:bg-Pine/90 shadow-sm hover:shadow-md transition-all duration-200"
              >
                <Plus className="w-4 h-4" />
                Thêm nhà cung ứng
              </button>
            )}
          </div>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Pine text-white flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Tổng hồ sơ đối tác</p>
              <p className="text-xl font-extrabold text-Pine">{total}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Mist text-Pine flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Đạt ngưỡng An toàn (80–100đ)</p>
              <p className="text-xl font-extrabold text-Pine">{safeCount}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Berry text-white flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Cảnh báo & Nguy hiểm (&lt;80đ)</p>
              <p className="text-xl font-extrabold text-Berry">{riskCount}</p>
            </div>
          </div>
        </div>

        {/* Clean Filter Tabs + Search Bar */}
        <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-Mist/15 pb-3">
            <div className="flex items-center gap-1 bg-Snowflake/60 p-1 rounded-2xl w-fit">
              {[
                { key: 'all',     label: 'Tất cả' },
                { key: 'active',  label: 'Đang hoạt động' },
                { key: 'deleted', label: 'Đã lưu trữ' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setStatusTab(tab.key as typeof statusTab); setPage(1) }}
                  className={`px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition-all ${
                    statusTab === tab.key
                      ? 'bg-Pine text-white shadow-sm'
                      : 'text-Branch hover:text-Pine'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 flex-1 xl:max-w-3xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
                <input
                  type="text"
                  placeholder="Tìm công ty, MST, email..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="w-full pl-9 pr-3 py-2 border border-Mist/40 rounded-xl text-xs bg-Snowflake/20 text-Pine placeholder-Mist focus:outline-none focus:border-Pine"
                />
              </div>
              <select
                value={filterIndustry}
                onChange={(e) => { setFilterIndustry(e.target.value); setPage(1) }}
                className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold focus:outline-none focus:border-Pine bg-white text-Pine"
              >
                <option value="">Tất cả ngành nghề</option>
                {industries.map((ind) => (
                  <option key={ind.id} value={ind.id}>{ind.name}</option>
                ))}
              </select>
              <select
                value={filterRiskLevel}
                onChange={(e) => setFilterRiskLevel(e.target.value as typeof filterRiskLevel)}
                className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold focus:outline-none focus:border-Pine bg-white text-Pine"
              >
                <option value="">Mọi ngưỡng rủi ro</option>
                <option value="Safe">An toàn (80–100đ)</option>
                <option value="Warning">Cảnh báo (50–79đ)</option>
                <option value="Danger">Nguy hiểm (&lt;50đ)</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold focus:outline-none focus:border-Pine bg-white text-Pine"
              >
                <option value="default">Sắp xếp: Mặc định</option>
                <option value="risk_asc">Điểm thấp → cao (Ưu tiên rà soát)</option>
                <option value="risk_desc">Điểm cao → thấp</option>
              </select>
            </div>
          </div>

          {/* Content: Desktop Table + Mobile Cards */}
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : displayedSuppliers.length === 0 ? (
            <EmptyState message="Không tìm thấy nhà cung ứng nào phù hợp với bộ lọc" />
          ) : (
            <>
              {/* 1. DESKTOP TABLE VIEW */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-Mist/20">
                <table className="min-w-full divide-y divide-Mist/15">
                  <thead>
                    <tr className="bg-Pine text-white">
                      {['Đối tác Cung ứng', 'Mã số thuế', 'Liên hệ', 'Điểm Tín nhiệm', 'Trạng thái', 'Thao tác'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-Mist/15 bg-white">
                    {displayedSuppliers.map((s) => (
                      <tr
                        key={s.id}
                        className={`transition-colors ${
                          s.is_deleted
                            ? 'opacity-60 bg-Snowflake/50 cursor-not-allowed'
                            : 'hover:bg-Snowflake/35'
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                s.is_deleted ? 'bg-Berry/10 text-Berry' : 'bg-Pine/10 text-Pine'
                              }`}
                            >
                              {s.is_deleted ? <Ban className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() => openDetail(s)}
                                className={`text-sm font-bold text-left ${
                                  s.is_deleted ? 'line-through text-Branch' : 'text-Pine hover:underline'
                                }`}
                              >
                                {s.company_name}
                              </button>
                              <p className="text-xs text-Mist">
                                {s.industry?.name || s.Categories?.name || 'Chưa phân loại ngành'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs font-mono font-bold text-Branch">
                          {s.tax_code}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-Branch">
                          <div>{s.contact_email || '—'}</div>
                          {s.contact_phone && <div className="text-[11px] text-Mist">{s.contact_phone}</div>}
                        </td>
                        <td className="px-4 py-3.5">
                          <RiskScoreBar score={s.risk_score} />
                        </td>
                        <td className="px-4 py-3.5">
                          {s.is_deleted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-Berry/10 text-Berry border border-Berry/20">
                              <Ban className="w-3 h-3" /> Đã xóa mềm
                            </span>
                          ) : (
                            <StatusBadge status={getRiskStatus(s.risk_score)} />
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openDetail(s)}
                              className="p-1.5 text-Pine hover:bg-Snowflake rounded-xl transition-colors"
                              title="Xem hồ sơ chi tiết"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {s.is_deleted ? (
                              <>
                                <span
                                  title="Bản ghi đã xóa mềm — Không thể chỉnh sửa"
                                  className="p-1.5 text-Berry/50 cursor-not-allowed rounded-xl"
                                >
                                  <Lock className="w-4 h-4" />
                                </span>
                                {canRestore && hasPermission('EDIT_SUPPLIER') && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRestore(s)}
                                    title="Khôi phục nhà cung ứng"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-Pine bg-Snowflake hover:bg-Mist/30 border border-Mist/40 rounded-xl transition-colors cursor-pointer"
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
                                    className="p-1.5 text-Pine hover:bg-Snowflake rounded-xl transition-colors"
                                    title="Chỉnh sửa thông tin"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}
                                {hasPermission('DELETE_SUPPLIER') && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDelete(s)}
                                    className="p-1.5 text-Berry hover:bg-Berry/10 rounded-xl transition-colors"
                                    title="Xóa mềm (Chuyển vào lưu trữ)"
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

              {/* 2. MOBILE CARD VIEW */}
              <div className="md:hidden grid grid-cols-1 gap-3">
                {displayedSuppliers.map((s) => (
                  <div
                    key={s.id}
                    className={`rounded-2xl border p-4 transition-all ${
                      s.is_deleted
                        ? 'opacity-65 bg-Snowflake/60 border-Mist/30 cursor-not-allowed'
                        : 'bg-white border-Mist/25 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            s.is_deleted ? 'bg-Berry/10 text-Berry' : 'bg-Pine/10 text-Pine'
                          }`}
                        >
                          {s.is_deleted ? <Ban className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => openDetail(s)}
                            className={`text-sm font-bold truncate block text-left ${
                              s.is_deleted ? 'line-through text-Branch' : 'text-Pine'
                            }`}
                          >
                            {s.company_name}
                          </button>
                          <span className="text-xs font-mono text-Mist">MST: {s.tax_code}</span>
                        </div>
                      </div>
                      {s.is_deleted ? (
                        <span className="px-2 py-0.5 rounded-lg bg-Berry/10 text-Berry text-[11px] font-bold">
                          Đã xóa
                        </span>
                      ) : (
                        <StatusBadge status={getRiskStatus(s.risk_score)} />
                      )}
                    </div>

                    <div className="my-2.5">
                      <RiskScoreBar score={s.risk_score} />
                    </div>

                    <div className="flex items-center justify-between pt-2.5 border-t border-Mist/15 text-xs">
                      <span className="text-Mist truncate max-w-[160px]">
                        {s.Categories?.name || s.contact_email || '—'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDetail(s)}
                          className="px-2.5 py-1 bg-Snowflake text-Pine font-bold rounded-xl"
                        >
                          Chi tiết
                        </button>
                        {s.is_deleted ? (
                          canRestore && hasPermission('EDIT_SUPPLIER') ? (
                            <button
                              type="button"
                              onClick={() => setConfirmRestore(s)}
                              className="px-2.5 py-1 bg-Snowflake text-Pine font-bold rounded-xl border border-Mist/40"
                            >
                              Khôi phục
                            </button>
                          ) : (
                            <span className="text-Mist flex items-center gap-1">
                              <Lock className="w-3.5 h-3.5" /> Đã khóa
                            </span>
                          )
                        ) : (
                          <>
                            {hasPermission('EDIT_SUPPLIER') && (
                              <button
                                type="button"
                                onClick={() => openEdit(s)}
                                className="p-1.5 text-Pine bg-Snowflake rounded-xl"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {hasPermission('DELETE_SUPPLIER') && (
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(s)}
                                className="p-1.5 text-Berry bg-Berry/10 rounded-xl"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Always-visible Pagination Bar */}
          {!loading && (
            <div className="pt-2 border-t border-Mist/15">
              <Pagination
                page={page}
                total={total}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={(newLimit) => {
                  setLimit(newLimit)
                  setPage(1)
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Supplier Detail Modal */}
      <Modal
        isOpen={!!detailSupplier}
        title={`Hồ sơ Đối tác: ${detailSupplier?.company_name || ''}`}
        onClose={() => setDetailSupplier(null)}
        size="lg"
      >
        {detailSupplier && (
          <div className="space-y-5">
            <div className="bg-Snowflake/50 rounded-2xl p-4 border border-Mist/25">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <span className="text-xs text-Mist font-mono font-semibold">MST: {detailSupplier.tax_code}</span>
                  <h4 className="text-base font-extrabold text-Pine">{detailSupplier.company_name}</h4>
                  <p className="text-xs text-Branch">
                    Ngành nghề: <strong>{detailSupplier.Categories?.name || detailSupplier.industry?.name || 'Chưa phân loại'}</strong>
                  </p>
                </div>
                <StatusBadge status={detailSupplier.is_deleted ? 'Error' : getRiskStatus(detailSupplier.risk_score)} />
              </div>

              <div className="mb-3">
                <p className="text-xs font-semibold text-Pine mb-1">Điểm tín nhiệm & Tuân thủ RBA:</p>
                <RiskScoreBar score={detailSupplier.risk_score} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2.5 border-t border-Mist/20 text-xs text-Branch">
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-Pine flex-shrink-0" />
                  <span className="truncate">{detailSupplier.contact_email || 'Chưa có email'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-Pine flex-shrink-0" />
                  <span>{detailSupplier.contact_phone || 'Chưa có SĐT'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-Pine flex-shrink-0" />
                  <span className="truncate">{detailSupplier.address || 'Chưa cập nhật địa chỉ'}</span>
                </div>
              </div>
            </div>

            <div>
              <h5 className="text-sm font-extrabold text-Pine mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Lịch sử Hợp đồng PDF đã tải lên
              </h5>
              {detailLoading ? (
                <div className="flex justify-center py-6"><Spinner size="sm" /></div>
              ) : !detailSupplier.Documents || detailSupplier.Documents.length === 0 ? (
                <p className="text-xs text-Mist italic py-5 text-center bg-Snowflake/30 rounded-2xl">
                  Nhà cung ứng này chưa có hợp đồng nào được tải lên.
                </p>
              ) : (
                <div className="divide-y divide-Mist/15 border border-Mist/20 rounded-2xl overflow-hidden">
                  {detailSupplier.Documents.map((doc) => (
                    <div key={doc.id} className="px-4 py-3 flex items-center justify-between hover:bg-Snowflake/40 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-Pine truncate text-xs">{doc.file_name}</p>
                        <p className="text-[11px] text-Mist">
                          Ngày tải: {new Date(doc.uploaded_at).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={doc.status} />
                        <Link
                          to={`/audit/${doc.id}`}
                          onClick={() => setDetailSupplier(null)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Pine/90"
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
        title={editTarget ? 'Chỉnh sửa hồ sơ nhà cung ứng' : 'Thêm nhà cung ứng mới'}
        onClose={() => setModalOpen(false)}
        size="md"
      >
        <div className="space-y-4">
          {[
            { label: 'Tên công ty *', key: 'company_name', placeholder: 'CÔNG TY TNHH ABC', type: 'text', disabled: false },
            { label: 'Mã số thuế *', key: 'tax_code', placeholder: '0123456789', type: 'text', disabled: !!editTarget },
            { label: 'Email liên hệ', key: 'contact_email', placeholder: 'contact@company.vn', type: 'email', disabled: false },
            { label: 'Số điện thoại', key: 'contact_phone', placeholder: '0901234567', type: 'text', disabled: false },
            { label: 'Địa chỉ trụ sở', key: 'address', placeholder: 'KCN Biên Hòa 2, Đồng Nai', type: 'text', disabled: false },
          ].map(({ label, key, placeholder, type, disabled }) => (
            <div key={key}>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">{label}</label>
              <input
                type={type}
                disabled={disabled}
                value={form[key as keyof SupplierFormData]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-white text-Pine placeholder-Mist transition-all disabled:bg-Snowflake disabled:cursor-not-allowed"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Ngành nghề hoạt động</label>
            <select
              value={form.industry_id}
              onChange={(e) => setForm((f) => ({ ...f, industry_id: e.target.value }))}
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Pine transition-all"
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
              className="flex-1 py-2.5 border border-Mist/40 text-Branch text-xs font-bold rounded-xl hover:bg-Snowflake transition-all"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Pine/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {saving ? <Spinner size="sm" /> : null}
              {editTarget ? 'Lưu thay đổi' : 'Tạo hồ sơ đối tác'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Soft Delete */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Xác nhận xóa mềm nhà cung ứng?"
        message={`Bạn có chắc chắn muốn chuyển đối tác "${confirmDelete?.company_name}" vào danh sách lưu trữ? Bản ghi sau khi xóa sẽ bị khóa chỉnh sửa và đẩy xuống cuối bảng.`}
        confirmLabel="Đồng ý xóa mềm"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Confirm Restore */}
      <ConfirmModal
        isOpen={!!confirmRestore}
        title="Khôi phục hoạt động nhà cung ứng?"
        message={`Đối tác "${confirmRestore?.company_name}" sẽ được mở khóa và đưa trở lại danh sách hoạt động chính thức.`}
        confirmLabel="Khôi phục ngay"
        variant="info"
        onConfirm={handleRestore}
        onCancel={() => setConfirmRestore(null)}
      />
    </MainLayout>
  )
}