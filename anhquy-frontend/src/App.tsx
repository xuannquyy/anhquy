import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './context/AuthContext'
import { RealtimeProvider } from './context/RealtimeContext'
import { ProtectedRoute } from './components/ProtectedRoute'

// ─── Phase 4 Pages ────────────────────────────────────────────────────────────
import LoginPage        from './pages/LoginPage'
import DashboardPage    from './pages/DashboardPage'
import ProfilePage      from './pages/ProfilePage'
import SuppliersPage    from './pages/SuppliersPage'
import CategoriesPage   from './pages/CategoriesPage'
import DocumentsPage    from './pages/DocumentsPage'

// ─── Phase 5 Pages ────────────────────────────────────────────────────────────
import AuditWorkspacePage    from './pages/AuditWorkspacePage'
import ViolationsPage        from './pages/ViolationsPage'
import StandardsPage         from './pages/StandardsPage'
import AdminUsersPage        from './pages/admin/AdminUsersPage'
import AdminRolesMatrixPage  from './pages/admin/AdminRolesMatrixPage'
import AdminConfigsPage      from './pages/admin/AdminConfigsPage'
import AdminAuditLogsPage    from './pages/admin/AdminAuditLogsPage'
import { ForbiddenPage, NotFoundPage } from './pages/ErrorPages'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RealtimeProvider>
          {/* Toaster tùy chỉnh theo bảng màu Winter */}
          <Toaster
            position="top-right"
            richColors
            expand={false}
            duration={4000}
            toastOptions={{
              style: {
                fontFamily: '"Be Vietnam Pro", sans-serif',
                fontSize: '13px',
              },
            }}
          />

          <Routes>
            {/* ── Public ── */}
            <Route path="/login" element={<LoginPage />} />

            {/* ── General Protected ── */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />

            {/* ── Module 2: Nhà cung ứng & Danh mục & Tài liệu ── */}
            <Route
              path="/suppliers"
              element={
                <ProtectedRoute permission="VIEW_SUPPLIER">
                  <SuppliersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/categories"
              element={
                <ProtectedRoute permission="MANAGE_CATEGORIES">
                  <CategoriesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/documents"
              element={
                <ProtectedRoute permission="VIEW_DOC">
                  <DocumentsPage />
                </ProtectedRoute>
              }
            />

            {/* ── Module 3: Phòng Kiểm Toán AI ── */}
            <Route
              path="/audit/:id"
              element={
                <ProtectedRoute permission="VIEW_DOC">
                  <AuditWorkspacePage />
                </ProtectedRoute>
              }
            />

            {/* ── Module 4: Thẩm định vi phạm & Tiêu chuẩn ── */}
            <Route
              path="/violations"
              element={
                <ProtectedRoute permission="VIEW_VIOLATION">
                  <ViolationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/standards"
              element={
                <ProtectedRoute permission="VIEW_STANDARD">
                  <StandardsPage />
                </ProtectedRoute>
              }
            />

            {/* ── Admin Module ── */}
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute permission="MANAGE_USERS">
                  <AdminUsersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/roles"
              element={
                <ProtectedRoute permission="MANAGE_ROLES">
                  <AdminRolesMatrixPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/system-configs"
              element={
                <ProtectedRoute permission="MANAGE_SYSTEM_CONFIGS">
                  <AdminConfigsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/audit-logs"
              element={
                <ProtectedRoute permission="VIEW_AUDIT_LOGS">
                  <AdminAuditLogsPage />
                </ProtectedRoute>
              }
            />

            {/* ── Error Routes (403 & 404) ── */}
            <Route
              path="/403"
              element={
                <ProtectedRoute>
                  <ForbiddenPage />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </RealtimeProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}