# Implementation Plan: Backend Laravel — POS Multi-Sucursal

> **Rol aplicado:** planner.md — Expert planning specialist
> **Fuentes:** `system-final-architecture.md` v1.0 + `database-final.md`
> **Fecha:** 2026-04-09
> **Directorio de trabajo:** `backend/`

---

## Overview

Implementar el backend completo del sistema POS Multi-Sucursal en Laravel 13 con MySQL. El backend expone ~80 endpoints REST bajo `/api/v1`, autenticados con Sanctum + Spatie Permissions. Incluye 40 tablas, 18 módulos y reglas de negocio críticas (bloqueo de venta sin costo, control de stock, ciclo de preventas).

El plan está dividido en **8 fases independientemente deployables**, de menor a mayor complejidad, comenzando por fundación y terminando con reportes y catálogo online.

---

## Assumptions & Constraints

- Laravel 13 ya instalado en `backend/` con SQLite por defecto
- MySQL 8+ disponible localmente para desarrollo
- Estructura: **Controller → Service → Model** (no Repository por ahora)
- Form Requests para toda validación de entrada
- API Resources para toda respuesta JSON
- Sanctum para auth de token (no sesiones)
- Spatie Laravel Permission para roles y permisos
- Sin tests en fases 1-6; testing strategy en Fase 8
- Un módulo = un directorio en `app/Modules/{Module}/`

---

## Architecture Changes

| Área | Descripción |
|------|-------------|
| `config/database.php` | Cambiar default a MySQL |
| `config/cors.php` | Permitir origen del frontend (`localhost:5173`) |
| `routes/api.php` | Todos los endpoints bajo `/api/v1` |
| `app/Modules/` | Directorio nuevo — organización modular por dominio |
| `app/Http/Middleware/` | Middlewares de negocio: `CheckCost`, `ScopeToStore`, `CheckCashSession` |
| `database/migrations/` | 40 migrations en orden de dependencia |
| `database/seeders/` | Seeders para: roles, permissions, payment_methods, admin user |

---

## Implementation Steps

---

### FASE 1 — Fundación y Configuración
**Objetivo:** Backend listo para recibir requests del frontend antes de escribir una sola tabla.
**Entregable verificable:** `GET /api/v1/ping` responde `200` con CORS habilitado.

---

**1.1 — Cambiar DB a MySQL**
- File: `backend/.env`
- Action:
  ```
  DB_CONNECTION=mysql
  DB_HOST=127.0.0.1
  DB_PORT=3306
  DB_DATABASE=pos_tadaima
  DB_USERNAME=root
  DB_PASSWORD=
  ```
- Why: SQLite no soporta las constraints relacionales requeridas (FKs, enums en producción).
- Dependencies: MySQL 8+ corriendo localmente.
- Risk: **Bajo**

---

**1.2 — Instalar paquetes base**
- File: `backend/composer.json`
- Action: `composer require laravel/sanctum spatie/laravel-permission`
- Why: Sanctum = auth por token. Spatie = roles y permisos granulares.
- Dependencies: Paso 1.1 (MySQL activo)
- Risk: **Bajo**

---

**1.3 — Publicar y configurar Sanctum**
- Files: `config/sanctum.php`, `bootstrap/app.php`
- Action:
  ```bash
  php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
  ```
  En `bootstrap/app.php`, agregar middleware `EnsureFrontendRequestsAreStateful` en grupo `api`.
- Why: Habilita tokens de API sin cookies (SPA no necesita sesión).
- Dependencies: Paso 1.2
- Risk: **Bajo**

---

**1.4 — Publicar y configurar Spatie Permission**
- Files: `config/permission.php`
- Action:
  ```bash
  php artisan vendor:publish --provider="Spatie\Permission\PermissionServiceProvider"
  ```
  Agregar trait `HasRoles` al modelo `User`.
- Why: Habilita `$user->hasRole('admin')` y `$user->can('view-costs')`.
- Dependencies: Paso 1.2
- Risk: **Bajo**

---

