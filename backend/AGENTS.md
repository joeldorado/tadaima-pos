# Tadaima POS — Backend (Laravel API)

> **Empieza aquí.** Este documento es el punto de entrada para cualquier IA o
> desarrollador que baje el backend. Explica de qué trata el proyecto, cómo está
> armado, cómo correrlo y la referencia completa de endpoints.
>
> Para el detalle de los contratos JSON que consume la app móvil, ver también
> `../pos-app/docs/BACKEND_API.md`. La fuente de verdad de las rutas siempre es
> `routes/api.php`.

---

## 1. ¿Qué es Tadaima POS?

Sistema de **punto de venta multi-sucursal** para tiendas de electrónica,
accesorios y librería (mangas/tomos). El núcleo del negocio son las **preventas
(pre-órdenes)**: los clientes reservan productos que aún no llegan a la tienda,
pagando un anticipo, y liquidan al recoger.

Capacidades principales:
- **Caja / cortes** por persona (cada usuario abre y cierra su propio turno).
- **Ventas** con carrito client-authoritative (el carrito vive en el cliente; se
  manda completo al cobrar).
- **Preventas**: catálogos de proveedor + folios con anticipo → liquidación.
- **Apartados (layaways)**, **traslados** entre tiendas, **inventario** por bodega.
- **Reportes** (corte del día, ventas, inventario, top productos, preventas).
- **Lealtad** (integración con Supabase de socios Tadaima — solo lectura).
- **RBAC**: admin / gerente / cajero, con gating dentro de los controllers.

### Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Laravel 11, PHP 8.3 |
| Auth | Laravel Sanctum (Bearer token) |
| DB producción | MySQL (Cloud SQL `pos-lite-db`, us-west1) |
| DB tests | SQLite en memoria (`RefreshDatabase`) |
| Storage | Google Cloud Storage (`gs://tadaima-media`) en prod; local en dev |
| Deploy | Cloud Run (us-central1), build remoto en Cloud Build |
| Tests | PHPUnit |

### Entornos

| Entorno | API base |
|---------|----------|
| Local | `http://localhost:8000/api/v1` |
| Producción | `https://tadaima-987277625193.us-central1.run.app/api/v1` |
| Dominio custom | `https://tadaima.poslite.com.mx/api/v1` |

Credenciales de prueba (prod, fase de pruebas): `pier@tadaima.mx` / `Tadaima2026` (admin).

---

## 2. Convenciones de la API

**Base URL:** todo cuelga de `/api/v1` (configurado en `bootstrap/app.php`).

**Auth:** Bearer token Sanctum en header `Authorization: Bearer <token>`. Casi
todo está bajo `auth:sanctum`. Públicas: `POST /auth/login` y
`GET /public/catalog/{catalogUrl}`.

**Envelope de éxito:**

```json
{ "success": true, "data": <payload>, "message": "..." }
```

**Envelope de error:**

```json
{ "success": false, "error": "mensaje legible", "errors": { "campo": ["..."] } }
```

**RBAC:** el gating por rol (admin/gerente/cajero) ocurre **dentro de los
controllers**, no en las rutas. Patrón típico: gerente scoped a su `store_id`,
cajero scoped a su tienda + solo sus propios datos, admin ve todo.

**Paginación:** respuestas paginadas traen `{ data: { data: [...], pagination: {
total, per_page, current_page, last_page } } }`. Algunas (clientes) devuelven
array plano.

---

## 3. Cómo correrlo en local

```bash
cd backend
composer install
cp .env.example .env        # ajusta DB/credenciales
php artisan key:generate
php artisan migrate --seed   # crea esquema + datos base (admin, roles, métodos de pago)
php artisan serve            # http://localhost:8000
```

Para apuntar a la **DB de producción** (fase de pruebas, vía Cloud SQL Proxy):

```bash
cloud-sql-proxy <CONNECTION_NAME> --port 3306   # o el socket configurado
# .env: DB_HOST=127.0.0.1 DB_DATABASE=tadaimaposlite
```

### Tests

```bash
php artisan test                       # toda la suite (SQLite aislado, no toca prod)
php artisan test --filter QABugFixesTest
```

