# PLAN ACTUALIZADO TADAIMA POS — Frontend Web
**Fecha:** 2026-04-15 | Re-análisis post sesión 9 (SellPage operativo)

---

## ESTADO REAL HOY

### ✅ Lo que funciona (no tocar)
- **SellPage.tsx** — POS completamente operativo: login → buscar producto → carrito → checkout con modal de efectivo, cambio, denominaciones rápidas. Todo conectado a `@tadaima/api`.
- **LoginPage.tsx** — Completamente funcional.
- **`@tadaima/api`** — `auth`, `products`, `drafts`, `sales`, `stores`, `warehouses`, `inventory` implementados.
- **`@tadaima/auth`** — `AuthContext`, `useCurrentUser` implementados.
- **StoreContext** — carga tiendas reales.
- **Layout + ProtectedRoute** — funcionan.

### Diagnóstico de cada página

| Página | Problema | Trabajo |
|--------|----------|---------|
| **ProductsPage** | UI completa con mock data fallback. Importa `@tadaima/api` pero falta `updateProduct`. | Mediano |
| **SalesPage** | 100% Supabase Edge Function. UI excelente: filtros, gráfico, tabla expandible. | Alto |
| **ClientsPage** | Llama a `api.get/post` sin definir. Backend customers ✅ listo. | Mediano |
| **PreSalesPage** | Todas las llamadas son `fetch()` crudo a Supabase. Backend pre-sales ✅ listo. | Alto |
| **AdminPage** | UI con 8 tabs. Sucursales/Bodegas/Inventario tienen backend listo. Resto bloqueado. | Alto/parcial |
| **StoresPage** | YA usa `@tadaima/api`, casi lista. `company_id` hardcodeado. | Bajo |
| **DashboardPage** | Datos mock. Sin endpoints de reportes en backend. | Bloqueada |
| **SettingsPage** | Llama a `/catalog/settings` y `/system/logs` — no existen. | Bloqueada |
| **ReportsPage** | Llama a `/reports/daily` e `/reports/inventory` — no existen. | Bloqueada |
| **TransfersPage** | Llama a `/transfers` — no existe en backend. | Bloqueada |

### Falta en `@tadaima/api` package
- `customers.ts` — getCustomers, createCustomer, updateCustomer, deleteCustomer
- `preSales.ts` — getPreSales, createPreSale, updatePreSaleStatus, addPreSalePayment, getPreSalePayments
- `sales.ts` — faltan getSales, getSale (solo existe createSale)
- `products.ts` — falta updateProduct

---

## DEPENDENCIAS

```
Fase 1 (ampliar @tadaima/api)
  ├── desbloquea Fase 2 (ClientsPage)
  ├── desbloquea Fase 3 (SalesPage)
  └── desbloquea Fase 4 (PreSalesPage)

Fase 1 + Fase 5 (updateProduct)
  └── desbloquea Fase 6 (ProductsPage completa)

Fase 7 (StoresPage) — independiente
Fase 8 (AdminPage parcial) — independiente, usa stores/warehouses listos

BLOQUEADAS por backend:
  DashboardPage real → espera /reports/daily
  ReportsPage → espera /reports/*
  SettingsPage → espera /system/settings, /catalog/settings
  TransfersPage → espera /transfers
  Cash Register → espera /cash/*
```

---

## FASE 1 — Ampliar `@tadaima/api`: customers, pre-sales, getSales, updateProduct
**Estimado: 2-3h** | **Prerequisitos: ninguno**

**Archivos a crear/modificar:**
- `packages/api/src/customers.ts` (nuevo)
- `packages/api/src/preSales.ts` (nuevo)
- `packages/api/src/sales.ts` (agregar getSales, getSale)
- `packages/api/src/products.ts` (agregar updateProduct)
- `packages/api/src/types.ts` (nuevos tipos)
- `packages/api/src/index.ts` (exportar todo)

**Trabajo concreto:**

1. `customers.ts` — tipos: `Customer` (id, name, phone, email, address, notes, points, created_at), `CreateCustomerInput`, `UpdateCustomerInput`. Funciones: `getCustomers(params?)`, `getCustomer(id)`, `createCustomer(input)`, `updateCustomer(id, input)`, `deleteCustomer(id)`

2. `preSales.ts` — tipos: `PreSale`, `PreSaleItem`, `PreSalePayment`, `CreatePreSaleInput`, `PreSaleStatus = 'live' | 'ready' | 'completed' | 'cancelled'`. Funciones: `getPreSales(params?)`, `getPreSale(id)`, `createPreSale(input)`, `updatePreSaleStatus(id, status, opts?)`, `addPreSalePayment(id, input)`, `getPreSalePayments(id)`

3. En `sales.ts` agregar: `getSales(params?: { from?, to?, store_id?, status? })` → `GET /sales` | `getSale(id)` → `GET /sales/{id}` con tipos `SaleDetail` (sale con items), `SaleItemDetail`

