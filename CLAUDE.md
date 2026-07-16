# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

Un solo contenedor en **Cloud Run** (`us-central1`) sirve el API de Laravel **y** el frontend
ya buildeado. `deploy.sh` hace build + push + deploy; `docker/entrypoint.sh` corre
`php artisan migrate --force` al arrancar, así que **las migraciones se aplican solas a prod
en cada deploy**. DB de producción: MySQL en Cloud SQL (`pos-lite-db`).

## Convenciones

- **TypeScript estricto** en todo `landing/` y `packages/`. Inmutabilidad: crea objetos
  nuevos, no mutes.
- El texto de UI y los docs del proyecto están **en español** (México) — respeta ese idioma
  al agregar copy o comentarios de dominio.
- `MASTERLOG.md` en la raíz registra el historial de deploys/revisiones; los commits `feat`/`fix`
  del POS suelen apuntar a una rev (`tadaima-XXXXX-xxx`).
