import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@tadaima/auth'
import { PikachuLoader } from '@/components/ui/PikachuLoader'
import { canAccessPage, type PageKey } from '@/lib/permisos'

interface ProtectedRouteProps {
  children: React.ReactNode
  /** Si se especifica, solo usuarios con acceso a esa pantalla pueden entrar. Sino redirige a `/`. */
  requiresPage?: PageKey
}

export function ProtectedRoute({ children, requiresPage }: ProtectedRouteProps): React.JSX.Element {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  // Wait for session restore before making a redirect decision.
  // Without this guard, the user would be sent to /login on every hard reload
  // even with a valid token (because user is null during the initial me() call).
  if (isLoading) {
    return <PikachuLoader />
  }

  if (!user) {
    // Pass the current location so LoginPage can redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requiresPage && !canAccessPage(user.roles, requiresPage)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