**1.5 — Configurar CORS**
- File: `config/cors.php`
- Action:
  ```php
  'paths' => ['api/*', 'sanctum/csrf-cookie'],
  'allowed_origins' => ['http://localhost:5173', 'http://localhost:19006'],
  'allowed_methods' => ['*'],
  'allowed_headers' => ['*'],
  'supports_credentials' => false,
  ```
- Why: Frontend React (`localhost:5173`) y Expo web (`localhost:19006`) necesitan CORS permisivo en dev.
- Dependencies: Ninguna
- Risk: **Bajo**

---

**1.6 — Crear ruta de health check y versionar API**
- File: `routes/api.php`
- Action:
  ```php
  Route::prefix('v1')->group(function () {
      Route::get('/ping', fn() => response()->json(['status' => 'ok', 'version' => '1.0']));
  });
  ```
- Why: Verificar que el servidor responde antes de continuar. Sirve también para CI.
- Dependencies: Pasos 1.3-1.5
- Risk: **Bajo**

---

### FASE 2 — Migrations (40 tablas)
**Objetivo:** Schema MySQL completo en orden de dependencia.
**Entregable verificable:** `php artisan migrate` corre sin errores. Todas las tablas visibles en DB.

> **Orden obligatorio** (respetar dependencias FK):

| # | Migration | Tabla | Depende de |
|---|-----------|-------|------------|
| 1 | `create_companies_table` | companies | — |
| 2 | `create_roles_table` | roles (Spatie) | — |
| 3 | `create_permissions_table` | permissions (Spatie) | — |
| 4 | `create_model_has_roles_table` | model_has_roles | roles |
| 5 | `create_model_has_permissions_table` | model_has_permissions | permissions |
| 6 | `create_stores_table` | stores | companies |
| 7 | `create_users_table` | users | companies, stores |
| 8 | `create_warehouses_table` | warehouses | companies, stores |
| 9 | `create_product_categories_table` | product_categories | — |
| 10 | `create_products_table` | products | product_categories |
| 11 | `create_product_prices_table` | product_prices | products |
| 12 | `create_product_store_prices_table` | product_store_prices | products, stores |
| 13 | `create_product_payment_methods_table` | product_payment_methods | products |
| 14 | `create_product_images_table` | product_images | products |
| 15 | `create_mangas_table` | mangas | — |
| 16 | `create_payment_methods_table` | payment_methods | — |
| 17 | `create_store_payment_methods_table` | store_payment_methods | stores, payment_methods |
| 18 | `create_terminals_table` | terminals | stores |
| 19 | `create_cash_registers_table` | cash_registers | stores |
| 20 | `create_customers_table` | customers | — |
| 21 | `create_customer_credit_table` | customer_credit | customers |
| 22 | `create_inventory_table` | inventory | products, warehouses |
| 23 | `create_inventory_movements_table` | inventory_movements | products, warehouses, users |
| 24 | `create_transfers_table` | transfers | warehouses, users |
| 25 | `create_transfer_items_table` | transfer_items | transfers, products |
| 26 | `create_cash_register_sessions_table` | cash_register_sessions | cash_registers, users |
| 27 | `create_cash_movements_table` | cash_movements | cash_register_sessions |
| 28 | `create_sales_drafts_table` | sales_drafts | stores, cash_register_sessions, users |
| 29 | `create_sales_draft_items_table` | sales_draft_items | sales_drafts, products, mangas |
| 30 | `create_sales_table` | sales | stores, cash_register_sessions, users, customers, terminals, sales_drafts |
| 31 | `create_sale_items_table` | sale_items | sales, products, mangas |
| 32 | `create_payments_table` | payments | sales, payment_methods, terminals |
| 33 | `create_pre_sales_table` | pre_sales | stores, users, customers |
| 34 | `create_pre_sale_items_table` | pre_sale_items | pre_sales, products, mangas |
| 35 | `create_pre_sale_payments_table` | pre_sale_payments | pre_sales, payment_methods |
| 36 | `create_pre_sale_logs_table` | pre_sale_logs | pre_sales, users |
| 37 | `create_catalog_settings_table` | catalog_settings | stores |
| 38 | `create_catalog_products_table` | catalog_products | products, stores |
| 39 | `create_system_settings_table` | system_settings | companies |
| 40 | `create_system_logs_table` | system_logs | users |

