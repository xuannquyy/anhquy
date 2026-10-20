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

// ─── Nav Items (Khớp 100% với Routes trong App.tsx) ──────────────────────────

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Tổng quan',
    path: '/dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    group: 'Nghiệp vụ Kiểm toán',
  },
  {
    label: 'Nhà cung ứng',
    path: '/suppliers',
    icon: <Building2 className="w-5 h-5" />,
    permission: 'VIEW_SUPPLIER',
    group: 'Nghiệp vụ Kiểm toán',
  },
  {
    label: 'Kho hợp đồng PDF',
    path: '/documents',
    icon: <FileText className="w-5 h-5" />,
    permission: 'VIEW_DOC',
    group: 'Nghiệp vụ Kiểm toán',
  },
  {
    label: 'Vi phạm & Báo cáo',
    path: '/violations',
    icon: <ShieldCheck className="w-5 h-5" />,
    permission: 'VIEW_VIOLATION',
    group: 'Nghiệp vụ Kiểm toán',
  },
  {
    label: 'Bộ tiêu chuẩn RBA/VN',
    path: '/standards',
    icon: <ListChecks className="w-5 h-5" />,
    permission: 'VIEW_STANDARD',
    group: 'Dữ liệu Nền tảng',
  },
  {
    label: 'Danh mục Hệ thống',
    path: '/categories',
    icon: <FolderOpen className="w-5 h-5" />,
    permission: 'MANAGE_CATEGORIES',
    group: 'Dữ liệu Nền tảng',
  },
  {
    label: 'Quản lý Người dùng',
    path: '/admin/users',
    icon: <Users className="w-5 h-5" />,
    permission: 'MANAGE_USERS',
    group: 'Quản trị Hệ thống',
  },
  {
    label: 'Ma trận Phân quyền',
    path: '/admin/roles',
    icon: <Shield className="w-5 h-5" />,
    permission: 'MANAGE_ROLES',
    group: 'Quản trị Hệ thống',
  },
  {
    label: 'Cấu hình & Ngưỡng',
    path: '/admin/system-configs',
    icon: <Settings className="w-5 h-5" />,
    permission: 'MANAGE_SYSTEM_CONFIGS',
    group: 'Quản trị Hệ thống',
  },
  {
    label: 'Nhật ký Kiểm toán',
    path: '/admin/audit-logs',
    icon: <ClipboardList className="w-5 h-5" />,
    permission: 'VIEW_AUDIT_LOGS',
    group: 'Quản trị Hệ thống',
  },
]

// ─── Brand Logo (Hỗ trợ file logo.png hoặc icon fallback) ────────────────────

function BrandLogo() {
  const [imgError, setImgError] = useState(false)

  return (
    <div className="flex items-center gap-2.5">
      {!imgError ? (
        <img
          src="/logo.png"
          alt="ANHQUY Logo"
          onError={() => setImgError(true)}
          className="w-8 h-8 object-contain rounded-md bg-white/10 p-0.5"
        />
      ) : (
        <ShieldCheck className="w-7 h-7 text-Frostysilver" />
      )}
      <div>
        <span className="font-bold text-lg tracking-tight block leading-none">ANHQUY</span>
        <span className="text-[11px] text-white/50">AI Kiểm toán Hợp đồng</span>
      </div>
    </div>
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
  const { hasPermission, role } = useAuth()
  const location = useLocation()

  const filteredNav = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(item.permission)
  )

  const groups = Array.from(new Set(filteredNav.map((i) => i.group || 'Chung')))

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-Pine/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-Pine text-white z-40 flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:relative md:z-auto`}
      >
        {/* Logo */}
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

        {/* Role badge */}
        <div className="px-5 py-3 border-b border-white/10">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-white/10 text-Frostysilver">
            {role === 'Admin'
              ? 'Quản trị viên (Admin)'
              : role === 'Manager'
              ? 'Quản lý Pháp chế (Manager)'
              : 'Chuyên viên Kiểm toán (User)'}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
          {groups.map((grp) => (
            <div key={grp}>
              <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40">
                {grp}
              </p>
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
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-md mb-1 text-sm font-medium transition-all duration-200
                        ${
                          isActive
                            ? 'bg-white/15 text-white shadow-sm'
                            : 'text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                      <span className={isActive ? 'text-Frostysilver' : 'text-white/50'}>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  )
                })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 text-xs text-white/30 text-center">
          ANHQUY v1.0 · RBA & VN Law Compliant
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
        className="relative p-2 text-Mist hover:text-Pine rounded-md hover:bg-Snowflake transition-all duration-200"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-Berry text-white text-[10px] font-bold rounded-md flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-Mist/20 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-Mist/20">
            <span className="font-semibold text-Pine text-sm">Thông báo Thời gian thực</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-Mist hover:text-Pine transition-colors"
              >
                Đánh dấu đã đọc
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-Mist text-center py-8">Không có thông báo mới</p>
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
                  className={`px-4 py-3 border-b border-Mist/10 cursor-pointer hover:bg-Snowflake transition-colors ${
                    !n.read ? 'bg-Pine/5' : ''
                  }`}
                >
                  <p className={`text-sm font-medium ${!n.read ? 'text-Pine' : 'text-Branch'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-Mist mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-xs text-Mist/60 mt-1">
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
    toast.success('Đã đăng xuất thành công.')
    navigate('/login')
  }

  return (
    <header className="h-16 bg-white border-b border-Mist/20 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20 shadow-sm">
      {/* Left: menu + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden p-2 text-Mist hover:text-Pine rounded-md hover:bg-Snowflake transition-all"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-Mist hidden sm:block">ANHQUY</span>
          <span className="text-Mist hidden sm:block">/</span>
          <span className="font-medium text-Pine">{breadcrumb}</span>
        </div>
      </div>

      {/* Right: bell + profile */}
      <div className="flex items-center gap-2">
        <NotificationBell />

        {/* Role badge */}
        <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-Pine/8 text-Pine border border-Pine/20">
          {role}
        </span>

        {/* Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-Snowflake transition-all duration-200"
          >
            <div className="w-7 h-7 bg-Pine text-white rounded-md flex items-center justify-center text-xs font-bold">
              {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <span className="hidden sm:block text-sm font-medium text-Branch max-w-[140px] truncate">
              {user?.full_name || 'Người dùng'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-Mist" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-Mist/20 z-50 py-1 overflow-hidden">
              <div className="px-3 py-2 border-b border-Mist/10">
                <p className="text-sm font-medium text-Pine truncate">{user?.full_name}</p>
                <p className="text-xs text-Mist truncate">{user?.email}</p>
              </div>
              <Link
                to="/profile"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-Branch hover:bg-Snowflake transition-colors"
              >
                <User className="w-4 h-4 text-Mist" />
                Hồ sơ cá nhân
              </Link>
              <Link
                to="/profile?tab=password"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-Branch hover:bg-Snowflake transition-colors"
              >
                <Lock className="w-4 h-4 text-Mist" />
                Đổi mật khẩu
              </Link>
              <div className="border-t border-Mist/10 mt-1 pt-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-Berry hover:bg-Berry/5 transition-colors"
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

export function MainLayout({ children, breadcrumb = 'Trang chủ' }: MainLayoutProps) {
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