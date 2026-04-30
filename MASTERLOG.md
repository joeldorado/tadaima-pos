# MASTERLOG — Tadaima POS

> Registro maestro del proyecto: arquitectura, evolución, decisiones clave y estado actual.
> Actualizado: 2026-04-29

---

## ESTADO ACTUAL DEL PROYECTO (resumen rápido para nuevas sesiones)

| Componente | Estado | Notas |
|-----------|--------|-------|
| Backend API (Laravel) | ✅ Funcional | Preventas nuevo esquema + permisos corregidos |
| Landing / Web (React) | ✅ Funcional | SellPage refactorizado, historial, ticket, venta mixta |
| App móvil (Expo) | ⏳ Pendiente | Estructura base existe en `apps/`, sin paridad de features |
| Deploy / Docker | ✅ Listo para submit | Docker configurado, solo falta ejecutar deploy |
| QA API preventas | ✅ Ejecutado 2026-04-23 | 5 bugs encontrados, todos corregidos |
| QA UI preventas | ⏳ Pendiente | Flujo desde navegador post-correcciones |

---

## BACKLOG PRIORIZADO — actualizado 2026-04-29

> Qué hay para trabajar, en orden de valor/impacto.

### 🔴 Alta prioridad (bloquea operación o experiencia cajero)

| # | Área | Feature / Fix | Detalle |
|---|------|--------------|---------|
| 1 | Caja | **Email folio preventa al cliente** | Cuando se crea un `PreSaleOrder` y el cliente tiene email, enviar correo con folio PREV-XXXXX + detalle anticipo. Entry point: `PreSaleOrdersController::store()` → `Mail::to()->send(FolioCreatedMailable)` |
| 2 | Caja | **Historial mixto persiste entre sesiones** | El agrupamiento preventa+venta en historial usa estado local (`mixedPairs`) + heurística 30s. Solución real: columna `linked_sale_id` nullable en `pre_sale_orders`. |
| 3 | Ventas | **SalesPage "Por Cobrar" usa API legacy** | El cálculo "Por Cobrar" llama `getPreSales` (sistema viejo). Migrar a `getPreSaleOrders` con `status=pending|ready` y sumar `balance`. |

### 🟡 Media prioridad (mejora flujo o datos)

| # | Área | Feature / Fix | Detalle |
|---|------|--------------|---------|
| 4 | Preventas | **PreSalesPage legacy → nuevo esquema** | La tab "Gestión" usa `/pre-sales` (esquema viejo). Migrar a vista de catálogos + folios del nuevo esquema o eliminar la tab si ya no se usa. |
| 5 | Caja | **Escaneo de folios por código QR/barras** | Botón "Escanear código" en SellPage no implementado. Requiere integración con cámara o lector USB HID. |
| 6 | Caja | **Tarjeta y Transferencia en venta regular** | Actualmente solo Efectivo y Dólares hacen checkout. Tarjeta/Transferencia muestra error toast. Habilitar cuando hay terminal configurada. |
| 7 | Reportes | **Reporte de preventas en ReportsPage** | No hay tab/sección para ver recaudación de preventas (anticipo vs saldo). Agregar junto a ventas regulares. |
| 8 | Admin | **Gestión de usuarios desde UI** | AdminPage/UsersPage permite ver usuarios pero no editar roles ni resetear contraseñas desde la interfaz. |

### 🟢 Baja prioridad (deuda técnica / cleanup)

| # | Área | Feature / Fix | Detalle |
|---|------|--------------|---------|
| 9 | Cleanup | **Eliminar tablas legacy `pre_sales`** | Una vez que PreSalesPage migre al nuevo esquema, crear migración `drop_legacy_pre_sales_tables`. |
| 10 | Cleanup | **Eliminar `preSales.ts` de packages/api** | Solo se usa en PreSalesPage. Al migrar esa página, remover el módulo y sus exports de `index.ts`. |
| 11 | App móvil | **Paridad de features Expo** | La app móvil en `apps/` no tiene flujo de caja, preventas ni ventas. Prioritario si hay usuarios en campo. |
| 12 | Tests | **E2E post-refactor** | Los TCs del Bloque 12 (TC-78→TC-85) no cubren el historial mixto ni el ticket de impresión. Agregar casos. |

---

## 1. Visión general del sistema

**Tadaima POS** es un sistema de punto de venta multi-sucursal diseñado para tiendas de electrónica y accesorios. El núcleo del negocio es el flujo de **preventas (pre-órdenes)**: los clientes reservan productos que aún no han llegado a la tienda, pagando un anticipo.

### Stack técnico

| Capa | Tecnología |
|------|-----------|
| Backend API | Laravel 11, PHP 8.3, MySQL (producción) / SQLite (tests) |
| Frontend web | React 18 + TypeScript + Vite + Tailwind CSS |
| App móvil | Expo (React Native) — en desarrollo |
| Paquetes compartidos | Monorepo con Turbo.js (`packages/api`, `packages/auth`, etc.) |
| Testing E2E | Playwright |
| Testing backend | PHPUnit con RefreshDatabase |

### Estructura del monorepo

```
Tadaima/
├── backend/          → Laravel 11 API (PHP 8.3)
├── landing/          → React 18 web app (lo que llamamos "la landing" / SellPage)
├── apps/             → Expo React Native mobile app (pendiente de desarrollo)
├── packages/
│   ├── api/          → Cliente HTTP compartido (preSaleCatalogs, preSaleOrders, etc.)
│   └── auth/         → Lógica de autenticación compartida
├── tests/e2e/        → Playwright E2E tests
└── docs/testcases/   → QA cases manuales
```

### Entornos

| Entorno | Frontend | API |
|---------|----------|-----|
| Desarrollo | http://localhost:5173 | http://localhost:8000/api/v1 |
| Tests E2E | http://localhost:5173 | http://localhost:8000/api/v1 |
| Producción | Docker (listo para deploy) | Docker (listo para deploy) |

---

## 2. Arquitectura del sistema

### Base de datos — tablas principales (64 migraciones)

