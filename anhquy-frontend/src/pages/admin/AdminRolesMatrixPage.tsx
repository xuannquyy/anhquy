import { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Shield, Check, Lock, Search, CheckSquare, Square,
  Sparkles, ShieldAlert, Layers, Plus, Pencil, Trash2,
  Users, RotateCcw, UserPlus, AlertTriangle
} from 'lucide-react'
import { MainLayout } from '../../components/MainLayout'
import { ConfirmModal, Modal, Spinner, EmptyState } from '../../components/ui'
import { useRealtime } from '../../context/RealtimeContext'
import { useAuth } from '../../context/AuthContext'
import { adminApi } from '../../api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleUser {
  id: number
  full_name: string
  email: string
  is_active: boolean
}

interface Role {
  id: number
  role_name: string
  description?: string
  is_active?: boolean
  Role_Permissions?: { permission_id: number }[]
  Users?: RoleUser[]
}

interface Permission {
  id: number
  permission_code: string
  permission_name: string
}

interface UserOption {
  id: number
  full_name: string
  email: string
  role_id: number | null
  is_active: boolean
  Roles?: { id: number; role_name: string }
}

const PERMISSION_GROUPS: Record<string, string[]> = {
  'Kho Hợp đồng & AI RAG': ['VIEW_DOC', 'UPLOAD_DOC', 'DELETE_DOC', 'RUN_AI_AUDIT'],
  'Thẩm định Vi phạm & Báo cáo': ['VIEW_VIOLATION', 'APPROVE_VIOLATION', 'EXPORT_REPORT'],
  'Quản lý Đối tác Cung ứng': ['VIEW_SUPPLIER', 'CREATE_SUPPLIER', 'EDIT_SUPPLIER', 'DELETE_SUPPLIER'],
  'Bộ Tiêu chuẩn & Danh mục': ['VIEW_STANDARD', 'CREATE_CUSTOM_STANDARD', 'MANAGE_SYSTEM_STANDARDS', 'MANAGE_CATEGORIES'],
  'Quản trị Hệ thống (IAM & Config)': ['MANAGE_USERS', 'MANAGE_ROLES', 'MANAGE_SYSTEM_CONFIGS', 'VIEW_AUDIT_LOGS'],
}

// Mẫu quyền chuẩn khuyến nghị theo nghiệp vụ RBA
const RECOMMENDED_PRESETS: Record<string, string[]> = {
  Manager: [
    'VIEW_SUPPLIER', 'CREATE_SUPPLIER', 'EDIT_SUPPLIER', 'DELETE_SUPPLIER',
    'MANAGE_CATEGORIES', 'VIEW_DOC', 'UPLOAD_DOC', 'DELETE_DOC', 'RUN_AI_AUDIT',
    'VIEW_STANDARD', 'CREATE_CUSTOM_STANDARD', 'VIEW_VIOLATION', 'APPROVE_VIOLATION', 'EXPORT_REPORT',
  ],
  User: [
    'VIEW_SUPPLIER', 'CREATE_SUPPLIER', 'EDIT_SUPPLIER',
    'VIEW_DOC', 'UPLOAD_DOC', 'RUN_AI_AUDIT',
    'VIEW_STANDARD', 'CREATE_CUSTOM_STANDARD', 'VIEW_VIOLATION', 'EXPORT_REPORT',
  ],
}

