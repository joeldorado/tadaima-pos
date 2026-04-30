import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  login as apiLogin,
  logout as apiLogout,
  me,
  setOnUnauthorized,
  setTokenGetter,
} from '@tadaima/api'
import type { User } from '@tadaima/api'
import type { AuthContextValue, TokenStorage } from './types'

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

interface AuthProviderProps {
  storage: TokenStorage
  children: ReactNode
}

export function AuthProvider({ storage, children }: AuthProviderProps): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Stable ref so effects and callbacks always access the current storage
  // without listing it as a dep (avoids re-firing on inline object literals).
  const storageRef = useRef(storage)
  storageRef.current = storage

  // Register API client callbacks and restore session — runs once on mount.
  useEffect(() => {
    // Wire token read into apiClient request interceptor
    setTokenGetter(() => storageRef.current.get())

    // 401 responses must clear BOTH storage and React state so the UI
    // immediately reflects the unauthenticated status without a page reload.
    setOnUnauthorized(() => {
      storageRef.current.clear()
      setUser(null)
    })

    const token = storageRef.current.get()
    if (!token) {
      setIsLoading(false)
      return () => {
        // Cleanup: reset module-level singletons so a subsequent mount
        // (e.g. React Strict Mode double-invoke, tests) starts from a clean state.
        setTokenGetter(() => null)
        setOnUnauthorized(() => {})
      }
    }

    // Token found — validate with backend before trusting it
    void (async () => {
      try {
        const currentUser = await me()
        setUser(currentUser)
      } catch {
        // Token invalid or expired — clear it.
        // ProtectedRoute (Fase 3) will redirect to /login.
        storageRef.current.clear()
      } finally {
        setIsLoading(false)
      }
    })()

    return () => {
      setTokenGetter(() => null)
      setOnUnauthorized(() => {})
    }
  }, []) // intentionally empty — storageRef is stable (useRef)

  /**
   * Authenticates the user. Persists the token and sets user state.
   *
   * @throws {ApiError} On invalid credentials (401/422) or network errors.
   *   Callers are responsible for catching and surfacing the error to the UI.
   */
  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const { token, user: authenticatedUser } = await apiLogin(email, password)
    storageRef.current.set(token)
    setUser(authenticatedUser)
    // Token getter already reads from storageRef — no need to re-register
  }, []) // intentionally empty — storageRef is stable (useRef)

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiLogout()
    } catch (err) {
      // Network failures during logout are non-critical — the server-side token
      // will expire on its own. Always clear local state regardless.
      const isDev = (import.meta as unknown as Record<string, Record<string, unknown>>)['env']?.['DEV'] === true
      if (isDev) {
        console.error('[auth] logout network error (non-critical):', err)
      }
    } finally {
      storageRef.current.clear()
      setUser(null)
    }
  }, []) // intentionally empty — storageRef is stable (useRef)

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, logout }),
    [user, isLoading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>')
  }
  return ctx
}
