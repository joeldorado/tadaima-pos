import { createBrowserRouter } from 'react-router-dom'
import { useAuth } from '@tadaima/auth'
import { canAccessAdmin } from '@tadaima/permissions'
import { Layout } from '@/layouts/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SellPage } from '@/pages/SellPage'
import { SalesPage } from '@/pages/SalesPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { ClientsPage } from '@/pages/ClientsPage'
import { TransfersPage } from '@/pages/TransfersPage'
import { PreSalesPage } from '@/pages/PreSalesPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { StoresPage } from '@/pages/StoresPage'
import { AdminPage } from '@/pages/AdminPage'
import { LayawaysPage } from '@/pages/LayawaysPage'

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
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, Component: IndexPage },
      { path: 'caja', Component: SellPage },
      { path: 'sales', Component: SalesPage },
      { path: 'products', Component: ProductsPage },
      { path: 'transfers', Component: TransfersPage },
      { path: 'clients', Component: ClientsPage },
      { path: 'pre-sales', Component: PreSalesPage },
      { path: 'reports', Component: ReportsPage },
      { path: 'settings', Component: SettingsPage },
      { path: 'stores', Component: StoresPage },
      { path: 'admin', Component: AdminPage },
      { path: 'layaways', Component: LayawaysPage },
    ],
  },
])
