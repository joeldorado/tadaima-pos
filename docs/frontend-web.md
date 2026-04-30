# Tadaima POS — Web App (React + Vite) — Pasos de implementación

> Stack: React 19 · Vite · TypeScript · TanStack Query · Zustand · React Router v7 · React Hook Form
> UI: Tailwind CSS 4 + shadcn/ui (Radix UI) — migrado desde `tienda-T/`
> Base URL API: `VITE_API_URL/api/v1`

---

## Fase 0 — Monorepo + Scaffolding Web
**Tiempo estimado: 2–3h**

- [ ] Instalar Turborepo en la raíz del proyecto (`/Tadaima/`)
- [ ] Crear `package.json` raíz con `workspaces: ["apps/*", "packages/*"]`
- [ ] Crear `turbo.json` con pipeline: `build → test → lint`
- [ ] Mover el Expo existente de `/app/` a `/apps/mobile/` y actualizar rutas internas
- [ ] Usar `landing/` como `apps/web/` (ya tiene scaffolding de Vite + React 19 + TypeScript)
- [ ] Crear carpetas vacías: `/packages/api/`, `/packages/hooks/`, `/packages/auth/`, `/packages/permissions/`, `/packages/utils/`
- [ ] Crear `package.json` mínimo en cada package con nombre `@tadaima/<nombre>`
- [ ] Configurar `tsconfig.base.json` en raíz y extenderlo en cada app y package
- [ ] Verificar alias `@/` en `landing/vite.config.ts` (ya configurado apuntando a `src/`)
- [ ] Verificar aliases `@tadaima/*` en `landing/vite.config.ts` (ya configurados)
- [ ] Verificar que `npm run dev` desde `landing/` levanta correctamente (Vite en puerto 5173)

---

## Fase 0.5 — Migración UI desde tienda-T
**Tiempo estimado: 2–3h**

> Esta fase toma el prototipo funcional de `tienda-T/` y lo integra en `landing/` como base visual
> permanente. El objetivo es tener el Layout con sidebar + todas las rutas navegables (con datos
> placeholder) antes de conectar la API real. NO rediseñar — reutilizar máximo.

### a) Instalar dependencias de UI en `landing/`

Las siguientes dependencias de `tienda-T/package.json` deben agregarse a `landing/package.json`.
Ejecutar desde `landing/`:

```bash
npm install \
  @radix-ui/react-accordion@1.2.3 \
  @radix-ui/react-alert-dialog@1.1.6 \
  @radix-ui/react-aspect-ratio@1.1.2 \
  @radix-ui/react-avatar@1.1.3 \
  @radix-ui/react-checkbox@1.1.4 \
  @radix-ui/react-collapsible@1.1.3 \
  @radix-ui/react-context-menu@2.2.6 \
  @radix-ui/react-dialog@1.1.6 \
  @radix-ui/react-dropdown-menu@2.1.6 \
  @radix-ui/react-hover-card@1.1.6 \
  @radix-ui/react-label@2.1.2 \
  @radix-ui/react-menubar@1.1.6 \
  @radix-ui/react-navigation-menu@1.2.5 \
  @radix-ui/react-popover@1.1.6 \
  @radix-ui/react-progress@1.1.2 \
  @radix-ui/react-radio-group@1.2.3 \
  @radix-ui/react-scroll-area@1.2.3 \
  @radix-ui/react-select@2.1.6 \
  @radix-ui/react-separator@1.1.2 \
  @radix-ui/react-slider@1.2.3 \
  @radix-ui/react-slot@1.1.2 \
  @radix-ui/react-switch@1.1.3 \
  @radix-ui/react-tabs@1.1.3 \
  @radix-ui/react-toggle@1.1.2 \
  @radix-ui/react-toggle-group@1.1.2 \
  @radix-ui/react-tooltip@1.1.8 \
  class-variance-authority@0.7.1 \
  clsx@2.1.1 \
  cmdk@1.1.1 \
  date-fns@3.6.0 \
  embla-carousel-react@8.6.0 \
  input-otp@1.4.2 \
  lucide-react@0.487.0 \
  next-themes@0.4.6 \
  react-day-picker@8.10.1 \
  react-dnd@16.0.1 \
  react-dnd-html5-backend@16.0.1 \
  react-resizable-panels@2.1.7 \
  recharts@2.15.2 \
  sonner@2.0.3 \
  tailwind-merge@3.2.0 \
  tw-animate-css@1.3.8 \
  vaul@1.1.2
```

- [ ] Agregar `tailwindcss@4.1.12` y `@tailwindcss/vite@4.1.12` como **devDependencies**:
  ```bash
  npm install -D tailwindcss@4.1.12 @tailwindcss/vite@4.1.12
  ```
- [ ] Verificar que `@vitejs/plugin-react` ya está en `landing/package.json` (ya existe)
- [ ] Verificar que `react-hook-form`, `zustand`, `@tanstack/react-query` y `axios` ya están (ya existen)

### b) Integración de Tailwind CSS 4 en `landing/vite.config.ts`

- [ ] Importar el plugin de Tailwind en `landing/vite.config.ts`:
  ```ts
  import tailwindcss from '@tailwindcss/vite'
  ```
- [ ] Agregar `tailwindcss()` al array `plugins` (ANTES de `react()`):
  ```ts
  plugins: [tailwindcss(), react()],
  ```
- [ ] El archivo final debe quedar:
  ```ts
  import { defineConfig } from 'vite'
  import tailwindcss from '@tailwindcss/vite'
  import react from '@vitejs/plugin-react'
  import path from 'path'

  export default defineConfig({
    plugins: [tailwindcss(), react()],
    envPrefix: 'VITE_',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@tadaima/api':         path.resolve(__dirname, '../packages/api/src/index.ts'),
        '@tadaima/hooks':       path.resolve(__dirname, '../packages/hooks/src/index.ts'),
        '@tadaima/auth':        path.resolve(__dirname, '../packages/auth/src/index.ts'),
        '@tadaima/permissions': path.resolve(__dirname, '../packages/permissions/src/index.ts'),
        '@tadaima/utils':       path.resolve(__dirname, '../packages/utils/src/index.ts'),
      },
    },
    server: { port: 5173 },
  })
  ```

