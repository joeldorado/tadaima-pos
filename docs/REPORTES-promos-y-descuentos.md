# Promos y descuentos: qué hay guardado y cómo leerlo (para reportes)

> Para Ruben — 2026-07-20. Todo lo de aquí está **en producción** (rev `tadaima-00140-29m`).
> Escrito leyendo el código, no de memoria; cada afirmación trae su archivo y línea.

---

## 1. Qué bajar

```bash
git fetch origin
git checkout main
git pull
```

**Todo lo nuevo se mergea a `main` con el PR #3.** Si el PR todavía no está mergeado cuando
leas esto, baja la rama directo:

```bash
git checkout feat/productos-sin-costo-y-ticket-bold
```

Las dos apuntan al mismo contenido una vez mergeado el PR. La rama `develop` está en el
mismo commit (espejo). **`dev/qa-handoff` está 87 commits atrás — no la uses.**

Para levantar local: [`docs/LOCAL_DEV_SETUP.md`](LOCAL_DEV_SETUP.md).

---

## 2. La idea en una frase

**Todo el detalle de descuentos y promos vive POR LÍNEA en `sale_items`.**
No infieras nada del total de la venta: léelo de las columnas.

---

## 3. Las columnas de `sale_items`

Migraciones: `2026_07_14_000001_add_line_benefit_columns_to_sale_items.php` y
`2026_07_20_000002_add_promo_amount_to_sale_items.php`. Modelo: `app/Models/SaleItem.php`.

| Columna | Tipo | Qué es |
|---|---|---|
| `total` | decimal(12,2) | **BRUTO** = `price × quantity`. **NO baja con los descuentos.** |
| `discount_amount` | decimal(12,2), default 0 | **Beneficio TOTAL de la línea (promo + descuento manual).** El neto real es `total − discount_amount`. |
| `promo_amount` | decimal(10,2) null | La parte que puso la **promo**. NULL en ventas anteriores al 2026-07-20 (ver §6). |
| `benefit_type` | enum null | `'promo'`, `'discount'` o NULL. **Ojo con esto — ver §5.** |
| `applied_promotion_id` | bigint null | ID de la promo que aplicó. **Sin FK** (columna suelta) y **no se expone en el API**. |
| `promo_name` | string(100) null | Nombre de la promo, congelado al momento de la venta. Sobrevive aunque la promo se edite o se borre. |
| `promo_free_qty` | int null | Piezas gratis. Solo aplica a NxM; en mayoreo siempre es **0**. |
| `discount_kind` | enum null | Descuento manual: `fixed` o `percent`. |
| `discount_basis` | enum null | Descuento manual: `unit` o `line`. |
| `discount_value` | decimal(12,2) null | Lo que tecleó el cajero ($ o %). |
| `discount_reason` | string(40) null | `danado`, `caducidad`, `exhibicion`, `cortesia`, `otro`. |
| `discount_note` | string(255) null | Nota libre. |
| `discount_authorized_by` | FK users null | Quién autorizó. **No se expone en el API.** |
| `cost` | decimal(12,2) null | Costo congelado (ADR-015). NULL en ventas viejas — **no uses `products.cost` como fallback en agregados.** |

**Separar promo de descuento manual:**

```
parte_promo  = promo_amount
parte_manual = discount_amount − promo_amount
```

---

## 4. Los rollups de la venta

En `sales`: `sales.discount = Σ discount_amount` de sus líneas, y se mantiene
`sales.total = sales.subtotal − sales.discount`.

Esa igualdad vale para ventas viejas y nuevas, así que los totales siempre cuadran.

**Cancelaciones (ADR-016):** `cancelled_amount` en el JSON es **simbólico para la UI**. La venta
se edita in-place, o sea que `sales.total` **ya** trae descontada la cancelación. Si lo restas
otra vez en un agregado, lo cuentas doble. Está comentado en `SaleResource.php:35-38`.

Y ojo: **`cancelled_items` no trae ningún campo de descuento ni promo.**

---

## 5. Cuatro trampas que te van a morder

### 5.1 `benefit_type = 'promo'` NO sirve para contar promociones

Desde el stacking (2026-07-17), la promo aplica primero y el descuento manual se calcula sobre
el resultado. Cuando conviven, **`benefit_type` queda en `'discount'`** aunque la promo sí haya
aplicado y los campos `promo_*` estén llenos (`SaleCalculator.php:137-141`).

```sql
-- MAL: se pierden las líneas que además llevaban descuento manual
WHERE benefit_type = 'promo'

-- BIEN
WHERE applied_promotion_id IS NOT NULL     -- o: promo_amount > 0
```

### 5.2 `qty_discount` ya NO significa lo que su nombre dice

El slug se conservó a propósito, pero **la matemática cambió** el 2026-07-23:

| | Antes (`tiers`) | Ahora (`min_qty` + `discount_per_unit`) |
|---|---|---|
| Regla | −$X por cada **grupo** de N | Desde N piezas, −$X a **CADA UNA** |
| 5 pzas con (2, $100) | −$200 | −$500 |

En la UI se llama **"Mayoreo"**. La columna `tiers` quedó **obsoleta**: no está en `$fillable`,
ya no se escribe y no viaja en el API (`ProductPromotion.php:40-42`). Es solo rastro histórico.

### 5.3 El costo está gateado por permiso

`SaleItemResource.php:14` — `cost` viaja como `null` si el usuario no es admin ni tiene
`can_view_cost`. Los gerentes **no** lo traen por default desde 2026-06-24. Si tu reporte
calcula utilidad, tiene que respetar ese gate (ya lo hace `ReportsPage.tsx`).

