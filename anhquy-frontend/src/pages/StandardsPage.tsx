import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Plus, Edit2, Trash2, RotateCcw, Lock, Globe, MapPin,
  SlidersHorizontal, Search, Ban, ListChecks, CheckCircle2
} from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { ConfirmModal, Modal, Pagination, Spinner, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { standardApi } from '../api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StandardGroup { id: number; group_code: string; group_name: string }

interface Standard {
  id: number
  standard_code: string
  name: string
  jurisdiction: 'Global' | 'VN' | null
  content_i18n: string | null
  description?: string | null
  is_active: boolean
  priority_level: number | null
  created_by: number | null
  created_at: string
  Standard_Groups?: StandardGroup | null
}

interface ExcludedItem { standard_id: number }

interface ContentI18n { vi?: string; en?: string }

function parseContent(raw: string | null, fallbackDesc: string | null | undefined, lang: 'vi' | 'en'): string {
  if (!raw) return fallbackDesc || '—'
  try {
    const obj = JSON.parse(raw) as ContentI18n
    return obj[lang] || obj.vi || obj.en || fallbackDesc || raw
  } catch {
    return raw
  }
}

const TAB_OPTIONS = [
  { key: 'all',      label: 'Tất cả tiêu chuẩn' },
  { key: 'system',   label: '24 Tiêu chuẩn gốc' },
  { key: 'personal', label: 'Tiêu chuẩn riêng của tôi' },
]

export default function StandardsPage() {
  const { hasPermission, user } = useAuth()

  const [groups, setGroups] = useState<StandardGroup[]>([])
  const [standards, setStandards] = useState<Standard[]>([])
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)

  const [activeTab, setActiveTab] = useState<'all' | 'system' | 'personal'>('all')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterJurisdiction, setFilterJurisdiction] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [search, setSearch] = useState('')
  const [lang, setLang] = useState<'vi' | 'en'>('vi')

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Standard | null>(null)
  const [form, setForm] = useState({
    standard_code: '',
    name: '',
    content_vi: '',
    content_en: '',
    jurisdiction: 'Global',
    priority_level: '1',
    group_id: '',
  })
  const [saving, setSaving] = useState(false)

  const [confirmDelete, setConfirmDelete]   = useState<Standard | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<Standard | null>(null)
  const [toggleLoading, setToggleLoading]   = useState<Set<number>>(new Set())

  useEffect(() => {
    standardApi.getGroups().then((r) => {
      const raw = r.data?.groups || r.data?.data || r.data || []
      setGroups(Array.isArray(raw) ? (raw as StandardGroup[]) : [])
    }).catch(() => {})
  }, [])

  const fetchExcluded = useCallback(async () => {
    try {
      const r = await standardApi.getExcluded()
      const raw: ExcludedItem[] = r.data?.excluded || r.data?.data || r.data || []
      setExcluded(new Set(Array.isArray(raw) ? raw.map((e) => e.standard_id) : []))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchExcluded() }, [fetchExcluded])

  const fetchStandards = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean | undefined> = { page, limit }
      if (filterGroup) params.group_id = filterGroup
      if (filterJurisdiction) params.jurisdiction = filterJurisdiction
      if (filterStatus === 'active') params.is_active = true
      if (filterStatus === 'inactive') params.is_active = false
      if (search.trim()) params.search = search.trim()
      if (activeTab === 'system') params.type = 'system'
      if (activeTab === 'personal') params.type = 'personal'

      const res = await standardApi.getAll(params)
      const data = res.data?.data || res.data || {}
      const items: Standard[] = (data as { items?: Standard[] })?.items || []
      const totalCount: number = (data as { total?: number })?.total || 0

      // Đẩy tiêu chuẩn đã ẩn (is_active = false) xuống dưới cùng
      const sorted = [
        ...items.filter((s) => s.is_active),
        ...items.filter((s) => !s.is_active),
      ]
      setStandards(sorted)
      setTotal(totalCount)
    } catch {
      toast.error('Không thể tải danh sách tiêu chuẩn.')
    } finally {
      setLoading(false)
    }
  }, [page, limit, activeTab, filterGroup, filterJurisdiction, filterStatus, search])

  useEffect(() => { fetchStandards() }, [fetchStandards])

  const handleToggleExclude = async (standard: Standard) => {
    if (toggleLoading.has(standard.id)) return
    setToggleLoading((prev) => new Set(prev).add(standard.id))
    try {
      if (excluded.has(standard.id)) {
        await standardApi.include(standard.id)
        setExcluded((prev) => { const s = new Set(prev); s.delete(standard.id); return s })
        toast.success(`Đã bật áp dụng tiêu chuẩn "${standard.standard_code}" khi quét AI.`)
      } else {
        await standardApi.exclude(standard.id)
        setExcluded((prev) => new Set(prev).add(standard.id))
        toast.success(`Đã tạm tắt tiêu chuẩn "${standard.standard_code}" khỏi bộ quét AI của bạn.`)
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Thao tác thất bại.')
    } finally {
      setToggleLoading((prev) => { const s = new Set(prev); s.delete(standard.id); return s })
    }
  }

  const openCreate = () => {
    setEditTarget(null)
    setForm({
      standard_code: '',
      name: '',
      content_vi: '',
      content_en: '',
      jurisdiction: 'Global',
      priority_level: '1',
      group_id: groups[0] ? String(groups[0].id) : '1',
    })
    setModalOpen(true)
  }

  const openEdit = (s: Standard) => {
    if (!s.is_active) return
    let content_vi = '', content_en = ''
    if (s.content_i18n) {
      try {
        const c = JSON.parse(s.content_i18n) as ContentI18n
        content_vi = c.vi || ''
        content_en = c.en || ''
      } catch { content_vi = s.content_i18n }
    }
    setEditTarget(s)
    setForm({
      standard_code: s.standard_code,
      name: s.name,
      content_vi,
      content_en,
      jurisdiction: s.jurisdiction || 'Global',
      priority_level: String(s.priority_level || 1),
      group_id: String(s.Standard_Groups?.id || '1'),
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.standard_code.trim() || !form.name.trim()) {
      toast.error('Mã và tên tiêu chuẩn không được để trống.')
      return
    }
    if (!form.group_id) {
      toast.error('Vui lòng chọn nhóm tiêu chuẩn.')
      return
    }
    setSaving(true)
    try {
      const content_i18n = JSON.stringify({ vi: form.content_vi, en: form.content_en })
      const payload = {
        standard_code: form.standard_code.trim(),
        name: form.name.trim(),
        content_i18n,
        description: form.content_vi || form.name.trim(),
        jurisdiction: form.jurisdiction,
        priority_level: Number(form.priority_level),
        group_id: Number(form.group_id),
      }
      if (editTarget) {
        await standardApi.update(editTarget.id, payload)
        toast.success('Cập nhật tiêu chuẩn thành công.')
      } else {
        await standardApi.create(payload)
        toast.success('Tạo tiêu chuẩn riêng thành công.')
      }
      setModalOpen(false)
      fetchStandards()
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
      await standardApi.delete(confirmDelete.id)
      toast.success(`Đã chuyển tiêu chuẩn "${confirmDelete.name}" vào lưu trữ.`)
      setConfirmDelete(null)
      fetchStandards()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Ẩn tiêu chuẩn thất bại.')
    }
  }

  const handleRestore = async () => {
    if (!confirmRestore) return
    try {
      await standardApi.update(confirmRestore.id, { is_active: true })
      toast.success(`Đã khôi phục tiêu chuẩn "${confirmRestore.name}".`)
      setConfirmRestore(null)
      fetchStandards()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Khôi phục thất bại.')
    }
  }

  const canModifyStandard = (s: Standard) => {
    if (s.created_by === null) return hasPermission('MANAGE_SYSTEM_STANDARDS')
    return hasPermission('MANAGE_SYSTEM_STANDARDS') || (hasPermission('CREATE_CUSTOM_STANDARD') && s.created_by === (user?.id ?? -1))
  }

  const activeScanCount = standards.filter((s) => s.is_active && !excluded.has(s.id)).length

  return (
    <MainLayout breadcrumb="Bộ Tiêu chuẩn RBA/VN">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-Pine tracking-tight">
              Bộ Tiêu chuẩn RBA & Pháp luật Việt Nam
            </h1>
            <p className="text-xs sm:text-sm text-Mist mt-0.5">
              Bật/tắt tiêu chuẩn khi quét AI hoặc bổ sung tiêu chuẩn nội bộ riêng của doanh nghiệp
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
              className="flex items-center gap-1.5 px-3.5 py-2.5 border border-Mist/40 bg-white text-Pine text-xs font-extrabold rounded-2xl hover:bg-Snowflake transition-all shadow-sm"
            >
              <Globe className="w-4 h-4 text-Berry" />
              Ngôn ngữ: {lang.toUpperCase()}
            </button>
            {hasPermission('CREATE_CUSTOM_STANDARD') && (
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-2xl hover:bg-Pine/90 shadow-sm hover:shadow-md transition-all"
              >
                <Plus className="w-4 h-4" />
                Tạo tiêu chuẩn riêng
              </button>
            )}
          </div>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Pine text-white flex items-center justify-center flex-shrink-0">
              <ListChecks className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Tổng tiêu chuẩn hiển thị</p>
              <p className="text-xl font-extrabold text-Pine">{total}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Mist text-Pine flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Đang bật khi quét AI</p>
              <p className="text-xl font-extrabold text-Pine">{activeScanCount}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Berry text-white flex items-center justify-center flex-shrink-0">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Đang tạm tắt (Excluded)</p>
              <p className="text-xl font-extrabold text-Berry">{excluded.size}</p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-Mist/15 pb-3">
            {/* Pill Tabs */}
            <div className="flex items-center gap-1 bg-Snowflake/60 p-1 rounded-2xl w-fit">
              {TAB_OPTIONS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setActiveTab(tab.key as typeof activeTab); setPage(1) }}
                  className={`px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition-all ${
                    activeTab === tab.key
                      ? 'bg-Pine text-white shadow-sm'
                      : 'text-Branch hover:text-Pine'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2.5 flex-1 lg:justify-end">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
                <input
                  type="text"
                  placeholder="Tìm mã hoặc tên tiêu chuẩn..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="w-full pl-9 pr-3 py-2 border border-Mist/40 rounded-xl text-xs bg-Snowflake/20 text-Pine focus:outline-none focus:border-Pine"
                />
              </div>
              <select
                value={filterGroup}
                onChange={(e) => { setFilterGroup(e.target.value); setPage(1) }}
                className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
              >
                <option value="">Tất cả 4 nhóm</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.group_name}</option>)}
              </select>
              <select
                value={filterJurisdiction}
                onChange={(e) => { setFilterJurisdiction(e.target.value); setPage(1) }}
                className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
              >
                <option value="">Mọi phạm vi</option>
                <option value="Global">Global (RBA)</option>
                <option value="VN">Pháp luật VN</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value as typeof filterStatus); setPage(1) }}
                className="px-3 py-2 border border-Mist/40 rounded-xl text-xs font-bold bg-white text-Pine focus:outline-none focus:border-Pine"
              >
                <option value="all">Mọi trạng thái</option>
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Đã lưu trữ</option>
              </select>
            </div>
          </div>

          {/* Cards grid */}
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : standards.length === 0 ? (
            <EmptyState message="Không tìm thấy tiêu chuẩn nào" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {standards.map((s) => {
                const isExcluded = excluded.has(s.id)
                const isSystem = s.created_by === null
                const canMod = canModifyStandard(s)

                return (
                  <div
                    key={s.id}
                    className={`rounded-2xl border p-4 transition-all duration-300 flex flex-col justify-between
                      ${
                        !s.is_active
                          ? 'opacity-60 bg-Snowflake/50 border-Mist/30 cursor-not-allowed'
                          : isExcluded
                          ? 'bg-Snowflake/25 border-Mist/40 border-l-4 border-l-Mist'
                          : 'bg-white border-Mist/25 shadow-sm hover:shadow-md'
                      }
                    `}
                  >
                    <div>
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                            <span className="font-mono text-xs font-extrabold text-white bg-Pine px-2.5 py-0.5 rounded-lg">
                              {s.standard_code}
                            </span>
                            {s.jurisdiction === 'VN' ? (
                              <span className="flex items-center gap-0.5 text-[11px] font-bold bg-Berry/10 text-Berry px-2 py-0.5 rounded-lg border border-Berry/20">
                                <MapPin className="w-2.5 h-2.5" /> VN Law
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5 text-[11px] font-bold bg-Snowflake text-Pine px-2 py-0.5 rounded-lg border border-Mist/30">
                                <Globe className="w-2.5 h-2.5" /> Global RBA
                              </span>
                            )}
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded-lg font-bold ${
                                s.priority_level === 1
                                  ? 'bg-Berry text-white'
                                  : 'bg-Frostysilver/50 text-Pine'
                              }`}
                            >
                              {s.priority_level === 1 ? 'Mức 1 · Bắt buộc' : 'Mức 2 · Quan trọng'}
                            </span>
                            {isSystem ? (
                              <span className="text-[11px] bg-Pine/10 text-Pine px-2 py-0.5 rounded-lg font-bold">
                                Chuẩn Gốc
                              </span>
                            ) : (
                              <span className="text-[11px] bg-Branch text-white px-2 py-0.5 rounded-lg font-bold">
                                Tiêu chuẩn riêng
                              </span>
                            )}
                            {!s.is_active && (
                              <span className="flex items-center gap-1 text-[11px] font-bold bg-Berry/10 text-Berry px-2 py-0.5 rounded-lg">
                                <Ban className="w-3 h-3" /> Đã lưu trữ
                              </span>
                            )}
                          </div>
                          <h3 className={`text-sm font-extrabold ${!s.is_active ? 'line-through text-Branch' : 'text-Pine'}`}>
                            {s.name}
                          </h3>
                        </div>

                        {/* Toggle switch */}
                        {s.is_active && (
                          <button
                            type="button"
                            onClick={() => handleToggleExclude(s)}
                            disabled={toggleLoading.has(s.id)}
                            title={isExcluded ? 'Bật lại khi quét AI' : 'Tắt khỏi bộ quét AI'}
                            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-xl border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                              isExcluded ? 'bg-Mist' : 'bg-Pine'
                            } ${toggleLoading.has(s.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 rounded-lg bg-white shadow transform transition duration-200 ${
                                isExcluded ? 'translate-x-0' : 'translate-x-4'
                              }`}
                            />
                          </button>
                        )}
                      </div>

                      {/* Content */}
                      <p className="text-xs text-Branch leading-relaxed line-clamp-3">
                        {parseContent(s.content_i18n, s.description, lang)}
                      </p>

                      {isExcluded && s.is_active && (
                        <p className="text-[11px] text-Berry font-semibold mt-2 italic flex items-center gap-1">
                          <SlidersHorizontal className="w-3 h-3" />
                          Đang tạm tắt — AI sẽ bỏ qua tiêu chuẩn này khi quét hợp đồng
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-Mist/15">
                      <span className="text-[11px] font-semibold text-Mist truncate">
                        {s.Standard_Groups?.group_name || 'Nhóm tiêu chuẩn'}
                      </span>

                      {s.is_active ? (
                        canMod ? (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEdit(s)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-Pine hover:bg-Snowflake rounded-xl transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(s)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-Berry hover:bg-Berry/10 rounded-xl transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Ẩn
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] font-bold text-Pine/60">Bảo vệ toàn vẹn</span>
                        )
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-xs text-Berry/60">
                            <Lock className="w-3.5 h-3.5" /> Đã khóa
                          </span>
                          {canMod && (
                            <button
                              type="button"
                              onClick={() => setConfirmRestore(s)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-Pine bg-Snowflake hover:bg-Mist/30 border border-Mist/40 rounded-xl transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Khôi phục
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
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

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        title={editTarget ? 'Chỉnh sửa tiêu chuẩn' : 'Tạo tiêu chuẩn riêng'}
        onClose={() => setModalOpen(false)}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Mã tiêu chuẩn *</label>
              <input
                type="text"
                disabled={!!editTarget}
                value={form.standard_code}
                onChange={(e) => setForm((f) => ({ ...f, standard_code: e.target.value }))}
                placeholder="CUSTOM-LD-01"
                className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-white font-mono disabled:bg-Snowflake"
              />
            </div>
            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Phạm vi áp dụng</label>
              <select
                value={form.jurisdiction}
                onChange={(e) => setForm((f) => ({ ...f, jurisdiction: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Pine"
              >
                <option value="Global">Global (RBA)</option>
                <option value="VN">Việt Nam</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Mức độ ưu tiên</label>
              <select
                value={form.priority_level}
                onChange={(e) => setForm((f) => ({ ...f, priority_level: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Pine"
              >
                <option value="1">Mức 1 – Nghiêm trọng (Bắt buộc)</option>
                <option value="2">Mức 2 – Quan trọng (Khuyến nghị)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Tên tiêu chuẩn *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ví dụ: Quy định phụ cấp ca đêm tối thiểu 35%"
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-white text-Pine"
            />
          </div>
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Nhóm tiêu chuẩn *</label>
            <select
              value={form.group_id}
              onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value }))}
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Pine"
            >
              <option value="">-- Chọn nhóm tiêu chuẩn --</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.group_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Nội dung quy định (Tiếng Việt)</label>
            <textarea
              value={form.content_vi}
              onChange={(e) => setForm((f) => ({ ...f, content_vi: e.target.value }))}
              rows={3}
              placeholder="Mô tả chi tiết yêu cầu kiểm toán bằng tiếng Việt..."
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-white text-Pine resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Content (English)</label>
            <textarea
              value={form.content_en}
              onChange={(e) => setForm((f) => ({ ...f, content_en: e.target.value }))}
              rows={3}
              placeholder="Standard description in English..."
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-white text-Pine resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-Mist/40 text-Branch text-xs font-bold rounded-xl hover:bg-Snowflake transition-all">Hủy bỏ</button>
            <button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Pine/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2">
              {saving ? <Spinner size="sm" /> : null}
              {editTarget ? 'Lưu thay đổi' : 'Tạo tiêu chuẩn'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Lưu trữ (Ẩn) tiêu chuẩn?"
        message={`Tiêu chuẩn "${confirmDelete?.name}" sẽ được đẩy xuống cuối danh sách và khóa chỉnh sửa. Có thể khôi phục lại sau.`}
        confirmLabel="Đồng ý ẩn"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmModal
        isOpen={!!confirmRestore}
        title="Khôi phục tiêu chuẩn kiểm toán?"
        message={`Tiêu chuẩn "${confirmRestore?.name}" sẽ được kích hoạt trở lại để áp dụng khi quét AI.`}
        confirmLabel="Khôi phục ngay"
        variant="info"
        onConfirm={handleRestore}
        onCancel={() => setConfirmRestore(null)}
      />
    </MainLayout>
  )
}