### c) Copiar archivos de estilos: `tienda-T/src/styles/` → `landing/src/styles/`

- [ ] Crear carpeta `landing/src/styles/`
- [ ] Copiar `tienda-T/src/styles/tailwind.css` → `landing/src/styles/tailwind.css`
  - Contiene `@import "tailwindcss"` — entrada principal de Tailwind CSS 4
- [ ] Copiar `tienda-T/src/styles/theme.css` → `landing/src/styles/theme.css`
  - Contiene CSS variables light/dark para todos los tokens del design system (background, foreground, primary, sidebar, chart-1..5, etc.)
  - Contiene `@custom-variant dark (&:is(.dark *))` y bloque `@theme inline` con mapeo a colores de Tailwind
- [ ] Copiar `tienda-T/src/styles/fonts.css` → `landing/src/styles/fonts.css`
- [ ] Copiar `tienda-T/src/styles/glass.css` → `landing/src/styles/glass.css`
- [ ] Crear `landing/src/styles/index.css` con el orden correcto de imports:
  ```css
  @import './fonts.css';
  @import './tailwind.css';
  @import './theme.css';
  @import './glass.css';
  ```

### d) Importar estilos en `landing/src/main.tsx`

- [ ] Reemplazar cualquier import de CSS existente (ej. `import './index.css'`) por:
  ```ts
  import './styles/index.css'
  ```
- [ ] El orden en `main.tsx` debe ser:
  ```ts
  import './styles/index.css'   // 1. Estilos base (fonts, tailwind, theme, glass)
  import React from 'react'
  import ReactDOM from 'react-dom/client'
  import App from './App.tsx'
  ```

### e) Copiar componentes UI: `tienda-T/src/app/components/ui/` → `landing/src/components/ui/`

- [ ] Crear carpeta `landing/src/components/ui/`
- [ ] Copiar los siguientes 46 archivos **sin modificar**:
  - `accordion.tsx`
  - `alert-dialog.tsx`
  - `alert.tsx`
  - `aspect-ratio.tsx`
  - `avatar.tsx`
  - `badge.tsx`
  - `breadcrumb.tsx`
  - `button.tsx`
  - `calendar.tsx`
  - `card.tsx`
  - `carousel.tsx`
  - `chart.tsx`
  - `checkbox.tsx`
  - `collapsible.tsx`
  - `command.tsx`
  - `context-menu.tsx`
  - `dialog.tsx`
  - `drawer.tsx`
  - `dropdown-menu.tsx`
  - `form.tsx`
  - `hover-card.tsx`
  - `input-otp.tsx`
  - `input.tsx`
  - `label.tsx`
  - `menubar.tsx`
  - `navigation-menu.tsx`
  - `pagination.tsx`
  - `popover.tsx`
  - `progress.tsx`
  - `radio-group.tsx`
  - `resizable.tsx`
  - `scroll-area.tsx`
  - `select.tsx`
  - `separator.tsx`
  - `sheet.tsx`
  - `sidebar.tsx`
  - `skeleton.tsx`
  - `slider.tsx`
  - `sonner.tsx`
  - `switch.tsx`
  - `table.tsx`
  - `tabs.tsx`
  - `textarea.tsx`
  - `toggle-group.tsx`
  - `toggle.tsx`
  - `tooltip.tsx`
- [ ] En cada componente copiado, actualizar el import de `cn` si usa `@/lib/utils` — verificar que `landing/src/lib/utils.ts` existe con la función `cn` (basada en `clsx` + `tailwind-merge`). Crear si no existe:
  ```ts
  // landing/src/lib/utils.ts
  import { clsx, type ClassValue } from 'clsx'
  import { twMerge } from 'tailwind-merge'
  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
  }
  ```

### f) Copiar Layout: `tienda-T/src/app/components/Layout.tsx` → `landing/src/layouts/Layout.tsx`

- [ ] Crear carpeta `landing/src/layouts/`
- [ ] Copiar `tienda-T/src/app/components/Layout.tsx` → `landing/src/layouts/Layout.tsx`
- [ ] Actualizar imports internos del Layout para apuntar a `@/components/ui/` en vez de rutas relativas hacia `tienda-T/`
- [ ] El Layout de tienda-T usa el componente `sidebar.tsx` de shadcn/ui — verificar que los imports resuelven correctamente con el alias `@/`

### g) Copiar pantallas: `tienda-T/src/app/components/` → `landing/src/pages/`

- [ ] Crear carpeta `landing/src/pages/`
- [ ] Copiar y renombrar cada pantalla (ajustar imports internos en cada archivo):

  | Origen en tienda-T | Destino en landing |
  |---|---|
  | `SellPage.tsx` | `landing/src/pages/SellPage.tsx` |
  | `SalesPage.tsx` | `landing/src/pages/SalesPage.tsx` |
  | `ProductsPage.tsx` | `landing/src/pages/ProductsPage.tsx` |
  | `ClientsPage.tsx` | `landing/src/pages/ClientsPage.tsx` |
  | `TransfersPage.tsx` | `landing/src/pages/TransfersPage.tsx` |
  | `PreSalesPage.tsx` | `landing/src/pages/PreSalesPage.tsx` |
  | `ReportsPage.tsx` | `landing/src/pages/ReportsPage.tsx` |
  | `SettingsPage.tsx` | `landing/src/pages/SettingsPage.tsx` |
  | `AdminPage.tsx` | `landing/src/pages/AdminPage.tsx` |

- [ ] En cada página copiada, cambiar imports de `../ui/` a `@/components/ui/`
- [ ] Dejar los datos mock de tienda-T intactos por ahora — se reemplazarán en fases posteriores
- [ ] Las páginas aún no tienen datos reales — eso es correcto en esta fase

### h) Configurar React Router en `landing/src/router/index.tsx`

