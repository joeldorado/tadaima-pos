import { createBrowserRouter } from 'react-router-dom'
import { useAuth } from '@tadaima/auth'
import { canAccessAdmin } from '@tadaima/permissions'
import { Layout } from '@/layouts/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SellPage } from '@/pages/SellPage'
import { SalesPage } from '@/pages/SalesPage'
import { CashCutsPage } from '@/pages/CashCutsPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { StockSearchPage } from '@/pages/StockSearchPage'
import { ClientsPage } from '@/pages/ClientsPage'
import { TransfersPage } from '@/pages/TransfersPage'
import { PreSalesPage } from '@/pages/PreSalesPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { DemoWalkthroughPage } from '@/pages/DemoWalkthroughPage'
import { StoresPage } from '@/pages/StoresPage'
import { AdminPage } from '@/pages/AdminPage'
import { LayawaysPage } from '@/pages/LayawaysPage'
import { OnlineCatalogPage } from '@/pages/OnlineCatalogPage'
import { SuppliesPage } from '@/pages/SuppliesPage'
import { PromosPage } from '@/pages/PromosPage'

function IndexPage() {
  const { user } = useAuth()
  if (user && canAccessAdmin(user.roles ?? [])) return <AdminPage />
  return <DashboardPage />
}

export const router = createBrowserRouter([
  {
    path: '/login',
    Component: LoginPage,
  },
  {
    // Catálogo de cadena (v2): una sola URL global. Los paths con slug se
    // conservan como alias (links viejos) y rinden el mismo catálogo global.
    path: '/catalogo',
    Component: OnlineCatalogPage,
  },
  {
    path: '/catalogo/:catalogUrl',
    Component: OnlineCatalogPage,
  },
  {
    path: '/tienda-online',
    Component: OnlineCatalogPage,
  },
  {
    path: '/tienda-online/:catalogUrl',
    Component: OnlineCatalogPage,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, Component: IndexPage },
      { path: 'caja', Component: SellPage },
      { path: 'sales',     element: <ProtectedRoute requiresPage="sales"><SalesPage /></ProtectedRoute> },
      { path: 'cortes',    element: <ProtectedRoute requiresPage="cash_cuts"><CashCutsPage /></ProtectedRoute> },
      { path: 'products',  element: <ProtectedRoute requiresPage="products"><ProductsPage /></ProtectedRoute> },
      { path: 'buscar-tiendas', element: <ProtectedRoute requiresPage="stock_search"><StockSearchPage /></ProtectedRoute> },
      { path: 'transfers', element: <ProtectedRoute requiresPage="transfers"><TransfersPage /></ProtectedRoute> },
      { path: 'insumos', element: <ProtectedRoute requiresPage="supplies"><SuppliesPage /></ProtectedRoute> },
      { path: 'promos',  element: <ProtectedRoute requiresPage="promos"><PromosPage /></ProtectedRoute> },
      { path: 'clients',   element: <ProtectedRoute requiresPage="clients"><ClientsPage /></ProtectedRoute> },
      { path: 'pre-sales', element: <ProtectedRoute requiresPage="presales"><PreSalesPage /></ProtectedRoute> },
      { path: 'reports',   element: <ProtectedRoute requiresPage="reports"><ReportsPage /></ProtectedRoute> },
      { path: 'settings',  element: <ProtectedRoute requiresPage="settings"><SettingsPage /></ProtectedRoute> },
      { path: 'stores',    element: <ProtectedRoute requiresPage="stores"><StoresPage /></ProtectedRoute> },
      { path: 'admin',     element: <ProtectedRoute requiresPage="admin"><AdminPage /></ProtectedRoute> },
      { path: 'layaways',  Component: LayawaysPage },
      // Walkthrough QA para demos al cliente. Admin only (gate adicional
      // dentro del componente). No tiene link en nav — accesible por URL.
      { path: 'demo',      Component: DemoWalkthroughPage },
    ],
  },
])
