# QA-01 — Flujo completo de preventa (Admin → Cajero → Entrega)

| Campo | Valor |
|-------|-------|
| **ID** | QA-01 |
| **Tipo** | Mixto (UI + API) |
| **Prioridad** | P0 — Flujo crítico de negocio |
| **Módulos** | PreSaleCatalogsPanel, SellPage, PreSaleOrdersPanel, CashRegister |
| **Tiempo estimado** | 45 min |
| **Ambiente** | Seed limpio aplicado |

## Objetivo

Validar el ciclo de vida completo de una preventa: desde que el admin crea un catálogo hasta que el cajero liquida y entrega el producto al cliente.

## Precondiciones

- `php artisan migrate:fresh --seed` ejecutado exitosamente.
- Backend corriendo en `http://localhost:8000`.
- Frontend corriendo en `http://localhost:5173`.
- No hay sesión de caja abierta en tienda Centro al inicio.
- Credenciales:
  - Admin: `admin@tadaima.mx / password`
  - Cajero Centro: `cajero.centro@tadaima.mx / password`

---

## FASE A — Admin crea y publica catálogo

### A1 · Login admin

| | |
|--|--|
| **Acción** | Navegar a `/login` → email `admin@tadaima.mx` → password `password` → Entrar |
| **API** | `POST /api/v1/auth/login` → `200 OK` |
| **Esperado** | Redirige a dashboard. Token JWT en localStorage. Rol `admin` visible en UI. |

### A2 · Navegar a catálogos de preventa

| | |
|--|--|
| **Acción** | Ir a `/pre-sales` → tab "Catálogos" (o panel de catálogos si está en `/admin`) |
| **API** | `GET /api/v1/pre-sale-catalogs` → `200 OK` |
| **Esperado** | Lista muestra 3 catálogos del seed con status `published`: iPhone 16 Pro Max, Samsung S25 Ultra, AirPods Pro. |

### A3 · Crear catálogo nuevo en draft

| | |
|--|--|
| **Acción** | Click "Nuevo catálogo" → llenar: **Nombre**: `Xiaomi 15 Ultra` · **Precio total**: `19999` · **Anticipo mínimo**: `4000` · **Límite reservas**: `2` · **Fecha llegada**: 20 días hacia adelante |
| **API** | `POST /api/v1/pre-sale-catalogs` → `201 Created` con `status: "draft"` |
| **Esperado** | Catálogo aparece en lista con badge "Borrador". `id` del catálogo guardado para pasos posteriores. |

### A4 · Verificar que draft NO es visible al cajero

| | |
|--|--|
| **Acción** | En sesión separada (incógnito): login cajero → abrir modal "Preventa" en SellPage |
| **API** | `GET /api/v1/pre-sale-catalogs` (sin `status=draft`) |
| **Esperado** | Modal muestra solo 3 catálogos seed. El Xiaomi NO aparece. |

### A5 · Publicar catálogo

| | |
|--|--|
| **Acción** | En sesión admin → editar Xiaomi → cambiar status a `published` → guardar |
| **API** | `PATCH /api/v1/pre-sale-catalogs/{id}/status` con `{"status":"published"}` → `200 OK` |
| **Esperado** | Badge cambia a "Publicado". `available_slots: 2`. |

### A6 · Verificar visibilidad pública

| | |
|--|--|
| **Acción** | `GET /api/v1/pre-sale-catalogs` |
| **Esperado** | Response incluye 4 catálogos. Xiaomi con `reserved_count: 0`. |

---

## FASE B — Cajero abre caja y crea folio con anticipo

### B1 · Login cajero Centro

| | |
|--|--|
| **Acción** | Login con `cajero.centro@tadaima.mx / password` |
| **Esperado** | SellPage carga. Banner "Caja cerrada" visible. Botón "Cobrar" deshabilitado. |

### B2 · Abrir caja

| | |
|--|--|
| **Acción** | Click "Abrir caja" → monto inicial `1000.00` → confirmar |
| **API** | `POST /api/v1/cash/open` con `opening_balance: 1000` → `201 Created` |
| **Esperado** | Banner cambia a "Caja abierta: $1,000". Controles habilitados. |

### B3 · Crear cliente nuevo

| | |
|--|--|
| **Acción** | Abrir selector de cliente → "Nuevo cliente" → **Nombre**: `María López García` · **Teléfono**: `4491234567` · **Email**: `maria.lopez@test.com` → guardar |
| **API** | `POST /api/v1/customers` → `201 Created` |
| **Esperado** | Badge "Cliente: María López García" visible en SellPage. |

### B4 · Abrir modal de preventas

| | |
|--|--|
| **Acción** | Click botón "Preventa" en SellPage |
| **Esperado** | Modal carga con 4 tarjetas (3 seed + Xiaomi). Cada tarjeta muestra: nombre, precio, anticipo mínimo, slots disponibles, fecha llegada. |

### B5 · Seleccionar Xiaomi y crear folio

