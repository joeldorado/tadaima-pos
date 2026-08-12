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
  customerLogin,
  customerLogout,
  fetchCustomerMe,
  type Customer,
} from '../lib/customerApi'
import { setCustomerToken, setOnCustomerUnauthorized } from '../lib/http'

// Sesión del CLIENTE de la tienda (patrón replicado de AuthContext del admin,
// NO reusado: storage key, endpoints y slot de token son independientes — un
// admin puede tener las dos sesiones abiertas sin que se pisen).
const TOKEN_STORAGE_KEY = 'tadaimaus-customer-token-v1'

/**
 * `restoring` es el arranque: hay un token guardado y se está validando contra
 * `GET /us/account/me`. Sin este estado el header parpadearía "Sign in" en
 * cada recarga aunque haya sesión.
 */
type CustomerAuthStatus = 'restoring' | 'anonymous' | 'authenticated'

interface CustomerAuthContextValue {
  readonly status: CustomerAuthStatus
  readonly customer: Customer | null
  readonly login: (identifier: string, password: string) => Promise<void>
  readonly logout: () => void
  /** Auto-login del checkout: adopta el token que devolvió POST /us/orders. */
  readonly adoptSession: (token: string, customer: Customer) => void
  /** Refresca el perfil en memoria (tras editar en Settings). */
  readonly setCustomer: (customer: Customer) => void
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null)

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

export function CustomerAuthProvider({ children }: { readonly children: ReactNode }) {
  const [status, setStatus] = useState<CustomerAuthStatus>(() =>
    readStoredToken() === null ? 'anonymous' : 'restoring',
  )
  const [customer, setCustomerState] = useState<Customer | null>(null)
  const isMounted = useRef(true)

  const clearSession = useCallback((): void => {
    setCustomerToken(null)
    writeStoredToken(null)
    if (!isMounted.current) return
    setCustomerState(null)
    setStatus('anonymous')
  }, [])

  // Cualquier 401 con token de cliente (revocado/vencido) tumba la sesión local.
  useEffect(() => {
    setOnCustomerUnauthorized(clearSession)
    return () => setOnCustomerUnauthorized(null)
  }, [clearSession])

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  // Restaurar la sesión al montar: el token guardado solo vale si el backend
  // sigue reconociéndolo.
  useEffect(() => {
    const stored = readStoredToken()
    if (stored === null) return

    setCustomerToken(stored)
    void (async () => {
      try {
        const me = await fetchCustomerMe()
        if (!isMounted.current) return
        setCustomerState(me)
        setStatus('authenticated')
      } catch {
        clearSession()
      }
    })()
  }, [clearSession])

  const adoptSession = useCallback((token: string, freshCustomer: Customer): void => {
    setCustomerToken(token)
    writeStoredToken(token)
    setCustomerState(freshCustomer)
    setStatus('authenticated')
  }, [])

  const login = useCallback(
    async (identifier: string, password: string): Promise<void> => {
      const result = await customerLogin(identifier, password)
      adoptSession(result.token, result.customer)
    },
    [adoptSession],
  )

  const logout = useCallback((): void => {
    // Revocar del lado del servidor es lo correcto, pero la sesión local se
    // cierra pase lo que pase: si la red falla el cliente igual quiere salir.
    void customerLogout().catch(() => undefined)
    clearSession()
  }, [clearSession])

  const setCustomer = useCallback((freshCustomer: Customer): void => {
    setCustomerState(freshCustomer)
  }, [])

  const value = useMemo<CustomerAuthContextValue>(
    () => ({ status, customer, login, logout, adoptSession, setCustomer }),
    [status, customer, login, logout, adoptSession, setCustomer],
  )

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const context = useContext(CustomerAuthContext)
  if (context === null) {
    throw new Error('useCustomerAuth must be used inside <CustomerAuthProvider>')
  }
  return context
}