```
Organización
  companies → stores ← users (circular dep resuelta con FK diferida)
                    ↓
               warehouses (no usados en seed actual)

Usuarios y acceso
  users → roles (Spatie: model_has_roles, role_has_permissions)
  Roles: admin | gerente | cajero

Catálogo de productos (inventario)
  product_categories → products → product_prices | product_store_prices
                               → product_images

Inventario
  inventory (product × warehouse × store)
  inventory_movements

Caja
  cash_registers → cash_register_sessions → cash_movements
  payment_methods ← store_payment_methods → stores

Ventas
  sales_drafts → sales_draft_items → sales
  sale_items | payments

PREVENTAS — Nuevo esquema (ADR-010)
  pre_sale_catalogs   ← admin define producto disponible para reserva
  pre_sale_orders     ← cajero crea folio cuando cliente reserva
  pre_sale_order_items
  pre_sale_order_payments
  pre_sale_order_logs

PREVENTAS — Esquema heredado (legacy, sin borrar aún)
  pre_sales | pre_sale_items | pre_sale_payments | pre_sale_logs

Apartados (Layaways)
  layaways | layaway_payments | layaway_logs

Soporte
  customers | customer_credit
  suppliers | mangas
  system_settings | system_logs
  notifications | point_transactions
```

### Backend — controladores activos

| Controller | Ruta base | Notas |
|-----------|-----------|-------|
| AuthController | `/auth` | login, logout, me |
| PreSaleCatalogsController | `/pre-sale-catalogs` | nuevo esquema |
| PreSaleOrdersController | `/pre-sale-orders` | nuevo esquema |
| PreSalesController | `/pre-sales` | legacy — aún activo (PreSalesPage lo usa) |
| SalesController | `/sales` | ventas finales |
| SalesDraftController | `/sales-drafts` | borrador de venta |
| CashRegisterController | `/cash` | sesiones de caja |
| LayawayController | `/layaways` | apartados |
| CustomerController | `/customers` | — |
| ProductController | `/products` | — |
| ReportsController | `/reports` | ventas, inventario, caja |
| StoreController | `/stores` | — |
| UserController | `/users` | — |
| RoleController | `/roles` | — |
| PaymentMethodController | `/payment-methods` | — |
| InventoryController | `/inventory` | — |
| SystemSettingController | `/settings` | — |

### Frontend — páginas

| Página | Ruta | Estado |
|--------|------|--------|
| SellPage | `/sell` | ✅ Refactorizado — nuevo esquema preventas |
| PreSalesPage | `/pre-sales` | ⚠️ Usa esquema legacy (pendiente migrar) |
| SalesPage | `/sales` | ⚠️ Usa `getPreSales` legacy para reporte |
| ReportsPage | `/reports` | ✅ Activo |
| ProductsPage | `/products` | ✅ Activo |
| ClientsPage | `/clients` | ✅ Activo |
| LayawaysPage | `/layaways` | ✅ Activo |
| DashboardPage | `/dashboard` | ✅ Activo |
| AdminPage | `/admin` | ✅ Activo |
| StoresPage | `/stores` | ✅ Activo |
| SettingsPage | `/settings` | ✅ Activo |
| LoginPage | `/login` | ✅ Activo |
| TransfersPage | `/transfers` | ✅ Activo |

---

## 3. Evolución del módulo de preventas

### Por qué cambiamos la arquitectura

El módulo original (`pre_sales`) mezclaba en una sola tabla:
- El catálogo del producto (nombre, imagen, precio)
- La reserva del cliente (customer_id, anticipo, folio)

Esto creaba problemas:
1. Un mismo producto disponible para varias personas requería duplicar filas del catálogo
2. No había control real de cuántas unidades se podían reservar (`preorder_limit`)
3. Los precios se congelaban en creación pero el catálogo no era una entidad independiente
4. La vista de cajero mezclaba "qué está disponible para reservar" con "qué ya está reservado"

### La solución — dos tablas separadas (ADR-010)

```
pre_sale_catalogs
  Admin crea UN registro por producto disponible
  Tiene precio, anticipo mínimo, límite de reservas, fecha llegada
  Status: draft → published → closed | cancelled

pre_sale_orders (Folios PREV-XXXXX)
  Cajero crea UN registro por cliente que reserva
  Referencia al catálogo, tiene customer_id, anticipo pagado, saldo
  Status: pending → ready → delivered | cancelled | expired
```

### Flujo del nuevo esquema

```
Admin
  1. Crea pre_sale_catalog (draft)
  2. Publica → visible en modal de caja
  3. Cuando llega mercancía → PATCH status: "ready" en los folios

Cajero
  1. Abre modal "Preventas" en SellPage
  2. Ve CatalogCards (tab "Disponibles")
  3. Selecciona catálogo → agrega al carrito de preventa
  4. En checkout → createPreSaleOrder (folio + anticipo opcional en una sola llamada)
  5. Al liquidar → addPreSaleOrderPayment + updateStatus "delivered"
```

### Migraciones del nuevo esquema

| Migración | Descripción |
|----------|-------------|
| `2026_04_22_200001` | `create_pre_sale_catalogs_table` |
| `2026_04_22_200002` | `create_pre_sale_orders_table` |
| `2026_04_22_200003` | `create_pre_sale_order_items_table` |
| `2026_04_22_200004` | `create_pre_sale_order_payments_table` |
| `2026_04_22_200005` | `create_pre_sale_order_logs_table` |
| `2026_04_22_200006` | `migrate_pre_sales_to_catalogs` (data migration) |

---

## 4. Estado actual del seed (ambiente limpio)

Ejecutar: `php artisan migrate:fresh --seed`

### Datos sembrados

| Entidad | Valor |
|---------|-------|
| Empresa | Tadaima |
| Tienda 1 | Cel Centro Paseo Rodríguez |
| Tienda 2 | Macroplaza |
| Admin | admin@tadaima.mx / password |
| Gerente Centro | gerente.centro@tadaima.mx / password |
| Cajero Centro | cajero.centro@tadaima.mx / password |
| Gerente Macroplaza | gerente.macroplaza@tadaima.mx / password |
| Cajero Macroplaza | cajero.macroplaza@tadaima.mx / password |
| Cajas | 1 por tienda |
| Métodos de pago | Efectivo, Tarjeta Débito, Tarjeta Crédito, Transferencia (en ambas) |
| Catálogo 1 | iPhone 16 Pro Max 256GB — Negro Titanio ($28,999 · anticipo $5,800 · límite 5) |
| Catálogo 2 | Samsung Galaxy S25 Ultra 512GB — Titanio Gris ($24,999 · anticipo $5,000 · límite 3) |
| Catálogo 3 | AirPods Pro 2da Generación — USB-C ($6,499 · anticipo $1,300 · límite 10) |