**Notas de implementación por migrations críticas:**

- `products`: campo `cost decimal(10,2) NULL` — NULL significa no disponible para venta.
- `inventory_movements`: `type enum('entrada','venta','ajuste','transferencia','devolucion','preventa','preventa_cancelada')`.
- `pre_sales`: `status enum('live','ready','expired','completed','cancelled')`.
- `sales_drafts`: `status enum('open','suspended','completed','cancelled')`.
- `payments`: agregar comentario SQL: `-- XOR constraint: sale_id OR pre_sale_id must be present`.
- `users`: eliminar la migration default de Laravel y reemplazar con la nueva.
- Spatie genera sus propias migrations — publicarlas antes de correr la migración 2.

- Action para Spatie:
  ```bash
  php artisan vendor:publish --provider="Spatie\Permission\PermissionServiceProvider" --tag="permission-migrations"
  ```
  Luego renombrar los timestamps para que queden en posiciones 2-5 del orden.

- Risk: **Medio** — el orden de FK es crítico. Cualquier inversión falla la migración.

---

### FASE 3 — Modelos Eloquent
**Objetivo:** Todos los modelos con relaciones, casts, fillable y softDeletes.
**Entregable verificable:** `php artisan tinker` → `User::with('company', 'store')->first()` retorna datos.

**Estructura de directorios:**
```
app/
  Models/
    Company.php
    Store.php
    User.php
    Warehouse.php
    ProductCategory.php
    Product.php
    ProductPrice.php
    ProductStorePrice.php
    ProductPaymentMethod.php
    ProductImage.php
    Manga.php
    PaymentMethod.php
    StorePaymentMethod.php
    Terminal.php
    CashRegister.php
    Customer.php
    CustomerCredit.php
    Inventory.php
    InventoryMovement.php
    Transfer.php
    TransferItem.php
    CashRegisterSession.php
    CashMovement.php
    SalesDraft.php
    SalesDraftItem.php
    Sale.php
    SaleItem.php
    Payment.php
    PreSale.php
    PreSaleItem.php
    PreSalePayment.php
    PreSaleLog.php
    CatalogSetting.php
    CatalogProduct.php
    SystemSetting.php
    SystemLog.php
```

**Modelos críticos a detallar:**

- `Product`: `$casts = ['cost' => 'decimal:2', 'active' => 'boolean']`. Scope: `scopeAvailableForSale($q) => $q->whereNotNull('cost')->where('active', true)`.
- `Manga`: Accessor para calcular `cost` si se desea: `public function getCalculatedCostAttribute()`.
- `PreSale`: `$casts = ['status' => PreSaleStatus::class]` (usar PHP Enum si Laravel 13 lo soporta nativamente).
- `SalesDraft`: Mismo patrón de enum para status.
- `User`: `use HasApiTokens, HasRoles, SoftDeletes`. El trait `HasRoles` provee `$user->hasRole()` y `$user->can()`.

- Risk: **Bajo** — repetitivo pero sin lógica compleja en esta fase.

---

### FASE 4 — Seeders Base
**Objetivo:** Datos iniciales para poder usar el sistema desde el primer login.
**Entregable verificable:** `php artisan db:seed` → login con admin@tadaima.com funciona.

**Seeders a crear:**

| Seeder | Datos |
|--------|-------|
| `RolesPermissionsSeeder` | Roles: `admin`, `gerente`, `cajero`. Permisos: `view-costs`, `manage-products`, `manage-users`, `manage-stores`, `manage-warehouses`, `view-reports`, `open-cash`, `manage-transfers`, `manage-pre-sales`, `manage-catalog`. Asignaciones role→permissions. |
| `PaymentMethodsSeeder` | `efectivo`, `tarjeta`, `transferencia` (activos) |
| `AdminUserSeeder` | Company demo + User admin con rol `admin`, email `admin@tadaima.com`, password configurable desde `.env` |
| `DatabaseSeeder` | Orquesta el orden: Roles → PaymentMethods → AdminUser |

