import { useState, type FormEvent } from 'react'
import { BRAND } from '../lib/constants'
import { ApiRequestError } from '../lib/http'
import { useAuth } from '../store/AuthContext'

/**
 * `/auth/login` es el endpoint del POS y contesta en español ("Credenciales
 * incorrectas."). El panel es inglés, así que los errores de credenciales se
 * traducen aquí — el backend no se toca por esto.
 */
function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) {
    return 'Something went wrong. Please try again.'
  }
  if (error.status === 401 || error.status === 422) return 'Wrong email or password.'
  return error.message
}

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSending, setSending] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (email.trim() === '' || password === '') {
      setError('Enter your email and password.')
      return
    }

    setSending(true)
    setError(null)
    try {
      await login(email.trim(), password)
      // Al autenticar, AdminApp cambia solo: este componente se desmonta.
    } catch (loginError: unknown) {
      setSending(false)
      setError(loginErrorMessage(loginError))
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login-card">
        <p className="admin-login-brand">
          {BRAND.shortName.replace(' US', '')} <span>US</span>
        </p>
        <p className="admin-login-sub">Store admin</p>

        {error !== null && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          {/* Mismo `.field` de etiqueta flotante que la tienda (base.css es
              global): el panel y la tienda se sienten la misma app. */}
          <div className="field">
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              autoFocus
              placeholder=" "
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setError(null)
              }}
              aria-invalid={error !== null}
            />
            <label htmlFor="admin-email">Email</label>
          </div>

          <div className="field">
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              placeholder=" "
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setError(null)
              }}
              aria-invalid={error !== null}
            />
            <label htmlFor="admin-password">Password</label>
          </div>

          <button type="submit" className="admin-btn admin-btn-primary" disabled={isSending}>
            {isSending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <a className="admin-login-back" href="#/">
          ← Back to the store
        </a>
      </div>
    </div>
  )
}
