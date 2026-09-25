# Tadaima POS — Guía para agentes de IA

> **Empieza aquí.** Este archivo es lo primero que debe leer cualquier IA (Claude,
> Codex, Cursor, Copilot, Gemini…) o persona nueva que baje el repo. Dice qué es el
> sistema, cómo está hoy en producción y las reglas internas que no se pueden romper.
>
> Si algo de aquí contradice al código, **manda el código** (y actualiza este archivo).
> Detalle adicional: [`CLAUDE.md`](CLAUDE.md) (comandos y arquitectura del frontend) y
> [`backend/AGENTS.md`](backend/AGENTS.md) (API, ADRs y referencia de endpoints).
>
> Última revisión: 2026-09-25.

---

## 1. Qué es

**Tadaima POS** es el punto de venta de **Tadaima**, una empresa con varias tiendas
(Tijuana) que vende manga/tomos, figuras, TCG, electrónica y accesorios. Es **una
empresa con varias sucursales**: cada tienda tiene su inventario, sus cajas y su
personal, y un gerente/cajero solo ve lo de su tienda.

- **Núcleo del negocio: preventas.** El cliente aparta un producto que aún no llega
  (catálogo de proveedor), deja un anticipo y liquida al recogerlo.
- Además: caja y cortes por persona, ventas, apartados (layaways), traslados entre
  tiendas, inventario por bodega, promociones/descuentos, clientes y socios, reportes
  (Excel/PDF) y permisos por rol (admin / gerente / cajero).
- **Está en producción con datos reales del cliente.** Las tiendas cobran con este
  sistema todos los días.

---

## 2. Mapa del repositorio

| Ruta | Qué es |
|------|--------|
| `landing/` | **La app del POS** (React 19 + Vite + TypeScript, PWA). El nombre "landing" es histórico. |
| `backend/` | API REST (Laravel 13 + PHP 8.3). Fuera de los workspaces de npm. Rutas: `backend/routes/api.php`. |
| `packages/*` | Código TS compartido por `landing/`: `api` (cliente HTTP por dominio), `auth`, `permissions`, `hooks`, `utils`. |
| `tadaimaus/` | Tienda en línea de EE. UU. (`tadaimausa.com`), SPA estática con su propio Dockerfile. Consume `/api/v1/us/*` del mismo backend. |
| `apps/` | Vacío (placeholder). |
| `docs/` | Planes, QA y handoffs históricos. Útiles como contexto, no como verdad actual. |
| `MASTERLOG.md` | Bitácora de cada sesión y deploy (revisión de Cloud Run, qué cambió, rollback). |
| `BUGS_PENDING.md` | Bugs reportados aún sin arreglar. |
| `.mcp.json` | Servidores MCP del proyecto: `tadaima-catalog`, `tadaima-docs`, `supabase`. |

**La app móvil NO vive aquí.** Es el repo aparte `joeldorado/tadaima-app-pos` (Expo /
React Native). En este repo la carpeta `pos-app/` está en `.gitignore`.

---

## 3. Producción hoy

| Pieza | Dónde |
|-------|-------|
| POS + API | **`https://tadaimamexico.com`** (API en `/api/v1`). Cloud Run `tadaima`, proyecto GCP `tadaimapos`, región **us-east1**. Un solo contenedor (nginx + php-fpm) sirve la SPA y el API. |
| Base de datos | **PostgreSQL en Supabase** (us-east-1), por el *session pooler* puerto 5432. MySQL / Cloud SQL ya no existe. |
| Archivos (imágenes) | Google Cloud Storage. |
| Tienda EE. UU. | `https://tadaimausa.com` → Cloud Run `tadaimaus`, proyecto GCP `tadaimaus`, us-central1 (solo estáticos). También montada en `tadaimamexico.com/tadaimaus/`. |
| App móvil | Repo aparte; habla con `https://tadaimamexico.com`. |
| Socios / lealtad | **Otro** proyecto de Supabase, de **solo lectura** desde el POS. |
| Impresión de tickets | QZ Tray instalado en cada caja Windows (impresora térmica de 58 mm). |
| Tareas programadas | **No hay.** Cloud Run solo levanta nginx + php-fpm; el `Schedule` de `routes/console.php` nunca corre en prod. |

**Muertos, no usar:** `tadaima.poslite.com.mx` y cualquier `tadaima-*.us-central1.run.app`.

---

## 4. Reglas de oro (operación)

1. **Prod tiene datos reales del cliente.** Nunca crear ventas, cajas ni datos de
   prueba en prod. Nunca `TRUNCATE`, `migrate:fresh` ni borrados masivos sin respaldo
   previo y sin el OK de Joel. Las pruebas van en local.