- [ ] Crear carpeta `landing/src/router/`
- [ ] Crear `landing/src/router/index.tsx` adaptando `tienda-T/src/app/routes.ts`:
  ```tsx
  import { createBrowserRouter } from 'react-router-dom'
  import { Layout } from '@/layouts/Layout'
  import { SellPage } from '@/pages/SellPage'
  import { SalesPage } from '@/pages/SalesPage'
  import { ProductsPage } from '@/pages/ProductsPage'
  import { ClientsPage } from '@/pages/ClientsPage'
  import { TransfersPage } from '@/pages/TransfersPage'
  import { PreSalesPage } from '@/pages/PreSalesPage'
  import { ReportsPage } from '@/pages/ReportsPage'
  import { SettingsPage } from '@/pages/SettingsPage'
  import { AdminPage } from '@/pages/AdminPage'

  export const router = createBrowserRouter([
    {
      path: '/',
      Component: Layout,
      children: [
        { index: true, Component: SellPage },
        { path: 'sales', Component: SalesPage },
        { path: 'products', Component: ProductsPage },
        { path: 'transfers', Component: TransfersPage },
        { path: 'clients', Component: ClientsPage },
        { path: 'pre-sales', Component: PreSalesPage },
        { path: 'reports', Component: ReportsPage },
        { path: 'settings', Component: SettingsPage },
        { path: 'admin', Component: AdminPage },
      ],
    },
  ])
  ```
- [ ] Actualizar `landing/src/App.tsx` para usar `<RouterProvider router={router} />`
- [ ] Usar `react-router-dom` (ya instalado en landing) — tienda-T usa `react-router` bare pero landing usa `react-router-dom`; los imports del router son compatibles

### i) Qué reutilizar directamente vs. qué adaptar

| Elemento | Acción |
|---|---|
| `src/components/ui/` (46 archivos) | Copiar sin modificar |
| `src/styles/` (theme, glass, fonts, tailwind) | Copiar sin modificar |
| `Layout.tsx` (sidebar, topbar, `<Outlet />`) | Copiar, solo actualizar imports |
| Páginas de tienda-T (datos mock) | Copiar, datos mock quedan hasta fase correspondiente |
| Routing | Adaptar a `react-router-dom` con `createBrowserRouter` |
| Datos hardcodeados en páginas | Reemplazar en fases 3, 5, 7–14 con hooks de `@tadaima/api` |
| Estado local en páginas | Reemplazar en fases posteriores con Zustand + TanStack Query |
| Auth (no existe en tienda-T) | Crear desde cero en Fase 3 |

### j) Verificación de Fase 0.5

- [ ] `npm run dev` desde `landing/` levanta sin errores de TypeScript ni de Vite
- [ ] El navegador muestra el Layout de tienda-T (sidebar + área de contenido)
- [ ] La ruta `/` muestra `SellPage` con sus datos mock
- [ ] La ruta `/sales` muestra `SalesPage`, `/products` muestra `ProductsPage`, etc.
- [ ] No hay errores de CSS (las CSS variables del tema cargan correctamente)
- [ ] El tema light/dark funciona si el Layout lo implementa con `next-themes`
- [ ] `npm run build` completa sin errores de TypeScript

---

## Fase 1 — Package `@tadaima/api`
**Tiempo estimado: 3–4h**

### 1a — Cliente Axios (45min)
- [ ] Crear `packages/api/src/client.ts` con instancia Axios apuntando a `process.env` / `import.meta.env`
- [ ] Agregar request interceptor: inyecta `Authorization: Bearer <token>` desde `tokenStorage`
- [ ] Agregar request interceptor: inyecta `Accept: application/json` y `Content-Type: application/json`
- [ ] Agregar response interceptor: en `401` limpia token y lanza error `AuthError`
- [ ] Agregar response interceptor: en `422` extrae `.errors` y lanza `ValidationError`
- [ ] Agregar response interceptor: desenvuelve `response.data.data` para retornar payload directo
- [ ] Exportar función `setTokenGetter(fn: () => string | null)` para inyección de token desde fuera

### 1b — Tipos TypeScript (1h)
- [ ] Crear `packages/api/src/types/auth.ts` — `User`, `LoginPayload`, `AuthResponse`
- [ ] Crear `packages/api/src/types/product.ts` — `Product`, `ProductPrice`, `ProductImage`, `CreateProductInput`, `UpdateProductInput`
- [ ] Crear `packages/api/src/types/sale.ts` — `Sale`, `SaleItem`, `Payment`, `CheckoutInput`
- [ ] Crear `packages/api/src/types/inventory.ts` — `Inventory`, `InventoryMovement`
- [ ] Crear `packages/api/src/types/customer.ts` — `Customer`, `CustomerCredit`
- [ ] Crear `packages/api/src/types/cashRegister.ts` — `CashRegisterSession`, `CashMovement`
- [ ] Crear `packages/api/src/types/transfer.ts` — `Transfer`, `TransferItem`
- [ ] Crear `packages/api/src/types/preSale.ts` — `PreSale`, `PreSaleItem`, `PreSalePayment`
- [ ] Crear `packages/api/src/types/catalog.ts` — `CatalogSetting`, `CatalogProduct`
- [ ] Crear `packages/api/src/types/common.ts` — `PaginatedResponse<T>`, `ApiResponse<T>`
- [ ] Crear `packages/api/src/types/index.ts` con re-exports de todos los tipos

