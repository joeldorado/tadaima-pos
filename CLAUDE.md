# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Estado de producción y reglas internas del proyecto (léelo primero):

@AGENTS.md

## Qué es esto

**Tadaima POS** — sistema de punto de venta multi-sucursal (electrónica, accesorios,
librería/mangas). El núcleo del negocio son las **preventas** (pre-órdenes con anticipo →
liquidación al recoger). Otras capacidades: caja/cortes por usuario, ventas, apartados
(layaways), traslados entre tiendas, inventario por bodega, reportes y RBAC
(admin / gerente / cajero).

## Estructura del repositorio (dos apps, un repo)

Este repo contiene **dos aplicaciones independientes** que se despliegan juntas en un solo
contenedor de Cloud Run:

| Ruta | Qué es | Toolchain |
|------|--------|-----------|
| `landing/` (`@tadaima/web`) | Frontend PWA — la app real del POS | React 19 + Vite 8 + TypeScript |
| `backend/` | API REST | Laravel 13 + PHP 8.3 (**fuera** de los npm workspaces) |
| `packages/*` | Código compartido consumido por `landing/` | TypeScript |
| `apps/*` | Placeholder de la app móvil (vacío, solo `.gitkeep`) | — |

> **El backend tiene su propia documentación.** Antes de tocar PHP/Laravel, lee
> `backend/AGENTS.md` — es la fuente de verdad de endpoints, RBAC, envelopes JSON y deploy.
> La fuente de verdad de las rutas siempre es `backend/routes/api.php`.

El nombre "landing" es histórico: hoy `landing/` **es la aplicación POS completa**, no una
landing page.

## Comandos

Desde la **raíz** (Turborepo orquesta los workspaces JS/TS; `backend/` no está incluido):

```bash
npm run dev:web       # levanta el frontend (turbo → vite en :5173)
npm run build:web     # build de producción del frontend
npm run lint          # eslint en todos los workspaces
npm run type-check    # tsc --noEmit en todos los workspaces
```

Frontend (`cd landing`):

```bash
npm run dev           # vite dev server → http://localhost:5173
npm run test          # vitest run (unit tests, p.ej. src/lib/*.test.ts)
npm run test:watch    # vitest en watch
npm run build         # tsc -b && vite build
npm run type-check    # tsc --noEmit -p tsconfig.app.json
npx vitest run src/lib/promo.test.ts     # correr UN archivo de test
npx vitest run -t "nombre del test"       # correr por nombre
```

E2E (raíz — Playwright ya con Chromium instalado):

```bash
npx playwright test                        # toda la suite (necesita el front en :5173)
npx playwright test tests/e2e/tadaima.spec.ts   # un solo spec
```

Backend (`cd backend` — ver `backend/AGENTS.md` para el detalle):

```bash
php artisan serve                    # http://localhost:8000
php artisan migrate --seed           # esquema + datos base
php artisan test                     # suite PHPUnit (SQLite en memoria, no toca prod)
php artisan test --filter QABugFixesTest
composer dev                         # server + queue + logs + vite en paralelo
```

## Arquitectura del frontend

**Capa de API — `packages/api/src/`.** Un módulo por dominio de negocio (`sales.ts`,
`cash.ts`, `inventory.ts`, `preSaleOrders.ts`, `layaways.ts`, `transfers.ts`, `reports.ts`,
`customers.ts`, etc.), todos tipados y exportados desde `index.ts`. Toda llamada HTTP pasa
por `client.ts`:

- **Base URL** se resuelve en `resolveBaseUrl()`: usa `VITE_API_URL` (dev:
  `http://127.0.0.1:8000`); en prod cae a `window.location.origin/api/v1`. Todo cuelga de
  `/api/v1`.
- **Auth Sanctum:** el token se inyecta vía `setTokenGetter()`; un interceptor de 401 llama
  `setOnUnauthorized()`. Ambos los registra `AuthProvider` al montar
  (`packages/auth/AuthContext.tsx`). No hardcodees tokens ni leas storage directamente desde
  los módulos de API.
