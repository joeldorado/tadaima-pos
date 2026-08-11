import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchMe,
  isAdmin,
  login as loginRequest,
  logout as logoutRequest,
  type AdminUser,
} from '../lib/adminApi'
import { ApiRequestError, setAuthToken, setOnUnauthorized } from '../lib/http'

const TOKEN_STORAGE_KEY = 'tadaimaus-admin-token-v1'

const NOT_ADMIN_MESSAGE =
  'This account cannot manage the store. Ask an administrator for access.'

/**
 * `restoring` es el arranque: hay un token guardado y se está validando contra
 * `GET /auth/me`. Sin este estado el panel parpadearía al login en cada recarga.
 */
type AuthStatus = 'restoring' | 'anonymous' | 'authenticated'

interface AuthContextValue {
  readonly status: AuthStatus
  readonly user: AdminUser | null
  readonly login: (email: string, password: string) => Promise<void>
  readonly logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    // Safari en modo privado puede lanzar al leer storage.
    return null
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    else window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch {
    // Sin storage la sesión dura lo que dure la pestaña — no es fatal.
  }
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    readStoredToken() === null ? 'anonymous' : 'restoring',
  )
  const [user, setUser] = useState<AdminUser | null>(null)
  const isMounted = useRef(true)

  const clearSession = useCallback((): void => {
    setAuthToken(null)
    writeStoredToken(null)
    if (!isMounted.current) return
    setUser(null)
    setStatus('anonymous')
  }, [])

  // Cualquier 401 del backend (token revocado o vencido) tumba la sesión local.
  useEffect(() => {
    setOnUnauthorized(clearSession)
    return () => setOnUnauthorized(null)
  }, [clearSession])

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  // Restaurar la sesión al montar: el token guardado solo vale si el backend
  // sigue reconociéndolo Y la cuenta sigue siendo admin.
  useEffect(() => {
    const stored = readStoredToken()
    if (stored === null) return

    setAuthToken(stored)
    void (async () => {
      try {
        const me = await fetchMe()
        if (!isMounted.current) return
        if (!isAdmin(me)) {
          clearSession()
          return
        }
        setUser(me)
        setStatus('authenticated')
      } catch {
        clearSession()
      }
    })()
  }, [clearSession])

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const result = await loginRequest(email, password)
      if (!isAdmin(result.user)) {
        // Se rechaza aquí en vez de dejar entrar a un panel donde el backend
        // va a responder 403 en cada llamada.
        throw new ApiRequestError(NOT_ADMIN_MESSAGE, 403)
      }
      setAuthToken(result.token)
      writeStoredToken(result.token)
      setUser(result.user)
      setStatus('authenticated')
    },
    [],
  )

  const logout = useCallback((): void => {
    // Revocar del lado del servidor es lo correcto, pero la sesión local se
    // cierra pase lo que pase: si la red falla el usuario igual quiere salir.
    void logoutRequest().catch(() => undefined)
    clearSession()
  }, [clearSession])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === null) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