- File: `database/seeders/`
- Dependencies: Fase 2 (tablas existentes) + Fase 3 (modelos)
- Risk: **Bajo**

---

### FASE 5 — Autenticación
**Objetivo:** Login, logout y perfil funcionando con token Sanctum.
**Entregable verificable:** `POST /api/v1/auth/login` retorna token. `GET /api/v1/auth/me` retorna user+role+permisos.

**Archivos a crear:**

```
app/Modules/Auth/
  Controllers/
    AuthController.php
  Requests/
    LoginRequest.php
  Resources/
    AuthUserResource.php
  Services/
    AuthService.php
```

**Endpoints:**

| Método | Endpoint | Auth |
|--------|----------|------|
| POST | `/api/v1/auth/login` | Público |
| POST | `/api/v1/auth/logout` | Bearer |
| GET | `/api/v1/auth/me` | Bearer |

**`LoginRequest`:** validar `email` (required, email) y `password` (required, string, min:8).

**`AuthService::login()`:**
1. `Auth::attempt(['email', 'password'])` → 401 si falla
2. Crear token Sanctum: `$user->createToken('pos-token')->plainTextToken`
3. Retornar token + user + roles + permissions + store

**`AuthUserResource`:** incluye `can_view_cost`. Si `false`, omitir campo `cost` de cualquier producto retornado.

**Middleware global:** Registrar `auth:sanctum` como middleware por defecto en todas las rutas `api/v1` excepto `/auth/login` y `/catalog/{storeId}`.

- Risk: **Bajo-Medio** — crítico hacerlo bien para no bloquear fases siguientes.

---

### FASE 6 — Módulos de Negocio (en orden de dependencia)
**Objetivo:** Los 18 módulos CRUD + lógica de negocio completos.
**Entregable verificable por módulo:** endpoint de listado retorna datos del seeder.

**Estructura base por módulo:**
```
app/Modules/{Module}/
  Controllers/
    {Module}Controller.php
  Requests/
    Store{Module}Request.php
    Update{Module}Request.php
  Resources/
    {Module}Resource.php
    {Module}Collection.php
  Services/
    {Module}Service.php
```

---

#### 6.1 — Companies
- Endpoints: `GET /companies`, `POST /companies`, `PUT /companies/{id}`
- Solo accesible por rol `admin`
- Sin lógica compleja
- Risk: **Bajo**

---

#### 6.2 — Stores
- Endpoints: `GET /stores`, `POST /stores`, `PUT /stores/{id}`, `GET /stores/{id}/payment-methods`, `POST /stores/{id}/payment-methods`
- Scope automático: `gerente` solo ve su tienda. `admin` ve todas.
- Middleware `ScopeToStore`: inyectar `store_id` del usuario autenticado en queries si rol ≠ `admin`.
- Risk: **Bajo**

---

#### 6.3 — Warehouses
- Endpoints: `GET /warehouses`, `POST /warehouses`, `PUT /warehouses/{id}`, `DELETE /warehouses/{id}`
- Validación: si `type = 'store'`, `store_id` requerido. Si `type = 'central'`, `store_id` debe ser null.
- Risk: **Bajo**

---

#### 6.4 — Users
- Endpoints: `GET /users`, `POST /users`, `GET /users/{id}`, `PUT /users/{id}`, `DELETE /users/{id}`
- `POST /users`: generar password random → retornar en response (única vez).
- `DELETE /users/{id}`: soft delete + revocar tokens Sanctum.
- Solo `admin` puede crear usuarios.
- `gerente` solo puede ver usuarios de su tienda.
- Risk: **Bajo**

---

#### 6.5 — Roles & Permissions
- Endpoints: `GET /roles`, `GET /permissions`, `POST /roles/{id}/permissions`
- Solo lectura excepto asignación de permisos a roles.
- Solo accesible por `admin`.
- Risk: **Bajo**

---

#### 6.6 — Product Categories
- Endpoints: CRUD básico `/product-categories`
- Sin lógica especial
- Risk: **Bajo**

---