**No hay**: productos de inventario, almacenes, clientes, ventas, preventas antiguas.

---

## 5. API Package — funciones exportadas por módulo

### Nuevo esquema (usar estas)

```typescript
// packages/api/src/preSaleCatalogs.ts
getPreSaleCatalogs(params?)          → PreSaleCatalogListResponse
getPreSaleCatalog(id)                → PreSaleCatalog
createPreSaleCatalog(input)          → PreSaleCatalog
updatePreSaleCatalogStatus(id, input)→ PreSaleCatalog

// packages/api/src/preSaleOrders.ts
getPreSaleOrders(params?)            → PreSaleOrderListResponse
getPreSaleOrder(id)                  → PreSaleOrder
createPreSaleOrder(input)            → PreSaleOrder     ← folio + anticipo en una sola llamada
addPreSaleOrderPayment(id, input)    → PreSaleOrderPayment
updatePreSaleOrderStatus(id, input)  → PreSaleOrder
markPreSaleOrderItemDelivered(orderId, itemId, status) → PreSaleOrderItem
```

### Esquema legacy (no usar en código nuevo)

```typescript
// packages/api/src/preSales.ts — solo usado aún por PreSalesPage.tsx y SalesPage.tsx
getPreSales | getPreSale | createPreSale | updatePreSale | deletePreSale
addPreSalePayment | getPreSalePayments | updatePreSaleStatus
assignPreSaleInventory | createProductFromPreSale
uploadPreSaleImage | expirePreSaleToInventory | markPreSaleItemDelivered
```

---

## 6. Tests — estado actual

### Tests E2E (Playwright) — `tests/e2e/tadaima.spec.ts` (1,866 líneas)

| Bloque | TCs | Cobertura |
|--------|-----|-----------|
| Login / Setup UI | TC-01, TC-02 | Auth, empresa |
| Bloque 1 — Setup API | TC-03 a TC-08 | Sucursales, bodegas, categorías, métodos de pago |
| Bloque 2 — Usuarios y Roles | TC-09, TC-10, TC-12 | Cajero, gerente, rol supervisor |
| Bloque 3 — Productos e Inventario | TC-13 a TC-16 | Crear producto, stock, precios por tienda |
| Bloque 4 — Caja y Ventas | TC-18 a TC-21 | Selector tienda, sesión caja, venta API |
| Bloque 5 — Pre-ventas (legacy) | TC-23 a TC-26 | Cliente, preventa, abono, completar |
| Bloque 6-11 | TC-27 a TC-77 | Layaways, transfers, reports, UI flows |
| Bloque 12 — Preventas Nuevo Esquema | TC-78 a TC-85 | Catálogos, folios, límites, toggle ítem |

### Tests backend (PHPUnit)

| Archivo | Tests | Assertions |
|---------|-------|-----------|
| `PreSaleCatalogsTest.php` | 7 | ~30 |
| `PreSaleOrdersTest.php` | 10 | ~35 |
| Total | 17 | ~65 |

### Test cases QA manuales/documentados

| ID | Archivo | Prioridad |
|----|---------|-----------|
| QA-01 | `docs/testcases/QA-01-flujo-completo-preventa.md` | P0 |
| QA-02 | `docs/testcases/QA-02-ciclo-caja-preventa.md` | P0 |
| QA-03 | `docs/testcases/QA-03-limites-validaciones-reportes.md` | P1 |

---

## 7. Decisiones de arquitectura (ADRs)

### ADR-001 — Monorepo con Turbo.js
Permite compartir `packages/api` y `packages/auth` entre web y mobile sin duplicar código. Turbo cachea builds para CI rápido.

### ADR-010 — Separación pre_sale_catalogs / pre_sale_orders
Ver sección 3. Razón principal: control de preorder_limit y separación de concerns admin vs cajero.

### ADR-011 — createPreSaleOrder atomíco
El endpoint `POST /pre-sale-orders` crea el folio Y registra el anticipo inicial en una sola transacción DB. Evita estados huérfanos (folio sin pago) y simplifica el checkout del cajero.

### ADR-012 — Folio con customer_id obligatorio
`customer_id` es requerido en `pre_sale_orders` por diseño. No existe folio sin cliente (política de negocio: toda reserva debe tener dueño identificado).

### ADR-013 — Precios congelados en folio
`unit_price` se copia del catálogo al crear el folio. Cambios posteriores en el catálogo no afectan folios existentes (inmutabilidad de transacciones financieras).

---

## 8. Deuda técnica conocida

| Ítem | Prioridad | Descripción |
|------|-----------|-------------|
| PreSalesPage legacy | Alta | Aún usa esquema viejo (`/pre-sales`). Necesita migrar a catalogs+orders. |
| SalesPage legacy | Media | Usa `getPreSales` para cálculo "Por Cobrar". Actualizar a `getPreSaleOrders`. |
| preSales.ts en packages/api | Media | Sigue exportado en index.ts. Cuando PreSalesPage migre, eliminar. |
| Tablas legacy pre_sales | Baja | Una vez migrado PreSalesPage, crear migración `drop_pre_sales_tables`. |
| App móvil | Alta | Expo app no tiene paridad de features con web. |
| Escaneo de folios en caja | Media | Botón "Escanear código" en SellPage aún no implementado. |

---

## 9. Comandos frecuentes

```bash
# Backend
cd backend
php artisan migrate:fresh --seed    # Limpiar y resembrar DB
php artisan serve                    # API en puerto 8000
php artisan test                     # PHPUnit
php artisan test --filter PreSaleOrders  # Test específico

# Frontend (desde raíz del monorepo)
npm run dev:web                      # SellPage en puerto 5173
npm run build:web                    # Build de producción

# Tests E2E
npx playwright test                  # Todos los tests
npx playwright test --grep "Bloque 12"  # Solo preventas nuevo esquema
npx playwright test --ui             # Modo visual interactivo
```

---

