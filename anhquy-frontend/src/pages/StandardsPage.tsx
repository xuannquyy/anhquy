import React, { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Plus, Edit2, Trash2, RotateCcw, Lock, Globe, MapPin,
  SlidersHorizontal, Search, Ban, ListChecks, CheckCircle2, Sparkles, ShieldCheck
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
      <div className="space-y-6 pb-16">
        
        {/* 🌟 Header Cao Cấp & Cân Đối */}
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-tr from-Pine via-[#24333D] to-Branch p-8 sm:p-10 text-white shadow-2xl border border-white/10">
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-80 h-80 bg-Berry/35 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-xs font-black border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                RBA 8.0 & VN LAW COMPLIANCE
              </span>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white drop-shadow-sm">
                Bộ Tiêu chuẩn Kiểm Toán
              </h1>
              <p className="text-xs sm:text-sm text-Frostysilver max-w-2xl font-medium leading-relaxed">
                Bật/tắt tiêu chuẩn khi quét AI hoặc bổ sung tiêu chuẩn nội bộ riêng của doanh nghiệp một cách linh hoạt.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
                className="inline-flex items-center gap-2 px-5 py-3.5 bg-white/10 hover:bg-white/20 backdrop-blur-xl text-white border border-white/20 text-xs font-black rounded-2xl transition-all shadow-lg whitespace-nowrap"
              >
                <Globe className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Ngôn ngữ: {lang.toUpperCase()}</span>
              </button>
              {hasPermission('CREATE_CUSTOM_STANDARD') && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-Berry to-[#872B38] hover:brightness-110 text-white text-xs font-black rounded-2xl transition-all shadow-xl shadow-Berry/35 whitespace-nowrap active:scale-95"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  <span>Tạo tiêu chuẩn riêng</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 🌟 Summary Strip (3 Thẻ Thống Kê) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white/95 backdrop-blur-3xl rounded-[2.5rem] border border-white p-6 shadow-[0_15px_45px_rgba(39,54,63,0.06)] flex items-center gap-5 group hover:border-Pine/50 transition-all duration-500">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-Pine via-[#344854] to-[#1A252B] text-white flex items-center justify-center flex-shrink-0 shadow-xl shadow-Pine/30 group-hover:scale-110 transition-transform">
              <ListChecks className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-Mist">Tổng tiêu chuẩn hiển thị</p>
              <p className="text-3xl font-black text-Pine tracking-tight mt-1">{total}</p>
            </div>
          </div>

          <div className="bg-white/95 backdrop-blur-3xl rounded-[2.5rem] border border-white p-6 shadow-[0_15px_45px_rgba(39,54,63,0.06)] flex items-center gap-5 group hover:border-emerald-500/50 transition-all duration-500">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 text-white flex items-center justify-center flex-shrink-0 shadow-xl shadow-emerald-600/30 group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-Mist">Đang bật khi quét AI</p>
              <p className="text-3xl font-black text-emerald-700 tracking-tight mt-1">{activeScanCount}</p>
            </div>
          </div>

          <div className="bg-white/95 backdrop-blur-3xl rounded-[2.5rem] border border-white p-6 shadow-[0_15px_45px_rgba(39,54,63,0.06)] flex items-center gap-5 group hover:border-Berry/50 transition-all duration-500">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-Berry via-[#872B38] to-[#42141B] text-white flex items-center justify-center flex-shrink-0 shadow-xl shadow-Berry/30 group-hover:scale-110 transition-transform">
              <SlidersHorizontal className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-Mist">Đang tạm tắt (Excluded)</p>
              <p className="text-3xl font-black text-Berry tracking-tight mt-1">{excluded.size}</p>
            </div>
          </div>
        </div>

        {/* 🌟 Filter Bar & Cards Grid */}
        <div className="bg-white/95 backdrop-blur-3xl rounded-[2.8rem] border border-white shadow-[0_20px_60px_rgba(39,54,63,0.08)] p-7 space-y-6">
          
          {/* Tab & Filter Bar Cân đối */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-Mist/20 pb-5">
            {/* Pill Tabs */}
            <div className="flex items-center gap-1.5 bg-Snowflake/80 p-1.5 rounded-2xl border border-Mist/20 w-fit">
              {TAB_OPTIONS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setActiveTab(tab.key as typeof activeTab); setPage(1) }}
                  className={`px-4 py-2 text-xs font-black rounded-xl transition-all whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'bg-Pine text-white shadow-md'
                      : 'text-Branch hover:text-Pine'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 flex-1 lg:justify-end">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
                <input
                  type="text"
                  placeholder="Tìm mã hoặc tên tiêu chuẩn..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="w-full pl-11 pr-4 py-3 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-bold bg-Snowflake/40 text-Pine focus:outline-none focus:border-Pine transition-colors shadow-inner"
                />
              </div>
              <select
                value={filterGroup}
                onChange={(e) => { setFilterGroup(e.target.value); setPage(1) }}
                className="px-4 py-3 border border-Mist/30 rounded-2xl text-xs font-black bg-white text-Pine focus:outline-none focus:border-Pine cursor-pointer shadow-2xs"
              >
                <option value="">Tất cả 4 nhóm</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.group_name}</option>)}
              </select>
              <select
                value={filterJurisdiction}
                onChange={(e) => { setFilterJurisdiction(e.target.value); setPage(1) }}
                className="px-4 py-3 border border-Mist/30 rounded-2xl text-xs font-black bg-white text-Pine focus:outline-none focus:border-Pine cursor-pointer shadow-2xs"
              >
                <option value="">Mọi phạm vi</option>
                <option value="Global">Global (RBA)</option>
                <option value="VN">Pháp luật VN</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value as typeof filterStatus); setPage(1) }}
                className="px-4 py-3 border border-Mist/30 rounded-2xl text-xs font-black bg-white text-Pine focus:outline-none focus:border-Pine cursor-pointer shadow-2xs"
              >
                <option value="all">Mọi trạng thái</option>
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Đã lưu trữ</option>
              </select>
            </div>
          </div>

          {/* Cards grid */}
          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : standards.length === 0 ? (
            <EmptyState message="Không tìm thấy tiêu chuẩn nào" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {standards.map((s) => {
                const isExcluded = excluded.has(s.id)
                const isSystem = s.created_by === null
                const canMod = canModifyStandard(s)

                return (
                  <div
                    key={s.id}
                    className={`rounded-3xl border p-6 transition-all duration-300 flex flex-col justify-between gap-4 ${
                      !s.is_active
                        ? 'opacity-60 bg-Snowflake/50 border-Mist/30 cursor-not-allowed'
                        : isExcluded
                        ? 'bg-Snowflake/30 border-Mist/40 border-l-8 border-l-Mist shadow-sm'
                        : 'bg-white border-Mist/25 shadow-md hover:shadow-xl hover:border-Pine/40'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-black text-white bg-Pine px-3 py-1 rounded-xl shadow-xs">
                              {s.standard_code}
                            </span>
                            {s.jurisdiction === 'VN' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-black bg-Berry/10 text-Berry px-2.5 py-1 rounded-xl border border-Berry/20">
                                <MapPin className="w-3 h-3" /> VN Law
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-black bg-Snowflake text-Pine px-2.5 py-1 rounded-xl border border-Mist/30">
                                <Globe className="w-3 h-3" /> Global RBA
                              </span>
                            )}
                            <span
                              className={`text-[11px] px-2.5 py-1 rounded-xl font-black ${
                                s.priority_level === 1
                                  ? 'bg-Berry text-white shadow-2xs'
                                  : 'bg-Frostysilver/50 text-Pine'
                              }`}
                            >
                              {s.priority_level === 1 ? 'Mức 1 · Bắt buộc' : 'Mức 2 · Quan trọng'}
                            </span>
                            {isSystem ? (
                              <span className="text-[11px] bg-Pine/10 text-Pine px-2.5 py-1 rounded-xl font-black">
                                Chuẩn Gốc
                              </span>
                            ) : (
                              <span className="text-[11px] bg-Branch text-white px-2.5 py-1 rounded-xl font-black">
                                Tiêu chuẩn riêng
                              </span>
                            )}
                            {!s.is_active && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-black bg-Berry/10 text-Berry px-2.5 py-1 rounded-xl">
                                <Ban className="w-3 h-3" /> Đã lưu trữ
                              </span>
                            )}
                          </div>
                          <h3 className={`text-sm sm:text-base font-black leading-snug whitespace-normal break-words ${!s.is_active ? 'line-through text-Branch' : 'text-Pine'}`}>
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
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-2xl border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                              isExcluded ? 'bg-Mist' : 'bg-Pine'
                            } ${toggleLoading.has(s.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 rounded-xl bg-white shadow-md transform transition duration-200 ${
                                isExcluded ? 'translate-x-0' : 'translate-x-5'
                              }`}
                            />
                          </button>
                        )}
                      </div>

                      {/* Content */}
                      <p className="text-xs sm:text-sm text-Branch leading-relaxed font-medium line-clamp-3">
                        {parseContent(s.content_i18n, s.description, lang)}
                      </p>

                      {isExcluded && s.is_active && (
                        <p className="text-xs text-Berry font-bold italic flex items-center gap-1.5 bg-Berry/5 p-2 rounded-xl border border-Berry/10">
                          <SlidersHorizontal className="w-3.5 h-3.5 flex-shrink-0" />
                          Đang tạm tắt — AI sẽ bỏ qua tiêu chuẩn này khi quét hợp đồng
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-3 pt-3.5 border-t border-Mist/20">
                      <span className="text-xs font-bold text-Mist truncate">
                        {s.Standard_Groups?.group_name || 'Nhóm tiêu chuẩn'}
                      </span>

                      {s.is_active ? (
                        canMod ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => openEdit(s)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black text-Pine bg-Snowflake hover:bg-Pine hover:text-white rounded-xl transition-all shadow-2xs"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(s)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black text-Berry bg-Berry/10 hover:bg-Berry hover:text-white rounded-xl transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Ẩn
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-black text-Pine/60">Bảo vệ toàn vẹn</span>
                        )
                      ) : (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="inline-flex items-center gap-1 text-xs text-Berry font-bold">
                            <Lock className="w-3.5 h-3.5" /> Đã khóa
                          </span>
                          {canMod && (
                            <button
                              type="button"
                              onClick={() => setConfirmRestore(s)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black text-Pine bg-Snowflake hover:bg-Mist/30 border border-Mist/40 rounded-xl transition-all shadow-2xs cursor-pointer"
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

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        title={editTarget ? 'Chỉnh sửa tiêu chuẩn' : 'Tạo tiêu chuẩn riêng'}
        onClose={() => setModalOpen(false)}
        size="lg"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-2">Mã tiêu chuẩn *</label>
              <input
                type="text"
                disabled={!!editTarget}
                value={form.standard_code}
                onChange={(e) => setForm((f) => ({ ...f, standard_code: e.target.value }))}
                placeholder="CUSTOM-LD-01"
                className="w-full px-4 py-3 border border-Mist/30 rounded-2xl text-xs sm:text-sm focus:outline-none focus:border-Pine bg-white font-mono font-bold disabled:bg-Snowflake shadow-inner"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-2">Phạm vi áp dụng</label>
              <select
                value={form.jurisdiction}
                onChange={(e) => setForm((f) => ({ ...f, jurisdiction: e.target.value }))}
                className="w-full px-4 py-3 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-black focus:outline-none focus:border-Pine bg-white text-Pine shadow-xs cursor-pointer"
              >
                <option value="Global">Global (RBA)</option>
                <option value="VN">Việt Nam</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-2">Mức độ ưu tiên</label>
              <select
                value={form.priority_level}
                onChange={(e) => setForm((f) => ({ ...f, priority_level: e.target.value }))}
                className="w-full px-4 py-3 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-black focus:outline-none focus:border-Pine bg-white text-Pine shadow-xs cursor-pointer"
              >
                <option value="1">Mức 1 – Nghiêm trọng (Bắt buộc)</option>
                <option value="2">Mức 2 – Quan trọng (Khuyến nghị)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-2">Tên tiêu chuẩn *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ví dụ: Quy định phụ cấp ca đêm tối thiểu 35%"
              className="w-full px-4 py-3 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Pine shadow-inner"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-2">Nhóm tiêu chuẩn *</label>
            <select
              value={form.group_id}
              onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value }))}
              className="w-full px-4 py-3 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-black focus:outline-none focus:border-Pine bg-white text-Pine shadow-xs cursor-pointer"
            >
              <option value="">-- Chọn nhóm tiêu chuẩn --</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.group_name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-2">Nội dung quy định (Tiếng Việt)</label>
            <textarea
              value={form.content_vi}
              onChange={(e) => setForm((f) => ({ ...f, content_vi: e.target.value }))}
              rows={3}
              placeholder="Mô tả chi tiết yêu cầu kiểm toán bằng tiếng Việt..."
              className="w-full px-4 py-3 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-medium focus:outline-none focus:border-Pine bg-white text-Pine resize-none shadow-inner"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-Pine mb-2">Content (English)</label>
            <textarea
              value={form.content_en}
              onChange={(e) => setForm((f) => ({ ...f, content_en: e.target.value }))}
              rows={3}
              placeholder="Standard description in English..."
              className="w-full px-4 py-3 border border-Mist/30 rounded-2xl text-xs sm:text-sm font-medium focus:outline-none focus:border-Pine bg-white text-Pine resize-none shadow-inner"
            />
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