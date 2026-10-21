import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Edit2, Trash2, RotateCcw, Lock, FolderOpen, Ban, Layers, FileText, Sparkles, ArrowUpRight } from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { ConfirmModal, Modal, Pagination, Spinner, EmptyState } from '../components/ui'
import { categoryApi } from '../api'

interface Category {
  id: number
  name: string
  category_type: 'Industry' | 'Contract_Type'
  description: string | null
  is_active: boolean
  created_at: string
}

interface CategoryForm {
  name: string
  category_type: 'Industry' | 'Contract_Type'
  description: string
}

const EMPTY_FORM: CategoryForm = { name: '', category_type: 'Industry', description: '' }

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)

  const [statusTab, setStatusTab] = useState<'all' | 'active' | 'inactive'>('all')
  const [filterType, setFilterType] = useState<'' | 'Industry' | 'Contract_Type'>('')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Category | null>(null)
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [confirmDelete, setConfirmDelete]   = useState<Category | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<Category | null>(null)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean | undefined> = { page, limit }
      if (filterType) params.category_type = filterType
      if (search.trim()) params.search = search.trim()
      if (statusTab === 'active') params.is_active = true
      if (statusTab === 'inactive') params.is_active = false

      const res = await categoryApi.getAll(params)
      const data = res.data?.data || res.data || {}
      const items: Category[] = (data as { items?: Category[] })?.items || []
      const totalCount: number = (data as { total?: number })?.total || 0

      // Đẩy is_active = false xuống dưới cùng của bảng
      const sorted = [
        ...items.filter((c) => c.is_active),
        ...items.filter((c) => !c.is_active),
      ]
      setCategories(sorted)
      setTotal(totalCount)
    } catch {
      toast.error('Không thể tải danh sách danh mục.')
    } finally {
      setLoading(false)
    }
  }, [page, limit, filterType, search, statusTab])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const openCreate = () => { setEditTarget(null); setForm(EMPTY_FORM); setModalOpen(true) }
  const openEdit   = (c: Category) => {
    if (!c.is_active) return
    setEditTarget(c)
    setForm({ name: c.name, category_type: c.category_type, description: c.description || '' })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Tên danh mục không được để trống.'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        category_type: form.category_type,
        description: form.description || undefined,
      }
      if (editTarget) {
        await categoryApi.update(editTarget.id, payload)
        toast.success('Cập nhật danh mục thành công.')
      } else {
        await categoryApi.create(payload)
        toast.success('Thêm danh mục mới thành công.')
      }
      setModalOpen(false)
      fetchCategories()
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
      await categoryApi.delete(confirmDelete.id)
      toast.success(`Đã chuyển danh mục "${confirmDelete.name}" vào lưu trữ.`)
      setConfirmDelete(null)
      fetchCategories()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Vô hiệu hóa thất bại.')
    }
  }

  const handleRestore = async () => {
    if (!confirmRestore) return
    try {
      await categoryApi.restore(confirmRestore.id)
      toast.success(`Đã khôi phục danh mục "${confirmRestore.name}".`)
      setConfirmRestore(null)
      fetchCategories()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Khôi phục thất bại.')
    }
  }

  const TYPE_LABEL: Record<string, string> = {
    Industry:       'Ngành nghề đối tác',
    Contract_Type: 'Loại hợp đồng kiểm toán',
  }

  const industryCount = categories.filter((c) => c.category_type === 'Industry').length
  const contractTypeCount = categories.filter((c) => c.category_type === 'Contract_Type').length

  return (
    <MainLayout breadcrumb="Danh mục Hệ thống">
      <div className="space-y-6">
        
        {/* 👑 Luxury Frosted Header Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-Pine via-[#1E2930] to-Branch p-7 sm:p-8 text-white shadow-2xl border border-white/20">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-Berry/30 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-Frostysilver/20 rounded-full blur-2xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 backdrop-blur-md text-Frostysilver text-[11px] font-black uppercase tracking-widest border border-white/15 shadow-inner">
                <Sparkles className="w-3.5 h-3.5 text-Berry animate-pulse" />
                <span>Luxury System Classifier</span>
                <span className="w-1.5 h-1.5 rounded-full bg-Berry" />
                <span className="text-white/80">AI RAG 24 Standard Mapping</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white drop-shadow-sm flex items-center gap-3">
                Danh mục Hệ thống
              </h1>
              <p className="text-xs sm:text-sm text-Frostysilver/90 font-medium leading-relaxed">
                Quản lý phân loại ngành nghề nhà cung ứng và loại hợp đồng kiểm toán (Tự động ánh xạ 24 tiêu chuẩn)
              </p>
            </div>

            <button
              type="button"
              onClick={openCreate}
              className="group relative inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-Berry text-white text-xs font-black uppercase tracking-wider rounded-xl hover:drop-shadow-[0_0_20px_rgba(107,33,44,0.8)] transition-all duration-300 ease-out cursor-pointer shadow-xl border border-Berry/50 overflow-hidden flex-shrink-0"
            >
              <div className="absolute inset-0 w-1/2 h-full bg-white/20 skew-x-12 -translate-x-full group-hover:translate-x-[300%] transition-transform duration-1000 ease-in-out" />
              <Plus className="w-4 h-4 text-Frostysilver group-hover:rotate-90 transition-transform duration-300" />
              <span>Thêm danh mục mới</span>
              <ArrowUpRight className="w-4 h-4 text-Frostysilver opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* 💎 Crystal Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="relative overflow-hidden bg-white/90 backdrop-blur-md rounded-2xl border border-Mist/30 p-6 shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-Pine/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-Pine to-[#1B262C] text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-Pine/20 border border-white/20 group-hover:scale-105 transition-transform">
                <Layers className="w-7 h-7 text-Frostysilver" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-Mist">Tổng danh mục</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-black text-Pine tracking-tight">{total}</span>
                  <span className="text-[11px] font-bold text-Pine/60 bg-Snowflake px-2 py-0.5 rounded-full border border-Mist/20">Phân loại</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden bg-white/90 backdrop-blur-md rounded-2xl border border-Mist/30 p-6 shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-Frostysilver/10 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-Snowflake via-Frostysilver/50 to-Frostysilver text-Pine border border-Mist/40 flex items-center justify-center flex-shrink-0 shadow-lg shadow-Mist/20 group-hover:scale-105 transition-transform">
                <FolderOpen className="w-7 h-7 text-Pine" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-Mist">Ngành nghề đối tác</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-black text-Pine tracking-tight">{industryCount}</span>
                  <span className="text-[11px] font-bold text-Pine/60 bg-Snowflake px-2 py-0.5 rounded-full border border-Mist/20">Doanh nghiệp</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden bg-white/90 backdrop-blur-md rounded-2xl border border-Mist/30 p-6 shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-Berry/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-Berry via-Berry/90 to-[#4A151E] text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-Berry/30 border border-white/20 group-hover:scale-105 transition-transform">
                <FileText className="w-7 h-7 text-Frostysilver" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-Mist">Loại hợp đồng kiểm toán</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-black text-Berry tracking-tight">{contractTypeCount}</span>
                  <span className="text-[11px] font-bold text-Berry/80 bg-Berry/10 px-2 py-0.5 rounded-full border border-Berry/20">Mẫu kiểm toán</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 🛡️ Khung Bảng Danh Mục */}
        <div className="bg-white/95 backdrop-blur-2xl rounded-3xl border border-Mist/30 shadow-[0_20px_50px_rgba(39,54,63,0.09)] p-6 sm:p-7 space-y-6">
          
          {/* Controls Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-Mist/20 pb-5">
            <div className="flex items-center gap-1.5 bg-Snowflake/80 p-1.5 rounded-xl w-fit border border-Mist/30 shadow-inner">
              {[
                { key: 'all',      label: 'Tất cả danh mục' },
                { key: 'active',   label: 'Đang hoạt động' },
                { key: 'inactive', label: 'Đã lưu trữ' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setStatusTab(tab.key as typeof statusTab); setPage(1) }}
                  className={`px-4 py-2 text-xs font-extrabold rounded-lg transition-all duration-300 cursor-pointer ${
                    statusTab === tab.key
                      ? 'bg-Pine text-white shadow-lg shadow-Pine/20 scale-[1.02]'
                      : 'text-Branch hover:text-Pine hover:bg-white/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 flex-1 max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
                <input
                  type="text"
                  placeholder="Tìm kiếm tên danh mục, mô tả chi tiết..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="w-full pl-11 pr-4 py-2.5 border border-Mist/40 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:border-Pine focus:ring-2 focus:ring-Pine/15 bg-Snowflake/30 text-Pine placeholder-Mist transition-all duration-200"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => { setFilterType(e.target.value as typeof filterType); setPage(1) }}
                className="px-4 py-2.5 border border-Mist/40 rounded-xl text-xs sm:text-sm font-extrabold focus:outline-none focus:border-Pine focus:ring-2 focus:ring-Pine/15 bg-white text-Pine min-w-[200px] transition-all duration-200 cursor-pointer shadow-2xs"
              >
                <option value="">Tất cả phân loại</option>
                <option value="Industry">Ngành nghề đối tác</option>
                <option value="Contract_Type">Loại hợp đồng</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-24"><Spinner size="lg" /></div>
          ) : categories.length === 0 ? (
            <EmptyState message="Không tìm thấy danh mục nào trong hệ thống" />
          ) : (
            <>
              {/* Bảng Luxury Căn Chỉnh Cân Đối */}
              <div className="hidden md:block overflow-hidden rounded-2xl border border-Mist/30 shadow-xl">
                <table className="min-w-full divide-y divide-Mist/15">
                  <thead>
                    <tr className="bg-gradient-to-r from-[#182329] via-[#24333C] to-[#182329] text-white border-b-2 border-Pine/40">
                      <th className="px-5 py-4 text-left text-[11px] font-black uppercase tracking-widest text-Frostysilver/90 whitespace-nowrap">Tên danh mục</th>
                      <th className="px-5 py-4 text-left text-[11px] font-black uppercase tracking-widest text-Frostysilver/90 whitespace-nowrap">Phân loại</th>
                      <th className="px-5 py-4 text-left text-[11px] font-black uppercase tracking-widest text-Frostysilver/90 whitespace-nowrap">Mô tả chi tiết</th>
                      <th className="px-5 py-4 text-center text-[11px] font-black uppercase tracking-widest text-Frostysilver/90 whitespace-nowrap">Trạng thái</th>
                      <th className="px-5 py-4 text-center text-[11px] font-black uppercase tracking-widest text-Frostysilver/90 whitespace-nowrap">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-Mist/15 bg-white">
                    {categories.map((cat) => (
                      <tr
                        key={cat.id}
                        className={`transition-all duration-300 group ${
                          !cat.is_active
                            ? 'opacity-60 bg-Snowflake/40 cursor-not-allowed'
                            : 'hover:bg-gradient-to-r hover:from-Snowflake/90 hover:via-white hover:to-Snowflake/60 hover:shadow-md'
                        }`}
                      >
                        {/* 1. Tên danh mục */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs transition-all duration-300 group-hover:scale-105 ${
                                !cat.is_active
                                  ? 'bg-Berry/10 text-Berry border border-Berry/20'
                                  : 'bg-gradient-to-br from-Pine/20 to-Pine/5 text-Pine border border-Pine/30'
                              }`}
                            >
                              {!cat.is_active ? <Ban className="w-4.5 h-4.5" /> : <FolderOpen className="w-4.5 h-4.5" />}
                            </div>
                            <span className={`text-xs sm:text-sm font-black tracking-tight ${!cat.is_active ? 'line-through text-Branch' : 'text-Pine'}`}>
                              {cat.name}
                            </span>
                          </div>
                        </td>

                        {/* 2. Phân loại */}
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-extrabold border backdrop-blur-md shadow-2xs whitespace-nowrap ${
                            cat.category_type === 'Industry'
                              ? 'bg-Snowflake/90 text-Pine border-Mist/50'
                              : 'bg-Berry/10 text-Berry border-Berry/35'
                          }`}>
                            {TYPE_LABEL[cat.category_type] || cat.category_type}
                          </span>
                        </td>

                        {/* 3. Mô tả chi tiết */}
                        <td className="px-5 py-4 text-xs text-Branch max-w-xs truncate font-semibold leading-relaxed">
                          {cat.description || '—'}
                        </td>

                        {/* 4. Trạng thái (Thẻ Xanh Emerald Neon Cân Bằng Cân Đối) */}
                        <td className="px-5 py-4 text-center">
                          {!cat.is_active ? (
                            <span className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-Berry/10 text-Berry border border-Berry/20 shadow-2xs whitespace-nowrap">
                              <Ban className="w-3.5 h-3.5" /> Đã lưu trữ
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black bg-emerald-500/10 text-emerald-800 border border-emerald-500/40 shadow-xs backdrop-blur-md whitespace-nowrap">
                              <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-sm" />
                              </span>
                              Đang hoạt động
                            </span>
                          )}
                        </td>

                        {/* 5. Thao tác (Hiển thị Nút Sửa / Nút Xóa rõ ràng) */}
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {!cat.is_active ? (
                              <>
                                <span
                                  title="Bản ghi đã lưu trữ — Không thể chỉnh sửa"
                                  className="p-2 text-Berry/50 cursor-not-allowed rounded-xl bg-Snowflake/60 border border-Mist/20"
                                >
                                  <Lock className="w-4 h-4" />
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRestore(cat)}
                                  title="Khôi phục hoạt động"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black text-Pine bg-Snowflake hover:bg-Mist/30 border border-Mist/40 rounded-xl transition-all duration-200 cursor-pointer shadow-2xs"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-Pine" />
                                  Khôi phục
                                </button>
                              </>
                            ) : (
                              <>
                                {/* Nút Chỉnh sửa */}
                                <button
                                  type="button"
                                  onClick={() => openEdit(cat)}
                                  className="p-2 text-Pine bg-Snowflake/80 hover:bg-Pine hover:text-white rounded-xl transition-all duration-300 cursor-pointer border border-Mist/30 hover:border-Pine shadow-2xs hover:shadow-md flex items-center justify-center"
                                  title="Chỉnh sửa danh mục"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>

                                {/* Nút Xóa / Vô hiệu hóa */}
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(cat)}
                                  className="p-2 text-Berry bg-Berry/10 hover:bg-Berry hover:text-white rounded-xl transition-all duration-300 cursor-pointer border border-Berry/20 hover:border-Berry shadow-2xs hover:shadow-md flex items-center justify-center"
                                  title="Vô hiệu hóa (Lưu trữ)"
                                >
                                  <Trash2 className="w-4 h-4" />
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

              {/* Mobile Cards */}
              <div className="md:hidden grid grid-cols-1 gap-4">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className={`rounded-2xl border p-5 transition-all duration-300 ${
                      !cat.is_active
                        ? 'opacity-60 bg-Snowflake/50 border-Mist/30 cursor-not-allowed'
                        : 'bg-white border-Mist/30 shadow-sm hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <span className={`text-sm font-black ${!cat.is_active ? 'line-through text-Branch' : 'text-Pine'}`}>
                        {cat.name}
                      </span>
                      <span className={`px-3 py-1 rounded-lg text-[11px] font-extrabold border ${
                        cat.category_type === 'Industry' ? 'bg-Snowflake text-Pine border-Mist/30' : 'bg-Berry/10 text-Berry border-Berry/20'
                      }`}>
                        {TYPE_LABEL[cat.category_type]}
                      </span>
                    </div>
                    <p className="text-xs text-Branch mb-3.5 font-medium leading-relaxed">{cat.description || 'Không có mô tả'}</p>
                    <div className="flex items-center justify-between pt-3 border-t border-Mist/20">
                      {!cat.is_active ? (
                        <span className="text-xs font-bold text-Mist">Đã lưu trữ</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-800">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                          Đang hoạt động
                        </span>
                      )}
                      {!cat.is_active ? (
                        <button
                          type="button"
                          onClick={() => setConfirmRestore(cat)}
                          className="px-3.5 py-1.5 bg-Snowflake text-Pine text-xs font-black rounded-lg border border-Mist/30 cursor-pointer shadow-2xs"
                        >
                          Khôi phục
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => openEdit(cat)} className="p-2 text-Pine bg-Snowflake rounded-lg border border-Mist/30 cursor-pointer">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(cat)} className="p-2 text-Berry bg-Berry/10 rounded-lg border border-Berry/20 cursor-pointer">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!loading && (
            <div className="pt-4 border-t border-Mist/20">
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

      {/* Modal Cập nhật / Tạo mới */}
      <Modal
        isOpen={modalOpen}
        title={editTarget ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới'}
        onClose={() => setModalOpen(false)}
        size="sm"
      >
        <div className="space-y-4.5">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-1.5">Tên danh mục *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ví dụ: Sản xuất linh kiện bán dẫn"
              className="w-full px-4 py-3 border border-Mist/40 rounded-xl text-sm font-extrabold focus:outline-none focus:border-Pine focus:ring-2 focus:ring-Pine/10 bg-white text-Pine transition-all duration-200"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-1.5">Loại danh mục *</label>
            <select
              value={form.category_type}
              onChange={(e) => setForm((f) => ({ ...f, category_type: e.target.value as CategoryForm['category_type'] }))}
              disabled={!!editTarget}
              className="w-full px-4 py-3 border border-Mist/40 rounded-xl text-sm font-black focus:outline-none focus:border-Pine focus:ring-2 focus:ring-Pine/10 bg-white text-Pine disabled:bg-Snowflake disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
            >
              <option value="Industry">Ngành nghề đối tác</option>
              <option value="Contract_Type">Loại hợp đồng kiểm toán</option>
            </select>
            {editTarget && <p className="text-xs text-Mist mt-1.5 font-medium">Không thể thay đổi loại danh mục sau khi tạo</p>}
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-1.5">Mô tả</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả ngắn về danh mục..."
              rows={3}
              className="w-full px-4 py-3 border border-Mist/40 rounded-xl text-sm font-medium focus:outline-none focus:border-Pine focus:ring-2 focus:ring-Pine/10 bg-white text-Pine resize-none transition-all duration-200"
            />
          </div>
          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 py-3 border-[1.5px] border-Mist text-Pine text-xs font-bold rounded-xl hover:bg-Snowflake hover:border-Pine transition-all duration-300 cursor-pointer shadow-2xs"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 bg-Berry text-white text-xs font-black uppercase tracking-wider rounded-xl hover:drop-shadow-[0_0_15px_rgba(107,33,44,0.8)] disabled:opacity-60 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              {saving ? <Spinner size="sm" /> : null}
              {editTarget ? 'Lưu thay đổi' : 'Thêm mới'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Modals */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Lưu trữ (Vô hiệu hóa) danh mục?"
        message={`Danh mục "${confirmDelete?.name}" sẽ được đẩy xuống cuối bảng và khóa chỉnh sửa. Có thể kích hoạt lại sau.`}
        confirmLabel="Đồng ý lưu trữ"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmModal
        isOpen={!!confirmRestore}
        title="Kích hoạt lại danh mục?"
        message={`Danh mục "${confirmRestore?.name}" sẽ được mở khóa và hoạt động trở lại.`}
        confirmLabel="Khôi phục ngay"
        variant="info"
        onConfirm={handleRestore}
        onCancel={() => setConfirmRestore(null)}
      />
    </MainLayout>
  )
}