### Deploy

```bash
gcloud run deploy tadaima --source . --region us-central1
```

El `docker/entrypoint.sh` corre `php artisan migrate --force` en el arranque del
contenedor → **las migraciones se aplican solas a prod en cada deploy**.

---

## 4. Arquitectura y decisiones clave (ADRs)

El backend mantiene servicios explícitos para la lógica de negocio (controllers
delgados → `app/Services/`). Decisiones load-bearing:

| ADR | Qué |
|-----|-----|
| **ADR-014** | **Carrito client-authoritative.** El carrito vive en el frontend; `POST /sales` recibe `items[]` directos. Casi no se usan los drafts en vivo (endpoints comentados en `routes/api.php`). |
| **ADR-015** | **`cost_at_sale` (snapshot de costo).** `sale_items.cost`, `pre_sale_order_items.cost` y `layaways.cost` se congelan al INSERT. Re-preciar un producto NO altera reportes históricos. `cost` se expone solo a admin (o rol con `can_view_cost`). |
| **ADR-016** | **Cancelaciones con log + reverso de caja.** `POST /sales/{id}/cancel` y `POST /pre-sale-orders/{id}/cancel`: editan in-place, restauran stock (`InventoryMovement` type `devolucion`), reversan efectivo (`cash_movements` type `salida`) y guardan snapshot en `sale_cancellations`. |
| **ADR-017** | **Una caja por persona.** Cada usuario opera su propia sesión/corte; la caja se nombra `"{usuario} · {tienda}"`. Varios usuarios pueden tener caja abierta en la misma tienda a la vez. Corte = por persona (mismo user en 2 devices = 1 corte). |
| Guard de precios | `CheckoutService` valida server-side que cada `price` coincida (±$0.01) con un nivel del catálogo del producto para esa tienda. Items `is_damaged=true` permiten precio manual. |

**Regla de negocio crítica:** la **comisión de terminal NUNCA se cobra al
cliente** — la tienda la absorbe. Se guarda el `commission_amount` por venta solo
para reportes.

> ⚠️ **NO QUITAR — `SaleResource.cancelled_items[].cost` (2026-07, Ruben/Reportes).**
> El `map` de `cancelled_items` en `app/Http/Resources/SaleResource.php` expone el
> campo **`cost`** (el `cost_at_sale` del snapshot, ver ADR-015 + línea 96 de
> `SaleCancellationService`), gateado igual que `SaleItemResource` (solo admin /
> `can_view_cost`, si no `null`).
> **Por qué existe:** el Reporte de Ventas (`landing/src/pages/ReportsPage.tsx`)
> netea las ventas canceladas (positivo + negativo → 0). Sin este `cost`, la
> cancelación restaría **$0 de costo**, inflando el Costo y descuadrando la
> Utilidad Neta (bug real: producto costo 100, se cancela 1 venta → utilidad salía
> $100 de menos). Es aditivo y respeta el gating; **no lo elimines** al refactorizar
> el Resource ni al regenerar `cancelled_items`.

> ⚠️ **NO QUITAR — filtros `from`/`to`/`store_id` en `GET /supplies/movements` (2026-07, Ruben/Reportes).**
> `SuppliesController::movements` acepta ahora `?from&to` (rango día-negocio, mismo
> `DateRange::fromUtc/toUtc` que `/reports/supplies`) y `?store_id` (filtra por la
> tienda dueña del insumo, `supplies.store_id` vía `whereHas`; NULL = toda la
> empresa). El eager-load ya trae `user:id,name` (**quién registró la compra**) y
> el select del `supply` incluye `store_id`.
> **Por qué:** el Reporte de Ventas lista los insumos (egresos) del MISMO rango y
> tienda que el resto del reporte, y muestra **quién metió cada gasto** (es dinero
> que sale de la tienda). Sin estos filtros la lista traía los últimos 200 de toda
> la empresa sin importar fechas. Es aditivo (los params son opcionales) y respeta
> el scope por empresa + el gating de cajero (solo ve las suyas). **No los elimines.**

