import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Edit2, Search, Lock, Unlock, Key, UserCheck, UserX } from 'lucide-react'
import { MainLayout } from '../../components/MainLayout'
import { ConfirmModal, Modal, Pagination, Spinner, EmptyState } from '../../components/ui'
import { useRealtime } from '../../context/RealtimeContext'
import { adminApi } from '../../api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: number
  email: string
  full_name: string
  is_active: boolean
  locked_until: string | null
  failed_login_attempts: number | null
  created_at: string
  role_id: number | null
  Roles?: { id: number; role_name: string }
}

interface Role { id: number; role_name: string }

interface UserForm {
  email: string
  full_name: string
  password: string
  role_id: string
  is_active: boolean
}

const EMPTY_FORM: UserForm = { email: '', full_name: '', password: '', role_id: '', is_active: true }

export default function AdminUsersPage() {
  const { publishEvent } = useRealtime()

  const [users, setUsers] = useState<AdminUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const LIMIT = 15

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null)
  const [form, setForm] = useState<UserForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [confirmToggle, setConfirmToggle] = useState<AdminUser | null>(null)
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => {
    adminApi.getRolesMatrix().then((r) => {
      const data = r.data?.data || r.data || []
      const rolesData: Role[] = Array.isArray(data)
        ? data as Role[]
        : (data as { roles?: Role[] })?.roles || []
      setRoles(rolesData)
    }).catch(() => {})
  }, [])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean | undefined> = { page, limit: LIMIT }
      if (search) params.search = search
      const res = await adminApi.getUsers(params)
      const data = res.data?.data || res.data || {}
      const items: AdminUser[] = (data as { items?: AdminUser[] })?.items || []
      const totalCount: number = (data as { total?: number })?.total || 0

      // Đẩy tài khoản bị khóa (is_active = false) xuống dưới cùng của bảng
      const sorted = [
        ...items.filter((u) => u.is_active),
        ...items.filter((u) => !u.is_active),
      ]
      setUsers(sorted)
      setTotal(totalCount)
    } catch {
      toast.error('Không thể tải danh sách người dùng.')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const openCreate = () => { setEditTarget(null); setForm(EMPTY_FORM); setModalOpen(true) }
  const openEdit   = (u: AdminUser) => {
    setEditTarget(u)
    setForm({ email: u.email, full_name: u.full_name, password: '', role_id: String(u.role_id || u.Roles?.id || ''), is_active: u.is_active })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.email || !form.full_name || !form.role_id) {
      toast.error('Vui lòng điền đầy đủ thông tin bắt buộc.')
      return
    }
    if (!editTarget && !form.password) { toast.error('Mật khẩu không được để trống khi tạo mới.'); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        email: form.email, full_name: form.full_name,
        role_id: Number(form.role_id), is_active: form.is_active,
      }
      if (form.password) payload.password = form.password
      if (editTarget) {
        await adminApi.updateUser(editTarget.id, payload)
        toast.success('Cập nhật tài khoản thành công.')
        if (editTarget.role_id !== Number(form.role_id) || editTarget.is_active !== form.is_active) {
          publishEvent({
            type: 'PERMISSION_CHANGED',
            title: 'Quyền tài khoản đã thay đổi',
            message: 'Quản trị viên vừa thay đổi vai trò hoặc trạng thái tài khoản của bạn. Giao diện sẽ tự cập nhật.',
            targetUserId: editTarget.id,
          })
        }
      } else {
        await adminApi.createUser(payload)
        toast.success('Tạo tài khoản mới thành công.')
      }
      setModalOpen(false)
      fetchUsers()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Lưu thất bại.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async () => {
    if (!confirmToggle) return
    try {
      await adminApi.updateUser(confirmToggle.id, { is_active: !confirmToggle.is_active })
      toast.success(confirmToggle.is_active ? `Đã khóa tài khoản "${confirmToggle.full_name}".` : `Đã mở khóa tài khoản "${confirmToggle.full_name}".`)
      if (confirmToggle.is_active) {
        publishEvent({
          type: 'ACCOUNT_LOCKED',
          title: 'Tài khoản bị khóa',
          message: 'Tài khoản của bạn vừa bị Quản trị viên khóa. Vui lòng liên hệ IT Admin.',
          targetUserId: confirmToggle.id,
        })
      } else {
        publishEvent({
          type: 'PERMISSION_CHANGED',
          title: 'Tài khoản đã được mở khóa',
          message: 'Tài khoản của bạn đã được mở khóa trở lại.',
          targetUserId: confirmToggle.id,
        })
      }
      setConfirmToggle(null)
      fetchUsers()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Thao tác thất bại.')
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget || !newPassword.trim()) { toast.error('Mật khẩu mới không được để trống.'); return }
    if (newPassword.length < 8) { toast.error('Mật khẩu phải có ít nhất 8 ký tự.'); return }
    setResetLoading(true)
    try {
      await adminApi.resetPassword(resetTarget.id, newPassword)
      toast.success(`Đã reset mật khẩu cho "${resetTarget.full_name}".`)
      setResetTarget(null)
      setNewPassword('')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Reset mật khẩu thất bại.')
    } finally {
      setResetLoading(false)
    }
  }

  const isLocked = (u: AdminUser) => !!u.locked_until && new Date(u.locked_until) > new Date()

  return (
    <MainLayout breadcrumb="Quản lý Người dùng">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-Pine">Quản lý Người dùng</h1>
            <p className="text-sm text-Mist mt-0.5">Thêm, sửa, phân vai trò, khóa và cấp lại mật khẩu tài khoản</p>
          </div>
          <button type="button" onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 shadow-sm hover:shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />Thêm tài khoản
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Tìm theo tên, email..."
            className="w-full pl-9 pr-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-Mist/20 shadow-sm overflow-hidden">
          {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div>
            : users.length === 0 ? <EmptyState message="Không tìm thấy tài khoản nào" />
            : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-Mist/10">
                  <thead>
                    <tr className="bg-Snowflake/60">
                      {['Họ tên / Email', 'Vai trò', 'Trạng thái', 'Đăng nhập sai', 'Ngày tạo', 'Hành động'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-Mist uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-Mist/8">
                    {users.map((u) => {
                      const locked = isLocked(u)
                      return (
                        <tr key={u.id} className={`hover:bg-Snowflake/40 transition-colors ${!u.is_active ? 'opacity-60 bg-Snowflake/60' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-Pine text-white rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {u.full_name?.charAt(0)?.toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-Pine">{u.full_name}</p>
                                <p className="text-xs text-Mist">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-Pine/8 text-Pine border border-Pine/20">
                              {u.Roles?.role_name || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {!u.is_active ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-Snowflake text-Mist border border-Mist/30">
                                <Lock className="w-3 h-3" /> Đã khóa
                              </span>
                            ) : locked ? (
                              <span className="flex items-center gap-1 text-xs text-amber-600"><Lock className="w-3.5 h-3.5" />Tạm khóa Brute-force</span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-emerald-600"><UserCheck className="w-3.5 h-3.5" />Hoạt động</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-Branch text-center">
                            {u.failed_login_attempts ?? 0}
                          </td>
                          <td className="px-4 py-3 text-xs text-Mist whitespace-nowrap">
                            {new Date(u.created_at).toLocaleDateString('vi-VN')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {!u.is_active ? (
                                <>
                                  <button type="button" disabled title="Đã khóa chỉnh sửa"
                                    className="p-1.5 text-Mist/40 cursor-not-allowed rounded-md">
                                    <Lock className="w-4 h-4" />
                                  </button>
                                  <button type="button" onClick={() => setConfirmToggle(u)} title="Mở khóa tài khoản"
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors">
                                    <Unlock className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button type="button" onClick={() => openEdit(u)} title="Chỉnh sửa"
                                    className="p-1.5 text-Pine hover:bg-Pine/8 rounded-md transition-colors">
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button type="button" onClick={() => { setResetTarget(u); setNewPassword('') }} title="Reset mật khẩu"
                                    className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md transition-colors">
                                    <Key className="w-4 h-4" />
                                  </button>
                                  <button type="button" onClick={() => setConfirmToggle(u)} title="Khóa tài khoản"
                                    className="p-1.5 text-Berry hover:bg-Berry/8 rounded-md transition-colors">
                                    <UserX className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          {!loading && <div className="px-4 border-t border-Mist/10"><Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} /></div>}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal isOpen={modalOpen} title={editTarget ? 'Chỉnh sửa tài khoản' : 'Tạo tài khoản mới'} onClose={() => setModalOpen(false)} size="sm">
        <div className="space-y-4">
          {[
            { label: 'Họ và tên *', key: 'full_name', type: 'text', placeholder: 'Nguyễn Văn A' },
            { label: 'Email *',     key: 'email',     type: 'email', placeholder: 'user@anhquy.com', disabled: !!editTarget },
            { label: editTarget ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu *', key: 'password', type: 'password', placeholder: 'Tối thiểu 8 ký tự' },
          ].map(({ label, key, type, placeholder, disabled }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-Branch mb-1.5">{label}</label>
              <input type={type} value={form[key as keyof UserForm] as string}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder} disabled={disabled}
                className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white disabled:bg-Snowflake disabled:cursor-not-allowed"
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-Branch mb-1.5">Vai trò *</label>
            <select value={form.role_id} onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
              className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white text-Branch">
              <option value="">-- Chọn vai trò --</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.role_name}</option>)}
            </select>
          </div>
          {editTarget && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-Branch">Kích hoạt tài khoản</label>
              <button type="button" onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                className={`relative inline-flex h-5 w-9 rounded-md border-2 border-transparent transition-colors ${form.is_active ? 'bg-Pine' : 'bg-Mist'}`}>
                <span className={`inline-block h-4 w-4 rounded-sm bg-white shadow transform transition-transform ${form.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-Mist/40 text-Branch text-sm rounded-md hover:bg-Snowflake transition-all">Hủy</button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
              {saving ? <Spinner size="sm" /> : null}
              {editTarget ? 'Lưu thay đổi' : 'Tạo tài khoản'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Toggle confirm */}
      <ConfirmModal
        isOpen={!!confirmToggle}
        title={confirmToggle?.is_active ? 'Khóa tài khoản?' : 'Mở khóa tài khoản?'}
        message={confirmToggle?.is_active
          ? `Tài khoản "${confirmToggle?.full_name}" sẽ bị khóa ngay lập tức, đẩy xuống cuối bảng và không thể đăng nhập.`
          : `Tài khoản "${confirmToggle?.full_name}" sẽ được mở khóa và đăng nhập trở lại.`}
        confirmLabel={confirmToggle?.is_active ? 'Khóa tài khoản' : 'Mở khóa'}
        variant={confirmToggle?.is_active ? 'danger' : 'info'}
        onConfirm={handleToggleActive}
        onCancel={() => setConfirmToggle(null)}
      />

      {/* Reset password modal */}
      <Modal isOpen={!!resetTarget} title={`Reset mật khẩu: ${resetTarget?.full_name}`} onClose={() => setResetTarget(null)} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-Branch">Đặt mật khẩu tạm thời mới. Yêu cầu người dùng đổi ngay sau khi đăng nhập.</p>
          <div>
            <label className="block text-sm font-medium text-Branch mb-1.5">Mật khẩu mới *</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 bg-white"
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setResetTarget(null)} className="flex-1 py-2.5 border border-Mist/40 text-Branch text-sm rounded-md hover:bg-Snowflake transition-all">Hủy</button>
            <button type="button" onClick={handleResetPassword} disabled={resetLoading}
              className="flex-1 py-2.5 bg-Berry text-white text-sm font-medium rounded-md hover:bg-Berry/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2">
              {resetLoading ? <Spinner size="sm" /> : <Key className="w-4 h-4" />}
              Reset mật khẩu
            </button>
          </div>
        </div>
      </Modal>
    </MainLayout>
  )
}