2. **Las migraciones se aplican solas a prod en cada deploy** (`docker/entrypoint.sh`
   corre `php artisan migrate --force`). Una migración que llega a `main` corre en prod
   en el siguiente deploy: tiene que ser aditiva, idempotente y compatible con
   PostgreSQL.
3. **La suite SQLite no ve todo.** Para cambios de SQL corre también la suite en un
   Postgres local (`phpunit.pgsql.xml`, ver §6). En Postgres las búsquedas usan
   `whereLike(..., caseSensitive: false)`, no `LIKE` a secas.
4. **El repo es PÚBLICO.** Nunca subir contraseñas, llaves, `.env`, dumps ni
   certificados. Los secretos viven en Secret Manager / variables de Cloud Run. Si
   necesitas una credencial, pídesela a Joel.
5. **Usa siempre el dominio `https://tadaimamexico.com`**, nunca una URL `*.run.app`:
   cambia cuando el servicio se recrea o cambia de región. (Así se cayeron la tienda
   de EE. UU. y la app móvil al mudar la región en agosto de 2026.)
6. **Supabase de socios: solo lectura.** No escribir, no migrar, no sumar puntos desde
   el POS sin aprobación explícita.
7. **Ramas:** `main` = producción, se deploya de ahí. Ruben trabaja en `develop` y
   entra a `main` por PR. Prefiere fast-forward; si las ramas divergieron, detente y
   avisa en vez de forzar.
8. **Type-check rojo es normal.** `landing` arrastra ~450 errores preexistentes de
   `exactOptionalPropertyTypes`. Para detectar regresiones compara contra la lista de
   errores de la rama base, no contra el exit code. El build de prod no corre `tsc`.
9. **Caché PWA.** Tras un deploy los usuarios pueden seguir viendo el bundle viejo:
   para QA usa ventana de incógnito o recarga forzada.
10. **Idioma:** UI, docs, comentarios de dominio y commits en español de México.
11. **Cada deploy se registra en `MASTERLOG.md`** (revisión, qué entró, rollback).

---

## 5. Reglas de negocio (no romper)

### Dinero y cobro
- **La comisión de la terminal NUNCA se cobra al cliente**; la tienda la absorbe. Sí se
  guarda por venta (terminal, % y monto) para reportes. El Reporte del Día le suma IVA
  16% a esa comisión (`SalesPage.tsx`).
- **El servidor recalcula todo.** `backend/app/Services/SaleCalculator.php` (gemelo de
  `landing/src/lib/saleCalc.ts`) y `CheckoutService` validan cada precio (±$0.01) contra
  los niveles del catálogo. Nunca confíes en montos que manda el cliente.
- **Promos NxM primero, descuento manual después** (stacking). El detalle por línea
  vive en `sale_items` (ver "Descuentos y Promos" en `CLAUDE.md`).
- **Precio socio:** a un socio Tadaima activo se le aplica el nivel de precio "b"
  automáticamente, excepto si paga con tarjeta o es preventa.
- **Pagos:** `sales` no tiene método de pago; viven en `payments` (1:N) y deben sumar
  el total (±$0.01). "Mixto" = solo efectivo + transferencia, solo ventas regulares,
  sin dólares.
- **Dólares:** los USD recibidos se quedan íntegros en el cajón y el cambio siempre es
  en pesos; el corte separa esperado en pesos y en dólares.

### Caja y cortes
- **Una caja por persona** (ADR-017): cada usuario abre y cierra su propio turno.
- **Día de negocio = `America/Tijuana`** (`backend/app/Support/DateRange.php`).
- No se puede vender sobre una caja de un día anterior con 12 h o más abierta
  (`CASH_SESSION_STALE`); cerrar sesión con caja abierta obliga a hacer el corte.
- **El esperado del corte lo calcula solo el backend** (`GET /reports/cash`); ninguna
  pantalla lo recalcula. Cuenta pagos de ventas `completed` **y** `returned`: la
  cancelación ya resta el dinero una vez con un movimiento de salida. No lo cambies a
  "solo completed" (restaría doble).
- La cancelación prorratea la salida de caja solo a la porción en efectivo.

### Productos e inventario
- **Dos almacenes por tienda:** Exhibición (`warehouses.type='store'`, lo único que se
  vende en Caja) y Bodega (no vendible). Las entradas y devoluciones caen en
  Exhibición.
- **Categorías múltiples:** escribe siempre con `Product::syncCategories()`.
  `products.category_id` es solo una caché de compatibilidad.
- **Regla TOMO** (qué es un tomo de manga): un solo lugar,
  `backend/app/Support/TomoRule.php`.
- **Borrar un producto no borra sus ventas:** usa
  `ProductController::snapshotAndDelete()`. `sale_items` congela nombre, SKU y costo
  al cobrar (ADR-015); solo los apartados bloquean el borrado.

