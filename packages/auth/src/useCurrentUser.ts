import { useMemo } from 'react'
import { useAuth } from './AuthContext'
import type { CurrentUser } from './types'

/**
 * Returns the current authenticated user with derived permission fields.
 *
 * Must be called inside an authenticated route (wrapped by ProtectedRoute).
 * ProtectedRoute redirects to /login when there is no user, so this hook
 * can safely assume a user exists at call time.
 *
 * The returned object is memoised — stable reference between renders unless
 * the user changes.
 */
export function useCurrentUser(): CurrentUser {
  const { user } = useAuth()

  const currentUser = useMemo<CurrentUser | null>(() => {
    if (!user) return null
    return {
      user,
      storeId: null,               // Fase 5: store selection
      companyId: user.company_id,  // null when user has no company yet
      roles: [],                   // Fase 4: role list from backend
      can: (_permission: string): boolean => false, // Fase 4: always deny until real check is wired
    }
  }, [user])

  if (!currentUser) {
    throw new Error(
      'useCurrentUser called without an authenticated user — ensure it is used inside ProtectedRoute',
    )
  }

  return currentUser
}
