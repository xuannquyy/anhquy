import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { User, Lock, Shield, Eye, EyeOff, CheckCircle2, Mail, KeyRound } from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../api'

const PERMISSION_LABELS: Record<string, string> = {
  VIEW_DOC:                'Xem kho hợp đồng PDF',
  UPLOAD_DOC:              'Tải lên hợp đồng mới',
  DELETE_DOC:              'Xóa hợp đồng tải nhầm',
  RUN_AI_AUDIT:            'Kích hoạt AI RAG rà soát',
  VIEW_VIOLATION:          'Xem danh sách vi phạm',
  APPROVE_VIOLATION:       'Phê duyệt / Bác bỏ vi phạm',
  EXPORT_REPORT:           'Kết xuất báo cáo kiểm toán',
  VIEW_SUPPLIER:           'Xem hồ sơ nhà cung ứng',
  CREATE_SUPPLIER:         'Thêm nhà cung ứng mới',
  EDIT_SUPPLIER:           'Cập nhật & Khôi phục đối tác',
  DELETE_SUPPLIER:         'Xóa mềm nhà cung ứng',
  VIEW_STANDARD:           'Xem bộ tiêu chuẩn RBA/VN',
  CREATE_CUSTOM_STANDARD:  'Tạo tiêu chuẩn nội bộ riêng',
  MANAGE_SYSTEM_STANDARDS: 'Quản trị 24 tiêu chuẩn gốc',
  MANAGE_CATEGORIES:       'Quản lý danh mục hệ thống',
  MANAGE_USERS:            'Quản lý tài khoản người dùng',
  MANAGE_ROLES:            'Điều chỉnh ma trận phân quyền',
  MANAGE_SYSTEM_CONFIGS:   'Cấu hình tham số & ngưỡng rủi ro',
  VIEW_AUDIT_LOGS:         'Tra cứu nhật ký bảo mật',
}

