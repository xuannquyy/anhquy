import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Plus, Edit2, Search, Lock, Unlock, Key, UserCheck, UserX,
  Users, ShieldAlert, Wand2, Copy, Ban, RotateCcw
} from 'lucide-react'
import { MainLayout } from '../../components/MainLayout'
import { ConfirmModal, Modal, Pagination, Spinner, EmptyState } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
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

function generateStrongPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const nums = '23456789'
  const special = '@#$%&*!'
  const all = upper + lower + nums + special
  let pass =
    upper[Math.floor(Math.random() * upper.length)] +
    lower[Math.floor(Math.random() * lower.length)] +
    nums[Math.floor(Math.random() * nums.length)] +
    special[Math.floor(Math.random() * special.length)]
  for (let i = 0; i < 8; i++) {
    pass += all[Math.floor(Math.random() * all.length)]
  }
  return pass
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const { publishEvent } = useRealtime()

  const [users, setUsers] = useState<AdminUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)

  // Filters
  const [search, setSearch]             = useState('')
  const [roleFilter, setRoleFilter]     = useState('')
  const [statusTab, setStatusTab]       = useState<'all' | 'active' | 'locked'>('all')

  const [modalOpen, setModalOpen]       = useState(false)
  const [editTarget, setEditTarget]     = useState<AdminUser | null>(null)
  const [form, setForm]                 = useState<UserForm>(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)

  const [confirmToggle, setConfirmToggle] = useState<AdminUser | null>(null)
  const [resetTarget, setResetTarget]     = useState<AdminUser | null>(null)
  const [newPassword, setNewPassword]     = useState('')
  const [resetLoading, setResetLoading]   = useState(false)
  const [unlockingId, setUnlockingId]     = useState<number | null>(null)

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
      const params: Record<string, string | number | boolean | undefined> = { page, limit }
      if (search.trim()) params.search = search.trim()
      if (roleFilter) params.role_id = roleFilter
      if (statusTab === 'active') params.is_active = true
      if (statusTab === 'locked') params.is_active = false

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
  }, [page, limit, search, roleFilter, statusTab])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const isBruteForceLocked = (u: AdminUser) =>
    !!u.locked_until && new Date(u.locked_until) > new Date()

  // ─── Tính năng Gỡ khóa Brute-force & Reset bộ đếm nhập sai 1 chạm ──────────
  const handleQuickUnlockBruteForce = async (u: AdminUser) => {
    if (unlockingId === u.id) return
    setUnlockingId(u.id)
    try {
      await adminApi.updateUser(u.id, {
        is_active: true,
        failed_login_attempts: 0,
        locked_until: null,
      })
      setUsers((prev) =>
        prev.map((item) =>
          item.id === u.id
            ? { ...item, is_active: true, failed_login_attempts: 0, locked_until: null }
            : item
        )
      )
      toast.success(`Đã gỡ khóa Brute-force & đặt lại số lần nhập sai cho "${u.full_name}"!`)
      publishEvent({
        type: 'PERMISSION_CHANGED',
        title: 'Đã gỡ khóa tạm thời Brute-force',
        message: `Tài khoản "${u.email}" đã được Quản trị viên mở khóa đăng nhập tức thì.`,
        targetUserId: u.id,
      })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Gỡ khóa Brute-force thất bại.')
    } finally {
      setUnlockingId(null)
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter && String(u.role_id || u.Roles?.id || '') !== roleFilter) return false
      if (statusTab === 'active' && !u.is_active) return false
      if (statusTab === 'locked' && u.is_active && !isBruteForceLocked(u)) return false
      return true
    })
  }, [users, roleFilter, statusTab])

  const openCreate = () => {
    setEditTarget(null)
    setForm({
      ...EMPTY_FORM,
      role_id: roles.find((r) => r.role_name === 'User')?.id
        ? String(roles.find((r) => r.role_name === 'User')?.id)
        : '',
    })
    setModalOpen(true)
  }

  const openEdit = (u: AdminUser) => {
    if (!u.is_active) return
    setEditTarget(u)
    setForm({
      email: u.email,
      full_name: u.full_name,
      password: '',
      role_id: String(u.role_id || u.Roles?.id || ''),
      is_active: u.is_active,
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.email.trim() || !form.full_name.trim() || !form.role_id) {
      toast.error('Vui lòng điền đầy đủ thông tin bắt buộc.')
      return
    }
    if (!editTarget && !form.password) {
      toast.error('Mật khẩu không được để trống khi tạo mới.')
      return
    }
    if (editTarget && editTarget.id === currentUser?.id && !form.is_active) {
      toast.error('Bạn không thể tự khóa tài khoản đang đăng nhập của chính mình.')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        role_id: Number(form.role_id),
        is_active: form.is_active,
      }
      if (form.password) payload.password = form.password

      if (editTarget) {
        await adminApi.updateUser(editTarget.id, payload)
        toast.success('Cập nhật tài khoản thành công.')
        if (editTarget.role_id !== Number(form.role_id) || editTarget.is_active !== form.is_active) {
          publishEvent({
            type: 'PERMISSION_CHANGED',
            title: 'Quyền tài khoản đã thay đổi',
            message: 'Quản trị viên vừa thay đổi vai trò hoặc trạng thái tài khoản của bạn.',
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
    if (confirmToggle.id === currentUser?.id && confirmToggle.is_active) {
      toast.error('Không thể tự khóa tài khoản Quản trị viên đang đăng nhập!')
      setConfirmToggle(null)
      return
    }
    try {
      await adminApi.updateUser(confirmToggle.id, { is_active: !confirmToggle.is_active })
      toast.success(
        confirmToggle.is_active
          ? `Đã khóa tài khoản "${confirmToggle.full_name}".`
          : `Đã mở khóa tài khoản "${confirmToggle.full_name}".`
      )
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
      toast.success(`Đã cấp lại mật khẩu mới cho "${resetTarget.full_name}".`)
      setResetTarget(null)
      setNewPassword('')
      fetchUsers()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Reset mật khẩu thất bại.')
    } finally {
      setResetLoading(false)
    }
  }

  const activeCount = users.filter((u) => u.is_active).length
  const lockedCount = users.filter((u) => !u.is_active || isBruteForceLocked(u)).length

  return (
    <MainLayout breadcrumb="Quản lý Tài khoản">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-Pine tracking-tight">Quản lý Tài khoản Người dùng</h1>
            <p className="text-xs sm:text-sm text-Mist mt-0.5">
              Cấp phát tài khoản tập trung, phân vai trò RBAC và gỡ khóa bảo mật Brute-force 1 chạm
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-2xl hover:bg-Pine/90 shadow-sm hover:shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            Thêm tài khoản mới
          </button>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Pine text-white flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Tổng tài khoản hệ thống</p>
              <p className="text-xl font-extrabold text-Pine">{total}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Mist text-Pine flex items-center justify-center flex-shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Đang hoạt động</p>
              <p className="text-xl font-extrabold text-Pine">{activeCount}</p>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-white p-4 shadow-sm flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-Berry text-white flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-Branch">Đã khóa / Brute-force</p>
              <p className="text-xl font-extrabold text-Berry">{lockedCount}</p>
            </div>
          </div>
        </div>

        {/* Filter Bar + Table Card */}
        <div className="bg-white rounded-3xl border border-white shadow-[0_10px_28px_rgba(39,54,63,0.06)] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-Mist/15 pb-3">
            {/* Status Tabs */}
            <div className="flex items-center gap-1 bg-Snowflake/60 p-1 rounded-2xl w-fit">
              {[
                { key: 'all',    label: 'Tất cả' },
                { key: 'active', label: 'Đang hoạt động' },
                { key: 'locked', label: 'Đã khóa' },
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

            {/* Search + Role Filter */}
            <div className="flex flex-col sm:flex-row gap-2.5 flex-1 max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-Mist" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  placeholder="Tìm theo họ tên, email..."
                  className="w-full pl-9 pr-3 py-2 border border-Mist/40 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-Pine bg-Snowflake/20 text-Pine placeholder-Mist"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}
                className="px-3 py-2 border border-Mist/40 rounded-xl text-xs sm:text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Pine min-w-[170px]"
              >
                <option value="">Tất cả vai trò</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.role_name}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : filteredUsers.length === 0 ? (
            <EmptyState message="Không tìm thấy tài khoản nào phù hợp với bộ lọc" />
          ) : (
            <>
              {/* 1. Desktop Table */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-Mist/20">
                <table className="min-w-full divide-y divide-Mist/15">
                  <thead>
                    <tr className="bg-Pine text-white">
                      {['Nhân sự / Email', 'Vai trò', 'Trạng thái', 'Nhập sai MK', 'Ngày tạo', 'Thao tác'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-Mist/15 bg-white">
                    {filteredUsers.map((u) => {
                      const locked = isBruteForceLocked(u)
                      const hasFailedAttempts = (u.failed_login_attempts ?? 0) > 0
                      const isSelf = u.id === currentUser?.id
                      const roleName = u.Roles?.role_name || '—'
                      return (
                        <tr
                          key={u.id}
                          className={`transition-colors ${
                            !u.is_active
                              ? 'opacity-60 bg-Snowflake/50 cursor-not-allowed'
                              : 'hover:bg-Snowflake/35'
                          }`}
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                                  !u.is_active
                                    ? 'bg-Berry/10 text-Berry'
                                    : 'bg-Pine text-white shadow-sm'
                                }`}
                              >
                                {u.full_name?.charAt(0)?.toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className={`text-sm font-bold ${!u.is_active ? 'line-through text-Branch' : 'text-Pine'}`}>
                                    {u.full_name}
                                  </p>
                                  {isSelf && (
                                    <span className="px-2 py-0.5 rounded-lg bg-Snowflake text-Pine text-[10px] font-extrabold border border-Mist/30">
                                      Bạn
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-Mist font-mono">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`px-2.5 py-1 rounded-xl text-xs font-extrabold border ${
                                roleName === 'Admin'
                                  ? 'bg-Berry text-white border-Berry'
                                  : roleName === 'Manager'
                                  ? 'bg-Pine text-white border-Pine'
                                  : 'bg-Snowflake text-Pine border-Mist/30'
                              }`}
                            >
                              {roleName}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            {!u.is_active ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-Berry/10 text-Berry border border-Berry/20">
                                <Ban className="w-3 h-3" /> Đã khóa
                              </span>
                            ) : locked ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-Berry text-white shadow-sm">
                                <Lock className="w-3 h-3" /> Tạm khóa Brute-force (15p)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-Snowflake text-Pine border border-Mist/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-Pine" />
                                Hoạt động
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-bold text-Branch">
                            <div className="flex items-center gap-2">
                              <span className={(u.failed_login_attempts ?? 0) >= 3 ? 'text-Berry font-extrabold' : ''}>
                                {u.failed_login_attempts ?? 0} / 5 lần
                              </span>
                              {(locked || hasFailedAttempts) && u.is_active && (
                                <button
                                  type="button"
                                  disabled={unlockingId === u.id}
                                  onClick={() => handleQuickUnlockBruteForce(u)}
                                  title="Gỡ khóa Brute-force & Đặt lại số lần sai về 0 ngay lập tức"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-Berry/10 hover:bg-Berry text-Berry hover:text-white text-[11px] font-extrabold transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  {locked ? 'Gỡ khóa 1 chạm' : 'Reset 0'}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-Mist whitespace-nowrap">
                            {new Date(u.created_at).toLocaleDateString('vi-VN')}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              {!u.is_active ? (
                                <>
                                  <span
                                    title="Tài khoản đang bị khóa chỉnh sửa"
                                    className="p-1.5 text-Berry/40 cursor-not-allowed rounded-xl"
                                  >
                                    <Lock className="w-4 h-4" />
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmToggle(u)}
                                    title="Mở khóa tài khoản"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-Pine bg-Snowflake hover:bg-Mist/30 border border-Mist/40 rounded-xl transition-colors cursor-pointer"
                                  >
                                    <Unlock className="w-3.5 h-3.5" />
                                    Mở khóa
                                  </button>
                                </>
                              ) : (
                                <>
                                  {locked && (
                                    <button
                                      type="button"
                                      disabled={unlockingId === u.id}
                                      onClick={() => handleQuickUnlockBruteForce(u)}
                                      title="Mở khóa Brute-force ngay mà không cần đổi mật khẩu"
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-Berry text-white text-xs font-extrabold rounded-xl hover:bg-Berry/90 shadow-sm transition-all"
                                    >
                                      <Unlock className="w-3.5 h-3.5" />
                                      Gỡ Brute-force
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openEdit(u)}
                                    title="Chỉnh sửa"
                                    className="p-1.5 text-Pine hover:bg-Snowflake rounded-xl transition-colors"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setResetTarget(u); setNewPassword('') }}
                                    title="Cấp lại mật khẩu"
                                    className="p-1.5 text-Branch hover:bg-Snowflake rounded-xl transition-colors"
                                  >
                                    <Key className="w-4 h-4" />
                                  </button>
                                  {!isSelf && (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmToggle(u)}
                                      title="Khóa tài khoản"
                                      className="p-1.5 text-Berry hover:bg-Berry/10 rounded-xl transition-colors"
                                    >
                                      <UserX className="w-4 h-4" />
                                    </button>
                                  )}
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

              {/* 2. Mobile Cards */}
              <div className="md:hidden grid grid-cols-1 gap-3">
                {filteredUsers.map((u) => {
                  const locked = isBruteForceLocked(u)
                  const isSelf = u.id === currentUser?.id
                  return (
                    <div
                      key={u.id}
                      className={`rounded-2xl border p-4 space-y-2.5 ${
                        !u.is_active
                          ? 'opacity-60 bg-Snowflake/50 border-Mist/30'
                          : 'bg-white border-Mist/25 shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`text-sm font-bold ${!u.is_active ? 'line-through text-Branch' : 'text-Pine'}`}>
                            {u.full_name} {isSelf && '(Bạn)'}
                          </p>
                          <p className="text-xs font-mono text-Mist">{u.email}</p>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-xl bg-Pine text-white text-xs font-bold">
                          {u.Roles?.role_name || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-Mist/15">
                        <span className="text-xs font-bold text-Mist">
                          {!u.is_active ? 'Đã khóa' : locked ? 'Khóa Brute-force' : 'Đang hoạt động'}
                        </span>
                        <div className="flex gap-1.5">
                          {!u.is_active ? (
                            <button
                              type="button"
                              onClick={() => setConfirmToggle(u)}
                              className="px-2.5 py-1 bg-Snowflake text-Pine text-xs font-bold rounded-xl"
                            >
                              Mở khóa
                            </button>
                          ) : (
                            <>
                              {locked && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickUnlockBruteForce(u)}
                                  className="px-2.5 py-1 bg-Berry text-white text-xs font-extrabold rounded-xl"
                                >
                                  Gỡ Brute-force
                                </button>
                              )}
                              <button type="button" onClick={() => openEdit(u)} className="p-1.5 text-Pine bg-Snowflake rounded-xl">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => { setResetTarget(u); setNewPassword('') }} className="p-1.5 text-Branch bg-Snowflake rounded-xl">
                                <Key className="w-3.5 h-3.5" />
                              </button>
                              {!isSelf && (
                                <button type="button" onClick={() => setConfirmToggle(u)} className="p-1.5 text-Berry bg-Berry/10 rounded-xl">
                                  <UserX className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
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

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        title={editTarget ? 'Chỉnh sửa tài khoản nhân sự' : 'Cấp phát tài khoản mới'}
        onClose={() => setModalOpen(false)}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Họ và tên *</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="Nguyễn Văn A"
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-white text-Pine"
            />
          </div>
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Email doanh nghiệp *</label>
            <input
              type="email"
              disabled={!!editTarget}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="user@anhquy.com"
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm font-mono focus:outline-none focus:border-Pine bg-white text-Pine disabled:bg-Snowflake disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine">
                {editTarget ? 'Mật khẩu mới (Bỏ trống nếu giữ nguyên)' : 'Mật khẩu khởi tạo *'}
              </label>
              <button
                type="button"
                onClick={() => {
                  const generated = generateStrongPassword()
                  setForm((f) => ({ ...f, password: generated }))
                  navigator.clipboard.writeText(generated)
                  toast.success('Đã tự động tạo & sao chép mật khẩu mạnh!')
                }}
                className="inline-flex items-center gap-1 text-[11px] font-extrabold text-Berry hover:underline"
              >
                <Wand2 className="w-3 h-3" /> Tạo tự động
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Tối thiểu 8 ký tự"
                className="w-full px-3.5 py-2.5 pr-9 border border-Mist/40 rounded-xl text-sm font-mono focus:outline-none focus:border-Pine bg-white text-Pine"
              />
              {form.password && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`Email: ${form.email}\nPassword: ${form.password}`)
                    toast.success('Đã sao chép thông tin đăng nhập.')
                  }}
                  title="Sao chép Email & Mật khẩu"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-Mist hover:text-Pine"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">Vai trò hệ thống *</label>
            <select
              value={form.role_id}
              disabled={editTarget?.id === currentUser?.id}
              onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Pine disabled:bg-Snowflake"
            >
              <option value="">-- Chọn vai trò --</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.role_name}</option>)}
            </select>
          </div>
          {editTarget && editTarget.id !== currentUser?.id && (
            <div className="flex items-center justify-between bg-Snowflake/50 px-3.5 py-2.5 rounded-xl border border-Mist/20">
              <label className="text-xs font-bold text-Pine">Cho phép tài khoản hoạt động</label>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                className={`relative inline-flex h-5 w-9 rounded-xl border-2 border-transparent transition-colors ${
                  form.is_active ? 'bg-Pine' : 'bg-Mist'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-lg bg-white shadow transform transition-transform ${
                    form.is_active ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-Mist/40 text-Branch text-xs font-bold rounded-xl hover:bg-Snowflake transition-all">Hủy bỏ</button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Pine/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2">
              {saving ? <Spinner size="sm" /> : null}
              {editTarget ? 'Lưu thay đổi' : 'Tạo tài khoản'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Toggle confirm */}
      <ConfirmModal
        isOpen={!!confirmToggle}
        title={confirmToggle?.is_active ? 'Khóa tài khoản người dùng?' : 'Mở khóa tài khoản?'}
        message={confirmToggle?.is_active
          ? `Tài khoản "${confirmToggle?.full_name}" sẽ bị khóa ngay lập tức, đẩy xuống cuối bảng và thu hồi quyền truy cập.`
          : `Tài khoản "${confirmToggle?.full_name}" sẽ được mở khóa và cho phép đăng nhập trở lại.`}
        confirmLabel={confirmToggle?.is_active ? 'Đồng ý khóa' : 'Mở khóa ngay'}
        variant={confirmToggle?.is_active ? 'danger' : 'info'}
        onConfirm={handleToggleActive}
        onCancel={() => setConfirmToggle(null)}
      />

      {/* Reset password modal */}
      <Modal isOpen={!!resetTarget} title={`Cấp lại mật khẩu: ${resetTarget?.full_name}`} onClose={() => setResetTarget(null)} size="sm">
        <div className="space-y-4">
          <p className="text-xs text-Branch leading-relaxed">
            Đặt mật khẩu mới và tự động gỡ khóa Brute-force (nếu có) cho tài khoản này.
          </p>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine">Mật khẩu mới *</label>
              <button
                type="button"
                onClick={() => {
                  const gen = generateStrongPassword()
                  setNewPassword(gen)
                  navigator.clipboard.writeText(gen)
                  toast.success('Đã tạo tự động & sao chép mật khẩu!')
                }}
                className="inline-flex items-center gap-1 text-[11px] font-extrabold text-Berry hover:underline"
              >
                <Wand2 className="w-3 h-3" /> Tạo tự động
              </button>
            </div>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm font-mono focus:outline-none focus:border-Pine bg-white text-Pine"
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setResetTarget(null)} className="flex-1 py-2.5 border border-Mist/40 text-Branch text-xs font-bold rounded-xl hover:bg-Snowflake transition-all">Hủy bỏ</button>
            <button type="button" onClick={handleResetPassword} disabled={resetLoading}
              className="flex-1 py-2.5 bg-Berry text-white text-xs font-extrabold rounded-xl hover:bg-Berry/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2">
              {resetLoading ? <Spinner size="sm" /> : <Key className="w-4 h-4" />}
              Cấp lại mật khẩu
            </button>
          </div>
        </div>
      </Modal>
    </MainLayout>
  )
}