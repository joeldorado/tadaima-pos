// Minimal hash router — shareable URLs (#/figures, #/checkout…) without a
// router dependency. Unknown hashes fall back to home.
import { isUsCategory, type UsCategory } from './constants'

export type Route =
  | { readonly page: 'home' }
  | { readonly page: 'category'; readonly category: UsCategory }
  | { readonly page: 'contact' }
  | { readonly page: 'checkout' }

export function parseRoute(hash: string): Route {
  const path = hash
    .replace(/^#\/?/, '')
    .replace(/\/+$/, '')
    .toLowerCase()

  if (path === '') return { page: 'home' }
  if (path === 'contact') return { page: 'contact' }
  if (path === 'checkout') return { page: 'checkout' }
  if (isUsCategory(path)) return { page: 'category', category: path }
  return { page: 'home' }
}

export function routeToHash(route: Route): string {
  switch (route.page) {
    case 'home':
      return '#/'
    case 'category':
      return `#/${route.category}`
    case 'contact':
      return '#/contact'
    case 'checkout':
      return '#/checkout'
  }
}

export function navigateTo(route: Route): void {
  window.location.hash = routeToHash(route)
}
