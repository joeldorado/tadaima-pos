// Minimal hash router — shareable URLs (#/figures, #/checkout…) without a
// router dependency. Unknown hashes fall back to home.
import { isUsCategory, type UsCategory } from './constants'

/** Secciones del panel de administración (`#/admin`, `#/admin/orders`, `#/admin/leads`). */
export type AdminSection = 'listings' | 'orders' | 'leads'

/** Secciones de la cuenta del CLIENTE (`#/account`, `#/account/settings`). */
export type AccountSection = 'orders' | 'settings'

export type Route =
  | { readonly page: 'home' }
  | { readonly page: 'category'; readonly category: UsCategory }
  | { readonly page: 'product'; readonly id: number }
  | { readonly page: 'contact' }
  | { readonly page: 'checkout' }
  | { readonly page: 'login' }
  | { readonly page: 'account'; readonly section: AccountSection }
  | { readonly page: 'admin'; readonly section: AdminSection }

export function parseRoute(hash: string): Route {
  const path = hash
    .replace(/^#\/?/, '')
    .replace(/\/+$/, '')
    .toLowerCase()

  if (path === '') return { page: 'home' }
  if (path === 'contact') return { page: 'contact' }
  if (path === 'checkout') return { page: 'checkout' }
  if (path === 'login') return { page: 'login' }

  // Cuenta del cliente; una sección desconocida cae a pedidos (dentro de la
  // cuenta, no a home — mismo criterio que el panel de admin).
  if (path === 'account') return { page: 'account', section: 'orders' }
  if (path.startsWith('account/')) {
    const section = path.slice('account/'.length)
    return { page: 'account', section: section === 'settings' ? 'settings' : 'orders' }
  }

  // El panel va antes del fallback a home; una sección desconocida de /admin
  // aterriza en artículos en vez de sacar al usuario a la tienda.
  if (path === 'admin') return { page: 'admin', section: 'listings' }
  if (path.startsWith('admin/')) {
    const section = path.slice('admin/'.length)
    if (section === 'orders' || section === 'leads') {
      return { page: 'admin', section }
    }
    return { page: 'admin', section: 'listings' }
  }

  if (isUsCategory(path)) return { page: 'category', category: path }

  const productMatch = path.match(/^product\/(\d+)$/)
  const idSegment = productMatch?.[1]
  if (idSegment !== undefined) return { page: 'product', id: Number(idSegment) }

  return { page: 'home' }
}

export function routeToHash(route: Route): string {
  switch (route.page) {
    case 'home':
      return '#/'
    case 'category':
      return `#/${route.category}`
    case 'product':
      return `#/product/${route.id}`
    case 'contact':
      return '#/contact'
    case 'checkout':
      return '#/checkout'
    case 'login':
      return '#/login'
    case 'account':
      return route.section === 'orders' ? '#/account' : '#/account/settings'
    case 'admin':
      return route.section === 'listings' ? '#/admin' : `#/admin/${route.section}`
  }
}

export function navigateTo(route: Route): void {
  window.location.hash = routeToHash(route)
}
