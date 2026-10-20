import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Edit2, Trash2, RotateCcw, Lock, FolderOpen } from 'lucide-react'
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
  const LIMIT = 15

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
      const params: Record<string, string | number | boolean | undefined> = { page, limit: LIMIT }
      if (filterType) params.category_type = filterType
      if (search) params.search = search
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
  }, [page, filterType, search, statusTab])

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
        toast.success('Thêm danh mục thành công.')
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
      toast.success(`Đã vô hiệu hóa danh mục "${confirmDelete.name}".`)
      setConfirmDelete(null)
      fetchCategories()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Xóa thất bại.')
    }
  }

  const handleRestore = async () => {
    if (!confirmRestore) return
    try {
      await categoryApi.restore(confirmRestore.id)
      toast.success(`Đã kích hoạt lại danh mục "${confirmRestore.name}".`)
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

  return (
    <MainLayout breadcrumb="Danh mục Hệ thống">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-Pine">Danh mục Hệ thống</h1>
            <p className="text-sm text-Mist mt-0.5">Quản lý phân loại ngành nghề nhà cung ứng và loại hợp đồng</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 shadow-sm hover:shadow-md transition-all duration-300"
          >
            <Plus className="w-4 h-4" />
            Thêm danh mục
          </button>
        </div>

        {/* Status Tabs */}
        <div className="flex border-b border-Mist/20 bg-white rounded-t-lg px-2">
          {[
            { key: 'all',      label: 'Tất cả (Đẩy dòng đã khóa xuống cuối)' },
            { key: 'active',   label: 'Đang hoạt động' },
            { key: 'inactive', label: 'Đã lưu trữ / Vô hiệu hóa' },
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
              placeholder="Tìm kiếm tên danh mục, mô tả..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine bg-white text-Branch placeholder-Mist transition-all"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value as typeof filterType); setPage(1) }}
            className="px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white text-Branch transition-all min-w-[180px]"
          >
            <option value="">Tất cả phân loại</option>
            <option value="Industry">Ngành nghề đối tác</option>
            <option value="Contract_Type">Loại hợp đồng</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-Mist/20 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : categories.length === 0 ? (
            <EmptyState message="Không tìm thấy danh mục nào" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-Mist/10">
                <thead>
                  <tr className="bg-Snowflake/60">
                    {['Tên danh mục', 'Loại', 'Mô tả', 'Trạng thái', 'Hành động'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-Mist uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-Mist/8">
                  {categories.map((cat) => (
                    <tr
                      key={cat.id}
                      className={`hover:bg-Snowflake/40 transition-colors ${!cat.is_active ? 'opacity-60 bg-Snowflake/60' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-Pine/8 rounded-md flex items-center justify-center flex-shrink-0">
                            <FolderOpen className="w-3.5 h-3.5 text-Pine" />
                          </div>
                          <span className="text-sm font-medium text-Pine">{cat.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                          cat.category_type === 'Industry' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                        }`}>
                          {TYPE_LABEL[cat.category_type] || cat.category_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-Branch max-w-xs truncate">{cat.description || '—'}</td>
                      <td className="px-4 py-3">
                        {!cat.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-Snowflake text-Mist border border-Mist/30">
                            <Lock className="w-3 h-3" /> Đã lưu trữ
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700">
                            Đang hoạt động
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {!cat.is_active ? (
                            <>
                              <button
                                type="button"
                                disabled
                                title="Đã khóa chỉnh sửa"
                                className="p-1.5 text-Mist/40 cursor-not-allowed rounded-md"
                              >
                                <Lock className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRestore(cat)}
                                title="Kích hoạt lại"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
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
                                className="p-1.5 text-Pine hover:bg-Pine/8 rounded-md transition-colors"
                                title="Chỉnh sửa"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(cat)}
                                className="p-1.5 text-Berry hover:bg-Berry/8 rounded-md transition-colors"
                                title="Vô hiệu hóa"
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
          )}
          {!loading && (
            <div className="px-4 border-t border-Mist/10">
              <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
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
            <label className="block text-sm font-medium text-Branch mb-1.5">Tên danh mục *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ví dụ: Sản xuất linh kiện bán dẫn"
              className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine bg-white text-Branch placeholder-Mist transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-Branch mb-1.5">Loại danh mục *</label>
            <select
              value={form.category_type}
              onChange={(e) => setForm((f) => ({ ...f, category_type: e.target.value as CategoryForm['category_type'] }))}
              disabled={!!editTarget}
              className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white text-Branch transition-all disabled:bg-Snowflake disabled:cursor-not-allowed"
            >
              <option value="Industry">Ngành nghề đối tác</option>
              <option value="Contract_Type">Loại hợp đồng kiểm toán</option>
            </select>
            {editTarget && <p className="text-xs text-Mist mt-1">Không thể thay đổi loại danh mục sau khi tạo</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-Branch mb-1.5">Mô tả</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả ngắn về danh mục..."
              rows={3}
              className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine bg-white text-Branch placeholder-Mist transition-all resize-none"
            />
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

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Lưu trữ (Vô hiệu hóa) danh mục?"
        message={`Danh mục "${confirmDelete?.name}" sẽ được đẩy xuống cuối bảng và khóa chỉnh sửa. Có thể kích hoạt lại sau.`}
        confirmLabel="Vô hiệu hóa"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmModal
        isOpen={!!confirmRestore}
        title="Kích hoạt lại danh mục?"
        message={`Danh mục "${confirmRestore?.name}" sẽ được kích hoạt và hiển thị hoạt động trở lại.`}
        confirmLabel="Kích hoạt"
        variant="info"
        onConfirm={handleRestore}
        onCancel={() => setConfirmRestore(null)}
      />
    </MainLayout>
  )
}