### 1c — Funciones de endpoint (1.5h)
- [ ] `packages/api/src/auth.ts` — `login()`, `logout()`, `me()`
- [ ] `packages/api/src/products.ts` — `getProducts()`, `getProduct()`, `createProduct()`, `updateProduct()`, `deleteProduct()`, `addProductImage()`, `removeProductImage()`, `reorderProductImages()`, `getStorePrices()`, `updateStorePrices()`, `removeStorePrices()`
- [ ] `packages/api/src/sales.ts` — `getSales()`, `getSale()`, `createSale()`
- [ ] `packages/api/src/salesDrafts.ts` — `getDrafts()`, `createDraft()`, `getDraft()`, `cancelDraft()`, `addDraftItem()`, `updateDraftItem()`, `removeDraftItem()`
- [ ] `packages/api/src/inventory.ts` — `getInventory()`, `getMovements()`, `storeMovement()`, `updateInventory()`
- [ ] `packages/api/src/transfers.ts` — `getTransfers()`, `createTransfer()`, `getTransfer()`, `completeTransfer()`, `cancelTransfer()`
- [ ] `packages/api/src/customers.ts` — `getCustomers()`, `getCustomer()`, `createCustomer()`, `updateCustomer()`, `deleteCustomer()`, `getCredit()`, `addCredit()`
- [ ] `packages/api/src/cashRegister.ts` — `getSession()`, `openCash()`, `closeCash()`, `addMovement()`, `getMovements()`
- [ ] `packages/api/src/preSales.ts` — `getPreSales()`, `createPreSale()`, `getPreSale()`, `updatePreSale()`, `updateStatus()`, `addPayment()`, `getPayments()`
- [ ] `packages/api/src/reports.ts` — `getSalesReport()`, `getInventoryReport()`, `getCashReport()`, `getTopProducts()`, `getCustomersReport()`
- [ ] `packages/api/src/catalog.ts` — `getCatalogSettings()`, `updateCatalogSettings()`, `getCatalogProducts()`, `addCatalogProduct()`, `updateCatalogProduct()`, `removeCatalogProduct()`
- [ ] `packages/api/src/users.ts` — `getUsers()`, `createUser()`, `updateUser()`, `deleteUser()`, `assignRole()`, `removeRole()`
- [ ] `packages/api/src/roles.ts` — `getPermissions()`, `getRoles()`, `createRole()`, `updateRole()`, `assignPermissions()`
- [ ] `packages/api/src/config.ts` — terminales, métodos de pago, tiendas, bodegas, empresas, categorías
- [ ] `packages/api/src/settings.ts` — `getSettings()`, `getSetting()`, `updateSetting()`, `batchUpdateSettings()`
- [ ] `packages/api/src/logs.ts` — `getLogs()`, `createLog()`
- [ ] `packages/api/src/index.ts` — barrel export de todo

---

## Fase 2 — Package `@tadaima/auth` (lógica compartida)
**Tiempo estimado: 1.5h**

- [ ] Crear `packages/auth/src/types.ts` con interface `TokenStorage { get(): string | null, set(t: string): void, clear(): void }`
- [ ] Crear `packages/auth/src/AuthContext.tsx` — provider con estado: `user`, `token`, `isLoading`, `login()`, `logout()`
- [ ] En `AuthContext`: al montar, leer token → llamar `me()` → setear user o limpiar token
- [ ] En `AuthContext`: `login()` llama `api.login()`, guarda token, llama `me()`, setea user
- [ ] En `AuthContext`: `logout()` llama `api.logout()`, limpia token, limpia user
- [ ] Crear `packages/auth/src/useCurrentUser.ts` — hook que retorna `{ user, storeId, companyId, roles, can() }`
- [ ] Crear `packages/auth/src/index.ts` — barrel export

---

## Fase 3 — Auth Web UI
**Tiempo estimado: 1–1.5h**

> Base visual: usar componentes de `@/components/ui/` (button, input, form, card, label) que ya
> fueron migrados en Fase 0.5. NO crear nuevos componentes visuales — solo conectar la lógica.

- [ ] Crear `landing/src/lib/tokenStorage.ts` — implementación web: `localStorage.getItem/setItem/removeItem`
- [ ] Crear `landing/src/lib/queryClient.ts` — instancia `QueryClient` con staleTime 30s, retry 1
- [ ] Conectar `tokenStorage` al cliente Axios via `setTokenGetter()`
- [ ] Envolver `App.tsx` con `QueryClientProvider` + `AuthProvider`
- [ ] Crear página `landing/src/pages/auth/LoginPage.tsx`
  - [ ] Usar `Card`, `CardHeader`, `CardContent` de `@/components/ui/card` para el contenedor
  - [ ] Usar `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` de `@/components/ui/form`
  - [ ] Usar `Input` de `@/components/ui/input` para email y password
  - [ ] Usar `Button` de `@/components/ui/button` con estado loading (`disabled` + spinner de `lucide-react`)
  - [ ] Submit llama `login()` del AuthContext
  - [ ] En error 401: mostrar mensaje "Credenciales incorrectas" usando `sonner` toast
  - [ ] En éxito: redirigir a `/`
- [ ] Crear `landing/src/router/ProtectedRoute.tsx`
  - [ ] Si `isLoading`: mostrar `Skeleton` centrado (de `@/components/ui/skeleton`)
  - [ ] Si no hay user: redirect a `/login`
  - [ ] Si hay user: renderizar `<Outlet />`
- [ ] Actualizar router en `landing/src/router/index.tsx`
  - [ ] Ruta `/login` → `LoginPage` (pública, sin Layout)
  - [ ] Ruta `/` → `ProtectedRoute` → `Layout` → rutas internas (ya definidas en Fase 0.5)
- [ ] Agregar `<Toaster />` de `@/components/ui/sonner` en `App.tsx` para notificaciones globales
- [ ] Verificar: login funciona, token persiste en refresh, logout limpia y redirige

---

## Fase 4 — Package `@tadaima/permissions`
**Tiempo estimado: 1h**

- [ ] Crear `packages/permissions/src/permissions.ts` — objeto con todas las constantes de permisos del sistema
- [ ] Crear `packages/permissions/src/roleMap.ts` — mapa `{ admin: [...permisos], manager: [...], cashier: [...] }`
- [ ] Crear `packages/permissions/src/usePermission.ts` — hook `usePermission(p: string): boolean` usando `useCurrentUser()`
- [ ] Crear `packages/permissions/src/PermissionGate.tsx` — wrapper component, renderiza children o null/fallback
- [ ] Crear `packages/permissions/src/index.ts` — barrel

---

## Fase 5 — Layout Web + Routing completo
**Tiempo estimado: 1–1.5h**

