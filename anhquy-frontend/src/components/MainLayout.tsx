import React, { useState, useRef } from 'react'
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
  Sparkles,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useRealtime } from '../context/RealtimeContext'
import { toast } from 'sonner'

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
    label: 'Thẩm định & Báo cáo',
    path: '/violations',
    icon: <ShieldCheck className="w-4 h-4" />,
    permission: 'VIEW_VIOLATION',
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
]

// ─── Brand Logo (Đế trắng nổi bật tuyệt đối trên nền Pine) ───────────────────

function BrandLogo() {
  const [imgError, setImgError] = useState(false)

  return (
    <Link to="/dashboard" className="flex items-center gap-3 group">
      <div className="w-10 h-10 rounded-lg bg-white shadow-md flex items-center justify-center p-1.5 border border-Frostysilver/50 group-hover:scale-105 transition-transform duration-200">
        {!imgError ? (
          <img
            src="/logo.png"
            alt="ANHQUY Logo"
            onError={() => setImgError(true)}
            className="w-full h-full object-contain"
          />
        ) : (
          <ShieldCheck className="w-6 h-6 text-Pine" />
        )}
      </div>
      <div>
        <span className="font-extrabold text-lg tracking-tight text-white block leading-none">
          ANHQUY
        </span>
        <span className="text-[11px] font-medium text-Frostysilver block mt-1">
          AI Supply Chain Audit
        </span>
      </div>
    </Link>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const { hasPermission, role, user } = useAuth()
  const location = useLocation()

  const filteredNav = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(item.permission)
  )

  const groups = Array.from(new Set(filteredNav.map((i) => i.group || 'Chung')))

  const roleConfig =
    role === 'Admin'
      ? { label: 'Quản trị viên Hệ thống', dot: 'bg-Berry', badge: 'bg-Berry/30 text-white border-Berry/50' }
      : role === 'Manager'
      ? { label: 'Quản lý Pháp chế', dot: 'bg-emerald-400', badge: 'bg-white/10 text-Frostysilver border-white/15' }
      : { label: 'Chuyên viên Kiểm toán', dot: 'bg-sky-400', badge: 'bg-white/10 text-Frostysilver border-white/15' }

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-Pine/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-Pine text-white z-40 flex flex-col border-r border-white/10 shadow-lg
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:relative md:z-auto`}
      >
        {/* Top Brand */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <BrandLogo />
          <button
            type="button"
            onClick={onClose}
            className="md:hidden text-white/60 hover:text-white transition-colors p-1 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role status pill */}
        <div className="px-4 py-3 border-b border-white/10 bg-black/10">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-semibold ${roleConfig.badge}`}>
            <span className={`w-2 h-2 rounded-sm ${roleConfig.dot} animate-pulse`} />
            <span className="truncate">{roleConfig.label}</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {groups.map((grp) => (
            <div key={grp}>
              <p className="px-3 mb-2 text-[10px] font-extrabold uppercase tracking-widest text-Mist/70">
                {grp}
              </p>
              <div className="space-y-1">
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
                        className={`group flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-semibold transition-all duration-200
                          ${
                            isActive
                              ? 'bg-gradient-to-r from-white/20 to-white/5 text-white border-l-4 border-Frostysilver shadow-sm'
                              : 'text-Snowflake/70 hover:bg-white/10 hover:text-white'
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={isActive ? 'text-Frostysilver' : 'text-Mist group-hover:text-white transition-colors'}>
                            {item.icon}
                          </span>
                          <span>{item.label}</span>
                        </div>
                        {isActive && <ChevronRight className="w-3.5 h-3.5 text-Frostysilver" />}
                      </Link>
                    )
                  })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom User Quick Card (Thay thế cho dòng chữ v1.0 cũ kỹ) */}
        <div className="p-3 border-t border-white/10 bg-black/15">
          <Link
            to="/profile"
            className="flex items-center gap-3 p-2 rounded-md hover:bg-white/10 transition-colors"
          >
            <div className="w-8 h-8 rounded-md bg-Frostysilver text-Pine font-extrabold text-xs flex items-center justify-center flex-shrink-0">
              {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">{user?.full_name || 'Người dùng'}</p>
              <p className="text-[11px] text-Mist truncate">{user?.email}</p>
            </div>
            <Settings className="w-3.5 h-3.5 text-Mist flex-shrink-0" />
          </Link>
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
        className="relative p-2 text-Pine hover:bg-Snowflake rounded-md border border-transparent hover:border-Mist/30 transition-all duration-200"
        title="Thông báo thời gian thực"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-Berry text-white text-[10px] font-bold rounded-md flex items-center justify-center shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-Mist/30 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-Pine text-white">
            <span className="font-bold text-xs uppercase tracking-wider">Thông báo Realtime</span>
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
              <p className="text-xs text-Mist text-center py-8">Chưa có thông báo mới</p>
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
                  className={`px-4 py-3 cursor-pointer hover:bg-Snowflake/60 transition-colors ${
                    !n.read ? 'bg-Pine/5 border-l-2 border-l-Berry' : ''
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

// ─── Topbar ───────────────────────────────────────────────────────────────────

function Topbar({
  onMenuClick,
  breadcrumb,
}: {
  onMenuClick: () => void
  breadcrumb: string
}) {
  const { user, logout, role } = useAuth()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  React.useEffect(() => {
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
    <header className="h-16 bg-white/90 backdrop-blur-md border-b border-Mist/25 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20 shadow-sm">
      {/* Left: menu + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden p-2 text-Pine hover:bg-Snowflake rounded-md transition-all"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <span className="font-bold text-Mist hidden sm:inline"> Không gian làm việc</span>
          <ChevronRight className="w-4 h-4 text-Mist hidden sm:inline" />
          <span className="font-extrabold text-Pine tracking-tight">{breadcrumb}</span>
        </div>
      </div>

      {/* Right: AI Engine status + bell + profile */}
      <div className="flex items-center gap-2.5">
        {/* AI Engine Live Status Badge */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-Snowflake/70 border border-Mist/30 text-xs font-semibold text-Pine">
          <Sparkles className="w-3.5 h-3.5 text-Berry" />
          <span>AI Engine:</span>
          <span className="text-emerald-700 font-bold">Sẵn sàng</span>
        </div>

        <NotificationBell />

        {/* Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-md border border-Mist/30 bg-white hover:bg-Snowflake/60 transition-all duration-200"
          >
            <div className="w-7 h-7 bg-Pine text-white rounded-md flex items-center justify-center text-xs font-extrabold">
              {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-Pine leading-none max-w-[130px] truncate">
                {user?.full_name || 'Người dùng'}
              </p>
              <p className="text-[10px] font-semibold text-Mist mt-0.5">{role}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-Mist" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-Mist/30 z-50 py-1.5 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-Mist/15 bg-Snowflake/40">
                <p className="text-xs font-bold text-Pine truncate">{user?.full_name}</p>
                <p className="text-[11px] text-Mist truncate">{user?.email}</p>
              </div>
              <Link
                to="/profile"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-Branch hover:bg-Snowflake transition-colors"
              >
                <User className="w-4 h-4 text-Pine" />
                Hồ sơ & Quyền hạn cá nhân
              </Link>
              <Link
                to="/profile?tab=password"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-Branch hover:bg-Snowflake transition-colors"
              >
                <Lock className="w-4 h-4 text-Pine" />
                Đổi mật khẩu bảo mật
              </Link>
              <div className="border-t border-Mist/15 mt-1 pt-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-xs font-bold text-Berry hover:bg-Berry/10 transition-colors"
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
    <div className="flex h-screen overflow-hidden bg-Snowflake">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} breadcrumb={breadcrumb} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}