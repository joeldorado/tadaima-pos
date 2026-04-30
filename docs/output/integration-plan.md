# Plan de Integración: Frontend → Backend Laravel

> **Reglas aplicadas:** No se rediseña arquitectura. No se cambia la base de datos. Solo se integra lo existente.
> **Fecha:** 2026-04-09

---

## 1. Pantallas Detectadas

| # | Pantalla | Ruta | Descripción |
|---|----------|------|-------------|
| 1 | **SellPage** | `/` | Punto de venta principal. Crea ventas y pre-ventas. |
| 2 | **SalesPage** | `/sales` | Historial de ventas y pre-ventas. |
| 3 | **ProductsPage** | `/products` | Catálogo de productos. CRUD con bodegas y tiendas. |
| 4 | **ClientsPage** | `/clients` | Gestión de clientes y saldo a favor. |
| 5 | **TransfersPage** | `/transfers` | Transferencias de inventario entre bodegas. |
| 6 | **PreSalesPage** | `/pre-sales` | Apartados. Ciclo completo: crear, pagar, entregar, cancelar. |
| 7 | **ReportsPage** | `/reports` | Reportes de ventas diarias e inventario. |
| 8 | **SettingsPage** | `/settings` | Configuración de catálogo y logs del sistema. |
| 9 | **AdminPage** | `/admin` | Administración de empresas, tiendas, usuarios, roles y permisos. |

---

## 2. Comparación: Pantallas vs Módulos de Backend

### Estado actual del backend Laravel

El backend fue instalado como scaffolding limpio. No tiene rutas API, ni controladores, ni modelos de negocio. Solo existen las tablas base de Laravel (`users`, `sessions`, `cache`, `jobs`).

Toda la lógica de negocio actual vive en **Supabase Edge Functions** (Hono/Deno) con almacenamiento KV.

| Módulo | Pantalla(s) | ¿Existe en Laravel? | ¿Existe en Supabase? |
|--------|------------|---------------------|----------------------|
| Productos | ProductsPage, SellPage | ❌ No | ✅ Sí |
| Clientes | ClientsPage, SellPage, PreSalesPage | ❌ No | ✅ Sí |
| Ventas | SalesPage, SellPage | ❌ No | ✅ Sí |
| Pre-ventas | PreSalesPage, SellPage | ❌ No | ✅ Sí |
| Inventario | ProductsPage, TransfersPage | ❌ No | ✅ Sí |
| Transferencias | TransfersPage | ❌ No | ✅ Sí |
| Tiendas / Bodegas | ProductsPage, AdminPage | ❌ No | ✅ Sí |
| Usuarios / Roles | AdminPage | ❌ No (solo tabla `users`) | ✅ Sí |
| Terminales | SellPage, AdminPage | ❌ No | ✅ Sí |
| Reportes | ReportsPage | ❌ No | ✅ Sí |
| Configuración | SettingsPage | ❌ No | ✅ Sí |
| Caja | SellPage | ❌ No | ✅ Sí |
| Pagos | SellPage, PreSalesPage | ❌ No | ✅ Sí |

---

## 3. Endpoints Necesarios por Pantalla

Base URL esperada: `http://localhost:8000/api`

### SellPage `/`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/products` | Listar productos activos |
| GET | `/customers` | Listar clientes |
| GET | `/terminals` | Listar terminales disponibles |
| GET | `/payment-methods` | Métodos de pago |
| GET | `/store-payment-methods` | Métodos por tienda |
| POST | `/pre-sales` | Crear pre-venta |
| POST | `/pre-sales/{id}/payments` | Registrar pago de pre-venta |
| POST | `/sales` | Registrar venta directa |
| POST | `/inventory/movements` | Movimiento de inventario |
| POST | `/cash/movements` | Movimiento de caja |
| GET | `/cash/sessions` | Estado de sesión de caja |
| POST | `/cash/sessions` | Abrir sesión de caja |
| PATCH | `/cash/sessions/{id}` | Cerrar / actualizar sesión |

### SalesPage `/sales`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/sales` | Historial de ventas |
| GET | `/pre-sales` | Resumen de pre-ventas |
| GET | `/products` | Info de productos para enriquecer vista |

