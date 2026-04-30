# Plan: Módulo Apartados (Layaways) — Preventa v2
**Fecha:** 2026-04-15 | Generado por planner agent

---

## Por qué un módulo separado

| Aspecto | Pre-Sales actual | Apartados (nuevo) |
|---------|-----------------|-------------------|
| **Entrada** | Página Clientes/Preventas | Página Productos → "Apartar" |
| **Producto** | Free-text `product_name` + array opcional | Siempre un `product_id` real |
| **Items** | Multi-producto | Un solo producto |
| **Anticipo** | Opcional | Obligatorio |
| **Transición a pagado** | Manual | Automática cuando balance = 0 |
| **Código** | `PS-YYYYMM-XXXX` | `AP-YYYYMM-XXXX` |
| **Complejidad** | Alta (mangas, niveles de precio) | Baja |

---

## Tablas nuevas

### `layaways`
```sql
id, code (unique AP-YYYYMM-XXXX), store_id, user_id, customer_id (required),
product_id, quantity, price, total, down_payment,
status (pending|active|paid|delivered|cancelled|expired),
expires_at, notes, warehouse_id, created_at, updated_at
```

### `layaway_payments`
```sql
id, layaway_id, amount, payment_method_id, notes, created_at
```

### `layaway_logs`
```sql
id, layaway_id, action, user_id, notes, created_at
```

### Cambio en tabla existente
`inventory_movements.type` — agregar dos nuevos valores (solo código, no migración):
- `apartado` (decrease)
- `apartado_cancelado` (increase)

---

## Status machine

```
POST /layaways (con down_payment)
         ↓
    [pending] → [active]  (automático al registrar anticipo)
         ↓
    [active] → [paid]     (automático cuando balance = 0)
         ↓
    [paid] → [delivered]  (manual — genera Sale real)
         ↓
    [active|paid] → [cancelled] (libera inventario + credita cliente)
```

---

## Endpoints

```
GET    /layaways                        → lista con filtros
POST   /layaways                        → crear + reservar inventario + registrar anticipo
GET    /layaways/by-product/{product}   → apartados activos de un producto
GET    /layaways/{layaway}              → detalle completo
PATCH  /layaways/{layaway}              → editar notas / fecha vencimiento
PATCH  /layaways/{layaway}/status       → entregar o cancelar
POST   /layaways/{layaway}/payments     → agregar abono
GET    /layaways/{layaway}/payments     → historial de pagos
```

---

## Archivos a crear (orden)

| # | Archivo | Tipo |
|---|---------|------|
| 1 | `database/migrations/000042_create_layaways_table.php` | Migración |
| 2 | `database/migrations/000043_create_layaway_payments_table.php` | Migración |
| 3 | `database/migrations/000044_create_layaway_logs_table.php` | Migración |
| 4 | `app/Models/Layaway.php` | Model |
| 5 | `app/Models/LayawayPayment.php` | Model |
| 6 | `app/Models/LayawayLog.php` | Model |
| 7 | `app/Models/InventoryMovement.php` | **Editar** — agregar tipos |
| 8 | `app/Models/Product.php` | **Editar** — agregar `hasMany` |
| 9 | `app/Models/Customer.php` | **Editar** — agregar `hasMany` |
| 10 | `app/Services/LayawayService.php` | Service |
| 11 | `app/Http/Requests/StoreLayawayRequest.php` | Request |
| 12 | `app/Http/Requests/StoreLayawayPaymentRequest.php` | Request |
| 13 | `app/Http/Requests/UpdateLayawayStatusRequest.php` | Request |
| 14 | `app/Http/Requests/UpdateLayawayRequest.php` | Request |
| 15 | `app/Http/Resources/LayawayResource.php` | Resource |
| 16 | `app/Http/Resources/LayawayPaymentResource.php` | Resource |
| 17 | `app/Http/Resources/LayawayLogResource.php` | Resource |
| 18 | `app/Http/Controllers/Api/LayawayController.php` | Controller |
| 19 | `routes/api.php` | **Editar** — registrar rutas |
| 20 | `packages/api/src/types.ts` | **Editar** — tipos Layaway |
| 21 | `packages/api/src/layaways.ts` | Cliente API |
| 22 | `packages/api/src/index.ts` | **Editar** — exportar |

---

## LayawayService — métodos clave

```php
create(array $data, int $userId): Layaway
  // genera código AP-YYYYMM-XXXX
  // valida stock disponible con lockForUpdate
  // crea layaway en DB::transaction
  // reserva inventario (type=apartado)
  // registra anticipo como LayawayPayment
  // status = active
  // logs creación

addPayment(Layaway $layaway, array $data, int $userId): LayawayPayment
  // lockForUpdate
  // valida amount <= balance
  // crea LayawayPayment
  // auto-transición a paid si balance = 0
  // logs pago

deliver(Layaway $layaway, int $userId): Sale
  // valida status === paid
  // crea Sale + SaleItem (inventario ya reservado)
  // status = delivered
  // logs entrega

cancel(Layaway $layaway, int $userId, ?string $notes): Layaway
  // libera inventario (type=apartado_cancelado)
  // crea CustomerCredit con monto pagado
  // status = cancelled
  // logs cancelación
```

---

## Criterios de éxito

- [ ] `php artisan migrate` sin errores (3 tablas nuevas)
- [ ] `POST /layaways` crea apartado, reserva inventario, registra anticipo
- [ ] `POST /layaways/{id}/payments` auto-transiciona a `paid` al llegar a balance 0
- [ ] `PATCH /layaways/{id}/status` con `delivered` genera Sale real
- [ ] `PATCH /layaways/{id}/status` con `cancelled` libera inventario y acredita cliente
- [ ] Módulo pre-sales existente **no se toca** y sigue funcionando
- [ ] `tsc --noEmit` limpio en el frontend