## 10. Deploy e infraestructura

| Aspecto | Estado |
|---------|--------|
| Docker | ✅ Configurado y listo para submit/deploy |
| Backend deploy | Simple — imagen Laravel + variables de entorno |
| Frontend deploy | Build estático de React (Vite) servido desde Docker o CDN |
| Base de datos producción | MySQL (SQLite solo para tests) |

**Flujo de deploy:**
```bash
# Seed de producción (solo si DB limpia)
php artisan migrate --force
php artisan db:seed --force

# Build frontend
npm run build:web

# Docker submit
docker compose up --build -d
```

**Pendiente antes de producción (checklist):**
- [ ] Correr QA UI completo desde navegador (post-corrección de bugs)
- [ ] Variables de entorno de producción configuradas (`.env.production`)
- [ ] App móvil (Expo) con paridad de features mínima

---

## 11. Historial de sesiones de desarrollo

### Sesión 2026-04-29 (tarde)

**Objetivo**: Reportes mejorados (corte por día), bug de terminales en caja, checkboxes de pago en productos, QA SQL de reportes.

**Trabajo realizado**:

| Área | Fix / Feature | Archivos |
|------|--------------|---------|
| Bug CRÍTICO | Terminales nunca se cargaban en caja — `getTerminals()` no se llamaba; `terminals` estado siempre vacío | `SellPage.tsx` |
| Bug | Campo `activeTerminal.commission` → `.commission_percent` (nombre incorrecto vs API) | `SellPage.tsx` |
| Bug | `selectedTerminalId?: string` → `number` — el `find()` nunca matcheaba por mismatch de tipo | `SellPage.tsx` |
| Feature | Checkboxes "Acepta efectivo" / "Acepta tarjeta" en formulario de producto (tab Precios) | `ProductsPage.tsx` |
| Feature | Validación: al menos un método de pago requerido (toast + return) | `ProductsPage.tsx` |
| Feature | Backend ya tenía `allow_cash`/`allow_card` — solo faltaba exponer en frontend | `ProductsPage.tsx`, `types.ts` |
| Feature | Advertencia inline en carrito cuando método de pago activo ≠ lo que acepta el producto | `SellPage.tsx` |
| Feature | Corte por día expandible en ReportsPage con desglose por método de pago + lista de tickets | `ReportsPage.tsx` |
| Feature | KPIs: Ganancia bruta prominente + Ingresos + Anticipos + Transacciones + Descuentos + Comisiones | `ReportsPage.tsx` |
| QA | Script SQL `verify_report.sql` — valida coherencia de reportes contra datos crudos | `backend/scripts/verify_report.sql` |

**Resultado QA SQL** (ejecutado contra DB real):
- 3 ventas completadas · $144,995 ingresos
- 4/4 checks PASS: coherencia día-total, pagos por método, ventas sin pago huérfanas, items vs subtotales
- 5 folios de preventa (sistema nuevo) · $50,299

**Pendientes que salieron de esta sesión**:
- Email folio PREV-XXXXX al cliente cuando se crea PreSaleOrder (entry point: `PreSaleOrdersController::store()`)
- SalesPage "Por Cobrar" todavía usa `getPreSales` (API legacy)

---

### Sesión 2026-04-23

**Objetivo**: QA completo del módulo de preventas + corrección de bugs.

**Trabajo realizado**:

| Hora aprox | Actividad |
|-----------|-----------|
| 00:00 | Evaluación fase 8 (cleanup legacy) — bloqueado por PreSalesPage/SalesPage que aún usan API vieja |
| 00:10 | Reescritura completa de `DatabaseSeeder.php` — seed limpio: 2 tiendas, 5 usuarios, 3 catálogos publicados, 0 inventario/productos |
| 00:30 | Fix bug SQLite en seeder: batch insert con columnas distintas → cambiado a `foreach` + insert individual |
| 01:00 | Generación de `MASTERLOG.md` en raíz del proyecto |
| 01:15 | Generación de 3 test cases QA en `docs/testcases/` (QA-01, QA-02, QA-03) |
| 01:30 | Ejecución QA-02 (ciclo de caja) contra API live → 9/11 PASS, 2 notas de diseño |
| 02:00 | Ejecución QA-01 (flujo completo preventa) → 13/14 PASS, 1 falso positivo corregido |
| 02:30 | Ejecución QA-03 (límites, validaciones, permisos) → 10/16 PASS, 4 bugs encontrados |
| 03:00 | Generación de `docs/testcases/QA-REPORT-2026-04-23.md` con todos los hallazgos |
| 03:30 | Corrección de los 5 bugs encontrados en QA |

**Bugs encontrados y corregidos**:

| # | Severidad | Módulo | Síntoma | Fix aplicado |
|---|-----------|--------|---------|-------------|
| #1 | P1 MEDIA | `StoreCustomerRequest` | Teléfono duplicado aceptado (201) | `unique:customers,phone` en rules() |
| #2 | P2 NEGOCIO | `PreSaleOrderService::cancel()` | `reserved_count` no bajaba al cancelar | Filtrar solo pedidos `pending\|ready` con `activeOrderItems()` |
| #3 | P0 ALTA | `PreSaleOrderService::createOrder()` | Anticipo > precio total aceptado | Calcular `$totalPrice` y lanzar DomainException si `advance > total` |
| #4 | P0 ALTA | `PreSaleCatalogsController` | Cajero podía crear/modificar catálogos | Check `hasRole('admin')\|\|hasRole('gerente')` en `store()` y `updateStatus()` |
| #5 | P1 MEDIA | `PreSaleOrdersController::index()` | Cajero veía folios de otras sucursales | Forzar `store_id = $user->store_id` cuando rol es `cajero` |

**Archivos modificados (sesión 2026-04-23)**:

