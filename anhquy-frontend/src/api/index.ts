import axiosClient from './axiosClient'

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    axiosClient.post('/auth/login', { email, password }),

  logout: () =>
    axiosClient.post('/auth/logout'),

  me: () =>
    axiosClient.get('/auth/me'),

  changePassword: (oldPassword: string, newPassword: string) =>
    axiosClient.put('/auth/change-password', { oldPassword, newPassword }),

  updateProfile: (data: { full_name: string }) =>
    axiosClient.put('/auth/profile', data),
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const dashboardApi = {
  getStats: () =>
    axiosClient.get('/dashboard/stats'),
}

// ─── Suppliers ───────────────────────────────────────────────────────────────
export const supplierApi = {
  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    axiosClient.get('/suppliers', { params }),

  getById: (id: number) =>
    axiosClient.get(`/suppliers/${id}`),

  create: (data: Record<string, unknown>) =>
    axiosClient.post('/suppliers', data),

  update: (id: number, data: Record<string, unknown>) =>
    axiosClient.put(`/suppliers/${id}`, data),

  delete: (id: number) =>
    axiosClient.delete(`/suppliers/${id}`),

  restore: (id: number) =>
    axiosClient.patch(`/suppliers/${id}/restore`),
}

// ─── Categories ──────────────────────────────────────────────────────────────
export const categoryApi = {
  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    axiosClient.get('/categories', { params }),

  getById: (id: number) =>
    axiosClient.get(`/categories/${id}`),

  create: (data: Record<string, unknown>) =>
    axiosClient.post('/categories', data),

  update: (id: number, data: Record<string, unknown>) =>
    axiosClient.put(`/categories/${id}`, data),

  delete: (id: number) =>
    axiosClient.delete(`/categories/${id}`),

  restore: (id: number) =>
    axiosClient.put(`/categories/${id}`, { is_active: true }),
}

// ─── Documents ───────────────────────────────────────────────────────────────
export const documentApi = {
  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    axiosClient.get('/documents', { params }),

  getById: (id: number) =>
    axiosClient.get(`/documents/${id}`),

  upload: (formData: FormData) =>
    axiosClient.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  delete: (id: number) =>
    axiosClient.delete(`/documents/${id}`),

  analyze: (id: number) =>
    axiosClient.post(`/documents/${id}/analyze`),

  getViolations: (id: number) =>
    axiosClient.get(`/documents/${id}/violations`),
}

// ─── Violations ──────────────────────────────────────────────────────────────
export const violationApi = {
  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    axiosClient.get('/violations', { params }),

  getById: (id: number) =>
    axiosClient.get(`/violations/${id}`),

  review: (id: number, status: 'Approved' | 'Rejected') =>
    axiosClient.patch(`/violations/${id}/review`, { status }),
}

// ─── Standards ───────────────────────────────────────────────────────────────
export const standardApi = {
  getGroups: () =>
    axiosClient.get('/standards/groups'),

  getAll: (params?: Record<string, string | number | boolean | undefined>) =>
    axiosClient.get('/standards', { params }),

  getById: (id: number) =>
    axiosClient.get(`/standards/${id}`),

  create: (data: Record<string, unknown>) =>
    axiosClient.post('/standards', data),

  update: (id: number, data: Record<string, unknown>) =>
    axiosClient.put(`/standards/${id}`, data),

  delete: (id: number) =>
    axiosClient.delete(`/standards/${id}`),

  getExcluded: () =>
    axiosClient.get('/standards/excluded'),

  exclude: (id: number) =>
    axiosClient.post(`/standards/${id}/exclude`),

  include: (id: number) =>
    axiosClient.delete(`/standards/${id}/exclude`),
}

// ─── Admin ───────────────────────────────────────────────────────────────────
export const adminApi = {
  getUsers: (params?: Record<string, string | number | boolean | undefined>) =>
    axiosClient.get('/admin/users', { params }),

  getUserById: (id: number) =>
    axiosClient.get(`/admin/users/${id}`),

  createUser: (data: Record<string, unknown>) =>
    axiosClient.post('/admin/users', data),

  updateUser: (id: number, data: Record<string, unknown>) =>
    axiosClient.put(`/admin/users/${id}`, data),

  resetPassword: (id: number, newPassword: string) =>
    axiosClient.post(`/admin/users/${id}/reset-password`, { newPassword }),

  getRolesMatrix: () =>
    axiosClient.get('/admin/roles'),

  getAllPermissions: () =>
    axiosClient.get('/admin/permissions'),

  grantPermission: (roleId: number, permissionId: number) =>
    axiosClient.post(`/admin/roles/${roleId}/permissions/${permissionId}`),

  revokePermission: (roleId: number, permissionId: number) =>
    axiosClient.delete(`/admin/roles/${roleId}/permissions/${permissionId}`),

  getAuditLogs: (params?: Record<string, string | number | boolean | undefined>) =>
    axiosClient.get('/admin/audit-logs', { params }),

  getSystemConfigs: () =>
    axiosClient.get('/admin/system-configs'),

  updateSystemConfig: (key: string, value: string) =>
    axiosClient.put(`/admin/system-configs/${key}`, { config_value: value }),

  getRiskThresholds: () =>
    axiosClient.get('/admin/risk-thresholds'),

  updateRiskThreshold: (id: number, data: Record<string, unknown>) =>
    axiosClient.put(`/admin/risk-thresholds/${id}`, data),
}