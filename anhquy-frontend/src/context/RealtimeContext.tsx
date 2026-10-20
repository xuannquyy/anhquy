import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react'
import { toast } from 'sonner'
import { useAuth } from './AuthContext'
import { authApi, dashboardApi } from '../api'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RealtimeNotification {
  id: string
  type: 'AI_SCAN_COMPLETED' | 'PERMISSION_CHANGED' | 'ACCOUNT_LOCKED' | 'NEW_VIOLATION'
  title: string
  message: string
  timestamp: Date
  read: boolean
  documentId?: number
  violationCount?: number
}

interface RealtimeContextValue {
  notifications: RealtimeNotification[]
  unreadCount: number
  markAllRead: () => void
  markRead: (id: string) => void
  publishEvent: (event: RealtimeEventPayload) => void
  clearNotifications: () => void
}

export interface RealtimeEventPayload {
  type: RealtimeNotification['type']
  title: string
  message: string
  documentId?: number
  violationCount?: number
  targetUserId?: number
}

// ─── Context ─────────────────────────────────────────────────────────────────

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

const HEARTBEAT_INTERVAL_MS = 8000

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, refreshUserProfile, user } = useAuth()
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([])
  const channelRef = useRef<BroadcastChannel | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Publish sự kiện qua BroadcastChannel ──────────────────────────────────
  const publishEvent = useCallback((payload: RealtimeEventPayload) => {
    if (channelRef.current) {
      channelRef.current.postMessage(payload)
    }
    // Nếu event dành cho user hiện tại thì cũng xử lý tại chỗ
    if (!payload.targetUserId || payload.targetUserId === user?.id) {
      handleIncomingEvent(payload)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // ─── Xử lý sự kiện đến ─────────────────────────────────────────────────────
  const handleIncomingEvent = useCallback((payload: RealtimeEventPayload) => {
    const notification: RealtimeNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      timestamp: new Date(),
      read: false,
      documentId: payload.documentId,
      violationCount: payload.violationCount,
    }

    setNotifications((prev) => [notification, ...prev].slice(0, 50))

    // Toast tương ứng với loại sự kiện
    switch (payload.type) {
      case 'AI_SCAN_COMPLETED':
        toast.success(payload.title, {
          description: payload.message,
          duration: 6000,
        })
        break
      case 'PERMISSION_CHANGED':
        toast.warning(payload.title, {
          description: payload.message,
          duration: 8000,
          action: {
            label: 'Làm mới',
            onClick: () => refreshUserProfile(),
          },
        })
        // Cập nhật lại quyền ngay lập tức
        refreshUserProfile()
        break
      case 'ACCOUNT_LOCKED':
        toast.error(payload.title, { description: payload.message, duration: 10000 })
        break
      case 'NEW_VIOLATION':
        toast.warning(payload.title, {
          description: payload.message,
          duration: 6000,
        })
        break
    }
  }, [refreshUserProfile])

  // ─── Thiết lập BroadcastChannel ─────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return

    const channel = new BroadcastChannel('anhquy_realtime_sync')
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<RealtimeEventPayload>) => {
      const payload = event.data
      // Chỉ xử lý nếu sự kiện dành cho user này hoặc broadcast
      if (!payload.targetUserId || payload.targetUserId === user?.id) {
        handleIncomingEvent(payload)
      }
    }

    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [isAuthenticated, user?.id, handleIncomingEvent])

  // ─── Background Heartbeat: poll nhẹ mỗi 8 giây ─────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return

    const runHeartbeat = async () => {
      try {
        // Kiểm tra session vẫn còn hiệu lực + lấy stats mới
        await authApi.me()
        await dashboardApi.getStats()
      } catch {
        // axiosClient interceptor đã xử lý 401/403
      }
    }

    heartbeatRef.current = setInterval(runHeartbeat, HEARTBEAT_INTERVAL_MS)
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [isAuthenticated])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }, [])

  const clearNotifications = useCallback(() => setNotifications([]), [])

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <RealtimeContext.Provider
      value={{ notifications, unreadCount, markAllRead, markRead, publishEvent, clearNotifications }}
    >
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime phải dùng bên trong RealtimeProvider')
  return ctx
}