- `backend/database/seeders/DatabaseSeeder.php` — reescrito completo
- `backend/app/Models/PreSaleCatalog.php` — agregado `activeOrderItems()` relation + uso en `getReservedCountAttribute()`
- `backend/app/Services/PreSaleOrderService.php` — validación `advance ≤ total`, uso de `activeOrderItems` en limit check
- `backend/app/Http/Controllers/Api/PreSaleCatalogsController.php` — role check en `store()` y `updateStatus()`
- `backend/app/Http/Controllers/Api/PreSaleOrdersController.php` — cajero scoped a su `store_id`
- `backend/app/Http/Requests/StoreCustomerRequest.php` — `unique:customers,phone`
- `MASTERLOG.md` — creado y actualizado
- `docs/testcases/QA-01-flujo-completo-preventa.md` — creado
- `docs/testcases/QA-02-ciclo-caja-preventa.md` — creado
- `docs/testcases/QA-03-limites-validaciones-reportes.md` — creado
- `docs/testcases/QA-REPORT-2026-04-23.md` — creado

---

### Sesión 2026-04-22

**Objetivo**: Refactorizar el sistema de preventas completo.

**Trabajo realizado**:
1. **Análisis arquitectónico** — identificada necesidad de separar catálogos de folios
2. **Diseño de BD** (planner + architect agents) — schema de 5 nuevas tablas
3. **Migraciones** — 5 migraciones nuevas + 1 migración de datos
4. **Backend Phase 1** — Modelos, Resources, FormRequests, PreSaleOrderService
5. **Backend Phase 2** — Controllers (PreSaleCatalogsController, PreSaleOrdersController), rutas en api.php
6. **Frontend Phase 3** — PreSaleCatalogsPanel.tsx (nuevo componente admin)
7. **Package API Phase 4** — preSaleCatalogs.ts, preSaleOrders.ts, types.ts actualizados
8. **Frontend Phase 5** — ProductCatalogModal.tsx refactorizado con CatalogCard / OrderCard
9. **Frontend Phase 6** — SellPage.tsx completamente refactorizado al nuevo esquema
10. **Tests Phase 7** — 17 tests backend (PHPUnit) + 8 tests E2E (TC-78 a TC-85, Bloque 12)
11. **Seed Phase 8** — DatabaseSeeder.php reescrito: 2 tiendas, 5 usuarios, 3 catálogos publicados

**Bugs corregidos**:
- Migration SQLite upsert bug (`seed_points_multiplier_setting.php`) — guard para SQLite
- UserFactory `email_verified_at` inexistente — usar `User::create()` directo en tests
- TypeScript `exactOptionalPropertyTypes` — conditional spread en `createPreSaleOrder` call

**Archivos modificados** (sesión completa):
- `backend/database/migrations/` — 6 nuevas migraciones
- `backend/app/Models/` — 5 nuevos modelos (PreSaleCatalog, PreSaleOrder, ...)
- `backend/app/Http/Resources/` — 4 nuevos resources
- `backend/app/Http/Controllers/Api/` — 2 nuevos controllers + deliverItem en PreSaleOrdersController
- `backend/app/Services/PreSaleOrderService.php` — nuevo service
- `backend/app/Http/Requests/` — 3 nuevos form requests
- `backend/routes/api.php` — 2 nuevos grupos de rutas
- `backend/database/seeders/DatabaseSeeder.php` — reescrito completo
- `backend/tests/Feature/PreSaleCatalogsTest.php` — nuevo
- `backend/tests/Feature/PreSaleOrdersTest.php` — nuevo
- `packages/api/src/types.ts` — tipos del nuevo esquema
- `packages/api/src/preSaleCatalogs.ts` — nuevo módulo
- `packages/api/src/preSaleOrders.ts` — nuevo módulo
- `packages/api/src/index.ts` — exports nuevos módulos
- `landing/src/pages/SellPage.tsx` — refactor completo
- `landing/src/components/ProductCatalogModal.tsx` — CatalogCard + OrderCard
- `tests/e2e/tadaima.spec.ts` — Bloque 12 (TC-78 a TC-85)
- `docs/flujos-preventas.md` — documentación actualizada

---

## SESIÓN 2026-04-27 — Historial Caja, Ticket de impresión, Venta mixta y Bugs críticos

### Contexto
Continuación de sesiones anteriores. El sistema de preventas por catálogo ya funciona en backend y frontend. Esta sesión agregó el historial de ventas del día en Caja, el flujo de impresión de tickets con preferencia, soporte de venta mixta (preventa + productos regulares en el mismo carrito), y corrigió varios bugs críticos de runtime y base de datos.

---

### 1. SalesPage (`/sales`) — rediseño y filtros

- Filtro de fechas rediseñado: presets chips (Hoy / 7 días / Este mes) + inputs de rango, con CSS vars del tema (ya no hardcoded rgba blanco).
- Selector de tienda role-based: admin ve todas las tiendas con "Todas las tiendas", cajero ve solo badge de su sucursal.
- Dropdown de método de pago usa `var(--td-panel-bg)` / `var(--td-panel-border)` — visible en light mode.
- Botón **"Ticket"** de reimpresión en cada fila expandida de la tabla — llama `printTicket(sale)` que abre ventana 72mm.
- `SalesController::index()` — ahora eager-carga `items.product` (antes solo `customer` + `payments`) → fix "Sin detalle de artículos" en historial expandido.

---

### 2. SellPage — Historial del Día modal

- Botón **Historial** en toolbar de Caja (ícono `History`).
- `fetchHistorial()` llama en paralelo `getSales` + `getPreSaleOrders` filtrados por fecha de hoy y `store_id`.
- Lista unificada `HistorialEntry` (discriminated union `{ type: 'sale' | 'presale'; data }`) ordenada por hora desc.
- Ventas regulares → borde rojo, expandible con items + pagos + totales.
- Preventas → borde ámbar, badge "Preventa", expandible con artículos del catálogo + anticipo/saldo/estado.
- Cada fila tiene botón reimpresión de ticket (ícono `Printer`).
- Botón "Actualizar historial" al pie que refetch sin importar el cache.
- Cache se invalida (`setHistorialEntries([])`) al completar cualquier venta o preventa → al reabrirse el modal se refetch automático.

---

### 3. SellPage — Ticket de impresión con preferencia

- `doPrintTicket(sale: CompletedSaleData)` abre ventana 72mm con HTML inline, llama `win.print()` tras 300ms. El navegador siempre muestra el diálogo de impresión (limitación web — sin impresión silenciosa).
- Preferencia guardada en `localStorage['tadaima_print_pref']`: `'auto'` | `'ask'` (default) | `'never'`.
- `triggerPrintFlow(sale)`: si `auto` → imprime directo, si `never` → no hace nada, si `ask` → muestra modal.
- Modal "¿Imprimir ticket?": resumen de venta + checkbox "No preguntar de nuevo". Al imprimir con checkbox → guarda `auto`; al omitir con checkbox → guarda `never`. Link "Restablecer preferencia" elimina la clave.