> El Layout visual ya fue migrado desde tienda-T en Fase 0.5 (`landing/src/layouts/Layout.tsx`).
> Esta fase solo añade la lógica de auth, permisos en sidebar y rutas faltantes.

- [ ] Actualizar `landing/src/layouts/Layout.tsx` (base: `tienda-T/src/app/components/Layout.tsx`):
  - [ ] Reemplazar usuario hardcodeado en topbar → leer de `useCurrentUser()` de `@tadaima/auth`
  - [ ] Conectar botón logout → llamar `logout()` del `AuthContext`
  - [ ] Mostrar nombre de tienda activa desde `useCurrentUser().storeId` (resolver nombre via hook)
  - [ ] Ocultar items de sidebar sin permiso usando `PermissionGate` de `@tadaima/permissions`
- [ ] Crear `landing/src/layouts/AuthLayout.tsx` — layout centrado, sin sidebar (solo para `/login`)
- [ ] Expandir router con rutas faltantes (agregar a las ya definidas en Fase 0.5):
  - [ ] `/sales/:id` → `SaleDetailPage` (placeholder por ahora)
  - [ ] `/products/new` → `ProductFormPage` (placeholder)
  - [ ] `/products/:id` → `ProductDetailPage` (placeholder)
  - [ ] `/inventory` → `InventoryPage` (placeholder)
  - [ ] `/inventory/movements` → `MovementsPage` (placeholder)
  - [ ] `/customers` → redirigir a `/clients` (alias)
  - [ ] `/customers/:id` → `CustomerDetailPage` (placeholder)
  - [ ] `/transfers/new` → `NewTransferPage` (placeholder)
  - [ ] `/transfers/:id` → `TransferDetailPage` (placeholder)
  - [ ] `/pre-sales/:id` → `PreSaleDetailPage` (placeholder)
  - [ ] `/cash-register` → `CashRegisterPage` (placeholder)
  - [ ] `/reports/sales`, `/reports/inventory`, `/reports/cash`, `/reports/products`, `/reports/customers`
  - [ ] `/catalog` → `CatalogPage` (placeholder)
  - [ ] `/users` → `UsersPage` (placeholder)
  - [ ] `/roles` → `RolesPage` (placeholder)
  - [ ] `/settings/stores`, `/settings/warehouses`, `/settings/terminals`, `/settings/payment-methods`, `/settings/categories`
  - [ ] `/dashboard` → `DashboardPage` (placeholder)
- [ ] Crear `landing/src/pages/NotFoundPage.tsx` usando componentes de `@/components/ui/`
- [ ] Crear `landing/src/components/ComingSoon.tsx` (placeholder reutilizable para rutas no implementadas)
- [ ] Verificar navegación completa: todos los links del sidebar resuelven sin error 404

---

## Fase 6 — Package `@tadaima/hooks`
**Tiempo estimado: 2–3h**

- [ ] Crear un archivo de hooks por módulo, siguiendo el patrón: `useXList`, `useX(id)`, `useCreateX`, `useUpdateX`, `useDeleteX`
- [ ] `hooks/src/useAuth.ts` — wraps AuthContext
- [ ] `hooks/src/useProducts.ts`
- [ ] `hooks/src/useSales.ts`
- [ ] `hooks/src/useSalesDrafts.ts`
- [ ] `hooks/src/useInventory.ts`
- [ ] `hooks/src/useTransfers.ts`
- [ ] `hooks/src/useCustomers.ts`
- [ ] `hooks/src/useCashRegister.ts`
- [ ] `hooks/src/usePreSales.ts`
- [ ] `hooks/src/useReports.ts`
- [ ] `hooks/src/useCatalog.ts`
- [ ] `hooks/src/useUsers.ts`
- [ ] `hooks/src/useRoles.ts`
- [ ] `hooks/src/useSettings.ts`
- [ ] `hooks/src/useLogs.ts`
- [ ] Definir query keys como constantes en `hooks/src/queryKeys.ts`
- [ ] Cada mutation invalida la query key correcta al completarse
- [ ] `hooks/src/index.ts` — barrel

---

## Fase 7 — Web: Módulo Productos + Inventario
**Tiempo estimado: 2.5–3h**

> Base: `tienda-T/src/app/components/ProductsPage.tsx` — ya implementada con UI completa.
> Esta fase reemplaza los datos mock por llamadas reales a `@tadaima/api` y `@tadaima/hooks`.

### Productos (1.5h)
- [ ] `landing/src/pages/ProductsPage.tsx` (base: tienda-T `ProductsPage.tsx`):
  - [ ] Reemplazar array mock de productos → `useProductList()` de `@tadaima/hooks`
  - [ ] Conectar filtros de nombre/SKU, categoría, activo/inactivo a parámetros de query
  - [ ] Conectar paginación a `page` y `per_page` de `PaginatedResponse<Product>`
  - [ ] Mostrar `Skeleton` de `@/components/ui/skeleton` mientras carga
  - [ ] Mostrar estado vacío si no hay resultados
- [ ] Crear `landing/src/pages/ProductDetailPage.tsx` (nueva — no existe en tienda-T):
  - [ ] Usar `Tabs`, `TabsContent` de `@/components/ui/tabs` para Info | Precios | Imágenes | Inventario | Precios por tienda
  - [ ] Conectar a `useProduct(id)` de `@tadaima/hooks`
- [ ] Crear `landing/src/pages/ProductFormPage.tsx` (nueva):
  - [ ] Usar `Form`, `FormField`, `Input`, `Select`, `Switch` de `@/components/ui/`
  - [ ] Reutilizar para crear y editar (detectar si hay `id` en params)
  - [ ] Conectar a `useCreateProduct()` y `useUpdateProduct()` de `@tadaima/hooks`
  - [ ] Sub-sección precios: price_1 a price_5 con `Input`
  - [ ] Sub-sección métodos de pago: allow_cash / allow_card con `Switch`
  - [ ] Gestión de imágenes: lista con botón añadir, eliminar, drag-to-reorder (ya hay `react-dnd` instalado)
  - [ ] Gestión de precios por tienda: selector `Select` de tienda + campos de precio por nivel
  - [ ] Botón desactivar con `AlertDialog` de `@/components/ui/alert-dialog` (no eliminar si tiene ventas)
