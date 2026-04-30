# Flujos de Preventas — Tadaima POS

## Flujo 1 · Apartado simple

**Escenario:** Cliente aparta un producto pagando anticipo, regresa otro día a liquidar.

```
Cliente → Caja
  └─ Preventa: Producto X  precio: $900
     anticipo: $100  →  saldo: $800
     folio: PS-202604-XXXX

Días después →
  Cliente presenta folio / ticket / email
  Cajero carga la preventa por código
  Cliente paga saldo: $800
  → Preventa se completa → se genera Venta #N
```

**API:**
1. `POST /pre-sales` → `{ store_id, product_name, price_1: 900, advance_payment: 100, reserved_quantity: 1, items: [...] }`
2. `POST /pre-sales/{id}/payments` → `{ amount: 100 }` → balance: $800
3. (Otro día) `POST /pre-sales/{id}/payments` → `{ amount: 800 }` → balance: $0
4. `PATCH /pre-sales/{id}/status` → `{ status: "completed" }` → devuelve `Sale { id }`

---

## Flujo 2 · Múltiples preventas + producto normal (una sola visita)

**Escenario:** Cliente compra en una sola sesión:
- Pre-venta A: 2 unidades del Producto X → $100 de anticipo c/u
- Pre-venta B: 3 unidades del Producto Y → $300 de anticipo total
- Producto normal Z: $800 (venta inmediata)

```
Cliente → Caja
  ├─ [PREVENTA] Producto X  x2  anticipo $200  folio: PS-A
  ├─ [PREVENTA] Producto Y  x3  anticipo $300  folio: PS-B
  └─ [VENTA]    Producto Z  x1  precio  $800   → cobrado al momento

Total cobrado hoy: $1,300
Folios generados:
  • PS-A  (2 unidades Producto X)  saldo pendiente: $1,400 - $200 = $1,200
  • PS-B  (3 unidades Producto Y)  saldo pendiente: TBD - $300
Venta #N generada por el Producto Z ($800)
```

**Nota UI:** Cada artículo de preventa genera su propio folio independiente.
El cajero puede crear múltiples preventas en la misma sesión.

---

## Flujo 3 · Liquidar preventa + productos nuevos en caja (Fase 2)

**Escenario:** Cliente regresa con su ticket / folio / email. La preventa PS-A ya llegó.
El cliente además compra más productos en el mismo cobro.

```
Cliente presenta folio / escanea código / busca por email
  └─ Cajero teclea código → se buscan preventas del cliente

Preventas encontradas:
  • PS-A  "Producto X x2"   status: ready ✅  saldo: $1,200   ← disponible
  • PS-B  "Producto Y x3"   status: live  ⏳  saldo: TBD       ← no lista aún

Cajero selecciona PS-A → se carga en la caja

Carrito resultante:
  ┌─────────────────────────────────────────┐
  │ [PRE-VENTA PS-A] Producto X x2          │
  │   Saldo a pagar: $1,200                 │
  ├─────────────────────────────────────────┤
  │ [NUEVO] Producto W  x1   $1,500         │
  │ [NUEVO] Producto V  x1   $  500         │
  └─────────────────────────────────────────┤
  │ TOTAL:  $1,200 + $1,500 + $500 = $3,200 │
  └─────────────────────────────────────────┘

Al cobrar:
  1. addPreSalePayment(PS-A, { amount: 1200 })  → balance: $0
  2. updatePreSaleStatus(PS-A, "completed")      → genera Venta ligada
  3. POST /sales con los ítems nuevos (W y V)    → genera Venta nueva

Ticket final: 2 ventas en una sola transacción de cobro.
```

---

## Estado actual del UI de Caja

| Capacidad | Estado | Notas |
|-----------|--------|-------|
| Crear preventa desde caja | ✅ Funcional | Botón toggle isPreventa, anticipo por ítem |
| Cargar preventa en carrito | ✅ Funcional | Modal picker con lista de preventas activas |
| Buscar por folio (texto) | ✅ Parcial | Solo búsqueda manual en modal |
| Buscar por email / teléfono | ❌ Faltante | Solo busca por nombre de cliente |
| Escanear código de folio | ❌ Faltante | Botón "Próximamente" sin implementar |
| Mezclar preventa + nuevos productos | ❌ Faltante | Carga reemplaza el carrito completo |
| Múltiples preventas en un cobro | ❌ Faltante | Solo 1 loadedPreSaleId por mesa |
| Vista de saldo pendiente separada | ❌ Faltante | Sin separación visual preventa/nuevos |

---

## Cambios de UI necesarios

### 1. Folio rápido desde checkout
- Hacer funcional el botón "Próximamente" del área de checkout
- Input para teclear/escanear código de folio
- Busca `GET /pre-sales?code=PS-XXXX` y lo carga si está disponible

### 2. Buscar por email / teléfono en picker de preventas
- Agregar campo de búsqueda que filtre también por `customer.email` y `customer.phone`

### 3. Mezcla preventa + productos nuevos (Flujo 3)
- Al cargar una preventa, NO reemplazar el carrito
- Marcar los ítems de preventa visualmente (badge "PRE-VENTA")
- Saldo de preventa aparece como línea fija en el total
- Al hacer checkout:
  - Si hay `loadedPreSaleId`: pagar saldo + completar preventa
  - Si hay ítems nuevos: crear venta normal para ellos
  - Cobrar el monto combinado en un solo pago

### 4. Estado visual de preventas en picker
- Agregar badge de estado claro: "Lista para recoger" vs "En espera"
- Filtrar por default a solo las `status: ready` (llegaron)
- Mostrar fecha de llegada y saldo pendiente prominentemente
