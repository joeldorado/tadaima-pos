import { useScrolled } from '../../hooks/useScrolled'
import { BRAND, SHOP_CATEGORIES } from '../../lib/constants'
import type { Route } from '../../lib/routes'
import { useCart } from '../../store/CartContext'

interface NavItem {
  readonly label: string
  readonly hash: string
  readonly isActive: (route: Route) => boolean
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Home', hash: '#/', isActive: (route) => route.page === 'home' },
  ...SHOP_CATEGORIES.map(
    (category): NavItem => ({
      label: category.label,
      hash: `#/${category.slug}`,
      isActive: (route) =>
        route.page === 'category' && route.category === category.slug,
    }),
  ),
  { label: 'Contact', hash: '#/contact', isActive: (route) => route.page === 'contact' },
]

function CartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5.5 8h13l-1.1 12.2a1.5 1.5 0 0 1-1.5 1.3H8.1a1.5 1.5 0 0 1-1.5-1.3L5.5 8Z" />
      <path d="M9 10V5.8A3 3 0 0 1 12 3a3 3 0 0 1 3 2.8V10" />
    </svg>
  )
}

/** Silueta de persona — el ícono de "cuenta / iniciar sesión" de siempre. */
function LoginIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </svg>
  )
}

interface HeaderProps {
  readonly route: Route
}

export function Header({ route }: HeaderProps) {
  const { count, openDrawer } = useCart()
  const isScrolled = useScrolled()

  return (
    <header className={`site-header${isScrolled ? ' is-scrolled' : ''}`}>
      <div className="site-header-inner container">
        <a className="site-logo" href="#/" aria-label={`${BRAND.shortName} — home`}>
          <img
            src={BRAND.logoUrl}
            alt={BRAND.legalName}
            width={202}
            height={72}
            loading="eager"
            fetchPriority="high"
          />
        </a>

        <nav className="site-nav" aria-label="Main navigation">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.hash}>
                <a
                  href={item.hash}
                  className={item.isActive(route) ? 'is-active' : undefined}
                  aria-current={item.isActive(route) ? 'page' : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="site-header-actions">
          {/* Acceso al panel (#/admin). Es solo la puerta: el backend gatea de
              verdad, así que mostrarla no abre nada por sí sola. */}
          <a className="header-login" href="#/admin" aria-label="Sign in to store admin">
            <LoginIcon />
            <span className="header-login-label">Sign in</span>
          </a>

          <button
            type="button"
            className="cart-button"
            onClick={openDrawer}
            aria-label={`Open cart, ${count} item${count === 1 ? '' : 's'}`}
          >
            <CartIcon />
            <span className="cart-button-label">Cart</span>
            {count > 0 && (
              <span className="cart-button-count" aria-hidden="true">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
