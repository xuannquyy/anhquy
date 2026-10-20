import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Shield, Check, X } from 'lucide-react'
import { MainLayout } from '../../components/MainLayout'
import { Spinner } from '../../components/ui'
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
  'Tài liệu & AI': ['VIEW_DOC', 'UPLOAD_DOC', 'DELETE_DOC', 'RUN_AI_AUDIT'],
  'Vi phạm & Báo cáo': ['VIEW_VIOLATION', 'APPROVE_VIOLATION', 'EXPORT_REPORT'],
  'Nhà cung ứng': ['VIEW_SUPPLIER', 'CREATE_SUPPLIER', 'EDIT_SUPPLIER', 'DELETE_SUPPLIER'],
  'Tiêu chuẩn & Danh mục': ['VIEW_STANDARD', 'CREATE_CUSTOM_STANDARD', 'MANAGE_SYSTEM_STANDARDS', 'MANAGE_CATEGORIES'],
  'Quản trị Hệ thống': ['MANAGE_USERS', 'MANAGE_ROLES', 'MANAGE_SYSTEM_CONFIGS', 'VIEW_AUDIT_LOGS'],
}

export default function AdminRolesMatrixPage() {
  const { publishEvent } = useRealtime()

  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  // roleId → Set<permissionId>
  const [matrix, setMatrix] = useState<Map<number, Set<number>>>(new Map())
  const [toggling, setToggling] = useState<Set<string>>(new Set())

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      try {
        const [rolesRes, permsRes] = await Promise.all([
          adminApi.getRolesMatrix(),
          adminApi.getAllPermissions(),
        ])
        const rolesData: Role[] = (rolesRes.data?.data || rolesRes.data || []) as Role[]
        const permsData: Permission[] = (permsRes.data?.data || permsRes.data || []) as Permission[]

        // Normalize roles data
        const normalizedRoles = Array.isArray(rolesData)
          ? rolesData
          : (rolesData as { roles?: Role[] })?.roles || []
        const normalizedPerms = Array.isArray(permsData)
          ? permsData
          : (permsData as { permissions?: Permission[] })?.permissions || []

        setRoles(normalizedRoles)
        setPermissions(normalizedPerms)

        // Build matrix
        const m = new Map<number, Set<number>>()
        for (const role of normalizedRoles) {
          const permIds = new Set<number>(
            (role.Role_Permissions || []).map((rp) => rp.permission_id)
          )
          m.set(role.id, permIds)
        }
        setMatrix(m)
      } catch {
        toast.error('Không thể tải ma trận phân quyền.')
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const hasPermission = (roleId: number, permId: number) =>
    matrix.get(roleId)?.has(permId) ?? false

  const handleToggle = async (role: Role, perm: Permission) => {
    const key = `${role.id}-${perm.id}`
    if (toggling.has(key)) return
    setToggling((prev) => new Set(prev).add(key))

    const current = hasPermission(role.id, perm.id)
    // Optimistic update
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
        toast.success(`Đã thu hồi quyền "${perm.permission_name}" khỏi vai trò "${role.role_name}".`)
      } else {
        await adminApi.grantPermission(role.id, perm.id)
        toast.success(`Đã cấp quyền "${perm.permission_name}" cho vai trò "${role.role_name}".`)
      }
      // Phát realtime để mọi tab của role này cập nhật ngay
      publishEvent({
        type: 'PERMISSION_CHANGED',
        title: 'Ma trận quyền đã được cập nhật',
        message: `Quyền "${perm.permission_code}" của vai trò "${role.role_name}" vừa ${current ? 'bị thu hồi' : 'được cấp thêm'}. Giao diện sẽ tự động cập nhật.`,
      })
    } catch (err: unknown) {
      // Rollback
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

  const permByCode = (code: string) => permissions.find((p) => p.permission_code === code)

  return (
    <MainLayout breadcrumb="Ma trận Phân quyền">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-Pine flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Ma trận Phân quyền RBAC
          </h1>
          <p className="text-sm text-Mist mt-0.5">
            Tick / bỏ tick để cấp hoặc thu hồi quyền theo thời gian thực
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <div className="bg-white rounded-lg border border-Mist/20 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-Pine text-white">
                    <th className="px-4 py-3 text-left text-sm font-semibold w-64">Quyền hạn</th>
                    {roles.map((role) => (
                      <th key={role.id} className="px-4 py-3 text-center text-sm font-semibold min-w-[120px]">
                        <div>{role.role_name}</div>
                        <div className="text-xs font-normal text-white/60 mt-0.5">{role.description}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(PERMISSION_GROUPS).map(([groupName, codes]) => (
                    <>
                      {/* Group header */}
                      <tr key={`group-${groupName}`} className="bg-Snowflake">
                        <td colSpan={roles.length + 1} className="px-4 py-2">
                          <span className="text-xs font-bold text-Pine uppercase tracking-wider">{groupName}</span>
                        </td>
                      </tr>
                      {codes.map((code) => {
                        const perm = permByCode(code)
                        if (!perm) return null
                        return (
                          <tr key={perm.id} className="border-t border-Mist/8 hover:bg-Snowflake/30 transition-colors">
                            <td className="px-4 py-3">
                              <div>
                                <span className="font-mono text-xs text-Pine font-bold">{perm.permission_code}</span>
                                <p className="text-xs text-Mist mt-0.5 leading-snug">{perm.permission_name}</p>
                              </div>
                            </td>
                            {roles.map((role) => {
                              const key = `${role.id}-${perm.id}`
                              const granted = hasPermission(role.id, perm.id)
                              const isToggling = toggling.has(key)
                              return (
                                <td key={role.id} className="px-4 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleToggle(role, perm)}
                                    disabled={isToggling}
                                    className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 hover:scale-110 ${
                                      granted
                                        ? 'bg-Pine text-white shadow-sm'
                                        : 'bg-Snowflake text-Mist border border-Mist/30 hover:border-Pine/30'
                                    } ${isToggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                    title={granted ? 'Thu hồi quyền' : 'Cấp quyền'}
                                  >
                                    {isToggling ? (
                                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : granted ? (
                                      <Check className="w-4 h-4" />
                                    ) : (
                                      <X className="w-4 h-4" />
                                    )}
                                  </button>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-Snowflake/50 border-t border-Mist/10 flex items-center gap-6 text-xs text-Mist">
              <span className="flex items-center gap-2"><span className="w-5 h-5 bg-Pine rounded flex items-center justify-center"><Check className="w-3 h-3 text-white" /></span>Đã cấp quyền</span>
              <span className="flex items-center gap-2"><span className="w-5 h-5 bg-Snowflake border border-Mist/30 rounded flex items-center justify-center"><X className="w-3 h-3 text-Mist" /></span>Chưa cấp</span>
              <span className="text-Mist/60">Thay đổi được áp dụng ngay lập tức trên toàn hệ thống.</span>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

