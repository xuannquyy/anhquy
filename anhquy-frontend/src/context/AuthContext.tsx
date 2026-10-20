import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react'
import { authApi } from '../api'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number
  email: string
  full_name: string
  is_active: boolean
  role?: string
  permissions?: string[]
  created_at?: string
  updated_at?: string
  Roles?: {
    id: number
    role_name: string
    description?: string
  }
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  role: string | null
  permissions: string[]
  isLoading: boolean
  isAuthenticated: boolean
  hasPermission: (code: string) => boolean
  login: (token: string, userData: AuthUser, perms?: string[], refreshToken?: string) => void
  logout: () => void
  refreshUserProfile: () => Promise<void>
}

// ─── Bộ quyền chuẩn theo seed.ts (dùng làm fallback nếu API chưa trả mảng permissions) ───

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  Admin: [
    'MANAGE_USERS',
    'MANAGE_ROLES',
    'MANAGE_SYSTEM_CONFIGS',
    'VIEW_AUDIT_LOGS',
    'MANAGE_CATEGORIES',
    'MANAGE_SYSTEM_STANDARDS',
    'VIEW_SUPPLIER',
    'CREATE_SUPPLIER',
    'EDIT_SUPPLIER',
    'DELETE_SUPPLIER',
    'VIEW_DOC',
    'DELETE_DOC',
    'VIEW_STANDARD',
    'VIEW_VIOLATION',
    'EXPORT_REPORT',
  ],
  Manager: [
    'VIEW_SUPPLIER',
    'CREATE_SUPPLIER',
    'EDIT_SUPPLIER',
    'DELETE_SUPPLIER',
    'MANAGE_CATEGORIES',
    'VIEW_DOC',
    'UPLOAD_DOC',
    'DELETE_DOC',
    'RUN_AI_AUDIT',
    'VIEW_STANDARD',
    'CREATE_CUSTOM_STANDARD',
    'VIEW_VIOLATION',
    'APPROVE_VIOLATION',
    'EXPORT_REPORT',
  ],
  User: [
    'VIEW_SUPPLIER',
    'CREATE_SUPPLIER',
    'EDIT_SUPPLIER',
    'VIEW_DOC',
    'UPLOAD_DOC',
    'RUN_AI_AUDIT',
    'VIEW_STANDARD',
    'CREATE_CUSTOM_STANDARD',
    'VIEW_VIOLATION',
    'EXPORT_REPORT',
  ],
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('access_token'))
  const [role, setRole] = useState<string | null>(() => localStorage.getItem('user_role'))
  const [permissions, setPermissions] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('user_permissions') || '[]') as string[]
    } catch {
      return []
    }
  })
  const [isLoading, setIsLoading] = useState(true)

  const logout = useCallback(() => {
    authApi.logout().catch(() => {})
    localStorage.clear()
    setToken(null)
    setUser(null)
    setRole(null)
    setPermissions([])
  }, [])

  const refreshUserProfile = useCallback(async () => {
    try {
      const res = await authApi.me()
      const data = res.data?.data || res.data
      const userData: AuthUser = data.user || data
      const resolvedRole = userData.role || userData.Roles?.role_name || null

      const apiPerms: string[] | undefined =
        data.permissions || userData.permissions

      const finalPerms: string[] =
        Array.isArray(apiPerms) && apiPerms.length > 0
          ? apiPerms
          : resolvedRole
          ? DEFAULT_ROLE_PERMISSIONS[resolvedRole] || []
          : []

      setUser({ ...userData, role: resolvedRole || undefined })
      setRole(resolvedRole)
      setPermissions(finalPerms)
      localStorage.setItem('user_permissions', JSON.stringify(finalPerms))
      localStorage.setItem('user_role', resolvedRole || '')
    } catch {
      logout()
    }
  }, [logout])

  // Khôi phục phiên đăng nhập khi load app
  useEffect(() => {
    const storedToken = localStorage.getItem('access_token')
    if (!storedToken) {
      setIsLoading(false)
      return
    }
    refreshUserProfile().finally(() => setIsLoading(false))
  }, [refreshUserProfile])

  const login = useCallback(
    (newToken: string, userData: AuthUser, perms?: string[], refreshToken?: string) => {
      const resolvedRole = userData.role || userData.Roles?.role_name || null
      const apiPerms = perms && perms.length > 0 ? perms : userData.permissions
      const finalPerms =
        Array.isArray(apiPerms) && apiPerms.length > 0
          ? apiPerms
          : resolvedRole
          ? DEFAULT_ROLE_PERMISSIONS[resolvedRole] || []
          : []

      localStorage.setItem('access_token', newToken)
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken)
      }
      localStorage.setItem('user_permissions', JSON.stringify(finalPerms))
      localStorage.setItem('user_role', resolvedRole || '')

      setToken(newToken)
      setUser({ ...userData, role: resolvedRole || undefined })
      setRole(resolvedRole)
      setPermissions(finalPerms)
    },
    []
  )

  const hasPermission = useCallback(
    (code: string) => permissions.includes(code),
    [permissions]
  )

  const value: AuthContextValue = {
    user,
    token,
    role,
    permissions,
    isLoading,
    isAuthenticated: !!token && !!user,
    hasPermission,
    login,
    logout,
    refreshUserProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải dùng bên trong AuthProvider')
  return ctx
}