#### 6.7 — Products (módulo crítico)
- Endpoints: `GET /products`, `GET /products/search`, `GET /products/{id}`, `POST /products`, `PUT /products/{id}`, `DELETE /products/{id}`, + imágenes y precios
- **`GET /products/search`** (optimizado para POS):
  - Solo retorna: `id, name, barcode, stock (sumado de warehouses), prices`
  - Filtros: `?q=` (barcode o nombre), `?warehouse_id=`
  - Excluye productos con `cost IS NULL` o `active = false`
- **Middleware `CheckCost`:** en cualquier endpoint que agregue producto a draft o venta, verificar `product.cost IS NOT NULL`. Si null → 422 con mensaje: `"Este producto no está disponible para venta. Consulta con el administrador."`
- **`can_view_cost`:** `ProductResource` verifica `auth()->user()->can_view_cost`. Si false → omitir campo `cost` en response.
- **Precios:** al crear/actualizar producto, `ProductService` hace upsert en `product_prices` en la misma transacción.
- **Imágenes:** upload a Google Cloud Storage (config en `.env`). Guardar path en `product_images`.
- Risk: **Alto** — lógica de `CheckCost` y scoping de precios son críticos.

---

#### 6.8 — Mangas
- Endpoints: CRUD `/mangas`
- `MangaService::store()` / `update()`: calcular y persistir `cost = public_price * (1 - profit_margin_percent / 100)`.
- `can_view_cost` aplica igual que en productos.
- Risk: **Bajo-Medio**

---

#### 6.9 — Customers
- Endpoints: CRUD `/customers` + `GET /customers/{id}/credit`, `POST /customers/{id}/credit`
- `CustomerCredit`: cada registro es una entrada de crédito. El balance se calcula con `SUM(amount)` — positivo = a favor, negativo = debitado.
- `CustomerResource`: incluir `credit_balance` calculado.
- Risk: **Bajo**

---

#### 6.10 — Terminals & Payment Methods
- Endpoints: CRUD para ambos
- Sin lógica compleja
- `TerminalResource`: incluir `commission_percent` formateado.
- Risk: **Bajo**

---

#### 6.11 — Inventory
- Endpoints: `GET /inventory`, `PUT /inventory/{productId}/{warehouseId}`, `POST /inventory/movements`, `GET /inventory/movements`
- `InventoryService::applyMovement()`: método central que:
  1. Inserta en `inventory_movements`
  2. Actualiza cantidad en `inventory` (upsert)
  3. Envuelve en DB transaction
- Tipos de movimiento: validar contra enum `['entrada','venta','ajuste','transferencia','devolucion','preventa','preventa_cancelada']`
- Endpoint `PUT /inventory/{productId}/{warehouseId}`: solo `admin`. Ajuste directo (genera movimiento tipo `ajuste`).
- Risk: **Alto** — es el corazón del control de stock. Errores aquí corrompen inventario.

---

#### 6.12 — Transfers
- Endpoints: `GET /transfers`, `POST /transfers`, `GET /transfers/{id}`, `GET /transfers/{id}/items`, `PUT /transfers/{id}/complete`, `PUT /transfers/{id}/cancel`
- `TransferService::complete()`:
  1. Verificar stock suficiente en `from_warehouse`
  2. DB transaction:
     - Insertar movimiento `transferencia` en `from_warehouse` (negativo)
     - Insertar movimiento `entrada` en `to_warehouse` (positivo)
     - Actualizar `transfers.status = 'completed'`
- `TransferService::cancel()`: solo si `status = 'pending'`. Sin movimientos de inventario.
- Risk: **Medio**

---

#### 6.13 — Cash Register
- Endpoints: `GET /cash/session`, `POST /cash/open`, `POST /cash/close`, `POST /cash/movements`, `GET /cash/movements`
- `CashService::open()`:
  1. Verificar que el usuario no tiene sesión abierta
  2. Verificar que la caja no tiene sesión abierta
  3. INSERT en `cash_register_sessions`
- `CashService::close()`: UPDATE `closed_at`, `closing_cash`, `status = 'closed'`
- **Middleware `CheckCashSession`:** para endpoints de ventas y pre-ventas, verificar que el usuario tiene sesión de caja activa (`status = 'open'`). Si no → 403.
- Risk: **Medio**