### Preventas
- Catálogo de proveedor → folios con anticipo → liquidación al recoger.
- Límites: tope global (`preorder_limit`), por tienda y **por cliente**
  (`limit_per_customer`; identifica a la persona por id, teléfono o tarjeta de socio).
- No se entrega/liquida una partida sin **costo real** capturado.
- Las preventas no tocan el stock de Exhibición/Bodega.

### Permisos
- Roles: admin, gerente, cajero (`User::ADMIN_ROLES` incluye variantes de dueño).
- **Aislamiento por tienda en el backend.** Todo endpoint que reciba `store_id`,
  `warehouse_id` o `session_id` usa `storeScopeError()` / `User::canActOnStore()` y lleva
  un test de rol cruzado (gerente de la tienda A → 403 en la tienda B). La configuración
  de tiendas, bodegas y terminales es solo admin (`adminOnlyError()`). Clientes,
  categorías y proveedores son globales a propósito.
- **Costos y utilidad** solo para admin o usuarios con `can_view_cost`. El gerente NO
  lo tiene por default y no se enciende solo por rol. Gatea en Resources **y** en UI.
- Un gerente gestiona usuarios solo de su tienda y nunca crea ni promueve admins.
- El admin puede consultar contraseñas de otros usuarios (`password_enc`, copia
  cifrada). Nunca exponerla a otro rol.

### Impresión de tickets
- Un solo decisor: `dispatchTicket()` en `landing/src/lib/ticketPrint.ts`. Con QZ
  configurado imprime en silencio; si no, abre la ventana de impresión. Sin configurar
  debe comportarse igual que siempre. Un `print-timeout` no reintenta por ventana
  (evita tickets dobles).
- El ticket se arma en **tres lugares**: venta nueva (`SellPage`), reimpresión
  (`SalesPage`) y corte (`CashCloseSummaryModal`). Cambios de formato van en los tres.
- En térmica solo imprime el **negro puro** (`#000`); los grises salen lavados.
- La firma de QZ (`landing/src/lib/qz.ts`) usa una fábrica estilo `(resolve, reject)`;
  no devuelvas una Promise desde una arrow normal (así estuvo roto un mes sin que nadie lo notara).

### Frontend
- **Carrito client-authoritative** (zustand + localStorage): se manda completo al
  cobrar. El checkout escribe optimista en el caché (`lib/optimisticSale.ts`). Sin Redux.
- Estado de servidor en TanStack Query, persistido en IndexedDB (soporte offline).
- La lógica de negocio pura va en `landing/src/lib/` con su test al lado.

---

## 6. Cómo trabajar

**Comandos:** ver [`CLAUDE.md`](CLAUDE.md). Lo mínimo antes de subir cambios:

```bash
cd backend && php artisan test                       # suite SQLite en memoria, no toca prod
cd backend && vendor/bin/phpunit -c phpunit.pgsql.xml  # si tocaste SQL: Postgres 17 LOCAL
cd landing && npm run test                           # vitest
```

⚠️ Nunca apuntes una suite de tests a Supabase ni a ninguna base real: `RefreshDatabase`
hace `migrate:fresh` y la vacía.

**Deploy (Cloud Run, sin Docker local).** Siempre desde la **raíz** del repo y con
`--project` explícito (en la máquina de Joel hay cuentas de otros clientes):

```bash
gcloud run deploy tadaima --source . --project tadaimapos --region us-east1 --no-traffic --tag candidate
```

Prueba la URL `candidate---…` que imprime gcloud (login, Caja, `/tadaimaus/`) y
luego promueve:

```bash
gcloud run services update-traffic tadaima --to-latest --project tadaimapos --region us-east1
```

- Sin `--no-traffic` la revisión nueva queda viva al 100% de inmediato.
- No pases `--set-env-vars` ni `--set-secrets`: sin esos flags se conservan los de la
  revisión actual.
- Si el log dice "Building using Buildpacks" en vez de "Dockerfile", estás en la
  carpeta equivocada.
- Rollback: `gcloud run services update-traffic tadaima --to-revisions <revisión-anterior>=100 --project tadaimapos --region us-east1`.
- `deploy.sh` está obsoleto (apunta al proyecto viejo): no lo uses.
- Tienda EE. UU.: `(cd tadaimaus && gcloud run deploy tadaimaus --source . --project tadaimaus --region us-central1)`.

---

## 7. Dónde leer más

| Tema | Archivo |
|------|---------|
| Comandos, arquitectura del frontend, modelo de descuentos | `CLAUDE.md` |
| API: convenciones, ADRs, endpoints | `backend/AGENTS.md` |
| Historial de deploys y decisiones | `MASTERLOG.md` |
| Bugs abiertos | `BUGS_PENDING.md` |
| Guías de uso para el equipo (in-app) | `landing/src/content/docs/` |
