# Tadaima POS — Backend Progress Log
> Última actualización: 2026-04-09 | Total endpoints: 110 + 1 público = **111**

---

## Stack técnico
- **Laravel 13.x** · PHP 8.3 · SQLite (dev) / MySQL (prod)
- **Auth:** Laravel Sanctum (`auth:sanctum` middleware en todas las rutas protegidas)
- **Base URL:** `/api/v1` (configurado en `bootstrap/app.php`)
- **Respuesta estándar:** `{ success, data, message?, error?, errors? }` via `Controller::success()` / `Controller::error()`
- **Recursos:** API Resources con `$this->when($this->relationLoaded(...))` para carga condicional
- **Transacciones:** `DB::transaction()` + `lockForUpdate()` en operaciones concurrentes de inventario
- **CORS:** `config/cors.php` → localhost:5173, localhost:3000

---

## Decisiones de arquitectura críticas

| Decisión | Detalle |
|---|---|
| `cost IS NULL` en productos | Producto bloqueado para venta |
| Inventario por bodega | Stock en `inventory(product_id, warehouse_id)` — no por tienda |
| FK circular stores↔users | Resuelta en migración `000038_add_deferred_foreign_keys.php` |
| user_id desde token | `$request->user()->id` — nunca desde el body |
| Roles sin Spatie | `model_has_roles` pivot manual con `DB::table()` |
| Transferencias | `type='transferencia'` con qty negativa en origen, positiva en destino |
| Manga `cost` | Auto-calculado: `cost = public_price * (1 - profit_margin_percent / 100)` |
| PreVenta inventario | Se reserva al crear (`type='preventa'`), se libera al cancelar |
| Catalog público | Sin auth en `GET /api/v1/public/catalog/{url}` |

---

## Sesiones implementadas

### ✅ Sesión 1–7 — Migraciones completas (DB 100%)
- 41 migraciones ejecutadas
- Tablas: companies, stores, warehouses, products, product_prices, product_store_prices, product_payment_methods, product_images, mangas, terminals, payment_methods, store_payment_methods, roles, permissions, model_has_roles, role_has_permissions, customers, customer_credit, cash_registers, cash_register_sessions, cash_movements, inventory, inventory_movements, transfers, transfer_items, sales_drafts, sales_draft_items, sales, sale_items, payments, pre_sales, pre_sale_items, pre_sale_payments, pre_sale_logs, catalog_settings, catalog_products, system_settings, system_logs + Laravel defaults

---

### ✅ Sesión 8 — Sales Drafts (Borradores de Venta)
**Archivos:** `SalesDraftController`, `SalesDraft`, `SalesDraftItem`, `SalesDraftResource`, `SalesDraftItemResource`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/sales-drafts` | Lista borradores activos |
| POST | `/sales-drafts` | Crea borrador |
| GET | `/sales-drafts/{id}` | Detalle |
| DELETE | `/sales-drafts/{id}` | Cancela borrador |
| POST | `/sales-drafts/{id}/items` | Agrega ítem |
| PUT | `/sales-drafts/{id}/items/{item}` | Actualiza ítem |
| DELETE | `/sales-drafts/{id}/items/{item}` | Elimina ítem |

---

### ✅ Sesión 8b — Sales / Checkout
**Archivos:** `SalesController`, `CheckoutService`, `Sale`, `SaleItem`, `Payment`, `SaleResource`, `SaleItemResource`, `PaymentResource`

**Lógica de checkout (`CheckoutService::checkout()`):**
1. Valida caja abierta para el usuario
2. Valida stock suficiente por bodega (vinculada a la tienda)
3. Calcula comisión del terminal
4. Aplica crédito del cliente si se solicita
5. `DB::transaction`: descuenta inventario → crea `Sale` + `SaleItem` + `Payment` + `InventoryMovement`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/sales` | Lista ventas (filtros: store_id, user_id, from, to, status) |
| POST | `/sales` | Checkout — crea venta completa |
| GET | `/sales/{id}` | Detalle con items y pagos |

---

### ✅ Sesión 9 — Auth (Laravel Sanctum)
**Archivos:** `AuthController`, `LoginRequest`, `UserResource`, `config/cors.php`

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| POST | `/auth/login` | Pública | Devuelve token + user |
| POST | `/auth/logout` | Bearer | Revoca token actual |
| GET | `/auth/me` | Bearer | Usuario autenticado con store |

**Refactor post-auth:** Eliminado `user_id` del body en 8 FormRequests y 5 Controllers.

---