- **Envelopes del backend:** éxito `{ success, data, message }`, error
  `{ success:false, error, errors }`. `extractErrorMessage()` normaliza los mensajes.

**Estado.** Separa por tipo (no dupliques estado de servidor en stores de cliente):

- Estado de servidor → **TanStack Query** (`landing/src/lib/queryClient.ts`,
  `queryKeys.ts`). Persistido a IndexedDB (`idb-keyval`) para soporte **offline / PWA**.
- Estado de cliente → **zustand** (`landing/src/stores/cartDraftStore.ts`). El carrito es
  **client-authoritative**: vive completo en el cliente y se manda entero al cobrar.

**Routing y RBAC — `landing/src/router/index.tsx`.** `react-router-dom` v7. Rutas públicas:
`/login`, `/catalogo/:catalogUrl`, `/tienda-online/:catalogUrl`. El resto va bajo
`<ProtectedRoute>`, y cada página se gatea por permiso con `requiresPage="..."`
(`sales`, `reports`, `admin`, …). La lógica de permisos vive en `landing/src/lib/permisos.ts`
y `packages/permissions/`.

**UI.** Radix UI primitives + Tailwind v4 (`@tailwindcss/vite`), combinados con
`class-variance-authority` + `tailwind-merge`. Íconos `lucide-react`, toasts `sonner`,
gráficas `recharts`, animación `motion`. PDFs/Excel con `jspdf` / `exceljs`.

**Lógica de negocio pura en `landing/src/lib/`** (con tests unitarios al lado): `promo.ts`
(descuentos/promos), `paymentSummary.ts`, `optimisticSale.ts`, `priceLevels.ts`,
`validation.ts`, `catalogWhatsApp.ts`, `barcode.ts`. Prefiere agregar reglas aquí (testeables
en aislamiento) antes que dentro de componentes.

## Deploy

Un solo contenedor en **Cloud Run** (`us-east1` — junto a Supabase desde 2026-08-31; antes us-central1) sirve el API de Laravel **y** el frontend
ya buildeado. Se deploya con `gcloud run deploy --source .` desde la raíz (`deploy.sh` está
obsoleto; el comando y el flujo están en `AGENTS.md` §6); `docker/entrypoint.sh` corre
`php artisan migrate --force` al arrancar, así que **las migraciones se aplican solas a prod
en cada deploy**. DB de producción: PostgreSQL en Supabase (MySQL/Cloud SQL ya no existe).

## Descuentos, Promos y Aumentos — modelo de datos para reportes (Descuentos v2)

> Para quien arme reportes/exportes (Ruben): TODO el detalle de beneficios vive
> POR LÍNEA en `sale_items`. No infieras descuentos del total — léelos de aquí.

**Columnas de `sale_items` (beneficios por línea):**

| Columna | Qué es |
|---|---|
| `total` | **BRUTO** de la línea (`price × quantity`) — NO baja con descuentos ni sube con aumentos |
| `discount_amount` | Beneficio TOTAL de la línea (promo + descuento manual), siempre ≥ 0 |
| `surcharge_amount` | **Aumento de precio** de la línea (desde 2026-09-29), ≥ 0. **Neto real de la línea = `total − discount_amount + surcharge_amount`** |
| `benefit_type` | `promo` (solo promo) · `discount` (manual, con o sin promo debajo) · null |
| `discount_kind/basis/value` | Captura del descuento manual (`fixed/percent`, `unit/line`, valor) |
| `discount_reason` / `discount_note` | Motivo (`danado, caducidad, exhibicion, cortesia, otro`) + nota |
| `discount_authorized_by` | User que autorizó el descuento manual |
| `applied_promotion_id`, `promo_name`, `promo_free_qty`, `promo_amount` | Snapshot de la promo aplicada (sobrevive aunque la promo se edite/borre); `promo_amount` = monto de la promo en la línea |
| `surcharge_kind/basis/value` | Captura del aumento (`fixed/percent`, `unit/line`, valor) |
| `surcharge_reason` / `surcharge_note` | Motivo (`precio_especial, escasez, envio, otro`) + nota |
| `surcharge_authorized_by` | User que cobró el aumento |
| `comment` | Comentario corto del cajero en la línea (desde 2026-10-03, máx. 80 caracteres), puesto desde el menú ⋮ de Caja. Recordatorio interno: se ve junto al nombre en Caja y Ventas; **no** toca montos ni se imprime en el ticket. NULL en ventas anteriores |

