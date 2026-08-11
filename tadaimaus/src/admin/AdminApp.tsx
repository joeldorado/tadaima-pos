import { AuthProvider, useAuth } from '../store/AuthContext'
import type { AdminSection } from '../lib/routes'
import { LeadsPanel } from './LeadsPanel'
import { ListingsPanel } from './ListingsPanel'
import { LoginPage } from './LoginPage'
import './admin.css'

interface AdminAppProps {
  readonly section: AdminSection
}

const SECTIONS: readonly { readonly value: AdminSection; readonly label: string; readonly hash: string }[] = [
  { value: 'listings', label: 'Items', hash: '#/admin' },
  { value: 'leads', label: 'Leads', hash: '#/admin/leads' },
]

function AdminShell({ section }: AdminAppProps) {
  const { user, logout } = useAuth()

  return (
    <div className="admin-shell">
      <header className="admin-top">
        <div className="admin-top-inner">
          <p className="admin-brand">
            Tadaima <span>US</span> admin
          </p>
          {user !== null && <span className="admin-top-user">{user.email}</span>}
          <a className="admin-btn admin-btn-ghost" href="#/">
            View store
          </a>
          <button type="button" className="admin-btn admin-btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="admin-nav" aria-label="Admin sections">
        <div className="admin-nav-inner">
          {SECTIONS.map((entry) => (
            <a
              key={entry.value}
              href={entry.hash}
              aria-current={section === entry.value ? 'page' : undefined}
            >
              {entry.label}
            </a>
          ))}
        </div>
      </nav>

      <main className="admin-main">
        {section === 'leads' ? <LeadsPanel /> : <ListingsPanel />}
      </main>
    </div>
  )
}

function AdminGate({ section }: AdminAppProps) {
  const { status } = useAuth()

  // `restoring` = hay token guardado y se está validando contra /auth/me. Sin
  // este estado la pantalla parpadearía al login en cada recarga.
  if (status === 'restoring') {
    return (
      <div className="admin-login">
        <div className="admin-spinner" />
      </div>
    )
  }

  if (status === 'anonymous') return <LoginPage />

  return <AdminShell section={section} />
}

export default function AdminApp({ section }: AdminAppProps) {
  return (
    <AuthProvider>
      <AdminGate section={section} />
    </AuthProvider>
  )
}
