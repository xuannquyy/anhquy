import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ShieldCheck, Eye, EyeOff, ChevronRight } from 'lucide-react'
import { useAuth, type AuthUser } from '../context/AuthContext'
import { authApi } from '../api'
import { Modal } from '../components/ui'

interface LoginResponse {
  token?: string
  refresh_token?: string
  user?: AuthUser
  permissions?: string[]
}

const DEMO_ACCOUNTS = [
  { role: 'Admin',   email: 'admin@anhquy.com',   password: 'Password@123', color: 'bg-Berry text-white' },
  { role: 'Manager', email: 'manager@anhquy.com', password: 'Password@123', color: 'bg-Pine text-white' },
  { role: 'User',    email: 'user@anhquy.com',    password: 'Password@123', color: 'bg-Branch text-white' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [logoError, setLogoError]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Vui lòng nhập đầy đủ Email và Mật khẩu.')
      return
    }
    setLoading(true)
    try {
      const res = await authApi.login(email.trim(), password)
      const data = (res.data?.data || res.data) as LoginResponse
      const token        = data?.token ?? ''
      const refreshToken = data?.refresh_token
      const userData     = data?.user
      const permissions  = data?.permissions ?? userData?.permissions ?? []

      if (!token || !userData) {
        toast.error('Phản hồi từ máy chủ không hợp lệ.')
        return
      }

      login(token, userData, permissions, refreshToken)
      toast.success(`Chào mừng, ${userData.full_name}!`)
      navigate('/dashboard')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      toast.error(axiosErr?.response?.data?.message || 'Đăng nhập thất bại. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (acc: { email: string; password: string }) => {
    setEmail(acc.email)
    setPassword(acc.password)
  }

  return (
    <div className="min-h-screen flex">
      {/* ─── Left: Branding ──────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-5/12 bg-Pine text-white p-12">
        <div className="flex items-center gap-3">
          {!logoError ? (
            <img
              src="/logo.png"
              alt="ANHQUY Logo"
              onError={() => setLogoError(true)}
              className="w-9 h-9 object-contain rounded-md bg-white/10 p-1"
            />
          ) : (
            <ShieldCheck className="w-8 h-8 text-Frostysilver" />
          )}
          <span className="text-xl font-bold tracking-tight">ANHQUY</span>
        </div>

        <div>
          <div className="mb-8">
            <span className="inline-block px-3 py-1 rounded-md bg-white/10 text-Frostysilver text-xs font-medium mb-4">
              RBA Compliant · ISO 45001 · Luật Lao động VN
            </span>
            <h1 className="text-4xl font-bold leading-tight mb-4">
              Hệ thống AI<br />Kiểm toán Hợp đồng<br />Chuỗi Cung ứng
            </h1>
            <p className="text-white/60 text-base leading-relaxed">
              Tự động phát hiện vi phạm trong hợp đồng mua bán, gia công, dịch vụ theo chuẩn
              RBA (Responsible Business Alliance) và Pháp luật Việt Nam. Giảm rủi ro pháp lý,
              nâng cao đạo đức kinh doanh.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { num: '24+', label: 'Tiêu chuẩn RBA & VN' },
              { num: '100%', label: 'Bảo mật dữ liệu' },
              { num: 'AI', label: 'Gemini 1.5 Flash' },
            ].map((stat) => (
              <div key={stat.num} className="bg-white/10 rounded-lg p-4">
                <div className="text-2xl font-bold text-Frostysilver">{stat.num}</div>
                <div className="text-xs text-white/50 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-white/30 text-xs">
          © 2026 ANHQUY. Dành cho nội bộ doanh nghiệp.
        </div>
      </div>

      {/* ─── Right: Form ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-Snowflake px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <ShieldCheck className="w-7 h-7 text-Pine" />
            <span className="text-xl font-bold text-Pine">ANHQUY</span>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-Mist/20 p-8">
            <h2 className="text-2xl font-bold text-Pine mb-1">Đăng nhập</h2>
            <p className="text-sm text-Mist mb-8">Nhập thông tin tài khoản nội bộ của bạn</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-Branch mb-1.5">
                  Địa chỉ Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine bg-white text-Branch placeholder-Mist transition-all"
                  placeholder="manager@anhquy.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-Branch mb-1.5">
                  Mật khẩu
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2.5 pr-10 border border-Mist/40 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-Pine/30 focus:border-Pine bg-white text-Branch placeholder-Mist transition-all"
                    placeholder="Nhập mật khẩu"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-Mist hover:text-Branch transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-sm text-Mist hover:text-Pine transition-colors"
                >
                  Quên mật khẩu?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-Pine text-white font-medium rounded-md hover:bg-Pine/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300 shadow-sm hover:shadow-md flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Đăng nhập <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Demo accounts */}
            <div className="mt-6 pt-6 border-t border-Mist/20">
              <p className="text-xs text-Mist mb-3 text-center">
                Điền nhanh Tài khoản Demo (Dành cho bảo vệ đồ án)
              </p>
              <div className="flex gap-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.role}
                    type="button"
                    onClick={() => fillDemo(acc)}
                    className={`flex-1 py-2 text-xs font-medium rounded-md transition-all duration-200 hover:opacity-80 ${acc.color}`}
                  >
                    {acc.role}
                  </button>
                ))}
              </div>
              <p className="text-xs text-Mist/60 text-center mt-2">Mật khẩu mặc định: Password@123</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Forgot Password Modal ────────────────────────────────────────────── */}
      <Modal
        isOpen={forgotOpen}
        title="Quên mật khẩu?"
        onClose={() => setForgotOpen(false)}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center w-14 h-14 bg-Pine/8 rounded-md mx-auto">
            <ShieldCheck className="w-7 h-7 text-Pine" />
          </div>
          <h4 className="text-center font-semibold text-Pine">Quy trình bảo mật nội bộ B2B</h4>
          <p className="text-sm text-Branch leading-relaxed text-center">
            Vì lý do bảo mật dữ liệu kiểm toán nội bộ, mật khẩu chỉ được đặt lại thông qua yêu cầu chính thức gửi đến
            <strong className="text-Pine"> Quản trị viên Hệ thống (IT Admin)</strong>.
          </p>
          <div className="bg-Snowflake rounded-md p-4 space-y-2">
            <p className="text-sm font-medium text-Pine">Các bước thực hiện:</p>
            <ol className="text-sm text-Branch space-y-1 list-decimal list-inside">
              <li>Liên hệ IT Admin qua email <code className="text-Pine bg-white px-1 rounded">admin@anhquy.com</code></li>
              <li>Cung cấp họ tên và phòng ban để xác minh danh tính</li>
              <li>Admin sẽ cấp mật khẩu mới trong mục Quản lý Người dùng</li>
              <li>Đăng nhập và đổi lại mật khẩu tại trang Hồ sơ cá nhân</li>
            </ol>
          </div>
          <button
            type="button"
            onClick={() => setForgotOpen(false)}
            className="w-full py-2.5 bg-Pine text-white rounded-md text-sm font-medium hover:bg-Pine/90 transition-all duration-300"
          >
            Đã hiểu
          </button>
        </div>
      </Modal>
    </div>
  )
}