**Tiendas y bodegas:** toda tienda necesita su almacén `type='store'` para
recibir inventario. El selector de inventario en alta de producto lista
*warehouses*, no *stores*. Por eso `StoreController::store` auto-crea el warehouse
al dar de alta una tienda (y existe la migración de backfill
`2026_06_03_000001` para tiendas legacy sin bodega).

---

## 5. Referencia de endpoints

> Base: `/api/v1`. ✅ = pública (sin auth). Todo lo demás requiere
> `Authorization: Bearer <token>`. Fuente de verdad: `routes/api.php`.

### Autenticación (`AuthController`)

| Método | Path | Notas |
|---|---|---|
| POST | `/auth/login` ✅ | `{ email, password }` → `{ token, user }` |
| POST | `/auth/logout` | Invalida el token actual |
| GET | `/auth/me` | Usuario autenticado + tienda + roles |

### Catálogo público (`CatalogController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/public/catalog/{catalogUrl}` ✅ | Catálogo público de una tienda (tienda online) |

### Usuarios (`UserController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/users/online` | "Cajeros conectados" (heartbeat de presencia) |
| GET | `/users` · GET `/users/{id}` | Listar / ver |
| POST | `/users` · PUT `/users/{id}` · DELETE `/users/{id}` | CRUD (delete = soft) |
| POST | `/users/{user}/roles` | Asigna rol — **sincroniza** (borra previos + inserta) |
| DELETE | `/users/{user}/roles/{roleId}` | Quita un rol |
| POST | `/users/{user}/avatar` | Sube avatar (multipart) |
| PUT | `/users/{user}/avatar/external` | Avatar por URL externa |
| DELETE | `/users/{user}/avatar` | Quita avatar |

### Roles y Permisos (`RoleController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/permissions` | Catálogo de permisos |
| GET | `/roles` · POST `/roles` · PUT `/roles/{role}` | Listar / crear / editar |
| POST | `/roles/{role}/permissions` | Asigna permisos a un rol |

### Caja / Sesiones (`CashRegisterController`) — ADR-017

| Método | Path | Notas |
|---|---|---|
| GET | `/cash/registers` | Cajas activas (cada una con su `active_session`) |
| GET | `/cash/session` | Mi sesión activa (corte actual) o `null` |
| GET | `/cash/active-sessions` | Quién tiene caja abierta (admin: todas) |
| POST | `/cash/open` | Abrir/reanudar. 409 estructurado si ya hay sesión |
| POST | `/cash/close` | Cerrar corte (`{ closing_cash }`) |
| POST | `/cash/movements` | Entrada/salida/ajuste |
| GET | `/cash/movements` | Movimientos + balance en vivo |
| POST | `/cash/sessions/{session}/force-close` | **Solo admin** — cierra sesión colgada de otro |

### Ventas (`SalesController`) — ADR-014/016

| Método | Path | Notas |
|---|---|---|
| GET | `/sales` · GET `/sales/{id}` | Lista paginada (scoped por rol) / detalle |
| POST | `/sales` | **Checkout.** `items[]` + `payments[]` directos (carrito client-authoritative) |
| POST | `/sales/{sale}/return` | Devolución (restaura inventario) |
| POST | `/sales/{sale}/cancel` | Cancelación parcial/total con log + reverso |
| GET | `/sale-cancellations` | Historial de cancelaciones (filtros + paginado) |

### Sales Drafts (`SalesDraftController`)

> Casi todo comentado por ADR-014. Solo queda inspección admin.

| Método | Path | Notas |
|---|---|---|
| GET | `/sales-drafts` · POST `/sales-drafts` | Listar / crear |
| GET | `/sales-drafts/{salesDraft}` · DELETE `/sales-drafts/{salesDraft}` | Ver / cancelar |

### Preventas — Catálogos (`PreSaleCatalogsController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/pre-sale-catalogs` · POST `/pre-sale-catalogs` | Listar / crear |
| GET | `/pre-sale-catalogs/{id}` · PATCH `/pre-sale-catalogs/{id}` | Ver / editar |
| PATCH | `/pre-sale-catalogs/{id}/status` | Cambiar estado |
| POST/DELETE | `/pre-sale-catalogs/{id}/image` | Imagen del catálogo |

