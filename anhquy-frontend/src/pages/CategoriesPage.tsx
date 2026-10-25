import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Plus, Search, Edit2, Trash2, RotateCcw, Lock, FolderOpen,
  Ban, Layers, Settings2, Check, X, Tag, CheckCircle2
} from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { ConfirmModal, Modal, Pagination, Spinner, EmptyState } from '../components/ui'
import { categoryApi } from '../api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: number
  name: string
  category_type: string
  description: string | null
  is_active: boolean
  created_at: string
}

interface CategoryForm {
  name: string
  category_type: string
  description: string
}

interface CategoryTypeOption {
  code: string
  label: string
  isCore?: boolean
}

// Các nhóm loại danh mục nền tảng mặc định
const DEFAULT_CATEGORY_TYPES: CategoryTypeOption[] = [
  { code: 'Industry',      label: 'Ngành nghề đối tác',       isCore: true },
  { code: 'Contract_Type', label: 'Loại hợp đồng kiểm toán', isCore: true },
]

const STORAGE_KEY_TYPES = 'anhquy_dynamic_category_types_v1'

// Hàm ngầm định chuyển Tên tiếng Việt thành Mã lưu CSDL an toàn (Người dùng không cần nhập mã)
function toTypeCodeSlug(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9\s_]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

