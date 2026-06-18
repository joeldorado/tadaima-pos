# QA-03 — Límites, validaciones de negocio y reportes

| Campo | Valor |
|-------|-------|
| **ID** | QA-03 |
| **Tipo** | Mixto (API dominante + verificación UI) |
| **Prioridad** | P1 — Consistencia de datos y reportería |
| **Módulos** | PreSaleOrderService, PreSaleCatalogsController, SalesPage, Permisos por rol |
| **Tiempo estimado** | 60 min |
| **Ambiente** | Seed limpio aplicado (puede reutilizar estado de QA-01 o QA-02) |

## Objetivo

Verificar que todas las reglas de negocio defensivas funcionan correctamente: límites de reserva, campos obligatorios, transiciones de estado inválidas, control de acceso por rol, y que SalesPage refleja fielmente los datos operativos.

## Precondiciones

- Seed limpio ejecutado.
- Caja abierta en tienda Centro (cajero.centro@tadaima.mx, fondo $1,000).
- Admin logueado para ver reportes y hacer cambios en catálogos.
- Samsung Galaxy S25 Ultra con `preorder_limit: 3` — se usará para probar saturación.

---

## FASE A — Validación de preorder_limit

### A1 · Consultar slots iniciales

| | |
|--|--|
| **API** | `GET /api/v1/pre-sale-catalogs` |
| **Esperado** | Samsung S25 Ultra: `preorder_limit: 3`, `reserved_count: 0`, `available_slots: 3`. |

### A2 · Crear 3 folios hasta saturar el límite

Para cada uno de 3 clientes distintos (crear uno nuevo), ejecutar:

| Folio | Cliente | Anticipo | Esperado |
|-------|---------|---------|---------|
| #1 | Cliente QA-A | $5,000 efectivo | `201 Created`, código PREV-XXXXX |
| #2 | Cliente QA-B | $5,000 efectivo | `201 Created`, código PREV-XXXXY |
| #3 | Cliente QA-C | $5,000 efectivo | `201 Created`, código PREV-XXXXZ |

Después del tercer folio:
- **API** `GET /api/v1/pre-sale-catalogs/{samsung_id}` → `reserved_count: 3`, `available_slots: 0`.

### A3 · Intentar cuarta reserva (límite excedido)

| | |
|--|--|
| **Acción** | Crear Cliente QA-D → `POST /api/v1/pre-sale-orders` con Samsung S25 |
| **Esperado** | `422 Unprocessable Entity` con mensaje tipo `"preorder_limit_exceeded"` o `"no hay slots disponibles"`. Folio NO se crea. `reserved_count` sigue en 3. |

### A4 · Cancelar un folio libera slot

| | |
|--|--|
| **Acción** | `PATCH /api/v1/pre-sale-orders/{folio1_id}/status` con `{"status":"cancelled","notes":"prueba QA"}` |
| **API** | `200 OK` con `status: "cancelled"` |
| **Esperado** | `GET /pre-sale-catalogs/{samsung_id}` → `available_slots: 1`. Nuevo folio ahora puede crearse. |

### A5 · Crear folio en slot liberado

| | |
|--|--|
| **Acción** | `POST /api/v1/pre-sale-orders` con Samsung S25, Cliente QA-D |
| **Esperado** | `201 Created`. `reserved_count: 3` (2 activos + 1 cancelado no libera el contador histórico, solo el activo). |

> **Nota**: Validar el comportamiento exacto del contador — si `reserved_count` incluye cancelados o solo activos. Documentar la regla de negocio que aplique.

---

## FASE B — Validaciones de campos obligatorios

### B1 · Folio sin customer_id

| | |
|--|--|
| **Acción** | `POST /api/v1/pre-sale-orders` omitiendo `customer_id` |
| **Esperado** | `422` con `errors.customer_id: ["required"]`. Folio NO se crea. |

### B2 · Folio con customer_id inexistente

| | |
|--|--|
| **Acción** | `POST /api/v1/pre-sale-orders` con `customer_id: 999999` |
| **Esperado** | `422` o `404` con mensaje "customer not found". |

### B3 · Folio sin items

| | |
|--|--|
| **Acción** | `POST /api/v1/pre-sale-orders` con `items: []` y customer_id válido |
| **Esperado** | `422` con `errors.items: ["required", "must have at least 1 item"]`. |

### B4 · Folio con catálogo en estado draft

| | |
|--|--|
| **Acción** | Admin crea catálogo nuevo → lo deja en `draft`. Cajero intenta `POST /pre-sale-orders` con ese `catalog_id`. |
| **Esperado** | `422` "catalog not available" o "catalog must be published". |

### B5 · Folio con cantidad ≤ 0

| | |
|--|--|
| **Acción** | `POST /api/v1/pre-sale-orders` con `items: [{catalog_id: X, quantity: 0}]` y también con `quantity: -1` |
| **Esperado** | Ambos rechazan con `422` "quantity must be greater than 0". |

### B6 · Anticipo mayor al precio total