### ✅ Sesión 10+11 — Users + Roles & Permissions + Cash Register
**Archivos:** `UserController`, `RoleController`, `CashRegisterController`, `CashRegisterService`, modelos `Role`, `Permission`, `CashRegister`, `CashRegisterSession`, `CashMovement`

**Users (7 endpoints):**

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/users` | Lista (filtros: store_id, company_id, active, search) |
| POST | `/users` | Crea usuario + rol opcional |
| GET | `/users/{id}` | Detalle |
| PUT | `/users/{id}` | Actualiza |
| DELETE | `/users/{id}` | Desactiva (no puede auto-desactivarse) |
| POST | `/users/{id}/roles` | Asigna rol |
| DELETE | `/users/{id}/roles/{roleId}` | Quita rol |

**Roles (4 endpoints):**

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/permissions` | Lista todos los permisos |
| GET | `/roles` | Lista roles con permisos |
| POST | `/roles` | Crea rol |
| PUT | `/roles/{id}` | Actualiza rol |
| POST | `/roles/{id}/permissions` | Sync de permisos (reemplaza total) |

**Cash Register (5 endpoints):**

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/cash/session` | Sesión activa del usuario |
| POST | `/cash/open` | Abre caja (valida que no haya sesión abierta) |
| POST | `/cash/close` | Cierra caja con `closing_cash` |
| POST | `/cash/movements` | Agrega movimiento (entrada/salida/ajuste) |
| GET | `/cash/movements` | Lista movimientos (filtra por `session_id`) |

---

### ✅ Sesión 12 — Transfers (Traslados de Inventario)
**Archivos:** `TransferController`, `TransferService`, `Transfer`, `TransferItem`, `TransferResource`, `TransferItemResource`, `StoreTransferRequest`

**Flujo:** Crear (pending) → Completar (mueve inventario) | Cancelar (sin tocar inventario)

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/transfers` | Lista (filtros: from/to_warehouse_id, status, from, to) |
| POST | `/transfers` | Crea traslado pending |
| GET | `/transfers/{id}` | Detalle |
| GET | `/transfers/{id}/items` | Solo ítems |
| PUT | `/transfers/{id}/complete` | Ejecuta traslado (valida stock, mueve inventario) |
| PUT | `/transfers/{id}/cancel` | Cancela (solo si pending) |

---

### ✅ Sesión 8c — Pre-Sales (Apartados)
**Archivos:** `PreSalesController`, `PreSaleService`, `PreSale`, `PreSaleItem`, `PreSalePayment`, `PreSaleLog`