---

### 4. SellPage — Venta mixta (preventa catálogo + productos regulares en mismo carrito)

**Problema:** `StorePreSaleOrderRequest` valida `items.*.catalog_id` como requerido. Al mezclar un artículo de catálogo con un producto regular en el carrito, el regular (sin `sellingCatalogId`) enviaba `undefined` y el backend retornaba `422 Los datos enviados no son válidos`.

**Fix:** En el branch `isPreventa` de `handleCheckout`:
- `catalogItems = items.filter(i => i.sellingCatalogId != null)` → van a `createPreSaleOrder`
- `regularItems = items.filter(i => i.sellingCatalogId == null && !i.isFromPreSale)` → van a `createSale` con draft normal

**Ticket mixto:**
- `CompletedSaleData` extendido con `preSaleCode?`, `preSaleItems?`, `preSaleAnticipo?`.
- `doPrintTicket` renderiza sección "★ PREVENTA · Folio PREV-XXXXX" cuando `preSaleCode` está presente, seguida de sección "PRODUCTOS" si hay regulares, y grand total combinado al pie.
- Cuando es solo preventa o solo venta regular, el ticket muestra solo esa sección normalmente.

---

### 5. Pendiente — Email con folio de preventa al cliente

Cuando el cliente tiene email registrado, enviarle automáticamente el folio PREV-XXXXX con detalle del anticipo pagado. **No implementado aún.** Cuando se implemente, agregar en `PreSaleOrdersController::store()` un `Mail::to($customer->email)->send(new FolioCreatedMailable($order))` o equivalente con queue.

---

### Bugs corregidos

| # | Módulo | Síntoma | Causa | Fix |
|---|--------|---------|-------|-----|
| #1 | `SalesController::index()` | "Sin detalle de artículos" al expandir historial | `Sale::with([...])` no incluía `items.product` | Añadido `items.product` al eager load |
| #2 | `SellPage` runtime | `ChevronRight is not defined` al expandir historial | Import faltante en SellPage (solo estaba en SalesPage) | Añadido `ChevronRight` a imports de lucide-react |
| #3 | `SellPage` runtime | `setHistorialSales is not defined` al completar venta regular | Nombre de estado refactorizado a `historialEntries` pero llamada no actualizada | `setHistorialSales([])` → `setHistorialEntries([])` en línea 1465 |
| #4 | SQLite FK | `no such table: main.pre_sale_catalogs_old` al crear preventa | SQLite auto-actualiza FKs en otras tablas al renombrar; migración `000001` renombró la tabla y luego la borró dejando `pre_sale_order_items` con FK rota | Migración correctiva `2026_04_27_000001_fix_pre_sale_order_items_fk` recrea la tabla con `REFERENCES pre_sale_catalogs(id)` correcto, preservando datos |

---

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `landing/src/pages/SalesPage.tsx` | Rediseño filtros, store picker role-based, CSS vars, reimpresión ticket |
| `landing/src/pages/SellPage.tsx` | Historial modal, ticket print flow, venta mixta, fix setHistorialEntries |
| `backend/app/Http/Controllers/Api/SalesController.php` | `items.product` en eager load de `index()` |
| `backend/database/migrations/2026_04_27_000001_fix_pre_sale_order_items_fk.php` | **NUEVO** — fix FK rota a pre_sale_catalogs_old |

### Estado al cierre de sesión

| Feature | Estado |
|---------|--------|
| Historial del día en Caja (ventas + preventas unificadas) | ✅ |
| Ticket de impresión con preferencia auto/ask/never | ✅ |
| Venta mixta preventa catálogo + producto regular | ✅ |
| Ticket mixto con ambas secciones + grand total | ✅ |
| Folio PREV-XXXXX en ticket de preventa | ✅ |
| FK SQLite rota corregida (migration 2026-04-27) | ✅ |
| Email con folio al cliente | ⏳ Pendiente |

---

## SESIÓN 2026-04-24b — UX Catálogos: ciclo completo, historial, imágenes, header Preventas, TanStack Table

### Contexto
Continuación de la misma jornada del 2026-04-24. Se pulió el flujo completo del módulo de catálogos de preventa desde el estado borrador hasta el cierre del ciclo, además de mejoras en Productos y navegación de Preventas.

---

### 1. Folios — colores de items y estado "Liquidado" real

- Items pendientes: texto/ícono cambiado de blanco a ámbar `#fbbf24` (antes era invisible en dark mode).
- Badge por item por catálogo: entregado = azul CheckCircle2, expirado = rojo AlertCircle + fecha, pendiente = ámbar Clock.
- Estado **Liquidado** del folio solo se asigna cuando TODOS los items de TODOS los catálogos están entregados. Antes se marcaba al pagar aunque hubiera items pendientes.
- `PreSaleOrderService::liquidate()` reescrito: marca items llegados como entregados → cuenta pendientes → solo cambia order.status a `delivered` si count = 0, si no registra "Entrega parcial" y mantiene `ready`.
- `PreSaleOrdersController::deliverItem()` auto-cierra el folio cuando el último item se marca delivered.

---

### 2. Modales de confirmación en acciones de catálogo

- Botones Publicar / Llegó / Cerrar / Cancelar / Completar ciclo ahora muestran un modal de confirmación con título, descripción descriptiva del impacto, y checkbox **"No mostrar de nuevo"** (persiste en `localStorage` con key `td_confirm_skip_${action_key}`).
- `CompletedBlockModal`: si el catálogo tiene `sold_count === delivered_count > 0` y el admin intenta cancelar, se muestra este modal explicando que debe usar "Completar ciclo" en su lugar.

---

### 3. Lock del límite de unidades al editar catálogo

- `preorder_limit` deshabilitado en el modal de edición cuando `catalog.status` es `arrived | closed | cancelled`.
- Label muestra 🔒, opacity 0.45, cursor not-allowed y tooltip. Previene errores humanos de cambiar el límite después de que el producto ya llegó.