### Preventas — Folios/Órdenes (`PreSaleOrdersController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/pre-sale-orders` · POST `/pre-sale-orders` | Listar / crear folio |
| GET | `/pre-sale-orders/{id}` | Detalle del folio |
| POST | `/pre-sale-orders/{id}/payments` | Registrar anticipo / liquidación |
| PATCH | `/pre-sale-orders/{id}/status` | Cambiar estado |
| PATCH | `/pre-sale-orders/{id}/items/{itemId}/deliver` | Entregar un item |
| POST | `/pre-sale-orders/{id}/cancel` | Cancelar folio / rollback liquidación (ADR-016) |

### Apartados / Layaways (`LayawayController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/layaways` · POST `/layaways` | Listar / crear apartado |
| GET | `/layaways/by-product/{productId}` | Apartados de un producto |
| GET | `/layaways/{layaway}` · PATCH `/layaways/{layaway}` | Ver / editar |
| PATCH | `/layaways/{layaway}/status` | Cambiar estado (incluye entrega → venta) |
| POST/GET | `/layaways/{layaway}/payments` | Abonos |

### Productos (`ProductController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/products` | `?light=1` (payload ligero), `?search=`, `?store_id=`, `?sort=top`, `?type=` |
| GET | `/products/{id}` | Detalle completo |
| POST | `/products` · PUT `/products/{id}` · DELETE `/products/{id}` | CRUD (delete = soft) |
| DELETE | `/products/{product}/force` | Borrado físico |
| POST | `/products/{product}/images/upload` · POST `images` · DELETE `images/{image}` · PUT `images/reorder` | Imágenes |
| GET | `/products/{product}/store-prices` · PUT/DELETE `store-prices/{store}` | Precios override por tienda |

### Mangas / Tomos (`MangaController`, `MangaInventoryController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/mangas` · POST · PUT `/mangas/{id}` · DELETE `/mangas/{id}` | CRUD |
| POST | `/mangas/{manga}/image/upload` | Imagen |
| GET | `/manga-inventory` | Inventario de mangas |
| PUT | `/manga-inventory/{mangaId}/{warehouseId}` | Ajuste de stock |

### Inventario (`InventoryController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/inventory` | Existencias (eager-load warehouse.store) |
| GET/POST | `/inventory/movements` | Historial / registrar movimiento |
| PUT | `/inventory/{productId}/{warehouseId}` | Ajuste de stock (registra movimiento) |

### Traslados (`TransferController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/transfers` · POST `/transfers` | Listar / solicitar |
| GET | `/transfers/{transfer}` · GET `/transfers/{transfer}/items` | Detalle / items |
| PUT | `/transfers/{transfer}/complete` | Completar (admin o gerente de tienda origen) |
| PUT | `/transfers/{transfer}/cancel` | Cancelar |

### Clientes (`CustomerController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/customers` | `?search=`, `?tier=` (array plano, sin paginar) |
| GET | `/customers/{id}` · POST · PUT · DELETE | CRUD |
| GET/POST | `/customers/{customer}/credit` | Saldo / abonar-descontar crédito |

### Lealtad y Socios externos (`LoyaltyController`, `ExternalCardController`)

| Método | Path | Notas |
|---|---|---|
| POST | `/loyalty/award` | Otorgar puntos |
| GET | `/loyalty/customers/{customerId}/history` | Historial de puntos |
| GET | `/external/card/{code}` | Lookup de socio Tadaima por código (Supabase, solo lectura) |
| GET | `/external/customers` · POST `/external/customer` | Buscar / registrar socio |

### Notificaciones (`NotificationsController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/notifications` | Bandeja del usuario |
| POST | `/notifications/stock-alert` | Avisar stock (upsert por store+product+recipient) |
| PATCH | `/notifications/{id}/read` · DELETE `/notifications/{id}` | Marcar leída / borrar |

### Tiendas, Bodegas, Métodos de pago, Terminales, Empresas