**Estados:** `live` → `ready` → `completed` | `cancelled`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/pre-sales` | Lista (filtros: status, customer_id, from, to) |
| POST | `/pre-sales` | Crea apartado + reserva inventario inmediatamente |
| GET | `/pre-sales/{id}` | Detalle con items, pagos y logs |
| PUT | `/pre-sales/{id}` | Actualiza datos generales |
| PATCH | `/pre-sales/{id}/status` | Cambia estado (complete/cancel/change) |
| POST | `/pre-sales/{id}/payments` | Agrega pago parcial |
| GET | `/pre-sales/{id}/payments` | Lista pagos |

**Lógica crítica:**
- Al crear: reserva inventario (`type='preventa'`)
- Al completar: valida `paid >= total ±0.01`, crea Sale, acredita excedente
- Al cancelar: libera inventario, genera CustomerCredit por lo pagado

---

### ✅ Sesión 13 — Terminals + Payment Methods + Stores + Warehouses
**Archivos:** `TerminalController`, `PaymentMethodController`, `StoreController`, `WarehouseController` + 4 Resources + 8 FormRequests

| Método | Endpoint | Descripción |
|---|---|---|
| GET/POST | `/terminals` | Lista / Crea terminal |
| PUT/DELETE | `/terminals/{id}` | Actualiza / Elimina |
| GET/POST | `/payment-methods` | Lista / Crea método de pago |
| PUT | `/payment-methods/{id}` | Actualiza |
| GET/POST | `/stores` | Lista / Crea tienda |
| PUT | `/stores/{id}` | Actualiza |
| GET | `/stores/{id}/payment-methods` | Métodos de pago de la tienda |
| POST | `/stores/{id}/payment-methods` | Asigna método de pago (idempotente) |
| GET/POST | `/warehouses` | Lista / Crea bodega |
| PUT/DELETE | `/warehouses/{id}` | Actualiza / Elimina (bloquea si tiene stock) |

---

### ✅ Sesión 14 — Companies + Product Categories + Mangas
**Archivos:** `CompanyController`, `ProductCategoryController`, `MangaController`, `Manga` model + Resources + FormRequests

| Método | Endpoint | Descripción |
|---|---|---|
| GET/POST | `/companies` | Lista / Crea empresa |
| PUT | `/companies/{id}` | Actualiza |
| GET/POST | `/categories` | Lista (con products_count) / Crea categoría |
| PUT/DELETE | `/categories/{id}` | Actualiza / Elimina (bloquea si tiene productos) |
| GET/POST | `/mangas` | Lista paginada (filtros: search, genre, editorial) / Crea |
| PUT/DELETE | `/mangas/{id}` | Actualiza / Elimina |

**Manga:** `cost` se auto-calcula en el evento `saving`: `cost = public_price * (1 - margin/100)`

---

### ✅ Sesión 15 — Reports
**Archivos:** `ReportsController`

| Método | Endpoint | Filtros disponibles |
|---|---|---|
| GET | `/reports/sales` | from, to, store_id, user_id |
| GET | `/reports/inventory` | warehouse_id, store_id, low_stock, threshold |
| GET | `/reports/cash` | from, to, store_id, register_id |
| GET | `/reports/top-products` | from, to, store_id, limit |
| GET | `/reports/customers` | from, to, store_id, limit |

**Sales report devuelve:** totales, breakdown por método de pago, tendencia diaria, por tienda
**Cash report devuelve:** sesiones con entradas/salidas/ventas/diferencia de cierre
**Inventory report:** filtro `low_stock=true&threshold=N` para alertas de stock bajo

---

### ✅ Sesión 16 — Catalog Online
**Archivos:** `CatalogController`, `CatalogSetting`, `CatalogProduct`

| Método | Endpoint | Auth | Descripción |
|---|---|---|---|
| GET | `/catalog/settings/{store}` | Bearer | Obtiene (o crea) configuración |
| PUT | `/catalog/settings/{store}` | Bearer | Actualiza URL pública, show_price, show_stock |
| GET | `/catalog/products/{store}` | Bearer | Lista productos del catálogo (admin) |
| POST | `/catalog/products/{store}` | Bearer | Agrega producto (idempotente) |
| PUT | `/catalog/products/{store}/{product}` | Bearer | Toggle visibilidad |
| DELETE | `/catalog/products/{store}/{product}` | Bearer | Quita del catálogo |
| GET | `/public/catalog/{catalogUrl}` | **Pública** | Vista pública con precio/stock según config |

---

### ✅ Sesión 17 — System Settings + Logs
**Archivos:** `SystemSettingController`, `SystemLogController`, `SystemSetting`, `SystemLog`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/settings` | Todas las settings de la empresa como `{key: value}` |
| GET | `/settings/{key}` | Una setting por clave |
| PUT | `/settings/{key}` | Upsert individual |
| PUT | `/settings` | Batch upsert — body `{key: value, ...}` |
| GET | `/logs` | Lista paginada (filtros: user_id, action, from, to, search) |
| POST | `/logs` | Crea entrada de log (desde frontend o servicios) |

**`SystemLog::write(action, description, userId)`** — método estático para uso interno desde servicios.

---

### ✅ Sesión 18 — Products completo
**Archivos:** `ProductController` extendido, `ProductStorePrice`

Endpoints ya existentes (sesión anterior):
- `GET/POST/PUT /products` — CRUD básico con precios, payment method y stock total

Endpoints nuevos:

| Método | Endpoint | Descripción |
|---|---|---|
| DELETE | `/products/{id}` | Elimina (bloquea si tiene ventas) |
| POST | `/products/{id}/images` | Agrega imagen (`image_path`, `sort_order`) |
| DELETE | `/products/{id}/images/{image}` | Elimina imagen |
| PUT | `/products/{id}/images/reorder` | Reordena — body `{order: [{id, sort_order}]}` |
| GET | `/products/{id}/store-prices` | Precios por tienda agrupados |
| PUT | `/products/{id}/store-prices/{store}` | Upsert precios por tienda (null = eliminar nivel) |
| DELETE | `/products/{id}/store-prices/{store}` | Elimina overrides de una tienda |

---

