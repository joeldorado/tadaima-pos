import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@tadaima/auth'
import { Loader2, Eye, EyeOff } from 'lucide-react'

const BG  = 'linear-gradient(150deg, #09090e 0%, #140303 55%, #080710 100%)'
const RED = '#E0221A'

export function LoginPage(): React.JSX.Element {
  const { login } = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()

  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)

  // Redirect to the page the user was trying to access, or to / by default
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Credenciales incorrectas'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="h-screen flex items-center justify-center"
      style={{ background: BG }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl p-8"
        style={{
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Logo / Title */}
        <div className="flex flex-col items-center gap-2 mb-8">
          <div
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: '6px 9px',
              boxShadow: '0 0 18px rgba(204,34,0,0.4)',
              border: '1px solid rgba(204,34,0,0.15)',
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 900, color: RED, letterSpacing: '-0.02em' }}>
              Tadaima
            </span>
          </div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
            POS — Acceso
          </p>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e) }} className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}
            >
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={e => { setEmail(e.target.value) }}
              disabled={loading}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '10px 14px',
                color: 'rgba(255,255,255,0.88)',
                fontSize: 14,
                outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.border = `1px solid ${RED}` }}
              onBlur={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}
            >
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={e => { setPassword(e.target.value) }}
                disabled={loading}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '10px 40px 10px 14px',
                  color: 'rgba(255,255,255,0.88)',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { e.currentTarget.style.border = `1px solid ${RED}` }}
                onBlur={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)' }}
              />
              <button
                type="button"
                onClick={() => { setShowPassword(v => !v) }}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.35)',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error !== null && (
            <p
              style={{
                fontSize: 12,
                color: '#ff6b6b',
                background: 'rgba(224,34,26,0.08)',
                border: '1px solid rgba(224,34,26,0.2)',
                borderRadius: 8,
                padding: '8px 12px',
              }}
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              background: loading ? 'rgba(224,34,26,0.4)' : 'linear-gradient(135deg, #BB1100 0%, #FF3322 100%)',
              border: 'none',
              borderRadius: 10,
              padding: '12px',
              color: '#fff',
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.08em',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Iniciando sesión...
              </>
            ) : (
              'Iniciar sesión'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
