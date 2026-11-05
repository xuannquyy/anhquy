import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  ShieldCheck,
  Settings,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Lock,
  Menu,
  X,
  FolderOpen,
  ListChecks,
  Shield,
  ClipboardList,
  ChevronRight,
  Search,
  Upload,
  BarChart3,
  Loader2,
  Activity,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useRealtime } from '../context/RealtimeContext'
import { toast } from 'sonner'
import axiosClient from '../api/axiosClient'

// ─── Types ───────────────────────────────────────────────────────────────────

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
  permission?: string
  group?: string
}

// ─── Nav Items ───────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Bảng điều khiển',
    path: '/dashboard',
    icon: <LayoutDashboard className="w-4 h-4" />,
    group: 'Không gian Kiểm toán',
  },
  {
    label: 'Đối tác Cung ứng',
    path: '/suppliers',
    icon: <Building2 className="w-4 h-4" />,
    permission: 'VIEW_SUPPLIER',
    group: 'Không gian Kiểm toán',
  },
  {
    label: 'Kho Hợp đồng PDF',
    path: '/documents',
    icon: <FileText className="w-4 h-4" />,
    permission: 'VIEW_DOC',
    group: 'Không gian Kiểm toán',
  },
  {
    label: 'Thẩm định Vi phạm',
    path: '/violations',
    icon: <ShieldCheck className="w-4 h-4" />,
    permission: 'VIEW_VIOLATION',
    group: 'Không gian Kiểm toán',
  },
  {
    label: 'Xuất Báo cáo',
    path: '/reports',
    icon: <BarChart3 className="w-4 h-4" />,
    permission: 'EXPORT_REPORT',
    group: 'Không gian Kiểm toán',
  },
  {
    label: 'Bộ Tiêu chuẩn RBA/VN',
    path: '/standards',
    icon: <ListChecks className="w-4 h-4" />,
    permission: 'VIEW_STANDARD',
    group: 'Dữ liệu Nền tảng',
  },
  {
    label: 'Danh mục Hệ thống',
    path: '/categories',
    icon: <FolderOpen className="w-4 h-4" />,
    permission: 'MANAGE_CATEGORIES',
    group: 'Dữ liệu Nền tảng',
  },
  {
    label: 'Quản lý Tài khoản',
    path: '/admin/users',
    icon: <Users className="w-4 h-4" />,
    permission: 'MANAGE_USERS',
    group: 'Quản trị Hệ thống',
  },
  {
    label: 'Ma trận Phân quyền',
    path: '/admin/roles',
    icon: <Shield className="w-4 h-4" />,
    permission: 'MANAGE_ROLES',
    group: 'Quản trị Hệ thống',
  },
  {
    label: 'Tham số & Ngưỡng',
    path: '/admin/system-configs',
    icon: <Settings className="w-4 h-4" />,
    permission: 'MANAGE_SYSTEM_CONFIGS',
    group: 'Quản trị Hệ thống',
  },
  {
    label: 'Nhật ký Bảo mật',
    path: '/admin/audit-logs',
    icon: <ClipboardList className="w-4 h-4" />,
    permission: 'VIEW_AUDIT_LOGS',
    group: 'Quản trị Hệ thống',
  },
  {
    label: 'Kiểm định Hiệu năng AI',
    path: '/system-performance',
    icon: <Activity className="w-4 h-4" />,
    group: 'Không gian Kiểm toán',
  },
]

// ─── Global Search Types ──────────────────────────────────────────────────────

interface SearchSupplier  { id: number; company_name: string; tax_code: string | null; risk_score: number | null }
interface SearchDocument  { id: number; file_name: string; status: string; Suppliers?: { company_name: string } | null }
interface SearchStandard  { id: number; standard_code: string; name: string; jurisdiction: string | null }
interface SearchViolation { id: number; risk_level: string; violation_desc: string; document_id: number; status: string; Documents?: { file_name: string } | null }
interface SearchUser      { id: number; full_name: string | null; email: string; is_active: boolean }
interface SearchConfig    { id: number; config_key: string; config_value: string; description: string | null }
interface SearchAuditLog  { id: number; action_type: string; target_table: string; created_at: string; Users?: { full_name: string | null } | null }

interface SearchResults {
  suppliers:    SearchSupplier[]
  documents:    SearchDocument[]
  standards:    SearchStandard[]
  violations:   SearchViolation[]
  users:        SearchUser[]
  systemConfigs: SearchConfig[]
  auditLogs:    SearchAuditLog[]
}

// ─── Brand Logo (Nổi bật sắc nét trên nền Sunny) ─────────────────────────