const EMPTY_FORM: CategoryForm = { name: '', category_type: 'Industry', description: '' }

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)

  const [statusTab, setStatusTab] = useState<'all' | 'active' | 'inactive'>('all')
  const [filterType, setFilterType] = useState<string>('')
  const [search, setSearch] = useState('')

  // Danh sách các Nhóm Loại danh mục động
  const [customTypes, setCustomTypes] = useState<CategoryTypeOption[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TYPES)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {
      // ignore
    }
    return DEFAULT_CATEGORY_TYPES
  })

  const saveCustomTypesToStorage = (nextList: CategoryTypeOption[]) => {
    setCustomTypes(nextList)
    try {
      localStorage.setItem(STORAGE_KEY_TYPES, JSON.stringify(nextList))
    } catch {
      // ignore
    }
  }

  // Modal Thêm / Sửa Danh mục
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Category | null>(null)
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Tạo nhanh Loại danh mục mới ngay trong Modal (Chỉ gồm 1 ô nhập Tên duy nhất + Nút bấm)
  const [isCreatingInlineType, setIsCreatingInlineType] = useState(false)
  const [inlineTypeLabel, setInlineTypeLabel] = useState('')

  // Modal Quản lý Nhóm Loại danh mục (Thêm / Đổi tên / Xóa loại)
  const [typeManagerOpen, setTypeManagerOpen] = useState(false)
  const [newTypeLabel, setNewTypeLabel] = useState('')
  const [editingTypeCode, setEditingTypeCode] = useState<string | null>(null)
  const [editingTypeLabel, setEditingTypeLabel] = useState('')

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

      const [res, allRes] = await Promise.all([
        categoryApi.getAll(params),
        categoryApi.getAll({ page: 1, limit: 500 }).catch(() => null),
      ])

      const data = res.data?.data || res.data || {}
      const items: Category[] = (data as { items?: Category[] })?.items || []
      const totalCount: number = (data as { total?: number })?.total || 0

      // Đẩy các mục đã lưu trữ (is_active = false) xuống dưới cùng của bảng
      const sorted = [
        ...items.filter((c) => c.is_active),
        ...items.filter((c) => !c.is_active),
      ]
      setCategories(sorted)
      setTotal(totalCount)

      if (allRes) {
        const allData = allRes.data?.data || allRes.data || {}
        const allItems: Category[] = (allData as { items?: Category[] })?.items || []
        setAllCategories(allItems)
      } else {
        setAllCategories(items)
      }
    } catch {
      toast.error('Không thể tải danh sách danh mục.')
    } finally {
      setLoading(false)
    }
  }, [page, limit, filterType, search, statusTab])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  // Tổng hợp tất cả các Loại danh mục (Từ mặc định + Người dùng tạo + Dữ liệu thực tế trong SQL)
  const categoryTypesList = useMemo((): CategoryTypeOption[] => {
    const map = new Map<string, CategoryTypeOption>()
    DEFAULT_CATEGORY_TYPES.forEach((t) => map.set(t.code, t))
    customTypes.forEach((t) => {
      const isCore = DEFAULT_CATEGORY_TYPES.some((d) => d.code === t.code)
      map.set(t.code, { ...t, isCore })
    })

    const sourceList = allCategories.length > 0 ? allCategories : categories
    sourceList.forEach((c) => {
      if (c.category_type && !map.has(c.category_type)) {
        map.set(c.category_type, {
          code: c.category_type,
          label: c.category_type.replace(/_/g, ' '),
          isCore: false,
        })
      }
    })

    return Array.from(map.values())
  }, [customTypes, allCategories, categories])

  const getTypeLabel = useCallback(
    (typeCode: string): string => {
      const found = categoryTypesList.find((t) => t.code === typeCode)
      return found ? found.label : typeCode.replace(/_/g, ' ')
    },
    [categoryTypesList]
  )

  const getTypeBadgeStyle = (typeCode: string): string => {
    if (typeCode === 'Industry') return 'bg-Snowflake text-Pine border border-Mist/30'
    if (typeCode === 'Contract_Type') return 'bg-Berry/10 text-Berry border border-Berry/20'
    return 'bg-SafeBg text-SafeGreen border border-SafeBorder'
  }

  // Thống kê số lượng cho 3 Card tổng quát và từng nhóm loại
  const summaryMetrics = useMemo(() => {
    const source = allCategories.length > 0 ? allCategories : categories
    const countsByType: Record<string, number> = {}
    categoryTypesList.forEach((t) => {
      countsByType[t.code] = source.filter((c) => c.category_type === t.code).length
    })

    const activeCount = source.filter((c) => c.is_active).length
    const inactiveCount = source.filter((c) => !c.is_active).length

    return {
      totalItems: source.length || total,
      activeCount,
      inactiveCount,
      countsByType,
    }
  }, [allCategories, categories, categoryTypesList, total])

  const openCreate = () => {
    setEditTarget(null)
    setIsCreatingInlineType(false)
    setInlineTypeLabel('')
    setForm({
      name: '',
      category_type: filterType || categoryTypesList[0]?.code || 'Industry',
      description: '',
    })
    setModalOpen(true)
  }

  const openEdit = (c: Category) => {
    if (!c.is_active) return
    setEditTarget(c)
    setIsCreatingInlineType(false)
    setInlineTypeLabel('')
    setForm({ name: c.name, category_type: c.category_type, description: c.description || '' })
    setModalOpen(true)
  }

  // Tạo nhanh loại danh mục ngay trong Modal Thêm danh mục (Chỉ cần bấm 1 nút)
  const handleConfirmInlineNewType = () => {
    const trimmedLabel = inlineTypeLabel.trim()
    const generatedCode = toTypeCodeSlug(trimmedLabel).substring(0, 48)
    if (!trimmedLabel || !generatedCode) {
      toast.error('Vui lòng nhập tên loại danh mục mới.')
      return
    }

    const existing = categoryTypesList.find(
      (t) =>
        t.code.toLowerCase() === generatedCode.toLowerCase() ||
        t.label.toLowerCase() === trimmedLabel.toLowerCase()
    )

    if (existing) {
      setForm((f) => ({ ...f, category_type: existing.code }))
      setIsCreatingInlineType(false)
      setInlineTypeLabel('')
      toast.info(`Đã chọn loại danh mục "${existing.label}".`)
      return
    }

    const updated = [...categoryTypesList, { code: generatedCode, label: trimmedLabel, isCore: false }]
    saveCustomTypesToStorage(updated)
    setForm((f) => ({ ...f, category_type: generatedCode }))
    setIsCreatingInlineType(false)
    setInlineTypeLabel('')
    toast.success(`Đã tạo loại danh mục mới: "${trimmedLabel}"!`)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Tên danh mục không được để trống.')
      return
    }

    let finalCategoryType = form.category_type

    // Nếu người dùng đang gõ dở tên loại mới mà bấm "Thêm mới" luôn thì tự động tạo loại đó
    if (isCreatingInlineType) {
      const trimmedLabel = inlineTypeLabel.trim()
      const generatedCode = toTypeCodeSlug(trimmedLabel).substring(0, 48)
      if (!trimmedLabel || !generatedCode) {
        toast.error('Vui lòng nhập tên loại danh mục mới.')
        return
      }
      finalCategoryType = generatedCode
      if (!categoryTypesList.some((t) => t.code.toLowerCase() === generatedCode.toLowerCase())) {
        saveCustomTypesToStorage([
          ...categoryTypesList,
          { code: generatedCode, label: trimmedLabel, isCore: false },
        ])
      }
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        category_type: finalCategoryType,
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
      setIsCreatingInlineType(false)
      fetchCategories()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Lưu thất bại.')
    } finally {
      setSaving(false)
    }
  }

  // Thêm Loại danh mục mới trong cửa sổ Quản lý Loại danh mục (Chỉ nhập tên, tự động sinh mã ngầm)
  const handleAddCategoryType = () => {
    const label = newTypeLabel.trim()
    const code = toTypeCodeSlug(label).substring(0, 48)
    if (!label || !code) {
      toast.error('Vui lòng nhập tên loại danh mục mới.')
      return
    }
    if (
      categoryTypesList.some(
        (t) => t.code.toLowerCase() === code.toLowerCase() || t.label.toLowerCase() === label.toLowerCase()
      )
    ) {
      toast.error(`Loại danh mục "${label}" đã tồn tại trong hệ thống.`)
      return
    }
    const updated = [...categoryTypesList, { code, label, isCore: false }]
    saveCustomTypesToStorage(updated)
    setNewTypeLabel('')
    toast.success(`Đã thêm loại danh mục mới: "${label}"!`)
  }

  const handleSaveEditTypeLabel = (code: string) => {
    const trimmed = editingTypeLabel.trim()
    if (!trimmed) {
      toast.error('Tên loại danh mục không được để trống.')
      return
    }
    const updated = categoryTypesList.map((t) => (t.code === code ? { ...t, label: trimmed } : t))
    saveCustomTypesToStorage(updated)
    setEditingTypeCode(null)
    toast.success('Đã đổi tên loại danh mục thành công!')
  }

  const handleDeleteCategoryType = (typeOpt: CategoryTypeOption) => {
    const usedCount = summaryMetrics.countsByType[typeOpt.code] || 0
    if (usedCount > 0) {
      toast.error(`Không thể xóa loại "${typeOpt.label}" vì đang có ${usedCount} danh mục bên trong.`)
      return
    }
    const updated = categoryTypesList.filter((t) => t.code !== typeOpt.code)
    saveCustomTypesToStorage(updated)
    if (filterType === typeOpt.code) setFilterType('')
    toast.success(`Đã xóa loại danh mục "${typeOpt.label}".`)
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

  return (
    <MainLayout breadcrumb="Danh mục Hệ thống">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-Pine tracking-tight">Danh mục Hệ thống</h1>
            <p className="text-xs sm:text-sm text-Mist mt-0.5">
              Quản lý các nhóm phân loại danh mục động phục vụ chuẩn hóa dữ liệu đối tác và hợp đồng
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTypeManagerOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white text-Pine border border-Pine/30 text-xs font-extrabold rounded-2xl hover:bg-Snowflake shadow-sm transition-colors duration-200"
            >
              <Settings2 className="w-4 h-4 text-Pine" />
              Quản lý Loại danh mục ({categoryTypesList.length})
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-2xl hover:bg-Branch shadow-sm transition-colors duration-200"
            >
              <Plus className="w-4 h-4" />
              Thêm danh mục
            </button>
          </div>
        </div>

        {/* ─── 3 Card Số liệu Tổng quát (Hợp lý cho mọi số lượng Loại danh mục) ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1 (Màu chủ đạo Pine): Số Nhóm Loại Danh mục */}
          <div
            onClick={() => setTypeManagerOpen(true)}
            className="bg-Pine text-white rounded-3xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-white/15 text-Sunny flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-Snowflake/85">Nhóm Loại danh mục</p>
                <p className="text-xl font-black text-white">
                  {categoryTypesList.length} <span className="text-xs font-semibold text-Snowflake/80">nhóm phân loại</span>
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-xl bg-Sunny text-Branch text-[11px] font-extrabold">
              + Thêm loại
            </span>
          </div>

          {/* Card 2: Danh mục Đang hoạt động */}
          <button
            type="button"
            onClick={() => { setStatusTab('active'); setPage(1) }}
            className={`text-left bg-white rounded-3xl border p-4 shadow-sm transition-all flex items-center justify-between ${
              statusTab === 'active' ? 'border-Pine ring-2 ring-Pine/15' : 'border-Mist/25 hover:border-Pine/40'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-SafeBg text-SafeGreen flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-Branch">Danh mục Đang hoạt động</p>
                <p className="text-xl font-extrabold text-Pine">
                  {summaryMetrics.activeCount} <span className="text-xs font-semibold text-Mist">/ {summaryMetrics.totalItems} mục</span>
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-xl bg-SafeBg text-SafeGreen text-[11px] font-extrabold">
              Đang dùng
            </span>
          </button>

          {/* Card 3: Danh mục Đã lưu trữ */}
          <button
            type="button"
            onClick={() => { setStatusTab('inactive'); setPage(1) }}
            className={`text-left bg-white rounded-3xl border p-4 shadow-sm transition-all flex items-center justify-between ${
              statusTab === 'inactive' ? 'border-Berry ring-2 ring-Berry/15' : 'border-Mist/25 hover:border-Berry/40'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-DangerBg text-Berry flex items-center justify-center flex-shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-Branch">Danh mục Đã lưu trữ</p>
                <p className="text-xl font-extrabold text-Berry">
                  {summaryMetrics.inactiveCount} <span className="text-xs font-semibold text-Mist">mục tạm khóa</span>
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-xl bg-Snowflake text-Branch text-[11px] font-extrabold">
              Lưu trữ
            </span>
          </button>
        </div>

        {/* ─── Thanh Lọc Loại Danh mục Động (Cuộn ngang mượt, dù có 20-50 loại cũng không bị tràn) ─── */}
        <div className="bg-white rounded-3xl border border-Mist/25 p-3 shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 flex-1 min-w-0">
            <span className="text-xs font-extrabold text-Branch px-2 flex items-center gap-1 flex-shrink-0">
              <Tag className="w-3.5 h-3.5 text-Pine" />
              Phân loại:
            </span>

            <button
              type="button"
              onClick={() => { setFilterType(''); setPage(1) }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors flex-shrink-0 whitespace-nowrap ${
                filterType === ''
                  ? 'bg-Pine text-white shadow-sm'
                  : 'bg-Snowflake/50 text-Branch hover:bg-Snowflake'
              }`}
            >
              Tất cả ({summaryMetrics.totalItems})
            </button>

            {categoryTypesList.map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => { setFilterType(t.code); setPage(1) }}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap ${
                  filterType === t.code
                    ? 'bg-Pine text-white shadow-sm'
                    : 'bg-Snowflake/50 text-Branch hover:bg-Snowflake'
                }`}
              >
                <span>{t.label}</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                  filterType === t.code ? 'bg-Sunny text-Branch' : 'bg-white text-Pine'
                }`}>
                  {summaryMetrics.countsByType[t.code] ?? 0}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setTypeManagerOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-Pine/10 text-Pine hover:bg-Pine hover:text-white text-xs font-extrabold transition-colors flex items-center gap-1 flex-shrink-0 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm loại mới
          </button>
        </div>

        {/* ─── Bảng Dữ liệu Chính (Đã bỏ cái Dropdown trùng lặp, chỉ giữ Tab Trạng thái & Ô Tìm kiếm) ─── */}
        <div className="bg-white rounded-3xl border border-Mist/25 shadow-[0_10px_28px_rgba(39,54,63,0.06)] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-Mist/15 pb-3">
            {/* Tabs lọc trạng thái */}
            <div className="flex items-center gap-1 bg-Snowflake/60 p-1 rounded-2xl w-fit">
              {[
                { key: 'all',      label: 'Tất cả trạng thái' },
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

            {/* Ô Tìm kiếm nhanh */}
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
              <input
                type="text"
                placeholder="Tìm kiếm tên danh mục, mô tả..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="w-full pl-9 pr-3 py-2 border border-Mist/40 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-Pine bg-Snowflake/20 text-Pine placeholder-Mist transition-all"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : categories.length === 0 ? (
            <EmptyState message="Không tìm thấy danh mục nào thuộc nhóm đang chọn" />
          ) : (
            <>
              {/* 1. Desktop Table */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-Mist/20">
                <table className="min-w-full divide-y divide-Mist/15">
                  <thead>
                    <tr className="bg-Pine text-white">
                      {['Tên danh mục', 'Thuộc loại danh mục', 'Mô tả chi tiết', 'Trạng thái', 'Thao tác'].map((h) => (
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
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-bold ${getTypeBadgeStyle(cat.category_type)}`}>
                            {getTypeLabel(cat.category_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-Branch max-w-xs truncate">{cat.description || '—'}</td>
                        <td className="px-4 py-3.5">
                          {!cat.is_active ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-Berry/10 text-Berry border border-Berry/20">
                              <Ban className="w-3 h-3" /> Đã lưu trữ
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-SafeBg text-SafeGreen border border-SafeBorder">
                              <span className="w-1.5 h-1.5 rounded-full bg-SafeGreen" />
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
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${getTypeBadgeStyle(cat.category_type)}`}>
                        {getTypeLabel(cat.category_type)}
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

      {/* ─── Modal 1: Thêm / Chỉnh sửa Danh mục (Tạo loại mới chỉ với 1 ô nhập tên + nút bấm) ─── */}
      <Modal
        isOpen={modalOpen}
        title={editTarget ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới'}
        onClose={() => setModalOpen(false)}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">
              Tên danh mục *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ví dụ: Sản xuất linh kiện bán dẫn"
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-white text-Pine"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine">
                Loại danh mục *
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingInlineType(!isCreatingInlineType)
                  setInlineTypeLabel('')
                }}
                className="text-xs font-extrabold text-Pine hover:underline flex items-center gap-1"
              >
                {isCreatingInlineType ? '← Chọn loại có sẵn' : '+ Thêm loại danh mục mới'}
              </button>
            </div>

            {isCreatingInlineType ? (
              <div className="p-3 rounded-2xl bg-Snowflake/40 border border-Pine/30 space-y-2">
                <label className="block text-[11px] font-bold text-Branch">
                  Nhập tên loại danh mục mới:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inlineTypeLabel}
                    onChange={(e) => setInlineTypeLabel(e.target.value)}
                    placeholder="VD: Hình thức thanh toán, Khu vực..."
                    className="flex-1 px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
                  />
                  <button
                    type="button"
                    onClick={handleConfirmInlineNewType}
                    className="px-3.5 py-2 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Branch transition-colors flex-shrink-0"
                  >
                    Tạo ngay
                  </button>
                </div>
              </div>
            ) : (
              <select
                value={form.category_type}
                onChange={(e) => setForm((f) => ({ ...f, category_type: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Pine"
              >
                {categoryTypesList.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">
              Mô tả chi tiết
            </label>
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
              className="flex-1 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Branch disabled:opacity-60 transition-all flex items-center justify-center gap-2"
            >
              {saving ? <Spinner size="sm" /> : null}
              {editTarget ? 'Lưu thay đổi' : 'Thêm mới'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal 2: Quản lý Loại danh mục (Chỉ cần nhập Tên loại + Bấm nút Thêm) ─── */}
      <Modal
        isOpen={typeManagerOpen}
        title="Quản lý Các Loại Danh mục"
        onClose={() => {
          setTypeManagerOpen(false)
          setEditingTypeCode(null)
        }}
        size="md"
      >
        <div className="space-y-4">
          {/* Ô nhập 1 dòng đơn giản + Nút bấm Tạo ngay */}
          <div className="bg-Snowflake/40 p-3.5 rounded-2xl border border-Mist/30 space-y-2">
            <label className="block text-xs font-extrabold text-Pine">
              Thêm loại danh mục mới
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTypeLabel}
                onChange={(e) => setNewTypeLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddCategoryType()
                  }
                }}
                placeholder="Nhập tên loại mới (VD: Hình thức thanh toán, Phòng ban...)"
                className="flex-1 px-3.5 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
              />
              <button
                type="button"
                onClick={handleAddCategoryType}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Branch transition-colors shadow-sm flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm loại
              </button>
            </div>
          </div>

          {/* Danh sách các Loại danh mục hiện có */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            <p className="text-xs font-extrabold uppercase text-Branch">
              Các loại danh mục đang có ({categoryTypesList.length})
            </p>
            {categoryTypesList.map((t) => {
              const count = summaryMetrics.countsByType[t.code] ?? 0
              const isEditingThis = editingTypeCode === t.code

              return (
                <div
                  key={t.code}
                  className="p-3 rounded-2xl border border-Mist/25 bg-white flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    {isEditingThis ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingTypeLabel}
                          onChange={(e) => setEditingTypeLabel(e.target.value)}
                          className="flex-1 px-2.5 py-1 border border-Pine rounded-lg text-xs font-bold text-Pine focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditTypeLabel(t.code)}
                          className="p-1.5 rounded-lg bg-SafeGreen text-white"
                          title="Lưu tên"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTypeCode(null)}
                          className="p-1.5 rounded-lg bg-Snowflake text-Branch"
                          title="Hủy"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between pr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-Pine">{t.label}</span>
                          {t.isCore && (
                            <span className="text-[10px] font-bold bg-Pine/10 text-Pine px-2 py-0.5 rounded">
                              Hệ thống
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-semibold text-Mist">
                          {count} mục
                        </span>
                      </div>
                    )}
                  </div>

                  {!isEditingThis && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTypeCode(t.code)
                          setEditingTypeLabel(t.label)
                        }}
                        className="p-1.5 text-Pine hover:bg-Snowflake rounded-xl transition-colors"
                        title="Đổi tên loại danh mục"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {!t.isCore && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCategoryType(t)}
                          className="p-1.5 text-Berry hover:bg-DangerBg rounded-xl transition-colors"
                          title="Xóa loại danh mục"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex justify-end pt-2 border-t border-Mist/15">
            <button
              type="button"
              onClick={() => setTypeManagerOpen(false)}
              className="px-5 py-2 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Branch transition-colors"
            >
              Đóng
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