### 5.4 Dos campos existen en la DB pero no salen por el API

`applied_promotion_id` y `discount_authorized_by` **no están en `SaleItemResource`**. Si los
necesitas, hay que exponerlos — dime y lo agrego, es una línea.

---

## 6. Ventas viejas (legacy)

Hay dos cortes de fecha:

| Si la venta es anterior a… | Qué pasa | Qué hacer |
|---|---|---|
| **2026-07-14** (Descuentos v2) | Puede traer `sales.discount > 0` con `discount_amount = 0` en todas sus líneas | Prorratear por línea: `total / subtotal`. Así lo hace `ReportsPage.tsx` hoy |
| **2026-07-20** (`promo_amount`) | `promo_amount` es NULL aunque haya promo | Fallback: `promo_free_qty × price` |

---

## 7. Endpoints que ya existen

**El único que expone el detalle por línea es `GET /sales`** (vía `SaleItemResource`).
Parámetros: `from`, `to`, `user_id`, `status`, `store_id`, `per_page` (default 25, **máx 100**).

Usa `DateRange::fromUtc()/toUtc()`, o sea que **convierte hora local MX → UTC correctamente**.

Los de `/reports/*`:

| Endpoint | Params | Descuentos |
|---|---|---|
| `GET /reports/sales` | `from`, `to`, `store_id`, `user_id` | `summary.total_discount` = `SUM(sales.discount)`. Agregado, **sin separar promo de manual** |
| `GET /reports/top-products` | `from`, `to`, `store_id`, `limit` (máx 100) | Prorratea con un factor a nivel VENTA. **No usa `sale_items.discount_amount`** aunque ya existe |
| `GET /reports/inventory` · `/cash` · `/customers` · `/pre-sales` · `/supplies` | varios | sin descuentos |

⚠️ **Los `/reports/*` filtran fecha con `whereDate('sold_at')` en UTC crudo, sin conversión de
zona horaria** — a diferencia de `GET /sales`. En Tijuana eso corre el corte del día unas horas.
Si vas a comparar cifras entre `/sales` y `/reports/sales`, es la primera sospecha.

**RBAC:** `scopedStoreId()` (`ReportsController.php:21-29`) — admin filtra libre; gerente y
cajero quedan anclados a su tienda (el `store_id` del request se ignora). Sin tienda asignada
devuelve `-1`, o sea cero filas (fail-closed).

---

## 8. Lo que NO existe todavía

**No hay ningún endpoint de promociones agregadas ni de ventas filtradas por promo.**
Lo único que hay bajo `/products/{id}/promotions` es el CRUD de configuración, sin query params.

O sea: los datos están todos en `sale_items`, pero el agregado hay que construirlo. Si quieres
un `/reports/promotions`, dime qué columnas necesitas y lo armo del lado backend para que tú
solo lo consumas.

---

## 9. La tabla `product_promotions` (config, no ventas)

| Columna | Qué es |
|---|---|
| `type` | `'nxm'` o `'qty_discount'` (= mayoreo, §5.2) |
| `buy_n` / `pay_m` | Solo NxM (2x1, 3x2…) |
| `min_qty` / `discount_per_unit` | Solo mayoreo |
| `allow_cash` / `allow_card` | Restricción de método de pago. Si la promo aplicó y el método no está permitido, **el cobro se bloquea** |
| `store_id` | **NULL = todas las tiendas**; con valor = solo esa sucursal |
| `status` | `active` / `paused` / `expired` (expira lazy, sin cron) |
| `starts_at` / `ends_at` | Ancladas al día-negocio America/Tijuana |
| `priority` | Desempate cuando dos promos ahorran igual |
| `tiers` | **OBSOLETA** (§5.2) |

**Override local:** si un producto tiene promo local vigente, la global queda apagada en esa
tienda — aunque la local ahorre menos. Y si la local no alcanza por cantidad, la global **no
revive** (`SaleCalculator.php:66-86`).

**`skip_promotion`:** el cajero puede renunciar a la promo a propósito (es la salida cuando la
promo restringe el método de pago). En esas líneas **no se guarda ningún campo `promo_*`**, así
que son indistinguibles de "no había promo". No hay columna que lo registre.

---

## 10. Reglas de la casa

- **El servidor SIEMPRE recalcula.** Nunca confíes en montos que mande el cliente.
  `SaleCalculator.php` (PHP) y `landing/src/lib/saleCalc.ts` (TS) son **gemelos**: si tocas uno,
  toca el otro o los totales dejan de cuadrar y el checkout devuelve 422.
- `landing/src/lib/promo.ts` está **congelado** — solo sirve para renderizar tickets históricos.
- Antes de tocar PHP, lee [`backend/AGENTS.md`](../backend/AGENTS.md).
- Corre los tests antes de subir: `cd backend && php artisan test` (335) ·
  `cd landing && npx vitest run` (114).
- El `type-check` del repo arrastra **~470 errores pre-existentes**. Eso es normal, no es tu
  cambio; solo verifica que el número no suba.

---

## 11. Pendiente tuyo que sigue abierto

[`docs/PENDIENTE-reportes-efectivo-disponible.md`](PENDIENTE-reportes-efectivo-disponible.md) —
la tarjeta de "efectivo disponible − insumos". Sigue esperando una decisión de negocio de Joel.

---

**¿Dudas?** Pregúntale a Joel y él me pasa el recado; si necesitas que exponga
`applied_promotion_id` en el API o que arme un `/reports/promotions`, se hace rápido.
