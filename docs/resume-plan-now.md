# TADAIMA — Estado del Proyecto · Resumen Ejecutivo
**Fecha:** 2026-04-15 | **Ref:** `frontend-web-updated.md` v2.0

---

## PROGRESO GLOBAL

```
DB:       ████████████████████ 100%  (37 tablas + 4 parches)
Backend:  ████████░░░░░░░░░░░░  38%  (32/~80 endpoints)
Frontend: ██████░░░░░░░░░░░░░░  30%  (SellPage ✅ operativo, resto con TODOs)
```

---

## SESIÓN 2026-04-15 — Frontend Web (SellPage operativo) ✅

### Fixes críticos aplicados
- `packages/api/src/drafts.ts` — endpoint corregido `/drafts` → `/sales-drafts`
- `createDraft()` ahora recibe y envía `store_id` (requerido por backend)
- `createSale()` ahora usa `payment_method_id: number` (no `method: string`)
- `SellPage.tsx` — modal de cobro con input de efectivo recibido, cálculo de cambio, botones de denominaciones rápidas

### Flow completo validado
Login (`admin@tadaima.mx` / `password`) → Dashboard → Caja → buscar producto → agregar al carrito → **Cobrar** → ingresar efectivo → **Confirmar Venta** → ¡Venta registrada!

### Plan frontend actualizado
Ver `docs/frontend-web-updated.md` para el plan completo de las fases restantes.

---

## MÓDULOS COMPLETADOS ✅

### Sesión 1 — Frontend: migración Supabase → Laravel
- `tienda-T/.env` → `VITE_API_URL=http://localhost:8000/api/v1`
- `tienda-T/src/lib/api.ts` → cliente HTTP central con Bearer token
- `ProductsPage.tsx` y `ClientsPage.tsx` migradas a `api.get/post`

---

### Sesión 2 — Migraciones DB
- **37 tablas** generadas en orden correcto de FK
- Dependencias circulares resueltas con `000038_add_deferred_foreign_keys.php`
- Parches adicionales:
  - `000039` — columna `points` en customers
  - `000040` — `register_session_id` nullable en sales_drafts
  - `000041` — `register_session_id` nullable en sales

---

### Sesión 3 — Módulo Products ✅
**Endpoints activos:**
```
GET    /api/v1/products
POST   /api/v1/products
GET    /api/v1/products/{id}
PUT    /api/v1/products/{id}
```
**Archivos:** `ProductController`, `ProductResource`, `StoreProductRequest`, `UpdateProductRequest`

**Pendiente del plan:**
- `DELETE /products/{id}`
- `GET/POST /products/{id}/images`
- `GET/PUT /products/{id}/prices`
- `GET/POST /products/{id}/store-prices`
- `GET /products/search` (endpoint optimizado para POS)

---

### Sesión 4 — Módulo Customers ✅
**Endpoints activos:**
```
GET    /api/v1/customers
POST   /api/v1/customers
GET    /api/v1/customers/{id}
PUT    /api/v1/customers/{id}
DELETE /api/v1/customers/{id}
GET    /api/v1/customers/{id}/credit
POST   /api/v1/customers/{id}/credit
```
**Archivos:** `CustomerController`, `CustomerResource`, `CustomerCreditResource`, requests

---

### Sesión 5 — Módulo Inventory ✅
**Endpoints activos:**
```
GET    /api/v1/inventory
PUT    /api/v1/inventory/{productId}/{warehouseId}
POST   /api/v1/inventory/movements
GET    /api/v1/inventory/movements
```
**Features:** `lockForUpdate()` para concurrencia, validación stock negativo, trazabilidad por `InventoryMovement`

---

### Sesión 6 — Módulo Sales Drafts ✅
**Endpoints activos:**
```
GET    /api/v1/sales-drafts
POST   /api/v1/sales-drafts
GET    /api/v1/sales-drafts/{id}
DELETE /api/v1/sales-drafts/{id}          ← cancela (status = cancelled)
POST   /api/v1/sales-drafts/{id}/items
PUT    /api/v1/sales-drafts/{id}/items/{itemId}
DELETE /api/v1/sales-drafts/{id}/items/{itemId}
```
**Features:** Máximo 5 drafts activos por usuario, stock considerando TODOS los drafts activos, precio fallback a `price_1`

