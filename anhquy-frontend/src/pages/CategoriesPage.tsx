import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Edit2, Trash2, RotateCcw, Lock, FolderOpen, Ban, Layers, FileText } from 'lucide-react'
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
    Industry:      'Ngành nghề đối tác',
    Contract_Type: 'Loại hợp đồng kiểm toán',
  }

  const industryCount = categories.filter((c) => c.category_type === 'Industry').length
  const contractTypeCount = categories.filter((c) => c.category_type === 'Contract_Type').length

  return (
    <MainLayout breadcrumb="Danh mục Hệ thống">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-Pine tracking-tight">Danh mục Hệ thống</h1>
            <p className="text-xs sm:text-sm text-Mist mt-0.5">
              Quản lý phân loại ngành nghề nhà cung ứng và loại hợp đồng kiểm toán 
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-2xl hover:bg-Pine/90 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            Thêm danh mục
          </button>
        </div>

        {/* Summary Mini Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Pine text-white flex items-center justify-center flex-shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Tổng danh mục</p>
              <p className="text-xl font-extrabold text-Pine">{total}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Mist text-Pine flex items-center justify-center flex-shrink-0">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Ngành nghề đối tác</p>
              <p className="text-xl font-extrabold text-Pine">{industryCount}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Berry text-white flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Loại hợp đồng kiểm toán</p>
              <p className="text-xl font-extrabold text-Berry">{contractTypeCount}</p>
            </div>
          </div>
        </div>

        {/* Main Card: Clean Tabs + Filters + Table */}
        <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-Mist/15 pb-3">
            {/* Clean Pill Tabs */}
            <div className="flex items-center gap-1 bg-Snowflake/60 p-1 rounded-2xl w-fit">
              {[
                { key: 'all',      label: 'Tất cả' },
                { key: 'active',   label: 'Đang hoạt động' },
                { key: 'inactive', label: 'Đã lưu trữ' },
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

            {/* Search & Type Filter */}
            <div className="flex flex-col sm:flex-row gap-2.5 flex-1 max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
                <input
                  type="text"
                  placeholder="Tìm kiếm tên danh mục, mô tả..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="w-full pl-9 pr-3 py-2 border border-Mist/40 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-Pine bg-Snowflake/20 text-Pine placeholder-Mist transition-all"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => { setFilterType(e.target.value as typeof filterType); setPage(1) }}
                className="px-3 py-2 border border-Mist/40 rounded-xl text-xs sm:text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Pine min-w-[180px]"
              >
                <option value="">Tất cả phân loại</option>
                <option value="Industry">Ngành nghề đối tác</option>
                <option value="Contract_Type">Loại hợp đồng</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : categories.length === 0 ? (
            <EmptyState message="Không tìm thấy danh mục nào" />
          ) : (
            <>
              {/* 1. Desktop Table */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-Mist/20">
                <table className="min-w-full divide-y divide-Mist/15">
                  <thead>
                    <tr className="bg-Pine text-white">
                      {['Tên danh mục', 'Phân loại', 'Mô tả chi tiết', 'Trạng thái', 'Thao tác'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-Mist/15 bg-white">
                    {categories.map((cat) => (
                      <tr
                        key={cat.id}
                        className={`transition-colors ${
                          !cat.is_active
                            ? 'opacity-60 bg-Snowflake/50 cursor-not-allowed'
                            : 'hover:bg-Snowflake/35'
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                !cat.is_active
                                  ? 'bg-Berry/10 text-Berry'
                                  : 'bg-Pine/10 text-Pine'
                              }`}
                            >
                              {!cat.is_active ? <Ban className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
                            </div>
                            <span className={`text-sm font-bold ${!cat.is_active ? 'line-through text-Branch' : 'text-Pine'}`}>
                              {cat.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-bold ${
                            cat.category_type === 'Industry'
                              ? 'bg-Snowflake text-Pine border border-Mist/30'
                              : 'bg-Berry/10 text-Berry border border-Berry/20'
                          }`}>
                            {TYPE_LABEL[cat.category_type] || cat.category_type}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-Branch max-w-xs truncate">{cat.description || '—'}</td>
                        <td className="px-4 py-3.5">
                          {!cat.is_active ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-Berry/10 text-Berry border border-Berry/20">
                              <Ban className="w-3 h-3" /> Đã lưu trữ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-[#D8F3DC] text-[#1B4332] border border-Mist/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#74C69D]" />
                              Đang hoạt động
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {!cat.is_active ? (
                              <>
                                <span
                                  title="Bản ghi đã lưu trữ — Không thể chỉnh sửa"
                                  className="p-1.5 text-Berry/50 cursor-not-allowed rounded-xl"
                                >
                                  <Lock className="w-4 h-4" />
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRestore(cat)}
                                  title="Khôi phục hoạt động"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-Pine bg-Snowflake hover:bg-Mist/30 border border-Mist/40 rounded-xl transition-colors cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Khôi phục
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEdit(cat)}
                                  className="p-1.5 text-Pine hover:bg-Pine/10 rounded-xl transition-colors"
                                  title="Chỉnh sửa"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(cat)}
                                  className="p-1.5 text-Berry hover:bg-Berry/10 rounded-xl transition-colors"
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

              {/* 2. Mobile Cards */}
              <div className="md:hidden grid grid-cols-1 gap-3">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className={`rounded-2xl border p-4 ${
                      !cat.is_active
                        ? 'opacity-60 bg-Snowflake/50 border-Mist/30 cursor-not-allowed'
                        : 'bg-white border-Mist/25 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`text-sm font-bold ${!cat.is_active ? 'line-through text-Branch' : 'text-Pine'}`}>
                        {cat.name}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                        cat.category_type === 'Industry' ? 'bg-Snowflake text-Pine' : 'bg-Berry/10 text-Berry'
                      }`}>
                        {TYPE_LABEL[cat.category_type]}
                      </span>
                    </div>
                    <p className="text-xs text-Branch mb-3">{cat.description || 'Không có mô tả'}</p>
                    <div className="flex items-center justify-between pt-2 border-t border-Mist/15">
                      <span className="text-xs font-bold text-Mist">
                        {!cat.is_active ? 'Đã lưu trữ' : 'Đang hoạt động'}
                      </span>
                      {!cat.is_active ? (
                        <button
                          type="button"
                          onClick={() => setConfirmRestore(cat)}
                          className="px-2.5 py-1 bg-Snowflake text-Pine text-xs font-bold rounded-xl"
                        >
                          Khôi phục
                        </button>
                      ) : (
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => openEdit(cat)} className="p-1.5 text-Pine bg-Snowflake rounded-xl">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(cat)} className="p-1.5 text-Berry bg-Berry/10 rounded-xl">
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        title={editTarget ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới'}
        onClose={() => setModalOpen(false)}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Tên danh mục *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ví dụ: Sản xuất linh kiện bán dẫn"
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-white text-Pine"
            />
          </div>
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Loại danh mục *</label>
            <select
              value={form.category_type}
              onChange={(e) => setForm((f) => ({ ...f, category_type: e.target.value as CategoryForm['category_type'] }))}
              disabled={!!editTarget}
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Pine disabled:bg-Snowflake disabled:cursor-not-allowed"
            >
              <option value="Industry">Ngành nghề đối tác</option>
              <option value="Contract_Type">Loại hợp đồng kiểm toán</option>
            </select>
            {editTarget && <p className="text-xs text-Mist mt-1">Không thể thay đổi loại danh mục sau khi tạo</p>}
          </div>
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Mô tả</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả ngắn về danh mục..."
              rows={3}
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-white text-Pine resize-none"
            />
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
              className="flex-1 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Pine/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
            >
              {saving ? <Spinner size="sm" /> : null}
              {editTarget ? 'Lưu thay đổi' : 'Thêm mới'}
            </button>
          </div>
        </div>
      </Modal>

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