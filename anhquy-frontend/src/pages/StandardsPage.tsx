import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Edit2, Trash2, RotateCcw, Lock, Globe, MapPin, SlidersHorizontal, Search } from 'lucide-react'
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
  { key: 'system',   label: '24 Tiêu chuẩn gốc Hệ thống' },
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
  const LIMIT = 30

  const [activeTab, setActiveTab] = useState<'all' | 'system' | 'personal'>('all')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterJurisdiction, setFilterJurisdiction] = useState('')
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

  const [confirmDelete, setConfirmDelete] = useState<Standard | null>(null)
  const [toggleLoading, setToggleLoading] = useState<Set<number>>(new Set())

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
      const params: Record<string, string | number | boolean | undefined> = { page, limit: LIMIT }
      if (filterGroup) params.group_id = filterGroup
      if (filterJurisdiction) params.jurisdiction = filterJurisdiction
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
  }, [page, activeTab, filterGroup, filterJurisdiction, search])

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
      toast.success(`Đã ẩn tiêu chuẩn "${confirmDelete.name}".`)
      setConfirmDelete(null)
      fetchStandards()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Ẩn tiêu chuẩn thất bại.')
    }
  }

  const canModifyStandard = (s: Standard) => {
    if (s.created_by === null) return hasPermission('MANAGE_SYSTEM_STANDARDS')
    return hasPermission('MANAGE_SYSTEM_STANDARDS') || (hasPermission('CREATE_CUSTOM_STANDARD') && s.created_by === (user?.id ?? -1))
  }

  return (
    <MainLayout breadcrumb="Bộ tiêu chuẩn">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-Pine">Bộ tiêu chuẩn RBA & Pháp luật VN</h1>
            <p className="text-sm text-Mist mt-0.5">Bật/tắt tiêu chuẩn khi quét AI hoặc bổ sung tiêu chuẩn nội bộ</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
              className="flex items-center gap-1.5 px-3 py-2 border border-Mist/40 bg-white text-Branch text-sm font-medium rounded-md hover:bg-Snowflake transition-all"
            >
              <Globe className="w-4 h-4 text-Pine" />
              Ngôn ngữ: {lang.toUpperCase()}
            </button>
            {hasPermission('CREATE_CUSTOM_STANDARD') && (
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 shadow-sm hover:shadow-md transition-all"
              >
                <Plus className="w-4 h-4" />
                Tạo tiêu chuẩn riêng
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-Mist/20 bg-white rounded-t-lg px-1">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setActiveTab(tab.key as typeof activeTab); setPage(1) }}
              className={`px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 ${
                activeTab === tab.key ? 'text-Pine border-Pine' : 'text-Mist border-transparent hover:text-Branch'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
            <input
              type="text"
              placeholder="Tìm theo mã hoặc tên tiêu chuẩn..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 border border-Mist/40 rounded-md text-sm bg-white text-Branch focus:outline-none focus:ring-2 focus:ring-Pine/30"
            />
          </div>
          <select
            value={filterGroup}
            onChange={(e) => { setFilterGroup(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-Mist/40 rounded-md text-sm bg-white text-Branch focus:outline-none focus:ring-2 focus:ring-Pine/30"
          >
            <option value="">Tất cả nhóm tiêu chuẩn</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.group_name}</option>)}
          </select>
          <select
            value={filterJurisdiction}
            onChange={(e) => { setFilterJurisdiction(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-Mist/40 rounded-md text-sm bg-white text-Branch focus:outline-none focus:ring-2 focus:ring-Pine/30"
          >
            <option value="">Tất cả phạm vi</option>
            <option value="Global">Global (Chuẩn RBA)</option>
            <option value="VN">Pháp luật Việt Nam</option>
          </select>
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
                  className={`bg-white rounded-lg border border-Mist/20 shadow-sm p-4 transition-all duration-300 hover:shadow-md flex flex-col justify-between
                    ${!s.is_active ? 'opacity-60 bg-Snowflake/60' : ''}
                    ${isExcluded && s.is_active ? 'border-l-4 border-l-Mist' : ''}
                  `}
                >
                  <div>
                    {/* Card header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className="font-mono text-xs font-bold text-Pine bg-Pine/8 px-2 py-0.5 rounded">
                            {s.standard_code}
                          </span>
                          {s.jurisdiction === 'VN' ? (
                            <span className="flex items-center gap-0.5 text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                              <MapPin className="w-2.5 h-2.5" /> VN
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                              <Globe className="w-2.5 h-2.5" /> Global
                            </span>
                          )}
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              s.priority_level === 1
                                ? 'bg-Berry/10 text-Berry'
                                : 'bg-Frostysilver/50 text-Branch'
                            }`}
                          >
                            {s.priority_level === 1 ? 'Ưu tiên 1 (Bắt buộc)' : 'Ưu tiên 2 (Quan trọng)'}
                          </span>
                          {isSystem ? (
                            <span className="text-xs bg-Pine/8 text-Pine px-1.5 py-0.5 rounded font-medium">Chuẩn Gốc</span>
                          ) : (
                            <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium">Tiêu chuẩn riêng</span>
                          )}
                          {s.Standard_Groups && (
                            <span className="text-xs bg-Snowflake text-Mist px-1.5 py-0.5 rounded truncate">
                              {s.Standard_Groups.group_name}
                            </span>
                          )}
                          {!s.is_active && (
                            <span className="flex items-center gap-0.5 text-xs bg-Snowflake text-Mist px-1.5 py-0.5 rounded border border-Mist/30">
                              <Lock className="w-2.5 h-2.5" /> Đã khóa / Ẩn
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-Pine">{s.name}</h3>
                      </div>

                      {/* Toggle switch */}
                      {s.is_active && (
                        <button
                          type="button"
                          onClick={() => handleToggleExclude(s)}
                          disabled={toggleLoading.has(s.id)}
                          title={isExcluded ? 'Bật lại khi quét AI' : 'Tắt khỏi bộ quét AI'}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-md border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                            isExcluded ? 'bg-Mist' : 'bg-Pine'
                          } ${toggleLoading.has(s.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 rounded-sm bg-white shadow transform transition duration-200 ${
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

                    {/* Excluded label */}
                    {isExcluded && s.is_active && (
                      <p className="text-xs text-Mist mt-2 italic flex items-center gap-1">
                        <SlidersHorizontal className="w-3 h-3" />
                        Đang tạm tắt — AI sẽ bỏ qua tiêu chuẩn này khi quét hợp đồng
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-Mist/10">
                    {s.is_active ? (
                      canMod ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(s)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs text-Pine hover:bg-Pine/8 rounded-md transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(s)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs text-Berry hover:bg-Berry/8 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Ẩn
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-Mist">Tiêu chuẩn gốc bảo vệ toàn vẹn</span>
                      )
                    ) : (
                      <div className="flex items-center justify-between w-full">
                        <span className="inline-flex items-center gap-1 text-xs text-Mist">
                          <Lock className="w-3.5 h-3.5" /> Đã khóa chỉnh sửa
                        </span>
                        {canMod && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await standardApi.update(s.id, { is_active: true })
                                toast.success(`Đã kích hoạt lại tiêu chuẩn "${s.name}".`)
                                fetchStandards()
                              } catch {
                                toast.error('Kích hoạt lại thất bại.')
                              }
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
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

        {/* Pagination */}
        {!loading && (
          <div className="bg-white rounded-lg border border-Mist/20 px-4">
            <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
          </div>
        )}
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
              <label className="block text-sm font-medium text-Branch mb-1.5">Mã tiêu chuẩn *</label>
              <input
                type="text"
                disabled={!!editTarget}
                value={form.standard_code}
                onChange={(e) => setForm((f) => ({ ...f, standard_code: e.target.value }))}
                placeholder="CUSTOM-LD-01"
                className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white font-mono disabled:bg-Snowflake"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-Branch mb-1.5">Phạm vi áp dụng</label>
              <select
                value={form.jurisdiction}
                onChange={(e) => setForm((f) => ({ ...f, jurisdiction: e.target.value }))}
                className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white text-Branch"
              >
                <option value="Global">Global (RBA)</option>
                <option value="VN">Việt Nam</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-Branch mb-1.5">Mức độ ưu tiên</label>
              <select
                value={form.priority_level}
                onChange={(e) => setForm((f) => ({ ...f, priority_level: e.target.value }))}
                className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white text-Branch"
              >
                <option value="1">Mức 1 – Nghiêm trọng (Bắt buộc)</option>
                <option value="2">Mức 2 – Quan trọng (Khuyến nghị)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-Branch mb-1.5">Tên tiêu chuẩn *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ví dụ: Quy định phụ cấp ca đêm tối thiểu 35%"
              className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-Branch mb-1.5">Nhóm tiêu chuẩn *</label>
            <select
              value={form.group_id}
              onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value }))}
              className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white text-Branch"
            >
              <option value="">-- Chọn nhóm tiêu chuẩn --</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.group_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-Branch mb-1.5">Nội dung quy định (Tiếng Việt)</label>
            <textarea
              value={form.content_vi}
              onChange={(e) => setForm((f) => ({ ...f, content_vi: e.target.value }))}
              rows={3}
              placeholder="Mô tả chi tiết yêu cầu kiểm toán bằng tiếng Việt..."
              className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-Branch mb-1.5">Content (English)</label>
            <textarea
              value={form.content_en}
              onChange={(e) => setForm((f) => ({ ...f, content_en: e.target.value }))}
              rows={3}
              placeholder="Standard description in English..."
              className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-Mist/40 text-Branch text-sm rounded-md hover:bg-Snowflake transition-all">Hủy</button>
            <button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
              {saving ? <Spinner size="sm" /> : null}
              {editTarget ? 'Lưu thay đổi' : 'Tạo tiêu chuẩn'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Ẩn tiêu chuẩn?"
        message={`Tiêu chuẩn "${confirmDelete?.name}" sẽ được đẩy xuống cuối danh sách và khóa lại. Có thể khôi phục sau.`}
        confirmLabel="Ẩn tiêu chuẩn"
        variant="warning"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </MainLayout>
  )
}