**Pendiente del plan:**
- `PUT /sales-drafts/{id}/suspend` (hoy se usa status en store/update)
- `PUT /sales-drafts/{id}/resume`
- `POST /sales-drafts/{id}/checkout` (hoy el checkout va por `POST /sales`)

---

### Sesión 7 — Módulo Sales / Checkout ✅
**Endpoints activos:**
```
GET    /api/v1/sales
GET    /api/v1/sales/{id}
POST   /api/v1/sales            ← checkout: draft → venta real
```
**Features:** `DB::transaction` + `lockForUpdate`, comisiones por terminal, `InventoryMovement(type=venta)`, cierre automático del draft

**Pendiente del plan:**
- `POST /sales/{id}/return` (devoluciones)

**Seed ejecutado:** 4 métodos de pago (Efectivo, Tarjeta débito, Tarjeta crédito, Transferencia)

---

### Sesión 9 — Frontend: migración API completa (Fases 3–7) ✅ ← ÚLTIMA SESIÓN

Páginas migradas de Supabase fetch() → `@tadaima/api`:
- `SalesPage.tsx` — `getSales()`, `getPreSales()`, `getProducts()`, adaptación de campos (`payments[0]`, `sold_at`, `balance`)
- `PreSalesPage.tsx` — `getPreSales()`, `getPreSalePayments()`, `createPreSale()`, `addPreSalePayment()`, `updatePreSaleStatus()`, mapeo de status `live|ready|completed|cancelled → abierta|confirmada|entregada|cancelada`
- `ProductsPage.tsx` — `updateProduct()` conectado en edición, eliminado mock `initialProducts`, `toast` añadido
- `StoresPage.tsx` — tipado completo eliminando `@ts-nocheck`, tipos `ApiStore`
- `AdminPage.tsx` — reescrito: `TabSucursales` y `TabBodegas` con `getStores`/`createStore`/`updateStore`/`getWarehouses`/`createWarehouse`, `TabInventario` con `getInventory`/`updateInventory`/`getProducts`, banners "Pendiente" en tabs sin endpoint

**TypeScript:** `npx tsc --noEmit` limpio en todos los archivos modificados.

---

### Sesión 8 — Módulo Pre-Sales ✅
**Endpoints activos:**
```
GET    /api/v1/pre-sales
POST   /api/v1/pre-sales                  ← crea + reserva inventario
GET    /api/v1/pre-sales/{id}
PUT    /api/v1/pre-sales/{id}
PATCH  /api/v1/pre-sales/{id}/status      ← live↔ready | completed | cancelled
POST   /api/v1/pre-sales/{id}/payments    ← abono parcial
GET    /api/v1/pre-sales/{id}/payments
```
**Features:**
- Creación → reserva inventario inmediata `(type=preventa)`
- Cancelación → libera inventario `(type=preventa_cancelada)` + genera `CustomerCredit`
- Completar → convierte a `Sale` real, acredita sobrepago al cliente
- `lockForUpdate` en pagos para evitar race conditions
- Código único `PS-YYYYMM-XXXX`
- Trazabilidad completa con `PreSaleLog`

---

## ENDPOINTS ACTIVOS HOY (32 / ~80)

| Módulo | Endpoints |
|--------|-----------|
| Products | 4 |
| Customers | 7 |
| Inventory | 4 |
| Sales Drafts | 7 |
| Sales | 3 |
| Pre-Sales | 7 |
| **Total** | **32** |

---

## MÓDULOS PENDIENTES (según architecture.md)

### 🔴 PRIORIDAD ALTA — Bloquean operación real