4. En `products.ts` agregar: `updateProduct(id, input: UpdateProductInput)` → `PUT /products/{id}`

**Criterio:** TypeScript compila sin errores. Cada función hace la HTTP call correcta.

---

## FASE 2 — ClientsPage: conectar backend
**Estimado: 1.5-2h** | **Prerequisitos: Fase 1**

**Fuente:** `tienda-T-develop/src/app/components/ClientsPage.tsx` (454 líneas) — muy similar al landing. Usar como referencia.

**Endpoints:** `GET /customers`, `POST /customers`, `PUT /customers/{id}`

**Trabajo:**
1. `import { getCustomers, createCustomer, updateCustomer } from '@tadaima/api'`
2. Reemplazar `api.get('/customers')` → `await getCustomers()`
3. El campo `tier` se calcula en frontend: 0-199=Bronce, 200-499=Plata, 500-1999=Oro, 2000+=Leyenda
4. Quitar `@ts-nocheck`

**Criterio:** Lista clientes reales. Se puede crear/editar sin errores TS.

---

## FASE 3 — SalesPage: reemplazar Supabase
**Estimado: 2-3h** | **Prerequisitos: Fase 1**

**Fuente:** Usar landing actual (ya tiene la UI correcta — igual que tienda-T-develop).

**Endpoints:** `GET /sales`, `GET /pre-sales`, `GET /products`

**Trabajo:**
1. Remover `projectId, publicAnonKey`, la constante `API_BASE`
2. `import { getSales, getProducts } from '@tadaima/api'` + `import { getPreSales } from '@tadaima/api'`
3. En `fetchData()` reemplazar los 3 `fetch()` por las funciones del package
4. Adaptar mapeo de datos: backend devuelve `payments: SalePayment[]` (array). Para columna de método de pago en tabla: tomar `payments[0].payment_method_id` y mapear a nombre.
5. `productMap` desde `Product[]` del API: `p.id.toString()` → `{ name: p.name, sku: p.sku }`
6. Quitar `@ts-nocheck`

**Criterio:** Ventas reales se muestran. Filtros funcionan.

---

## FASE 4 — PreSalesPage: migración completa Supabase → `@tadaima/api`
**Estimado: 4-6h** | **Prerequisitos: Fases 1 y 2** | **La más compleja**

**Fuente:** `tienda-T-develop/src/app/components/PreSalesPage.tsx` (2868 líneas, +824 que landing). **NO copiar completo** — analizar qué extras tiene antes. Trabajar sobre landing actual.

**Endpoints:** `GET /pre-sales`, `POST /pre-sales`, `GET /pre-sales/{id}/payments`, `PATCH /pre-sales/{id}/status`, `POST /pre-sales/{id}/payments`, `GET /customers`, `GET /products`

**Trabajo:**
1. Remover `projectId, publicAnonKey`, `API_BASE`
2. Agregar imports de `@tadaima/api`
3. `fetchPreSales()` → `await getPreSales()`
4. `openDetail()` carga de pagos → `await getPreSalePayments(id)`
5. `handleAbono()` → `await addPreSalePayment(id, {...})`
   - **ELIMINAR** la llamada a `POST /cash/movements` que viene después — Cash Register no está implementado
6. `handleChangeStatus()` → `await updatePreSaleStatus(id, status, { cancel_reason })`
   - **ELIMINAR** llamadas a `inventory/movements` y `customers/{id}/saldo-favor` — el backend las maneja en `PreSaleService` automáticamente
7. Modal nueva preventa: reemplazar carga de clientes y productos
8. `handleCreatePreSale()`: mapear niveles de precio A/B/C → price_1/price_2/price_3 antes de enviar
9. Mapeo de status: backend usa inglés (`live`, `ready`, `completed`, `cancelled`), UI usa español → función de mapeo bidireccional
10. Quitar `@ts-nocheck`

**Criterio:** Crear preventa, registrar abono, cambiar status. Sin llamadas Supabase.

---

## FASE 5 — ProductsPage: quitar mock data, conectar edición
**Estimado: 3-4h** | **Prerequisitos: Fase 1**

**Fuente:** `tienda-T-develop/src/app/components/ProductsPage.tsx` (2082 líneas, +576). Analizar si los extras valen antes de copiar (probablemente categorías que dependen de backend no implementado).

**Endpoints:** `GET /products`, `POST /products`, `PUT /products/{id}`, `GET /warehouses`, `GET /inventory`, `PUT /inventory/{productId}/{warehouseId}`

**Trabajo:**
1. Eliminar array `initialProducts` (mock data). Cambiar a `useState<Producto[]>([])` con `isLoading`
2. Conectar `onSave` del `ProductModal`: nuevo → `createProduct(input)`, edición → `updateProduct(id, input)`
3. Si hay imagen: `uploadProductImage(id, file)` después de crear/editar (verificar si el endpoint existe en backend)
4. Activar flujo de inventario por bodega en el modal (código ya existe, está comentado/incompleto)
5. Tab Categorías: usar las que vengan de `p.category?.name` de los productos — NO inventar endpoint `/product-categories`
6. Quitar `@ts-nocheck`, resolver errores TS

