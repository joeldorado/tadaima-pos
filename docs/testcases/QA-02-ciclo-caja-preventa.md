# QA-02 — Ciclo de caja: apertura, preventa con anticipo y cierre cuadrado

| Campo | Valor |
|-------|-------|
| **ID** | QA-02 |
| **Tipo** | Mixto (UI dominante + verificación API) |
| **Prioridad** | P0 — Bloqueante para operación diaria |
| **Módulos** | SellPage, CashRegister, CustomerModal, PreSaleModal, SalesPage |
| **Tiempo estimado** | 40 min |
| **Ambiente** | Seed limpio aplicado |

## Objetivo

Validar el ciclo completo de una sesión de caja: apertura con fondo inicial, registro de cliente nuevo, creación de preventa con anticipo vía transferencia, verificación del modal de catálogos, y cierre de caja con cuadre exacto.

## Precondiciones

- Seed limpio ejecutado.
- Cajero Macroplaza (`cajero.macroplaza@tadaima.mx`) sin sesión de caja previa.
- 3 catálogos publicados del seed visibles.
- No existen clientes en la BD.

---

## FASE A — Apertura de caja

### A1 · Login cajero Macroplaza

| | |
|--|--|
| **Acción** | Login con `cajero.macroplaza@tadaima.mx / password` |
| **Esperado** | SellPage carga. Banner "Caja cerrada" visible. Botón "Preventa" bloqueado/disabled. Botón "Cobrar" deshabilitado. |

### A2 · Validar bloqueo UI sin caja abierta

| | |
|--|--|
| **Acción** | Click en botón "Preventa" con caja cerrada |
| **Esperado** | Toast de error "Abre la caja primero" o botón no responde. No se abre ningún modal. |

### A3 · Abrir caja con fondo

| | |
|--|--|
| **Acción** | Click "Abrir caja" → monto inicial `500.00` → notas `"Turno matutino"` → confirmar |
| **API** | `POST /api/v1/cash/open` con `opening_balance: 500` → `201 Created` con `session_id` |
| **Esperado** | Banner cambia a "Caja abierta: $500.00". Todos los controles habilitados. |

### A4 · Validar doble apertura rechazada

| | |
|--|--|
| **Acción** | `POST /api/v1/cash/open` de nuevo vía API |
| **Esperado** | `422` o `409 Conflict` — "sesión de caja ya abierta". No se crea sesión duplicada. |

### A5 · Verificar sesión activa

| | |
|--|--|
| **API** | `GET /api/v1/cash/session` |
| **Esperado** | Response con `opening_balance: 500`, `status: "open"`, `movements: []`. |

---

## FASE B — Registro de cliente

### B1 · Abrir selector de cliente

| | |
|--|--|
| **Acción** | Click en campo "Cliente" en SellPage |
| **Esperado** | Modal abre con buscador vacío. Opciones "Buscar" y "Nuevo cliente" visibles. |

### B2 · Buscar cliente inexistente

| | |
|--|--|
| **Acción** | Teclear `Juan` en buscador |
| **API** | `GET /api/v1/customers?search=Juan` → `200 OK` con array vacío |
| **Esperado** | UI muestra "Sin resultados". CTA "Crear cliente nuevo" visible. |

### B3 · Crear cliente con datos mínimos

| | |
|--|--|
| **Acción** | Click "Nuevo cliente" → **Nombre**: `Juan Pérez Hernández` · **Teléfono**: `8112345678` → guardar |
| **API** | `POST /api/v1/customers` → `201 Created` con `customer_id` |
| **Esperado** | Cliente queda seleccionado. Badge "Juan Pérez Hernández" visible en SellPage. |

### B4 · Validar duplicado por teléfono

| | |
|--|--|
| **Acción** | Intentar crear otro cliente con teléfono `8112345678` |
| **Esperado** | `422` "teléfono ya registrado". UI muestra error inline. No se crea duplicado. |

---

## FASE C — Modal de catálogos y creación de folio

### C1 · Abrir modal de preventa

| | |
|--|--|
| **Acción** | Click "Preventa" en SellPage |
| **API** | `GET /api/v1/pre-sale-catalogs` → `200 OK` con 3 items |
| **Esperado** | Modal carga con 3 tarjetas (catálogos del seed). Loader breve antes de mostrar. |

### C2 · Verificar datos de tarjetas

Para cada catálogo del seed validar que la tarjeta muestra:

| Campo | iPhone 16 Pro Max | Samsung S25 Ultra | AirPods Pro |
|-------|-------------------|-------------------|-------------|
| Nombre | iPhone 16 Pro Max 256GB — Negro Titanio | Samsung Galaxy S25 Ultra 512GB — Titanio Gris | AirPods Pro 2da Generación — USB-C |
| Precio | $28,999.00 | $24,999.00 | $6,499.00 |
| Anticipo desde | $5,800.00 | $5,000.00 | $1,300.00 |
| Slots disponibles | 5 | 3 | 10 |