| Método | Path | Notas |
|---|---|---|
| GET | `/stores` · POST · PUT `/stores/{id}` | CRUD (POST **auto-crea warehouse** `type=store`) |
| GET/POST | `/stores/{store}/payment-methods` | Métodos habilitados de la tienda |
| GET | `/warehouses` · POST · PUT · DELETE | CRUD de bodegas |
| GET | `/payment-methods` · POST · PUT | Catálogo global de métodos |
| GET | `/terminals` · POST · PUT · DELETE | Terminales (con `commission_percent`) |
| GET | `/companies` · POST · PUT | Empresas |

### Categorías y Proveedores

| Método | Path | Notas |
|---|---|---|
| GET | `/categories` · POST · PUT · DELETE | Categorías de producto |
| GET | `/suppliers` · POST · PUT · DELETE | Proveedores |

### Reportes (`ReportsController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/reports/sales` | Ventas por rango |
| GET | `/reports/inventory` | Existencias |
| GET | `/reports/cash` | Cortes (agrupa por `register_session_id`) |
| GET | `/reports/top-products` | Top productos |
| GET | `/reports/customers` | Clientes |
| GET | `/reports/pre-sales` | Preventas (anticipos + liquidaciones, utilidad real) |
| GET | `/reports/supplies` | Insumos por rango: `total`, `by_category`, `by_source` (caja/caja_chica/propio), `top_supplies`. Scoped por empresa. |

### Insumos / Suministros (`SuppliesController`)

> Compras de operación (egresos). El origen del dinero (`money_source`) define si
> pega o no al corte: `caja` crea `cash_movements salida` (el corte la refleja);
> `caja_chica`/`propio` NO tocan la caja (solo registro). Ver notas de Descuentos/
> Insumos en el MASTERLOG (sesiones 2026-07-15…07-18).

| Método | Path | Notas |
|---|---|---|
| GET | `/supplies` | Catálogo de insumos (scoped por empresa + tienda del insumo) |
| POST | `/supplies` · PUT `/supplies/{supply}` | Alta / edición (admin o gerente) |
| POST | `/supplies/movements` | Registrar compra/consumo/ajuste (`storeMovement`). `money_source` bifurca caja vs no-caja (`SupplyService`) |
| GET | `/supplies/movements` | Movimientos. **Filtros (Ruben/Reportes 2026-07): `?from&to&store_id`** + `?supply_id&type`. Trae `user` (quién registró); cajero solo ve los suyos. Ver ⚠️ NO QUITAR arriba. |
| GET | `/reports/supplies` | Ver tabla de Reportes (resumen agregado). |

### Catálogo online / admin (`CatalogController`)

| Método | Path | Notas |
|---|---|---|
| GET/PUT | `/catalog/settings/{store}` | Config de catálogo público de la tienda |
| GET | `/catalog/products/{store}` | Productos publicados |
| POST | `/catalog/products/{store}` · PUT/DELETE `/{product}` | Agregar/editar/quitar del catálogo |

### Configuración y Logs (`SystemSettingController`, `SystemLogController`)

| Método | Path | Notas |
|---|---|---|
| GET | `/settings` · PUT `/settings` | Mapa clave→valor / actualización batch |
| GET/PUT | `/settings/{key}` | Una clave (ej. `points_multiplier`) |
| GET/POST | `/logs` | Auditoría de mutaciones (entity_type + entity_id + meta JSON) |

---

## 6. Reglas para trabajar en el backend

- **Archivos chicos** (< 800 líneas), controllers delgados, lógica en `app/Services/`.
- **Validación** en `FormRequest` (carpeta `app/Http/Requests/`), no en el controller.
- **Resources** para toda respuesta JSON (`app/Http/Resources/`) — respetan el gating de `cost`.
- **Tests primero** cuando toques caja, precios, costos, cancelaciones o reportes
  (son invariantes load-bearing). Ver `tests/Feature/FullSalesQATest.php` como referencia E2E.
- **Nunca** hardcodear secretos. Usar env vars / Secret Manager.
- **Migraciones idempotentes** cuando hagan backfill de datos (corren solas en cada deploy).
- La DB de prod está en **fase de pruebas** (reseteada a cero, solo admin Pier). QA va
  directo contra MySQL prod vía proxy — no hace falta SQLite para QA manual.