#### 1. Auth (Sanctum) — SIN IMPLEMENTAR
```
POST /auth/login    → token + user + role + store
POST /auth/logout   → invalidar token
GET  /auth/me       → usuario actual con permisos
```
**Impacto:** Hoy `user_id` va en el body. Sin auth real, ningún endpoint es seguro.
**Archivos a crear:** `AuthController`, `LoginRequest`, middleware en rutas

---

#### 2. Cash Register — SIN IMPLEMENTAR
```
GET  /cash/session         → sesión activa del usuario
POST /cash/open            → abrir caja con monto inicial
POST /cash/close           → cerrar caja
POST /cash/movements       → entrada/salida manual de efectivo
GET  /cash/movements       → historial
```
**Impacto:** `register_session_id` en ventas está nullable como workaround temporal.
Cuando se implemente, las ventas deben linkear a una sesión de caja activa.
**Archivos a crear:** `CashRegisterController`, `CashRegisterSession` model, `CashMovement` model, requests

---

#### 3. Users — SIN IMPLEMENTAR
```
GET    /users
POST   /users
GET    /users/{id}
PUT    /users/{id}
DELETE /users/{id}
```
**Archivos a crear:** `UserController`, `UserResource`, requests

---

### 🟡 PRIORIDAD MEDIA — Completan el POS operativo

#### 4. Transfers — SIN IMPLEMENTAR
```
GET  /transfers
POST /transfers              → crear traslado entre bodegas
GET  /transfers/{id}
GET  /transfers/{id}/items
PUT  /transfers/{id}/complete → afecta inventario de ambas bodegas
PUT  /transfers/{id}/cancel
```
**Archivos a crear:** `TransferController`, `Transfer` model, `TransferItem` model, `TransferService`
**Nota:** Ya existen migrations `000023` y `000024`.

---

#### 5. Terminals — SIN IMPLEMENTAR
```
GET    /terminals
POST   /terminals
PUT    /terminals/{id}
DELETE /terminals/{id}
```
**Archivos a crear:** `TerminalController`, `TerminalResource`, requests
**Nota:** `Terminal` model stub ya existe (usado en `CheckoutService`).

---

#### 6. Payment Methods — SIN IMPLEMENTAR
```
GET  /payment-methods
POST /payment-methods
PUT  /payment-methods/{id}
```
**Archivos a crear:** `PaymentMethodController`, `PaymentMethodResource`
**Nota:** Tabla ya tiene datos seed.

---

### 🟢 PRIORIDAD BAJA — Admin / extensiones

#### 7. Companies — SIN IMPLEMENTAR
```
GET  /companies
POST /companies
PUT  /companies/{id}
```

#### 8. Stores — SIN IMPLEMENTAR
```
GET  /stores
POST /stores
PUT  /stores/{id}
GET  /stores/{id}/payment-methods
POST /stores/{id}/payment-methods
```

#### 9. Warehouses — SIN IMPLEMENTAR
```
GET    /warehouses
POST   /warehouses
PUT    /warehouses/{id}
DELETE /warehouses/{id}
```

#### 10. Product Categories — SIN IMPLEMENTAR
```
GET    /product-categories
POST   /product-categories
PUT    /product-categories/{id}
DELETE /product-categories/{id}
```

#### 11. Mangas — SIN IMPLEMENTAR
```
GET    /mangas
POST   /mangas          → costo calculado automático
PUT    /mangas/{id}
DELETE /mangas/{id}
```
**Fórmula:** `cost = public_price × (1 - profit_margin_percent / 100)`

#### 12. Roles & Permissions — SIN IMPLEMENTAR
```
GET  /roles
POST /roles
PUT  /roles/{id}
GET  /permissions
POST /roles/{id}/permissions
```

#### 13. Reports — SIN IMPLEMENTAR
```
GET  /reports/sales
GET  /reports/daily
POST /reports/daily
GET  /reports/inventory
GET  /reports/cash
GET  /reports/commissions
GET  /reports/pre-sales
```

#### 14. Catalog Online — SIN IMPLEMENTAR
```
GET  /catalog/{storeId}
GET  /catalog/settings
PUT  /catalog/settings/{storeId}
GET  /catalog/{storeId}/products
PUT  /catalog/{storeId}/products/{productId}
```

