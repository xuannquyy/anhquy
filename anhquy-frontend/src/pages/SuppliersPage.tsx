import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Plus, Search, Edit2, Trash2, RotateCcw, Lock, Building2,
  Eye, FileText, Mail, Phone, MapPin, ExternalLink, Ban,
  Download, ShieldCheck, AlertTriangle, Sparkles
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
      <div className="space-y-8 pb-16">
        
        {/* 🌟 Header Cao Cấp & Cân Đối */}
        <div className="relative overflow-hidden rounded-[3rem] bg-gradient-to-r from-Pine via-[#1E2930] to-Branch p-8 sm:p-12 text-white shadow-2xl border border-white/20">
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-Berry/30 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-Frostysilver/20 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2.5 px-4.5 py-1.5 rounded-full bg-white/10 backdrop-blur-xl text-Frostysilver text-xs font-black uppercase tracking-widest border border-white/15 shadow-inner">
                <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
                <span>RBA SUPPLIER PORTAL</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-white/95">Secure Compliance</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white drop-shadow-md leading-tight">
                Đối tác Cung ứng
              </h1>
              <p className="text-xs sm:text-sm text-Frostysilver/95 font-medium leading-relaxed max-w-2xl">
                Quản lý hồ sơ pháp lý và điểm tín nhiệm RBA của các nhà cung cấp một cách toàn diện, bảo mật và chuẩn doanh nghiệp.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3.5 flex-shrink-0">
              {hasPermission('EXPORT_REPORT') && (
                <button
                  type="button"
                  onClick={handleExportSuppliersCSV}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white hover:bg-Snowflake text-Pine text-xs font-black rounded-2xl transition-all duration-300 shadow-xl whitespace-nowrap active:scale-95"
                >
                  <Download className="w-4 h-4 text-Pine flex-shrink-0" />
                  <span>Xuất CSV</span>
                </button>
              )}
              {hasPermission('CREATE_SUPPLIER') && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center justify-center gap-2 px-6.5 py-3.5 bg-gradient-to-r from-Berry to-[#872B38] hover:brightness-110 text-white text-xs font-black rounded-2xl transition-all duration-300 shadow-xl shadow-Berry/30 whitespace-nowrap active:scale-95"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  <span>Thêm nhà cung ứng</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 🌟 Summary Strip (3 Thẻ Thống Kê Ultra-Luxury) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white/95 backdrop-blur-3xl rounded-[2.5rem] border border-white p-6 sm:p-7 shadow-[0_15px_45px_rgba(39,54,63,0.06)] flex items-center gap-5 group hover:border-Pine/60 hover:shadow-[0_24px_60px_rgba(39,54,63,0.20)] transition-all duration-500">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-Pine via-[#344854] to-[#1A252B] text-Snowflake flex items-center justify-center flex-shrink-0 shadow-xl shadow-Pine/30 group-hover:scale-110 transition-transform">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-Mist">Tổng hồ sơ đối tác</p>
              <p className="text-3xl sm:text-4xl font-black text-Pine tracking-tight mt-1">{total}</p>
            </div>
          </div>

          <div className="bg-white/95 backdrop-blur-3xl rounded-[2.5rem] border border-white p-6 sm:p-7 shadow-[0_15px_45px_rgba(39,54,63,0.06)] flex items-center gap-5 group hover:border-emerald-500/60 hover:shadow-[0_24px_60px_rgba(16,185,129,0.20)] transition-all duration-500">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 text-Snowflake flex items-center justify-center flex-shrink-0 shadow-xl shadow-emerald-600/30 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-Mist">Đạt ngưỡng An toàn (80–100đ)</p>
              <p className="text-3xl sm:text-4xl font-black text-emerald-700 tracking-tight mt-1">{safeCount}</p>
            </div>
          </div>

          <div className="bg-white/95 backdrop-blur-3xl rounded-[2.5rem] border border-white p-6 sm:p-7 shadow-[0_15px_45px_rgba(39,54,63,0.06)] flex items-center gap-5 group hover:border-Berry/60 hover:shadow-[0_24px_60px_rgba(107,33,44,0.20)] transition-all duration-500">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-Berry via-[#872B38] to-[#42141B] text-Snowflake flex items-center justify-center flex-shrink-0 shadow-xl shadow-Berry/30 group-hover:scale-110 transition-transform">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-Mist">Cảnh báo & Nguy hiểm (&lt;80đ)</p>
              <p className="text-3xl sm:text-4xl font-black text-Berry tracking-tight mt-1">{riskCount}</p>
            </div>
          </div>
        </div>

        {/* 🌟 Clean Filter Tabs + Search Bar & Main Content */}
        <div className="bg-white/95 backdrop-blur-3xl rounded-[2.8rem] border border-white shadow-[0_20px_60px_rgba(39,54,63,0.08)] p-7 space-y-6">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-Mist/20 pb-5">
            <div className="flex items-center gap-1.5 bg-Snowflake/80 p-1.5 rounded-2xl border border-Mist/20 w-fit">
              {[
                { key: 'all',     label: 'Tất cả' },
                { key: 'active',  label: 'Đang hoạt động' },
                { key: 'deleted', label: 'Đã lưu trữ' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setStatusTab(tab.key as typeof statusTab); setPage(1) }}
                  className={`px-4.5 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap ${
                    statusTab === tab.key
                      ? 'bg-Pine text-white shadow-md'
                      : 'text-Branch hover:text-Pine'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 flex-1 xl:max-w-4xl">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
                <input
                  type="text"
                  placeholder="Tìm công ty, MST, email..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="w-full pl-11 pr-4 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-bold bg-Snowflake/40 text-Pine placeholder-Mist focus:outline-none focus:border-Pine shadow-inner"
                />
              </div>
              <select
                value={filterIndustry}
                onChange={(e) => { setFilterIndustry(e.target.value); setPage(1) }}
                className="px-4.5 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-black bg-white text-Pine focus:outline-none focus:border-Pine cursor-pointer shadow-xs"
              >
                <option value="">Tất cả ngành nghề</option>
                {industries.map((ind) => (
                  <option key={ind.id} value={ind.id}>{ind.name}</option>
                ))}
              </select>
              <select
                value={filterRiskLevel}
                onChange={(e) => setFilterRiskLevel(e.target.value as typeof filterRiskLevel)}
                className="px-4.5 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-black bg-white text-Pine focus:outline-none focus:border-Pine cursor-pointer shadow-xs"
              >
                <option value="">Mọi ngưỡng rủi ro</option>
                <option value="Safe">An toàn (80–100đ)</option>
                <option value="Warning">Cảnh báo (50–79đ)</option>
                <option value="Danger">Nguy hiểm (&lt;50đ)</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-4.5 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-black bg-white text-Pine focus:outline-none focus:border-Pine cursor-pointer shadow-xs"
              >
                <option value="default">Sắp xếp: Mặc định</option>
                <option value="risk_asc">Điểm thấp → cao (Ưu tiên rà soát)</option>
                <option value="risk_desc">Điểm cao → thấp</option>
              </select>
            </div>
          </div>

          {/* Content: Desktop Table + Mobile Cards */}
          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : displayedSuppliers.length === 0 ? (
            <EmptyState message="Không tìm thấy nhà cung ứng nào phù hợp với bộ lọc" />
          ) : (
            <>
              {/* 1. DESKTOP TABLE VIEW */}
              <div className="hidden md:block overflow-x-auto rounded-3xl border border-Mist/20 shadow-sm">
                <table className="min-w-full divide-y divide-Mist/20">
                  <thead>
                    <tr className="bg-Pine text-white">
                      {['Đối tác Cung ứng', 'Mã số thuế', 'Liên hệ', 'Điểm Tín nhiệm', 'Trạng thái', 'Thao tác'].map((h) => (
                        <th key={h} className="px-5 py-4 text-left text-xs font-black uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-Mist/15 bg-white">
                    {displayedSuppliers.map((s) => (
                      <tr
                        key={s.id}
                        className={`transition-all duration-300 group ${
                          s.is_deleted
                            ? 'opacity-60 bg-Snowflake/50 cursor-not-allowed'
                            : 'hover:bg-Snowflake/60'
                        }`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3.5">
                            <div
                              className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-xs group-hover:scale-105 transition-transform ${
                                s.is_deleted ? 'bg-Berry/10 text-Berry' : 'bg-Pine/10 text-Pine'
                              }`}
                            >
                              {s.is_deleted ? <Ban className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => openDetail(s)}
                                className={`text-sm font-black text-left truncate block max-w-[240px] ${
                                  s.is_deleted ? 'line-through text-Branch' : 'text-Pine hover:text-Berry transition-colors'
                                }`}
                                title={s.company_name}
                              >
                                {s.company_name}
                              </button>
                              <p className="text-xs font-medium text-Mist truncate max-w-[240px]">
                                {s.industry?.name || s.Categories?.name || 'Chưa phân loại ngành'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs font-mono font-bold text-Branch whitespace-nowrap">
                          {s.tax_code}
                        </td>
                        <td className="px-5 py-4 text-xs text-Branch max-w-[200px]">
                          <div className="truncate font-medium">{s.contact_email || '—'}</div>
                          {s.contact_phone && <div className="text-[11px] font-mono text-Mist">{s.contact_phone}</div>}
                        </td>
                        <td className="px-5 py-4 min-w-[160px]">
                          <RiskScoreBar score={s.risk_score} />
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {s.is_deleted ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-Berry/10 text-Berry border border-Berry/20">
                              <Ban className="w-3.5 h-3.5" /> Đã xóa mềm
                            </span>
                          ) : (
                            <StatusBadge status={getRiskStatus(s.risk_score)} />
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openDetail(s)}
                              className="p-2 text-Pine bg-Snowflake hover:bg-Pine hover:text-white rounded-xl transition-all shadow-2xs"
                              title="Xem hồ sơ chi tiết"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {s.is_deleted ? (
                              <>
                                <span
                                  title="Bản ghi đã xóa mềm — Không thể chỉnh sửa"
                                  className="p-2 text-Berry/50 cursor-not-allowed rounded-xl"
                                >
                                  <Lock className="w-4 h-4" />
                                </span>
                                {canRestore && hasPermission('EDIT_SUPPLIER') && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRestore(s)}
                                    title="Khôi phục nhà cung ứng"
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black text-Pine bg-Snowflake hover:bg-Mist/30 border border-Mist/40 rounded-xl transition-all cursor-pointer shadow-2xs"
                                  >
                                    <RotateCcw className="w-4 h-4" />
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
                                    className="p-2 text-Pine bg-Snowflake hover:bg-Pine hover:text-white rounded-xl transition-all shadow-2xs"
                                    title="Chỉnh sửa thông tin"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}
                                {hasPermission('DELETE_SUPPLIER') && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDelete(s)}
                                    className="p-2 text-Berry bg-Berry/10 hover:bg-Berry hover:text-white rounded-xl transition-all"
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
              <div className="md:hidden grid grid-cols-1 gap-4">
                {displayedSuppliers.map((s) => (
                  <div
                    key={s.id}
                    className={`rounded-3xl border p-5 transition-all space-y-4 ${
                      s.is_deleted
                        ? 'opacity-65 bg-Snowflake/60 border-Mist/30 cursor-not-allowed'
                        : 'bg-white border-Mist/25 shadow-md'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-xs ${
                            s.is_deleted ? 'bg-Berry/10 text-Berry' : 'bg-Pine/10 text-Pine'
                          }`}
                        >
                          {s.is_deleted ? <Ban className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => openDetail(s)}
                            className={`text-sm font-black truncate block text-left ${
                              s.is_deleted ? 'line-through text-Branch' : 'text-Pine'
                            }`}
                          >
                            {s.company_name}
                          </button>
                          <span className="text-xs font-mono text-Mist font-bold">MST: {s.tax_code}</span>
                        </div>
                      </div>
                      {s.is_deleted ? (
                        <span className="px-2.5 py-1 rounded-xl bg-Berry/10 text-Berry text-xs font-black">
                          Đã xóa
                        </span>
                      ) : (
                        <StatusBadge status={getRiskStatus(s.risk_score)} />
                      )}
                    </div>

                    <div>
                      <RiskScoreBar score={s.risk_score} />
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-Mist/15 text-xs">
                      <span className="text-Mist truncate max-w-[160px] font-medium">
                        {s.Categories?.name || s.contact_email || '—'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openDetail(s)}
                          className="px-3 py-1.5 bg-Snowflake text-Pine font-black rounded-xl text-xs"
                        >
                          Chi tiết
                        </button>
                        {s.is_deleted ? (
                          canRestore && hasPermission('EDIT_SUPPLIER') ? (
                            <button
                              type="button"
                              onClick={() => setConfirmRestore(s)}
                              className="px-3 py-1.5 bg-Snowflake text-Pine font-black rounded-xl border border-Mist/40 text-xs"
                            >
                              Khôi phục
                            </button>
                          ) : (
                            <span className="text-Mist flex items-center gap-1 text-xs">
                              <Lock className="w-3.5 h-3.5" /> Đã khóa
                            </span>
                          )
                        ) : (
                          <>
                            {hasPermission('EDIT_SUPPLIER') && (
                              <button
                                type="button"
                                onClick={() => openEdit(s)}
                                className="p-2 text-Pine bg-Snowflake rounded-xl"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {hasPermission('DELETE_SUPPLIER') && (
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(s)}
                                className="p-2 text-Berry bg-Berry/10 rounded-xl"
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
            <div className="pt-5 border-t border-Mist/20">
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
          <div className="space-y-6">
            <div className="bg-Snowflake/50 rounded-3xl p-5 border border-Mist/25 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-xs text-Mist font-mono font-black">MST: {detailSupplier.tax_code}</span>
                  <h4 className="text-base sm:text-lg font-black text-Pine">{detailSupplier.company_name}</h4>
                  <p className="text-xs text-Branch font-medium">
                    Ngành nghề: <strong className="text-Pine">{detailSupplier.Categories?.name || detailSupplier.industry?.name || 'Chưa phân loại'}</strong>
                  </p>
                </div>
                <StatusBadge status={detailSupplier.is_deleted ? 'Error' : getRiskStatus(detailSupplier.risk_score)} />
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-wider text-Pine mb-2">Điểm tín nhiệm & Tuân thủ RBA:</p>
                <RiskScoreBar score={detailSupplier.risk_score} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-Mist/20 text-xs text-Branch">
                <div className="flex items-center gap-2 font-medium">
                  <Mail className="w-4 h-4 text-Pine flex-shrink-0" />
                  <span className="truncate">{detailSupplier.contact_email || 'Chưa có email'}</span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <Phone className="w-4 h-4 text-Pine flex-shrink-0" />
                  <span>{detailSupplier.contact_phone || 'Chưa có SĐT'}</span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <MapPin className="w-4 h-4 text-Pine flex-shrink-0" />
                  <span className="truncate">{detailSupplier.address || 'Chưa cập nhật địa chỉ'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h5 className="text-sm font-black text-Pine flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Lịch sử Hợp đồng PDF đã tải lên
              </h5>
              {detailLoading ? (
                <div className="flex justify-center py-6"><Spinner size="sm" /></div>
              ) : !detailSupplier.Documents || detailSupplier.Documents.length === 0 ? (
                <p className="text-xs text-Mist italic bg-Snowflake p-4 rounded-2xl text-center">Chưa có hợp đồng nào được tải lên cho đối tác này.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {detailSupplier.Documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3.5 bg-white rounded-2xl border border-Mist/20 shadow-2xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-Pine flex-shrink-0" />
                        <span className="text-xs font-black text-Pine truncate">{doc.file_name}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-[11px] font-mono text-Mist font-bold">{new Date(doc.uploaded_at).toLocaleDateString('vi-VN')}</span>
                        <Link
                          to={`/audit/${doc.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-Snowflake hover:bg-Pine hover:text-white text-Pine text-xs font-black rounded-xl transition-all"
                        >
                          Xem <ExternalLink className="w-3 h-3" />
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

      {/* Supplier Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        title={editTarget ? 'Chỉnh sửa hồ sơ Đối tác' : 'Thêm nhà cung ứng mới'}
        onClose={() => setModalOpen(false)}
        size="lg"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-2">Tên công ty *</label>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                placeholder="Ví dụ: Công ty TNHH ABC..."
                className="w-full px-4.5 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-bold bg-white text-Pine focus:outline-none focus:border-Pine shadow-inner"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-2">Mã số thuế *</label>
              <input
                type="text"
                value={form.tax_code}
                onChange={(e) => setForm({ ...form, tax_code: e.target.value })}
                placeholder="Ví dụ: 0312345678"
                className="w-full px-4.5 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-mono font-bold bg-white text-Pine focus:outline-none focus:border-Pine shadow-inner"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-2">Ngành nghề</label>
              <select
                value={form.industry_id}
                onChange={(e) => setForm({ ...form, industry_id: e.target.value })}
                className="w-full px-4.5 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-black bg-white text-Pine focus:outline-none focus:border-Pine cursor-pointer shadow-xs"
              >
                <option value="">-- Chọn ngành nghề --</option>
                {industries.map((ind) => (
                  <option key={ind.id} value={ind.id}>{ind.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-2">Email liên hệ</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                placeholder="contact@company.com"
                className="w-full px-4.5 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-bold bg-white text-Pine focus:outline-none focus:border-Pine shadow-inner"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-2">Số điện thoại</label>
              <input
                type="text"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                placeholder="0901234567"
                className="w-full px-4.5 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-bold bg-white text-Pine focus:outline-none focus:border-Pine shadow-inner"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-2">Địa chỉ</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Địa chỉ trụ sở công ty..."
                className="w-full px-4.5 py-3.5 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-bold bg-white text-Pine focus:outline-none focus:border-Pine shadow-inner"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 py-3.5 border border-Mist/30 text-Branch text-xs font-black rounded-2xl hover:bg-Snowflake transition-all"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3.5 bg-Pine text-white text-xs font-black rounded-2xl hover:bg-Berry disabled:opacity-60 transition-all flex items-center justify-center gap-2 shadow-xl shadow-Pine/30"
            >
              {saving ? <Spinner size="sm" /> : null}
              {editTarget ? 'Lưu thay đổi' : 'Thêm nhà cung ứng'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Xác nhận xóa mềm nhà cung ứng?"
        message={`Đối tác "${confirmDelete?.company_name}" sẽ bị chuyển vào trạng thái lưu trữ (xóa mềm) và hạn chế thao tác. Có thể khôi phục sau.`}
        confirmLabel="Đồng ý xóa mềm"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Confirm Restore Modal */}
      <ConfirmModal
        isOpen={!!confirmRestore}
        title="Khôi phục hồ sơ nhà cung ứng?"
        message={`Đối tác "${confirmRestore?.company_name}" sẽ được kích hoạt trở lại trong danh sách hoạt động.`}
        confirmLabel="Khôi phục ngay"
        variant="info"
        onConfirm={handleRestore}
        onCancel={() => setConfirmRestore(null)}
      />
    </MainLayout>
  )
}