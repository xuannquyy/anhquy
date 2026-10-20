import axios from 'axios'
import { toast } from 'sonner'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

const axiosClient = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Request Interceptor: Đính kèm token ────────────────────────────────────
axiosClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ─── Response Interceptor: Xử lý 401 / 403 ──────────────────────────────────
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value: string) => void
  reject: (reason: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error)
    else prom.resolve(token!)
  })
  failedQueue = []
}

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean }

    // Xử lý 403: Phân biệt "Tài khoản bị vô hiệu hóa" và "Không đủ quyền thực hiện hành động"
    if (error.response?.status === 403) {
      const message: string = error.response?.data?.message || 'Bạn không có quyền thực hiện thao tác này.'
      const lowerMsg = message.toLowerCase()

      if (lowerMsg.includes('vô hiệu hóa') || lowerMsg.includes('bị khóa')) {
        toast.error(message)
        localStorage.clear()
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
      return Promise.reject(error)
    }

    // Không tự refresh nếu đang ở trang login
    if (originalRequest?.url?.includes('/auth/login')) {
      return Promise.reject(error)
    }

    // Token hết hạn (401)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return axiosClient(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      isRefreshing = true
      const refreshToken = localStorage.getItem('refresh_token')

      if (!refreshToken) {
        isRefreshing = false
        localStorage.clear()
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh-token`, {
          refresh_token: refreshToken,
        })
        const newToken: string = data.data?.token || data.token
        const newRefreshToken: string | undefined = data.data?.refresh_token || data.refresh_token

        localStorage.setItem('access_token', newToken)
        if (newRefreshToken) {
          localStorage.setItem('refresh_token', newRefreshToken)
        }

        axiosClient.defaults.headers.common.Authorization = `Bearer ${newToken}`
        processQueue(null, newToken)
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return axiosClient(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        localStorage.clear()
        toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export default axiosClient