### C3 · Seleccionar AirPods Pro cantidad 2

| | |
|--|--|
| **Acción** | Click tarjeta AirPods → cantidad `2` → agregar al folio |
| **Esperado** | Draft preventa muestra: subtotal `$12,998.00`, anticipo mínimo sugerido `$2,600` (1,300 × 2). |

### C4 · Validar anticipo menor al mínimo

| | |
|--|--|
| **Acción** | Cambiar anticipo a `1,000` (menos de $2,600 mínimo) → intentar crear folio |
| **API** | `POST /api/v1/pre-sale-orders` → `422` "advance_amount is below minimum" |
| **Esperado** | Error inline en campo de anticipo. Folio NO se crea. |

### C5 · Crear folio con anticipo válido via Transferencia

| | |
|--|--|
| **Acción** | Anticipo: `3,000` → método: `Transferencia` → referencia: `TRF-20260422-001` → crear folio |
| **API** | `POST /api/v1/pre-sale-orders` con `advance_amount:3000`, `payment_method_id:<transferencia>` → `201` |
| **Esperado** | `code: "PREV-XXXXX"`, `balance: 9998`, `status: "pending"`. Modal de éxito con ticket de anticipo. |

### C6 · Verificar movimiento en caja

| | |
|--|--|
| **API** | `GET /api/v1/cash/session` |
| **Esperado** | `movements` contiene entrada tipo preventa, `amount: 3000`, `payment_method: "transferencia"`, referencia guardada. |

### C7 · Verificar slots AirPods consumidos

| | |
|--|--|
| **API** | `GET /api/v1/pre-sale-catalogs` |
| **Esperado** | AirPods muestra `reserved_count: 2`, `available_slots: 8`. |

---

## FASE D — Cierre de caja con cuadre

### D1 · Consultar totales antes de cerrar

| | |
|--|--|
| **Acción** | Click "Cerrar caja" en SellPage |
| **Esperado** | Modal de cierre muestra desglose: fondo inicial $500 · anticipos transferencia $3,000 · efectivo esperado $500 · total transferencia esperado $3,000. |

### D2 · Capturar conteo físico y cerrar

| | |
|--|--|
| **Acción** | Efectivo contado: `500` · Transferencias: `3,000` · Notas: `"Cierre turno matutino"` → cerrar |
| **API** | `POST /api/v1/cash/close` → `201 Created` con `difference: 0` |
| **Esperado** | `expected_cash: 500`, `actual_cash: 500`, `difference: 0`, `status: "closed"`. Ticket de cierre visible. |

### D3 · Verificar que caja queda bloqueada

| | |
|--|--|
| **Acción** | Intentar `POST /api/v1/pre-sale-orders` con cualquier payload |
| **Esperado** | `422` "sin sesión de caja activa". SellPage vuelve a mostrar banner "Caja cerrada". |

### D4 · Verificar en SalesPage (admin)

| | |
|--|--|
| **Acción** | Login admin → navegar a `/sales` o `/reports` |
| **Esperado** | El anticipo de $3,000 transferencia del cajero Macroplaza aparece en el reporte del día. KPI "Anticipos del día: $3,000" visible. |

---

## Criterios de aceptación

- [ ] Sin caja abierta, botón "Preventa" está bloqueado o muestra aviso
- [ ] `POST /cash/open` falla con `422/409` si ya hay sesión activa
- [ ] Cliente nuevo se crea correctamente con teléfono único
- [ ] Duplicado por teléfono es rechazado con error claro
- [ ] Modal de preventa carga exactamente 3 catálogos del seed con datos correctos
- [ ] Anticipo inferior al mínimo rechazado tanto en UI como API
- [ ] Folio con anticipo por transferencia registra referencia en `pre_sale_order_payments`
- [ ] `reserved_count` de AirPods incrementa a 2 (cantidad reservada)
- [ ] Cierre de caja calcula `difference: 0` cuando conteo es exacto
- [ ] Post-cierre no se pueden crear transacciones (sesión inactiva)
- [ ] SalesPage refleja los movimientos generados en la sesión

---

## Escenario alterno — Cierre con faltante

En lugar de D2 exacto, reportar efectivo `400` (faltante de $100):

| | |
|--|--|
| **Acción** | Efectivo contado: `400` (en lugar de 500) → cerrar |
| **Esperado** | `difference: -100`. Ticket muestra alerta "Faltante: $100.00". Cierre registrado pero marcado como con discrepancia. |

---

## Notas de automatización

Este caso se puede automatizar parcialmente con Playwright interactuando con el UI de SellPage.
Los pasos de API se pueden cubrir con tests adicionales en `CashRegisterTest.php`.

Tiempo de ejecución manual estimado: 40 minutos.
Tiempo automatizado (una vez implementado): ~3 minutos.