| | |
|--|--|
| **Acción** | Folio AirPods cantidad 1 (total $6,499) con anticipo `$10,000` |
| **Esperado** | `422` "initial_payment cannot exceed total" o se acepta pero se ajusta al total. Documentar comportamiento real. |

### B7 · Transición de status inválida

| Transición intentada | Esperado |
|---------------------|---------|
| `pending → delivered` (saltando ready) | `422` transición inválida |
| `delivered → pending` (retroceder) | `422` transición inválida |
| `cancelled → ready` | `422` transición inválida |
| `delivered → cancelled` | `422` ya no se puede cancelar entregado |

---

## FASE C — Control de acceso por rol

### C1 · Cajero no puede crear catálogos

| | |
|--|--|
| **Acción** | Login cajero → `POST /api/v1/pre-sale-catalogs` |
| **Esperado** | `403 Forbidden`. |

### C2 · Cajero no puede publicar/cancelar catálogos

| | |
|--|--|
| **Acción** | Login cajero → `PATCH /api/v1/pre-sale-catalogs/{id}/status` |
| **Esperado** | `403 Forbidden`. |

### C3 · Cajero solo ve folios de su sucursal

| | |
|--|--|
| **Acción** | Cajero Centro (`store_id: 1`) → `GET /api/v1/pre-sale-orders?store_id=2` (Macroplaza) |
| **Esperado** | Response vacío `[]` o `403`. Cajero solo accede a datos de su tienda. |

### C4 · Admin ve folios de todas las sucursales

| | |
|--|--|
| **Acción** | Login admin → `GET /api/v1/pre-sale-orders` sin filtro |
| **Esperado** | Response incluye folios de Centro y Macroplaza. |

### C5 · Gerente puede marcar folios como ready

| | |
|--|--|
| **Acción** | Login gerente.centro → `PATCH /api/v1/pre-sale-orders/{id}/status` con `ready` (folio de su tienda) |
| **Esperado** | `200 OK`. Gerente tiene este permiso para su sucursal. |

---

## FASE D — Integridad de datos y casos borde

### D1 · Precio congelado al crear folio

| | |
|--|--|
| **Acción** | Crear folio con AirPods a $6,499. Admin cambia precio de AirPods a $7,500. |
| **API** | `GET /api/v1/pre-sale-orders/{folio_id}` |
| **Esperado** | `items[0].unit_price: 6499` — precio original congelado. Nuevos folios usarán $7,500. |

### D2 · Catálogo con folios activos no se puede cancelar (pendiente verificar)

| | |
|--|--|
| **Acción** | Admin intenta `PATCH /pre-sale-catalogs/{id}/status` con `cancelled` cuando hay folios `pending` asociados |
| **Esperado** | `422` "catalog has active orders" — O bien se permite cancelar el catálogo pero los folios existentes se mantienen. Documentar comportamiento real de negocio. |

### D3 · Folio único por cliente por catálogo (si aplica la regla)

| | |
|--|--|
| **Acción** | Mismo cliente intenta crear 2 folios del mismo catálogo |
| **Esperado** | Permitido (cada reserva es independiente) — O rechazado si la regla de negocio lo prohíbe. Documentar. |

---

## FASE E — Verificación de la pantalla de Reportes (ReportsPage)

### E1 · Dataset de prueba para reporte

Antes de abrir la pantalla de Reportes, generar los siguientes datos de ventas y preventas vía API o Caja:
- Al menos 3 ventas de productos regulares (efectivo, tarjeta, transferencia).
- Al menos 2 preventas (folios con anticipo/apartado parcial y deuda restante).
- Al menos 2 ventas de productos de tipo Manga Nacional (con `product_type: 'manga'`).

### E2 · Navegar a Reportes

| | |
|--|--|
| **Acción** | Login admin/gerente → `/reports` o pestaña de Reportes. |
| **Esperado** | La página carga. Se muestran las sub-pestañas: Ventas, Inventario, Top Productos, Top Clientes. Se activa polling dinámico cada 20s. |

### E3 · Verificar KPIs y Filtros Multiselección

Validar los siguientes aspectos en la sección de Ventas por Producto:
1.  **Filtros Multiselección**: Los botones toggles (`Todo`, `Efectivo`, `Dólar`, `Tarjeta`, `Transferencia`, `Cancelados`) se muestran centrados sobre la tabla. Al presionar uno, se añade al conjunto de filtros de manera aditiva; al presionar "Todo", se limpian los filtros aplicados.
2.  **KPIs Dinámicos**: Los 5 indicadores o resumen en la parte inferior se actualizan dinámicamente en base a los filtros activos y el rango de fechas seleccionado:
    *   **Venta Bruta Total** (Gross revenue).
    *   **Manga Nacional** (Ventas de tomos).
    *   **Comisión TPV** (Suma de comisiones absorbidas en tarjetas).
    *   **IVA s/Comisión (16%)** (IVA sobre las comisiones cobradas).
    *   **Neto Real** (Ingreso total real descontando comisión e IVA).