- [ ] Confirmar delete con `AlertDialog` antes de llamar `useDeleteProduct()`

### Inventario (1h)
- [ ] Crear `landing/src/pages/InventoryPage.tsx` (nueva):
  - [ ] Usar `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` de `@/components/ui/table`
  - [ ] Conectar a `useInventory()` de `@tadaima/hooks`
  - [ ] Filtros: bodega, tienda, low_stock — badge de alerta con `Badge` de `@/components/ui/badge`
  - [ ] Botón "Ajuste manual" → `Dialog` de `@/components/ui/dialog` con formulario de producto, cantidad, notas
- [ ] Crear `landing/src/pages/MovementsPage.tsx` (nueva):
  - [ ] Conectar a `useInventoryMovements()` de `@tadaima/hooks`
  - [ ] Columna "tipo" con `Badge` de color (entrada verde / salida rojo / transferencia azul)
  - [ ] Filtros: fecha (usar `react-day-picker` con `Calendar` de `@/components/ui/calendar`), tipo, producto

---

## Fase 8 — Web: Ventas + Clientes
**Tiempo estimado: 2–2.5h**

> Base: `tienda-T/src/app/components/SalesPage.tsx` y `ClientsPage.tsx` — ya implementadas con UI completa.

### Ventas (1h)
- [ ] `landing/src/pages/SalesPage.tsx` (base: tienda-T `SalesPage.tsx`):
  - [ ] Reemplazar datos mock → `useSalesList()` de `@tadaima/hooks`
  - [ ] Conectar filtros: fechas (usar `Popover` + `Calendar`), tienda, usuario, estado
  - [ ] Columna total formateada con `@tadaima/utils/currency`
  - [ ] Mostrar `Skeleton` mientras carga, estado vacío si no hay resultados
- [ ] Crear `landing/src/pages/SaleDetailPage.tsx` (nueva):
  - [ ] Conectar a `useSale(id)` de `@tadaima/hooks`
  - [ ] Mostrar items vendidos en `Table`, pagos por método, totales, cliente
  - [ ] `Badge` de estado: completada / cancelada / devuelta

### Clientes (1.5h)
- [ ] `landing/src/pages/ClientsPage.tsx` (base: tienda-T `ClientsPage.tsx`):
  - [ ] Reemplazar datos mock → `useCustomerList()` de `@tadaima/hooks`
  - [ ] Conectar búsqueda y paginación
  - [ ] Mostrar `Skeleton` mientras carga
- [ ] Crear `landing/src/pages/CustomerDetailPage.tsx` (nueva):
  - [ ] Usar `Tabs` para Info | Crédito | Historial de ventas
  - [ ] Conectar a `useCustomer(id)` de `@tadaima/hooks`
  - [ ] Tab crédito: saldo actual, historial de movimientos de crédito
  - [ ] Botón "Agregar crédito" → `Dialog` con monto y notas, conectado a `useAddCredit()`
- [ ] Crear `landing/src/pages/CustomerFormPage.tsx` (nueva):
  - [ ] Usar `Form`, `Input`, `Button` de `@/components/ui/`
  - [ ] Conectar a `useCreateCustomer()` y `useUpdateCustomer()`

---

## Fase 9 — Web: Traspasos + PreVentas
**Tiempo estimado: 1.5–2h**

> Base: `tienda-T/src/app/components/TransfersPage.tsx` y `PreSalesPage.tsx` — ya implementadas.

### Traspasos (1h)
- [ ] `landing/src/pages/TransfersPage.tsx` (base: tienda-T `TransfersPage.tsx`):
  - [ ] Reemplazar datos mock → `useTransferList()` de `@tadaima/hooks`
  - [ ] Conectar filtros: bodega origen/destino, estado, fechas
  - [ ] `Badge` de estado: pending / completed / cancelled
  - [ ] Mostrar `Skeleton` mientras carga
- [ ] Crear `landing/src/pages/TransferDetailPage.tsx` (nueva):
  - [ ] Conectar a `useTransfer(id)` de `@tadaima/hooks`
  - [ ] Mostrar ítems y bodegas en `Table`
  - [ ] Botones Completar / Cancelar (si pending) con `AlertDialog` de confirmación (es irreversible)
  - [ ] Conectar a `useCompleteTransfer()` y `useCancelTransfer()`
- [ ] Crear `landing/src/pages/NewTransferPage.tsx` (nueva):
  - [ ] Selector `Select` de bodega origen y destino
  - [ ] `Table` editable de ítems con producto + cantidad
  - [ ] Conectar a `useCreateTransfer()`

### Pre-Ventas / Apartados (1h)
- [ ] `landing/src/pages/PreSalesPage.tsx` (base: tienda-T `PreSalesPage.tsx`):
  - [ ] Reemplazar datos mock → `usePreSaleList()` de `@tadaima/hooks`
  - [ ] Conectar filtros: estado, cliente, fechas
  - [ ] `Badge` de estado con color: live / ready / completed / cancelled
  - [ ] Mostrar `Skeleton` mientras carga
- [ ] Crear `landing/src/pages/PreSaleDetailPage.tsx` (nueva):
  - [ ] Conectar a `usePreSale(id)` de `@tadaima/hooks`
  - [ ] Mostrar ítems, pagos registrados en `Table`, saldo pendiente
  - [ ] Botón "Registrar pago" → `Dialog` con monto y `Select` de método de pago
  - [ ] Botones de cambio de estado con `AlertDialog` de confirmación
  - [ ] Conectar a `useAddPreSalePayment()` y `useUpdatePreSaleStatus()`

---

## Fase 10 — Web: Reportes
**Tiempo estimado: 1.5–2h**

> Base: `tienda-T/src/app/components/ReportsPage.tsx` — ya implementada con gráficas (recharts) y tablas.
> Solo conectar datos reales y agregar filtros funcionales.