export default function AdminRolesMatrixPage() {
  const { publishEvent } = useRealtime()
  const { user: currentUser, refreshUserProfile } = useAuth()

  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [activeTab, setActiveTab] = useState<'permissions' | 'users'>('permissions')

  // roleId → Set<permissionId>
  const [matrix, setMatrix] = useState<Map<number, Set<number>>>(new Map())
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  // ─── Modal States ──────────────────────────────────────────────────────────
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ role_name: '', description: '' })
  const [createLoading, setCreateLoading] = useState(false)

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editForm, setEditForm] = useState({ role_name: '', description: '' })
  const [editLoading, setEditLoading] = useState(false)

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)

  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [assigningUserId, setAssigningUserId] = useState<number | null>(null)

  // ─── Tải dữ liệu ban đầu ───────────────────────────────────────────────────
  const fetchAll = useCallback(async (preferredSelectedId?: number) => {
    setLoading(true)
    try {
      const [rolesRes, permsRes] = await Promise.all([
        adminApi.getRolesMatrix({ include_inactive: includeInactive }),
        adminApi.getAllPermissions(),
      ])
      const rolesData = rolesRes.data?.data || rolesRes.data || []
      const permsData = permsRes.data?.data || permsRes.data || []

      const normalizedRoles: Role[] = Array.isArray(rolesData)
        ? rolesData
        : (rolesData as { roles?: Role[] })?.roles || []
      const normalizedPerms: Permission[] = Array.isArray(permsData)
        ? permsData
        : (permsData as { permissions?: Permission[] })?.permissions || []

      setRoles(normalizedRoles)
      setPermissions(normalizedPerms)

      if (normalizedRoles.length > 0) {
        if (preferredSelectedId && normalizedRoles.some((r) => r.id === preferredSelectedId)) {
          setSelectedRoleId(preferredSelectedId)
        } else if (!selectedRoleId || !normalizedRoles.some((r) => r.id === selectedRoleId)) {
          const defaultRole = normalizedRoles.find((r) => r.role_name === 'Manager') || normalizedRoles[0]
          setSelectedRoleId(defaultRole.id)
        }
      } else {
        setSelectedRoleId(null)
      }

      const m = new Map<number, Set<number>>()
      for (const role of normalizedRoles) {
        const permIds = new Set<number>(
          (role.Role_Permissions || []).map((rp) => rp.permission_id)
        )
        m.set(role.id, permIds)
      }
      setMatrix(m)
    } catch {
      toast.error('Không thể tải dữ liệu phân quyền.')
    } finally {
      setLoading(false)
    }
  }, [includeInactive, selectedRoleId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) || null,
    [roles, selectedRoleId]
  )

  // Vai trò Admin được khóa bảo vệ chống thu hồi quyền hoặc xóa
  const isSelectedAdmin = selectedRole?.role_name?.toLowerCase() === 'admin'
  const isSelectedInactive = selectedRole?.is_active === false

  const hasPermission = (roleId: number, permId: number) =>
    matrix.get(roleId)?.has(permId) ?? false

  const permByCode = (code: string) => permissions.find((p) => p.permission_code === code)

  // ─── Bật / Tắt từng quyền đơn lẻ ───────────────────────────────────────────
  const handleToggle = async (role: Role, perm: Permission) => {
    if (role.role_name.toLowerCase() === 'admin') {
      toast.error('Vai trò Admin được khóa bảo vệ mặc định để tránh mất quyền quản trị hệ thống.')
      return
    }
    if (role.is_active === false) {
      toast.error('Vai trò này đã bị vô hiệu hóa. Vui lòng khôi phục trước khi cấu hình quyền.')
      return
    }

    const key = `${role.id}-${perm.id}`
    if (toggling.has(key) || batchLoading) return
    setToggling((prev) => new Set(prev).add(key))

    const current = hasPermission(role.id, perm.id)
    setMatrix((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(role.id) || [])
      if (current) set.delete(perm.id)
      else set.add(perm.id)
      next.set(role.id, set)
      return next
    })

    try {
      if (current) {
        await adminApi.revokePermission(role.id, perm.id)
        toast.success(`Đã thu hồi quyền "${perm.permission_code}" khỏi "${role.role_name}".`)
      } else {
        await adminApi.grantPermission(role.id, perm.id)
        toast.success(`Đã cấp quyền "${perm.permission_code}" cho "${role.role_name}".`)
      }

      // Làm mới quyền của user hiện tại nếu bị ảnh hưởng
      await refreshUserProfile()

      publishEvent({
        type: 'PERMISSION_CHANGED',
        title: 'Cập nhật phân quyền RBAC',
        message: `Quyền "${perm.permission_code}" của vai trò "${role.role_name}" vừa thay đổi.`,
      })
    } catch (err: unknown) {
      setMatrix((prev) => {
        const next = new Map(prev)
        const set = new Set(next.get(role.id) || [])
        if (current) set.add(perm.id)
        else set.delete(perm.id)
        next.set(role.id, set)
        return next
      })
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Cập nhật quyền thất bại.')
    } finally {
      setToggling((prev) => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  // ─── Thao tác Hàng loạt: Áp dụng Transaction đồng bộ ─────────────────────
  const applyTargetPermissions = async (role: Role, targetPermIds: number[], actionLabel: string) => {
    if (batchLoading) return
    if (role.is_active === false) {
      toast.error('Vai trò này đã bị vô hiệu hóa. Vui lòng khôi phục trước khi cấu hình quyền.')
      return
    }

    setBatchLoading(true)
    const currentSet = matrix.get(role.id) || new Set<number>()
    const targetSet = new Set<number>(targetPermIds)

    const isSame =
      currentSet.size === targetSet.size &&
      Array.from(currentSet).every((id) => targetSet.has(id))

    if (isSame) {
      toast.info('Bộ quyền hiện tại đã khớp sẵn.')
      setBatchLoading(false)
      return
    }

    try {
      // Sử dụng API đồng bộ nguyên tử (Transaction) trên Backend
      await adminApi.syncRolePermissions(role.id, targetPermIds)

      setMatrix((prev) => {
        const next = new Map(prev)
        next.set(role.id, new Set(targetPermIds))
        return next
      })

      // Làm mới quyền của user hiện tại
      await refreshUserProfile()

      toast.success(`${actionLabel} cho vai trò "${role.role_name}" thành công!`)
      publishEvent({
        type: 'PERMISSION_CHANGED',
        title: 'Đồng bộ hàng loạt quyền RBAC',
        message: `Vai trò "${role.role_name}" vừa được cập nhật quyền hạn hàng loạt.`,
      })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Có lỗi khi cập nhật hàng loạt. Vui lòng thử lại.')
    } finally {
      setBatchLoading(false)
      setConfirmClearAll(false)
    }
  }

  const handleToggleGroup = async (groupCodes: string[]) => {
    if (!selectedRole || isSelectedAdmin) return
    const groupPerms = groupCodes.map(permByCode).filter((p): p is Permission => !!p)
    const currentSet = matrix.get(selectedRole.id) || new Set<number>()
    const allGrantedInGroup = groupPerms.every((p) => currentSet.has(p.id))

    const nextSet = new Set(currentSet)
    if (allGrantedInGroup) {
      groupPerms.forEach((p) => nextSet.delete(p.id))
    } else {
      groupPerms.forEach((p) => nextSet.add(p.id))
    }

    await applyTargetPermissions(
      selectedRole,
      Array.from(nextSet),
      allGrantedInGroup ? 'Đã tắt toàn bộ nhóm quyền' : 'Đã bật toàn bộ nhóm quyền'
    )
  }

  // ─── Tạo Vai trò Mới ───────────────────────────────────────────────────────
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = createForm.role_name.trim()
    if (!trimmed) {
      toast.error('Vui lòng nhập tên vai trò.')
      return
    }

    setCreateLoading(true)
    try {
      const res = await adminApi.createRole({
        role_name: trimmed,
        description: createForm.description.trim() || undefined,
      })
      const newRole: Role = res.data?.data?.role || res.data?.role || res.data

      toast.success(`Tạo vai trò "${newRole.role_name}" thành công!`)
      setCreateModalOpen(false)
      setCreateForm({ role_name: '', description: '' })

      // Tải lại và chọn vai trò mới
      await fetchAll(newRole.id)

      publishEvent({
        type: 'PERMISSION_CHANGED',
        title: 'Vai trò mới được tạo',
        message: `Vai trò "${newRole.role_name}" vừa được thêm vào hệ thống.`,
      })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Không thể tạo vai trò mới.')
    } finally {
      setCreateLoading(false)
    }
  }

  // ─── Chỉnh sửa Vai trò ─────────────────────────────────────────────────────
  const openEditModal = () => {
    if (!selectedRole) return
    setEditForm({
      role_name: selectedRole.role_name,
      description: selectedRole.description || '',
    })
    setEditModalOpen(true)
  }

  const handleEditRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRole) return
    const trimmed = editForm.role_name.trim()
    if (!trimmed) {
      toast.error('Tên vai trò không được để trống.')
      return
    }

    setEditLoading(true)
    try {
      const payload: { role_name?: string; description?: string } = {
        description: editForm.description.trim() || undefined,
      }
      if (!isSelectedAdmin) {
        payload.role_name = trimmed
      }

      const res = await adminApi.updateRole(selectedRole.id, payload)
      const updated: Role = res.data?.data?.role || res.data?.role || res.data

      setRoles((prev) =>
        prev.map((r) => (r.id === selectedRole.id ? { ...r, ...updated } : r))
      )

      toast.success('Cập nhật thông tin vai trò thành công.')
      setEditModalOpen(false)

      publishEvent({
        type: 'PERMISSION_CHANGED',
        title: 'Cập nhật vai trò',
        message: `Thông tin vai trò "${selectedRole.role_name}" vừa được cập nhật.`,
      })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Cập nhật vai trò thất bại.')
    } finally {
      setEditLoading(false)
    }
  }

  // ─── Xóa Mềm Vai trò (Soft Delete) ─────────────────────────────────────────
  const handleDeleteRole = async () => {
    if (!selectedRole) return
    if (isSelectedAdmin) {
      toast.error('Không thể xóa vai trò Quản trị viên (Admin) mặc định của hệ thống.')
      return
    }

    const assignedCount = selectedRole.Users?.filter((u) => u.is_active).length || 0
    if (assignedCount > 0) {
      toast.error(
        `Vai trò "${selectedRole.role_name}" đang có ${assignedCount} người dùng hoạt động. Vui lòng chuyển các người dùng này sang vai trò khác trước khi xóa!`
      )
      setDeleteModalOpen(false)
      return
    }

    try {
      await adminApi.deleteRole(selectedRole.id)
      toast.success(`Đã xóa mềm vai trò "${selectedRole.role_name}".`)
      setDeleteModalOpen(false)

      // Refresh list
      await fetchAll()

      publishEvent({
        type: 'PERMISSION_CHANGED',
        title: 'Vai trò bị xóa mềm',
        message: `Vai trò "${selectedRole.role_name}" vừa bị vô hiệu hóa trong hệ thống.`,
      })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Không thể xóa vai trò này.')
    }
  }

  // ─── Khôi phục Vai trò Đã xóa Mềm ──────────────────────────────────────────
  const handleRestoreRole = async (roleId: number) => {
    try {
      await adminApi.restoreRole(roleId)
      toast.success('Đã khôi phục vai trò thành công.')
      await fetchAll(roleId)
      publishEvent({
        type: 'PERMISSION_CHANGED',
        title: 'Vai trò được khôi phục',
        message: 'Một vai trò vừa được kích hoạt lại trong hệ thống.',
      })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Khôi phục vai trò thất bại.')
    }
  }

  // ─── Mở Modal Gán Người Dùng ───────────────────────────────────────────────
  const openAssignUserModal = async () => {
    setAssignModalOpen(true)
    setLoadingUsers(true)
    try {
      const res = await adminApi.getUsers({ limit: 100 })
      const data = res.data?.data || res.data || {}
      const userList: UserOption[] = Array.isArray(data)
        ? data
        : Array.isArray(data.items)
        ? data.items
        : []
      setAllUsers(userList)
    } catch {
      toast.error('Không thể tải danh sách người dùng.')
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleAssignUser = async (userId: number) => {
    if (!selectedRole) return
    setAssigningUserId(userId)
    try {
      const res = await adminApi.assignUserRole(userId, selectedRole.id)
      const updatedUser = res.data?.data?.user || res.data?.user

      toast.success(`Đã gán "${updatedUser?.full_name || 'người dùng'}" vào vai trò "${selectedRole.role_name}".`)

      // Cập nhật danh sách local
      setAllUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role_id: selectedRole.id, Roles: { id: selectedRole.id, role_name: selectedRole.role_name } } : u))
      )

      // Cập nhật roles list
      await fetchAll(selectedRole.id)

      // Nếu người được gán là user đang đăng nhập
      if (currentUser && currentUser.id === userId) {
        await refreshUserProfile()
      }

      publishEvent({
        type: 'PERMISSION_CHANGED',
        title: 'Phân công vai trò người dùng',
        message: `Người dùng vừa được chuyển sang vai trò "${selectedRole.role_name}".`,
        targetUserId: userId,
      })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message || 'Không thể gán vai trò cho người dùng này.')
    } finally {
      setAssigningUserId(null)
    }
  }

  const filteredAssignableUsers = useMemo(() => {
    return allUsers.filter((u) => {
      if (!userSearch.trim()) return true
      const q = userSearch.trim().toLowerCase()
      return (
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      )
    })
  }, [allUsers, userSearch])

  return (
    <MainLayout breadcrumb="Ma trận Phân quyền RBAC">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-Pine tracking-tight flex items-center gap-2">
              <Shield className="w-6 h-6 text-Berry" />
              Trung tâm Phân quyền Vai trò (RBAC)
            </h1>
            <p className="text-xs sm:text-sm text-Mist mt-0.5">
              Quản lý toàn diện vòng đời vai trò, ma trận quyền hạn và phân công thành viên đồng bộ tức thời
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-Pine text-white text-xs sm:text-sm font-extrabold rounded-xl hover:bg-Pine/90 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Thêm vai trò mới
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* ─── Cột Trái (4 cột): Danh sách Vai trò ─── */}
            <div className="lg:col-span-4 space-y-3">
              <div className="bg-white rounded-xl border border-white p-4 shadow-[0_10px_28px_rgba(39,54,63,0.06)]">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-Pine flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-Berry" />
                    Danh sách Vai trò ({roles.length})
                  </span>

                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-Mist cursor-pointer hover:text-Pine">
                    <input
                      type="checkbox"
                      checked={includeInactive}
                      onChange={(e) => setIncludeInactive(e.target.checked)}
                      className="rounded border-Mist/40 text-Pine focus:ring-Pine"
                    />
                    Hiện vai trò đã tắt
                  </label>
                </div>

                <div className="space-y-2.5 max-h-[65vh] overflow-y-auto pr-1">
                  {roles.map((r) => {
                    const count = matrix.get(r.id)?.size ?? 0
                    const isSelected = r.id === selectedRoleId
                    const isAdminRole = r.role_name.toLowerCase() === 'admin'
                    const isInactive = r.is_active === false
                    const pct = permissions.length > 0 ? Math.round((count / permissions.length) * 100) : 0
                    const userCount = r.Users?.filter((u) => u.is_active).length || 0

                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRoleId(r.id)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                          isSelected
                            ? 'bg-Pine text-white border-Pine shadow-md'
                            : isInactive
                            ? 'bg-Snowflake/20 border-dashed border-Mist/40 opacity-75 text-Mist'
                            : 'bg-Snowflake/35 hover:bg-Snowflake/70 text-Pine border-Mist/25'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold">{r.role_name}</span>
                            {isAdminRole && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-Berry text-white text-[10px] font-bold">
                                <Lock className="w-2.5 h-2.5" /> Khóa bảo vệ
                              </span>
                            )}
                            {isInactive && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-Mist/20 text-Branch text-[10px] font-bold">
                                Đã vô hiệu hóa
                              </span>
                            )}
                          </div>
                          <span className={`text-xs font-extrabold ${isSelected ? 'text-Frostysilver' : 'text-Berry'}`}>
                            {count}/{permissions.length} quyền
                          </span>
                        </div>

                        <div className="flex items-center justify-between mt-1 text-xs">
                          <p className={`line-clamp-1 pr-2 ${isSelected ? 'text-Snowflake/75' : 'text-Branch'}`}>
                            {r.description || 'Vai trò nghiệp vụ trong hệ thống'}
                          </p>
                          <span className={`text-[11px] font-bold flex-shrink-0 flex items-center gap-1 ${isSelected ? 'text-white' : 'text-Pine'}`}>
                            <Users className="w-3 h-3" />
                            {userCount} TV
                          </span>
                        </div>

                        <div className="mt-3 h-1.5 w-full bg-black/15 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isSelected ? 'bg-Frostysilver' : 'bg-Pine'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </button>
                    )
                  })}

                  {roles.length === 0 && (
                    <EmptyState message="Không có vai trò nào phù hợp." />
                  )}
                </div>
              </div>
            </div>

            {/* ─── Cột Phải (8 cột): Bảng Điều khiển Chi tiết Vai trò ─── */}
            <div className="lg:col-span-8 space-y-4">
              {selectedRole ? (
                <div className="bg-white rounded-xl border border-white p-5 sm:p-6 shadow-[0_10px_28px_rgba(39,54,63,0.06)] space-y-5">
                  {/* Top Control Header */}
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-Mist/15">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-xl font-extrabold text-Pine">
                          Vai trò: {selectedRole.role_name}
                        </h2>
                        {isSelectedAdmin ? (
                          <span className="px-2.5 py-0.5 rounded-xl bg-Berry/15 text-Berry text-xs font-extrabold border border-Berry/30 inline-flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Hệ thống Mặc định
                          </span>
                        ) : isSelectedInactive ? (
                          <span className="px-2.5 py-0.5 rounded-xl bg-Mist/20 text-Branch text-xs font-extrabold border border-Mist/30">
                            Đã vô hiệu hóa (Soft Deleted)
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-xl bg-Snowflake text-Pine text-xs font-extrabold border border-Mist/30">
                            Đang hoạt động
                          </span>
                        )}
                        <span className="px-2.5 py-0.5 rounded-xl bg-Pine/10 text-Pine text-xs font-extrabold border border-Pine/20">
                          {selectedRole.Users?.filter((u) => u.is_active).length || 0} người dùng
                        </span>
                      </div>
                      <p className="text-xs text-Mist mt-1.5 leading-relaxed">
                        {selectedRole.description || 'Chưa có mô tả cho vai trò này.'}
                      </p>
                    </div>

                    {/* Role Actions (Sửa, Xóa, Khôi phục) */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isSelectedInactive ? (
                        <button
                          type="button"
                          onClick={() => handleRestoreRole(selectedRole.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-Pine text-white text-xs font-bold rounded-xl hover:bg-Pine/90 shadow-sm"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Khôi phục vai trò
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={openEditModal}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-Snowflake text-Pine hover:bg-Mist/30 text-xs font-bold rounded-xl border border-Mist/30 transition-all"
                            title="Chỉnh sửa thông tin vai trò"
                          >
                            <Pencil className="w-3.5 h-3.5 text-Pine" />
                            Sửa
                          </button>

                          {!isSelectedAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeleteModalOpen(true)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-Berry/10 text-Berry hover:bg-Berry hover:text-white text-xs font-bold rounded-xl border border-Berry/20 transition-all"
                              title="Xóa mềm vai trò"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Xóa
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Tabs Switcher: Phân quyền vs Người dùng */}
                  <div className="flex items-center gap-2 border-b border-Mist/20 pb-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('permissions')}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
                        activeTab === 'permissions'
                          ? 'bg-Pine text-white shadow-sm'
                          : 'bg-Snowflake/60 text-Pine hover:bg-Snowflake'
                      }`}
                    >
                      <Shield className="w-3.5 h-3.5" />
                      Ma trận Phân quyền ({matrix.get(selectedRole.id)?.size ?? 0}/{permissions.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('users')}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
                        activeTab === 'users'
                          ? 'bg-Pine text-white shadow-sm'
                          : 'bg-Snowflake/60 text-Pine hover:bg-Snowflake'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      Người dùng thuộc Vai trò ({selectedRole.Users?.filter((u) => u.is_active).length || 0})
                    </button>
                  </div>

                  {/* TAB 1: MA TRẬN PHÂN QUYỀN */}
                  {activeTab === 'permissions' && (
                    <div className="space-y-4">
                      {/* Bulk Actions Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-Snowflake/30 p-3 rounded-2xl border border-Mist/20">
                        <span className="text-xs font-bold text-Branch">
                          Đang bật <strong>{matrix.get(selectedRole.id)?.size ?? 0}</strong> trên tổng số <strong>{permissions.length}</strong> quyền
                        </span>

                        {isSelectedAdmin ? (
                          <div className="flex items-center gap-2">
                            {(matrix.get(selectedRole.id)?.size ?? 0) < permissions.length && (
                              <button
                                type="button"
                                disabled={batchLoading}
                                onClick={() =>
                                  applyTargetPermissions(
                                    selectedRole,
                                    permissions.map((p) => p.id),
                                    `Đã đồng bộ đủ ${permissions.length}/${permissions.length} quyền`
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-Berry text-white text-xs font-extrabold rounded-xl hover:bg-Berry/90 shadow-sm"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                Đồng bộ đủ {permissions.length} quyền tối cao
                              </button>
                            )}
                          </div>
                        ) : isSelectedInactive ? (
                          <span className="text-xs text-Berry font-bold">
                            Vai trò đang bị tắt. Kích hoạt lại để thay đổi quyền.
                          </span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            {RECOMMENDED_PRESETS[selectedRole.role_name] && (
                              <button
                                type="button"
                                disabled={batchLoading}
                                onClick={() => {
                                  const presetCodes = RECOMMENDED_PRESETS[selectedRole.role_name] || []
                                  const targetIds = permissions
                                    .filter((p) => presetCodes.includes(p.permission_code))
                                    .map((p) => p.id)
                                  applyTargetPermissions(selectedRole, targetIds, 'Đã khôi phục bộ quyền chuẩn')
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-Snowflake text-Pine hover:bg-Mist/30 text-xs font-extrabold rounded-xl border border-Mist/30 transition-all"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-Berry" />
                                Mẫu quyền chuẩn
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={batchLoading}
                              onClick={() =>
                                applyTargetPermissions(
                                  selectedRole,
                                  permissions.map((p) => p.id),
                                  'Đã cấp tất cả quyền'
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Pine/90 shadow-sm transition-all"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                              Chọn tất cả
                            </button>
                            <button
                              type="button"
                              disabled={batchLoading}
                              onClick={() => setConfirmClearAll(true)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-Berry/10 text-Berry hover:bg-Berry hover:text-white text-xs font-extrabold rounded-xl border border-Berry/20 transition-all"
                            >
                              <Square className="w-3.5 h-3.5" />
                              Xóa hết
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Cảnh báo khóa bảo vệ Admin */}
                      {isSelectedAdmin && (
                        <div className="flex items-start gap-3 bg-Snowflake/70 border border-Mist/35 rounded-2xl p-4">
                          <ShieldAlert className="w-5 h-5 text-Berry flex-shrink-0 mt-0.5" />
                          <div className="text-xs text-Branch leading-relaxed">
                            <strong className="text-Pine block mb-0.5">
                              Chốt chặn Bảo vệ Quản trị viên Tối cao (Root Admin Lock)
                            </strong>
                            Để ngăn ngừa rủi ro Quản trị viên vô tình bỏ tích quyền <code className="font-mono text-Berry">MANAGE_ROLES</code> dẫn đến mất quyền quản trị, các quyền của vai trò <strong>Admin</strong> được khóa bảo vệ mặc định (chỉ đọc).
                          </div>
                        </div>
                      )}

                      {/* Cảnh báo nếu vai trò bị vô hiệu hóa */}
                      {isSelectedInactive && (
                        <div className="flex items-start gap-3 bg-Berry/10 border border-Berry/30 rounded-2xl p-4">
                          <AlertTriangle className="w-5 h-5 text-Berry flex-shrink-0 mt-0.5" />
                          <div className="text-xs text-Branch leading-relaxed">
                            <strong className="text-Berry block mb-0.5">
                              Vai trò này đã bị xóa mềm (Vô hiệu hóa)
                            </strong>
                            Tất cả quyền của vai trò đang tạm ngưng hiệu lực và không thể phân công người dùng mới. Bạn có thể nhấn <strong>"Khôi phục vai trò"</strong> ở trên để đưa vai trò trở lại hoạt động.
                          </div>
                        </div>
                      )}

                      {/* Search inside permissions */}
                      <div className="relative">
                        <Search className="w-4 h-4 text-Mist absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Tìm nhanh mã quyền (VD: UPLOAD_DOC, APPROVE_VIOLATION)..."
                          className="w-full pl-9 pr-4 py-2.5 bg-Snowflake/30 border border-Mist/30 rounded-xl text-xs sm:text-sm text-Pine focus:outline-none focus:border-Pine"
                        />
                      </div>

                      {/* Permission Groups */}
                      <div className="space-y-4">
                        {Object.entries(PERMISSION_GROUPS).map(([groupName, codes]) => {
                          const groupPerms = codes
                            .map(permByCode)
                            .filter((p): p is Permission => !!p)
                            .filter((p) => {
                              if (!searchQuery.trim()) return true
                              const q = searchQuery.trim().toLowerCase()
                              return (
                                p.permission_code.toLowerCase().includes(q) ||
                                p.permission_name.toLowerCase().includes(q)
                              )
                            })

                          if (groupPerms.length === 0) return null

                          const allGranted = groupPerms.every((p) => hasPermission(selectedRole.id, p.id))

                          return (
                            <div key={groupName} className="rounded-2xl border border-Mist/25 overflow-hidden">
                              <div className="bg-Snowflake/60 px-4 py-2.5 flex items-center justify-between border-b border-Mist/20">
                                <span className="text-xs font-extrabold text-Pine uppercase tracking-wider">
                                  {groupName}
                                </span>
                                {!isSelectedAdmin && !isSelectedInactive && (
                                  <button
                                    type="button"
                                    disabled={batchLoading}
                                    onClick={() => handleToggleGroup(codes)}
                                    className="text-[11px] font-extrabold text-Pine hover:text-Berry underline transition-colors"
                                  >
                                    {allGranted ? 'Bỏ chọn nhóm này' : 'Chọn cả nhóm'}
                                  </button>
                                )}
                              </div>

                              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white">
                                {groupPerms.map((perm) => {
                                  const granted = hasPermission(selectedRole.id, perm.id)
                                  const key = `${selectedRole.id}-${perm.id}`
                                  const isToggling = toggling.has(key)

                                  return (
                                    <div
                                      key={perm.id}
                                      onClick={() => !isSelectedAdmin && !isSelectedInactive && handleToggle(selectedRole, perm)}
                                      className={`p-3 rounded-xl border flex items-start justify-between gap-3 transition-all ${
                                        isSelectedAdmin || isSelectedInactive
                                          ? 'bg-Snowflake/40 border-Mist/25 opacity-80 cursor-not-allowed'
                                          : granted
                                          ? 'bg-Pine/[0.04] border-Pine/40 cursor-pointer hover:bg-Pine/[0.08]'
                                          : 'bg-white border-Mist/25 cursor-pointer hover:bg-Snowflake/40'
                                      }`}
                                    >
                                      <div className="min-w-0">
                                        <span className="font-mono text-xs font-extrabold text-Pine block">
                                          {perm.permission_code}
                                        </span>
                                        <span className="text-xs text-Branch mt-0.5 block leading-snug">
                                          {perm.permission_name}
                                        </span>
                                      </div>

                                      <div
                                        className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                                          granted
                                            ? 'bg-Pine text-white shadow-sm'
                                            : 'bg-Snowflake text-Mist border border-Mist/30'
                                        }`}
                                      >
                                        {isToggling ? (
                                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        ) : isSelectedAdmin ? (
                                          <Lock className="w-3.5 h-3.5" />
                                        ) : granted ? (
                                          <Check className="w-3.5 h-3.5" />
                                        ) : null}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: NGƯỜI DÙNG THUỘC VAI TRÒ */}
                  {activeTab === 'users' && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-Snowflake/30 p-3 rounded-2xl border border-Mist/20">
                        <div>
                          <h3 className="text-sm font-extrabold text-Pine">
                            Danh sách Thành viên ({selectedRole.Users?.filter((u) => u.is_active).length || 0})
                          </h3>
                          <p className="text-xs text-Mist mt-0.5">
                            Các người dùng này tự động sở hữu toàn bộ {matrix.get(selectedRole.id)?.size ?? 0} quyền được cấp cho vai trò {selectedRole.role_name}
                          </p>
                        </div>

                        {!isSelectedInactive && (
                          <button
                            type="button"
                            onClick={openAssignUserModal}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Pine/90 shadow-sm"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Gán thêm người dùng
                          </button>
                        )}
                      </div>

                      {/* Danh sách người dùng */}
                      <div className="space-y-2.5">
                        {(selectedRole.Users || []).filter((u) => u.is_active).map((usr) => (
                          <div
                            key={usr.id}
                            className="p-3.5 rounded-xl border border-Mist/20 bg-white flex items-center justify-between gap-3 shadow-xs"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-Pine/10 text-Pine font-extrabold flex items-center justify-center text-sm flex-shrink-0">
                                {usr.full_name?.charAt(0)?.toUpperCase() || 'U'}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs sm:text-sm font-extrabold text-Pine">
                                    {usr.full_name}
                                  </span>
                                  {usr.id === currentUser?.id && (
                                    <span className="px-2 py-0.5 bg-Berry/10 text-Berry rounded-lg text-[10px] font-bold">
                                      Bạn
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-Branch block">{usr.email}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 rounded-xl bg-Snowflake text-Pine text-[11px] font-bold border border-Mist/30">
                                {matrix.get(selectedRole.id)?.size ?? 0} quyền kế thừa
                              </span>
                            </div>
                          </div>
                        ))}

                        {(!selectedRole.Users || selectedRole.Users.filter((u) => u.is_active).length === 0) && (
                          <div className="py-10 text-center bg-Snowflake/20 rounded-2xl border border-dashed border-Mist/40 p-6">
                            <Users className="w-8 h-8 text-Mist mx-auto mb-2 opacity-50" />
                            <p className="text-xs sm:text-sm font-bold text-Pine">
                              Chưa có người dùng nào được gán vào vai trò này
                            </p>
                            <p className="text-xs text-Mist mt-1 max-w-sm mx-auto">
                              Bấm nút &quot;Gán thêm người dùng&quot; ở trên để phân công nhân sự vào vai trò và nhận quyền tự động.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-white p-12 text-center shadow-sm">
                  <Shield className="w-12 h-12 text-Mist mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-bold text-Pine">Vui lòng chọn một vai trò từ danh sách bên trái</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── MODAL 1: THÊM VAI TRÒ MỚI ─────────────────────────────────────────── */}
      <Modal
        isOpen={createModalOpen}
        title="Thêm Vai trò Mới"
        onClose={() => !createLoading && setCreateModalOpen(false)}
      >
        <form onSubmit={handleCreateRole} className="space-y-4">
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">
              Tên vai trò *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={createForm.role_name}
              onChange={(e) => setCreateForm((f) => ({ ...f, role_name: e.target.value }))}
              placeholder="VD: Compliance Auditor, Purchasing Staff..."
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Pine"
            />
            <p className="text-[11px] text-Mist mt-1">
              Tên vai trò sẽ tự động chuẩn hóa và không được trùng với các vai trò đã có.
            </p>
          </div>

          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">
              Mô tả trách nhiệm & chức năng
            </label>
            <textarea
              rows={3}
              value={createForm.description}
              onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả phạm vi quyền hạn và trách nhiệm của vai trò..."
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-white text-Pine resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-Mist/20">
            <button
              type="button"
              disabled={createLoading}
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-extrabold text-Mist hover:bg-Snowflake transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={createLoading}
              className="px-5 py-2 bg-Pine text-white rounded-xl text-xs font-extrabold hover:bg-Pine/90 shadow-sm disabled:opacity-50"
            >
              {createLoading ? 'Đang tạo...' : 'Tạo vai trò'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL 2: CHỈNH SỬA VAI TRÒ ────────────────────────────────────────── */}
      <Modal
        isOpen={editModalOpen}
        title={`Chỉnh sửa Vai trò: ${selectedRole?.role_name}`}
        onClose={() => !editLoading && setEditModalOpen(false)}
      >
        <form onSubmit={handleEditRole} className="space-y-4">
          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">
              Tên vai trò *
            </label>
            <input
              type="text"
              required
              disabled={isSelectedAdmin}
              value={editForm.role_name}
              onChange={(e) => setEditForm((f) => ({ ...f, role_name: e.target.value }))}
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm font-bold focus:outline-none focus:border-Pine bg-white text-Pine disabled:bg-Snowflake/70 disabled:text-Mist"
            />
            {isSelectedAdmin && (
              <p className="text-[11px] text-Berry mt-1 font-bold">
                * Vai trò Quản trị viên (Admin) mặc định được bảo vệ không thể thay đổi tên.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-Pine mb-1.5">
              Mô tả trách nhiệm & chức năng
            </label>
            <textarea
              rows={3}
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả phạm vi quyền hạn và trách nhiệm của vai trò..."
              className="w-full px-3.5 py-2.5 border border-Mist/40 rounded-xl text-sm focus:outline-none focus:border-Pine bg-white text-Pine resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-Mist/20">
            <button
              type="button"
              disabled={editLoading}
              onClick={() => setEditModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-extrabold text-Mist hover:bg-Snowflake transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={editLoading}
              className="px-5 py-2 bg-Pine text-white rounded-xl text-xs font-extrabold hover:bg-Pine/90 shadow-sm disabled:opacity-50"
            >
              {editLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL 3: XÁC NHẬN XÓA MỀM VAI TRÒ ─────────────────────────────────── */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        title={`Xác nhận xóa mềm vai trò "${selectedRole?.role_name}"?`}
        message={
          (selectedRole?.Users?.filter((u) => u.is_active).length || 0) > 0
            ? `CẢNH BÁO: Vai trò này đang được gán cho ${selectedRole?.Users?.filter((u) => u.is_active).length} người dùng đang hoạt động. Bạn phải chuyển toàn bộ các người dùng này sang vai trò khác trước khi có thể xóa vai trò!`
            : `Vai trò "${selectedRole?.role_name}" sẽ được đánh dấu vô hiệu hóa (Soft Delete) trong cơ sở dữ liệu. Lịch sử và dữ liệu liên quan vẫn được bảo lưu an toàn. Bạn có thể khôi phục lại vai trò này bất cứ lúc nào.`
        }
        confirmLabel={
          (selectedRole?.Users?.filter((u) => u.is_active).length || 0) > 0
            ? 'Đã hiểu'
            : 'Xác nhận xóa mềm'
        }
        variant="danger"
        onConfirm={
          (selectedRole?.Users?.filter((u) => u.is_active).length || 0) > 0
            ? () => setDeleteModalOpen(false)
            : handleDeleteRole
        }
        onCancel={() => setDeleteModalOpen(false)}
      />

      {/* ─── MODAL 4: GÁN NGƯỜI DÙNG VÀO VAI TRÒ ───────────────────────────────── */}
      <Modal
        isOpen={assignModalOpen}
        title={`Gán Người dùng vào Vai trò: ${selectedRole?.role_name}`}
        onClose={() => setAssignModalOpen(false)}
      >
        <div className="space-y-4">
          <p className="text-xs text-Mist leading-relaxed">
            Chọn người dùng để gán vào vai trò <strong>{selectedRole?.role_name}</strong>. Quyền hạn của người dùng sẽ có hiệu lực ngay lập tức mà không cần đăng nhập lại.
          </p>

          <div className="relative">
            <Search className="w-4 h-4 text-Mist absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc email người dùng..."
              className="w-full pl-9 pr-3 py-2 border border-Mist/30 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-Pine bg-white text-Pine"
            />
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
            {loadingUsers ? (
              <div className="flex justify-center py-8"><Spinner size="md" /></div>
            ) : filteredAssignableUsers.length > 0 ? (
              filteredAssignableUsers.map((usr) => {
                const isCurrentRole = usr.role_id === selectedRole?.id
                const isAssigning = assigningUserId === usr.id

                return (
                  <div
                    key={usr.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                      isCurrentRole
                        ? 'bg-Pine/[0.04] border-Pine/30'
                        : 'bg-white border-Mist/25 hover:border-Mist/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-extrabold text-Pine">
                          {usr.full_name}
                        </span>
                        {usr.id === currentUser?.id && (
                          <span className="px-1.5 py-0.5 bg-Berry/10 text-Berry rounded text-[10px] font-bold">
                            Bạn
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-Branch block">{usr.email}</span>
                      <span className="text-[11px] text-Mist font-semibold mt-0.5 block">
                        Vai trò hiện tại: <strong>{usr.Roles?.role_name || 'Chưa gán'}</strong>
                      </span>
                    </div>

                    <div>
                      {isCurrentRole ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-Pine/15 text-Pine text-xs font-extrabold rounded-xl border border-Pine/30">
                          <Check className="w-3.5 h-3.5" /> Đang thuộc vai trò này
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isAssigning}
                          onClick={() => handleAssignUser(usr.id)}
                          className="px-3 py-1.5 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Pine/90 transition-all shadow-xs disabled:opacity-50"
                        >
                          {isAssigning ? 'Đang gán...' : 'Chuyển sang vai trò này'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="py-6 text-center text-xs text-Mist">
                Không tìm thấy người dùng phù hợp.
              </div>
            )}
          </div>

          <div className="flex justify-end pt-3 border-t border-Mist/20">
            <button
              type="button"
              onClick={() => setAssignModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-extrabold text-Pine bg-Snowflake hover:bg-Mist/30 transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Clear All */}
      <ConfirmModal
        isOpen={confirmClearAll}
        title={`Thu hồi toàn bộ quyền của "${selectedRole?.role_name}"?`}
        message={`Tất cả các quyền hạn của vai trò "${selectedRole?.role_name}" sẽ bị gỡ bỏ ngay lập tức. Bạn có thể bấm "Mẫu quyền chuẩn" để khôi phục lại bất cứ lúc nào.`}
        confirmLabel="Đồng ý xóa hết quyền"
        variant="danger"
        onConfirm={() => selectedRole && applyTargetPermissions(selectedRole, [], 'Đã thu hồi toàn bộ quyền')}
        onCancel={() => setConfirmClearAll(false)}
      />
    </MainLayout>
  )
}