---

#### 6.14 — Sales Drafts (POS Core)
**Este módulo es el más crítico del sistema.**

- Endpoints: `POST /sales-drafts`, `GET /sales-drafts`, `GET /sales-drafts/{id}`, `POST /sales-drafts/{id}/items`, `PUT /sales-drafts/{id}/items/{itemId}`, `DELETE /sales-drafts/{id}/items/{itemId}`, `PUT /sales-drafts/{id}/suspend`, `PUT /sales-drafts/{id}/resume`, `PUT /sales-drafts/{id}/cancel`, `POST /sales-drafts/{id}/checkout`

- Límite: máximo 5 drafts `open` por usuario simultáneamente. Validar en `POST /sales-drafts`.

- **`SalesDraftService::addItem()`:**
  1. Verificar `product.cost IS NOT NULL` (middleware `CheckCost`)
  2. Verificar stock disponible ≥ cantidad solicitada
  3. INSERT en `sales_draft_items`

- **`SalesDraftService::checkout()`** (operación atómica — DB transaction completa):
  1. Validar que el draft tiene ítems
  2. Para cada ítem: verificar stock disponible
  3. INSERT `sales`
  4. INSERT `sale_items` (por cada draft_item)
  5. INSERT `payments` (por cada método de pago recibido en request)
  6. Para cada ítem: llamar `InventoryService::applyMovement(type='venta', quantity=-X)`
  7. UPDATE `sales_drafts.status = 'completed'`
  8. Si hay terminal: calcular `commission_amount = total * (commission_percent / 100)`
  9. Retornar `SaleResource` completo

- Risk: **Alto** — transacción multi-tabla. Rollback crítico si cualquier paso falla.

---

#### 6.15 — Sales
- Endpoints: `GET /sales`, `GET /sales/{id}`, `POST /sales/{id}/return`
- `GET /sales`: filtros por `?from=`, `?to=`, `?store_id=`, `?customer_id=`, `?user_id=`
- `SaleResource`: incluir `items`, `payments`, `customer`, `terminal`, `user`
- `POST /sales/{id}/return`: crear `InventoryMovement(type='devolucion')`. UPDATE `sales.status = 'returned'`. Solo `admin` o `gerente`.
- Risk: **Bajo** (checkout ya maneja la creación)

---

#### 6.16 — Pre-Sales (módulo complejo)
- Endpoints: 10 endpoints (ver arquitectura)

- **Estados y transiciones válidas:**
  ```
  live → ready (PUT /pre-sales/{id}/ready)
  live → cancelled (PUT /pre-sales/{id}/cancel)
  ready → completed (POST /pre-sales/{id}/complete)
  ready → cancelled (PUT /pre-sales/{id}/cancel)
  expired → [solo admin puede reactivar, fuera de scope v1]
  ```

- **`PreSaleService::create()`:**
  1. Generar código único (`code`): formato `PS-{YYYYMMDD}-{random4}`
  2. INSERT `pre_sales` (status: `live`)
  3. INSERT `pre_sale_items`
  4. INSERT `pre_sale_logs(action='created')`

- **`PreSaleService::addPayment()`:**
  1. INSERT `pre_sale_payments`
  2. Actualizar `pre_sales.advance_payment` (suma)
  3. INSERT `pre_sale_logs(action='payment_added')`

- **`PreSaleService::markReady()`:**
  1. Verificar `status = 'live'`
  2. Verificar stock suficiente en warehouse asignada
  3. UPDATE `status = 'ready'`
  4. `InventoryService::applyMovement(type='preventa', quantity=-reserved_quantity)` — reservar stock
  5. INSERT `pre_sale_logs(action='marked_ready')`

- **`PreSaleService::complete()`** (conversión a venta — DB transaction):
  1. Verificar `status = 'ready'`
  2. Calcular `remaining = total - advance_payment`
  3. Crear `Sale` con los ítems de la pre-venta
  4. INSERT `payments` por el saldo restante
  5. `InventoryService::applyMovement(type='venta', ...)` — stock ya reservado con 'preventa', ahora se convierte
  6. UPDATE `pre_sales.status = 'completed'`
  7. INSERT `pre_sale_logs(action='completed')`