- [ ] `landing/src/pages/ReportsPage.tsx` (base: tienda-T `ReportsPage.tsx`):
  - [ ] Reemplazar datos mock de gráficas recharts → `useSalesReport()` de `@tadaima/hooks`
  - [ ] Conectar filtros de rango de fechas (usar `Popover` + `Calendar` de `@/components/ui/`)
  - [ ] Cards de resumen: total ventas, revenue total, descuentos, comisiones — conectar a API
  - [ ] Gráfica de tendencia diaria (línea) — ya existe en tienda-T con recharts, solo cambiar data
  - [ ] Tabla breakdown por método de pago — conectar a API
- [ ] Crear `landing/src/pages/reports/ReportsInventoryPage.tsx` (nueva, si se separa en sub-rutas):
  - [ ] Conectar a `useInventoryReport()` con filtro `low_stock`
  - [ ] `Badge` rojo si qty ≤ threshold
- [ ] Crear `landing/src/pages/reports/ReportsCashPage.tsx` (nueva):
  - [ ] Conectar a `getCashReport()` — tabla de sesiones de caja
  - [ ] `Badge` diferencia en rojo si ≠ 0
- [ ] Crear `landing/src/pages/reports/ReportsTopProductsPage.tsx` (nueva):
  - [ ] Conectar a `useTopProductsReport()` — tabla rank, producto, unidades, revenue
- [ ] Crear `landing/src/pages/reports/ReportsCustomersPage.tsx` (nueva):
  - [ ] Conectar a `useCustomersReport()` — top clientes: compras, gasto, crédito
- [ ] Botón "Exportar CSV" en cada tabla (frontend-only con datos ya cargados)
- [ ] Mostrar `Skeleton` en gráficas y tablas mientras cargan

---

## Fase 11 — Web: Usuarios + Roles
**Tiempo estimado: 2h**

> Base: `tienda-T/src/app/components/AdminPage.tsx` — contiene UI de usuarios y roles.
> Separar en páginas independientes y conectar a la API.

### Usuarios (1h)
- [ ] Crear `landing/src/pages/UsersPage.tsx` (base: sección usuarios de tienda-T `AdminPage.tsx`):
  - [ ] Reemplazar datos mock → `useUserList()` de `@tadaima/hooks`
  - [ ] Filtros: tienda (`Select`), activo (`Switch`), búsqueda (`Input`)
  - [ ] Mostrar `Skeleton` mientras carga
- [ ] Crear `landing/src/pages/UserFormPage.tsx` (nueva):
  - [ ] Usar `Form`, `Input`, `Select` de `@/components/ui/`
  - [ ] Campos: nombre, email, contraseña, tienda, rol
  - [ ] Toggle activo/inactivo con `Switch` — manejar 422 del backend (no auto-desactivarse)
  - [ ] Sección roles: chips con `Badge`, botón añadir con `Select`, botón quitar
  - [ ] Conectar a `useCreateUser()` y `useUpdateUser()`

### Roles (1h)
- [ ] Crear `landing/src/pages/RolesPage.tsx` (base: sección roles de tienda-T `AdminPage.tsx`):
  - [ ] Reemplazar datos mock → `useRoleList()` de `@tadaima/hooks`
  - [ ] Mostrar permisos de cada rol en chips `Badge`
- [ ] Crear `landing/src/pages/RoleFormPage.tsx` (nueva):
  - [ ] Nombre con `Input`, selector de permisos con `Checkbox` de `@/components/ui/checkbox`
  - [ ] Permisos agrupados por módulo con `Accordion` de `@/components/ui/accordion`
  - [ ] `AlertDialog` de confirmación antes de guardar (reemplaza permisos existentes)
  - [ ] Conectar a `useCreateRole()` y `useUpdateRole()` con `useAssignPermissions()`

---

## Fase 12 — Web: Configuración + Catálogo
**Tiempo estimado: 2–2.5h**

> Base: `tienda-T/src/app/components/SettingsPage.tsx` — ya implementada con tabs de configuración.
> Conectar datos reales y guardar cambios a través de la API.

### Configuración (1.5h)
- [ ] `landing/src/pages/SettingsPage.tsx` (base: tienda-T `SettingsPage.tsx`):
  - [ ] Estructura de `Tabs` ya existe — mantener tabs: General | Tiendas | Bodegas | Terminales | Métodos de Pago | Categorías
  - [ ] Tab General: reemplazar datos mock → `useSettings()` de `@tadaima/hooks`, formulario batch con `useUpdateSettings()`
  - [ ] Tab Tiendas: tabla + form crear/editar → `useStoreList()`, `useCreateStore()`, `useUpdateStore()`; gestión de métodos de pago por tienda
  - [ ] Tab Bodegas: tabla + form → `useWarehouseList()`, `useCreateWarehouse()`, `useUpdateWarehouse()`; bloquear delete si tiene stock (manejar error del backend)
  - [ ] Tab Terminales: tabla + form → `useTerminalList()`, `useCreateTerminal()`, `useUpdateTerminal()` con `commission_percent`
  - [ ] Tab Métodos de Pago: tabla + form → `usePaymentMethodList()`, `useCreatePaymentMethod()`, `useUpdatePaymentMethod()`
  - [ ] Tab Categorías: tabla + form → `useCategoryList()`, `useCreateCategory()`, `useUpdateCategory()`; bloquear delete si tiene productos

### Catálogo Online (1h)
- [ ] Crear `landing/src/pages/CatalogPage.tsx` (nueva — no existe en tienda-T):
  - [ ] `Select` de tienda al inicio para elegir tienda a configurar
  - [ ] Panel izquierdo: config con `Input` para `catalog_url`, `Switch` para `show_price` / `show_stock`
  - [ ] Mostrar URL pública generada con botón copiar (usar `navigator.clipboard.writeText`)
  - [ ] Panel derecho: lista de productos en catálogo con `Switch` visible/oculto
  - [ ] `Input` buscador para agregar productos al catálogo
  - [ ] Conectar a `useCatalogSettings()`, `useUpdateCatalogSettings()`, `useCatalogProducts()`, `useAddCatalogProduct()`, `useRemoveCatalogProduct()`