**Criterio:** Productos reales. Se puede crear y editar. Sin mock data.

---

## FASE 6 — StoresPage: completar (casi lista)
**Estimado: 1-2h** | **Prerequisitos: ninguno**

**Endpoints:** `GET /stores`, `POST /stores`, `PUT /stores/{id}`, `GET /warehouses`, `POST /warehouses`

**Trabajo:**
1. `company_id` en createStore → obtener de `useAuth().user?.company_id`. Si es null, mostrar error.
2. Verificar tipos de `warehouse.type`: el modal usa strings en español (`"tienda"`, `"bodega"`) pero el API acepta `'central' | 'store'` → mapear antes de enviar
3. Quitar `@ts-nocheck`, corregir errores TS

**Criterio:** Crear/editar sucursales y bodegas sin errores.

---

## FASE 7 — AdminPage: tabs con backend listo
**Estimado: 3-4h** | **Prerequisitos: Fases 1 y 6**

**Fuente:** `tienda-T-develop/src/app/components/AdminPage.tsx` (1634 líneas, +319). Analizar qué extras tiene.

**Tabs OPERATIVOS** (conectar):
- TabSucursales → `GET/POST/PUT /stores`
- TabBodegas → `GET/POST /warehouses`
- TabInventario → `GET /inventory`, `PUT /inventory/{productId}/{warehouseId}`

**Tabs BLOQUEADOS** (agregar banner "Pendiente de implementación en backend", deshabilitar acciones):
- TabEmpresa → necesita `/companies`
- TabUsuarios → necesita `/users`
- TabRoles → necesita `/roles`, `/permissions`
- TabCategorias → necesita `/product-categories`
- TabTerminales → necesita `/terminals`

**Trabajo:**
1. Reemplazar todos los `fetch(API/stores)` → imports de `@tadaima/api`
2. Reemplazar todos los `fetch(API/warehouses)` → imports de `@tadaima/api`
3. Reemplazar todos los `fetch(API/inventory)` → imports de `@tadaima/api`
4. Agregar banner de "pendiente" en los 5 tabs bloqueados
5. Remover `projectId, publicAnonKey`, `API`, `H`
6. Quitar `@ts-nocheck`

**Criterio:** 3 tabs funcionan con datos reales. 5 tabs muestran banner sin errores en consola.

---

## FASES BLOQUEADAS (esperar backend)

| Fase | Página | Bloqueada por | Estimado cuando desbloquee |
|------|--------|--------------|---------------------------|
| B1 | DashboardPage real | `/reports/daily` o resumen de ventas | 2-3h |
| B2 | ReportsPage | `/reports/sales`, `/reports/inventory`, `/reports/cash` | 2h |
| B3 | TransfersPage | `/transfers`, `/transfers/{id}/complete` | 3-4h |
| B4 | SettingsPage | `/system/settings`, `/catalog/settings` | 1-2h |
| B5 | Cash Register | `/cash/session`, `/cash/open`, `/cash/close` | 4-5h + cambios en SellPage |

**Alternativa para DashboardPage:** Conectar `getSales()` y calcular métricas del día en frontend (ventas del día, total). No ideal pero libera dependencia. ~2h.

---

## ORDEN DE EJECUCIÓN RECOMENDADO

```
Día 1:  Fase 1 — ampliar @tadaima/api (customers, preSales, getSales, updateProduct)
Día 2:  Fase 2 (ClientsPage) + Fase 3 (SalesPage)
Día 3-4: Fase 4 — PreSalesPage (la más larga)
Día 5:  Fase 5 — ProductsPage (quitar mocks, conectar edición)
Día 6:  Fase 6 (StoresPage rápida) + Fase 7 (AdminPage)
Día 7:  Dashboard alternativo con getSales() mientras llega backend de reports
```

---

## RESUMEN DE TIEMPO

| Fase | Módulo | Horas |
|------|--------|-------|
| 1 | Ampliar @tadaima/api | 2-3h |
| 2 | ClientsPage | 1.5-2h |
| 3 | SalesPage | 2-3h |
| 4 | PreSalesPage | 4-6h |
| 5 | ProductsPage | 3-4h |
| 6 | StoresPage | 1-2h |
| 7 | AdminPage | 3-4h |
| **Total activo** | | **~17-24h** |
| B1-B5 | Bloqueadas por backend | ~14h cuando esté listo |

---

## PRIORIDAD SUGERIDA PARA BACKEND (desbloquear frontend)
1. Cash Register → desbloquea SellPage completo + PreSalesPage abonos con caja
2. Users + Roles → desbloquea AdminPage TabUsuarios/TabRoles
3. Product Categories → desbloquea filtro categorías en ProductsPage
4. Transfers → desbloquea TransfersPage
5. Reports → desbloquea ReportsPage + DashboardPage real

*Generado: 2026-04-15*