- **`PreSaleService::cancel()`:**
  1. Si `status = 'ready'`: revertir movimiento de inventario con `InventoryMovement(type='preventa_cancelada')`
  2. Si `advance_payment > 0`: crear `CustomerCredit(amount=advance_payment, reason='preventa_cancelada')`
  3. UPDATE `pre_sales.status = 'cancelled'`
  4. INSERT `pre_sale_logs(action='cancelled')`

- Risk: **Alto** — lógica de estados + inventario + crédito. Cada transición tiene efectos secundarios.

---

#### 6.17 — Reports
- Endpoints: 8 endpoints de reportes (ver arquitectura)
- `ReportService::dailySales()`: agrupar ventas por hora, método de pago, usuario. JOIN con `sale_items`, `products`.
- `ReportService::inventory()`: stock actual por producto/warehouse. Opcionalmente guardar snapshot en `reports_inventory`.
- `ReportService::commissions()`: agrupar `payments` por `terminal_id`. Calcular `SUM(commission_amount)`.
- `ReportService::cash()`: balance de caja. SUM de `cash_movements` por sesión.
- Permisos: todos los reportes requieren rol `admin` o `gerente`. Costos ocultos si `can_view_cost = false`.
- Risk: **Medio** — queries complejos con JOINs y agrupaciones.

---

#### 6.18 — Catalog Online
- Endpoints: `GET /catalog/{storeId}` (público), `GET /catalog/settings`, `PUT /catalog/settings/{storeId}`, `GET /catalog/{storeId}/products`, `PUT /catalog/{storeId}/products/{productId}`
- `GET /catalog/{storeId}`: **sin autenticación**. Retornar solo productos con `catalog_products.visible = true` para la tienda. Si `show_price = false` en settings → omitir precios. Si `show_stock = false` → omitir stock.
- Aplicar caché Laravel (`Cache::remember`) con TTL de 5 minutos para este endpoint público.
- Risk: **Bajo**

---

#### 6.19 — System Settings & Logs
- Endpoints: 4 endpoints
- `SystemSettings`: upsert por `(company_id, key)`.
- `SystemLogs`: solo INSERT y GET. No UPDATE ni DELETE.
- Risk: **Bajo**

---

### FASE 7 — Middlewares de Negocio

**7.1 — `CheckCost` Middleware**
- File: `app/Http/Middleware/CheckCost.php`
- Activar en: `POST /sales-drafts/{id}/items`, `POST /sales-drafts/{id}/checkout`
- Logic: Leer `product_id` del request body. `Product::findOrFail($id)`. Si `cost IS NULL` → abort(422, mensaje).
- Risk: **Bajo**

---

**7.2 — `ScopeToStore` Middleware**
- File: `app/Http/Middleware/ScopeToStore.php`
- Activar en: todos los endpoints de recursos que tengan `store_id`
- Logic: Si `auth()->user()->hasRole('gerente')` → inyectar `store_id` del usuario en el request. Si `admin` → sin restricción.
- Risk: **Medio** — debe funcionar correctamente en todos los módulos.

---

**7.3 — `CheckCashSession` Middleware**
- File: `app/Http/Middleware/CheckCashSession.php`
- Activar en: `POST /sales-drafts`, `POST /sales-drafts/{id}/checkout`
- Logic: Verificar que `CashRegisterSession::where('user_id', auth()->id())->where('status', 'open')->exists()`. Si no → 403.
- Risk: **Medio**

---

### FASE 8 — Testing Strategy

**Unit Tests (PHPUnit):**
- `ProductTest`: verificar que `scopeAvailableForSale()` excluye productos con `cost = null`.
- `MangaTest`: verificar cálculo de `cost` con diferentes márgenes.
- `PreSaleServiceTest`: verificar transiciones de estado válidas e inválidas.
- `SalesDraftServiceTest`: verificar que `checkout()` hace rollback si stock insuficiente.
- `InventoryServiceTest`: verificar que `applyMovement()` actualiza tabla `inventory` correctamente.