**Regla de STACKING (desde 2026-07-17):** la promo NxM aplica PRIMERO y el descuento
manual se calcula sobre el resultado. Cuando conviven, `benefit_type='discount'` pero
los campos `promo_*` quedan poblados. Para separar las partes:
`parte_promo = promo_amount` (ventas viejas sin `promo_amount`: `promo_free_qty × price`) ·
`parte_manual = discount_amount − parte_promo`.

**Aumento (desde 2026-09-29):** una línea lleva descuento manual O aumento, nunca los
dos. El aumento se calcula después de la promo (el % sobre el neto-promo) y el precio
unitario (`price`) sigue siendo el de catálogo. El ticket del cliente imprime el precio
final (con el aumento incluido); el detalle queda en `surcharge_*`.

**Promo vs nivel de precio (desde 2026-09-30):** promo y precio socio (u otro nivel
más bajo) NO se suman. Si la línea cae en una promo aplicada, se re-precia completa a
NORMAL (nivel 1) y la promo se calcula sobre ese precio; `sale_items.price` guarda el
precio efectivo (p. ej. $1,100 aunque la línea estuviera en SOCIO $980).

**Rollups:** `sales.discount = Σ discount_amount`, `sales.surcharge = Σ surcharge_amount`
y `sales.total = sales.subtotal − sales.discount + sales.surcharge`. Ventas ANTERIORES a Descuentos v2
(legacy) pueden traer `sales.discount > 0` con `discount_amount = 0` en todas las
líneas → para esas, prorratear `total/subtotal` (así lo hace ReportsPage).

**Cancelaciones (desde 2026-09-29):** se devuelve lo COBRADO, no el bruto:
`amount_refunded = total antes − total después`. Al cancelar parte de una línea se
prorratean por cantidad `total`, `discount_amount`, `surcharge_amount` y `promo_amount`
del renglón que queda (y los rollups de `sales`). En `sale_cancellations.items_snapshot`,
`line_total` = lo devuelto por la línea, con el desglose `gross_total`,
`discount_cancelled` y `surcharge_cancelled`.

**Promos (`product_promotions`):** NxM por producto (`buy_n`/`pay_m`), `status`
(`active/paused/expired`), vigencia `starts_at/ends_at` (ancladas a día-negocio
America/Tijuana), `priority` (desempate cuando 2 promos ahorran igual) y `store_id`
(**null = todas las tiendas**; con valor = solo esa sucursal — el motor solo aplica
promos de la tienda de la venta). El server SIEMPRE recomputa
(`app/Services/SaleCalculator.php`, gemelo de `landing/src/lib/saleCalc.ts`) — nunca
confíes en montos del cliente.

## Convenciones

- **TypeScript estricto** en todo `landing/` y `packages/`. Inmutabilidad: crea objetos
  nuevos, no mutes.
- El texto de UI y los docs del proyecto están **en español** (México) — respeta ese idioma
  al agregar copy o comentarios de dominio.
- `MASTERLOG.md` en la raíz registra el historial de deploys/revisiones; los commits `feat`/`fix`
  del POS suelen apuntar a una rev (`tadaima-XXXXX-xxx`).
