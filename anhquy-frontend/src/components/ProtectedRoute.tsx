import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Spinner } from './ui'
import { ForbiddenPage } from '../pages/ErrorPages'

interface ProtectedRouteProps {
  children: React.ReactNode
  permission?: string
}

export function ProtectedRoute({ children, permission }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasPermission } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-Snowflake">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-Mist text-sm">Đang khởi tạo phiên bảo mật...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (permission && !hasPermission(permission)) {
    return <ForbiddenPage requiredPermission={permission} />
  }

  return <>{children}</>
}