**Feature Tests (Laravel HTTP tests):**
- `AuthTest`: login correcto → 200 + token. Login incorrecto → 401.
- `ProductCostTest`: agregar producto sin costo al draft → 422 con mensaje correcto.
- `CheckoutTest`: checkout completo → sale creada, stock reducido, draft completado.
- `PreSaleCompleteTest`: preventa completa → venta creada, inventario correcto.
- `PreSaleCancelTest`: cancelar preventa con anticipo → crédito generado.
- `CashSessionTest`: vender sin sesión de caja → 403.
- `ScopeToStoreTest`: gerente no puede ver recursos de otra tienda → 403/vacío.

**Archivos:**
```
tests/
  Unit/
    ProductTest.php
    MangaTest.php
    PreSaleServiceTest.php
    SalesDraftServiceTest.php
    InventoryServiceTest.php
  Feature/
    AuthTest.php
    ProductCostTest.php
    CheckoutTest.php
    PreSaleCompleteTest.php
    PreSaleCancelTest.php
    CashSessionTest.php
    ScopeToStoreTest.php
```

- Risk: **Bajo** para escritura. **Alto valor** para detectar regresiones.

---

## Risks & Mitigations

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Orden incorrecto de migrations FK | Media | Alto | Correr migrations en el orden exacto de la tabla de Fase 2. Usar `Schema::disableForeignKeyConstraints()` solo en tests. |
| `checkout()` sin transacción | Alta | Crítico | Todo `checkout()` y `complete()` de preventa DEBE estar en `DB::transaction()`. Sin excepción. |
| Stock negativo por concurrencia | Media | Alto | Usar `lockForUpdate()` en queries de stock dentro de transacciones. |
| `can_view_cost` no aplicado en algún Resource | Alta | Medio | Centralizar en `BaseProductResource::toArray()` la lógica de ocultamiento. |
| CORS bloqueando requests en producción | Media | Alto | Configurar `allowed_origins` correctamente en `.env.production`. |
| Soft deletes rompiendo FKs | Baja | Medio | Verificar que `onDelete('restrict')` no bloquea soft deletes (FK apunta a `id`, no a `deleted_at`). |
| Tokens Sanctum no revocados al desactivar usuario | Media | Medio | En `UserService::deactivate()`, llamar `$user->tokens()->delete()`. |

---

## Success Criteria

- [ ] `php artisan migrate` corre sin errores (40 tablas creadas)
- [ ] `php artisan db:seed` → admin creado, roles y permisos configurados
- [ ] `POST /api/v1/auth/login` retorna token válido
- [ ] `GET /api/v1/auth/me` retorna user + role + permissions + store
- [ ] Producto sin costo → 422 al agregarlo al draft
- [ ] `POST /api/v1/sales-drafts/{id}/checkout` crea sale, reduce stock, completa draft (todo en transacción)
- [ ] Preventa `complete` → venta creada y stock actualizado correctamente
- [ ] Preventa `cancel` con anticipo → `customer_credit` creado
- [ ] Gerente no puede ver datos de otra tienda
- [ ] `GET /api/v1/catalog/{storeId}` funciona sin token (público)
- [ ] Todos los feature tests pasan
- [ ] CORS permite requests desde `localhost:5173`

---

## Resumen de Fases

| Fase | Nombre | Archivos estimados | Riesgo | Entregable |
|------|--------|-------------------|--------|------------|
| 1 | Fundación | 5 | Bajo | Server responde, CORS OK |
| 2 | Migrations | 40 | Medio | DB completa |
| 3 | Modelos | 37 | Bajo | Relaciones funcionando |
| 4 | Seeders | 4 | Bajo | Login disponible |
| 5 | Auth | 5 | Medio | Token + permisos |
| 6 | Módulos (18) | ~120 | Alto | API completa |
| 7 | Middlewares | 3 | Medio | Reglas de negocio activas |
| 8 | Tests | ~12 | Bajo | Cobertura crítica |
| **Total** | | **~226 archivos** | | **Backend production-ready** |