function BrandLogo() {
  const [imgError, setImgError] = useState(false)

  return (
    <Link to="/dashboard" className="flex items-center gap-3 group">
      <div className="w-10 h-10 rounded-2xl bg-white shadow-md flex items-center justify-center p-1.5 border border-white group-hover:scale-105 transition-transform duration-300">
        {!imgError ? (
          <img
            src="/logo.png"
            alt="ANHQUY"
            onError={() => setImgError(true)}
            className="w-full h-full object-contain"
          />
        ) : (
          <ShieldCheck className="w-6 h-6 text-Merlot" />
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="font-extrabold text-xl tracking-widest text-Pine leading-none">
          ANHQUY
        </span>
        <span className="w-2 h-2 rounded-full bg-Merlot" />
      </div>
    </Link>
  )
}

// ─── Sidebar (Nền Sunny kết hợp chữ Pine & điểm nhấn Merlot) ─────────────

function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const { hasPermission, role, user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const filteredNav = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(item.permission)
  )

  const groups = Array.from(new Set(filteredNav.map((i) => i.group || 'Chung')))

  const roleBadge =
    role === 'Admin'
      ? { label: 'Quản trị viên', cls: 'bg-Merlot text-white' }
      : role === 'Manager'
      ? { label: 'Manager', cls: 'bg-Pine text-white' }
      : { label: 'User', cls: 'bg-Branch text-white' }

  const handleLogout = () => {
    logout()
    toast.success('Đã đăng xuất khỏi phiên làm việc.')
    navigate('/login')
  }

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-Pine/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Floating Island Sidebar trên nền Sunny */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 md:w-[256px] md:h-[calc(100vh-24px)] md:my-3 md:ml-3 bg-[#FAF8F5] text-Pine z-40 flex flex-col md:rounded-xl border border-white/70 shadow-[0_18px_45px_rgba(39,54,63,0.18)]
          transform transition-transform duration-300 ease-in-out overflow-hidden
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:relative md:z-auto`}
      >
        {/* Ánh sáng trắng dịu ở góc trên */}
        <div
          className="pointer-events-none absolute -top-20 -right-20 w-44 h-44 rounded-full opacity-40 blur-2xl"
          style={{ background: 'radial-gradient(circle, #FFFFFF 0%, transparent 70%)' }}
        />

        {/* Top Brand */}
        <div className="relative z-10 flex items-center justify-between px-5 py-5 border-b border-Pine/10">
          <BrandLogo />
          <button
            type="button"
            onClick={onClose}
            className="md:hidden text-Pine/70 hover:text-Merlot transition-colors p-1 rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="relative z-10 flex-1 overflow-y-auto py-4 px-3.5 space-y-5">
          {groups.map((grp) => (
            <div key={grp}>
              {/* Tiêu đề nhóm đậm nét, không bị chìm */}
              <div className="flex items-center gap-1.5 px-3 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-Merlot/80" />
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-Pine/75">
                  {grp}
                </p>
              </div>

              <div className="space-y-1.5">
                {filteredNav
                  .filter((i) => (i.group || 'Chung') === grp)
                  .map((item) => {
                    const isActive =
                      location.pathname === item.path ||
                      location.pathname.startsWith(item.path + '/')
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => window.innerWidth < 768 && onClose()}
                        className={`group flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all duration-200
                          ${
                            isActive
                              ? 'bg-Sunny text-Merlot shadow-[0_8px_20px_rgba(39,54,63,0.14)] border border-white'
                              : 'text-Pine hover:bg-[#F5E1BE] hover:text-Pine'
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`p-1.5 rounded-xl transition-all duration-200 ${
                              isActive
                                ? 'bg-Merlot text-white shadow-sm'
                                : 'bg-white/65 text-Pine border border-white/80 shadow-sm group-hover:bg-Merlot group-hover:text-white group-hover:border-Merlot'
                            }`}
                          >
                            {item.icon}
                          </span>
                          <span>{item.label}</span>
                        </div>
                        {isActive && <ChevronRight className="w-4 h-4 text-Merlot" />}
                      </Link>
                    )
                  })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom User Profile Card (Thẻ kính trắng nổi bật trên nền Sunny) */}
        <div className="relative z-10 p-3.5 border-t border-Pine/10 bg-white/30 backdrop-blur-md">
          <div className="p-3 rounded-2xl bg-white/85 border border-white shadow-sm flex items-center justify-between gap-2">
            <Link to="/profile" className="flex items-center gap-3 min-w-0 flex-1 group">
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-2xl bg-Pine text-white font-extrabold text-sm flex items-center justify-center shadow-sm group-hover:bg-Merlot transition-colors">
                  {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-Merlot border-2 border-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold text-Pine truncate">
                  {user?.full_name || 'Người dùng'}
                </p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${roleBadge.cls}`}>
                  {roleBadge.label}
                </span>
              </div>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              title="Đăng xuất"
              className="p-2 text-Pine/70 hover:text-white hover:bg-Merlot rounded-xl transition-colors flex-shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

// ─── Notification Bell ────────────────────────────────────────────────────────

function NotificationBell() {
  const { notifications, unreadCount, markAllRead, markRead } = useRealtime()
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-10 h-10 flex items-center justify-center text-Pine bg-white hover:bg-Snowflake/60 rounded-2xl border border-Mist/30 shadow-sm transition-all duration-200"
        title="Thông báo thời gian thực"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-Merlot text-white text-[10px] font-extrabold rounded-full flex items-center justify-center shadow-md border-2 border-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-80 bg-white rounded-2xl shadow-[0_20px_50px_rgba(39,54,63,0.2)] border border-Mist/30 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 bg-Pine text-white">
            <span className="font-extrabold text-xs uppercase tracking-wider">Thông báo hệ thống</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] text-Frostysilver hover:text-white underline"
              >
                Đánh dấu đã đọc
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-Mist/15">
            {notifications.length === 0 ? (
              <p className="text-xs text-Mist text-center py-10">Chưa có thông báo mới</p>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    markRead(n.id)
                    if (n.documentId) {
                      setIsOpen(false)
                      navigate(`/audit/${n.documentId}`)
                    }
                  }}
                  className={`px-4 py-3 cursor-pointer hover:bg-Snowflake/50 transition-colors ${
                    !n.read ? 'bg-Snowflake/40 border-l-4 border-l-Merlot' : ''
                  }`}
                >
                  <p className={`text-xs font-bold ${!n.read ? 'text-Pine' : 'text-Branch'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-Mist mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-Mist/70 mt-1">
                    {new Date(n.timestamp).toLocaleTimeString('vi-VN')}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Global Search Bar (Debounce + Dropdown Popup) ───────────────────────────

// Map từ nhóm kết quả → đường dẫn điều hướng
const RESULT_ROUTES: Record<string, string> = {
  suppliers:    '/suppliers',
  documents:    '/documents',
  standards:    '/standards',
  violations:   '/violations',
  users:        '/admin/users',
  systemConfigs: '/admin/system-configs',
  auditLogs:    '/admin/audit-logs',
}

// Nhãn tiếng Việt cho từng nhóm
const GROUP_LABELS: Record<string, string> = {
  suppliers:    'Đối tác Cung ứng',
  documents:    'Hợp đồng PDF',
  standards:    'Tiêu chuẩn',
  violations:   'Vi phạm',
  users:        'Người dùng',
  systemConfigs: 'Cấu hình Hệ thống',
  auditLogs:   'Nhật ký Bảo mật',
}

function getResultLabel(group: string, item: Record<string, unknown>): string {
  switch (group) {
    case 'suppliers':    return (item['company_name'] as string) || ''
    case 'documents':    return (item['file_name'] as string) || ''
    case 'standards':    return `[${item['standard_code']}] ${item['name']}`
    case 'violations':   return (item['violation_desc'] as string)?.substring(0, 60) + '...' || ''
    case 'users':        return `${item['full_name'] || item['email']} · ${item['email']}`
    case 'systemConfigs': return `${item['config_key']}: ${item['config_value']}`
    case 'auditLogs':   return `${item['action_type']} › ${item['target_table']}`
    default: return ''
  }
}

function getDetailRoute(group: string, _item: Record<string, unknown>): string {
  // Tất cả các nhóm đều điều hướng về trang quản lý tương ứng của nó
  return RESULT_ROUTES[group] || '/'
}

function GlobalSearchBar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Gọi API search với debounce 300ms
  const doSearch = useCallback(async (kw: string) => {
    if (!kw.trim()) {
      setResults(null)
      setOpen(false)
      return
    }
    setLoading(true)
    setOpen(true)
    try {
      const res = await axiosClient.get<SearchResults>('/search', { params: { q: kw } })
      setResults(res.data)
    } catch {
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  const handleSelect = (group: string, item: Record<string, unknown>) => {
    const route = getDetailRoute(group, item)
    navigate(route)
    setQuery('')
    setResults(null)
    setOpen(false)
  }

  const handleGroupNav = (group: string) => {
    navigate(RESULT_ROUTES[group] || '/')
    setQuery('')
    setResults(null)
    setOpen(false)
  }

  // Kiểm tra có nhóm nào có kết quả không
  const hasAnyResult = results
    ? Object.values(results).some((arr) => Array.isArray(arr) && arr.length > 0)
    : false

  return (
    <div className="relative hidden lg:flex items-center w-80" ref={wrapperRef}>
      {/* Input */}
      <div className="relative w-full">
        {loading
          ? <Loader2 className="w-4 h-4 text-Mist absolute left-3.5 top-1/2 -translate-y-1/2 animate-spin" />
          : <Search className="w-4 h-4 text-Mist absolute left-3.5 top-1/2 -translate-y-1/2" />
        }
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => { if (results && query.trim()) setOpen(true) }}
          placeholder="Tìm nhanh hợp đồng, đối tác, tiêu chuẩn..."
          className="w-full pl-9 pr-4 py-2 text-xs font-medium bg-Snowflake/60 hover:bg-Snowflake focus:bg-white border border-Mist/30 rounded-2xl text-Pine placeholder-Branch/60 focus:outline-none focus:border-Pine transition-all"
          autoComplete="off"
        />
      </div>

      {/* Dropdown Popup */}
      {open && query.trim() && (
        <div className="absolute top-[calc(100%+8px)] left-0 w-[420px] max-h-[480px] overflow-y-auto bg-white rounded-2xl shadow-[0_20px_60px_rgba(39,54,63,0.22)] border border-Mist/30 z-[60]">
          {loading && !results && (
            <div className="flex items-center justify-center py-10 gap-2 text-Mist text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang tìm kiếm...
            </div>
          )}

          {!loading && !hasAnyResult && results && (
            <div className="py-10 text-center text-xs text-Mist">
              Không tìm thấy kết quả nào cho &quot;{query}&quot;
            </div>
          )}

          {results && hasAnyResult && (
            <div className="py-2">
              {(Object.keys(results) as Array<keyof SearchResults>).map((group) => {
                const items = results[group] as unknown as Record<string, unknown>[]
                if (!items || items.length === 0) return null
                return (
                  <div key={group} className="mb-1">
                    {/* Tiêu đề nhóm */}
                    <div className="flex items-center justify-between px-4 py-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-Pine/60">
                        {GROUP_LABELS[group] || group}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleGroupNav(group)}
                        className="text-[10px] font-bold text-Merlot hover:underline"
                      >
                        Xem tất cả →
                      </button>
                    </div>

                    {/* Các kết quả trong nhóm */}
                    {items.map((item) => (
                      <button
                        key={item['id'] as number}
                        type="button"
                        onClick={() => handleSelect(group, item)}
                        className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-Snowflake/60 transition-colors"
                      >
                        {/* Icon nhóm */}
                        <span className="w-7 h-7 rounded-xl bg-Pine/8 text-Pine flex items-center justify-center flex-shrink-0">
                          {group === 'suppliers'    && <Building2 className="w-3.5 h-3.5" />}
                          {group === 'documents'    && <FileText className="w-3.5 h-3.5" />}
                          {group === 'standards'    && <ListChecks className="w-3.5 h-3.5" />}
                          {group === 'violations'   && <ShieldCheck className="w-3.5 h-3.5" />}
                          {group === 'users'        && <Users className="w-3.5 h-3.5" />}
                          {group === 'systemConfigs' && <Settings className="w-3.5 h-3.5" />}
                          {group === 'auditLogs'   && <ClipboardList className="w-3.5 h-3.5" />}
                        </span>

                        {/* Label chính */}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-Branch truncate">
                            {getResultLabel(group, item)}
                          </p>
                          {/* Sub-label tùy nhóm */}
                          {group === 'suppliers' && (
                            <p className="text-[10px] text-Mist mt-0.5">
                              MST: {(item['tax_code'] as string | null) || '—'}
                              {item['risk_score'] !== null && ` · Điểm rủi ro: ${item['risk_score']}`}
                            </p>
                          )}
                          {group === 'documents' && (
                            <p className="text-[10px] text-Mist mt-0.5">
                              {(item['Suppliers'] as { company_name: string } | null)?.company_name || '—'}
                              {' · '}
                              <span className={`font-semibold ${
                                item['status'] === 'Analyzed' ? 'text-SafeGreen'
                                : item['status'] === 'Analyzing' ? 'text-Berry'
                                : 'text-Mist'
                              }`}>{item['status'] as string}</span>
                            </p>
                          )}
                          {group === 'violations' && (
                            <p className="text-[10px] mt-0.5 font-semibold">
                              <span className={`${
                                item['risk_level'] === 'High' ? 'text-Berry'
                                : item['risk_level'] === 'Medium' ? 'text-[#C08000]'
                                : 'text-Mist'
                              }`}>{item['risk_level'] as string}</span>
                              {' · '}
                              <span className="text-Mist">
                                {(item['Documents'] as { file_name: string } | null)?.file_name || '—'}
                              </span>
                            </p>
                          )}
                          {group === 'auditLogs' && (
                            <p className="text-[10px] text-Mist mt-0.5">
                              {(item['Users'] as { full_name: string | null } | null)?.full_name || '—'}
                              {' · '}
                              {new Date(item['created_at'] as string).toLocaleString('vi-VN')}
                            </p>
                          )}
                        </div>

                        <ChevronRight className="w-3.5 h-3.5 text-Mist flex-shrink-0" />
                      </button>
                    ))}

                    {/* Divider giữa các nhóm */}
                    <div className="mx-4 mt-1 border-t border-Mist/10" />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

function Topbar({
  onMenuClick,
  breadcrumb,
}: {
  onMenuClick: () => void
  breadcrumb: string
}) {
  const { user, logout, role, hasPermission } = useAuth()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    logout()
    toast.success('Đã đăng xuất khỏi phiên làm việc.')
    navigate('/login')
  }

  return (
    <header className="mx-3 mt-3 mb-1 px-4 md:px-6 py-3 bg-white/90 backdrop-blur-xl rounded-2xl border border-white shadow-[0_8px_24px_rgba(39,54,63,0.06)] flex items-center justify-between sticky top-3 z-20">
      {/* Left: menu + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden p-2 text-Pine hover:bg-Snowflake rounded-xl transition-all"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-Mist">
            <span>ANHQUY</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-Merlot font-extrabold">{role}</span>
          </div>
          <h2 className="text-sm sm:text-base font-extrabold text-Pine tracking-tight leading-tight">
            {breadcrumb}
          </h2>
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <GlobalSearchBar />

      {/* Right: Quick Action + Bell + Profile */}
      <div className="flex items-center gap-2.5">
        {hasPermission('UPLOAD_DOC') && (
          <Link
            to="/documents"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-Pine text-white text-xs font-bold shadow-sm hover:bg-Merlot transition-all"
          >
            <Upload className="w-3.5 h-3.5 text-Frostysilver" />
            <span>Tải Hợp đồng</span>
          </Link>
        )}

        <NotificationBell />

        {/* Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-2xl border border-Mist/30 bg-white hover:bg-Snowflake/50 shadow-sm transition-all duration-200"
          >
            <div className="w-8 h-8 bg-Pine text-white rounded-xl flex items-center justify-center text-xs font-extrabold">
              {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-extrabold text-Pine leading-none max-w-[120px] truncate">
                {user?.full_name || 'Người dùng'}
              </p>
              <p className="text-[10px] font-bold text-Merlot mt-0.5">{role}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-Mist" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2.5 w-56 bg-white rounded-2xl shadow-[0_20px_50px_rgba(39,54,63,0.2)] border border-Mist/30 z-50 py-1.5 overflow-hidden">
              <div className="px-4 py-3 border-b border-Mist/15 bg-Snowflake/50">
                <p className="text-xs font-extrabold text-Pine truncate">{user?.full_name}</p>
                <p className="text-[11px] text-Branch truncate">{user?.email}</p>
              </div>
              <Link
                to="/profile"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-Branch hover:bg-Snowflake/60 transition-colors"
              >
                <User className="w-4 h-4 text-Pine" />
                Hồ sơ & Quyền hạn
              </Link>
              <Link
                to="/profile?tab=password"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-Branch hover:bg-Snowflake/60 transition-colors"
              >
                <Lock className="w-4 h-4 text-Pine" />
                Đổi mật khẩu bảo mật
              </Link>
              <div className="border-t border-Mist/15 mt-1 pt-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-extrabold text-Merlot hover:bg-Merlot/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Đăng xuất
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

// ─── MainLayout ───────────────────────────────────────────────────────────────

interface MainLayoutProps {
  children: React.ReactNode
  breadcrumb?: string
}

export function MainLayout({ children, breadcrumb = 'Bảng điều khiển' }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-Snowflake via-[#D3DCE6] to-Mist/35">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} breadcrumb={breadcrumb} />
        <main className="flex-1 overflow-y-auto px-3 md:px-6 py-4">{children}</main>
      </div>
    </div>
  )
}