---

### 4. Status `completed` — cierre del ciclo de preventa

**Backend:**
- `PreSaleCatalog::STATUS_COMPLETED = 'completed'` añadido al modelo.
- `UpdatePreSaleCatalogStatusRequest` actualizado con `completed` en la validación.
- `PreSaleCatalogsController::updateStatus()` acepta transición `arrived → completed`.
- Migración `2026_04_24_000002_add_completed_status_to_pre_sale_catalogs.php` — solo MySQL (ALTER ENUM).
- Migración `2026_04_25_000001_fix_completed_status_sqlite.php` — SQLite: usa `PRAGMA writable_schema = ON` + `UPDATE sqlite_master` para parchear el CHECK constraint. Solución a `SQLSTATE[23000]: Integrity constraint violation: 19 CHECK constraint failed`.

**Frontend:**
- `packages/api/src/types.ts` — `PreSaleCatalogStatus` incluye `'completed'`.
- `STATUS_CFG['completed']`: badge morado `#A78BFA`, ícono Star.
- `NEXT_STATUSES['arrived']` incluye `{ to: "completed", label: "Completar ciclo", onlyWhenComplete: true }` — solo aparece cuando `sold_count === delivered_count > 0`.
- Catálogos completados: se ocultan de Caja y Difusión (filtro por status).
- Vista admin: catálogos completados muestran SOLO botón "Ver historial", sin Editar ni acciones de transición.

---

### 5. CatalogHistoryModal — historial de ventas

- **NUEVO** `landing/src/components/presales/CatalogHistoryModal.tsx`.
- Fetch de `getPreSaleOrders({ catalog_id, per_page: 200 })`.
- Stats en header: total folios, entregados, unidades totales, total recaudado.
- Tabla: Folio | Cliente + teléfono | Cant. | Total | Pagado | Saldo (o "Liquidado") | Estado badge | Fecha.
- Accesible desde:
  - Botón **"Ver historial"** en catálogos `completed`.
  - Botón **"Ventas"** en catálogos activos con `sold_count > 0`.

---

### 6. ProductsPage — imágenes y layout sin imagen

- Bug corregido: `apiProductToProducto` siempre asignaba `imagen: ''` — nunca leía `p.images[]`.
- Fix: `imagen: p.images[0]?.image_path ? storageUrl(p.images[0].image_path) : ''`.
- Vista tabla: si no hay imagen, no se renderiza el `<img>` (sin placeholder vacío).
- Vista tarjeta: si hay imagen → layout original con `aspect-square`; si no hay imagen → tarjeta compacta (nombre, SKU, stock, precio, categoría) sin espacio desperdiciado.

---

### 7. PreSalesPage — header y reordenamiento de tabs

- Header añadido: "Preventas **Tadaima**" + badge de rol (Admin / Vendedor activo según `isAdmin`) + subtítulo "Gestión de catálogos y folios de preventa".
- Tabs reordenados: **Catálogos** (admin-only) → **Folios** → **Difusión**.
- Tab "Llegados" comentado (`// { id: "llegados" ... }`) — no se ocupa por ahora.
- Effect y render block de "Llegados" también comentados.
- Tipo de `adminTab` actualizado para excluir `"llegados"`.

---

### 8. PreSaleCatalogsPanel — migración a TanStack Table

- Motor cambiado de tabla HTML manual a **`@tanstack/react-table` v8** (ya instalado en el proyecto).
- Sorting por columna con click en header: Producto, Categoría, P1/Anticipo, Límite (vendidos), Status. Ícono `⇅ ↑ ↓` indica estado de orden.
- Paginación manejada internamente por TanStack (eliminados `useState(page)`, `totalPages`, `safePage`, `paginated` manual).
- Columna Acciones: `enableSorting: false`.
- Estilo visual 100% idéntico al original: glass, colores, tipografía, botones de acción, badges.
- `columnDef.meta.tdStyle` usado para aplicar `padding`, `textAlign` por columna sin duplicar JSX.

---

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `landing/src/components/presales/PreSaleOrdersPanel.tsx` | Colores items, badge por catálogo, estado Liquidado real |
| `landing/src/components/presales/PreSaleCatalogsPanel.tsx` | Modales confirmación, lock límite, status completed, TanStack Table |
| `landing/src/components/presales/CatalogHistoryModal.tsx` | **NUEVO** — modal historial de ventas |
| `landing/src/components/presales/NewPreSaleCatalogModal.tsx` | Lock de preorder_limit para arrived/closed/cancelled |
| `landing/src/pages/PreSalesPage.tsx` | Header, tabs reordenados, Llegados comentado |
| `landing/src/pages/ProductsPage.tsx` | Fix imágenes con storageUrl, layout sin imagen compacto |
| `landing/src/pages/SellPage.tsx` | Filtro catalogs completed en vista Caja |
| `packages/api/src/types.ts` | PreSaleCatalogStatus incluye 'completed' |
| `backend/app/Models/PreSaleCatalog.php` | STATUS_COMPLETED const |
| `backend/app/Http/Requests/UpdatePreSaleCatalogStatusRequest.php` | 'completed' en validación |
| `backend/app/Http/Controllers/Api/PreSaleCatalogsController.php` | Transición arrived→completed, lock preorder_limit |
| `backend/app/Http/Controllers/Api/PreSaleOrdersController.php` | Auto-cierre folio al entregar último item |
| `backend/app/Services/PreSaleOrderService.php` | liquidate() reescrito con entrega parcial |
| `backend/database/migrations/2026_04_24_000002_*` | MySQL ALTER ENUM → completed |
| `backend/database/migrations/2026_04_25_000001_*` | SQLite PRAGMA writable_schema fix |

### Estado al cierre de sesión

| Feature | Estado |
|---------|--------|
| Ciclo completo: draft→published→arrived→completed | ✅ |
| Modales de confirmación con "no mostrar de nuevo" | ✅ |
| Lock de límite post-arrived | ✅ |
| SQLite CHECK constraint corregido | ✅ |
| Historial de ventas por catálogo | ✅ |
| Botón Ventas en catálogos activos con ventas | ✅ |
| ProductsPage imágenes cargando | ✅ |
| Header Preventas con rol badge | ✅ |
| Tabs: Catálogos → Folios → Difusión | ✅ |
| TanStack Table con sorting en Catálogos | ✅ (pendiente verificar visual) |