| | |
|--|--|
| **Acción** | Click "Xiaomi 15 Ultra" → cantidad `1` → confirmar → método `Efectivo` → anticipo `4000` → crear folio |
| **API** | `POST /api/v1/pre-sale-orders` con `customer_id`, `store_id`, `items:[{catalog_id, quantity:1}]`, `advance_amount:4000`, `payment_method_id` → `201 Created` |
| **Esperado** | Response incluye `code: "PREV-XXXXX"`, `status: "pending"`, `balance: 15999`. Modal de éxito con folio imprimible. |

### B6 · Verificar slot consumido

| | |
|--|--|
| **API** | `GET /api/v1/pre-sale-catalogs/{xiaomi_id}` |
| **Esperado** | `reserved_count: 1`, `available_slots: 1`. |

### B7 · Verificar movimiento en caja

| | |
|--|--|
| **API** | `GET /api/v1/cash/session` |
| **Esperado** | `movements` contiene entrada tipo preventa por `$4,000.00` en efectivo. |

---

## FASE C — Admin marca mercancía como lista

### C1 · Consultar folios pendientes

| | |
|--|--|
| **Acción** | Login admin → ver lista de folios con status `pending` |
| **API** | `GET /api/v1/pre-sale-orders?status=pending` |
| **Esperado** | Fila del folio de María muestra: código PREV-XXXXX, cliente, catálogo Xiaomi, saldo $15,999, status "Pendiente". |

### C2 · Marcar como lista (mercancía llegó)

| | |
|--|--|
| **Acción** | Abrir folio → click "Marcar como lista" → confirmar |
| **API** | `PATCH /api/v1/pre-sale-orders/{id}/status` con `{"status":"ready"}` → `200 OK` |
| **Esperado** | Status cambia a `ready`. Log registrado en `pre_sale_order_logs`. |

### C3 · Validar transición inválida

| | |
|--|--|
| **Acción** | Intentar `PATCH` con `status: "pending"` (volver atrás) |
| **Esperado** | `422 Unprocessable Entity` con mensaje de transición inválida. Estado no cambia. |

---

## FASE D — Cajero liquida y entrega

### D1 · Buscar folio en caja

| | |
|--|--|
| **Acción** | En SellPage → abrir modal "Liquidar Preventa" → tab "Listo para entrega" |
| **API** | `GET /api/v1/pre-sale-orders?status=ready` |
| **Esperado** | Folio de María aparece con saldo $15,999 y badge "Listo para entrega". |

### D2 · Cargar folio en carrito

| | |
|--|--|
| **Acción** | Click en el folio → se carga en el carrito |
| **Esperado** | Carrito muestra ítem "Liquidar PREV-XXXXX — Xiaomi 15 Ultra" con monto $15,999. Botón "Cobrar" activo. |

### D3 · Cobrar y marcar entregado

| | |
|--|--|
| **Acción** | Click "Cobrar" → método `Tarjeta Crédito` → monto `15999` → confirmar |
| **API** | `POST /api/v1/pre-sale-orders/{id}/payments` + `PATCH status: "delivered"` → ambos `200/201` |
| **Esperado** | `balance: 0`, `status: "delivered"`, `delivered_at` llenado. Ticket de entrega visible. |

### D4 · Verificar integridad contable

| | |
|--|--|
| **API** | `GET /api/v1/pre-sale-orders/{id}` |
| **Esperado** | `payments` suma `$19,999` total. 2 pagos: `$4,000` efectivo + `$15,999` crédito. |

### D5 · Intentar doble liquidación

| | |
|--|--|
| **Acción** | `POST /api/v1/pre-sale-orders/{id}/payments` de nuevo (vía API) |
| **Esperado** | `422 Unprocessable Entity` — folio ya entregado. |

---

## Criterios de aceptación

- [ ] Catálogo `draft` no aparece en modal de cajero
- [ ] Catálogo `published` aparece en modal con datos correctos
- [ ] Folio se genera con prefijo `PREV-` y número incremental
- [ ] `reserved_count` incrementa al crear folio
- [ ] Anticipo < mínimo es rechazado con `422`
- [ ] Transición `pending → ready` funciona correctamente
- [ ] Transición inválida (ej. `ready → pending`) devuelve `422`
- [ ] Cobro final actualiza `balance` a `0`
- [ ] `status` llega a `delivered` con `delivered_at` poblado
- [ ] Suma de pagos = precio total del catálogo × cantidad
- [ ] Doble liquidación rechazada con `422`
- [ ] Movimientos de caja reflejan ambos pagos (anticipo + liquidación)

---

## Notas de automatización

Los pasos de API (prefijo "API:") se pueden cubrir con tests PHPUnit en `PreSaleOrdersTest.php`.
Los pasos de UI (acciones en el browser) se cubren con Playwright en el Bloque 12 del spec.

Referencia E2E existente: TC-78 → TC-81 en `tests/e2e/tadaima.spec.ts`.
