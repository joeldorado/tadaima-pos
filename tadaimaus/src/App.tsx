import { useEffect } from 'react'
import { CartDrawer } from './components/cart/CartDrawer'
import { Footer } from './components/layout/Footer'
import { Header } from './components/layout/Header'
import { useHashRoute } from './hooks/useHashRoute'
import type { Route } from './lib/routes'
import { CategoryPage } from './pages/CategoryPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { ContactPage } from './pages/ContactPage'
import { HomePage } from './pages/HomePage'
import { CartProvider } from './store/CartContext'

function renderPage(route: Route) {
  switch (route.page) {
    case 'home':
      return <HomePage />
    case 'category':
      return <CategoryPage key={route.category} category={route.category} />
    case 'contact':
      return <ContactPage />
    case 'checkout':
      return <CheckoutPage />
  }
}

export default function App() {
  const route = useHashRoute()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [route])

  const handleSkip = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    // Plain href="#main" would collide with the hash router — focus instead.
    event.preventDefault()
    document.getElementById('main')?.focus()
  }

  return (
    <CartProvider>
      <a className="skip-link" href="#main" onClick={handleSkip}>
        Skip to content
      </a>
      <Header route={route} />
      <main id="main" tabIndex={-1}>
        {renderPage(route)}
      </main>
      <Footer />
      <CartDrawer />
    </CartProvider>
  )
}