### E4 · Separación de Tomos (Manga Nacional)

| | |
|--|--|
| **Acción** | Observar la ordenación de las filas en la tabla principal de Ventas por Producto. |
| **Esperado** | Todos los productos normales/generales se muestran primero. Los artículos con `product_type === 'manga'` se desplazan al fondo de la tabla de forma automática, separados por un divisor gris de fondo completo con el texto "📚 Manga Nacional" y su respectivo subtotal de ventas y unidades. |

### E5 · Desglose por Producto (Filas Expandibles)

| | |
|--|--|
| **Acción** | Hacer clic en uno o más productos regulares y mangas para expandir el detalle. |
| **Esperado** | Se expande la fila mostrando: <br>1. Detalle por método de pago (con cálculo preciso de Comisión TPV, IVA de comisión al 16% y Neto Real coloreados para pagos de tarjeta). <br>2. Agrupación por precio unitario vendido con símbolos de $. <br>3. Desglose de preventas indicando de forma explícita el Apartado (Abonos) y la Deuda restante de cada folio. Permite múltiples filas expandidas a la vez. |

### E6 · Vista Ampliada (Modal Full-Screen)

| | |
|--|--|
| **Acción** | Presionar el botón "Ampliar" en la parte superior derecha de la tarjeta de la tabla. |
| **Esperado** | Se abre una ventana modal de pantalla completa con efecto backdrop blur. Muestra el mismo nivel de detalle, paginación, filtros y soporte de filas expandidas simultáneamente. Cierra correctamente con `Escape` o el botón `[X]`. |

### E7 · Exportación a Excel y PDF

| | |
|--|--|
| **Acción** | Presionar el botón "Exportar a Excel" y "Exportar a PDF". |
| **Esperado** | Se descargan los reportes correspondientes con formato uniforme vertical:<br>1. **Excel**: Logo insertado, cabeceras estructuradas, separación clara de Manga Nacional con divisor gris, filas de totales por sección con estilo contable, y fórmulas exactas de IVA sobre comisión (16%) y Comisión TPV.<br>2. **PDF**: Documento horizontal limpio con encabezado color rojo marca, columnas explícitas para Comisión TPV e IVA s/Comisión (16%), alineación correcta de cantidades y divisores grises legibles sin caracteres extraños ni emojis corruptos. |

---

## Criterios de aceptación

- [ ] `preorder_limit` se respeta; el intento N+1 falla con `422` sin crear el folio
- [ ] Cancelar folio libera slot para nueva reserva
- [ ] `customer_id` es obligatorio — rechaza sin él
- [ ] `items` no puede estar vacío ni tener cantidades ≤ 0
- [ ] Catálogos `draft` no son usables en folios
- [ ] Todas las transiciones inválidas de status fallan con `422`
- [ ] Cajero no puede crear/modificar catálogos (`403`)
- [ ] Cajero solo ve folios de su sucursal
- [ ] Admin ve todo
- [ ] Precio en folio es inmutable (congelado al crear)
- [ ] La pantalla de Reportes hace polling cada 20s y se enfoca en el tab activo
- [ ] Los toggles multiselección filtran con precisión de item en ventas, efectivo, dólares, tarjetas y preventas
- [ ] Las tarjetas de KPIs y el resumen inferior se recalculan al vuelo según los filtros
- [ ] La tabla de ventas separa limpiamente Manga Nacional al fondo con divisor gris y resumen dedicado
- [ ] La fila expandible detalla métodos de pago, Comisión TPV, IVA (16%), Neto Real, precios unitarios y abonos/deudas de preventa
- [ ] El modal full-screen replica fielmente la tabla principal con scroll independiente y cierre con Escape
- [ ] Los botones de Exportación generan hojas de ExcelJS y PDFs con jsPDF con idéntica estructura vertical, cálculos de comisiones, IVA (16%) y Neto Real, evitando emojis incompatibles en el PDF

---

## Orden de ejecución recomendado para el conjunto QA-01 + QA-02 + QA-03

1. **QA-02** — Establece sesión de caja base y el flujo operacional del cajero
2. **QA-01** — Usa caja abierta para ciclo completo admin→cajero→entrega
3. **QA-03** — Usa datos generados por los anteriores para reportes; hace pruebas "destructivas" (cancelaciones, límites) al final

> Ejecutar `php artisan migrate:fresh --seed` antes de cada corrida completa del conjunto para garantizar estado limpio.

---

## Riesgos conocidos

| Riesgo | Mitigación |
|--------|-----------|
| Endpoint `/reports/sales` puede no estar completamente implementado | Verificar qué expone `SalesPage` realmente y adaptar validaciones |
| Comportamiento de `reserved_count` post-cancelación puede variar | Documentar el comportamiento real en la primera ejecución |
| Pruebas de concurrencia (doble reserva simultánea) requieren herramientas adicionales | Marcar como prueba manual; cubrir con test de integración backend usando `lockForUpdate` |