### ProductsPage `/products`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/products` | Listar productos |
| POST | `/products` | Crear producto |
| PUT | `/products/{id}` | Actualizar producto |
| GET | `/warehouses` | Listar bodegas |
| GET | `/stores` | Listar tiendas |
| GET | `/store-warehouses` | Relación tienda-bodega |
| GET | `/product-categories` | Categorías |
| POST | `/product-images` | Subir imagen |
| DELETE | `/product-images/{id}` | Eliminar imagen |
| GET | `/product-store-prices` | Precios por tienda |
| POST | `/product-store-prices` | Crear precio por tienda |
| POST | `/system/logs` | Registrar log de acción |

### ClientsPage `/clients`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/customers` | Listar clientes |
| POST | `/customers` | Crear cliente |
| PUT | `/customers/{id}` | Actualizar cliente |
| DELETE | `/customers/{id}` | Eliminar cliente |
| GET | `/customers/{id}/saldo-favor` | Saldo a favor del cliente |
| POST | `/customers/{id}/saldo-favor` | Agregar saldo a favor |
| PATCH | `/saldo-favor/{id}` | Actualizar saldo a favor |

### TransfersPage `/transfers`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/transfers` | Listar transferencias |
| POST | `/transfers` | Crear transferencia |
| GET | `/transfers/{id}/items` | Items de una transferencia |

### PreSalesPage `/pre-sales`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/pre-sales` | Listar pre-ventas |
| GET | `/pre-sales/{id}` | Detalle de pre-venta |
| PUT | `/pre-sales/{id}` | Actualizar pre-venta |
| PATCH | `/pre-sales/{id}/status` | Cambiar estado (`pending`, `entregado`, `cancelado`) |
| GET | `/pre-sales/{id}/payments` | Pagos de una pre-venta |
| POST | `/pre-sales/{id}/payments` | Agregar pago |
| POST | `/inventory/movements` | Movimiento al entregar o cancelar |
| GET | `/customers` | Buscar cliente para pre-venta |
| GET | `/products` | Buscar productos para pre-venta |
| POST | `/customers/{id}/saldo-favor` | Aplicar saldo a favor al cancelar |

### ReportsPage `/reports`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/reports/daily` | Reporte de ventas del día |
| POST | `/reports/daily` | Generar/guardar reporte diario |
| GET | `/reports/inventory` | Reporte de inventario |
| POST | `/reports/inventory` | Generar snapshot de inventario |

### SettingsPage `/settings`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/catalog/settings` | Leer configuración del catálogo |
| POST | `/catalog/settings` | Guardar configuración |
| GET | `/system/logs` | Ver logs del sistema |
| POST | `/system/logs` | Escribir log |

### AdminPage `/admin`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET/POST/PUT/DELETE | `/companies` | CRUD empresas |
| GET/POST/PUT/DELETE | `/stores` | CRUD tiendas |
| GET/POST/PUT/DELETE | `/warehouses` | CRUD bodegas |
| GET/POST/DELETE | `/store-warehouses` | Relaciones tienda-bodega |
| GET/POST/PUT/DELETE | `/users` | CRUD usuarios |
| GET/POST/PUT/DELETE | `/roles` | CRUD roles |
| GET/POST | `/permissions` | Permisos |
| GET/POST/DELETE | `/user-roles` | Asignación usuario-rol |
| GET/POST/DELETE | `/role-permissions` | Asignación rol-permiso |
| GET/POST/PUT/DELETE | `/product-categories` | Categorías de productos |
| GET/POST | `/inventory` | Niveles de stock |
| PUT | `/inventory/{productId}/{warehouseId}` | Actualizar stock |
| GET/POST/PUT/DELETE | `/terminals` | Terminales POS |

---

## 4. Gaps Entre Frontend y Backend

### Gaps críticos (bloquean funcionalidad core)

| Gap | Impacto | Pantallas afectadas |
|-----|---------|---------------------|
| No existen rutas API en Laravel | 100% del frontend sin conectar | Todas |
| No hay modelos de negocio (solo `User`) | No se puede leer ni escribir datos | Todas |
| No hay migraciones para tablas de negocio | Base de datos vacía | Todas |
| No hay autenticación API (Sanctum/Passport) | Sin control de acceso | Todas |

### Gaps de lógica de negocio

