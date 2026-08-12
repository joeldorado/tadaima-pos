import { useEffect, useState, type FormEvent } from 'react'
import { Field } from '../components/forms/Field'
import { ApiRequestError } from '../lib/http'
import { navigateTo } from '../lib/routes'
import { useCustomerAuth } from '../store/CustomerAuthContext'

/**
 * Login del CLIENTE de la tienda (#/login) — distinta del login del panel de
 * admin (src/admin/LoginPage). Identifier acepta email O teléfono.
 *
 * No hay registro standalone (fiel al flujo Wix): la cuenta se crea en el
 * checkout. Tras iniciar sesión: de vuelta al checkout si venías de ahí
 * (sessionStorage 'tadaimaus-login-next'), si no a My Orders.
 */
export const LOGIN_NEXT_KEY = 'tadaimaus-login-next'

function consumeNext(): 'checkout' | 'account' {
  try {
    const next = window.sessionStorage.getItem(LOGIN_NEXT_KEY)
    window.sessionStorage.removeItem(LOGIN_NEXT_KEY)
    return next === 'checkout' ? 'checkout' : 'account'
  } catch {
    return 'account'
  }
}

export function LoginPage() {
  const { status, login } = useCustomerAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)

  // Ya logueado (o al terminar el login): fuera de esta página.
  useEffect(() => {
    if (status === 'authenticated') {
      const next = consumeNext()
      navigateTo(next === 'checkout' ? { page: 'checkout' } : { page: 'account', section: 'orders' })
    }
  }, [status])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (identifier.trim() === '' || password === '') {
      setError('Please enter your email or phone and your password.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await login(identifier.trim(), password)
      // El redirect lo hace el effect de arriba al cambiar `status`.
    } catch (loginError: unknown) {
      setError(
        loginError instanceof ApiRequestError
          ? loginError.message
          : 'We could not sign you in. Please try again.',
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="container section">
      <div className="customer-login">
        <header className="page-head">
          <p className="section-kicker">Account</p>
          <h1 className="page-title">Sign in</h1>
        </header>

        <form className="customer-login-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <Field
            id="login-identifier"
            label="Email or phone"
            autoComplete="username"
            value={identifier}
            onChange={setIdentifier}
          />
          <Field
            id="login-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
          />

          {error !== null && (
            <p className="form-server-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign In'}
          </button>

          <p className="customer-login-hint">
            New here? Your account is created at checkout — add something to your
            cart and your orders will show up in one place.
          </p>
        </form>
      </div>
    </div>
  )
}