---

## SESIÓN 2026-04-24 — UX Preventa: Toaster, Cliente Nuevo, Folios y Bug crítico hasRole

### Contexto
Continuación directa de la sesión 2026-04-23. El sistema de preventa por catálogo ya funciona en backend. Esta sesión se enfocó en pulir el flujo completo de cajero/admin en frontend y corregir un bug crítico de backend que impedía listar folios.

---

### 1. Toaster sonner no aparecía (pantalla en blanco)

**Problema:** `<Toaster>` nunca estaba montado en la app — todos los `toast()` eran silenciosos. Además, el wrapper `components/ui/sonner.tsx` usaba `useTheme` de `next-themes` (no instalado), causando crash al montarlo.

**Fix:**
- `landing/src/App.tsx` — import directo desde `'sonner'` (no el wrapper), montado con `toastOptions` de estilo slate azul oscuro.

---

### 2. Validaciones de checkout en Preventa (dos toasts simultáneos)

**Problema:** Al dar "Apartar" sin cliente ni efectivo, solo se veía el flash del input pero no el toast (por bug #1 arriba).

**Fix en `landing/src/pages/SellPage.tsx`:**
- Reestructura de validaciones: ahora acumula `blocked = true` sin early-return inmediato.
- Toast ámbar "Falta cliente para la preventa" + flash/focus en input de cliente.
- Toast rojo "Ingresa el anticipo recibido" si Efectivo/Dólares y `cashReceived < totalDeposit`.
- Ambos toasts se muestran simultáneamente si faltan los dos.
- Import `Banknote` de lucide-react añadido.

---

### 3. Anticipo como label (no editable)

**Problema:** El input de anticipo en el carrito permitía borrar el valor.

**Fix:** Reemplazado completamente por un label estático con badge verde (liquidado) o ámbar (anticipo parcial). Función `setItemDeposit` eliminada.

---

### 4. Formulario "Cliente Nuevo" con botón Agregar

**Problema:** El formulario de nuevo cliente solo tenía nombre + teléfono + leyenda estática "se registrará al confirmar el apartado". El cliente no se registraba hasta hacer el apartado, lo que generaba confusion.

**Fix en `landing/src/pages/SellPage.tsx`:**
- Nuevo campo `customerEmail?: string` en tipo Mesa.
- Campo email (opcional) en el formulario.
- Botón **Agregar** que llama `createCustomer()` al instante, selecciona el cliente creado y muestra toast verde.
- Estado `isRegisteringCustomer` con spinner en el botón.
- Leyenda estática eliminada.
- `createCustomer` importado de `@tadaima/api`.

---

### 5. Tab "Folios" en PreSalesPage

**Problema:** Los apartados de catálogo (`pre_sale_orders`) no aparecían en ningún tab — estaban en un sistema nuevo separado del tab "Gestión" (que usa el sistema viejo de `/pre-sales`).

**Fix:**
- `landing/src/components/presales/PreSaleOrdersPanel.tsx` — nuevo componente creado.
  - Tabla paginada de `PreSaleOrder` con filtros por status, tienda, búsqueda por folio.
  - Muestra: folio, cliente, productos, total, anticipo, saldo pendiente, estado con badge de color, tienda, fecha.
  - Admins ven todos; cajeros ven solo su tienda (backend filtra por rol).
- `landing/src/pages/PreSalesPage.tsx`:
  - Nuevo tab "Folios" visible para todos (Catálogos y Operaciones siguen siendo admin-only).
  - Default tab cambiado a "folios" (antes era "gestion").
  - Badge rojo en tab Folios con count de `pending + ready`.
  - `getPreSaleOrders` importado para calcular el count del badge.

---

### 6. Bug crítico: `hasRole()` no existe en User model → GET /pre-sale-orders retornaba 500

**Causa raíz:** El User model en Tadaima no usa Spatie `HasRoles`. Tiene `getRolesAttribute(): array` propio pero no el método `hasRole()`. El `PreSaleOrdersController::index()` llamaba `$user->hasRole('cajero')` → `BadMethodCallException` → HTTP 500 para TODOS los usuarios.

**Consecuencia:** El tab Folios siempre mostraba "Sin folios" porque el API retornaba 500 (capturado silenciosamente por el catch del panel).

**Fix en `backend/app/Models/User.php`:**
```php
public function hasRole(string|array $roles): bool
{
    $roles = (array) $roles;
    return count(array_intersect($this->roles, $roles)) > 0;
}
```
Verificado con `curl` real: endpoint devuelve los 2 folios correctamente post-fix.

**Otros controllers afectados (mismo patrón, misma solución):** `PreSaleCatalogsController` (store, update, updateStatus) también usaba `hasRole()` pero esas acciones son solo para admin — si el admin lo llamaba el check también explotaba, pero como el admin no era cajero el error solo impactaba en listado.

---

### Archivos modificados en esta sesión

| Archivo | Cambio |
|---------|--------|
| `landing/src/App.tsx` | Toaster sonner montado con estilo custom |
| `landing/src/pages/SellPage.tsx` | Validaciones checkout, label anticipo, formulario cliente nuevo con Agregar, import Banknote + createCustomer |
| `landing/src/pages/PreSalesPage.tsx` | Tab Folios, default folios, badge count, import getPreSaleOrders |
| `landing/src/components/presales/PreSaleOrdersPanel.tsx` | **NUEVO** — tabla paginada de PreSaleOrders |
| `packages/api/src/cash.ts` | `register.store_id` añadido al tipo CashSession |
| `backend/app/Models/User.php` | Método `hasRole()` añadido — fix bug crítico |

### Estado al cierre de sesión

| Feature | Estado |
|---------|--------|
| Toasts visibles en toda la app | ✅ |
| Checkout preventa con validaciones dobles | ✅ |
| Anticipo como label no editable | ✅ |
| Cliente nuevo con registro inmediato | ✅ |
| Tab Folios con lista de apartados | ✅ |
| GET /pre-sale-orders funcional | ✅ Fix aplicado |
| Folios del Samsung Galaxy visibles en UI | ✅ Verificado con curl |