---

## Fase 13 — Web: Dashboard
**Tiempo estimado: 0.5–1h**

> No existe en tienda-T — crear desde cero usando componentes de `@/components/ui/`.
> Usar `Card`, `CardHeader`, `CardContent`, `CardTitle` de `@/components/ui/card`.

- [ ] Crear `landing/src/pages/DashboardPage.tsx`:
  - [ ] Card "Ventas de hoy" → `useSalesReport({ from: today, to: today })`
  - [ ] Card "Stock bajo" → `useInventoryReport({ low_stock: true })` — cuenta de productos
  - [ ] Card "Sesión de caja" → `useCashRegisterSession()` — estado, opening_cash
  - [ ] Card "Apartados activos" → `usePreSaleList({ status: 'live,ready' })` — count
  - [ ] Acceso rápido: grid de links a módulos más usados con iconos de `lucide-react`
  - [ ] Mostrar `Skeleton` en cada card mientras carga
  - [ ] Redirigir `/dashboard` como ruta de inicio post-login (actualizar router)

---

## Fase 14 — Web: Polish + Errores globales
**Tiempo estimado: 1.5–2h**

> La mayoría de componentes UI ya existen desde Fase 0.5. Esta fase añade la lógica de manejo de
> errores, estados globales y refinamiento final.

- [ ] Crear `landing/src/components/ErrorBoundary.tsx` — usar `Skeleton` y `Alert` de `@/components/ui/`
- [ ] Manejo de errores de red (sin conexión) → banner persistente con `Alert` de `@/components/ui/alert`
- [ ] Verificar que todas las tablas y páginas de detalle tienen `Skeleton` mientras cargan (componente de `@/components/ui/skeleton`)
- [ ] Verificar estado vacío (empty state) con mensaje en cada listado — reutilizar un componente `EmptyState` si se repite el patrón
- [ ] Validaciones de formulario con mensajes en español — `React Hook Form` + `zod` (instalar zod si no está: `npm install zod @hookform/resolvers`)
- [ ] Verificar que todos los `AlertDialog` de confirmación están en acciones destructivas (delete, cancel, complete)
- [ ] Aplicar `PermissionGate` en sidebar (ocultar items sin acceso) y en botones de acción — usar `@tadaima/permissions`
- [ ] Títulos de pestaña por página: `document.title = 'Tadaima | NombrePágina'` en cada page (o usar un hook centralizado)
- [ ] Favicon en `landing/public/`
- [ ] PWA: añadir `manifest.webmanifest` básico en `landing/public/`

---

## Fase 15 — Build + Deploy Web
**Tiempo estimado: 1–2h**

- [ ] Configurar variables de entorno por ambiente: `landing/.env.local`, `landing/.env.production`
- [ ] `VITE_API_URL` en `.env.production` apunta a URL de producción del backend Laravel
- [ ] `npm run build` desde `landing/` produce `dist/` sin errores TypeScript ni de Vite
- [ ] Configurar `vercel.json` o nginx para SPA (redirigir todo a `index.html`):
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
- [ ] Deploy en Vercel / VPS y probar contra backend de producción
- [ ] Verificar que la app carga, el login funciona, y los módulos conectan correctamente con la API real

---

## Criterio de completitud por módulo

Cada módulo web se considera completo cuando:
- [ ] Lista paginada con filtros funciona (datos reales, no mock)
- [ ] CRUD completo (crear, ver detalle, editar, eliminar/desactivar)
- [ ] Loading skeleton implementado (no pantalla en blanco)
- [ ] Error states implementados (mensaje visible del backend, no genérico)
- [ ] Permisos aplicados (botones ocultos sin acceso via `PermissionGate`)
- [ ] Mutaciones muestran feedback (toast éxito / error via `sonner`)
- [ ] Datos se refrescan automáticamente tras mutación (invalidación de query key)
- [ ] Sin datos mock ni `console.log` sin comentario `// TODO`

---

## Resumen de tiempos estimados (revisado)

| Fase | Nombre | Tiempo original | Tiempo revisado | Reducción |
|---|---|---|---|---|
| 0 | Monorepo + Scaffolding | 2–3h | 2–3h | — |
| **0.5** | **Migración UI desde tienda-T** | **—** | **2–3h** | nuevo |
| 1 | Package @tadaima/api | 3–4h | 3–4h | — |
| 2 | Package @tadaima/auth | 1.5h | 1.5h | — |
| 3 | Auth Web UI | 2h | 1–1.5h | -30% (UI ya existe) |
| 4 | Package @tadaima/permissions | 1h | 1h | — |
| 5 | Layout Web + Routing completo | 2–3h | 1–1.5h | -50% (Layout ya existe) |
| 6 | Package @tadaima/hooks | 2–3h | 2–3h | — |
| 7 | Productos + Inventario | 4–5h | 2.5–3h | -40% (UI ya existe) |
| 8 | Ventas + Clientes | 3–4h | 2–2.5h | -35% (UI ya existe) |
| 9 | Traspasos + PreVentas | 3h | 1.5–2h | -40% (UI ya existe) |
| 10 | Reportes | 3–4h | 1.5–2h | -50% (recharts ya existe) |
| 11 | Usuarios + Roles | 3h | 2h | -35% (UI ya existe) |
| 12 | Configuración + Catálogo | 3–4h | 2–2.5h | -35% (Settings UI ya existe) |
| 13 | Dashboard | 1–2h | 0.5–1h | -50% (components ya existen) |
| 14 | Polish + errores globales | 2–3h | 1.5–2h | -30% (components ya existen) |
| 15 | Build + Deploy | 1–2h | 1–2h | — |

**Total estimado original:** ~40–52h de trabajo web
**Total estimado revisado:** ~30–40h de trabajo web
**Ahorro estimado:** ~10–15h gracias a tienda-T como base visual
