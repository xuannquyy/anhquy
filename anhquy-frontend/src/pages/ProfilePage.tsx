import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { User, Lock, Shield, Eye, EyeOff } from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../api'

export default function ProfilePage() {
  const { user, permissions, refreshUserProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const defaultTab = searchParams.get('tab') === 'password' ? 'password' : 'info'

  const [activeTab, setActiveTab] = useState<'info' | 'password' | 'permissions'>(defaultTab as 'info' | 'password' | 'permissions')

  // ─── Info Tab ─────────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [savingInfo, setSavingInfo] = useState(false)

  useEffect(() => { setFullName(user?.full_name || '') }, [user?.full_name])

  const handleSaveInfo = async () => {
    if (!fullName.trim()) { toast.error('Họ tên không được để trống.'); return }
    setSavingInfo(true)
    try {
      await authApi.updateProfile({ full_name: fullName.trim() })
      await refreshUserProfile()
      toast.success('Cập nhật thông tin thành công.')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Cập nhật thất bại.')
    } finally {
      setSavingInfo(false)
    }
  }

  // ─── Password Tab ─────────────────────────────────────────────────────────
  const [oldPw, setOldPw]     = useState('')
  const [newPw, setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [savingPw, setSavingPw] = useState(false)

  const handleChangePassword = async () => {
    if (!oldPw || !newPw || !confirmPw) { toast.error('Vui lòng điền đầy đủ thông tin.'); return }
    if (newPw !== confirmPw) { toast.error('Mật khẩu mới và xác nhận không khớp.'); return }
    if (newPw.length < 8) { toast.error('Mật khẩu mới phải có ít nhất 8 ký tự.'); return }
    setSavingPw(true)
    try {
      await authApi.changePassword(oldPw, newPw)
      toast.success('Đổi mật khẩu thành công.')
      setOldPw(''); setNewPw(''); setConfirmPw('')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Đổi mật khẩu thất bại.')
    } finally {
      setSavingPw(false)
    }
  }

  const PERMISSION_LABELS: Record<string, string> = {
    VIEW_DOC:             'Xem hợp đồng',
    UPLOAD_DOC:           'Tải lên hợp đồng',
    DELETE_DOC:           'Xóa hợp đồng',
    RUN_AI_AUDIT:         'Kích hoạt AI rà soát',
    VIEW_VIOLATION:       'Xem vi phạm',
    APPROVE_VIOLATION:    'Thẩm định vi phạm',
    EXPORT_REPORT:        'Xuất báo cáo',
    VIEW_SUPPLIER:        'Xem nhà cung ứng',
    CREATE_SUPPLIER:      'Thêm nhà cung ứng',
    EDIT_SUPPLIER:        'Sửa nhà cung ứng',
    DELETE_SUPPLIER:      'Xóa nhà cung ứng',
    VIEW_STANDARD:        'Xem tiêu chuẩn',
    CREATE_CUSTOM_STANDARD: 'Tạo tiêu chuẩn riêng',
    MANAGE_SYSTEM_STANDARDS: 'Quản lý tiêu chuẩn gốc',
    MANAGE_CATEGORIES:    'Quản lý danh mục',
    MANAGE_USERS:         'Quản lý người dùng',
    MANAGE_ROLES:         'Quản lý vai trò',
    MANAGE_SYSTEM_CONFIGS: 'Cấu hình hệ thống',
    VIEW_AUDIT_LOGS:      'Xem nhật ký hệ thống',
  }

  const TABS = [
    { key: 'info',        label: 'Thông tin cá nhân', icon: <User className="w-4 h-4" /> },
    { key: 'password',    label: 'Đổi mật khẩu',      icon: <Lock className="w-4 h-4" /> },
    { key: 'permissions', label: 'Quyền hạn',          icon: <Shield className="w-4 h-4" /> },
  ]

  return (
    <MainLayout breadcrumb="Hồ sơ cá nhân">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Avatar header */}
        <div className="bg-white rounded-lg border border-Mist/20 shadow-sm p-6 flex items-center gap-4">
          <div className="w-16 h-16 bg-Pine text-white rounded-lg flex items-center justify-center text-2xl font-bold shadow-sm">
            {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div>
            <h2 className="text-xl font-bold text-Pine">{user?.full_name}</h2>
            <p className="text-sm text-Mist">{user?.email}</p>
            <span className="inline-flex mt-1 items-center px-2.5 py-0.5 rounded-md bg-Pine/8 text-Pine text-xs font-medium border border-Pine/20">
              {user?.role || user?.Roles?.role_name}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-Mist/20 shadow-sm overflow-hidden">
          <div className="flex border-b border-Mist/20">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`flex items-center gap-2 flex-1 justify-center py-3 text-sm font-medium transition-all duration-200
                  ${activeTab === tab.key
                    ? 'text-Pine border-b-2 border-Pine'
                    : 'text-Mist hover:text-Branch'
                  }`}
              >
                {tab.icon}
                <span className="hidden sm:block">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* Tab: Info */}
            {activeTab === 'info' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-Branch mb-1.5">Họ và tên</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine bg-white text-Branch transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-Branch mb-1.5">Email</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full px-3 py-2.5 border border-Mist/20 rounded-md text-sm bg-Snowflake text-Mist cursor-not-allowed"
                  />
                  <p className="text-xs text-Mist mt-1">Email không thể thay đổi</p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveInfo}
                  disabled={savingInfo}
                  className="px-6 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300 flex items-center gap-2"
                >
                  {savingInfo ? <Spinner size="sm" /> : null}
                  Lưu thay đổi
                </button>
              </div>
            )}

            {/* Tab: Password */}
            {activeTab === 'password' && (
              <div className="space-y-4">
                {[
                  { label: 'Mật khẩu hiện tại', val: oldPw, setVal: setOldPw, show: showOld, setShow: setShowOld },
                  { label: 'Mật khẩu mới',      val: newPw, setVal: setNewPw, show: showNew, setShow: setShowNew },
                  { label: 'Xác nhận mật khẩu mới', val: confirmPw, setVal: setConfirmPw, show: showNew, setShow: setShowNew },
                ].map(({ label, val, setVal, show, setShow }) => (
                  <div key={label}>
                    <label className="block text-sm font-medium text-Branch mb-1.5">{label}</label>
                    <div className="relative">
                      <input
                        type={show ? 'text' : 'password'}
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        className="w-full px-3 py-2.5 pr-10 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine bg-white text-Branch transition-all"
                        placeholder={`Nhập ${label.toLowerCase()}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShow(!show)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-Mist hover:text-Branch"
                      >
                        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={savingPw}
                  className="px-6 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300 flex items-center gap-2"
                >
                  {savingPw ? <Spinner size="sm" /> : null}
                  Đổi mật khẩu
                </button>
              </div>
            )}

            {/* Tab: Permissions */}
            {activeTab === 'permissions' && (
              <div>
                <p className="text-sm text-Mist mb-4">Danh sách quyền hạn của tài khoản bạn ({permissions.length} quyền)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {permissions.length === 0 ? (
                    <p className="text-sm text-Mist col-span-2 text-center py-4">Không có quyền nào được cấp</p>
                  ) : (
                    permissions.map((perm) => (
                      <div
                        key={perm}
                        className="flex items-center gap-2 px-3 py-2 bg-Snowflake rounded-md border border-Mist/20"
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                        <span className="text-sm text-Branch">{PERMISSION_LABELS[perm] || perm}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