## Inventario: módulo independiente

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/inventory` | Stock actual (filtros: warehouse_id, product_id, low_stock) |
| GET | `/inventory/movements` | Historial de movimientos |
| POST | `/inventory/movements` | Movimiento manual |
| PUT | `/inventory/{productId}/{warehouseId}` | Ajuste directo de cantidad |

---

## Customers

| Método | Endpoint | Descripción |
|---|---|---|
| GET/POST | `/customers` | Lista / Crea cliente |
| GET/PUT/DELETE | `/customers/{id}` | Detalle / Actualiza / Elimina |
| GET | `/customers/{id}/credit` | Saldo de crédito |
| POST | `/customers/{id}/credit` | Agrega crédito manual |

---

## Resumen de archivos por tipo

### Models (30)
`User`, `Company`, `Store`, `Warehouse`, `Product`, `ProductPrice`, `ProductStorePrice`, `ProductPaymentMethod`, `ProductImage`, `ProductCategory`, `Manga`, `Terminal`, `PaymentMethod`, `Customer`, `CustomerCredit`, `Role`, `Permission`, `CashRegister`, `CashRegisterSession`, `CashMovement`, `Inventory`, `InventoryMovement`, `Transfer`, `TransferItem`, `SalesDraft`, `SalesDraftItem`, `Sale`, `SaleItem`, `Payment`, `PreSale`, `PreSaleItem`, `PreSalePayment`, `PreSaleLog`, `CatalogSetting`, `CatalogProduct`, `SystemSetting`, `SystemLog`

### Controllers (20)
`AuthController`, `UserController`, `RoleController`, `CashRegisterController`, `TransferController`, `InventoryController`, `ProductController`, `CustomerController`, `SalesDraftController`, `SalesController`, `PreSalesController`, `TerminalController`, `PaymentMethodController`, `StoreController`, `WarehouseController`, `CompanyController`, `ProductCategoryController`, `MangaController`, `ReportsController`, `CatalogController`, `SystemSettingController`, `SystemLogController`

### Services (3)
`CheckoutService`, `PreSaleService`, `TransferService`, `CashRegisterService`

### API Resources (20+)
`UserResource`, `ProductResource`, `SaleResource`, `SaleItemResource`, `PaymentResource`, `SalesDraftResource`, `SalesDraftItemResource`, `PreSaleResource`, `PreSaleItemResource`, `PreSalePaymentResource`, `PreSaleLogResource`, `CustomerResource`, `CustomerCreditResource`, `TransferResource`, `TransferItemResource`, `CashRegisterSessionResource`, `CashMovementResource`, `InventoryResource`, `InventoryMovementResource`, `RoleResource`, `TerminalResource`, `PaymentMethodResource`, `StoreResource`, `WarehouseResource`, `CompanyResource`, `ProductCategoryResource`, `MangaResource`

---

## Conteo final de endpoints

| Módulo | GET | POST | PUT/PATCH | DELETE | Total |
|---|---|---|---|---|---|
| Auth | 1 | 2 | — | — | 3 |
| Users | 2 | 2 | 1 | 2 | 7 |
| Roles & Permissions | 2 | 2 | 1 | — | 5 |
| Cash Register | 2 | 3 | — | — | 5 |
| Transfers | 3 | 1 | 2 | — | 6 |
| Inventory | 2 | 1 | 1 | — | 4 |
| Products | 2 | 2 | 3 | 2 | 9 |
| Sales Drafts | 2 | 2 | 1 | 2 | 7 |
| Sales | 2 | 1 | — | — | 3 |
| Pre-Sales | 3 | 2 | 2 | — | 7 |
| Customers | 3 | 2 | 1 | 1 | 7 |
| Terminals | 1 | 1 | 1 | 1 | 4 |
| Payment Methods | 1 | 1 | 1 | — | 3 |
| Stores | 2 | 2 | 1 | — | 5 |
| Warehouses | 1 | 1 | 1 | 1 | 4 |
| Companies | 1 | 1 | 1 | — | 3 |
| Categories | 1 | 1 | 1 | 1 | 4 |
| Mangas | 1 | 1 | 1 | 1 | 4 |
| Reports | 5 | — | — | — | 5 |
| Catalog (admin) | 2 | 1 | 2 | 1 | 6 |
| Catalog (público) | 1 | — | — | — | 1 |
| System Settings | 2 | — | 2 | — | 4 |
| System Logs | 1 | 1 | — | — | 2 |
| **TOTAL** | **43** | **30** | **23** | **12** | **108** |

> Nota: la tabla excluye las rutas HEAD duplicadas de Laravel. Total real registrado por `php artisan route:list`: **110 rutas** (incluyendo las variantes PUT|PATCH contadas doble).

---

## Próximos pasos sugeridos

- [ ] **Tests** — Feature tests por módulo con PHPUnit
- [ ] **Seeders** — Datos de prueba completos para demo
- [ ] **Sales Returns** — `POST /sales/{id}/return` (devoluciones)
- [ ] **Frontend** — Vue 3 / React con Vite en `/frontend`
- [ ] **Deploy** — Docker + MySQL + nginx config
