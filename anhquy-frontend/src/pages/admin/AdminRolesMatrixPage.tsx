import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Shield, Check, Lock, Search, CheckSquare, Square,
  Sparkles, ShieldAlert, Layers
} from 'lucide-react'
import { MainLayout } from '../../components/MainLayout'
import { ConfirmModal, Spinner } from '../../components/ui'
import { useRealtime } from '../../context/RealtimeContext'
import { adminApi } from '../../api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Role {
  id: number
  role_name: string
  description?: string
  Role_Permissions?: { permission_id: number }[]
}

interface Permission {
  id: number
  permission_code: string
  permission_name: string
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

  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // roleId → Set<permissionId>
  const [matrix, setMatrix] = useState<Map<number, Set<number>>>(new Map())
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      try {
        const [rolesRes, permsRes] = await Promise.all([
          adminApi.getRolesMatrix(),
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
          // Mặc định mở sẵn vai trò Manager (hoặc vai trò đầu tiên) để tiện chỉnh sửa
          const defaultRole = normalizedRoles.find((r) => r.role_name === 'Manager') || normalizedRoles[0]
          setSelectedRoleId(defaultRole.id)
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
    }
    fetchAll()
  }, [])

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) || null,
    [roles, selectedRoleId]
  )

  // Vai trò Admin được khóa bảo vệ chống thu hồi quyền
  const isSelectedAdmin = selectedRole?.role_name?.toLowerCase() === 'admin'

  const hasPermission = (roleId: number, permId: number) =>
    matrix.get(roleId)?.has(permId) ?? false

  const permByCode = (code: string) => permissions.find((p) => p.permission_code === code)

  // ─── Bật / Tắt từng quyền đơn lẻ ───────────────────────────────────────────
  const handleToggle = async (role: Role, perm: Permission) => {
    if (role.role_name.toLowerCase() === 'admin') {
      toast.error('Vai trò Admin được khóa bảo vệ mặc định để tránh mất quyền quản trị hệ thống.')
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

  // ─── Thao tác Hàng loạt: Chọn tất cả / Bỏ chọn tất cả / Chọn theo nhóm ────
  const applyTargetPermissions = async (role: Role, targetPermIds: number[], actionLabel: string) => {
    if (batchLoading) return
    setBatchLoading(true)
    const currentSet = matrix.get(role.id) || new Set<number>()
    const targetSet = new Set<number>(targetPermIds)

    const toGrant = permissions.filter((p) => targetSet.has(p.id) && !currentSet.has(p.id))
    const toRevoke =
      role.role_name.toLowerCase() === 'admin'
        ? []
        : permissions.filter((p) => !targetSet.has(p.id) && currentSet.has(p.id))

    if (toGrant.length === 0 && toRevoke.length === 0) {
      toast.info('Bộ quyền hiện tại đã khớp sẵn.')
      setBatchLoading(false)
      return
    }

    try {
      await Promise.all([
        ...toGrant.map((p) => adminApi.grantPermission(role.id, p.id)),
        ...toRevoke.map((p) => adminApi.revokePermission(role.id, p.id)),
      ])

      setMatrix((prev) => {
        const next = new Map(prev)
        const updated = new Set(currentSet)
        toGrant.forEach((p) => updated.add(p.id))
        toRevoke.forEach((p) => updated.delete(p.id))
        next.set(role.id, updated)
        return next
      })

      toast.success(`${actionLabel} cho vai trò "${role.role_name}" thành công!`)
      publishEvent({
        type: 'PERMISSION_CHANGED',
        title: 'Đồng bộ hàng loạt quyền RBAC',
        message: `Vai trò "${role.role_name}" vừa được cập nhật quyền hạn hàng loạt.`,
      })
    } catch {
      toast.error('Có lỗi khi cập nhật hàng loạt. Vui lòng thử lại.')
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
              Thiết kế phân tách theo từng Vai trò giúp mở rộng không giới hạn số lượng Role và bảo vệ an toàn quyền Admin
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* ─── Cột Trái (4 cột): Danh sách Vai trò (Mở rộng thoải mái 10+ Role) ─── */}
            <div className="lg:col-span-4 space-y-3">
              <div className="bg-white rounded-3xl border border-white p-4 shadow-[0_10px_28px_rgba(39,54,63,0.06)]">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-Pine flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-Berry" />
                    Danh sách Vai trò ({roles.length})
                  </span>
                  <span className="text-[11px] font-semibold text-Mist">Chọn để cấu hình</span>
                </div>

                <div className="space-y-2.5 max-h-[65vh] overflow-y-auto pr-1">
                  {roles.map((r) => {
                    const count = matrix.get(r.id)?.size ?? 0
                    const isSelected = r.id === selectedRoleId
                    const isAdminRole = r.role_name.toLowerCase() === 'admin'
                    const pct = permissions.length > 0 ? Math.round((count / permissions.length) * 100) : 0

                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRoleId(r.id)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                          isSelected
                            ? 'bg-Pine text-white border-Pine shadow-md'
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
                          </div>
                          <span className={`text-xs font-extrabold ${isSelected ? 'text-Frostysilver' : 'text-Berry'}`}>
                            {count}/{permissions.length} quyền
                          </span>
                        </div>
                        <p className={`text-xs line-clamp-2 ${isSelected ? 'text-Snowflake/75' : 'text-Branch'}`}>
                          {r.description || 'Vai trò nghiệp vụ trong hệ thống'}
                        </p>
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
                </div>
              </div>
            </div>

            {/* ─── Cột Phải (8 cột): Bảng Điều khiển Quyền của Vai trò đang chọn ─── */}
            <div className="lg:col-span-8 space-y-4">
              {selectedRole && (
                <div className="bg-white rounded-3xl border border-white p-5 sm:p-6 shadow-[0_10px_28px_rgba(39,54,63,0.06)] space-y-5">
                  {/* Top Control Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-Mist/15">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-xl font-extrabold text-Pine">
                          Vai trò: {selectedRole.role_name}
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-xl bg-Snowflake text-Pine text-xs font-extrabold border border-Mist/30">
                          Đang bật {matrix.get(selectedRole.id)?.size ?? 0} / {permissions.length} quyền
                        </span>
                      </div>
                      <p className="text-xs text-Mist mt-1">{selectedRole.description}</p>
                    </div>

                    {/* Bulk Actions */}
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
                                'Đã đồng bộ đủ 19/19 quyền tối cao'
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-Berry text-white text-xs font-extrabold rounded-xl hover:bg-Berry/90 shadow-sm"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Đồng bộ đủ {permissions.length}/{permissions.length} quyền
                          </button>
                        )}
                      </div>
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
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-Snowflake text-Pine hover:bg-Mist/30 text-xs font-extrabold rounded-xl border border-Mist/30 transition-all"
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
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-Pine text-white text-xs font-extrabold rounded-xl hover:bg-Pine/90 shadow-sm transition-all"
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                          Chọn tất cả
                        </button>
                        <button
                          type="button"
                          disabled={batchLoading}
                          onClick={() => setConfirmClearAll(true)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-Berry/10 text-Berry hover:bg-Berry hover:text-white text-xs font-extrabold rounded-xl border border-Berry/20 transition-all"
                        >
                          <Square className="w-3.5 h-3.5" />
                          Xóa hết
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Cảnh báo khóa bảo vệ nếu đang đứng ở vai trò Admin */}
                  {isSelectedAdmin && (
                    <div className="flex items-start gap-3 bg-Snowflake/70 border border-Mist/35 rounded-2xl p-4">
                      <ShieldAlert className="w-5 h-5 text-Berry flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-Branch leading-relaxed">
                        <strong className="text-Pine block mb-0.5">
                          Chốt chặn Bảo vệ Quản trị viên Tối cao (Root Admin Lock)
                        </strong>
                        Để ngăn ngừa rủi ro Quản trị viên vô tình bỏ tích quyền <code className="font-mono text-Berry">MANAGE_ROLES</code> dẫn đến khóa vĩnh viễn toàn hệ thống, các quyền của vai trò <strong>Admin</strong> được khóa bảo vệ mặc định (chỉ đọc).
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
                            {!isSelectedAdmin && (
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
                                  onClick={() => !isSelectedAdmin && handleToggle(selectedRole, perm)}
                                  className={`p-3 rounded-xl border flex items-start justify-between gap-3 transition-all ${
                                    isSelectedAdmin
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
            </div>
          </div>
        )}
      </div>

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