| Gap | Descripción |
|-----|-------------|
| Pre-ventas con estados | Lógica de transición `pending → entregado/cancelado` con efectos en inventario |
| Movimientos de inventario | Tipos: `venta`, `preventa`, `preventa_entregar`, `preventa_cancelar`, `transfer` |
| Saldo a favor | Generación automática al cancelar pre-venta |
| Sesiones de caja | Apertura, cierre y movimientos de efectivo |
| Precios por tienda | Un producto puede tener precio distinto por tienda |
| Reportes diarios | Snapshot calculado al cierre del día |

### Gaps de infraestructura

| Gap | Descripción |
|-----|-------------|
| CORS no configurado | El frontend en `localhost:5173` no puede llamar a `localhost:8000` |
| Frontend apunta a Supabase | URL base hardcodeada en `utils/supabase/info.tsx` |
| Sin manejo de imágenes | No hay storage configurado en Laravel |

---

## 5. Recomendaciones de Integración

### Orden de implementación sugerido

**Fase 1 — Fundación del API (sin tocar frontend aún)**
1. Instalar `laravel/sanctum` para autenticación por token
2. Configurar CORS en `config/cors.php` para permitir el origen del frontend
3. Crear las migraciones en el mismo orden lógico que el sistema usa:
   - `companies` → `stores` → `warehouses` → `store_warehouses`
   - `roles` → `permissions` → `users` → `user_roles` → `role_permissions`
   - `product_categories` → `products` → `product_images` → `product_store_prices`
   - `terminals` → `customers` → `saldo_favor`
   - `inventory` → `inventory_movements`
   - `pre_sales` → `pre_sale_payments`
   - `sales` → `sale_items` → `payments`
   - `transfers` → `transfer_items`
   - `cash_sessions` → `cash_movements`
   - `reports_daily` → `reports_inventory`
   - `catalog_settings` → `system_logs`

4. Crear modelos Eloquent con sus relaciones
5. Crear Resource Controllers y registrar rutas en `routes/api.php`

**Fase 2 — Punto de entrada único**
- Crear un archivo de configuración en el frontend que permita cambiar la base URL entre Supabase y Laravel sin modificar cada pantalla
- Ejemplo: `src/config/api.ts` con `export const API_BASE = import.meta.env.VITE_API_URL`

**Fase 3 — Migración pantalla por pantalla**
Migrar en este orden (de menor a mayor complejidad):
1. `ClientsPage` — CRUD simple, sin lógica compleja
2. `ProductsPage` — CRUD con relaciones
3. `TransfersPage` — Operaciones con items
4. `SalesPage` — Solo lectura de historial
5. `PreSalesPage` — Lógica de estados + inventario
6. `SellPage` — Integración completa de POS
7. `ReportsPage` — Requiere datos de ventas completos
8. `AdminPage` — CRUD de configuración
9. `SettingsPage` — Configuración del sistema

### Convenciones a respetar

- Mantener los mismos nombres de endpoints que usa el frontend (`/customers`, `/pre-sales`, `/inventory/movements`, etc.)
- Respuestas en el mismo formato JSON que devuelve Supabase (arrays directos, no envueltos en `data`)
- Usar los mismos valores de estado: `"pending"`, `"entregado"`, `"cancelado"`, `"venta"`, `"transfer"`, etc.

### Configuración mínima de CORS (`config/cors.php`)

```php
'paths' => ['api/*', 'sanctum/csrf-cookie'],
'allowed_origins' => ['http://localhost:5173'],
'allowed_methods' => ['*'],
'allowed_headers' => ['*'],
'supports_credentials' => true,
```

### Variable de entorno en el frontend

Agregar en `tienda-T/.env`:
```
VITE_API_URL=http://localhost:8000/api
```

Y en `tienda-T/.env.production`:
```
VITE_API_URL=https://tu-dominio.com/api
```

---

## Resumen Ejecutivo

| Item | Valor |
|------|-------|
| Pantallas detectadas | 9 |
| Endpoints requeridos (total) | ~65 |
| Endpoints existentes en Laravel | 0 |
| Modelos de negocio faltantes | ~20 |
| Migraciones faltantes | ~20 |
| Complejidad de integración | Media-Alta |
| Riesgo principal | Paridad de comportamiento con Supabase (lógica de estados e inventario) |
