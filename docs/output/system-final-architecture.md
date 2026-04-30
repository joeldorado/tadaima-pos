# ARQUITECTURA FINAL DEL SISTEMA
## POS Multi-Sucursal — Blueprint para Desarrollo Real

> **Principio rector:** La base de datos y la arquitectura definida en `/docs` tienen prioridad absoluta sobre la implementación actual del frontend. El frontend se adapta, no al revés.
> **Fecha:** 2026-04-09 | **Versión:** 1.0 — Merge Intelligence

---

## ÍNDICE

1. [Stack Tecnológico Final](#1-stack-tecnológico-final)
2. [Base de Datos Final](#2-base-de-datos-final)
3. [Endpoints Finales](#3-endpoints-finales)
4. [Adaptaciones Requeridas del Frontend](#4-adaptaciones-requeridas-del-frontend)
5. [Decisiones Clave](#5-decisiones-clave)

---

## 1. Stack Tecnológico Final

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Backend API** | Laravel | 13.x (instalado) |
| **Base de Datos** | MySQL 8+ | Producción (no SQLite) |
| **Autenticación** | Laravel Sanctum | Token-based |
| **Frontend Web (POS)** | React + Vite | `tienda-T/` |
| **App Admin** | Expo React Native | `app/` |
| **Infraestructura** | Google Cloud (Cloud Run) | — |
| **Storage (imágenes)** | Google Cloud Storage | — |

**Eliminado definitivamente:** Supabase, Firebase, Edge Functions, KV Store.

---

## 2. Base de Datos Final

### Decisión general
Se adopta íntegramente la estructura de `/docs/Base de Datos — POS.md` con los ajustes indicados a continuación. La DB es la fuente de verdad.

---

### 2.1 Tablas — Versión Final

#### COMPANIES *(faltaba en DB doc, presente en frontend)*
```
id, name, rfc, address, phone, email, logo_path, active, created_at, updated_at
```
**Decisión:** Se agrega. Toda la arquitectura multi-sucursal lo requiere como raíz de la jerarquía.

---

#### USERS
```
id, company_id (FK), store_id (FK nullable), name, email, phone, address,
password, active, can_view_cost (bool), remember_token, created_at, updated_at
```
**Decisión:** Columnas de `docs` se mantienen exactamente. Se conserva `store_id` nullable para usuarios Admin sin tienda fija.

---

#### ROLES
```
id, name, guard_name, created_at, updated_at
```
**Valores fijos:** `admin`, `gerente`, `cajero`

#### PERMISSIONS
```
id, name, guard_name, created_at, updated_at
```

#### MODEL_HAS_ROLES / MODEL_HAS_PERMISSIONS *(tablas pivot Sanctum)*

---

#### STORES
```
id, company_id (FK), name, address, phone, email, manager_id (FK users nullable),
active, created_at, updated_at
```

---

#### WAREHOUSES
```
id, company_id (FK), store_id (FK nullable), name, type (enum: central, store),
description, active, created_at, updated_at
```
**Ajuste menor:** Se agrega `store_id` para vincular bodegas de tipo `store` directamente a una tienda.

---

#### PRODUCT_CATEGORIES
```
id, name, description, active, created_at, updated_at
```
**Decisión:** Tabla que el frontend usa pero no estaba en el doc base. Se formaliza aquí.

---

#### PRODUCTS
```
id, category_id (FK), name, sku, barcode, description, cost (decimal, solo admin),
active, created_at, updated_at
```
**Regla crítica:** `cost IS NULL` → producto bloqueado para venta.

---

#### PRODUCT_PRICES
```
id, product_id (FK), price_1, price_2, price_3, price_4, price_5,
created_at, updated_at
```
**Decisión:** Tabla separada (no columnas en products). Permite futura extensión por tienda.

---

#### PRODUCT_STORE_PRICES *(del frontend, adoptado)*
```
id, product_id (FK), store_id (FK), price_level (1-5), price,
created_at, updated_at
```
**Decisión:** Se agrega. Permite que una tienda tenga precios distintos al precio base. El frontend ya implementa esta lógica — es válida y mejora UX sin romper arquitectura.

---

#### PRODUCT_PAYMENT_METHODS
```
id, product_id (FK), allow_cash (bool), allow_card (bool), created_at, updated_at
```

---

#### PRODUCT_IMAGES
```
id, product_id (FK), image_path, sort_order, created_at, updated_at
```

---

#### MANGAS
```
id, name, volume_number, editorial, code, genre, public_price,
profit_margin_percent, cost (decimal, calculado), active, created_at, updated_at
```
**Fórmula backend:** `cost = public_price * (1 - profit_margin_percent / 100)`
**Decisión:** Entidad separada de `products`. Lógica de costo distinta justifica tabla propia.

---

#### INVENTORY
```
id, product_id (FK), warehouse_id (FK), quantity (decimal),
created_at, updated_at
```
**Ajuste:** Se elimina `store_id` de esta tabla. El stock se referencia siempre a una `warehouse`. La relación tienda → bodega ya existe en `warehouses.store_id`. Evita duplicar contexto.

---

#### INVENTORY_MOVEMENTS
```
id, product_id (FK), warehouse_id (FK), type (enum), quantity (decimal),
reference (varchar nullable), notes (text nullable), user_id (FK), created_at
```
**Tipos válidos (enum):** `entrada`, `venta`, `ajuste`, `transferencia`, `devolucion`, `preventa`, `preventa_cancelada`
**Decisión:** Se agregan tipos del frontend (`preventa`, `preventa_cancelada`) porque son necesarios para la trazabilidad de preventas.

---

#### TRANSFERS *(faltaba en DB doc)*
```
id, from_warehouse_id (FK), to_warehouse_id (FK), user_id (FK),
status (enum: pending, completed, cancelled), notes, created_at, updated_at
```

#### TRANSFER_ITEMS
```
id, transfer_id (FK), product_id (FK), quantity, created_at
```
**Decisión:** Se agrega. El frontend ya tiene pantalla de transferencias completa. La estructura es sólida.

---

#### TERMINALS
```
id, store_id (FK), name, commission_percent (decimal), active, created_at, updated_at
```

---

#### PAYMENT_METHODS
```
id, name, active, created_at, updated_at
```
**Valores iniciales:** `efectivo`, `tarjeta`, `transferencia`

#### STORE_PAYMENT_METHODS *(del frontend, adoptado)*
```
id, store_id (FK), payment_method_id (FK), active, created_at, updated_at
```
**Decisión:** Se agrega. Permite configurar qué métodos acepta cada tienda.

---

#### CASH_REGISTERS
```
id, store_id (FK), name, active, created_at, updated_at
```

#### CASH_REGISTER_SESSIONS
```
id, register_id (FK), user_id (FK), opened_at, closed_at (nullable),
opening_cash (decimal), closing_cash (decimal nullable), status (enum: open, closed)
```

#### CASH_MOVEMENTS
```
id, register_session_id (FK), type (enum: entrada, salida, ajuste),
amount (decimal), description, created_at
```

---

#### CUSTOMERS
```
id, external_member_id (varchar nullable), name, phone, email (nullable),
address (nullable), notes (nullable), loyalty_tier (varchar nullable),
created_at, updated_at
```
**Ajuste:** Se agrega `loyalty_tier`. El frontend lo muestra — es dato legítimo de cliente.

#### CUSTOMER_CREDIT *(saldo a favor — del frontend)*
```
id, customer_id (FK), amount (decimal), reason (varchar), created_at, updated_at
```
**Decisión:** Se formaliza el saldo a favor como tabla propia en lugar de campo en customers. Permite historial de créditos.

---

#### SALES_DRAFTS *(del doc UI ↔ DB, faltaba en DB doc)*
```
id, store_id (FK), register_session_id (FK), user_id (FK),
status (enum: open, suspended, completed, cancelled), created_at, updated_at
```

#### SALES_DRAFT_ITEMS
```
id, draft_id (FK), product_id (FK nullable), manga_id (FK nullable),
quantity, price, total, created_at
```
**Decisión:** Tabla requerida para la función de múltiples ventas simultáneas (hasta 5 drafts abiertos). Está en el doc de mapeo UI ↔ DB.

---

#### SALES
```
id, store_id (FK), register_session_id (FK), user_id (FK), customer_id (FK nullable),
terminal_id (FK nullable), draft_id (FK nullable), subtotal, discount, total,
commission_amount, status (enum: completed, cancelled, returned), sold_at, created_at
```

#### SALE_ITEMS
```
id, sale_id (FK), product_id (FK nullable), manga_id (FK nullable),
quantity, price, total, created_at
```

#### PAYMENTS
```
id, sale_id (FK nullable), pre_sale_id (FK nullable), payment_method_id (FK),
terminal_id (FK nullable), amount, commission_amount (decimal), created_at
```
**Ajuste:** `sale_id` y `pre_sale_id` son nullable pero uno debe estar presente. Permite unificar la tabla de pagos para ventas y preventas.

---

#### PRE_SALES
```
id, store_id (FK), user_id (FK), customer_id (FK nullable), code (varchar unique),
product_name (varchar), advance_payment (decimal), preorder_limit (int),
reserved_quantity (int), pickup_deadline (date nullable),
status (enum: live, ready, expired, completed, cancelled),
cost (decimal nullable), margin_percent (decimal nullable),
created_at, updated_at
```
**Decisión de estado (crítica):** Se adoptan los estados de `docs`: `live, ready, expired, completed, cancelled`.
El frontend usa `pending/entregado/cancelado` — **debe adaptarse.**

#### PRE_SALE_ITEMS
```
id, pre_sale_id (FK), product_id (FK nullable), manga_id (FK nullable),
quantity, price_level (1-5), price, created_at
```

#### PRE_SALE_PAYMENTS
```
id, pre_sale_id (FK), amount (decimal), payment_method_id (FK nullable),
notes (varchar nullable), created_at
```
**Decisión:** Tabla separada de `payments` para pagos de anticipo de preventa (antes del cierre como venta).

#### PRE_SALE_LOGS
```
id, pre_sale_id (FK), action (varchar), user_id (FK), notes, created_at
```

---

#### CATALOG_SETTINGS
```
id, store_id (FK unique), catalog_url (varchar nullable), show_price (bool),
show_stock (bool), created_at, updated_at
```

#### CATALOG_PRODUCTS
```
id, product_id (FK), store_id (FK), visible (bool), created_at
```

---

#### SYSTEM_SETTINGS
```
id, company_id (FK), key (varchar), value (text)
```
**Índice único:** `(company_id, key)`

#### SYSTEM_LOGS
```
id, user_id (FK nullable), action (varchar), description (text nullable), created_at
```

---

### 2.2 Resumen de Tablas

| # | Tabla | Estado |
|---|-------|--------|
| 1 | companies | **Agregada** |
| 2 | users | Mantenida |
| 3 | roles / permissions | Mantenida |
| 4 | stores | Mantenida |
| 5 | warehouses | Ajuste: `store_id` |
| 6 | product_categories | **Formalizada** |
| 7 | products | Mantenida |
| 8 | product_prices | Mantenida |
| 9 | product_store_prices | **Adoptada del frontend** |
| 10 | product_payment_methods | Mantenida |
| 11 | product_images | Mantenida |
| 12 | mangas | Mantenida |
| 13 | inventory | Ajuste: sin `store_id` |
| 14 | inventory_movements | Ajuste: tipos ampliados |
| 15 | transfers | **Adoptada del frontend** |
| 16 | transfer_items | **Adoptada del frontend** |
| 17 | terminals | Mantenida |
| 18 | payment_methods | Mantenida |
| 19 | store_payment_methods | **Adoptada del frontend** |
| 20 | cash_registers | Mantenida |
| 21 | cash_register_sessions | Mantenida |
| 22 | cash_movements | Mantenida |
| 23 | customers | Ajuste: `loyalty_tier` |
| 24 | customer_credit | **Formalizada del frontend** |
| 25 | sales_drafts | **Agregada (doc UI ↔ DB)** |
| 26 | sales_draft_items | **Agregada (doc UI ↔ DB)** |
| 27 | sales | Mantenida |
| 28 | sale_items | Mantenida |
| 29 | payments | Ajuste: nullable dual |
| 30 | pre_sales | Ajuste: estados + `cancelled` |
| 31 | pre_sale_items | Mantenida |
| 32 | pre_sale_payments | **Renombrada** |
| 33 | pre_sale_logs | Mantenida |
| 34 | catalog_settings | Mantenida |
| 35 | catalog_products | Mantenida |
| 36 | system_settings | Mantenida |
| 37 | system_logs | Mantenida |

**Total: 37 tablas**

---

## 3. Endpoints Finales

**Base URL:** `/api/v1`
**Auth:** `Authorization: Bearer {token}` (Sanctum)

---

### AUTH
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/auth/login` | Login → token + user + role + store |
| POST | `/auth/logout` | Invalidar token |
| GET | `/auth/me` | Usuario actual con permisos |

---

### USERS
| Método | Endpoint |
|--------|----------|
| GET | `/users` |
| POST | `/users` |
| GET | `/users/{id}` |
| PUT | `/users/{id}` |
| DELETE | `/users/{id}` |

---

### ROLES & PERMISSIONS
| Método | Endpoint |
|--------|----------|
| GET | `/roles` |
| POST | `/roles` |
| PUT | `/roles/{id}` |
| GET | `/permissions` |
| POST | `/roles/{id}/permissions` |

---

### COMPANIES
| Método | Endpoint |
|--------|----------|
| GET | `/companies` |
| POST | `/companies` |
| PUT | `/companies/{id}` |

---

### STORES
| Método | Endpoint |
|--------|----------|
| GET | `/stores` |
| POST | `/stores` |
| PUT | `/stores/{id}` |
| GET | `/stores/{id}/payment-methods` |
| POST | `/stores/{id}/payment-methods` |

---

### WAREHOUSES
| Método | Endpoint |
|--------|----------|
| GET | `/warehouses` |
| POST | `/warehouses` |
| PUT | `/warehouses/{id}` |
| DELETE | `/warehouses/{id}` |

---

### PRODUCTS
| Método | Endpoint | Notas |
|--------|----------|-------|
| GET | `/products` | Listado paginado |
| GET | `/products/search` | Optimizado para POS: id, name, prices, stock, barcode |
| GET | `/products/{id}` | |
| POST | `/products` | |
| PUT | `/products/{id}` | |
| DELETE | `/products/{id}` | |
| GET | `/products/{id}/images` | |
| POST | `/products/{id}/images` | Upload a Cloud Storage |
| DELETE | `/products/{id}/images/{imageId}` | |
| GET | `/products/{id}/prices` | Precios base |
| PUT | `/products/{id}/prices` | Actualizar precios base |
| GET | `/products/{id}/store-prices` | Precios por tienda |
| POST | `/products/{id}/store-prices` | |

---

### PRODUCT CATEGORIES
| Método | Endpoint |
|--------|----------|
| GET | `/product-categories` |
| POST | `/product-categories` |
| PUT | `/product-categories/{id}` |
| DELETE | `/product-categories/{id}` |

---

### MANGAS
| Método | Endpoint |
|--------|----------|
| GET | `/mangas` |
| GET | `/mangas/{id}` |
| POST | `/mangas` |
| PUT | `/mangas/{id}` |
| DELETE | `/mangas/{id}` |

---

### INVENTORY
| Método | Endpoint | Notas |
|--------|----------|-------|
| GET | `/inventory` | Query: `?warehouse_id=`, `?product_id=` |
| PUT | `/inventory/{productId}/{warehouseId}` | Actualizar stock directo (admin) |
| POST | `/inventory/movements` | Registrar movimiento |
| GET | `/inventory/movements` | Historial de movimientos |

---

### TRANSFERS
| Método | Endpoint |
|--------|----------|
| GET | `/transfers` |
| POST | `/transfers` |
| GET | `/transfers/{id}` |
| GET | `/transfers/{id}/items` |
| PUT | `/transfers/{id}/complete` |
| PUT | `/transfers/{id}/cancel` |

---

### CUSTOMERS
| Método | Endpoint |
|--------|----------|
| GET | `/customers` |
| POST | `/customers` |
| GET | `/customers/{id}` |
| PUT | `/customers/{id}` |
| DELETE | `/customers/{id}` |
| GET | `/customers/{id}/credit` | Saldo a favor |
| POST | `/customers/{id}/credit` | Agregar crédito |

---

### TERMINALS
| Método | Endpoint |
|--------|----------|
| GET | `/terminals` |
| POST | `/terminals` |
| PUT | `/terminals/{id}` |
| DELETE | `/terminals/{id}` |

---

### PAYMENT METHODS
| Método | Endpoint |
|--------|----------|
| GET | `/payment-methods` |
| POST | `/payment-methods` |
| PUT | `/payment-methods/{id}` |

---

### SALES DRAFTS (POS Core)
| Método | Endpoint | Notas |
|--------|----------|-------|
| POST | `/sales-drafts` | Crear draft nuevo |
| GET | `/sales-drafts` | Query: `?status=open\|suspended` |
| GET | `/sales-drafts/{id}` | |
| POST | `/sales-drafts/{id}/items` | Agregar producto al carrito |
| PUT | `/sales-drafts/{id}/items/{itemId}` | Cambiar cantidad/precio |
| DELETE | `/sales-drafts/{id}/items/{itemId}` | Quitar producto |
| PUT | `/sales-drafts/{id}/suspend` | Suspender venta |
| PUT | `/sales-drafts/{id}/resume` | Reactivar venta suspendida |
| PUT | `/sales-drafts/{id}/cancel` | Cancelar draft |
| POST | `/sales-drafts/{id}/checkout` | **Confirmar venta** → crea sale + pagos + movimientos inventario |

---

### SALES
| Método | Endpoint |
|--------|----------|
| GET | `/sales` |
| GET | `/sales/{id}` |
| POST | `/sales/{id}/return` | Devolución |

---

### PRE-SALES
| Método | Endpoint | Notas |
|--------|----------|-------|
| GET | `/pre-sales` | Query: `?status=` |
| POST | `/pre-sales` | Crear preventa (estado: `live`) |
| GET | `/pre-sales/{id}` | |
| PUT | `/pre-sales/{id}` | Actualizar datos |
| GET | `/pre-sales/{id}/payments` | Pagos de anticipo |
| POST | `/pre-sales/{id}/payments` | Registrar anticipo |
| PUT | `/pre-sales/{id}/ready` | Marcar como lista (estado: `ready`) |
| POST | `/pre-sales/{id}/complete` | **Completar** → convierte a venta |
| PUT | `/pre-sales/{id}/cancel` | Cancelar → aplica crédito si corresponde |
| GET | `/pre-sales/{id}/logs` | Historial de acciones |

---

### CASH REGISTER
| Método | Endpoint | Notas |
|--------|----------|-------|
| GET | `/cash/session` | Sesión activa del usuario |
| POST | `/cash/open` | Abrir caja |
| POST | `/cash/close` | Cerrar caja |
| POST | `/cash/movements` | Registrar entrada/salida de efectivo |
| GET | `/cash/movements` | Historial de movimientos |

---

### REPORTS
| Método | Endpoint |
|--------|----------|
| GET | `/reports/sales` | Query: `?from=&to=&store_id=` |
| GET | `/reports/daily` | Reporte del día |
| POST | `/reports/daily` | Generar/guardar snapshot diario |
| GET | `/reports/inventory` | |
| POST | `/reports/inventory` | Snapshot de inventario |
| GET | `/reports/cash` | Corte de caja |
| GET | `/reports/commissions` | Comisiones por terminal |
| GET | `/reports/pre-sales` | Estado de preventas |

---

### CATALOG ONLINE
| Método | Endpoint |
|--------|----------|
| GET | `/catalog/{storeId}` | Catálogo público (sin auth) |
| GET | `/catalog/settings` | |
| PUT | `/catalog/settings/{storeId}` | |
| GET | `/catalog/{storeId}/products` | Productos visibles |
| PUT | `/catalog/{storeId}/products/{productId}` | Activar/desactivar visibilidad |

---

### SYSTEM
| Método | Endpoint |
|--------|----------|
| GET | `/system/settings` | |
| POST | `/system/settings` | |
| GET | `/system/logs` | |
| POST | `/system/logs` | |

---

## 4. Adaptaciones Requeridas del Frontend

> El frontend `tienda-T/` necesita los siguientes cambios para alinearse a la arquitectura final. **No se rediseña ninguna pantalla, solo se ajusta la capa de integración.**

---

### 4.1 Cambios Urgentes (bloquean integración)

#### A — Variable de entorno para API base
**Archivo:** `tienda-T/.env`
```
VITE_API_URL=http://localhost:8000/api/v1
```
**Archivo:** `tienda-T/.env.production`
```
VITE_API_URL=https://api.tudominio.com/api/v1
```
Crear un módulo `src/lib/api.ts` que centralice todas las llamadas HTTP con el token Bearer.

---

#### B — Reemplazar cliente Supabase por cliente HTTP propio
Eliminar: `utils/supabase/info.tsx` como fuente de configuración de API.
Reemplazar todas las llamadas a `https://{projectId}.supabase.co/functions/v1/make-server-*` por llamadas al API Laravel.

---

#### C — Estados de pre-ventas: renombrar
| Frontend actual | Backend final | Pantalla afectada |
|-----------------|---------------|-------------------|
| `"pending"` | `"live"` | PreSalesPage |
| `"entregado"` | `"completed"` | PreSalesPage |
| `"cancelado"` | `"cancelled"` | PreSalesPage |

---

#### D — Flujo de venta: adoptar drafts
La `SellPage` actualmente crea pre-ventas para gestionar el carrito. Con la arquitectura final debe usar `sales-drafts`:
- Al iniciar una venta → `POST /sales-drafts`
- Al agregar producto → `POST /sales-drafts/{id}/items`
- Al confirmar → `POST /sales-drafts/{id}/checkout`
- Al suspender → `PUT /sales-drafts/{id}/suspend`

---

#### E — Precios: estructura separada
El frontend envía precios dentro del objeto producto. La API retornará precios en objeto separado `prices: { price_1, price_2, price_3, price_4, price_5 }`. El frontend debe leer `product.prices.price_1` en lugar de `product.price_1`.

---

### 4.2 Cambios Menores (alinear naming)

| Endpoint actual (Supabase) | Endpoint final (Laravel) |
|----------------------------|--------------------------|
| `POST /pre-sales/:id/payments` | `POST /pre-sales/{id}/payments` |
| `PATCH /pre-sales/:id/status` | `PUT /pre-sales/{id}/ready` o `PUT /pre-sales/{id}/cancel` |
| `POST /customers/:id/saldo-favor` | `POST /customers/{id}/credit` |
| `GET /saldo-favor` | `GET /customers/{id}/credit` |
| `GET /cash/sessions` | `GET /cash/session` |
| `POST /cash/sessions` | `POST /cash/open` |
| `PATCH /cash/sessions/{id}` | `POST /cash/close` |
| `GET /catalog/settings` | `GET /catalog/settings` |
| `POST /catalog/settings` | `PUT /catalog/settings/{storeId}` |

---

### 4.3 Módulos del frontend sin equivalente arquitectónico (a ignorar por ahora)

| Característica frontend | Decisión |
|-------------------------|----------|
| `kv_store` como persistencia | Eliminado — reemplazado por MySQL |
| Hono Edge Functions | Eliminado — reemplazado por Laravel Controllers |
| `store-warehouses` como entidad independiente | Absorbido por `warehouses.store_id` |
| `role-permissions` como endpoint directo | Manejado internamente por Sanctum |

---

## 5. Decisiones Clave

### ADR-001: DB prioridad sobre KV store del frontend

**Problema:** El frontend usa un KV store (tabla única con JSONB) en Supabase. Los docs definen 26+ tablas relacionales.

**Decisión:** Se adopta el esquema relacional completo de los docs. El KV store era una solución temporal de prototipado.

**Por qué:** Un POS multi-sucursal requiere integridad referencial, JOINs para reportes, y trazabilidad de inventario. Un KV store no puede garantizar ninguna de estas propiedades a escala.

---

### ADR-002: Estados de pre-ventas — docs ganan

**Problema:** Frontend usa `pending/entregado/cancelado`. Docs definen `live/ready/expired/completed/cancelled`.

**Decisión:** Se adoptan los estados de docs. El frontend se adapta.

**Por qué:** El flujo de docs tiene 4 fases (`live→ready→completed`) con lógica de negocio en cada transición (control de stock, folio, conversión a venta). El frontend simplificó el flujo perdiendo la fase `ready` que es crítica para el control de inventario en preventas.

---

### ADR-003: Sales Drafts — se agrega a la DB

**Problema:** El doc de DB base no incluye `sales_drafts`, pero el doc de Mapeo UI ↔ DB sí lo define.

**Decisión:** Se agrega `sales_drafts` y `sales_draft_items` a la DB final.

**Por qué:** La funcionalidad de hasta 5 ventas simultáneas es un requisito de negocio explícito en los docs de módulos. Sin esta tabla, la POS opera en modo degradado (una sola venta a la vez).

---

### ADR-004: companies — se agrega a la DB

**Problema:** La tabla `companies` no estaba en el doc de DB, pero todos los módulos referencian `company_id`.

**Decisión:** Se agrega `companies` como tabla raíz de la jerarquía.

**Por qué:** Sin `companies`, el sistema no puede escalar a modo SaaS multi-empresa (objetivo explícito del doc de escalabilidad).

---

### ADR-005: product_store_prices — adoptado del frontend

**Problema:** El doc de DB define `product_prices` (precios base). El frontend implementó `product_store_prices` (precio distinto por tienda).

**Decisión:** Se adoptan ambas tablas.

**Por qué:** `product_prices` define el precio base maestro. `product_store_prices` permite diferenciación por tienda sin modificar el maestro. Mejora UX sin romper la arquitectura relacional. Es la implementación correcta para un POS multi-sucursal.

---

### ADR-006: inventory sin store_id

**Problema:** El doc de DB define `inventory` con `store_id nullable`. El frontend asocia stock directamente a tiendas.

**Decisión:** Se elimina `store_id` de `inventory`. El stock siempre pertenece a una `warehouse`. La relación tienda se obtiene vía `warehouses.store_id`.

**Por qué:** Tener dos niveles de ubicación (tienda Y bodega) en la misma fila de inventario crea ambigüedad. Si una tienda tiene múltiples bodegas, ¿cuál prevalece? La referencia directa a `warehouse` es más precisa.

---

### ADR-007: Supabase eliminado del stack

**Problema:** El frontend usa Supabase extensamente. Los docs definen Laravel + MySQL.

**Decisión:** Supabase se elimina completamente del stack.

**Por qué:** `architect.md` lo indica explícitamente en la sección "Avoid". Además, el modelo KV de Supabase es incompatible con las necesidades de reportes, JOINs y reglas de negocio complejas del sistema.

---

### ADR-008: Manga como entidad separada — mantenida

**Problema:** El frontend no tiene módulo de manga. Los docs lo definen como entidad propia.

**Decisión:** Manga es una tabla y módulo separado desde el inicio.

**Por qué:** La lógica de costo calculado automáticamente (`costo = precio_público × (1 - margen)`), los campos específicos (editorial, número de tomo, código) y el flujo de alta masiva de tomos no encajan en el modelo genérico de productos.

---

## Resumen Ejecutivo

| Dimensión | Estado Final |
|-----------|-------------|
| Tablas DB | **37 tablas** (26 originales + 11 formalizadas/agregadas) |
| Endpoints API | **~80 endpoints** bajo `/api/v1` |
| Stack | Laravel 13 + MySQL + React (POS web) + Expo (admin) |
| Auth | Laravel Sanctum (Bearer token) |
| Módulos backend | 18 módulos (Auth, Users, Roles, Companies, Stores, Warehouses, Products, Mangas, Inventory, Transfers, Customers, Terminals, Sales, SalesDrafts, PreSales, Cash, Reports, Catalog) |
| Frontend: cambios urgentes | 5 (env var, HTTP client, estados, drafts, precios) |
| Frontend: cambios de naming | 9 endpoints |
| Tiempo de adaptación frontend | Bajo — solo capa de servicio, no UI |
| Riesgo principal | Migración de datos del KV store si hay datos reales en producción |

**Este documento es el blueprint definitivo. Cualquier decisión de desarrollo debe referenciarlo.**
