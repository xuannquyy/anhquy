import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ShieldCheck, Eye, EyeOff, ArrowRight, Sparkles, Lock } from 'lucide-react'
import { useAuth, type AuthUser } from '../context/AuthContext'
import { authApi } from '../api'
import { Modal } from '../components/ui'

interface LoginResponse {
  token?: string
  refresh_token?: string
  user?: AuthUser
  permissions?: string[]
}

type PortalStatus = 'idle' | 'loading' | 'success' | 'error'

// Danh sách các hạt lấp lánh cố định
const SPARKLES = [
  { top: '14%', left: '18%', size: 3, delay: '0s', duration: '3.2s' },
  { top: '22%', left: '78%', size: 4, delay: '0.7s', duration: '4.1s' },
  { top: '68%', left: '15%', size: 2, delay: '1.3s', duration: '2.8s' },
  { top: '75%', left: '82%', size: 3, delay: '0.4s', duration: '3.6s' },
  { top: '35%', left: '28%', size: 2, delay: '1.9s', duration: '4.5s' },
  { top: '42%', left: '72%', size: 3, delay: '1.1s', duration: '3.0s' },
  { top: '84%', left: '48%', size: 2, delay: '2.2s', duration: '3.9s' },
  { top: '12%', left: '54%', size: 3, delay: '0.2s', duration: '3.4s' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPw, setShowPw]             = useState(false)
  const [status, setStatus]             = useState<PortalStatus>('idle')
  const [forgotOpen, setForgotOpen]     = useState(false)
  const [logoError, setLogoError]       = useState(false)
  const [bgHandsError, setBgHandsError] = useState(false)
  const [welcomeName, setWelcomeName]   = useState('')

  // Tính khoảng cách tiến lại gần nhau của 2 bàn tay khi người dùng gõ phím
  const typingProgress = Math.min(1, (email.trim().length > 0 ? 0.5 : 0) + (password.length > 0 ? 0.5 : 0))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setStatus('error')
      toast.error('Vui lòng nhập đầy đủ Email và Mật khẩu.')
      setTimeout(() => setStatus('idle'), 900)
      return
    }

    setStatus('loading')
    try {
      const res = await authApi.login(email.trim(), password)
      const data = (res.data?.data || res.data) as LoginResponse
      const token        = data?.token ?? ''
      const refreshToken = data?.refresh_token
      const userData     = data?.user
      const permissions  = data?.permissions ?? userData?.permissions ?? []

      if (!token || !userData) {
        setStatus('error')
        toast.error('Phản hồi từ máy chủ không hợp lệ.')
        setTimeout(() => setStatus('idle'), 900)
        return
      }

      // Kích hoạt hiệu ứng 2 bàn tay chạm nhau + Lóe sáng mở cổng
      setWelcomeName(userData.full_name)
      setStatus('success')

      setTimeout(() => {
        login(token, userData, permissions, refreshToken)
        toast.success(`Chào mừng, ${userData.full_name}!`)
        navigate('/dashboard')
      }, 1250)
    } catch (err: unknown) {
      setStatus('error')
      const axiosErr = err as { response?: { data?: { message?: string } } }
      toast.error(axiosErr?.response?.data?.message || 'Thông tin xác thực không chính xác.')
      setTimeout(() => setStatus('idle'), 1000)
    }
  }

  // Tính toán vị trí dịch chuyển của 2 bàn tay theo trạng thái
  const leftHandOffset =
    status === 'success'
      ? 'translate-x-[34px] scale-105'
      : status === 'loading'
      ? 'translate-x-[22px]'
      : status === 'error'
      ? '-translate-x-[18px] -rotate-6'
      : typingProgress === 1
      ? 'translate-x-[14px]'
      : typingProgress > 0
      ? 'translate-x-[6px]'
      : 'translate-x-0'

  const rightHandOffset =
    status === 'success'
      ? '-translate-x-[34px] scale-105'
      : status === 'loading'
      ? '-translate-x-[22px]'
      : status === 'error'
      ? 'translate-x-[18px] rotate-6'
      : typingProgress === 1
      ? '-translate-x-[14px]'
      : typingProgress > 0
      ? '-translate-x-[6px]'
      : 'translate-x-0'

  return (
    <div className="min-h-screen w-full bg-[#090E14] text-white flex flex-col justify-between relative overflow-hidden select-none">
      {/* ─── CSS Keyframes nội bộ ────────────────────────────────────────────── */}
      <style>{`
        @keyframes cyberShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        @keyframes pulseSpark {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        .animate-cyber-shake {
          animation: cyberShake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }
      `}</style>

      {/* ─── 1. Lớp Ánh sáng Chiếu Xéo (Volumetric Spotlight) ────────────────── */}
      <div
        className="pointer-events-none absolute -top-40 right-[-10%] w-[750px] h-[750px] opacity-35 blur-3xl transition-all duration-700"
        style={{
          background:
            status === 'error'
              ? 'conic-gradient(from 215deg at 70% 20%, transparent 0deg, #6B212C 45deg, transparent 95deg)'
              : 'conic-gradient(from 215deg at 70% 20%, transparent 0deg, #DCE0E8 35deg, #8EA1AE 60deg, transparent 105deg)',
        }}
      />

      {/* Ánh sáng Hào quang Trung tâm */}
      <div
        className={`pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] rounded-full blur-[130px] transition-all duration-700 ${
          status === 'success'
            ? 'bg-white opacity-95 scale-150'
            : status === 'error'
            ? 'bg-Berry opacity-45 scale-110'
            : 'bg-Pine opacity-55'
        }`}
      />

      {/* Tùy chọn nền ảnh ai-hands.png nếu có trong thư mục public */}
      {!bgHandsError && (
        <img
          src="/ai-hands.png"
          alt=""
          onError={() => setBgHandsError(true)}
          className={`pointer-events-none absolute inset-0 w-full h-full object-cover mix-blend-screen transition-all duration-1000 ${
            status === 'success' ? 'opacity-60 scale-110' : 'opacity-20 scale-100'
          }`}
        />
      )}

      {/* ─── 2. Các hạt bụi sao lấp lánh ─────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {SPARKLES.map((sp, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-Snowflake shadow-[0_0_10px_#DCE0E8]"
            style={{
              top: sp.top,
              left: sp.left,
              width: `${sp.size}px`,
              height: `${sp.size}px`,
              animation: `pulseSpark ${sp.duration} ease-in-out ${sp.delay} infinite`,
            }}
          />
        ))}
      </div>

      {/* ─── 3. LỚP NỔ ÁNH SÁNG KHI ĐĂNG NHẬP THÀNH CÔNG ─────────────────────── */}
      <div
        className={`fixed inset-0 z-50 pointer-events-none flex flex-col items-center justify-center transition-all duration-700 ${
          status === 'success' ? 'opacity-100 backdrop-blur-xl bg-white/90' : 'opacity-0'
        }`}
      >
        {status === 'success' && (
          <div className="text-center transform scale-100 transition-transform duration-500">
            <div className="w-20 h-20 rounded-lg bg-Pine text-white flex items-center justify-center mx-auto mb-4 shadow-[0_0_60px_#27363F]">
              <Sparkles className="w-10 h-10 text-Frostysilver animate-spin" />
            </div>
            <p className="text-xs font-extrabold tracking-[0.35em] uppercase text-Berry mb-2">
              ANHQUY
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-Pine tracking-tight">
              WELCOME, {welcomeName.toUpperCase()}
            </h2>
          </div>
        )}
      </div>

      {/* ─── 4. TOP HEADER TỐI GIẢN: CHỈ GIỮ LẠI LOGO & ANHQUY ─────────────── */}
      <header className="relative z-20 flex items-center px-6 sm:px-12 pt-6">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-white shadow-[0_0_25px_rgba(220,224,232,0.35)] flex items-center justify-center p-1.5 border border-Snowflake">
            {!logoError ? (
              <img
                src="/logo.png"
                alt="ANHQUY"
                onError={() => setLogoError(true)}
                className="w-full h-full object-contain"
              />
            ) : (
              <ShieldCheck className="w-6 h-6 text-Pine" />
            )}
          </div>
          <span className="text-xl font-extrabold tracking-widest text-white leading-none">
            ANHQUY
          </span>
        </div>
      </header>

      {/* ─── 5. TRUNG TÂM: HAI BÀN TAY ROBOT - NGƯỜI & KHUNG ĐĂNG NHẬP CỐ ĐỊNH ─ */}
      <main className="relative z-20 flex-1 flex flex-col items-center justify-center px-4 py-6">
        {/* Khu vực Tương tác Hai bàn tay (Robot AI bên trái - Con người bên phải) */}
        <div className="relative w-full max-w-md h-24 mb-2 flex items-center justify-center">
          {/* Bàn tay Robot AI (Trái) */}
          <div
            className={`transition-all duration-500 ease-out flex items-center ${leftHandOffset}`}
          >
            <svg
              className="w-36 h-20 text-Mist drop-shadow-[0_0_12px_rgba(142,161,174,0.6)]"
              viewBox="0 0 180 90"
              fill="none"
            >
              <path
                d="M5 55 L55 50 L85 36 L115 36 L132 42"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path
                d="M10 68 L60 63 L95 56 L125 52"
                stroke="#DCE0E8"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
              <path
                d="M85 36 L130 32 L166 44 L132 49 Z"
                fill="rgba(142,161,174,0.25)"
                stroke="#DCE0E8"
                strokeWidth="2"
              />
              <circle cx="55" cy="50" r="4" fill="#DCE0E8" />
              <circle cx="85" cy="36" r="4" fill="#DCE0E8" />
              <circle cx="130" cy="32" r="3" fill="#BEB3AC" />
              <circle cx="166" cy="44" r="3.5" fill="#FFFFFF" />
            </svg>
          </div>

          {/* Điểm Chạm Năng Lượng ở Giữa (Spark Core) */}
          <div className="relative flex items-center justify-center w-10 h-10 -mx-3 z-10">
            <div
              className={`rounded-full transition-all duration-500 ${
                status === 'success'
                  ? 'w-28 h-28 bg-white shadow-[0_0_90px_40px_rgba(255,255,255,1)] scale-150'
                  : status === 'loading'
                  ? 'w-6 h-6 bg-Snowflake shadow-[0_0_30px_10px_rgba(220,224,232,0.9)] animate-ping'
                  : status === 'error'
                  ? 'w-7 h-7 bg-Berry shadow-[0_0_35px_12px_rgba(107,33,44,0.95)]'
                  : typingProgress === 1
                  ? 'w-4 h-4 bg-Snowflake shadow-[0_0_20px_6px_rgba(220,224,232,0.8)] animate-pulse'
                  : 'w-2 h-2 bg-Mist/60 shadow-[0_0_12px_rgba(142,161,174,0.5)]'
              }`}
            />
          </div>

          {/* Bàn tay Con người (Phải) */}
          <div
            className={`transition-all duration-500 ease-out flex items-center ${rightHandOffset}`}
          >
            <svg
              className="w-36 h-20 text-Frostysilver drop-shadow-[0_0_12px_rgba(190,179,172,0.55)]"
              viewBox="0 0 180 90"
              fill="none"
            >
              <path
                d="M175 54 C145 50, 120 34, 92 33 C65 33, 38 40, 14 44 C38 50, 62 48, 86 48 C68 55, 58 62, 74 66 C95 66, 125 63, 170 68"
                fill="rgba(190,179,172,0.22)"
                stroke="#BEB3AC"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="14" cy="44" r="3.5" fill="#FFE4E6" />
            </svg>
          </div>
        </div>

        {/* ─── Khung Đăng nhập Kính Mờ (Đứng im cố định, không nhấp nhô) ──────── */}
        <div
          className={`relative w-full max-w-[400px] rounded-lg p-8 sm:p-9 bg-white/[0.05] backdrop-blur-2xl border transition-all duration-300 shadow-[0_25px_70px_rgba(0,0,0,0.75)] ${
            status === 'error'
              ? 'border-Berry animate-cyber-shake shadow-[0_0_40px_rgba(107,33,44,0.45)]'
              : status === 'success'
              ? 'border-white scale-95 opacity-0 duration-700'
              : 'border-white/15'
          }`}
        >
          {/* Biểu tượng Hạt nhân Ánh sáng phía trên chữ WELCOME */}
          <div className="relative z-10 text-center mb-7">
            <div className="w-11 h-11 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <Sparkles className="w-5 h-5 text-Snowflake" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-wider text-white">
              WELCOME
            </h1>
            <p className="text-xs text-Mist mt-1">
              Đăng nhập vào hệ thống ANHQUY
            </p>
          </div>

          {/* Form Đăng nhập */}
          <form onSubmit={handleSubmit} className="relative z-10 space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-md bg-white/[0.06] border border-white/12 text-sm text-white placeholder-Mist/60 focus:outline-none focus:bg-white/[0.1] focus:border-Snowflake/60 focus:shadow-[0_0_15px_rgba(220,224,232,0.15)] transition-all"
                placeholder="Email doanh nghiệp"
                autoComplete="email"
              />
            </div>

            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-10 rounded-md bg-white/[0.06] border border-white/12 text-sm text-white placeholder-Mist/60 focus:outline-none focus:bg-white/[0.1] focus:border-Snowflake/60 focus:shadow-[0_0_15px_rgba(220,224,232,0.15)] transition-all"
                placeholder="Mật khẩu"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-Mist hover:text-white transition-colors p-1"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-xs text-Mist hover:text-Snowflake transition-colors"
              >
                Quên mật khẩu?
              </button>
            </div>

            <button
              type="submit"
              disabled={status === 'loading' || status === 'success'}
              className="w-full py-3 bg-Snowflake text-Pine text-sm font-extrabold rounded-md hover:bg-white hover:shadow-[0_0_25px_rgba(220,224,232,0.5)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2 mt-2"
            >
              {status === 'loading' ? (
                <div className="w-4 h-4 border-2 border-Pine/30 border-t-Pine rounded-md animate-spin" />
              ) : (
                <>
                  <span>Đăng nhập</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Khoảng đệm cân bằng bố cục dọc */}
      <div className="h-10" />

      {/* ─── Modal Quên mật khẩu ─────────────────────────────────────────────── */}
      <Modal
        isOpen={forgotOpen}
        title="Hỗ trợ Cấp lại Mật khẩu Nội bộ"
        onClose={() => setForgotOpen(false)}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center w-12 h-12 bg-Pine/10 rounded-lg mx-auto">
            <Lock className="w-6 h-6 text-Pine" />
          </div>
          <h4 className="text-center font-bold text-Pine">Chính sách Bảo mật B2B</h4>
          <p className="text-sm text-Branch leading-relaxed text-center">
            Vì lý do bảo mật dữ liệu kiểm toán nội bộ, mật khẩu tài khoản chỉ được cấp lại thông qua{' '}
            <strong className="text-Pine">Quản trị viên Hệ thống (IT Admin)</strong>.
          </p>
          <div className="bg-Snowflake/70 rounded-md p-4 space-y-2 border border-Mist/20">
            <p className="text-xs font-bold uppercase tracking-wider text-Pine">Quy trình xử lý:</p>
            <ol className="text-xs text-Branch space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>Liên hệ Quản trị viên qua email <code className="text-Pine font-bold bg-white px-1.5 py-0.5 rounded">admin@anhquy.com</code></li>
              <li>Admin xác minh nhân sự và đặt lại mật khẩu tại mục Quản lý Tài khoản</li>
              <li>Đăng nhập bằng mật khẩu mới và đổi lại mật khẩu cá nhân tại trang Hồ sơ</li>
            </ol>
          </div>
          <button
            type="button"
            onClick={() => setForgotOpen(false)}
            className="w-full py-2.5 bg-Pine text-white rounded-md text-xs font-bold hover:bg-Pine/90 transition-all duration-200"
          >
            Đã hiểu
          </button>
        </div>
      </Modal>
    </div>
  )
}