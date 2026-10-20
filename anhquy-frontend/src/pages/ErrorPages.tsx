import { Link, useNavigate } from 'react-router-dom'
import { ShieldAlert, FileQuestion, ArrowLeft, Home } from 'lucide-react'
import { MainLayout } from '../components/MainLayout'
import { useAuth } from '../context/AuthContext'

/**
 * Trang 403 — Hiển thị khi tài khoản không có quyền (permission_code) truy cập chức năng.
 */
export function ForbiddenPage({ requiredPermission }: { requiredPermission?: string }) {
  const navigate = useNavigate()
  const { role } = useAuth()

  return (
    <MainLayout breadcrumb="403 – Hạn chế truy cập">
      <div className="flex items-center justify-center min-h-[70vh] px-4">
        <div className="bg-white rounded-lg border border-Mist/30 shadow-md max-w-lg w-full p-8 text-center">
          <div className="w-16 h-16 bg-Berry/10 text-Berry rounded-lg flex items-center justify-center mx-auto mb-5 border border-Berry/20">
            <ShieldAlert className="w-9 h-9" />
          </div>

          <span className="inline-block px-3 py-1 rounded-md bg-Berry/10 text-Berry text-xs font-bold uppercase tracking-wider mb-3">
            Mã lỗi 403 · Access Denied
          </span>

          <h1 className="text-2xl font-bold text-Pine mb-2">
            Không đủ quyền truy cập chức năng
          </h1>

          <p className="text-sm text-Branch leading-relaxed mb-6">
            Vai trò hiện tại của bạn (<strong className="text-Pine">{role || 'Người dùng'}</strong>) không được cấp quyền thực hiện nghiệp vụ này.
            {requiredPermission && (
              <span className="block mt-2 text-xs text-Mist">
                Quyền yêu cầu: <code className="font-mono bg-Snowflake px-2 py-0.5 rounded text-Berry font-semibold">{requiredPermission}</code>
              </span>
            )}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 border border-Mist/40 text-Branch text-sm font-medium rounded-md hover:bg-Snowflake transition-all duration-300"
            >
              <ArrowLeft className="w-4 h-4" />
              Quay lại trang trước
            </button>
            <Link
              to="/dashboard"
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 shadow-sm hover:shadow-md transition-all duration-300"
            >
              <Home className="w-4 h-4" />
              Về Tổng quan
            </Link>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

/**
 * Trang 404 — Hiển thị khi người dùng truy cập đường dẫn URL không tồn tại.
 */
export function NotFoundPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  const content = (
    <div className="flex items-center justify-center min-h-[75vh] px-4">
      <div className="bg-white rounded-lg border border-Mist/30 shadow-md max-w-lg w-full p-8 text-center">
        <div className="w-16 h-16 bg-Pine/10 text-Pine rounded-lg flex items-center justify-center mx-auto mb-5 border border-Pine/20">
          <FileQuestion className="w-9 h-9" />
        </div>

        <span className="inline-block px-3 py-1 rounded-md bg-Snowflake text-Mist text-xs font-bold uppercase tracking-wider mb-3">
          Mã lỗi 404 · Page Not Found
        </span>

        <h1 className="text-2xl font-bold text-Pine mb-2">
          Trang bạn tìm kiếm không tồn tại
        </h1>

        <p className="text-sm text-Branch leading-relaxed mb-6">
          Đường dẫn URL có thể đã bị nhập sai hoặc tài nguyên kiểm toán này đã được di chuyển.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 border border-Mist/40 text-Branch text-sm font-medium rounded-md hover:bg-Snowflake transition-all duration-300"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </button>
          <Link
            to={isAuthenticated ? '/dashboard' : '/login'}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-Pine text-white text-sm font-medium rounded-md hover:bg-Pine/90 shadow-sm hover:shadow-md transition-all duration-300"
          >
            <Home className="w-4 h-4" />
            {isAuthenticated ? 'Về Trang Tổng quan' : 'Về Trang Đăng nhập'}
          </Link>
        </div>
      </div>
    </div>
  )

  if (isAuthenticated) {
    return <MainLayout breadcrumb="404 – Không tìm thấy trang">{content}</MainLayout>
  }

  return <div className="min-h-screen bg-Snowflake flex items-center justify-center">{content}</div>
}