export default function ProfilePage() {
  const { user, role, permissions, refreshUserProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const defaultTab = searchParams.get('tab') === 'password' ? 'password' : 'info'

  const [activeTab, setActiveTab] = useState<'info' | 'password' | 'permissions'>(
    defaultTab as 'info' | 'password' | 'permissions'
  )

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
      toast.success('Cập nhật thông tin hồ sơ thành công.')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Cập nhật thất bại.')
    } finally {
      setSavingInfo(false)
    }
  }

  // ─── Password Tab ─────────────────────────────────────────────────────────
  const [oldPw, setOldPw]             = useState('')
  const [newPw, setNewPw]             = useState('')
  const [confirmPw, setConfirmPw]     = useState('')
  const [showOld, setShowOld]         = useState(false)
  const [showNew, setShowNew]         = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [savingPw, setSavingPw]       = useState(false)

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

  const TABS = [
    { key: 'info',        label: 'Thông tin cá nhân', icon: <User className="w-4 h-4" /> },
    { key: 'password',    label: 'Đổi mật khẩu',      icon: <Lock className="w-4 h-4" /> },
    { key: 'permissions', label: `Quyền hạn (${permissions.length})`, icon: <Shield className="w-4 h-4" /> },
  ]

  return (
    <MainLayout breadcrumb="Hồ sơ & Bảo mật">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ─── Cột Trái (4 cột): Thẻ Nhận diện Cá nhân ─────────────────────── */}
        <div className="lg:col-span-4">
          <div className="bg-gradient-to-b from-Pine via-[#2E404B] to-Pine rounded-3xl p-6 text-white shadow-[0_14px_34px_rgba(39,54,63,0.2)] relative overflow-hidden">
            <div
              className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full opacity-25 blur-2xl"
              style={{ background: 'radial-gradient(circle, #6B212C 0%, transparent 70%)' }}
            />
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-3xl bg-Snowflake text-Pine flex items-center justify-center text-3xl font-extrabold shadow-lg border-2 border-Frostysilver mb-3">
                {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <h2 className="text-lg font-extrabold text-white">{user?.full_name}</h2>
              <p className="text-xs text-Mist flex items-center gap-1 mt-1">
                <Mail className="w-3.5 h-3.5" /> {user?.email}
              </p>
              <span className="mt-3 px-3 py-1 rounded-xl bg-Berry text-white text-xs font-extrabold tracking-wide shadow-sm">
                Vai trò: {role || user?.role || user?.Roles?.role_name}
              </span>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-Snowflake/80">
                <span>Trạng thái tài khoản</span>
                <span className="font-extrabold text-white flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-Snowflake" /> Đang hoạt động
                </span>
              </div>
              <div className="flex items-center justify-between text-Snowflake/80">
                <span>Số quyền được cấp</span>
                <span className="font-extrabold text-Frostysilver">{permissions.length} / 19 mã quyền</span>
              </div>
              <div className="flex items-center justify-between text-Snowflake/80">
                <span>Bảo vệ Brute-force</span>
                <span className="font-extrabold text-Frostysilver">Đang bật (Khóa 15p)</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Cột Phải (8 cột): Không gian Tùy chỉnh Hồ sơ & Mật khẩu ────── */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] overflow-hidden flex flex-col">
          {/* Pill Tabs */}
          <div className="p-4 border-b border-Mist/15 bg-Snowflake/30">
            <div className="flex gap-1.5 bg-Snowflake/80 p-1.5 rounded-2xl">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  className={`flex items-center gap-2 flex-1 justify-center py-2.5 text-xs font-extrabold rounded-xl transition-all duration-200
                    ${
                      activeTab === tab.key
                        ? 'bg-Pine text-white shadow-sm'
                        : 'text-Branch hover:text-Pine'
                    }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 flex-1">
            {/* Tab: Info */}
            {activeTab === 'info' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-extrabold text-Pine">Thông tin Định danh</h3>
                  <p className="text-xs text-Mist mt-0.5">Cập nhật họ tên hiển thị trên biên bản và nhật ký kiểm toán</p>
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">
                    Họ và tên nhân sự *
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-3 border border-Mist/40 rounded-xl text-sm font-semibold focus:outline-none focus:border-Pine bg-white text-Pine transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">
                    Địa chỉ Email nội bộ (Định danh cố định)
                  </label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full px-4 py-3 border border-Mist/25 rounded-xl text-sm bg-Snowflake/60 text-Branch cursor-not-allowed font-mono"
                  />
                  <p className="text-[11px] text-Mist mt-1">
                    Email tài khoản doanh nghiệp được cố định để bảo toàn lịch sử Audit Logs.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveInfo}
                  disabled={savingInfo}
                  className="px-6 py-3 bg-Pine text-white text-xs font-extrabold rounded-2xl hover:bg-Pine/90 disabled:opacity-60 transition-all flex items-center gap-2 shadow-sm"
                >
                  {savingInfo ? <Spinner size="sm" /> : null}
                  Lưu thông tin hồ sơ
                </button>
              </div>
            )}

            {/* Tab: Password */}
            {activeTab === 'password' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-base font-extrabold text-Pine flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-Berry" />
                    Thay đổi Mật khẩu Bảo mật
                  </h3>
                  <p className="text-xs text-Mist mt-0.5">
                    Sau khi đổi mật khẩu, toàn bộ các Refresh Token cũ sẽ được thu hồi để bảo vệ tài khoản
                  </p>
                </div>

                {[
                  { label: 'Mật khẩu hiện tại *', val: oldPw, setVal: setOldPw, show: showOld, setShow: setShowOld },
                  { label: 'Mật khẩu mới (Tối thiểu 8 ký tự) *', val: newPw, setVal: setNewPw, show: showNew, setShow: setShowNew },
                  { label: 'Xác nhận lại mật khẩu mới *', val: confirmPw, setVal: setConfirmPw, show: showConfirm, setShow: setShowConfirm },
                ].map(({ label, val, setVal, show, setShow }) => (
                  <div key={label}>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">{label}</label>
                    <div className="relative">
                      <input
                        type={show ? 'text' : 'password'}
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        className="w-full px-4 py-3 pr-10 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-white text-Pine transition-all"
                        placeholder="••••••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShow(!show)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-Mist hover:text-Pine p-1"
                      >
                        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}

                {/* Checklist kiểm tra độ an toàn mật khẩu trực quan */}
                <div className="bg-Snowflake/50 rounded-2xl p-3.5 border border-Mist/20 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className={`flex items-center gap-1.5 font-semibold ${newPw.length >= 8 ? 'text-Pine' : 'text-Mist'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${newPw.length >= 8 ? 'text-Berry' : 'text-Mist'}`} />
                    Độ dài tối thiểu 8 ký tự
                  </div>
                  <div className={`flex items-center gap-1.5 font-semibold ${newPw && newPw === confirmPw ? 'text-Pine' : 'text-Mist'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${newPw && newPw === confirmPw ? 'text-Berry' : 'text-Mist'}`} />
                    Xác nhận mật khẩu trùng khớp
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={savingPw}
                  className="px-6 py-3 bg-Berry text-white text-xs font-extrabold rounded-2xl hover:bg-Berry/90 disabled:opacity-60 transition-all flex items-center gap-2 shadow-sm"
                >
                  {savingPw ? <Spinner size="sm" /> : null}
                  Cập nhật mật khẩu mới
                </button>
              </div>
            )}

            {/* Tab: Permissions */}
            {activeTab === 'permissions' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-extrabold text-Pine">
                    Danh mục Quyền hạn RBAC ({permissions.length} quyền)
                  </h3>
                  <p className="text-xs text-Mist mt-0.5">
                    Các mã quyền đang được kích hoạt cho vai trò <strong className="text-Pine">{role}</strong>
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {permissions.length === 0 ? (
                    <p className="text-sm text-Mist col-span-2 text-center py-8">Không có quyền nào được cấp</p>
                  ) : (
                    permissions.map((perm) => (
                      <div
                        key={perm}
                        className="flex items-center justify-between px-3.5 py-2.5 bg-Snowflake/45 rounded-2xl border border-Mist/25"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-Berry flex-shrink-0" />
                          <span className="text-xs font-bold text-Pine truncate">
                            {PERMISSION_LABELS[perm] || perm}
                          </span>
                        </div>
                        <code className="text-[10px] font-mono text-Branch bg-white px-2 py-0.5 rounded-lg border border-Mist/20 ml-2">
                          {perm}
                        </code>
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