#### 15. System Settings & Logs — SIN IMPLEMENTAR
```
GET  /system/settings
POST /system/settings
GET  /system/logs
POST /system/logs
```

---

## DEUDA TÉCNICA ACUMULADA

| Item | Detalle |
|------|---------|
| `user_id` en body | Workaround temporal. Se elimina cuando Auth (Sanctum) esté listo |
| `register_session_id` nullable | Workaround. Se hace required cuando Cash Register esté listo |
| Products: sin delete ni imágenes | Solo 4 de ~12 endpoints del plan |
| Sales Drafts: sin suspend/resume explícitos | Se usa status update directo |
| Sales: sin endpoint de devolución | `POST /sales/{id}/return` pendiente |

---

## ORDEN SUGERIDO PRÓXIMAS SESIONES

```
Sesión 9:  Auth (Sanctum) ← desbloquea seguridad de todo
Sesión 10: Users + Roles & Permissions
Sesión 11: Cash Register ← desbloquea register_session_id real
Sesión 12: Transfers (mueve inventario entre bodegas)
Sesión 13: Terminals + Payment Methods + Stores + Warehouses (catálogos)
Sesión 14: Companies + Product Categories + Mangas
Sesión 15: Reports
Sesión 16: Catalog Online
Sesión 17: System Settings + Logs
Sesión 18: Completar Products (imágenes, store-prices, search)
```

---

## ARQUITECTURA DE ARCHIVOS BACKEND (actual)

```
app/
├── Http/
│   ├── Controllers/Api/
│   │   ├── CustomerController.php     ✅
│   │   ├── InventoryController.php    ✅
│   │   ├── PreSalesController.php     ✅
│   │   ├── ProductController.php      ✅
│   │   ├── SalesController.php        ✅
│   │   └── SalesDraftController.php   ✅
│   ├── Requests/
│   │   ├── CheckoutRequest.php        ✅
│   │   ├── StorePreSaleRequest.php    ✅
│   │   ├── StorePreSalePaymentRequest.php ✅
│   │   ├── UpdatePreSaleRequest.php   ✅
│   │   ├── UpdatePreSaleStatusRequest.php ✅
│   │   ├── StoreProductRequest.php    ✅
│   │   ├── UpdateProductRequest.php   ✅
│   │   ├── StoreSalesDraftRequest.php ✅
│   │   ├── StoreSalesDraftItemRequest.php ✅
│   │   └── UpdateSalesDraftItemRequest.php ✅
│   └── Resources/
│       ├── CustomerResource.php       ✅
│       ├── InventoryMovementResource.php ✅
│       ├── InventoryResource.php      ✅
│       ├── PaymentResource.php        ✅
│       ├── PreSaleItemResource.php    ✅
│       ├── PreSaleLogResource.php     ✅
│       ├── PreSalePaymentResource.php ✅
│       ├── PreSaleResource.php        ✅
│       ├── ProductResource.php        ✅
│       ├── SaleItemResource.php       ✅
│       ├── SaleResource.php           ✅
│       ├── SalesDraftItemResource.php ✅
│       └── SalesDraftResource.php     ✅
├── Models/
│   ├── Customer.php / CustomerCredit.php   ✅
│   ├── Inventory.php / InventoryMovement.php ✅
│   ├── Payment.php / PaymentMethod.php     ✅
│   ├── PreSale.php / PreSaleItem.php       ✅
│   ├── PreSalePayment.php / PreSaleLog.php ✅
│   ├── Product.php / ProductPrice.php      ✅
│   ├── Sale.php / SaleItem.php             ✅
│   ├── SalesDraft.php / SalesDraftItem.php ✅
│   └── stubs: Company, Store, Warehouse, Terminal ✅
└── Services/
    ├── CheckoutService.php    ✅
    └── PreSaleService.php     ✅
```

---

*Generado automáticamente el 2026-04-10. Actualizar al completar cada sesión.*
