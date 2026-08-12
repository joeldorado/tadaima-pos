import { lazy, Suspense, useEffect } from 'react'
import { CartDrawer } from './components/cart/CartDrawer'
import { NewsletterSection } from './components/home/NewsletterSection'
import { Footer } from './components/layout/Footer'
import { Header } from './components/layout/Header'
import { useHashRoute } from './hooks/useHashRoute'
import type { Route } from './lib/routes'
import { AccountOrdersPage } from './pages/AccountOrdersPage'
import { AccountSettingsPage } from './pages/AccountSettingsPage'
import { CategoryPage } from './pages/CategoryPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { ContactPage } from './pages/ContactPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { ProductPage } from './pages/ProductPage'
import { CartProvider } from './store/CartContext'
import { CustomerAuthProvider } from './store/CustomerAuthContext'

// El panel se carga en su propio chunk: la tienda es un sitio público con
// presupuesto de peso y la mayoría de sus visitantes nunca lo abre.
const AdminApp = lazy(() => import('./admin/AdminApp'))

function renderPage(route: Route) {
  switch (route.page) {
    case 'home':
      return <HomePage />
    case 'category':
      return <CategoryPage key={route.category} category={route.category} />
    case 'product':
      return <ProductPage key={route.id} id={route.id} />
    case 'contact':
      return <ContactPage />
    case 'checkout':
      return <CheckoutPage />
    case 'login':
      return <LoginPage />
    case 'account':
      return route.section === 'settings' ? <AccountSettingsPage /> : <AccountOrdersPage />
    case 'admin':
      // Nunca llega aquí: App lo intercepta antes de montar la tienda.
      return null
  }
}

export default function App() {
  const route = useHashRoute()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [route])

  // El panel no comparte nada con la tienda: ni header, ni footer, ni carrito.
  if (route.page === 'admin') {
    return (
      <Suspense fallback={null}>
        <AdminApp section={route.section} />
      </Suspense>
    )
  }

  const handleSkip = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    // Plain href="#main" would collide with the hash router — focus instead.
    event.preventDefault()
    document.getElementById('main')?.focus()
  }

  return (
    // La sesión del CLIENTE envuelve la tienda entera (el Header la consume);
    // el branch #/admin de arriba NO la monta — su sesión es independiente.
    <CustomerAuthProvider>
      <CartProvider>
        <a className="skip-link" href="#main" onClick={handleSkip}>
          Skip to content
        </a>
        <Header route={route} />
        <main id="main" tabIndex={-1}>
          {renderPage(route)}
        </main>
        {/* El newsletter va arriba del pie en TODAS las páginas, no solo en la
            home: es el enganche del sitio y se pierde si solo vive ahí. */}
        <NewsletterSection />
        <Footer />
        <CartDrawer />
      </CartProvider>
    </CustomerAuthProvider>
  )
}
