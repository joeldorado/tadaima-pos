# MASTERLOG — Tadaima POS

> Registro maestro del proyecto: arquitectura, evolución, decisiones clave y estado actual.
> Actualizado: 2026-06-03 (**DESPLEGADO rev `tadaima-00066-szd`** — **backfill de bodegas + docs backend**: (1) **Tiendas legacy sin warehouse** — las 2 tiendas creadas por UI ANTES del fix 00065 quedaron sin su almacén `type='store'` (el auto-create solo aplica a tiendas nuevas) → seguían invisibles en alta de producto pese al deploy. Migración idempotente `2026_06_03_000001_backfill_missing_store_warehouses` crea la bodega faltante a toda tienda sin ella; corre sola en el arranque (entrypoint `migrate --force`). Verificado en logs de prod: migración DONE. Test `test_backfill_migration_creates_warehouse_for_legacy_stores` (creación + idempotencia). (2) **Docs para la IA del hermano**: `backend/AGENTS.md` (entrada: de qué trata el proyecto, stack, ADRs, cómo correr/test/deploy, **referencia completa de los ~110 endpoints** agrupados por dominio) + `backend/CLAUDE.md` → `@AGENTS.md`.) Previa rev `tadaima-00065-bwf` — **fixes QA Ruben/hermano (admin)**: (1) **selects ilegibles** — texto blanco sobre el fondo blanco del menú nativo del SO hacía invisibles roles/tiendas/etc. en los 15 `<select>` de la app; fix con regla CSS global `select option { background: var(--td-popup-bg); color: var(--td-text-hi) }` en `glass.css` (sirve light+dark). (2) **`assignRole` aditivo** → ahora sincroniza (borra + inserta en transacción): cambiar el rol ya no acumula admin+cajero. (3) **`/users/online` crasheaba** con `with('roles')` sobre un accessor (User NO tiene relación Eloquent `roles`, solo `getRolesAttribute`) → quitado el eager-load roto. (4) **Tienda nueva no aparecía en alta de producto** — el selector lista *warehouses*, no stores; el seeder crea 1 warehouse por tienda pero `StoreController::store` (alta UI) no lo hacía → tiendas creadas post-reset quedaban sin bodega. Fix: crear tienda ahora **auto-crea su warehouse `type='store'`** (en transacción) + frontend invalida `['warehouses']` al crear tienda. Tests nuevos: `UserRoleAssignmentTest` (2) + `test_create_store_auto_creates_default_store_warehouse`. 71/275 verdes. Confirmado: NO había bug de invalidación RQ ni de seed de roles.) Previa rev `tadaima-00063-gwt`: **corte del gerente en Reporte del Día**: IVA 16% sobre comisión de terminal (solo tarjeta; efectivo/transfer no tienen comisión → IVA 0), **tablas detalladas de preventa** (anticipos + liquidaciones por folio con utilidad REAL = venta − costo; `cost` admin-gated agregado a `PreSaleOrderItemResource`), **export a Excel** (.xlsx vía exceljs con import dinámico/chunk lazy), y **ventana de Cortes en Caja** (`CortesModal`, reúsa `CashCloseSummaryModal` + `/reports/cash`, RBAC por rol). También: **`pos-app` ahora es repo propio** `tadaima-app-pos` con docs de handoff (BACKEND_API, FASE_1_PLAN, RUBEN_WORKLOG). **Nota:** historial de sesiones anteriores a 2026-05-14 archivado en git history para mantener el log ligero.)
>
> Actualizado: 2026-06-02 (**App móvil reiniciada como `pos-app/`** — Expo SDK 56 standalone fuera del workspace npm, StyleSheet sin tailwind, sin router. **Login + Home funcionando** en Expo Go contra prod. La vieja `apps/mobile` (NativeWind) tronaba por hoisting del monorepo → archivada en `backups/apps-mobile-archivado-2026-06-02`.)
>
> Actualizado: 2026-05-30 (**DESPLEGADO rev `tadaima-00062-l6m`** + **PROD RESETEADA a cero para pruebas**: solo admin Pier <pier@tadaima.mx> + roles + métodos de pago base; sin tiendas/productos/ventas. Respaldo en `backups/tadaima_prod_2026-05-30_211356.sql` (local, gitignored). Incluye: **ADR-017 caja "una caja por persona"** + naming {usuario}·{tienda}, **guard de precios server-side**, fixes QA Ruben (stock al cancelar, gris, orden), y QA E2E. Login de Pier verificado en prod.)
>
> Actualizado: 2026-05-28 (sprint largo cierre del día: **ADR-016 Fases 1-4 COMPLETAS** (cancelación de ventas + log auditable + admin tab), Aceternity UI piloteado en Dashboard, refactor Caja a 2 columnas Square-style, presets cuadrados, USD híbrido refinado, historial → React Query persist + invalidate, default pesos por mesa, perf RQ acotada — quitado polling preventas y prefetch productos)

---

## ESTADO ACTUAL DEL PROYECTO (resumen rápido para nuevas sesiones)

| Componente | Estado | Notas |
|-----------|--------|-------|
| Backend API (Laravel) | ✅ En producción | revision `tadaima-00066-szd` (2026-06-03, **backfill de bodegas para tiendas legacy** vía migración idempotente + `backend/AGENTS.md` con referencia completa de endpoints para handoff). Previa `tadaima-00065-bwf` (2026-06-03, **alta de tienda auto-crea su warehouse `type='store'`**; `assignRole` sincroniza en vez de acumular; `/users/online` sin eager-load roto). Previa `tadaima-00063-gwt` (2026-06-03, expone `cost` admin-gated en preventas para utilidad real del corte). Previa `tadaima-00062-l6m` (2026-05-30, ADR-017 + guard de precios + fixes QA). **DB de prod RESETEADA a cero 2026-05-30** (solo admin Pier — fase de pruebas; respaldo previo en `backups/`). URL: tadaima-987277625193.us-central1.run.app. **`min-instances=1`** desde 2026-05-21 (~$8-10/mes, elimina cold starts de 5-37s). **ADR-015 (2026-05-22): cost_at_sale** — sale_items/pre_sale_order_items/layaways tienen columna `cost` snapped al INSERT. Reportes históricos inmutables aunque admin re-precie productos. **Cash session conflict (2026-05-25)**: `CashSessionConflictException` + `POST /cash/sessions/{id}/force-close` admin-only + `cash/registers` embed `active_session`. |
| Landing / Web (React) | ✅ En producción | Email folio, historial mixto, Tarjeta/Transferencia, checkout mixto. **Fix global de contraste en `<select>`** (`glass.css` → `select option/optgroup` con `--td-popup-bg`/`--td-text-hi`): el menú nativo del SO ya no muestra letra blanca sobre blanco en ningún selector (roles, tiendas, etc.). **ADR-014 (2026-05-18): client-authoritative cart**. Dashboard gerente con Cajeros conectados + Cortes de hoy. **Tab "Reporte del Día"** en /sales (admin/gerente) con secciones A-H + Imprimir + **PDF + Excel (.xlsx)**: incluye **IVA 16% sobre comisión** (solo tarjeta) y **tablas detalladas de preventa** (anticipos + liquidaciones con utilidad real, admin-only). **Ventana de Cortes** en Caja (botón "Cortes" → lista por rango + detalle, RBAC: cajero propios / gerente tienda / admin todo). **Helpers de fecha local** en `lib/date.ts` (`getTodayLocal`/`useTodayLocal`/`daysAgoLocal`/`toLocalYmd`) eliminan bug UTC stale en todos los filtros "Hoy". |
| App móvil (Expo) | 🟡 Login OK | **`pos-app/`** (Expo SDK 56, standalone FUERA del workspace, StyleSheet sin tailwind, sin router). Login + Home funcionando contra prod (2026-06-02). Falta paridad de features. La vieja `apps/mobile` (NativeWind) se archivó en `backups/` por hoisting hell del monorepo. |
| Deploy / Cloud Run | ✅ Operacional | `gcloud run deploy --source .`, región us-central1. Build remoto en Cloud Build (no requiere Docker local) |
| DB Producción | ✅ Operacional | MySQL `pos-lite-db` en us-west1, vía Cloud SQL Proxy en local o `DB_SOCKET` en Cloud Run |
| Bucket GCS | ✅ Configurado | `gs://tadaima-media`, FILESYSTEM_DISK=gcs en producción |
| Dominio custom | ✅ Activo | `tadaima.poslite.com.mx` mapeado a `tadaima` us-central1 |
| Loyalty Supabase | ✅ Activo en prod | `TADAIMA_SUPABASE_URL` + `SERVICE_KEY` configuradas en Cloud Run `tadaima` us-central1. Lookup de socios funciona end-to-end (verificado 2026-05-15) |
| Servicio duplicado | ✅ Borrado | `tadaima` us-west1 eliminado 2026-05-15. Solo queda `tadaima` us-central1 (real) y `pos` us-west1 (otro cliente) |

---

## BACKLOG PRIORIZADO — actualizado 2026-06-03

> Qué hay para trabajar, en orden de valor/impacto.

### ✅ Completado recientemente

| # | Área | Feature | Sesión |
|---|------|---------|--------|
| 111 | Docs/Handoff | **`backend/AGENTS.md` + `backend/CLAUDE.md`** — doc de entrada para la IA del hermano: de qué trata el proyecto, stack, ADRs (014/015/016/017 + guard de precios), cómo correr/test/deploy y **referencia completa de los ~110 endpoints** agrupados por dominio (generada de `routes/api.php`). `CLAUDE.md` → `@AGENTS.md` para auto-carga | 2026-06-03 |
| 110 | Tiendas/Inventario | **Backfill de bodegas para tiendas legacy** — el auto-create del 00065 solo cubre tiendas NUEVAS; las 2 creadas antes del fix quedaron sin warehouse `type='store'` → seguían invisibles en alta de producto pese al deploy. Migración idempotente `2026_06_03_000001` crea la bodega faltante a toda tienda sin ella (corre sola en arranque). Verificado en logs de prod. Test cubre creación + idempotencia | 2026-06-03 |
| 106 | QA/UI | **Selects ilegibles (fondo blanco + letra blanca)** — el menú nativo del SO pintaba los `<option>` con fondo blanco mientras heredaban el texto claro del input (`--td-input-text`) → roles y tiendas invisibles en los 15 `<select>` de la app. Fix con 1 regla CSS global `select option, select optgroup` en `glass.css` (legible en light y dark). Reportado por Ruben/hermano | 2026-06-03 |
| 107 | RBAC | **`assignRole` ahora sincroniza** — antes hacía INSERT idempotente sin borrar el rol previo → al cambiar de rol el usuario quedaba con ambos (admin+cajero). Ahora borra todos sus roles y reinserta el nuevo en transacción (el form solo permite 1 rol). Test `UserRoleAssignmentTest` | 2026-06-03 |
| 108 | Backend | **`/users/online` ya no crashea** — hacía `->with(['roles:id,name'])` pero `User` NO tiene relación Eloquent `roles` (solo el accessor `getRolesAttribute`) → `RelationNotFoundException` rompía "Cajeros conectados" del dashboard. Quitado el eager-load; el accessor ya entrega los datos. Test cubre el endpoint | 2026-06-03 |
| 109 | Tiendas/Inventario | **Alta de tienda auto-crea su bodega `type='store'`** — el selector de alta de producto lista *warehouses*, no stores; el seeder crea 1 warehouse por tienda pero `StoreController::store` (UI) no lo hacía → tiendas creadas post-reset no aparecían para asignar stock. Fix en transacción + frontend invalida `['warehouses']` al crear tienda. Test `test_create_store_auto_creates_default_store_warehouse`. **Descartado: NO había bug de invalidación RQ (ya funcionaba) ni de seed de roles** | 2026-06-03 |
| 101 | Reportes | **IVA 16% sobre comisión de terminal** en Reporte del Día (solo tarjeta; efectivo/transfer → IVA 0). Pantalla + impresión + PDF + Excel. Const `IVA_COMISION_RATE`, columna "IVA com." + KPI | 2026-06-03 |
| 102 | Reportes | **Tablas detalladas de preventa** (sección C) — anticipos + liquidaciones por folio, **utilidad REAL = venta − costo** (cost admin-gated agregado a `PreSaleOrderItemResource` + tipo en packages/api). Joel rechazó la fórmula del gerente (costo − abono) que inflaba utilidad | 2026-06-03 |
| 103 | Reportes | **Export a Excel (.xlsx)** del Reporte del Día — `exportDailyReportXlsx` con **import dinámico de exceljs** (chunk lazy, no infla bundle inicial) | 2026-06-03 |
| 104 | Caja | **Ventana de Cortes** (`CortesModal`) — botón "Cortes" en toolbar → lista cortes por rango + detalle (reúsa `CashCloseSummaryModal` + `/reports/cash`). RBAC backend: cajero propios / gerente tienda / admin todo. No requiere caja abierta | 2026-06-03 |
| 105 | App móvil | **`pos-app` repo propio** `git@github.com:joeldorado/tadaima-app-pos.git` (separado del monorepo) + docs de handoff: `BACKEND_API.md`, `FASE_1_PLAN.md`, `RUBEN_WORKLOG.md`. Login verificado contra prod | 2026-06-03 |
| — | — | _(Filas anteriores a 2026-05-14 archivadas — ver git history. Hitos clave preservados en ADRs §7 y arquitectura.)_ | — |
| 22 | Caja | **Fix admin "Sin tiendas asignadas"** — StoreContext defensivo | 2026-05-14 |
| 23 | Productos | **Fix 422 mensaje genérico** — toast con field errors de Laravel | 2026-05-14 |
| 24 | Productos | **Fix modal Productos↔Tomos/Mangas se cerraba** — modal fuera del fragmento | 2026-05-14 |
| 25 | Mangas | **Fix TypeError 'length' al ver inventario** — doble unwrap en getMangaInventory | 2026-05-14 |
| 26 | Preventas | **Swap anticipo/precio en columna catálogos** + copy dinámico toggle "Publicar ahora" | 2026-05-14 |
| 27 | Caja | **Imágenes en catálogo de productos** (ratio 1:1, objectFit contain) | 2026-05-14 |
| 28 | Caja | **Fix carrito no sincronizado en Caja 2+** — rollback optimistic en changeQty | 2026-05-14 |
| 29 | Caja | **Item de preventa muestra anticipo (no precio)** en lado derecho del carrito | 2026-05-14 |
| 30 | Permisos | **Permisos de costo se respetan** — gerente/cajero ven costos solo si admin activa flag | 2026-05-14 |
| 31 | Reports | **Ganancia bruta gateada por canViewCost** — no visible a usuarios sin permiso | 2026-05-14 |
| 32 | Loyalty | **Supabase activado en Cloud Run prod** — `TADAIMA_SUPABASE_URL` + `SERVICE_KEY` configuradas, lookup de socios funcional end-to-end | 2026-05-15 |
| 33 | Infra | **Borrado duplicado `tadaima` us-west1** — sin tráfico desde 2026-05-02, sin dominio. Solo queda servicio real us-central1 | 2026-05-15 |
| 34 | Preventas | **Eliminado flujo legacy de PreSalesPage** — tab "Gestión" removido, página reducida 2,172 → 110 líneas, borrados 8 modales/paneles legacy (`LiquidateModal`, `PreSalesOpsPanel`, `NewPreSaleModal`, `EditPreSaleModal`, `ArrivalModal`, `ProductFormModal`, `CreateProductFromPreSaleModal`, `AdminStoreFilter`), borrado `preSales.ts` de `packages/api` + 7 tipos legacy, borrado `lib/presales.ts`+test. Solo quedan Catálogos/Folios/Difusión. | 2026-05-15 |
| 35 | Backend | **Drop completo de esquema legacy `pre_sales`** en MySQL prod — tablas borradas: `pre_sales`, `pre_sale_items`, `pre_sale_payments`, `pre_sale_logs`. Borrado: `PreSalesController`, 4 modelos, 3 FormRequests, 3 Resources, `PreSaleService`, rutas `/pre-sales`, UNIONs legacy de `ReportsController` (sales+pre-sales), relación `Supplier::preSales()`. Migración `2026_05_15_000001_drop_legacy_pre_sales_tables`. 27/27 tests PHPUnit pasan. | 2026-05-15 |
| 37 | Caja | **Escaneo de folios y SKU en SellPage** — lector USB HID global (`useBarcodeScanner` hook con heurística de ráfaga rápida) + modal de cámara (`CameraScannerModal` con `html5-qrcode`, soporta QR + Code128 + EAN13). Routing automático: `PREV-\d+` → `searchByFolio`, SKU exacto → `addToCart`, sino → rellena input. | 2026-05-15 |
| 38 | RBAC | **Gating por rol en UI** — `lib/permisos.ts` extendido con `isAdmin/isManager/isCashier/primaryRole/canAccessPage/canEditProducts`. Nav lateral (`Layout.tsx`) ahora distingue 3 roles (antes admin vs todo). `ProtectedRoute` con prop `requiresPage` redirige a `/` si el rol no tiene acceso (router protege sales/products/transfers/clients/pre-sales/reports/settings/stores/admin). ProductsPage: cajero solo "Alta de Producto", no editar filas (`canEdit = admin\|gerente`). 18/18 tests permisos pasan, `vite build` ✓. | 2026-05-15 |
| 39 | Admin | **Borrar usuario desde UI** — `TabUsuarios` (`AdminPage.tsx`) ahora tiene botón Trash2 rojo al lado del Edit. Llama `deleteUser(id)` (soft-delete backend: `UserController::destroy` ya existía, desactiva sin borrar físicamente). Modal de confirmación con estilo glass del sistema (`AlertTriangle` rojo + nombre del usuario + descripción). Guard: el admin no puede borrarse a sí mismo (botón disabled + tooltip + toast si llega a dispararse). Durante request: botón Cancelar disabled, spinner en botón Eliminar. Cierra modal automáticamente al éxito. `vite build` ✓. | 2026-05-15 |
| 40 | Caja | **UX cliente reforzada en SellPage** — bloque “Paso 1 · Cliente de la preventa” en la misma zona superior, estado visual `Requerido/Cliente asignado`, tabs “Buscar existente / Dar de alta”, helper copy, resumen compacto del cliente (nombre/teléfono/correo) y espejo breve junto al total. Ticket y reimpresión ahora incluyen nombre + teléfono + correo cuando existan. | 2026-05-15 |
| 41 | Perf | **React Query + IndexedDB + multi-tab broadcast** — migración completa del data layer: `QueryClientProvider` global, IndexedDB persister (via `idb-keyval`) que sobrevive entre tabs/reloads, `BroadcastChannel` para sincronizar invalidaciones entre Caja 1/2/3/N. 15 hooks dedicados (`hooks/queries/`). Páginas migradas: Productos, Clientes, Reportes, Traslados, Inicio, Admin (6 tabs), Caja, Preventas (3 paneles), Ventas, Settings. Strategy: 24h productos/catálogos/TC, 60s folios, 30s default ventas/reportes/clientes. Polling eliminado (era cada 30s). Botones manuales "Sincronizar" en Caja, "Buscar nuevos" en Productos (gerente/cajero), "Actualizar" en Reportes. | 2026-05-15 |
| 42 | Perf | **Catálogo optimizado para 8000+ productos** — endpoint `GET /products?light=1` (`ProductLightResource`, ~60% menos payload), `?sort=top` (orden por sale_items últimos 30 días). Migración FULLTEXT index en `products(name, sku, barcode)` + `Product::scopeSearch` usa `MATCH AGAINST BOOLEAN MODE` con tokens prefijo cuando term ≥ 3 chars (fallback LIKE para SQLite y términos cortos). Búsqueda ~5-10ms vs ~200ms LIKE table scan. Patrón híbrido: top 200 prefetched al login (Layout), background pages 2-6 (1000 más) en `requestIdleCallback`, server search debounced 250ms, scanner USB hits backend directo sin debounce cuando SKU no está en cache. Tipo de cambio cache 24h, refetch explícito al `handleOpenCash` (cajero abre caja → fresh rate). Reducción de tráfico Cloud Run del orden 95-98% vs setup con polling. | 2026-05-15 |
| 43 | Caja | **ADR-014: client-authoritative cart** — refactor mayor: carrito vive 100% en memoria + localStorage (zustand snapshot), backend solo se entera al detonar el cobro. Endpoint `POST /sales` acepta `items[]` directos. Cero requests por `+`/`-`. Stock validado solo al cobrar (`reserveStock` con `lockForUpdate`). Si conflicto, auto-ajusta qty en UI y muestra toast. | 2026-05-18 |
| 44 | Backend | **Stock fixes críticos** — `reserveStock` ordena por `product_id` para evitar deadlock entre cajeros simultáneos. Validación nueva resta drafts open de otros cajeros + scoping por tienda (antes vendía a negativo). `checkStock` ahora filtra inventario por store del draft. | 2026-05-18 |
| 45 | Caja | **Dropdown UP método de pago** — grid 2×2 reemplazado por botón único del activo + menu hacia arriba con inactivos. Comisión oculta a no-admin (3 sitios). Terminal cambiable mientras Tarjeta activa. Total en USD prominente cuando Dólares + cambio bilingüe USD/MXN. Overlay full-screen bloqueante durante checkout. | 2026-05-18 |
| 46 | Caja | **Acceso rápido a Clientes** — modal del toolbar con buscador + tabla expandible (tickets/preventas). Botón "Cliente" toolbar con popup asignar (manual + scan TAD\d+ auto-detect socio Tadaima vía `lookupCardCode`). Form "+ Crear cliente nuevo" inline. Auto-abre popup al agregar preventa sin cliente. Cache RQ `useCustomersAllQuery` (1h, 500 clientes) con filtro client-side instantáneo + leyenda "Buscando en socios Tadaima..." cuando cae a Supabase. Nueva columna footer muestra datos del cliente asignado (📞 ✉️ 🏅 con iconos lucide). | 2026-05-18 |
| 47 | Perf | **Cache de imágenes 3 capas** — A: bucket GCS con `Cache-Control: max-age=31536000, immutable` (17 objetos existentes + futuras subidas vía `filesystems.php`). B: `vite-plugin-pwa` con Service Worker `CacheFirst` para `storage.googleapis.com/tadaima-media/*.{png,jpg,webp}` (2000 entries, 1 año). C: `loading="lazy" decoding="async"` en `ImageWithFallback` + `ProductThumb`. Cache busting automático vía filename hash. | 2026-05-18 |
| 48 | Caja | **Reducción de tráfico backend en Caja** — preventas (catalogs + orders) ahora cacheadas con `usePreSaleCatalogsQuery` + `usePreSaleOrdersQuery` (antes refetch en cada apertura del modal). Botones "Actualizar" granulares dentro de modales Catálogo y Preventas (en lugar del global del toolbar). Notificaciones polling apagado (no había escritores backend). Cliente popup busca local instantáneo + Supabase fallback. | 2026-05-18 |
| 49 | Caja | **UX polish del footer** — copy "Carrito" → "Venta" (consistente con POS profesionales). "Cancelar Venta" condicional (solo visible con items) ubicado junto a Escanear. Columna unificada Total+Dropdown (Col 1+2) + nueva columna cliente cuando hay asignado. Más espacio horizontal (`min-w-[300px]`). Botón "Buscar Preventa" del footer comentado (folio se carga via scanner o modal Preventas → Apartadas). Bloque "Cliente del Ticket" oculto en venta regular (visible solo en preventa). Warning "Quedan N disponibles" en items cuando stock ≤5. | 2026-05-18 |
| 50 | Reportes | **Filtro de fechas pro** — 7 presets (Hoy, Ayer, 7 días, 30 días, Este mes, Mes pasado, Este año), preset activo auto-detectado. Labels Inicio/Fin con icono Calendar dentro. Constraints `max={to}` y `min={from} max={today}` impiden rangos inválidos | 2026-05-18 |
| 51 | Preventas | **Imagen del producto en catálogo** — endpoint `POST/DELETE /pre-sale-catalogs/{id}/image` (5MB, GCS, borra previa). Resource expone `image_url`. Modal de catálogo con zona 140×140 (preview + cambiar/quitar). Thumbnail rápido visible en panel admin (lazy) y en CatalogCard de Caja (solo si tiene imagen, sin reservar espacio sin) + en items del carrito vía `addCatalogToCart` que propaga image | 2026-05-18 |
| 52 | Preventas | **Stock por tienda (cambio de schema)** — nueva tabla `pre_sale_catalog_store_limits` (`catalog_id`, `store_id`, `limit_qty`). Modelo + relación + helpers `limitForStore()` / `reservedCountForStore()`. Validación en `createOrder` respeta store_limits, fallback a `preorder_limit` global. Tab nuevo **"Stock"** en modal de catálogo: selector "Agregar tienda" (filtra ya asignadas) + qty editable inline (Editar/Eliminar) + footer suma. Migración `2026_05_18_000003` | 2026-05-18 |
| 53 | Preventas | **CatalogCard "Agotado"** — calcula `remaining = preorder_limit - reserved_count`, bloquea click y muestra badge rojo cuando ≤0. Botones de precio individuales disabled. `openPreSalesModal` invalida preSaleCatalogs+preSaleOrders al abrir → reserved_count fresh. `handleCheckoutError` parsea error de preventa y auto-ajusta qty del item (preserva proporción del depositAmount) | 2026-05-18 |
| 54 | Caja | **Bug crítico stock global vs por tienda** — `useProductsLightQuery(activeStore?.id)` (antes `null`). El endpoint `/products?light=1` retornaba stock global cuando no se mandaba `store_id`, así que UI mostraba 10 y backend rechazaba con "0 disponible" en otra tienda. Fix también aplicado a `useProductsSearchQuery`, `useBackgroundProductsPrefetch` y scanner directo. Auto-invalida `products.all` al abrir modal Catálogo → siempre stock fresh | 2026-05-18 |
| 55 | Caja | **Idempotencia addCatalogToCart** — doble click en catálogo ya no duplica fila; suma quantity + acumula depositAmount. Respeta preorder_limit | 2026-05-18 |
| 56 | Productos | **Modal QuickStockModal** — botón "📦 Stock" en columna acciones (tabla) y flotante en grid card (hover). Selector "Agregar tienda" + qty + edit inline + 🗑. Diff vs estado inicial al guardar → PUT por cada cambio en paralelo (registra movimiento de ajuste en backend). Reusa endpoint existente `PUT /inventory/{productId}/{warehouseId}` | 2026-05-18 |
| 57 | Productos / Avisos | **Avisos de stock RBAC + detalle solo lectura para cajero** — `ProductsPage` ahora permite a cajero abrir detalle de `Productos` y `Tomos/Librerías` sin editar (nombre, foto, código, categoría/editorial/género/volumen, precios, métodos de pago, pieza única, stock de su tienda). Acción rápida `Avisar`: cajero notifica a gerente de su tienda + admins; gerente notifica solo a admins. Backend `POST /notifications/stock-alert` hace upsert por `store + product + recipient` para actualizar stock/mensaje y evitar duplicados. UI pinta el botón en verde `Avisado` después de enviar. | 2026-05-21 |
| 58 | Dashboard | **Dashboard del gerente** — secciones "Cajeros conectados · [tienda]" (avatar + tiempo + badge "En caja #N" + dot verde) y "Cortes de hoy · [tienda]" (4 KPIs: Sesiones/Ventas/Entradas/Salidas + lista expandible). Unión de `/users/online` (filtrado a rol cajero) + sesiones abiertas hoy → presencia robusta incluso con tabs en background (timer del heartbeat throttled). Click en sesión abre `CashCloseSummaryModal` (reusable). Auto-refresh 30s + botón manual. KPIs admin se ocultan para gerente (repetitivos con las secciones nuevas), queries deshabilitadas para ahorrar 3 requests por carga. | 2026-05-22 |
| 59 | RBAC | **Restricciones de menú gerente** — ocultos del nav: "Tiendas" (gestiona solo la suya), "Reportes" (info financiera global solo admin). Tab "Catálogos" en Preventas ahora solo admin (data maestra de proveedor); gerente ve "Disponibles" (read-only). Defensa en profundidad: `PAGE_ACCESS` + `NAV_BY_ROLE` + `ProtectedRoute requiresPage` redirige a `/` si tipea URL directa. | 2026-05-22 |
| 60 | Productos | **Stock limit a tienda del gerente** — `QuickStockModal` y tab Inventario de `MangaEditModal` ahora filtran warehouses a `user.store_id` cuando no es admin. Si solo hay 1 tienda asignada: select preseleccionado y deshabilitado con icono 🔒. Stock de otras tiendas no entra al state → no se renderiza ni se manda en el diff al guardar. | 2026-05-22 |
| 61 | Auditoría | **Logs de mutaciones product/manga/inventory** — migración `2026_05_22_000001_extend_system_logs_with_entity_and_meta` agrega `entity_type` + `entity_id` (indexed) + `meta` JSON a `system_logs`. Helper `SystemLog::write($action, $description, $userId?, $entityType?, $entityId?, $meta?)` usa `Auth::id()` automático. Inserciones inyectadas en `ProductController` (store/update/destroy/forceDestroy con diff de campos), `MangaController` (store/update/deactivated/deleted con diff incluyendo detalles), `InventoryController::update` (ajuste con `{old, new, delta}`). Tablas de log dedicadas son out of scope — `system_logs` es genérica para futuras entidades (clientes, traslados, etc.). UI para visualizar pendiente — solo escritura por ahora. | 2026-05-22 |
| 62 | Reporte | **Tab "Reporte del Día" en /sales** — accesible para admin/gerente. 6 secciones: A) Resumen ejecutivo (ventas brutas, descuentos, neto, comisión terminal, ticket promedio, TC del día), B) Desglose por método de pago con comisión + neto, C) Preventas (anticipos cobrados vs liquidaciones), D) Movimientos de caja (apertura, entradas, salidas, esperado, declarado, descuadre — usa `/reports/cash`), E) Top 10 productos, F) Tabla por cajero (tickets/cobrado/comisión/neto/descuadre — cruza con sesiones). Ganancia Bruta (sección extra) SOLO admin con margen %, banner ámbar si productos sin cost. Botones Imprimir (HTML print-friendly) + Exportar PDF (jsPDF + autoTable). KPI row admin (Ingresos/Por Cobrar/Tot/Arts) oculto para gerente. Tab "Flujo de Caja Semanal" reubicado como tab. Tab "Por Producto" + "Lista de Ventas" con scroll interno (`max-h: 60vh`). Columna "Vendedor" en cada fila con icono User. | 2026-05-22 |
| 63 | Backend | **`SaleResource` expone `user: {id, name}`** — `SalesController::index/show` eager-load `user:id,name`. Frontend `SaleDetail.user` mostrado en lista de ventas para que gerente vea quién vendió cada ticket. RBAC del backend ya scopea ventas a tienda del gerente. | 2026-05-22 |
| 64 | Backend | **ADR-015: cost_at_sale (snap del costo al INSERT)** — 3 migraciones nuevas: `sale_items.cost`, `pre_sale_order_items.cost`, `layaways.cost` (decimal 12,2 nullable). 5 write paths inyectados: `CheckoutService::checkout` snap de `$draftItem->product?->cost` (eager-loaded, sin query extra), `CheckoutService::checkoutDirect` hereda via delegación, `PreSaleOrderService::createOrder` snap del `products.cost` si vinculado, fallback `catalog.cost` si pre-arrival, `LayawayService::create` snap al apartar (momento contable correcto), `LayawayService::deliver` propaga `layaway.cost` al `sale_items.cost` resultante (cadena de snaps). Read paths: `SaleItemResource` expone `item.cost` admin-gated; legacy `product.cost` queda como fallback. Frontend `dailyReport.gananciaBruta` prioriza `item.cost ?? item.product?.cost`. 10 tests TDD nuevos (`CheckoutCostSnapshotTest` + `PreSaleOrderCostSnapshotTest` + `LayawayCostSnapshotTest`) protegen invariante load-bearing: mutar `products.cost` después de la venta NO afecta `sale_items.cost`. 40/40 tests pasan. Fix lateral: migración legacy `drop_legacy_pre_sales_tables` ahora limpia FK `payments.pre_sale_id → pre_sales` también en SQLite (antes solo MySQL). | 2026-05-22 |
| 65 | UX | **Helpers de fecha local** (`lib/date.ts`) — `getTodayLocal()`, `toLocalYmd(Date)`, `useTodayLocal()` (hook con setInterval 60s detecta cambio de día), `daysAgoLocal(n)`. Reemplazan 7 usos del patrón `new Date().toISOString().split("T")[0]` que daba el día siguiente para usuarios MX (UTC-6) después de 6pm hora local. También arregla "tab abierta cruzando medianoche queda stale". Aplicado en: `DashboardPage` (KPIs admin + Cortes gerente reactivos), `SalesPage` (Reporte del Día), `ReportsPage` (today + 7 presets: Ayer/7 días/30 días/Este mes/Mes pasado/Este año), `SellPage` (min del input fecha de apartado). | 2026-05-22 |
| 66 | Mangas | **Margen % siempre visible** en MangaEditModal y MangaBatchModal (tab Precios). Antes gateado por `canViewCost`. Decisión Joel 2026-05-25: en librería el cost se deriva del margen sobre precio público y todos los roles que abren el modal (admin+gerente) necesitan ver/editar ese cálculo. NO afecta productos regulares. | 2026-05-25 |
| 67 | Caja | **OpenSessionConflictModal** — 409 estructurado al abrir caja cuando hay sesión activa que bloquea. 3 escenarios: (a) propia + misma caja → botón verde "Continuar sesión" (reanuda sin crear nueva); (b) propia + otra caja → "Cerrar y abrir nueva"; (c) ajena → muestra quién/cuándo, admin ve "Forzar cierre". Selector de cajas en el modal de abrir muestra "Ocupada por X · #N" (ámbar) o "Tu sesión activa" (verde). Backend: `CashSessionConflictException` + `POST /cash/sessions/{id}/force-close` admin-only con audit log; `GET /cash/registers` ahora embed `active_session`. | 2026-05-25 |
| 68 | Caja | **Quitar cliente asignado a la venta** — botón ✕ en chip del footer (venta regular) + botón "Quitar" rojo en header (preventa) ahora usan función única `clearCustomer()`. Disponible para todos los roles mientras vende. Bloqueado solo cuando la venta es PREVENTA cargada de un folio existente (desincronizaría con `pre_sale_orders.customer_id` del backend). | 2026-05-25 |
| 69 | QA | **Fixes ronda 5 del PDF de QA**: (a) **Scanner no suma** — nueva función `addScanToCart()` separada de `addToCart()`, nunca suma. Si producto ya está en venta, toast info y salida; solo +/- manual incrementa. Dedup window 1.5s → 3s. (b) **MangaEditModal permite agregar tienda nueva** al inventario (portado de QuickStockModal). (c) **Volumen visible en lista de Tomos** como badge rojo "Vol. N" al lado del nombre. (d) **Search no devuelve todos** — Enter ya no borra el input (causaba sensación "regresa todos los productos"); muestra toast "No se encontró 'XXX'" cuando filtered está vacío. Escape limpia. (e) **Gerente sin "Completar ahora"** en transfers — botón solo visible para admin, gerente queda con "Solicitar". | 2026-05-25 |
| 70 | Permisos | **Fix permiso de costo no se respetaba (QA ronda 6 de Ruben)** — `ProductResource:28`, `MangaResource:14`, `MangaCompatResource:27` gateaban con `hasRole(admin) && can_view_cost`. Bug: cajero/gerente con `can_view_cost=true` nunca veía el costo porque AND requería ser admin además. Fix: cambiar `&&` → `||` (admin/master siempre; cualquier rol con flag delegado también). `SaleItemResource` queda admin-only a propósito (reportes de ganancia son admin). Nuevo `tests/Feature/CostPermissionTest.php` con 4 tests (admin / cajero sin flag / cajero con flag / gerente con flag). 44/44 PHPUnit pasan. | 2026-05-27 |
| 71 | UX | **Stock por tienda en detalle de producto/tomo** + **costo real visible** — `ProductDetailModal` y `MangaDetailModal` ahora aceptan `canViewCost` y `highlightStoreId`. Nuevo campo "Costo real" gateado por el flag. Nueva sección "Stock por tienda" via componente reusable `StoreStockBreakdown.tsx` (en `components/inventory/`) + hook `useInventory.ts` (`useProductInventoryQuery` con cache 30s). Backend: `InventoryController::index` eager-loads `warehouse.store`; `InventoryResource` expone `warehouse.store: {id, name, phone}`. Type `InventoryItem` en `packages/api` actualizado. | 2026-05-27 |
| 72 | Nav | **Nueva página "Existencias" (`/buscar-tiendas`)** — admin/gerente/cajero. Buscador de productos cross-tienda con `useProductsSearchQuery` (debounce 250ms) + scanner USB integrado vía `useBarcodeScanner` (auto-selecciona match exacto por SKU/barcode o cuando hay 1 solo resultado). Click en producto → panel con `StoreStockBreakdown showContact` que lista cantidades por sucursal + botones **Llamar** (`tel:`) y **WhatsApp** (`https://wa.me/52…` antepone 52 a números MX de 10 dígitos) usando `store.phone`. PageKey `stock_search` agregado a `lib/permisos.ts` + Layout (label corto "Existencias" — Joel feedback "no cabe el título"). Icono `PackageSearch`. Fila resaltada en verde cuando es "Tu tienda". | 2026-05-27 |
| 73 | RBAC | **Gerente: catálogos de preventa "gestión completa, solo su tienda"** — reversa decisión #59 (2026-05-22). Frontend: `PreSalesPage` agrega "gerente" a tab Catálogos y mueve "Disponibles" a cajero-only. `NewPreSaleCatalogModal` acepta `restrictedStoreId`: filtra el selector y oculta asignaciones de otras tiendas al gerente. Backend: `PreSaleCatalogsController::syncStoreLimits` con nuevo param `?int $restrictToStoreId` — cuando se manda, solo toca esa tienda y PRESERVA intactas las asignaciones de otras sucursales (no replace-all). Helper `storeLimitScope(Request)` infiere scope desde el rol del request. Admin sigue con replace-all. Migra invariante "ganancia/asignaciones ajenas no se filtran al gerente". | 2026-05-27 |
| 74 | Caja | **Fix cliente persistente entre ventas (defensivo)** — Joel reportó en prod que tras liquidar una preventa, al crear otra el cliente anterior aparecía asignado. Audité los 3 paths de checkout (liquidación, mixto, regular) y todos llaman `clearCart()`. Bug real probable: estado residual del popup `assignCustomerPopup` o del input `customerSearch` no se limpiaban en clearCart. Fix: `clearCart()` ahora también resetea `assignCustomerPopup=null`, `showCustDrop=false`, `requireCustomerFlash=false` + `cashReceived=""` en el update de la mesa. | 2026-05-27 |
| 75 | Caja | **`cashReceived` ahora por mesa (no global)** — antes era `useState("")` global; cambias entre Caja Principal / Venta 2 / Venta 3 y se perdía lo ingresado en la anterior. Agregado `cashReceived?: string` (+ `cashReceivedUsd?: string`) a interface `Mesa`. Wrapper derivado: `cashReceived = activeMesa.cashReceived ?? ""` + `setCashReceived` que llama `updMesa`. `updMesa` movido arriba (línea ~460) para estar disponible donde se necesita. Cada mesa conserva sus inputs al cambiar de tab. Snapshot zustand persiste a localStorage también. | 2026-05-27 |
| 76 | Caja | **Botón "Mover artículos a otra caja"** — split por método de pago. Helper `itemAcceptsMethod(item, method)` considera: preventa (no Tarjeta), `payment_restriction=cash_only`, flags `allow_cash`/`allow_card`. Helper `methodForItems(items)` infiere método target. Handler `splitToOtherMesa()`: encuentra mesa vacía (o crea Venta N nueva) → mueve los items conflictivos + copia cliente + asigna método correcto al destino. Items `isFromPreSale` (de folio cargado) se PRESERVAN en la mesa actual (no se pueden mover sin romper liquidación). Banner ámbar arriba del dropdown de método se muestra solo cuando hay items movibles conflictivos. | 2026-05-27 |
| 77 | Caja | **Dólares fuera del dropdown + input híbrido USD+MXN dentro de Efectivo** — métodos ahora: Efectivo / Tarjeta / Transferencia. Migración automática: mesas hidratadas con `paymentMethod="Dólares"` se normalizan a `"Efectivo"` al cargar. Bloque primario "Pesos recibidos" + presets $50/100/200/500. Toggle "+ Dólares (TC X.XX)" revela bloque verde con USD + presets US$10/20/50/100. Cálculo: `total = pesos + USD × TC`. "≈ X MXN" inline. Cambio/Falta siempre en pesos. Ticket impreso muestra desglose `· Pesos · Dólares (US$X ≈ $Y)` cuando hubo USD. `CompletedSaleData.amountReceivedUsd?` agregado para preservar el dato en el comprobante (no requiere cambio de schema en backend — `payments[].amount` sigue siendo MXN total). Botón editar TC ahora visible siempre para admin en Efectivo. | 2026-05-28 |
| 78 | UX | **Textos más grandes en caja** — Ruben/cliente reportó "muy chicos". Bumps targeted en carrito (sin tocar layout): nombre producto `text-sm`→`text-base` (14→16px), SKU `text-[10px]`→`text-[11px]` opacidad subida, cantidad +/− `text-sm`→`text-base`, precio por línea `text-sm`→`text-base`, "de $X" anticipo `text-[9px]`→`text-[11px]`, nombre cliente footer `text-sm`→`text-base`. Label método pago `text-[11px]`→`text-xs`. | 2026-05-28 |
| 79 | Caja | **Fix display historial — preventa al 100% resalta + monto correcto** — bug Joel reportó: en historial, una preventa nueva con $0 anticipo de $1000 mostraba "$1000" en grande aunque cobraste $0. Causa: `SellPage.tsx:6521` mostraba `order.total` (valor preventa) en vez de `paid_amount` (lo cobrado hoy). Fix: monto grande = `paid_amount` para no-mixtas (mixto sigue con `grandTotal`). Status `delivered` muestra badge verde resaltado "**Liquidada · $X cobrado**" en lugar de etiqueta tenue. Estados pending/ready: "Anticipo $X / Sin anticipo / Pendiente $X". Tooltip preserva valor total de la preventa. | 2026-05-28 |
| 80 | ADR-016 Fase 1 | **Visibilidad de cancelaciones (sin backend nuevo)** — tabs "Todas/Canceladas" en historial de caja + badges rojo vivo "Cancelada" (full) y ámbar "Cancelada parcial" + total tachado con opacity. Sección H "Cancelaciones" en Reporte del Día con KPIs (count, monto cancelado, brutas, netas reales). Lee `sales.status='returned'` y `pre_sale_orders.status='cancelled'` ya existentes. | 2026-05-28 |
| 81 | ADR-016 Fase 2 | **Backend cancelación (edit-in-place + log)** — migración `2026_05_28_000001_create_sale_cancellations_table` agrega `cancellation_status` + `last_cancelled_at` a `sales` y `pre_sale_orders`, crea tabla `sale_cancellations` con snapshot JSON (items + cost_at_sale preservado), `cash_movement_id`, `cash_session_id`, motivo y `cancelled_by`. Modelo `SaleCancellation` con constantes de modo (full/partial_items/liquidation_rollback) + 5 motivos. `SaleCancellationService` con `cancelSale()` (full o partial, edita sale_items in-place) y `cancelPreSaleOrder()` (modo `full` o `liquidation_rollback` — devuelve folio delivered → ready con saldo nuevo). Stock restaurado vía `InventoryMovement` type='devolucion'. Cash reversado como `cash_movements` type='salida' en sesión activa. 2 endpoints: `POST /sales/{id}/cancel` + `POST /pre-sale-orders/{id}/cancel`. 6 tests PHPUnit (`SaleCancellationTest`) — invariante stock + cost_at_sale preservado + double-cancel rechazado. 50/50 PHPUnit pasan. `SaleResource` + `PreSaleOrderResource` exponen `cancellation_status`. | 2026-05-28 |
| 82 | ADR-016 Fase 3 | **UI de cancelación** — `CancelTicketModal.tsx` (en `components/cancel/`): para sales checkbox por item + qty editable + dropdown motivo (5 opciones) + notas opcionales; para preventas botones de modo (Rollback liquidación si delivered / Cancelar folio completo). Footer con salida estimada en rojo. Botón **XCircle** rojo por fila en historial (sale + preventa, oculto si ya cancelada). State `cancelTarget` + render del modal en SellPage. Z-index 500 (encima del historial z-400). Onsuccess invalida historial + cancellations + sales + preSaleOrders. | 2026-05-28 |
| 83 | ADR-016 Fase 4 | **Sección H detallada + tab admin** — backend: `GET /sale-cancellations` con filtros (from/to/store_id/reason_code/cancelled_by) paginado, eager-loads cancelledByUser + sale + preSaleOrder. `SaleCancellationResource` con snapshot completo. Frontend: `useSaleCancellationsQuery` hook (cache 30s). Sección H del Reporte del Día rediseñada — lee del log real (no del filtro de status que rompía con parciales); 4 KPIs (eventos / monto reversado / ventas brutas = netas + cancelado / ventas netas reales); breakdown table por **motivo** con % + breakdown table por **cajero**. **Tab "Cancelaciones" en AdminPage** (`TabCancelaciones.tsx`): tabla full-screen con filtros (rango fechas default 30d, motivo, cajero, tienda, search), columnas Fecha/Tipo/Referencia/Modo badge/Motivo/Cajero/Monto, expand por fila con notas + snapshot completo de items (qty/price/cost) + ref a cash_movement y sesión. Paginación. | 2026-05-28 |
| 84 | Perf | **Historial del día → React Query con persist + invalidate-on-event** — `useTodayHistorialQuery` hook (`hooks/queries/useHistorial.ts`), cache 30s persistido en IndexedDB. QueryKey `historial.today(storeId)`. Antes `useState` global con `fetchHistorial()` manual; ahora apertura instantánea del modal + background refetch tras checkout/cancelación. MixedPairs (preventa↔venta) recomputado vía useEffect reactivo. Invalidaciones en los 3 paths de checkout + en `onSuccess` del CancelTicketModal. Multi-tab sync vía BroadcastChannel ya configurado. | 2026-05-28 |
| 85 | Perf | **Acotar llamados RQ (decisión Joel)** — (a) `usePreSaleOrdersQuery`: quitado `refetchInterval: 60_000` → ahora cache 5min + invalidate-on-event + refetchOnWindowFocus. Trade-off: cross-máquina pierde sync en tiempo real (requiere focus o refetch manual). (b) `useExchangeRateQuery`: `staleTime` 5min → 24h, `refetchOnWindowFocus: false` → solo refetch al abrir caja (handleOpenCash invalida) o cuando SettingsPage cambia TC. (c) Quitado `useBackgroundProductsPrefetch` (traía pgs 2..6 = 1000 productos extra al abrir caja). Solo top-200 + búsqueda server-side bajo demanda. (d) `useMangasQuery`: agregado cache 24h + persist + refetchOnFocus (antes era bare, refetch cada mount). | 2026-05-28 |
| 86 | UX | **Aceternity UI piloteado en Dashboard** — primer uso de la librería copy-paste estilo Aceternity. Creados `components/aceternity/BackgroundBeams.tsx` (32 SVG paths con gradient animado motion, terminal en `#E0221A` rojo Tadaima) y `HoverCard.tsx` (wrapper con blob blur + spotlight radial que sigue al cursor). Integrados en DashboardPage: BackgroundBeams para admin/gerente (cajero excluido), HoverCard en cards de "Cajeros conectados" (verde si tienen caja abierta, rojo Tadaima si no) y "Cortes de hoy" (color del status: verde cuadra / rojo falta / amber sobra / naranja abierta). Secciones con `relative z-10` para layering sobre los beams. | 2026-05-28 |
| 87 | Caja UX | **Layout Caja → 2 columnas side-by-side (estilo Square POS)** — refactor del SellPage por agente UI/UX. **Izquierda `flex-1`**: items del carrito con scroll propio + toolbar header. **Derecha `<aside w-[420px] xl:w-[460px]`**: sidebar vertical pinned con border-l glass-dark. Sidebar contiene scroll wrapper (`flex-1 overflow-y-auto justify-end` — crece de abajo hacia arriba) con secciones apiladas (Total centrado / Cliente con avatar 40px + nombre text-lg / Cash input híbrido USD+MXN). **Footer sticky** (`shrink-0` border-top) con grid 12-cols: Método de pago `col-span-4` (chip discreto sin glow, abre dropdown HACIA ARRIBA) + Cobrar `col-span-8` (CTA dominante rojo). Mobile (<md) sidebar oculto. Floating multi-mesa shortcuts movidos a bottom-left. Decisión Joel: "Total a Pagar centrado, que crezca de abajo para arriba", "Efectivo hace ruido", "baja esa parte al footer". | 2026-05-28 |
| 88 | Caja UX | **Presets cuadrados con todas las denominaciones** — antes 4 chips horizontales pequeños; ahora **6 botones cuadrados (3×2 grid, `aspect-square`)** con label de moneda arriba (MXN/US$) + número grande (text-2xl) abajo. Pesos: $20, $50, $100, $200, $500, $1000 (todos los billetes MX). USD: $1, $5, $10, $20, $50, $100 (todos los billetes US). Tap targets ~120×120px, números legibles sin equivocaciones. | 2026-05-28 |
| 89 | Caja | **Default pesos por mesa (no más USD residual)** — `showUsdInput` migrado de `useState` global a campo `usdPrimaryMode?: boolean` en `Mesa` interface (default false en `makeMesa`). Wrapper derivado `showUsdInput = !!activeMesa.usdPrimaryMode`. Cada venta nueva o post-checkout inicia en pesos. `clearCart` lo resetea. Bug previo: una venta con USD heredaba el modo a la siguiente. | 2026-05-28 |
| 90 | Caja | **Input híbrido USD+MXN refinado + cambio dual currency** — input number text-4xl con tabular-nums, padding y border-2 (más presencia). "Efectivo" eliminado del dropdown (solo en input híbrido dentro de Efectivo). Modo USD primario: pesos se oculta hasta que USD no cubre → auto-aparece banner "Completa con pesos · faltan $X" + input pesos con autoFocus. Cambio en MXN principal + "≈ US$X" debajo cuando se cobró con dólares (útil para devolver cambio físico en USD si decide). Botón gate Cobrar arreglado: antes solo contaba pesos → bloqueaba "Falta efectivo" aunque USD cubriera; ahora cuenta `pesos + USD × TC`. | 2026-05-28 |
| 91 | UX | **Form rápido nuevo cliente en popup asignar** — footer sticky abajo (antes vivía al final del scroll → en listas largas no se veía). Botón "+ Crear cliente nuevo" siempre visible. Al expandir, form compacto: Nombre full-width grande arriba + Teléfono y Email lado a lado (grid 2-col) + botón único "Crear y asignar". Enter en cualquier campo dispara submit. Cancelar reducido a "✕ Cancelar" pequeño arriba a la derecha. Pre-rellena nombre con `search.trim()`. | 2026-05-28 |
| 92 | Caja | **Auto-open popup cliente al cobrar preventa sin cliente** — `handleCheckout` validation muestra toast amber "Falta cliente para la preventa" Y abre `assignCustomerPopup` en modo manual automáticamente. Antes solo enfocaba el search del header (poco visible). Ahora el cajero ve el form directo y puede buscar/crear sin navegar. Toast queda encima del popup (sonner portal). | 2026-05-28 |
| 93 | Caja UX | **Iconografía cancelación: XCircle en vez de Trash2** — feedback Joel: Trash2 confunde (parece "borrar permanente"). Lucide `XCircle` es el equivalente del Material `cancel` (círculo con X). Aplicado en: botón cancelar venta/preventa en historial + modo "Cancelar folio completo" en CancelTicketModal + botón confirmar. Tamaños subidos a 15-18px. Trash2 conservado solo en "Quitar cliente" y "Quitar carrito" (semánticamente remover, no cancelar). | 2026-05-28 |
| 94 | Caja UX | **Botones Cambiar/Quitar cliente legibles** — feedback Joel: texto invisible (white/70% sobre bg claro = ilegible). Fix: colores sólidos `#10b981` verde para Cambiar y `#ef4444` rojo para Quitar, border 40% opacity, text-[11px] (era text-[9px]), icon 13px. Contrastan en light y dark mode. | 2026-05-28 |
| 95 | Caja UX | **Tamaños tipográficos del sidebar** — Total a Pagar `text-[2rem]` → `text-[2.5rem]` (40px) con tabular-nums. Cliente avatar 28→40px + icon 13→18px, nombre `text-base`→`text-lg`. Botón EFECTIVO `h-[44px] text-xs icon14` → `h-[52px] text-sm icon16`. "≈ X MXN" inline en input USD `text-[11px] opacity 80` → `text-base opacity 100`. Label CLIENTE `text-[10px]`→`text-[11px]` con opacity más alta. | 2026-05-28 |
| 96 | Caja (ADR-017) | **Caja multi-usuario "una caja por persona"** — Joel reportó que si un cajero abría caja, el gerente/admin/otro cajero no podían vender ("Esta caja está abierta por otro usuario"). Causa raíz: 1 sola caja física por tienda + lock de 1 sesión por caja (`KIND_FOREIGN`) + apropiación de sesión por tienda en `activeSession`. Aclaración Joel: hay varios devices (incluso celulares), cada device/persona es una caja; **corte por PERSONA** (mismo user en 2 devices = 1 corte, el 2º reanuda). **Fix (Modelo A):** (a) `open()` ya NO lanza `KIND_FOREIGN`; se conserva `KIND_OWN` (1 corte activo por persona). (b) `activeSession()` devuelve SOLO la sesión propia (eliminada la apropiación por tienda). (c) **Caja personal por usuario:** migración `2026_05_30_000001_add_owner_user_id_to_cash_registers` (FK nullable + index `(store_id, owner_user_id)`); `open()` hace `firstOrCreate` de la caja del usuario en la tienda y la nombra **"{usuario} · {tienda}"** (refresca el nombre si cambió). La caja física "Caja 1" legacy queda owner=null. (d) Frontend: modal "Tu Caja" muestra `{user} · {tienda}`, quitado aviso "Ocupada por X" + query/import muerto `useCashRegistersWithSessionQuery`; quitadas redundancias de nombre en SellPage (tooltip/panel sesiones) y DashboardPage (Cortes de hoy / "En caja"). Reportes intactos: `ReportsController::cash` agrupa por `register_session_id`. 4 tests `CashSessionConcurrencyTest` (incluye verificación del naming). 54/54 PHPUnit + tsc landing OK. **Pendiente deploy.** | 2026-05-30 |
| 97 | QA Ruben + Caja | **Ronda QA 2026-05-30 (catálogo de Caja)** — (a) **Bug stock no refresca tras cancelar:** al cancelar una venta el catálogo seguía mostrando "1 disp." cuando ya eran 2 (otros lados sí actualizaban). Era staleness de cache: el `onSuccess` de `CancelTicketModal` no invalidaba `products.all`. Fix: agregadas invalidaciones `products.all` + `preSaleCatalogs.all` (backend ya restauraba stock vía `InventoryMovement` 'devolucion'). (b) **Productos sin stock al final** (pedido Joel) — `ProductCatalogModal.filtered` ordena con sort estable: stock efectivo `=== 0` va al final, conserva orden original dentro de cada grupo. (c) **Sin stock en escala de gris** — tarjetas agotadas con `filter: grayscale(1)` + opacity 0.5 (ambos renders: normal y preventa). (d) Badge verde header "CAJA 1 — TIENDA 1" inconsistente con cajero/tienda → ya resuelto por ADR-017 (`cashSession.register.name` = "{usuario} · {tienda}" en sesiones nuevas). tsc landing OK. **Pendiente deploy.** | 2026-05-30 |
| 98 | QA | **QA automático end-to-end del flujo de ventas** — `tests/Feature/FullSalesQATest.php` (13 tests E2E vía HTTP, 96 assertions, SQLite aislado, no toca prod). Cubre: caja multi-usuario, venta efectivo/tarjeta, comisión absorbida por tienda, consistencia precio→reporte, cancelación total/parcial, preventa anticipo→liquidar→rollback, snapshot de costo (ADR-015) + gating admin, y edge cases (descuento>subtotal, pagos no cuadran, oversell, price levels). **67 tests / 259 assertions verdes.** Resultado: sin bugs de backend en precios/caja/costos/cancelaciones/reportes. | 2026-05-30 |
| 100 | Seguridad/Precios | **Guard de precios server-side** — cierra el riesgo #99. `CheckoutService::checkoutDirect` ahora valida cada item NO dañado: el `price` debe coincidir (±0.01) con un nivel del catálogo del producto para esa tienda (precio base `product_prices.price_1..5` o `product_store_prices` override). Fuera de catálogo → 422 "Precio $X fuera del catálogo...". Items con `is_damaged=true` permiten precio manual (mercancía dañada, flujo legítimo). Threading: `CheckoutRequest` valida `items.*.is_damaged`, `SaleDirectItem` (packages/api) + `SellPage` (3 puntos de checkout directo) mandan `is_damaged`. Sin precios definidos → no valida (defensivo). Layaways y preventas-catálogo no afectados (usan precio del servidor). Tests: `FullSalesQATest` i5 (rechazo + dañado permitido) + i6 (precio por tienda). 68/68 PHPUnit + tsc landing OK. **Pendiente deploy.** | 2026-05-30 |
| - | Deploy | **Dominio custom activo** `tadaima.poslite.com.mx` | 2026-05-05 |

### 🟡 Media prioridad (mejora flujo o datos)

| # | Área | Feature / Fix | Detalle |
|---|------|--------------|---------|
| 99 | Seguridad/Precios | **✅ RESUELTO — Guard de precios server-side** | Hallazgo QA 2026-05-30 (ya corregido, ver #100): el backend confiaba 100% en el `price` del cliente. Cerrado con validación en `CheckoutService::assertPricesMatchCatalog`. |
| 41 | Tienda Online | **Fase catálogo público por tienda** | Plan en `docs/PLAN_FASE_CATALOGO_ONLINE_2026-05-15.md`. **Estado:** ejecución iniciada (Bloque A+B). Ya existe cliente API `packages/api/src/catalog.ts` y ruta web pública `/catalogo/:catalogUrl` + `/tienda-online/:catalogUrl` con `OnlineCatalogPage` base. Pendiente Bloques C-E (integración completa, CTA WhatsApp, QA). |
| - | Email | **Activar envío real de emails** | `MAIL_MAILER=log` en producción. Configurar SMTP/Mailgun cuando haya cuenta de correo |

### 🟢 Baja prioridad (deuda técnica / cleanup)

| # | Área | Feature / Fix | Detalle |
|---|------|--------------|---------|
| 11 | App móvil | **Paridad de features Expo** | La app móvil en `apps/` no tiene flujo de caja, preventas ni ventas. Prioritario si hay usuarios en campo. |
| 12 | Tests | **E2E post-refactor** | Los TCs del Bloque 12 (TC-78→TC-85) no cubren el historial mixto ni el ticket de impresión. Agregar casos. |
| 20 | Tests | **E2E checkout mixto** | Cubrir el escenario nuevo: folio cargado + producto regular + catálogo nueva preventa en una sola transacción. |
| 21 | Infra | **Secretizar Supabase keys** | Mover `TADAIMA_SUPABASE_SERVICE_KEY` de env var plana a Secret Manager. |
| 36 | Tests | **Borrar Bloque 5 E2E legacy** | TC-23 a TC-26 cubrían el endpoint `/pre-sales` y modales viejos ya eliminados. Borrar de `tests/e2e/tadaima.spec.ts` o reescribir contra el esquema único actual. |

---

## 1. Visión general del sistema

**Tadaima POS** es un sistema de punto de venta multi-sucursal diseñado para tiendas de electrónica y accesorios. El núcleo del negocio es el flujo de **preventas (pre-órdenes)**: los clientes reservan productos que aún no han llegado a la tienda, pagando un anticipo.

### Stack técnico

| Capa | Tecnología |
|------|-----------|
| Backend API | Laravel 11, PHP 8.3, MySQL (producción) / SQLite (tests) |
| Frontend web | React 18 + TypeScript + Vite + Tailwind CSS |
| App móvil | Expo (React Native) — en desarrollo |
| Paquetes compartidos | Monorepo con Turbo.js (`packages/api`, `packages/auth`, etc.) |
| Testing E2E | Playwright |
| Testing backend | PHPUnit con RefreshDatabase |

### Estructura del monorepo

```
Tadaima/
├── backend/          → Laravel 11 API (PHP 8.3)
├── landing/          → React 18 web app (lo que llamamos "la landing" / SellPage)
├── apps/             → Expo React Native mobile app (pendiente de desarrollo)
├── packages/
│   ├── api/          → Cliente HTTP compartido (preSaleCatalogs, preSaleOrders, etc.)
│   └── auth/         → Lógica de autenticación compartida
├── tests/e2e/        → Playwright E2E tests
└── docs/testcases/   → QA cases manuales
```

### Entornos

| Entorno | Frontend | API |
|---------|----------|-----|
| Desarrollo | http://localhost:5173 | http://localhost:8000/api/v1 |
| Tests E2E | http://localhost:5173 | http://localhost:8000/api/v1 |
| Producción | Docker (listo para deploy) | Docker (listo para deploy) |

---

## 2. Arquitectura del sistema

### Base de datos — tablas principales (64 migraciones)

```
Organización
  companies → stores ← users (circular dep resuelta con FK diferida)
                    ↓
               warehouses (no usados en seed actual)

Usuarios y acceso
  users → roles (Spatie: model_has_roles, role_has_permissions)
  Roles: admin | gerente | cajero

Catálogo de productos (inventario)
  product_categories → products → product_prices | product_store_prices
                               → product_images

Inventario
  inventory (product × warehouse × store)
  inventory_movements

Caja
  cash_registers → cash_register_sessions → cash_movements
  payment_methods ← store_payment_methods → stores

Ventas
  sales_drafts → sales_draft_items → sales
  sale_items | payments

PREVENTAS (ADR-010) — esquema único actual
  pre_sale_catalogs   ← admin define producto disponible para reserva
  pre_sale_orders     ← cajero crea folio cuando cliente reserva
  pre_sale_order_items
  pre_sale_order_payments
  pre_sale_order_logs
  (esquema legacy `pre_sales`+items+payments+logs eliminado 2026-05-15)

Apartados (Layaways)
  layaways | layaway_payments | layaway_logs

Soporte
  customers | customer_credit
  suppliers | mangas
  system_settings | system_logs
  notifications | point_transactions
```

### Backend — controladores activos

| Controller | Ruta base | Notas |
|-----------|-----------|-------|
| AuthController | `/auth` | login, logout, me |
| PreSaleCatalogsController | `/pre-sale-catalogs` | catálogos admin |
| PreSaleOrdersController | `/pre-sale-orders` | folios PREV-XXXXX |
| SalesController | `/sales` | ventas finales |
| SalesDraftController | `/sales-drafts` | borrador de venta |
| CashRegisterController | `/cash` | sesiones de caja |
| LayawayController | `/layaways` | apartados |
| CustomerController | `/customers` | — |
| ProductController | `/products` | — |
| ReportsController | `/reports` | ventas, inventario, caja |
| StoreController | `/stores` | — |
| UserController | `/users` | — |
| RoleController | `/roles` | — |
| PaymentMethodController | `/payment-methods` | — |
| InventoryController | `/inventory` | — |
| SystemSettingController | `/settings` | — |

### Frontend — páginas

| Página | Ruta | Estado |
|--------|------|--------|
| SellPage | `/sell` | ✅ Esquema único de preventas (catalogs+orders) |
| PreSalesPage | `/pre-sales` | ✅ Shell de 3 tabs (Catálogos/Folios/Difusión) — legacy eliminado 2026-05-15 |
| SalesPage | `/sales` | ✅ Activo (migrado a `getPreSaleOrders`) |
| ReportsPage | `/reports` | ✅ Activo |
| ProductsPage | `/products` | ✅ Activo |
| ClientsPage | `/clients` | ✅ Activo |
| LayawaysPage | `/layaways` | ✅ Activo |
| DashboardPage | `/dashboard` | ✅ Activo |
| AdminPage | `/admin` | ✅ Activo |
| StoresPage | `/stores` | ✅ Activo |
| SettingsPage | `/settings` | ✅ Activo |
| LoginPage | `/login` | ✅ Activo |
| TransfersPage | `/transfers` | ✅ Activo |

---

## 3. Evolución del módulo de preventas

### Por qué cambiamos la arquitectura

El módulo original (`pre_sales`) mezclaba en una sola tabla:
- El catálogo del producto (nombre, imagen, precio)
- La reserva del cliente (customer_id, anticipo, folio)

Esto creaba problemas:
1. Un mismo producto disponible para varias personas requería duplicar filas del catálogo
2. No había control real de cuántas unidades se podían reservar (`preorder_limit`)
3. Los precios se congelaban en creación pero el catálogo no era una entidad independiente
4. La vista de cajero mezclaba "qué está disponible para reservar" con "qué ya está reservado"

### La solución — dos tablas separadas (ADR-010)

```
pre_sale_catalogs
  Admin crea UN registro por producto disponible
  Tiene precio, anticipo mínimo, límite de reservas, fecha llegada
  Status: draft → published → closed | cancelled

pre_sale_orders (Folios PREV-XXXXX)
  Cajero crea UN registro por cliente que reserva
  Referencia al catálogo, tiene customer_id, anticipo pagado, saldo
  Status: pending → ready → delivered | cancelled | expired
```

### Flujo del nuevo esquema

```
Admin
  1. Crea pre_sale_catalog (draft)
  2. Publica → visible en modal de caja
  3. Cuando llega mercancía → PATCH status: "ready" en los folios

Cajero
  1. Abre modal "Preventas" en SellPage
  2. Ve CatalogCards (tab "Disponibles")
  3. Selecciona catálogo → agrega al carrito de preventa
  4. En checkout → createPreSaleOrder (folio + anticipo opcional en una sola llamada)
  5. Al liquidar → addPreSaleOrderPayment + updateStatus "delivered"
```

### Migraciones del nuevo esquema

| Migración | Descripción |
|----------|-------------|
| `2026_04_22_200001` | `create_pre_sale_catalogs_table` |
| `2026_04_22_200002` | `create_pre_sale_orders_table` |
| `2026_04_22_200003` | `create_pre_sale_order_items_table` |
| `2026_04_22_200004` | `create_pre_sale_order_payments_table` |
| `2026_04_22_200005` | `create_pre_sale_order_logs_table` |
| `2026_04_22_200006` | `migrate_pre_sales_to_catalogs` (data migration) |

---

## 4. Estado actual del seed (ambiente limpio)

Ejecutar: `php artisan migrate:fresh --seed`

### Datos sembrados

| Entidad | Valor |
|---------|-------|
| Empresa | Tadaima |
| Tienda 1 | Cel Centro Paseo Rodríguez |
| Tienda 2 | Macroplaza |
| Admin | admin@tadaima.mx / password |
| Gerente Centro | gerente.centro@tadaima.mx / password |
| Cajero Centro | cajero.centro@tadaima.mx / password |
| Gerente Macroplaza | gerente.macroplaza@tadaima.mx / password |
| Cajero Macroplaza | cajero.macroplaza@tadaima.mx / password |
| Cajas | 1 por tienda |
| Métodos de pago | Efectivo, Tarjeta Débito, Tarjeta Crédito, Transferencia (en ambas) |
| Catálogo 1 | iPhone 16 Pro Max 256GB — Negro Titanio ($28,999 · anticipo $5,800 · límite 5) |
| Catálogo 2 | Samsung Galaxy S25 Ultra 512GB — Titanio Gris ($24,999 · anticipo $5,000 · límite 3) |
| Catálogo 3 | AirPods Pro 2da Generación — USB-C ($6,499 · anticipo $1,300 · límite 10) |

**No hay**: productos de inventario, almacenes, clientes, ventas, preventas antiguas.

---

## 5. API Package — funciones exportadas por módulo

### Nuevo esquema (usar estas)

```typescript
// packages/api/src/preSaleCatalogs.ts
getPreSaleCatalogs(params?)          → PreSaleCatalogListResponse
getPreSaleCatalog(id)                → PreSaleCatalog
createPreSaleCatalog(input)          → PreSaleCatalog
updatePreSaleCatalogStatus(id, input)→ PreSaleCatalog

// packages/api/src/preSaleOrders.ts
getPreSaleOrders(params?)            → PreSaleOrderListResponse
getPreSaleOrder(id)                  → PreSaleOrder
createPreSaleOrder(input)            → PreSaleOrder     ← folio + anticipo en una sola llamada
addPreSaleOrderPayment(id, input)    → PreSaleOrderPayment
updatePreSaleOrderStatus(id, input)  → PreSaleOrder
markPreSaleOrderItemDelivered(orderId, itemId, status) → PreSaleOrderItem
```

> Módulo `packages/api/src/preSales.ts` y todos sus exports legacy fueron eliminados 2026-05-15. Si ves referencias en sesiones históricas, son del flujo viejo ya borrado.

---

## 6. Tests — estado actual

### Tests E2E (Playwright) — `tests/e2e/tadaima.spec.ts` (1,866 líneas)

| Bloque | TCs | Cobertura |
|--------|-----|-----------|
| Login / Setup UI | TC-01, TC-02 | Auth, empresa |
| Bloque 1 — Setup API | TC-03 a TC-08 | Sucursales, bodegas, categorías, métodos de pago |
| Bloque 2 — Usuarios y Roles | TC-09, TC-10, TC-12 | Cajero, gerente, rol supervisor |
| Bloque 3 — Productos e Inventario | TC-13 a TC-16 | Crear producto, stock, precios por tienda |
| Bloque 4 — Caja y Ventas | TC-18 a TC-21 | Selector tienda, sesión caja, venta API |
| Bloque 5 — Pre-ventas (legacy) | TC-23 a TC-26 | ⚠️ Obsoletos — el esquema y endpoint que cubrían fue eliminado 2026-05-15. Pendiente borrar/migrar. |
| Bloque 6-11 | TC-27 a TC-77 | Layaways, transfers, reports, UI flows |
| Bloque 12 — Preventas | TC-78 a TC-85 | Catálogos, folios, límites, toggle ítem (esquema único actual) |

### Tests backend (PHPUnit)

| Archivo | Tests | Assertions |
|---------|-------|-----------|
| `PreSaleCatalogsTest.php` | 7 | ~30 |
| `PreSaleOrdersTest.php` | 10 | ~35 |
| Total | 17 | ~65 |

### Test cases QA manuales/documentados

| ID | Archivo | Prioridad |
|----|---------|-----------|
| QA-01 | `docs/testcases/QA-01-flujo-completo-preventa.md` | P0 |
| QA-02 | `docs/testcases/QA-02-ciclo-caja-preventa.md` | P0 |
| QA-03 | `docs/testcases/QA-03-limites-validaciones-reportes.md` | P1 |

---

## 7. Decisiones de arquitectura (ADRs)

### ADR-001 — Monorepo con Turbo.js
Permite compartir `packages/api` y `packages/auth` entre web y mobile sin duplicar código. Turbo cachea builds para CI rápido.

### ADR-010 — Separación pre_sale_catalogs / pre_sale_orders
Ver sección 3. Razón principal: control de preorder_limit y separación de concerns admin vs cajero.

### ADR-011 — createPreSaleOrder atomíco
El endpoint `POST /pre-sale-orders` crea el folio Y registra el anticipo inicial en una sola transacción DB. Evita estados huérfanos (folio sin pago) y simplifica el checkout del cajero.

### ADR-012 — Folio con customer_id obligatorio
`customer_id` es requerido en `pre_sale_orders` por diseño. No existe folio sin cliente (política de negocio: toda reserva debe tener dueño identificado).

### ADR-013 — Precios congelados en folio
`unit_price` se copia del catálogo al crear el folio. Cambios posteriores en el catálogo no afectan folios existentes (inmutabilidad de transacciones financieras).

### ADR-014 — Carrito client-authoritative (2026-05-18)
El carrito vive en memoria + localStorage. Backend NO sabe del carrito hasta el cobro (`POST /sales` con `items[]` directos). Stock validado solo al cobrar con `reserveStock` + `lockForUpdate`. Cero requests por `+`/`-`. Tradeoff aceptado: doble venta posible (manejada con error claro). Reemplaza el flujo previo de drafts en vivo con observer que extendía `expires_at`.

### ADR-015 — cost_at_sale: snap del costo al INSERT (2026-05-22)
**Problema:** `products.cost` muta cuando admin re-precia inventario, corrompiendo todo reporte histórico de ganancia bruta (reportes leían el cost ACTUAL, no el del momento de la venta).

**Solución:** snap del cost al momento exacto del INSERT en líneas de transacción. Columnas `cost decimal(12,2) nullable` agregadas a `sale_items`, `pre_sale_order_items`, `layaways`. 5 write paths inyectados con snap inside-transaction:
1. `CheckoutService::checkout` → `sale_items.cost = $draftItem->product?->cost` (eager-loaded, sin query extra)
2. `CheckoutService::checkoutDirect` → hereda via delegación
3. `PreSaleOrderService::createOrder` → `products.cost` si vinculado, sino `catalog.cost` (pre-arrival)
4. `LayawayService::create` → snap al apartar (momento contable = reserva inventario)
5. `LayawayService::deliver` → propaga `layaway.cost` al `sale_items.cost` resultante (cadena de snaps)

**Read path:** `SaleItemResource` expone `item.cost` solo admin. Frontend prioriza `item.cost ?? item.product?.cost` (fallback al cost actual para ventas pre-migración).

**Backfill:** ninguno. Data anterior a 2026-05-22 será borrada en QA. Tests TDD blindan la invariante load-bearing: mutar `products.cost` después de venta NO afecta `sale_items.cost`.

**Patrón estándar:** Shopify (`inventory_unit_cost`), Stripe (`cost_of_goods_sold`), Square (columna directa en `order_lines`), Quickbooks/Xero (columna `cost` en item lines).

### ADR-016 — Cancelación de ventas: edit-in-place + tabla de log (diseño 2026-05-28, ejecución en fases)

**Decisión Joel 2026-05-28**: NO usar el patrón inmutable (Shopify/Square return records). En su lugar, **editar la venta original in-place** + mantener una **tabla de log** con snapshot de lo cancelado. Más cerca del patrón legacy/restaurant POS (Aldelo, NCR Counterpoint, Lightspeed simple, Quickbooks POS).

**Decisiones clave**:
1. **Edit-in-place**: `sales` se modifica directamente (decrementa qty, recalcula total). El log preserva el snapshot.
2. **Preventa liquidada cancelada → rollback a `ready` con saldo nuevo** (no a `cancelled`). El folio queda válido como si no se hubiera liquidado, cliente paga cuando llegue.
3. **Reverso de dinero como `cash_movements` tipo salida** en la sesión actual (no se intenta revertir en sesión cerrada). Sale en el corte del día como salida con referencia a la cancelación.
4. **Vista**: filtro/tab "Canceladas" en historial de caja + sección en Reporte del Día. Vista admin para auditoría queda para después.

**Riesgo vigilado (ADR-015)**: al editar `sale_items` decrementando qty, el snapshot `cost_at_sale` de items cancelados "desaparece" de la ganancia bruta del día. **El log table conserva snapshot completo** (qty, price, cost, product_id) para que reportes históricos puedan recalcular si se requiere.

**Schema propuesto** (Fase 2):
```
sales:
  + cancellation_status enum('none','partial','full') default 'none'
  + last_cancelled_at timestamp nullable

pre_sale_orders:
  + cancellation_status enum (igual)
  + last_cancelled_at
  -- Estado puede regresar: delivered → ready (rollback liquidación)
                           ready/pending → cancelled

sale_cancellations (tabla nueva):
  id, sale_id, pre_sale_order_id, mode enum('full','partial_items','liquidation_rollback'),
  reason_code enum('cliente_devuelve','error_cajero','dañado','no_llego','otro'),
  reason_text text, amount_refunded decimal, cash_movement_id (FK),
  items_snapshot json [{sale_item_id, product_id, name, sku, qty, price, cost, line_total}, ...],
  cancelled_by (FK user), cancelled_at, cash_session_id (FK)
```

**Plan en fases (TODAS COMPLETADAS 2026-05-28)**:

| Fase | Scope | Estado |
|------|-------|--------|
| **1. Visibilidad** | Tabs "Todas/Canceladas" + badges + sección H mínima. Sin backend. | ✅ |
| **2. Backend** | Migración `sale_cancellations` + servicio 3-modos + 2 endpoints + 6 PHPUnit. | ✅ |
| **3. UI cancelación** | `CancelTicketModal` con item selection + motivo + modes preventa; botón XCircle por fila en historial. | ✅ |
| **4. Reporte detallado + admin tab** | `GET /sale-cancellations` con filtros; sección H rediseñada con breakdown motivo+cajero; `TabCancelaciones` admin con filtros, paginación, snapshot expandible. | ✅ |

**Total real**: 4 fases completadas en una sola sesión 2026-05-28. Cobertura completa del flujo edit-in-place + log inmutable + reporte agregado + admin auditor.

**Comparativa de POS investigada**:
- **Aldelo / NCR Counterpoint**: edita venta + log table (patrón elegido).
- **Square**: editable 1 hr, después immutable + refund record.
- **Shopify POS**: refunds siempre crean orden separada (immutable).
- **Quickbooks POS**: editable con "History" pane.

---

## 8. Deuda técnica conocida

| Ítem | Prioridad | Descripción |
|------|-----------|-------------|
| App móvil | Alta | Expo app no tiene paridad de features con web. |
| Escaneo de folios en caja | Media | Botón "Escanear código" en SellPage aún no implementado. |
| Supabase keys en prod (secretizar) | Baja | ✅ Variables ya activas en Cloud Run prod (verificado 2026-05-15) como env var plana. Pendiente sólo mover a Secret Manager por higiene (ver fila #21 del backlog). |
| Rollback en checkout mixto | Baja | Si `addPreSaleOrderPayment` o `updatePreSaleOrderStatus` falla DESPUÉS de `createSale`+`createPreSaleOrder` exitosos, queda venta sin liquidación. Mover a transacción server-side cuando se priorice. |
| Migrar a React Query (TanStack Query) | Media | `@tanstack/react-query@^5.80.7` ya está en `landing/package.json` pero ningún componente lo usa — todo es `useState + useEffect + try/catch`. Migración incremental en 4 PRs (~10 hrs total): (1) setup `QueryClientProvider` + `getStores`; (2) `getProducts` + `getCustomers`; (3) `getPreSaleCatalogs` + `getPreSaleOrders` con invalidaciones cruzadas; (4) mutations con optimistic updates en SellPage. Beneficio: cache compartido entre páginas, refetch automático al navegar, rollback transparente. Cuidar separación server-state (cache) vs client-state (carrito, mesas, formularios → siguen siendo `useState`). |
| Permisos granulares (`product_scope`, `store_access`) | Media | El TabPermisos guarda JSON en `system_settings.price_permissions` pero NADIE lo lee. Hoy solo el flag `users.can_view_cost` se respeta (fix 2026-05-14). Implementar lectores: filtros de productos visibles en SellPage/ProductsPage, scope de tiendas en gerentes/cajeros, defensa server-side en `ProductController::index`, `ReportsController`, etc. Sprint dedicado. |
| Imagen en perfil de cliente | Baja | Sugerencia QA Ruben 2026-05-14. `customers` no tiene columna `image_path`. Requiere: migración + endpoint upload + UI con widget. Defer a sprint dedicado. |
| `preorder_limit` flexible post-arrived | Baja | Sugerencia QA Ruben — permitir admin subir (no bajar) el límite si llegan más unidades de las esperadas. Decisión Joel 2026-05-14: déjalo así por ahora. |

---

## 9. Comandos frecuentes

```bash
# Backend
cd backend
php artisan migrate:fresh --seed    # Limpiar y resembrar DB
php artisan serve                    # API en puerto 8000
php artisan test                     # PHPUnit
php artisan test --filter PreSaleOrders  # Test específico

# Frontend (desde raíz del monorepo)
npm run dev:web                      # SellPage en puerto 5173
npm run build:web                    # Build de producción

# Tests E2E
npx playwright test                  # Todos los tests
npx playwright test --grep "Bloque 12"  # Solo preventas nuevo esquema
npx playwright test --ui             # Modo visual interactivo
```

---

## 10. Deploy e infraestructura

| Aspecto | Estado |
|---------|--------|
| Docker | ✅ Configurado y listo para submit/deploy |
| Backend deploy | Simple — imagen Laravel + variables de entorno |
| Frontend deploy | Build estático de React (Vite) servido desde Docker o CDN |
| Base de datos producción | MySQL (SQLite solo para tests) |

**Flujo de deploy:**
```bash
# Seed de producción (solo si DB limpia)
php artisan migrate --force
php artisan db:seed --force

# Build frontend
npm run build:web

# Docker submit
docker compose up --build -d
```

**Pendiente antes de producción (checklist):**
- [ ] Correr QA UI completo desde navegador (post-corrección de bugs)
- [ ] Variables de entorno de producción configuradas (`.env.production`)
- [ ] App móvil (Expo) con paridad de features mínima

---

## 11. Historial de sesiones de desarrollo

> Sesiones anteriores a 2026-05-14 (>20 días) archivadas en git history para mantener el log ligero. Decisiones load-bearing preservadas en ADRs (§7) y secciones de arquitectura.

### Sesión 2026-06-03 — Corte del gerente en reportes (IVA, preventas), ventana de Cortes, Excel, repo móvil + deploy

**Objetivo**: Llevar al sistema las fórmulas del corte semanal del gerente (Excel `ejemplo corte Tadaima.xlsx`) y dar handoff de la app móvil al hermano.

**Reportes (Reporte del Día en /sales — el gerente sí accede; /reports es admin-only):**
- **IVA 16% sobre comisión de terminal** (del bloque "ventas con tarjeta" del Excel). Solo aplica a tarjeta: IVA = comisión × 0.16, y la comisión solo existe en pagos con terminal → efectivo/transfer muestran "—". Neto real = venta − comisión − IVA. En pantalla, impresión y PDF/Excel (columna "IVA com." + KPI). Const `IVA_COMISION_RATE = 0.16`. Usa la comisión real por terminal (no el 2.8% fijo del gerente).
- **Tablas detalladas de preventa (sección C)**: antes solo totales; ahora tabla de **anticipos** (Folio·Cliente·Artículos·Anticipo) y **liquidaciones** (Folio·Cliente·Artículos·Venta·Costo·Utilidad). **Utilidad REAL = venta − costo** (Joel rechazó la fórmula del gerente que restaba el anticipo al costo, que inflaba la utilidad). Costo/Utilidad admin-only. Requirió exponer `cost` (admin-gated, igual que `SaleItemResource`) en `PreSaleOrderItemResource` + tipo `PreSaleOrderItem.cost` en packages/api → por eso el deploy backend.
- **Export a Excel (.xlsx)**: botón "Excel" junto a PDF. `exportDailyReportXlsx` con import dinámico de exceljs (chunk lazy ~256kB gzip, solo carga al exportar). Confirmado: el corte semanal NO necesita reporte nuevo — el Reporte del Día ya acepta rango de 1+ días (su "semana" = elegir 7 días).

**Caja:**
- **Ventana de Cortes** (`components/cash/CortesModal.tsx`): botón "Cortes" en toolbar de SellPage → lista cortes por rango + click abre `CashCloseSummaryModal` existente (z-index 450 < 500 del detalle). RBAC ya estaba en `/reports/cash` (cajero propios / gerente tienda / admin todo). No requiere caja abierta (lee historial por rango de fechas).

**App móvil (handoff al hermano):**
- `pos-app` ahora es **repo git independiente** `git@github.com:joeldorado/tadaima-app-pos.git` (separado del monorepo `tadaima-pos`). `.gitignore` ajustado para ignorar `.env`. Login verificado contra prod (pier@tadaima.mx / Tadaima2026; el viejo "devaccess" era de la prod pre-reset del 2026-05-30).
- Docs generados (agentes planner + code-explorer): `docs/BACKEND_API.md` (contratos de endpoints — caja/sessions/ventas reutilizables tal cual; checkout con `items[]` ADR-014; NO hay endpoint de tipo de cambio USD), `docs/FASE_1_PLAN.md` (9 chunks), `RUBEN_WORKLOG.md` (onboarding + bitácora + buzón de sync). `AGENTS.md` apunta a ellos.

**Deploy & verificación:**
- Commit `d593586` → push a `tadaima-pos` (branch dev/qa-handoff). Deploy `gcloud run deploy tadaima --source .` → **rev `tadaima-00063-gwt`** (100% tráfico). Login + landing verificados.
- Fixes de deploy: `apps/.gitkeep` (apps/ quedó vacío al mover el móvil a pos-app → el `COPY apps` del Dockerfile no falla) + nuevo `.gcloudignore` (excluye pos-app/, node_modules de 334M, secretos y .git del upload de Cloud Build).
- Verificado: `vite build` OK · 22/22 tests de preventa PHPUnit · PHP lint · landing tsc `--noEmit`. **Nota:** `npm run build` (`tsc -b`) sigue rojo por errores PRE-EXISTENTES ajenos (`exactOptionalPropertyTypes` en Settings/Stores/Transfers/StockSearch) — NO afecta el deploy porque el Dockerfile usa `vite build` directo y salta tsc.

### Sesión 2026-06-02 — App móvil reiniciada: `pos-app` standalone (login + home funcionando)

**Contexto:** la app móvil `apps/mobile` (Expo SDK 54 + expo-router + NativeWind v4) **tronaba sin remedio**. Causa raíz: vivía dentro del workspace npm del monorepo, así que sus deps se hoisteaban a la raíz y **Metro no resolvía `react-native-css-interop/jsx-runtime`** (la dep interna de NativeWind quedaba anidada bajo `nativewind/node_modules`, irresoluble desde `expo-router`). El parche `extraNodeModules` de la sesión previa nunca sirvió. Esta sesión se intentó migrar a **twrnc** (Tailwind RN en JS puro) — tsc verde y el error de css-interop desapareció del bundle — **pero volvió a tronar igual** porque la raíz del problema era el workspace, no la librería de estilos.

**Decisión (Joel):** empezar limpio. Crear app nueva standalone, olvidar NativeWind/tailwind por completo.

**Qué se hizo:**
- **Creado `pos-app/`** con `create-expo-app -t blank-typescript` (Expo SDK 56, RN 0.85, React 19, TS 6). **Standalone: NO está en `workspaces` del root** (`["landing","apps/*","packages/*"]`) → `node_modules` propio y completo, **cero hoisting**. Esta es la decisión load-bearing que evita que vuelva a tronar. **No meterlo a workspaces.**
- **Sin librería de estilos:** puro `StyleSheet` de RN + `src/theme.ts` (paleta zinc + rojo marca `#E0221A`). Nada de NativeWind/twrnc/tailwind.
- **Sin router:** navegación por estado en `App.tsx` (`useAuth()` → splash / Home / Login). Login y logout solo cambian `user`; re-renderiza y cambia de pantalla. Evita la complejidad babel de expo-router.
- **Capa `lib/` portada** desde apps/mobile con imports relativos (sin alias `@/`): `api/` (axios client + auth + types), `auth/` (AuthContext + tokenStorage con expo-secure-store + espejo síncrono), `queryClient.ts` (React Query persistido en AsyncStorage), `permisos.ts` (RBAC).
- Pantallas: **LoginScreen** (look oscuro de marca) + **HomeScreen** (saludo, rol, tienda, estado de caja placeholder, verificación de sesión, cerrar sesión).
- Backend por default: Prod Cloud Run vía `EXPO_PUBLIC_API_URL` en `pos-app/.env`.
- **`apps/mobile` archivado** en `backups/apps-mobile-archivado-2026-06-02` (era su propio repo git; reversible, borrar cuando se confirme estable).

**Estado:** ✅ **Carga y login funciona** (confirmado por Joel en Expo Go). tsc verde. Pendiente: paridad de features (caja/productos/ventas/preventas) — Home hoy es andamio. Correr con `cd pos-app && npx expo start`.

### Sesión 2026-05-28 (cierre del día) — ADR-016 Fases 2-4 completas, Aceternity UI, refactor Caja 2-cols, perf RQ

**Contexto:** continuación del sprint largo del día. Joel aprobó Fase 2+3+4 de ADR-016 después de validar Fase 1, pidió pilotar Aceternity UI en Dashboard, y dirigió un refactor mayor del layout de Caja (footer → sidebar derecho sticky estilo Square POS).

**Bloques principales:**

#### 1. ADR-016 Fase 2 — Backend cancelación (~14 hrs estimado real ~3 hrs)
- Migración `2026_05_28_000001_create_sale_cancellations_table`:
  - `sales` + `pre_sale_orders`: `cancellation_status` enum('none','partial','full') + `last_cancelled_at`.
  - Nueva tabla `sale_cancellations`: `sale_id`, `pre_sale_order_id`, `mode`, `reason_code`, `reason_text`, `amount_refunded`, `cash_movement_id`, `cash_session_id`, `items_snapshot` JSON, `cancelled_by`, `cancelled_at` + indexes.
- Modelo `SaleCancellation` con constantes (MODE_FULL, MODE_PARTIAL_ITEMS, MODE_LIQUIDATION_ROLLBACK + 5 REASON_*).
- `SaleCancellationService`:
  - `cancelSale()` — full o partial. Edita `sale_items` in-place (delete row si qty=0), restaura inventario vía `InventoryMovement` type='devolucion' en bodega de la tienda original, recalcula total/subtotal, marca status='returned' si full o cancellation_status='partial' si parcial.
  - `cancelPreSaleOrder()` con 2 modos:
    - `full` → status='cancelled', reversa TODOS los payments, restaura stock si fue entregada.
    - `liquidation_rollback` → delivered→ready, reversa SOLO último payment, marca items.delivered_at=null + status='pending', restaura stock.
  - `createRefundCashMovement()` → `cash_movements` type='salida' en sesión activa con descripción referencial.
  - Snapshot incluye `cost_at_sale` (ADR-015 preservado aunque se edite sale_items).
  - Audit en `system_logs` con action='sale.cancelled' o 'pre_sale_order.cancelled'.
- 2 endpoints: `POST /sales/{id}/cancel` + `POST /pre-sale-orders/{id}/cancel`, validados con Laravel Request (motivos enum, items shape, sesión exists).
- 6 tests PHPUnit (`SaleCancellationTest`): full cancel + partial + snapshot preserva cost + double-cancel rechazado + liquidation rollback completo + full pre-sale cancela todos los pagos. **50/50 PHPUnit pasan**.
- `SaleResource` + `PreSaleOrderResource` exponen `cancellation_status` para que el frontend distinga parcial vs total.

#### 2. ADR-016 Fase 3 — UI de cancelación
- `landing/src/components/cancel/CancelTicketModal.tsx`:
  - Para sales: checkbox por item + qty editable (con max=qty original) + dropdown motivo (5 opciones) + notas opcionales + Enter dispara submit.
  - Para preventas: 2 botones de modo (Rollback liquidación si delivered / Cancelar folio completo) con descripción de qué hace cada uno.
  - Footer con "Salida estimada" en rojo + botón confirmar.
- Botón **XCircle** rojo por fila en historial de caja (sale + preventa). Oculto si ya cancelada.
- State `cancelTarget` + render del modal. Z-index 500 (encima del historial z-400).
- OnSuccess invalida historial + cancellations + sales + preSaleOrders queries → bg refresh automático.
- Iconografía: XCircle en vez de Trash2 (feedback Joel: "Trash2 confunde, parece borrar permanente"; XCircle es el equivalente del Material `cancel`).

#### 3. ADR-016 Fase 4 — Reporte detallado + tab admin
- Backend: `SaleCancellationsController::index` con filtros `from/to/store_id/reason_code/cancelled_by`, paginado, eager-loads relaciones; `SaleCancellationResource` con snapshot completo.
- `useSaleCancellationsQuery` hook (cache 30s).
- Sección H del Reporte del Día rediseñada — lee del log real (antes filtraba `status='returned'` que no captura parciales): 4 KPIs (eventos, monto reversado, ventas brutas = netas + cancelado, ventas netas reales con math correcto) + tabla **Por motivo** con % + tabla **Por cajero**.
- **Tab "Cancelaciones" en AdminPage** (`TabCancelaciones.tsx`): tabla full-screen con filtros (rango fechas default 30d, motivo dropdown, cajero, tienda, search libre), columnas Fecha/Tipo/Referencia/Modo badge color-coded/Motivo/Cajero/Monto, expand por fila con notas + snapshot completo de items (qty/price/cost) + ref a cash_movement #N y sesión #N. Paginación completa.

#### 4. QA real de cancelación + tests
Joel hizo cancelación parcial real (venta #60, $600 de "Perfect order bundle Ingles"):
- ✅ `sale_cancellations` #1 creado correctamente
- ✅ `sales.total $2,800 → $2,200`, cancellation_status='partial'
- ✅ Item snapshot preservó `cost: $300` (ADR-015 ok)
- ✅ `cash_movements` #1 salida $600 sesión 17
- ✅ `system_logs` #36 action='sale.cancelled'
- ✅ Stock restaurado en Tienda 1 — Centro qty=1 (era 0)

Fix lateral del z-index del CancelTicketModal (z-200 → z-500) tras Joel reportar que quedaba detrás del modal de historial.

#### 5. Aceternity UI piloteado en Dashboard
Joel pidió "qué librería combinaría con lo que usamos para mejorar look manteniendo el toque glass". Recomendé **Aceternity UI** (copy-paste basado en Tailwind + motion, compatible 100% con el stack actual). Pilotado en Dashboard:
- `components/aceternity/BackgroundBeams.tsx`: 32 SVG paths con gradiente animado motion individual (10-20s ciclos aleatorios), terminal en `#E0221A`. Solo render para admin/gerente (cajero excluido).
- `components/aceternity/HoverCard.tsx`: wrapper con blob blur detrás (AnimatePresence entrada/salida) + spotlight radial 220px que sigue al cursor. Acepta prop `accent` para color (verde si cajero tiene caja abierta, rojo Tadaima si no, etc.).
- Integrado en cards de "Cajeros conectados" y "Cortes de hoy".
- `relative z-10` agregado a todas las secciones top-level del Dashboard para layering correcto sobre los beams (z-0 absolute).

#### 6. Caja UX — Refactor mayor a layout 2 columnas Square-style
Delegado a agente con prompt detallado:
- **Izquierda `flex-1`**: items del carrito con scroll propio + toolbar (Catálogo / Preventas / Cliente / Cancelar venta / scanner search).
- **Derecha `<aside w-[420px] xl:w-[460px]`**: sidebar vertical pinned con border-l glass-dark.
  - Scroll wrapper `flex-1 overflow-y-auto justify-end` — contenido alineado al FONDO, crece de abajo hacia arriba. Total a Pagar centrado horizontal (decisión Joel "que crezca de abajo para arriba").
  - Secciones apiladas: Total → Cliente (avatar 40px + nombre text-lg + Cambiar/Quitar) → Cash input híbrido USD+MXN.
  - **Footer sticky shrink-0** con border-top: grid 12-cols con Método de pago `col-span-4` (chip discreto, dropdown abre HACIA ARRIBA) + Cobrar `col-span-8` (CTA dominante).

Mobile (<md) sidebar oculto; fallback al layout vertical previo. Floating multi-mesa shortcuts movidos a bottom-left para no chocar con el sidebar.

#### 7. Caja UX — presets cuadrados con todas las denominaciones
Joel: "aprovechando la altura agregar mas si faltaran, que sea cuadrado los numeros en espacio para que no se equivoque":
- USD: $1, $5, $10, $20, $50, $100 (todos los billetes US, antes solo 4).
- Pesos: $20, $50, $100, $200, $500, $1000 (todos los billetes MX).
- 6 botones cada uno en grid 3×2 con `aspect-square text-2xl`. Cada botón tiene "MXN" / "US$" label arriba (text-[10px]) + número grande abajo. Tap targets ~120×120px.

#### 8. Caja UX — default pesos por mesa
Bug: `showUsdInput` era `useState(false)` global. Una vez activado en una venta, la siguiente venta también iniciaba en USD. Fix: campo `usdPrimaryMode?: boolean` en `Mesa` interface (default false en `makeMesa`). Wrapper derivado + `clearCart` lo resetea. Cada venta nueva o post-checkout vuelve a pesos.

#### 9. Caja UX — input híbrido USD+MXN refinado + cambio dual
- Input number text-4xl con tabular-nums, border-2.
- Modo USD primario: pesos OCULTO hasta que USD no cubra → auto-aparece banner amber "Completa con pesos · faltan $X" + pesos input con autoFocus.
- Cambio en MXN principal + "≈ US$X" debajo cuando se cobró con dólares (devolver físicamente parte del cambio en USD).
- Fix gate Cobrar: antes solo contaba pesos → "Falta efectivo" bloqueaba aunque USD cubriera. Ahora cuenta `pesos + USD × TC`.

#### 10. Historial → React Query con persist + invalidate-on-event
- `useTodayHistorialQuery` hook (cache 30s persistido en IndexedDB).
- Antes: `useState` global + `fetchHistorial()` manual. Ahora: apertura instantánea del modal + bg refetch tras cada checkout/cancelación.
- MixedPairs (preventa↔venta) recomputado vía useEffect reactivo.
- Invalidaciones en los 3 paths de checkout + onSuccess del CancelTicketModal.

#### 11. Perf — Acotar llamados RQ (decisión Joel)
- `usePreSaleOrdersQuery`: quitado `refetchInterval: 60s` → cache 5min + invalidate-on-event + refetchOnWindowFocus. Trade-off cross-máquina pierde sync tiempo real.
- `useExchangeRateQuery`: `staleTime` 5min → 24h, sin `refetchOnWindowFocus`. Solo refetch al abrir caja (handleOpenCash invalida) o cuando SettingsPage cambia.
- Quitado `useBackgroundProductsPrefetch` (traía 1000 productos extra al abrir caja). Solo top-200 + búsqueda server-side bajo demanda.
- `useMangasQuery`: agregado cache 24h + persist + refetchOnFocus (antes bare, refetch cada mount).

#### 12. Caja UX — micro-fixes
- **Iconografía cancelación**: XCircle en vez de Trash2 (Joel: "trash confunde como borrar permanente").
- **Botones Cambiar/Quitar cliente legibles**: colores sólidos `#10b981` / `#ef4444` (antes white/70% sobre bg claro = invisible). text-[11px] (era 9px), icon 13px.
- **Tamaños tipográficos**: Total a Pagar 32→40px tabular-nums; Cliente avatar 28→40px nombre lg; EFECTIVO h-44→52 icon 14→16; "≈ X MXN" inline 11→16px opacity 100%.
- **Form rápido nuevo cliente**: footer sticky en popup asignar (antes al final del scroll); form compacto Nombre full-width + Teléfono/Email grid 2-col + Enter submit + único botón "Crear y asignar"; pre-rellena nombre con search.trim().
- **Auto-open popup cliente al cobrar preventa sin cliente**: toast amber + abre popup en modo manual directo.
- **Bug fix del cambio total**: cuando USD recibido cubría el total el "Falta efectivo" gate del botón bloqueaba (solo contaba pesos). Fix: `totalReceived = pesos + USD × TC`.

#### Estado al cierre
- ✅ Backend: **50/50 PHPUnit verde** (6 nuevos en SaleCancellationTest).
- ✅ Frontend: `vite build` verde tras cada cambio.
- ✅ Migración aplicada en local. Pendiente prod (próximo deploy aplica con `php artisan migrate`).
- ✅ Aceternity Background Beams + HoverCard funcionando.
- ✅ Layout caja 2-columnas + footer sticky + presets cuadrados.
- ✅ Cancelación end-to-end validada con QA real de Joel (venta #60).

---

### Sesión 2026-05-27/28 — QA Ruben ronda 6, página Existencias, gerente catálogos, cashReceived por mesa, USD híbrido, split por método, ADR-016 cancelación

**Contexto:** Joel volvió con PDF "QA - Tadaima Web 6" de Ruben (solo 1 bug formal pero múltiples requisitos RBAC + nueva feature de existencias cross-tienda). Después agregó pedidos UX/perf y un análisis de cancelación de tickets que cerramos como ADR-016.

**Bloques principales:**

#### 1. Bug raíz QA: permiso de costo no se respetaba (ronda 6)
`ProductResource:28`, `MangaResource:14`, `MangaCompatResource:27` gateaban con `hasRole(admin) && can_view_cost`. Bug confirmado: cajero/gerente con flag delegado nunca veía el costo (AND requería ser admin además). Fix: cambiar `&&` → `||`. `SaleItemResource` queda admin-only a propósito (reportes de ganancia son admin solo, alineado con "gerente no ve datos financieros de otras tiendas"). Nuevo `tests/Feature/CostPermissionTest.php` con 4 tests TDD (admin / cajero sin flag / cajero con flag / gerente con flag) — 44/44 PHPUnit pasan.

#### 2. Stock por tienda visible en detalle de producto/tomo + costo
`ProductDetailModal` y `MangaDetailModal` ahora aceptan `canViewCost` + `highlightStoreId`. Nuevo campo "Costo real" gateado por el flag. Nueva sección "Stock por tienda" vía componente reusable `StoreStockBreakdown.tsx` (en `components/inventory/`) + hook `useInventory.ts` (`useProductInventoryQuery` cache 30s). Backend: `InventoryController::index` eager-loads `warehouse.store`; `InventoryResource` expone `warehouse.store: {id, name, phone}`. Type `InventoryItem` en `packages/api` actualizado.

#### 3. Página nueva "Existencias" (`/buscar-tiendas`)
Para admin/gerente/cajero. Cumple requisito Joel: "lo que sí puede ver un gerente o cajero es buscar si el producto existe en otra tienda". Buscador con `useProductsSearchQuery` debounced 250ms + **scanner USB integrado** vía `useBarcodeScanner` (auto-selecciona match exacto por SKU/barcode o cuando hay 1 solo resultado — Joel pidió "que en caja meta scanner y muestre si en mi tienda hay de una vez"). Click en producto → panel con `StoreStockBreakdown showContact` listando cantidades por sucursal + botones **Llamar** (`tel:`) y **WhatsApp** (`https://wa.me/52…` antepone 52 a números MX) usando `store.phone`. PageKey `stock_search` en `lib/permisos.ts` + Layout (label corto "Existencias" tras feedback Joel "no cabe el título"). Icono `PackageSearch`. Fila resaltada verde con badge "Tu tienda" cuando es la del usuario.

#### 4. UI fix de filas de tienda + nav label
Joel reportó "el ui ux esta un poco pegado apenas veo la tienda" + nombre de tienda truncado por botones Llamar/WhatsApp. Refactor del row en `StoreStockBreakdown`: línea principal (icono + nombre + cantidad), botones de contacto pasan a 2da línea full-width. Nombre nunca se trunca por buttons.

#### 5. Gerente: catálogos de preventa "gestión completa, solo su tienda" (reversa #59)
Decisión Joel 2026-05-27: gerente debe gestionar catálogos igual que admin, pero al asignar stock por tienda solo puede su sucursal. PreSalesPage: agrega "gerente" a tab Catálogos, mueve "Disponibles" a cajero-only. `NewPreSaleCatalogModal` con `restrictedStoreId`: filtra el selector y OCULTA asignaciones de otras tiendas al gerente (sin esto vería ganancias/stock ajeno). Backend: `PreSaleCatalogsController::syncStoreLimits` con `?int $restrictToStoreId` param — solo toca esa tienda y PRESERVA intactas las allocations de otras (no replace-all). Helper `storeLimitScope(Request)` infiere scope desde rol. Admin sigue con replace-all.

#### 6. Fix cliente persistente entre ventas (defensivo)
Joel reportó en prod que tras liquidar una preventa, al crear otra el cliente anterior aparecía asignado. Audité los 3 paths de checkout — todos llaman `clearCart()`. Bug real probable: estado residual del popup `assignCustomerPopup` o input `customerSearch` no se limpiaban. Fix: `clearCart()` blindado ahora también resetea `assignCustomerPopup=null`, `showCustDrop=false`, `requireCustomerFlash=false`, `cashReceived=""` y `cashReceivedUsd=""` en el update de la mesa.

#### 7. `cashReceived` y `cashReceivedUsd` por mesa (no global)
Bug encontrado: era `useState("")` global; al cambiar entre Caja Principal / Venta 2 / Venta 3 se perdía lo ingresado. Agregados `cashReceived?: string` + `cashReceivedUsd?: string` a interface `Mesa`. Wrappers derivados: `cashReceived = activeMesa.cashReceived ?? ""` + setters que llaman `updMesa`. `updMesa` movido arriba (línea ~460) para estar disponible donde se usan los wrappers. Cada mesa conserva sus inputs al cambiar de tab. Sobrevive snapshot zustand a localStorage.

#### 8. Botón "Mover artículos a otra caja" (split por método de pago)
Joel pidió: cuando hay items con métodos incompatibles (preventa + producto solo-tarjeta), botón para enviar los conflictivos a otra caja en lugar de forzar el cambio de método. Helpers `itemAcceptsMethod(item, method)` (considera preventa, `payment_restriction=cash_only`, `allow_cash`/`allow_card`) y `methodForItems(items)` (infiere método target). Handler `splitToOtherMesa()`: encuentra mesa vacía o crea Venta N nueva → mueve items conflictivos + copia cliente + asigna método correcto al destino. Items `isFromPreSale` (de folio cargado) se PRESERVAN en la actual (no se pueden mover sin romper liquidación). Banner ámbar arriba del dropdown solo cuando hay items movibles conflictivos.

#### 9. "Dólares" fuera del dropdown + input híbrido USD+MXN dentro de Efectivo
Decisión Joel 2026-05-28: la práctica real es que el cliente entrega dólares + pesos al mismo tiempo, no que toda la venta sea en USD. Métodos ahora: **Efectivo / Tarjeta / Transferencia**. Migración automática: mesas hidratadas con `paymentMethod="Dólares"` se normalizan a `"Efectivo"` al cargar. Bloque primario "Pesos recibidos" + presets $50/100/200/500. Toggle "+ Dólares (TC X.XX)" revela bloque verde con USD + presets US$10/20/50/100. Cálculo: `total = pesos + USD × TC`. "≈ X MXN" inline. Cambio/Falta siempre en pesos (es lo que físicamente das al cliente). Ticket impreso muestra desglose `· Pesos · Dólares (US$X ≈ $Y)` cuando hubo USD. Field `CompletedSaleData.amountReceivedUsd?` agregado para preservar el dato en comprobante. **No requiere cambio de schema en backend** — `payments[].amount` sigue siendo MXN total. Botón editar TC ahora visible siempre para admin en Efectivo.

#### 10. Textos más grandes en caja (feedback cliente)
Bumps targeted en carrito (sin tocar layout): nombre producto `text-sm`→`text-base`, SKU `text-[10px]`→`text-[11px]` opacidad subida, cantidad +/− `text-sm`→`text-base`, precio por línea `text-sm`→`text-base`, "de $X" anticipo `text-[9px]`→`text-[11px]`, nombre cliente footer `text-sm`→`text-base`. Label método pago `text-[11px]`→`text-xs`.

#### 11. Fix display historial: preventa al 100% resalta + monto correcto
Joel reportó "anticipo salió 0 y cobro total" + "historial salió mal" después de test en caja. Diagnóstico: bug de presentación, no de data. `SellPage.tsx:6521` mostraba `order.total` (valor preventa) en vez de `paid_amount` (lo cobrado hoy) en el monto grande del historial. Una preventa nueva con $0 anticipo de $1000 mostraba "$1000" en grande aunque no cobraste nada. Fix: monto grande = `paid_amount` para no-mixtas (mixto sigue con `grandTotal`). Status `delivered` muestra badge verde resaltado "**Liquidada · $X cobrado**" en lugar de etiqueta tenue. Estados pending/ready: "Anticipo $X / Sin anticipo / Pendiente $X". Tooltip preserva valor total de la preventa.

#### 12. ADR-016: sistema de cancelación de ventas (diseño + Fase 1 en curso)
Joel pidió analizar cancelación de tickets. Definimos 4 decisiones: **edit-in-place + log table** (no inmutable estilo Shopify) · preventa liquidada cancelada → rollback a `ready` con saldo nuevo · dinero sale como `cash_movements` tipo salida en sesión actual · vista con filtro/tab "Canceladas" en caja + sección en Reporte del Día. Plan en 4 fases (~26-31 hrs total). **Fase 1 (visibilidad sin backend nuevo) en ejecución** — usa `sales.status='returned'` y `pre_sale_orders.status='cancelled'` que ya existen. Ver ADR-016 en §7.

#### Estado al cierre (en curso)
- ✅ Backend: 44/44 PHPUnit verde tras Fase A (cost fix + nuevo test).
- ✅ Frontend: `vite build` verde tras cada bloque.
- ⏳ Sin commits aún — Joel push único al final.
- ⏳ ADR-016 Fase 1 en ejecución (tab/filtro Canceladas + sección Reporte).

---

### Sesión 2026-05-25 — Sesiones de caja conflict, QA ronda 5, margen visible en mangas, quitar cliente

**Contexto:** Joel volvió después de unos días. Sesión enfocada en fixes operativos del PDF "QA Tadaima Web5" + bugs reportados por Ruben + un caso real propio de Joel (sesión de caja abierta en otra computadora).

**Bloques principales:**

#### 1. Cash session conflict — open + force-close + selector enriquecido
Joel reportó "No deja abrir la caja, incluso si seleccioné una caja que no está siendo usada". Diagnóstico: el backend tenía dos guardias (`user-level` y `register-level`) que solo tiraban `DomainException` genérica sin info de quién/dónde está la sesión existente. El cajero/gerente no podía reanudar su propia sesión colgada ni el admin podía forzar cierre desde la UI.

**Backend:**
- `App\Exceptions\CashSessionConflictException` con `kind: 'own'|'foreign'` + `existingSession` Eloquent.
- `CashRegisterService::open()` tira la excepción tipada (en vez de DomainException) con la sesión eager-loaded (`register.store`, `user:id,name`).
- `CashRegisterController::open()` traduce a HTTP 409 con shape estructurado: `{conflict, existing_session: {id, user, register, store, opening_cash, opened_at, same_register}}`.
- Nuevo endpoint `POST /cash/sessions/{session}/force-close` admin-only — cierra la sesión por su dueño (`opening_cash` = closing si no se manda otro). Audit en `system_logs` con `entity_type=cash_session`, action `cash_session.force_closed`.
- `GET /cash/registers` ahora retorna `active_session: {id, user_id, user_name, opened_at, opening_cash, sales_count} | null` por cada caja. Sin queries extra para el selector.
- `CashRegisterSession::sales()` relación HasMany agregada para `withCount(['sales'])`.

**Frontend (`packages/api/src/cash.ts`):**
- `openSession()` ahora devuelve `OpenSessionResult = {ok:true, session} | {ok:false, conflict}`. Catchea 409 y lo envuelve.
- `forceCloseSession(sessionId, closingCash?)` para el botón admin.
- `getCashRegistersWithSession()` para el selector enriquecido.
- `useCashRegistersWithSessionQuery()` hook análogo.

**UI (`components/cash/OpenSessionConflictModal.tsx`):**
- Modal único que distingue 3 escenarios según `kind` + `same_register`:
  - `own + same_register` → CTA verde "Continuar sesión" (reanuda invalidando `cash.activeSession`).
  - `own + otra caja` → CTA rojo "Cerrar y abrir nueva" (force-close + reopen con los mismos params).
  - `foreign` → muestra quién/cuándo. Admin ve "Forzar cierre"; otros ven solo info + sugerencia de contactar al dueño/admin.
- Display de la sesión existente: caja, tienda, cajero, hora apertura, efectivo inicial, ID.
- Integrado en `SellPage.handleOpenCash` con state `openSessionConflict` + handlers `handleResumeOwnSession` / `handleForceCloseAndReopen`.

**Selector "Abrir Sesión de Caja"** (modal en SellPage): muestra debajo del nombre de la caja un badge:
- 🟢 verde "Tu sesión activa · #N" si es del propio user.
- 🟡 ámbar "Ocupada por X · #N" si es de otro.
- Sin badge si está libre.

Solo se hace fetch cuando el modal se abre (`enabled: !cashSession && showOpenCashModal`).

#### 2. Mangas: margen % visible para admin + gerente (siempre)
Joel pidió mostrar el campo `Margen %` y el cálculo de costo derivado (`precio × (1 − margen%)`) sin gate `canViewCost` en mangas/librería. Razón: el cost de libros se deriva del margen sobre precio público, y todos los roles que entran al modal (admin+gerente) necesitan ver/editar.

- `MangaEditModal.tsx` tab Precios: quitado `{canViewCost && ...}` en 3 puntos (grid cols, input margen, badge "Costo real").
- `MangaBatchModal.tsx` (Alta de Tomos): mismo cambio en el form de creación.
- Productos regulares siguen con su gate por `canViewCost` (NO cambian).
- Backend ya aceptaba `profit_margin_percent` sin restricción de rol.

#### 3. Quitar cliente desde Caja (todos los roles)
Bug Joel: "una vez que agregas cliente a la caja no te permite quitarlo deberia de poder quitarlo si se equivoco todos los roles".

- Nueva función `clearCustomer()` en SellPage — limpia `customerId/Name/Phone/Email/isNewCustomer` + reset del search input + toast info.
- Botón ✕ discreto en el chip "Cliente" del footer (venta regular, solo cuando hay cliente asignado).
- Botón "Quitar" del header de preventa ahora también usa `clearCustomer` (mismo flujo único).
- **Excepción de seguridad**: si `loadedPreSaleOrderId` está presente (folio cargado de DB), NO permite quitar — desincronizaría con `pre_sale_orders.customer_id` backend. Toast de error + botón disabled con tooltip.

#### 4. QA fixes ronda 5 (PDF "QA Tadaima Web5")
Joel mandó PDF con 7 items. 5 son bugs reales que arreglé, 2 ya estaban resueltos.

| # | Bug | Fix |
|---|---|---|
| 8 | Scanner suma 2 al re-escanear | **Nueva función `addScanToCart()`** separada de `addToCart()`. Nunca suma. Si producto ya está en venta → toast info + return. Solo +/- manual incrementa. Dedup window 1.5s → 3s. Aplicado en local match (línea 1543) y backend match (línea 1589) del `handleScannedCode`. |
| 1 | MangaEditModal no permite agregar tienda nueva | Selector "Agregar tienda" portado de QuickStockModal. Carga `getWarehouses({active:true})`, filtra por `restrictedStoreId` (gerente). Estado `pendingAddWh` + `pendingAddQty` + botón "+ Agregar". Empty state actualizado. |
| 5 | Lista de Tomos sin volumen visible | Badge rojo "Vol. N" inline con el nombre del manga en la tabla. Visible incluso cuando hay imagen del producto. |
| 3 | Search Enter borra el input ("regresa todos") | Quitado `if(Enter) setSearch("")` en Productos (línea 1992) y Tomos (línea 2418). Enter ahora muestra toast `No se encontró "XXX"` si filtered está vacío. Escape limpia el campo. |
| 7 | Gerente ve "Completar ahora" en transfers | Botón condicional `{isAdminUser && ...}`. Gerente solo ve "Solicitar". El admin de destino confirma la recepción del lado opuesto. |
| 2 | Caja no carga 4.5 (verificación) | ✅ Ya resuelto en sesión 2026-05-21 (línea 2524 del masterlog) — `setQueryData` + gate relajado |
| 4 | Gerente ve stock otras tiendas en MangaEditModal (verificación) | ✅ Filtro `restrictedStoreId` ya activo (línea 116 del MangaEditModal). Confirmado en build actual. |
| 6 | Gerente no ve preventas (verificación) | ✅ `PreSalesPage` ya tiene catálogos solo admin. El screenshot del QA aparece logueado como ADMIN, por eso ve la tab. |

#### 5. Verificación Supabase loyalty (request Joel)
Joel pidió verificar si la conexión REST a Supabase sigue activa o si hay que rotar la API key. Hice un test directo:
- URL: `https://tfbhysypjuoadgnwjaba.supabase.co` ✓
- SERVICE_KEY en Cloud Run: 219 chars JWT (`eyJ...`) ✓
- `GET /rest/v1/` → HTTP 200 ✓
- `GET /rest/v1/socios?limit=1` → retorna `TAD18586474` real ✓
- Query `joel` con ilike → 2 matches reales (Joel Ibarra TAD15428046, Joel Alavez TAD18355462) ✓

Conexión sana, key vigente, sin necesidad de rotar.

#### Estado al cierre
- ✅ `vite build` verde
- ✅ `php artisan test` 40/40 pasan
- ✅ Push `dev/qa-handoff → github.com:joeldorado/tadaima-pos` commit `1aca34b`
- ✅ Deploy `tadaima-00053-697` 100% del tráfico
- ✅ `tadaima.poslite.com.mx → 200`

---

### Sesión 2026-05-22 — Dashboard gerente, Reporte del Día, cost_at_sale (ADR-015), helpers fecha local

**Contexto:** sesión larga dedicada a darle al gerente las herramientas operativas que le faltaban (sin tocar Reportes que queda solo admin) y blindar la integridad histórica de la ganancia bruta. Joel iba a borrar la data de QA al fin de semana, así que muchas decisiones se simplificaron (no backfill, no banners de aproximación).

**Bloques principales:**

#### 1. Dashboard del gerente en `/` (Home)
- Sección **"Cajeros conectados · [tienda]"**: avatar + nombre + "hace Xm" o "Abrió caja HH:mm" + dot verde + badge "En caja · Caja #N" o "Sin caja abierta". Click en badge "En caja" → abre detalle del corte vivo (reusa `CashCloseSummaryModal`). Refresh auto 30s (`useOnlineUsersQuery`) + botón manual.
- Doble señal de presencia: `/users/online` (heartbeat 90s vía `Layout.tsx`, threshold 2 min) + cualquier user con caja abierta hoy (`/reports/cash`). Sin la segunda señal, un cajero con la pestaña en background perdía visibilidad cuando el browser throteaba el setInterval del heartbeat.
- Fix shape de roles: `/users/online` retorna `roles` como objetos Spatie `[{id, name}]`, no `string[]`. Normalizo con `r.name ?? r` antes de pasar a `isCashier()`.
- Sección **"Cortes de hoy · [tienda]"**: 4 KPIs arriba (Sesiones / Ventas del día / Entradas / Salidas) + lista de sesiones del día con cajero, caja, horarios, ventas, status (Abierta / Cuadra ✓ / Falta $X / Sobra $X). Click abre detalle.
- KPI row del admin (Ventas del día / Apartados activos / Stock crítico) OCULTO para gerente — repetitivo con las dos secciones nuevas. Bonus: 3 queries (`/reports/sales`, `/layaways`, `/reports/inventory?low_stock`) deshabilitadas para gerente → 3 requests menos por carga.

#### 2. RBAC: restricciones de menú gerente
- **"Tiendas"** removido del nav del gerente (`PAGE_ACCESS` + `NAV_BY_ROLE`). El switcher del header sigue activo para cambiar entre tiendas asignadas.
- **"Reportes"** removido del nav del gerente. Solo admin ve agregados cross-tienda y ganancia bruta.
- **"Catálogos" de Preventas** restringido a admin. Gerente queda con tab "Disponibles" (read-only) + "Folios" + "Difusión" + "Vencidos".

#### 3. Productos: stock limitado a tienda del gerente
- `QuickStockModal` y tab Inventario de `MangaEditModal` ahora filtran warehouses por `user.store_id` cuando no es admin.
- Si solo hay 1 tienda asignada: preselecciona y bloquea el select con icono 🔒.
- Stock de otras tiendas NO entra al state → no se renderiza ni se manda en el diff al guardar (defensa frontend; backend ya validaba).
- Label "Solo puedes ajustar stock de tu tienda" eliminado por petición de Joel — el select bloqueado ya comunica suficiente.

#### 4. Logs de auditoría product/manga/inventory
- Migración `2026_05_22_000001_extend_system_logs_with_entity_and_meta` agrega `entity_type` (string nullable, indexed), `entity_id` (unsignedBigInt nullable, indexed), `meta` (JSON nullable).
- Modelo `SystemLog::write($action, $description, $userId?, $entityType?, $entityId?, $meta?)` — `Auth::id()` automático.
- Inyectado en `ProductController::store/update/destroy/forceDestroy` (diff de campos), `MangaController::store/update/destroy` (incluye diff de mangaDetails), `InventoryController::update` (`{old, new, delta}`).
- Sin UI de visualización por ahora — solo escritura. Joel pedirá UI después.

#### 5. Reporte del Día (tab nuevo en /sales)
- Tab "Reporte del Día" entre "Por Producto" y "Flujo de Caja Semanal". Solo admin/gerente.
- **6 secciones** (en pantalla, print HTML, PDF):
  - A) Resumen ejecutivo (ventas brutas, descuentos, neto, comisión terminal, ticket promedio, TC del día)
  - B) Desglose por método de pago: # tx, monto, comisión, neto. Suma `payments[].commission_amount` y `payments[].amount` con groupBy `payment_method.name`.
  - C) Preventas: anticipos cobrados (pending+ready) vs liquidaciones (delivered)
  - D) Movimientos de caja: usa `/reports/cash` para apertura/entradas/salidas/esperado/declarado/descuadre
  - E) Top 10 productos del periodo
  - F) Tabla por cajero (tickets/cobrado/comisión/neto/descuadre — cruza con sesiones para descuadre per-user)
- **Ganancia Bruta**: sección extra **solo admin**. Margen %. Banner ámbar si productos sin cost. Backend gate en `SaleItemResource` — gerente recibe `cost: null`.
- **Botones**: Imprimir (HTML print-friendly nueva ventana) + Exportar PDF (jsPDF + jspdf-autotable, descarga `reporte-AAAA-MM-DD.pdf`).
- **Tabla de ventas** ahora con scroll interno (`max-h: 60vh`) + columna "Vendedor" con ícono User (línea secundaria abajo del #ID para no confundir con cliente).
- Backend: `SaleResource` ahora eager-loads `user:id,name` y lo expone como `user: {id, name}`.
- Tab "Flujo de Caja Semanal" reubicado como tab (antes era panel colapsable abajo).

#### 6. ADR-015: cost_at_sale — snap del costo al INSERT
Ver §7 ADR-015 arriba. Decisión validada con planner + database-reviewer agents en paralelo. Plan ejecutado en 5 fases TDD-first:

**Phase 1 (migraciones):** 3 archivos nullable decimal(12,2):
- `2026_05_22_000010_add_cost_to_sale_items`
- `2026_05_22_000011_add_cost_to_pre_sale_order_items`
- `2026_05_22_000012_add_cost_to_layaways`

Modelos `SaleItem`, `PreSaleOrderItem`, `Layaway` extendidos con `cost` en fillable/casts.

**Phase 2 (tests RED):** 3 archivos PHPUnit feature, 10 tests cubren:
- Snap al INSERT (sale, preventa, apartado)
- Inmutabilidad: mutar `products.cost` después NO afecta el snap (invariante load-bearing)
- Fallback catalog→product para preventa pre-arrival
- NULL passthrough (cost null en producto → cost null en línea, sin coerce a 0)
- Propagación apartado→sale_item al `deliver()`

**Phase 3 (write paths GREEN):** 5 puntos de INSERT.

**Phase 4 (read paths):** `SaleItemResource` expone `cost` admin-gated. Tipo TS `SaleItemDetail.cost?: number | null`. Frontend `dailyReport` usa `item.cost ?? item.product?.cost`.

**Phase 5 (verify):** 40/40 tests pasan (30 originales + 10 nuevos).

**Fix lateral encontrado en tests:** la migración legacy `2026_05_15_000001_drop_legacy_pre_sales_tables.php` solo desactivaba FK checks en MySQL. En SQLite (tests `:memory:`), la FK `payments.pre_sale_id → pre_sales` quedaba huérfana y disparaba "no such table: main.pre_sales" al INSERT en payments. Editada para `dropForeign(['pre_sale_id'])` en SQLite antes del drop.

#### 7. Helpers de fecha local (`lib/date.ts`)
Joel reportó "no veo cargado nada en home" — diagnosticado como bug de `const today = new Date().toISOString().split("T")[0]` a nivel módulo:
1. Se evalúa al cargar el bundle JS — queda stale al cruzar medianoche con tab abierta.
2. `toISOString()` da UTC — usuarios MX (UTC-6) después de 6pm hora local ya ven el día siguiente como "hoy", filtros vacíos.

Solución: módulo `landing/src/lib/date.ts` con:
- `getTodayLocal()` — fecha local YYYY-MM-DD usando `getFullYear/getMonth/getDate`
- `toLocalYmd(Date)` — convierte Date a YYYY-MM-DD local
- `useTodayLocal()` — hook reactivo con setInterval 60s; al cruzar medianoche actualiza state → React Query re-fetch automático sin refresh manual
- `daysAgoLocal(n)` — útil para rangos tipo "últimos 90 días"

7 usos del patrón viejo eliminados en: `DashboardPage`, `SalesPage` (Reporte del Día), `ReportsPage` (today + firstOfMonth + 6 presets), `SellPage` (min del input fecha apartado).

**Verificación de cobertura:** `grep -rnE "new Date\\(\\)\\.toISOString\\(\\)\\.split"` retorna solo comentarios explicativos del helper, ningún uso activo del antipatrón.

#### Estado al cierre
- ✅ `vite build` verde
- ✅ `php artisan test` 40/40 pasan
- ✅ Deploy `tadaima-00051-jxq` (cost_at_sale backend + reporte del día + dashboard gerente inicial)
- ✅ Deploy `tadaima-00052-86t` (fixes de fecha local UTC→local, KPI row gerente oculto, catálogo preventas solo admin)
- ⏳ Joel borra data este fin de semana para nuevos tests con cost_at_sale activo desde día 1

---

### Sesión 2026-05-18 (continuación) — Reportes con calendario, imagen + límites por tienda en preventa, stock por tienda en productos

**Contexto:** Después del refactor ADR-014, sesión continua para pulir flujos de Reportes, Preventas y Productos. Tres bloques principales: filtro de fechas pro en Reportes, soporte completo de imagen y stock por tienda en catálogos de preventa, modal rápido de stock por tienda en Productos.

---

#### 1. Reportes — filtro de rango de fechas mejorado

| Archivo | Cambio |
|---|---|
| `landing/src/pages/ReportsPage.tsx` | Presets ampliados de 3 a 7: **Hoy · Ayer · 7 días · 30 días · Este mes · Mes pasado · Este año**. Preset activo se resalta auto-detectando coincidencia de rango. Labels **INICIO / FIN** arriba de cada `<input type="date">` con icono `Calendar` adentro. Constraint `max={to}` en INICIO y `min={from} max={today}` en FIN para impedir rangos inválidos. Aplica a tabs Ventas / Productos / Clientes |

---

#### 2. Catálogos de preventa — imagen del producto

**Backend:** la columna `pre_sale_catalogs.image_path` ya existía. Faltaba endpoint de upload + URL pública.

| Archivo | Cambio |
|---|---|
| `backend/app/Http/Resources/PreSaleCatalogResource.php` | Expone `image_url` (via `Storage::url`) además de `image_path` |
| `backend/app/Http/Controllers/Api/PreSaleCatalogsController.php` | `POST /pre-sale-catalogs/{id}/image` (multipart, max 5MB) + `DELETE /pre-sale-catalogs/{id}/image`. Borra imagen previa del bucket antes de subir nueva. Solo admin/gerente. |
| `backend/routes/api.php` | Rutas nuevas registradas |
| `packages/api/src/preSaleCatalogs.ts` | `uploadPreSaleCatalogImage(id, file)` + `removePreSaleCatalogImage(id)` |
| `packages/api/src/types.ts` | `PreSaleCatalog.image_url?` agregado |
| `landing/src/components/presales/NewPreSaleCatalogModal.tsx` | Zona de imagen 140×140 arriba del tab General. Sin imagen → botón punteado "Subir imagen". Con imagen → preview + botones cambiar/quitar. Validación max 5MB. Al guardar: si hay `imageFile` → `POST /image` después del save. Si en edición se quitó la imagen → `DELETE /image` |

---

#### 3. Thumbnail del catálogo en admin y Caja

| Archivo | Cambio |
|---|---|
| `landing/src/components/presales/PreSaleCatalogsPanel.tsx` | Tabla de catálogos: si no hay imagen, no muestra placeholder (antes mostraba cuadro punteado con icono Package). Lazy/async en `<img>`. Prefiere `image_url` sobre `storageUrl(image_path)` |
| `landing/src/pages/SellPage.tsx` | `CatalogCard` (modal Preventas → tab Disponibles) ahora muestra thumbnail cuadrado 1:1 con `objectFit:cover` SOLO si hay imagen. Sin imagen no se reserva espacio. `addCatalogToCart` propaga `image_url ?? storageUrl(image_path)` al `item.product.image` para que el item del carrito (vía `ImageWithFallback`) muestre el thumbnail |

---

#### 4. Cache RQ — auto-refresh de catálogos al volver a Caja

**Bug detectado:** después de subir imagen en admin, Caja seguía mostrando la versión vieja sin imagen.

| Archivo | Cambio |
|---|---|
| `landing/src/hooks/queries/usePreSales.ts` | Quitado `refetchOnMount: false` de `usePreSaleCatalogsQuery`. Ahora usa el default `true` (refetch al montar SOLO si está stale). Con `staleTime: 24h`, navegar entre pantallas no dispara fetch, pero `invalidateQueries` desde admin SÍ provoca refetch en Caja al volver |

---

#### 5. Idempotencia + auto-popup en addCatalogToCart

**Bug detectado:** doble click en card del catálogo en Caja creaba 2 filas separadas del mismo item.

| Archivo | Cambio |
|---|---|
| `landing/src/pages/SellPage.tsx` (`addCatalogToCart`) | Si ya existe un item con el mismo `sellingCatalogId`, suma `quantity` y acumula `depositAmount` en lugar de duplicar la fila. Respeta `preorder_limit`. Image del catálogo se propaga al item.product.image. Si la mesa no tiene cliente, abre auto-popup de cliente con 150ms delay (preserva flujo existente) |

---

#### 6. Stock por tienda real en endpoints de productos (bug crítico)

**Bug detectado:** Joel reportó "ETB 151 Ingles" mostrado con stock=10 en Caja, pero al cobrar el backend rechazaba con "Disponible 0". Causa raíz: el endpoint `/products?light=1` retornaba `stock_total` GLOBAL (sumando todas las tiendas) cuando se llamaba sin `store_id`. Frontend pasaba `null`.

| Archivo | Cambio |
|---|---|
| `landing/src/pages/SellPage.tsx` | `useProductsLightQuery(activeStore?.id)` (antes `null`). `useProductsSearchQuery(debouncedSearch, activeStore?.id)`. Scanner directo `queryClient.fetchQuery` también pasa `store_id` |
| `landing/src/hooks/queries/useProducts.ts` | `useProductsSearchQuery` y `useBackgroundProductsPrefetch` aceptan `storeId` opcional. Lo agregan al queryKey para que cambiar de tienda invalide cache local automáticamente |

Backend ya tenía la lógica de filtrar por `store_id` cuando se manda — solo faltaba que el frontend lo enviara.

---

#### 7. Auto-refresh del catálogo al abrir modal

Para complementar el fix anterior, al abrir el modal Catálogo de Caja se invalida `products.all` → refetch automático en background. El cajero siempre ve stock fresh sin tener que clickear "Actualizar" manualmente.

---

#### 8. CatalogCard "Agotado" + auto-ajuste en checkout

| Archivo | Cambio |
|---|---|
| `landing/src/pages/SellPage.tsx` (`CatalogCard`) | Calcula `remaining = preorder_limit - reserved_count`. Si `remaining ≤ 0`: opacity 0.55, borde rojo, badge **"Agotado"** rojo, cursor not-allowed, click bloqueado. Si remaining > 0: badge **"N disponibles"** ámbar. Botones de precio individuales también disabled cuando agotado |
| `landing/src/pages/SellPage.tsx` (`openPreSalesModal`) | Invalida `preSaleCatalogs.all` + `preSaleOrders.all` al abrir → reserved_count fresh |
| `landing/src/pages/SellPage.tsx` (`handleCheckoutError`) | Parsea error de preventa: `"'X' solo tiene N unidades disponibles (límite: M)."` → auto-ajusta qty del item (preserva proporción del depositAmount) + invalida `preSaleCatalogs.all` + toast amigable. Si `availableNum=0`, quita el item del carrito |

---

#### 9. Límite por tienda en catálogos de preventa (cambio de schema)

Joel pidió que `preorder_limit` no sea global sino por tienda (3 en Centro, 2 en Macroplaza, etc.).

**Backend:**

| Archivo | Cambio |
|---|---|
| `backend/database/migrations/2026_05_18_000003_create_pre_sale_catalog_store_limits_table.php` | **NUEVA** tabla `pre_sale_catalog_store_limits` con `catalog_id`, `store_id`, `limit_qty`, unique compound, FK cascade delete |
| `backend/app/Models/PreSaleCatalogStoreLimit.php` | **NUEVO** modelo |
| `backend/app/Models/PreSaleCatalog.php` | Relación `storeLimits()` HasMany. Helpers `limitForStore($storeId)` (prioridad: store_limits entry → si tabla tiene filas pero esa tienda no, return 0; sino fallback `preorder_limit` global) y `reservedCountForStore($storeId)` (cuenta solo folios pending/ready de esa tienda) |
| `backend/app/Http/Requests/StorePreSaleCatalogRequest.php` + `UpdatePreSaleCatalogRequest.php` | Validación `store_limits.*.store_id` + `.limit_qty` |
| `backend/app/Http/Controllers/Api/PreSaleCatalogsController.php` | Método privado `syncStoreLimits()` replace-all. Cargada relación `storeLimits` en index/show/store/update. Reset bloqueado cuando catalog status es arrived/closed/cancelled |
| `backend/app/Http/Resources/PreSaleCatalogResource.php` | Expone `store_limits: [{store_id, limit_qty}]` |
| `backend/app/Services/PreSaleOrderService.php` | `createOrder` usa `limitForStore($storeId)` + `reservedCountForStore($storeId)`. Fallback al `preorder_limit` global si no hay store_limits |

**Frontend:**

| Archivo | Cambio |
|---|---|
| `packages/api/src/types.ts` | Tipo `PreSaleCatalogStoreLimit` + `store_limits?` en `PreSaleCatalog` |
| `landing/src/components/presales/NewPreSaleCatalogModal.tsx` | Tab nuevo **"Stock"** (renombrado de "Tiendas" tras feedback). Selector dropdown "Agregar tienda" (filtra las ya asignadas) + input qty + botón Agregar. Lista de tiendas asignadas con qty editable inline (Editar → input + ✓/✕), botón 🗑 quitar. Badge rojo si qty=0. Footer verde "Stock total: N uds en M tiendas". Empty state si no hay tiendas asignadas → catálogo usa `preorder_limit` global como fallback |

---

#### 10. Modal rápido de stock por tienda en Productos

Patrón equivalente al de catálogos de preventa, ahora para productos regulares.

| Archivo | Cambio |
|---|---|
| `landing/src/components/products/QuickStockModal.tsx` | **NUEVO** componente. Carga `getInventory({ product_id })` + `getWarehouses({ active: true })`. Lista solo warehouses con `quantity > 0`. Selector "Agregar" filtra los ya asignados. Editar inline + botón 🗑 (pone qty=0, registra ajuste en backend). Footer verde con suma. Botón **Guardar cambios** hace diff vs estado inicial y PUT por cada cambio en paralelo |
| `landing/src/pages/ProductsPage.tsx` | Botón **"📦 Stock"** en columna acciones de tabla (junto a Editar). Botón flotante absoluto en grid card (visible en hover, verde, bottom-left). State `stockModalProduct`. Modal montado al final del JSX. Al guardar invalida `products.all` + `inventory.all` |

**Backend:** ningún cambio. Reusa `PUT /inventory/{productId}/{warehouseId}` que crea/actualiza y registra movimiento de ajuste.

---

#### Permisos confirmados

| Área | Admin | Gerente | Cajero |
|------|-------|---------|--------|
| Productos: edit + stock por tienda | ✅ | ✅ | ❌ |
| Preventas: catálogos + imagen + stock por tienda | ✅ | ✅ | ❌ |
| Preventas: vender folios en Caja | ✅ | ✅ | ✅ |
| Reportes: ver con filtro de fechas | ✅ | ✅ | ❌ |

Sin cambios en permisos. Decisión pendiente de Joel si restringir a solo admin.

---

#### Verificación

- ✅ `vite build` verde con `dist/sw.js` actualizado
- ✅ 27/27 PHPUnit tests pasan
- ✅ Migración `2026_05_18_000003` aplicada
- ✅ Pruebas manuales en local: subir imagen, ver thumbnail en Caja, agotado en preventa con auto-ajuste, modal stock por tienda en productos

---

### Sesión 2026-05-18 — Refactor mayor de Caja: ADR-014 client-authoritative cart + UX polish completo

**Contexto:** Joel reportó bug crítico en Caja del QA de Ruben: "el carrito no está sincronizado: pantalla muestra $X pero el servidor tiene $Y" + "Los pagos no coinciden con el total". Diagnóstico inicial con 4 agentes en paralelo (architect, code-architect, database-reviewer, performance-optimizer) reveló múltiples capas del problema. La sesión escaló a un refactor arquitectónico completo del flujo de carrito + decenas de mejoras de UX en Caja.

---

#### 1. Bug crítico carrito desincronizado (3 fixes inmediatos)

**Causa raíz:** `clearCart()` solo limpiaba el state local del UI pero NO cancelaba el draft del servidor → el siguiente `addToCart` empilaba items sobre un draft sucio con líneas de sesión previa → al cobrar el backend rechazaba con "pagos no coinciden". Hallazgo extra: 10 drafts huérfanos colgados en MySQL prod ($35,600 acumulados en uno solo).

| Fix | Archivo | Cambio |
|---|---|---|
| A | `landing/src/pages/SellPage.tsx:1065` | `clearCart` ahora llama `cancelDraft(draftId)` + `draftStore.clearDraft(mesaId)` |
| B | `landing/src/pages/SellPage.tsx:736-758` | Lock por producto en `addToCart` antes del check `existingItemId` (race condition de doble click) + `mesasRef` para releer qty actualizada |
| D | `landing/src/pages/SellPage.tsx:281-296` | `stock_details.tienda` poblado desde `stock_total` del endpoint `?light=1` (display mostraba "TIENDA: 0" cuando había 10) |
| API | `packages/api/src/drafts.ts` | Agregada `cancelDraft(draftId)` que pega a `DELETE /sales-drafts/{id}` |

Smoke test E2E completo con `curl` validó el fix. Cancelados los 10 drafts huérfanos.

---

#### 2. Plan inicial server-authoritative (revertido)

Después del fix inmediato, Joel quiso una solución robusta para multi-cajero. Los 4 agentes propusieron polling de React Query + endpoint agregado de reservas + modal "por vencer" cuando draft inactivo.

**Implementado y luego revertido en favor de ADR-014:**
- Migración `2026_05_18_000001_add_expire_and_indexes_to_sales_drafts` (columnas `expires_at`, `warned_at` + índices `(draft_id, product_id)` + `(store_id, active)`)
- `SalesDraftActivityObserver` que actualizaba `expires_at` con cada actividad
- Comandos scheduler: `drafts:warn-expiring` + `drafts:expire-warned` (cada 1 min)
- Endpoints `/sales-drafts/reserved-stock` (con `Cache::remember(3s)`) + `/sales-drafts/expiring` + `POST /{id}/extend`
- Hooks RQ `useReservedStockQuery` (poll 10s) + `useExpiringDraftsQuery` (poll 20s)
- `<ExpiringDraftsModal />` con countdown 60s y botones Mantener/Cancelar

**Hallazgos bonus detectados por los agentes:**
- **Deadlock potencial en `CheckoutService::reserveStock`**: iteraba items en orden de `$draftItems` → dos cajeros con orden distinto causaban deadlock MySQL. Fix: `$draftItems->sortBy('product_id')` antes del foreach.
- **Validación de stock ignoraba drafts open de otros**: si dos cajeros cobraban el último iPhone simultáneo, ambos pasaban la validación y se descontaba a negativo. Fix: nueva subquery que considera reservas de otros drafts open + scoping por tienda en `checkStock`.

---

#### 3. ADR-014 — Pivote a client-authoritative cart

Tras la implementación, Joel argumentó que el patrón correcto para su POS era **client-side cart** (como Amazon checkout, Stripe checkout, mayoría de e-commerce). Razón: cero requests por `+`/`-`, sin race conditions, sin drafts huérfanos, código más simple. Tradeoff aceptado: doble venta posible (manejada con error claro al cobrar) y sin visibilidad cross-caja durante el armado.

**Backend cambios:**

| Archivo | Cambio |
|---|---|
| `backend/app/Http/Requests/CheckoutRequest.php` | Acepta dos shapes: `{draft_id}` (legacy) o `{items, store_id, register_session_id, customer_id?}` (nuevo flujo direct) |
| `backend/app/Http/Controllers/Api/SalesController.php` | `store()` distingue por `has('items')` y delega a `checkout()` o `checkoutDirect()` |
| `backend/app/Services/CheckoutService.php` | Nuevo método `checkoutDirect()` que crea draft + items + sale en una transacción atómica. Si falla por stock, todo rollback |
| `backend/app/Providers/AppServiceProvider.php` | `SalesDraftActivityObserver::observe` comentado (no hay drafts en vivo) |
| `backend/routes/console.php` | Schedules `warn-expiring` + `expire-warned` comentados |
| `backend/routes/api.php` | Endpoints `reserved-stock` / `expiring` / `extend` comentados |
| `backend/database/migrations/2026_05_18_000002_cancel_legacy_open_drafts.php` | One-shot que cancela todos los `sales_drafts.status='open'` al deployar (cleanup del cutover) |

**Frontend cambios:**

| Archivo | Cambio |
|---|---|
| `landing/src/pages/SellPage.tsx` | `addToCart` / `changeQty` / `removeFromCart` / `clearCart` reescritos para tocar solo state local. Quitados `pendingDraftRef`, `pendingItemAddRef`, `mesasRef` y toda la lógica de sync server. Toast "Sincronizando con el servidor…" eliminado de raíz. |
| `landing/src/pages/SellPage.tsx` | `handleCheckout` (3 ramas: regular, mixto, preventa) envía `items[]` directos en lugar de `draft_id`. Helper `handleCheckoutError` parsea "Stock insuficiente para 'X'. Disponible: N" → auto-ajusta qty en UI + invalida cache + toast amigable |
| `landing/src/layouts/Layout.tsx` | `<ExpiringDraftsModal />` comentado (sin drafts en vivo) |
| `landing/src/pages/SellPage.tsx` | `useReservedStockQuery` removido. `reservedInOtherMesas` vuelve a leer solo de `mesas[]` local (multi-tab del mismo browser sigue funcionando vía zustand persist) |
| `packages/api/src/types.ts` | `CreateSaleInput` extendido con `items?`, `store_id?`, `register_session_id?`, `customer_id?` |

Verificación: 27/27 PHPUnit + 18/18 vitest + smoke E2E (POST /sales con items directos crea draft+items+sale en una transacción, descuenta inventario, deja 0 drafts open al final).

---

#### 4. Stock UX en Caja

- **Warning "Quedan N"** en items del carrito cuando `availableStockFor - currentQty ≤ 5` (ámbar) / `=0` (rojo "Sin más stock"). Solo para venta regular.
- **Refresh productos al `handleOpenCash`** (junto con TC + preventas) para que el cajero arranque su turno con stock fresco.
- **Auto-recovery al rechazo de stock** en checkout: si server dice "Disponible: N", baja qty del item a N, invalida products, toast "Stock actualizado a N — revisa y cobra de nuevo". Si N=0, lo quita del carrito.

---

#### 5. UX cliente y socios Tadaima

**Detección automática TAD\d+ en scanner.** Códigos de socios Supabase tienen formato `TAD00207715`. `handleScannedCode` agrega rama:

```ts
if (/^TAD\d+$/i.test(code)) {
  if (activeMesa.customerId) { toast.info("Ya tiene cliente"); return; }
  await openCustomerScanPopup(code.toUpperCase());
  return;
}
```

`openCustomerScanPopup(code)` busca primero en BD local por `external_member_id`, si no consulta `lookupCardCode(code)` a Supabase, abre `<AssignCustomerModal />` con datos + botón **"Asignar a esta venta"** (verde grande). Si es externo y se asigna, lo crea en BD local primero.

**Modo manual del popup** (botón "Cliente" del toolbar):
- Buscador autofocus con debounce 300ms
- Resultados locales (azul) + socios Tadaima (ámbar)
- Botón **"+ Crear cliente nuevo"** con form inline (nombre/teléfono/correo) — pre-llena nombre con la query si tenía texto

**Auto-abre popup al agregar preventa sin cliente** (`addCatalogToCart` + 150ms timeout para que el modal de Preventas cierre antes).

**Modal "Clientes" del toolbar** (botón nuevo entre Historial y Cerrar Caja):
- Header con contador "N locales · N socios Tadaima"
- Buscador autofocus
- Lista con expand-on-click: muestra Tickets + Preventas del cliente (lazy fetch)
- Botón "Agregar" para socios Tadaima → crea en BD local + invalida cache RQ

**Cache RQ de clientes locales (`useCustomersAllQuery(500)`):**
- staleTime 1h, gcTime 24h, sin refetch on focus/mount
- Helper `filterLocalCustomers(query)` filtra client-side instantáneo por nombre/teléfono/correo/`external_member_id`
- Si filtro local da 0 + query ≥2 chars → fallback Supabase con leyenda visible **"Buscando en socios Tadaima…"** (banner ámbar con spinner)
- Aplicado en 3 sitios: popup Cliente (manual), modal Clientes (toolbar), header de preventa

**Ocultar zona "Cliente del Ticket"** del header de Caja en venta regular (solo visible en preventa donde es required). Cliente ahora se asigna desde el botón del toolbar o el auto-popup.

---

#### 6. Cache de imágenes (3 capas)

| Capa | Archivo | Cambio |
|---|---|---|
| A | `gsutil setmeta` aplicado a `gs://tadaima-media/**` + `backend/config/filesystems.php` | `Cache-Control: public, max-age=31536000, immutable` (1 año, sin revalidación) en 17 objetos existentes y subidas futuras. Cache busting automático vía filename hash |
| B | `landing/vite.config.ts` + `landing/package.json` | `vite-plugin-pwa` con Service Worker `CacheFirst` para `^https://storage.googleapis.com/tadaima-media/.+\.(png\|jpg\|jpeg\|webp\|gif\|svg)$`. 2000 entries, 1 año. Sobrevive hard reload y limpia de cache del browser |
| C | `landing/src/components/figma/ImageWithFallback.tsx` + `ProductsPage.tsx` (`ProductThumb`) | `loading="lazy" decoding="async"` — solo descarga imágenes en viewport, decode fuera del main thread |

---

#### 7. Polish UI del footer de Caja

- **Dropdown UP del método de pago**: grid 2×2 (Efectivo/Dólares/Tarjeta/Transferencia) reemplazado por botón único del activo + menu hacia arriba con los inactivos. Click outside cierra (`paymentMenuRef`). Conserva editor de TC (`SlidersHorizontal`) cuando Dólares + admin. Chip de terminal clickeable abre modal de selección.
- **Total en USD cuando Dólares**: muestra `$77.42 USD` prominente en emerald + `$1,200 MXN · TC 16.50` debajo. Cambio bilingüe `$25.00 USD ≈ $412.50 MXN`. Mismo formato en ticket impreso.
- **Bug fix**: `setPayment("Tarjeta"|"Transferencia")` limpia `cashReceived` (antes un `100` USD escrito en Dólares se colaba al ticket como "Recibido $100" con Tarjeta). Defensa extra en `handleCheckout`: `receivedSnapshot = 0` si no es Efectivo/Dólares.
- **Comisión oculta a no-admin** (3 sitios): bloque subtotal "Comisión X%", chip del dropdown "(X%)", modal de terminales (incluye banner "Política de comisión"). Admin sigue viendo todo igual.
- **Overlay full-screen bloqueante** durante checkout (`z-1000` con backdrop blur + Loader2 + texto "Procesando venta · No cierres ni cambies de pantalla").

---

#### 8. Reorganización del layout

- **Columna unificada Col 1+2**: TOTAL arriba + dropdown del método abajo (en lugar de lado a lado). `min-w-[300px]` con `gap-4`. Separador entre cols eliminado.
- **Nueva columna cliente** (visible solo si `hasAssignedCustomer`): avatar User verde + nombre + datos secundarios (Phone/Mail/Bookmark icons en lugar de emojis). El código TAD en ámbar destaca al socio Tadaima.
- **Bloque "Buscar Preventa"** del footer comentado (folio se carga via scanner `PREV-N` o modal Preventas → Apartadas).
- **Copy "Carrito" → "Venta"** en 9 lugares de UI (header, empty state, toasts). Variables JS sin cambio.
- **"Cancelar Venta"** reubicado del toolbar superior a la barra de buscadores, **condicional** (solo visible si `items.length > 0`). Hover rojo + icono X.

---

#### 9. Cache de preventas + actualizar granular

`openPreSalesModal` antes hacía 2 fetches en cada apertura. Ahora:
- `usePreSaleCatalogsQuery({status:'published'}, per_page:200)` y `usePreSaleOrdersQuery(per_page:200)` activos al montar SellPage
- `useEffect` sincroniza state local (`preSaleCatalogs`, `preSaleOrdersPending/Delivered/Expired`) desde el cache RQ
- Click en "Preventas" → modal abre sin fetch
- **Botones "Actualizar" granulares** dentro de cada modal:
  - Modal Catálogo → invalida solo `products.all`
  - Modal Preventas (Disponibles/Difusión) → invalida solo `preSaleCatalogs.all`
  - Modal Preventas (Apartadas/Liquidadas/Vencidas) → invalida solo `preSaleOrders.all`
- Botón global "Actualizar" del toolbar de Caja **removido** (estaba al lado de Escanear y refrescaba todo)
- `handleOpenCash` invalida productos + preventas + TC al inicio del turno

**Bonus:** Notificaciones (`NotificationBadge`) — polling cada 30s deshabilitado porque no hay generadores backend. Mantiene fetch inicial al login. 4,800 requests/día menos por 5 cajeros.

---

#### Verificación final

- ✅ `vite build` verde (incluido nuevo `dist/sw.js` del PWA)
- ✅ `vitest run` 18/18 pasan
- ✅ `php artisan test` 27/27 pasan
- ✅ Smoke E2E directo checkout con `curl`: stock cross-caja respetado, deadlock prevenido, validación correcta
- ✅ Deploy pendiente — toda la sesión en local + commits sin push (Joel prefiere push único al final)

**Memoria nueva esperada:** `project_cart_architecture.md` — Tadaima POS usa client-authoritative cart (ADR-014) desde 2026-05-18, no server-authoritative. Carrito vive en localStorage. Stock se valida solo al cobrar.

---

### Sesión 2026-05-15 (madrugada larga) — React Query global + IndexedDB + catálogo perf para 8000 productos

**Contexto:** Joel pidió implementar React Query para optimizar el state de datos sin recargar info de más, manteniéndola actualizada cuando hay cambios. Cubrir: Inicio, Productos, Ventas, Clientes, Preventas, Traslados, Reportes, Caja y Settings. Pregunta paralela: cómo propagar el tipo de cambio entre dispositivos (admin cambia en una compu, cajero ya tiene sesión abierta en otra) sin Firebase ni cron caro.

**1. Setup global del data layer**

| Archivo | Cambio |
|---|---|
| `landing/src/lib/queryClient.ts` | `QueryClient` con defaults (staleTime 30s, gcTime 24h, retry 1, refetchOnWindowFocus true). IndexedDB persister via `idb-keyval` (límite cientos de MB, vs 5-10MB de localStorage que no aguanta 8000 productos). `broadcastQueryClient` con `BroadcastChannel('tadaima-rq')` para sincronizar invalidaciones entre tabs (Caja 1 vende → Caja 2/3/4/5 ven stock actualizado en <100ms). |
| `landing/src/lib/queryKeys.ts` | Keys centralizados por dominio (products, customers, stores, reports, preSaleCatalogs, preSaleOrders, sales, etc). Permite invalidate granular o broad. |
| `landing/src/App.tsx` | `PersistQueryClientProvider` envuelve la app con `maxAge: 24h`. Tabs nuevas leen el cache de IndexedDB → 0 fetches duplicados. |

Paquetes nuevos: `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`, `@tanstack/query-broadcast-client-experimental`, `idb-keyval`.

**2. Hooks dedicados por dominio** (`landing/src/hooks/queries/`)

`useProducts`, `useStores`, `useMangas`, `useWarehouses`, `useCustomers`, `useTransfers`, `useUsers`, `useRoles`, `useCategories`, `usePaymentMethods`, `useTerminals`, `useCashSession`, `usePreSales`, `useSystemSettings`, `useSales`. Cada uno encapsula el `useQuery` + cache config + parámetros sanos.

**3. Páginas migradas (lectura + invalidate-on-mutate)**

| Página | Lo que cambió |
|---|---|
| `ProductsPage` | `useProductsQuery`, `useMangasQuery`, `useStoresQuery`, `useWarehousesQuery`. Mutations (create/update/delete producto + manga + categoría) hacen `queryClient.invalidateQueries`. |
| `ClientsPage` | `useCustomersQuery`. Reemplazado el setCustomers manual. |
| `ReportsPage` | 5 queries con `enabled` por tab activo + date range en queryKey. Botón "Actualizar" con icono `RefreshCw` invalida solo el dominio del tab. Sin polling. |
| `TransfersPage` | `useTransfersQuery` + `useWarehousesQuery`. Invalidates tras createTransfer/complete/cancel. |
| `DashboardPage` | `useWarehousesQuery`, `useUsersQuery`, 3 queries KPI (sales/layaways/lowStock) dependientes de `activeStore`. |
| `AdminPage` (6 tabs) | TabSucursales, TabBodegas, TabUsuarios, TabRoles, TabCategorias, TabTerminales migradas. Mutations invalidan cache compartido entre tabs (crear sucursal refresca selectores en otras tabs). |
| `SellPage` (Caja) | `useProductsLightQuery`, `usePaymentMethodsQuery`, `useTerminalsQuery`, `useActiveSessionQuery`, `useCashRegistersQuery`, `useExchangeRateQuery`. |
| `PreSalesPage` + 3 paneles | `usePreSaleOrdersQuery` para contador. PreSaleCatalogsPanel/OrdersPanel/DifusionPanel migrados con invalidates en transitions. |
| `SalesPage` | `useSalesQuery`, `usePreSaleOrdersQuery`, `useProductsQuery`. returnSale invalida sales. Botón Actualizar invalida sales + preSaleOrders. |
| `SettingsPage` | `useSystemSettingsQuery` + invalidate cruzado tras `batchUpdateSystemSettings` (cambio de TC en Settings propaga al cache de Caja). |

**4. Strategy de cache por dominio**

| Dominio | staleTime | Polling | Refetch on focus |
|---|---|---|---|
| Productos / mangas | 24h | no | no |
| Catálogos de preventa | 24h | no | no |
| Tipo de cambio | 24h | no | no |
| Folios de preventa | 60s | no | yes (default) |
| Ventas / reportes / clientes | 30s (default) | no | yes |
| Sesión de caja / terminales / payment methods | 30s | no | yes |

Polling automático eliminado. El polling original cada 30s costaba ~2880 requests/cajero/día por query. Lo reemplazamos por: cache largo + invalidaciones explícitas + botones manuales + sync al abrir sesión.

**5. Tipo de cambio entre dispositivos (sin Firebase ni cron)**

- `useExchangeRateQuery`: staleTime 24h, sin polling, sin refetchOnFocus, sin refetchOnMount.
- En `handleOpenCash` (cajero abre sesión de caja): `queryClient.invalidateQueries(['systemSettings', 'exchangeRate'])` → fuerza fetch fresco al inicio del día.
- En `batchUpdateSystemSettings` (admin guarda TC en Settings): invalidate cruzado a `queryKeys.systemSettings.all` → si admin y cajero comparten browser/tab, ven el cambio inmediato. Si están en computadoras separadas, el cajero lo ve cuando abre su próxima sesión de caja a la mañana siguiente.
- Modelo mental: **admin actualiza TC en la noche, cajero abre caja a las 6am y lee el TC fresco**. Cero polling. ~1-2 fetches/cajero/día para TC.

**6. Cache compartido entre tabs**

Antes: si Joel abría Caja 1, Caja 2, ..., Caja 5 en pestañas distintas, cada una hacía su propio fetch inicial (5×). Ahora:

- `PersistQueryClientProvider` con `createAsyncStoragePersister` apuntado a IndexedDB (via `idb-keyval`) → Caja 2/3/4/5 leen el cache de Caja 1 desde IndexedDB → 0 fetches duplicados al montar.
- `broadcastQueryClient('tadaima-rq')` → invalidaciones se propagan en <100ms entre tabs (vender en Caja 1 actualiza el stock visible en Caja 2 sin recargar).
- localStorage no alcanza (límite 5-10MB, 8000 productos = ~12MB JSON). IndexedDB soporta cientos de MB sin problema.

**7. Catálogo optimizado para 8000+ productos**

Discusión con Joel sobre cómo lo hacen empresas grandes (Shopify POS, Square, Toast, Lightspeed, Clover, Amazon): server-side search + quick picks + paginación virtual + scanner directo + categorías filtro + CDN imágenes. Joel eligió híbrido: top 200 más vendidos + server search + background gradual.

| Cambio | Detalle |
|---|---|
| Backend: `ProductLightResource` | Endpoint `GET /products?light=1` retorna slim payload (id, name, sku, active, category_id, prices, image URL, allow_cash, allow_card, stock_total). Drop barcode, description, cost, category object, images array, timestamps. ~60% menos payload. |
| Backend: `?sort=top` | Param que ordena por count de `sale_items` últimos 30 días (desc), tiebreaker `id desc`. Útil para precargar el cache con los productos que el cajero realmente usa, no los más recientes. `Product::saleItems()` HasMany agregado al modelo. |
| Backend: FULLTEXT migration | `2026_05_15_000002_add_fulltext_index_to_products.php` crea índice FULLTEXT en `products(name, sku, barcode)`. No-op en SQLite (tests). `Product::scopeSearch` usa `MATCH(name, sku, barcode) AGAINST(? IN BOOLEAN MODE)` con tokens prefijo (`+iPho* +Pro*`) cuando term ≥ 3 chars, fallback LIKE para términos cortos. Búsqueda baja de ~200ms (LIKE table scan) a ~5-10ms (index seek). |
| Frontend: `getProductsLight` + `ProductLight` type | Cliente paralelo de `getProducts` que retorna el shape slim. `getLightPrice(p, level)` helper para leer `prices.price_N`. |
| Frontend: `useProductsLightQuery` | Trae top 200 productos. staleTime 24h, gcTime 24h, sin refetch automático. |
| Frontend: `useProductsSearchQuery` | Búsqueda server-side, enabled cuando term ≥ 2 chars. Cache 60s por queryKey por término. |
| Frontend: `useProductsInfiniteQuery` | `useInfiniteQuery` con páginas de 120, para modal de catálogo cuando se conecte después. Hook listo, integración al modal pendiente. |
| Frontend: `useBackgroundProductsPrefetch` | Hook util que dispara prefetch progresivo de páginas 2..6 con `setTimeout` escalonado (1.5s entre cada) + `requestIdleCallback` para arrancar solo cuando el browser está idle. Total: 1000 productos más cacheados sin bloquear UI. |
| Frontend: `Layout.tsx` post-login prefetch | En cuanto hay user autenticado, `queryClient.prefetchQuery(top200, sort=top)` en background. Cuando el cajero llega a Caja, el cache ya está listo. Latencia percibida: ~0. |
| Frontend: Scanner USB inmediato | Si SKU no está en cache local (top 200 + background 1000 = 1200 productos), `queryClient.fetchQuery` directo al backend SIN debounce (es acción explícita del cajero). Cache 60s por SKU. |

**Costos de tráfico** (estimado para 1 cajero, jornada 8h, 50 ventas):

| Patrón | Llamadas backend / día |
|---|---|
| Original (polling 30s en queries + sin cache) | ~3000+ |
| Patrón híbrido implementado | ~80-100 |

Reducción ~97%. 5 cajeros × 80 = 400 requests/día. Cloud Run free tier permite 67k/día → estás al 1% del free tier.

**8. Botones de sincronización manual en UI**

- **SellPage "Sincronizar"** (junto a Escanear): invalida products + preSaleCatalogs + preSaleOrders + exchangeRate. Visible para todos. Útil cuando admin acaba de subir productos/preventas y cajero quiere verlos sin esperar al reload.
- **ProductsPage "Buscar nuevos"** (al lado de "Alta de Producto"): invalida products + mangas. **Solo visible para gerente/cajero** (admin no lo necesita porque sus propias mutations ya invalidan).
- **ReportsPage "Actualizar"** (junto a tabs): invalida solo el dominio del tab activo. Sin polling. Admin entra → fresh. Vuelve al tab del navegador → fresh por refetchOnWindowFocus. Click → fresh inmediato. Spinner mientras carga.

**9. Invalidaciones automáticas tras eventos**

| Evento | Queries invalidadas |
|---|---|
| `createSale` (venta regular) | products, sales |
| `createLayaway` | products |
| `createPreSaleOrder` | products, preSaleCatalogs, preSaleOrders |
| `addPreSaleOrderPayment` + `updatePreSaleOrderStatus` | preSaleOrders, sales (si checkout mixto) |
| Cobro mixto con liquidación + regular + nueva preventa | products + preSaleCatalogs + preSaleOrders + sales (todos) |
| `openSession` / `closeSession` | cash, exchangeRate |
| `batchUpdateSystemSettings` (admin guarda TC) | systemSettings (all) |
| Admin: create/update producto/categoría/sucursal/usuario/rol/etc. | dominio respectivo |

**10. Verificación**

- `vite build` ✓ (590-620ms, bundle 1875-1900KB)
- `vitest run` ✓ 18/18 tests pasan
- `php artisan test` ✓ 27/27 tests pasan (SQLite, FULLTEXT migration no-op)
- Dev server smoke: index 200, main.tsx 200

**11. Pendiente para activar en prod**

- Deploy: `cd /Users/joeldoradoaguilus/Documents/JOEL/Tadaima && gcloud run deploy tadaima --source . --region=us-central1 --project=impusodigitaldorado` (el entrypoint corre `php artisan migrate --force` que aplica el FULLTEXT automáticamente).
- Verificación post-deploy: tadaima.poslite.com.mx carga, DevTools → Application → IndexedDB → `keyval-store` aparece, Network tab muestra 1 fetch a `/products?light=1&sort=top&per_page=200` al login + páginas 2-6 en idle, Cloud Run logs deben tener línea `Migration: 2026_05_15_000002_add_fulltext_index_to_products`.

**Commits**: `cd16dd6` (legacy preventas cleanup), `665bfd3` (RQ + IndexedDB + catalog perf), `eede356` (MASTERLOG).

**Push**: `dev/qa-handoff` ya pusheado a `github.com:joeldorado/tadaima-pos.git`.

**Pendientes de prioridad baja** (no bloquean):

- TabPermisos, TabPreciosTienda, TabInventario en AdminPage no migrados (lógica custom, beneficio marginal).
- Modal `ProductCatalogModal` no integrado con `useProductsInfiniteQuery` (hook disponible, integración requiere refactor del modal `@ts-nocheck`).
- LayawaysPage no migrada (no estaba en lista de Joel).
- `openPreSalesModal` dentro de SellPage sigue imperativo (fetch on demand al abrir modal — no reusa cache de PreSalesPage).
- Sort by top sellers cuando hay pocas ventas históricas devuelve count=0 (orden por id desc como fallback). Se acomoda solo tras unas semanas de operación.

---

### Sesión 2026-05-15 (planeación) — Extensión fase Tienda Online

**Contexto:** Se revisó el estado real del catálogo online para continuar fase de ejecución. La base backend ya existe, pero faltaba la capa web pública en `landing` y el plan de cierre por bloques.

**Hallazgos clave:**
- Backend listo para catálogo público por URL: `GET /api/v1/public/catalog/{catalogUrl}` y CRUD admin en `/api/v1/catalog/*`.
- `packages/api` solo cubría `catalog/settings`; no tenía helpers de `catalog/products` ni `public/catalog`.
- `landing` no tiene ruta/página pública para catálogo (`/tienda-online` o equivalente).

**Decisiones de esta sesión:**
- Ruta principal recomendada: `/catalogo/:catalogUrl`
- Alias opcional: `/tienda-online/:catalogUrl` (redirección)
- Alcance MVP: lista de productos por tienda + búsqueda/filtro básico + CTA WhatsApp (sin carrito online)

**Documento nuevo de ejecución:**
- `docs/PLAN_FASE_CATALOGO_ONLINE_2026-05-15.md`

**Estado al cierre:** Planeación completada; lista para arrancar implementación por bloques (API client, routing + página pública, integración, QA).

---

### Sesión 2026-05-15 (ejecución parcial) — Arranque fase Tienda Online (Bloque A+B)

**Objetivo de arranque:** convertir la planeación en base técnica ejecutable sin romper el flujo actual del POS.

**Implementado en esta sesión:**
- `packages/api/src/catalog.ts` **nuevo** con helpers:
  - `getCatalogProducts`
  - `addCatalogProduct`
  - `updateCatalogProduct`
  - `removeCatalogProduct`
  - `getPublicCatalog`
- `packages/api/src/index.ts` exporta módulo `catalog`.
- `landing/src/pages/OnlineCatalogPage.tsx` **nueva**:
  - consume `getPublicCatalog(catalogUrl)`
  - render lista de productos (imagen, nombre, categoría)
  - respeta flags `show_price` / `show_stock`
  - búsqueda local básica
  - estados loading / vacío / error
- Router actualizado en `landing/src/router/index.tsx`:
  - `/catalogo/:catalogUrl`
  - `/tienda-online/:catalogUrl` (alias temporal mismo componente)

**Pendiente exacto para continuar (siguiente corte):**
1. Bloque C:
   - CTA WhatsApp por producto con mensaje prellenado por tienda/producto.
   - Filtro por categoría (UI + query param opcional).
2. Bloque D:
   - tracking mínimo (`catalog_view`, `product_click`, `whatsapp_click`, `search_used`, `filter_used`).
3. Bloque E:
   - QA matrix del MVP + pruebas manuales mobile.

**Checkpoint de continuidad (si la sesión se corta):**
- Punto de reentrada recomendado: `landing/src/pages/OnlineCatalogPage.tsx`
- Luego conectar Settings/Admin para gestionar URL pública y difusión.

**Estimación de presupuesto de sesión (tokens):**
- Presupuesto estimado de ejecución fase arranque: ~8k-10k tokens.
- Consumo aproximado en este corte: ~4k-5k tokens.
- Restante estimado para cerrar Bloques C-E: ~5k-7k tokens.

**Update de avance (mismo día):**
- `landing/src/pages/OnlineCatalogPage.tsx` ya incluye:
  - filtro por categoría en UI (dropdown)
  - CTA `Pedir por WhatsApp` por producto con texto prellenado (tienda + producto + precio/estado cuando aplica)
- Tracking mínimo MVP agregado en la misma página:
  - `catalog_view`, `product_click`, `whatsapp_click`, `search_used`, `filter_used`
  - emisión por `window.dispatchEvent('tadaima:catalog-event')`
  - buffer temporal en `sessionStorage['tadaima_catalog_events']` (últimos 200)
- QA documentado:
  - `docs/testcases/QA-04-tienda-online-catalogo-publico.md`
- Estado de bloques:
  - Bloque A: ✅
  - Bloque B: ✅
  - Bloque C: ✅ base funcional
  - Bloque D: ✅ base funcional (tracking mínimo)
  - Bloque E: ✅ plan QA documentado, pendiente ejecución manual

---

### Sesión 2026-05-15 (nocturna 2) — UX cliente en Caja + ticket con contacto

**Contexto:** Después del ajuste visual para ocultar el slot de imagen en preventas sin foto, Joel pidió reforzar la experiencia de cliente dentro de Caja sin moverla de lugar. El objetivo era que el cliente se sintiera como paso obligatorio de preventa, no como input secundario, y que el ticket imprimiera mejor el contacto asociado.

**Cambios** (`landing/src/pages/SellPage.tsx`):

| Cambio | Detalle |
|---|---|
| Módulo cliente | La franja superior se rehízo como bloque visual con jerarquía clara. En preventa muestra `Paso 1 · Cliente de la preventa`, helper text y badge de estado `Requerido` / `Cliente asignado`. |
| Selector de flujo | Se mantuvo en la misma zona el switch `Buscar existente` / `Dar de alta`, pero con copy más claro y mejor separación visual. |
| Búsqueda | El input ahora comunica mejor que busca por nombre/teléfono/correo/código de tarjeta. El helper explica que primero intenta en BD local y luego en socios Tadaima. |
| Alta rápida | El formulario de cliente nuevo sigue inline, pero quedó más limpio: nombre, teléfono, correo y CTA `Guardar cliente`. |
| Resumen del cliente | Cuando ya hay cliente asignado, aparece una tarjeta compacta con nombre, teléfono, correo y acciones `Cambiar` / `Quitar`. Esto reduce duda al cobrar y deja claro a quién pertenece la preventa/venta. |
| Footer de cobro | Junto al bloque del total se agregó un resumen breve del cliente seleccionado para que el cajero no tenga que volver a subir la vista antes de cobrar. |
| Ticket / reimpresión | `CompletedSaleData` se extendió para arrastrar `customerPhone` y `customerEmail`. `doPrintTicket()` ahora imprime nombre, teléfono y correo cuando existan. También se actualizó la reimpresión desde historial de ventas/preventas para pasar esos datos cuando el payload los trae. |
| Data wiring | `setCustomer`, carga de folio existente y alta desde socio/cliente local ahora preservan mejor `customerPhone` y `customerEmail` en el estado de la mesa. |

**Verificación:** revisión visual del JSX en `SellPage.tsx` OK. `npm run build:web` sigue fallando, pero por deuda TypeScript pre-existente en múltiples pantallas (`AdminPage`, `CatalogToProductModal`, `TransfersPage`, etc.). Se corrigieron los errores nuevos que había introducido la reimpresión del historial.

**Resultado:** Caja comunica mucho mejor el paso de cliente en preventas sin mover el flujo principal, y el ticket ya sale más útil para seguimiento posterior.

---

### Sesión 2026-05-15 (nocturna) — Borrar usuario desde UI (admin)

**Contexto:** Backlog #8 indicaba que TabUsuarios ya tenía CRUD completo excepto el botón de eliminar. Joel pidió cerrar ese gap y luego que el confirm nativo se reemplazara por modal glass del sistema.

**Cambios** (`landing/src/pages/AdminPage.tsx` — solo TabUsuarios):

| Cambio | Detalle |
|---|---|
| Import | `deleteUser` agregado al import de `@tadaima/api`. |
| Estado | `confirmDelete: ApiUser \| null` (qué usuario está por borrarse) y `deletingId: number \| null` (request en vuelo). |
| `useAuth` | Hook agregado para detectar usuario actual y bloquear auto-borrado. |
| `askDelete(u)` | Abre modal. Si `currentUser.id === u.id` → toast rojo "No puedes eliminar tu propio usuario" sin abrir. |
| `confirmDeleteUser()` | Llama `deleteUser(id)` (soft-delete backend), filtra el usuario de la lista, toast verde, cierra modal. |
| Botón Trash2 | Al lado del Edit en cada fila. Color `#FF6B6B` o gris si es self. Spinner Loader2 durante request. Wrapper `<span title>` para tooltip (el componente `Btn` no acepta `title`). |
| Modal confirmación | Component `Modal` existente del archivo (mismo glass + backdrop blur). Header: `AlertTriangle` rojo en círculo glass. Cuerpo: pregunta con nombre + nota "será desactivado, no podrá iniciar sesión, ventas se conservan". Botones: Cancelar (ghost) + Eliminar (rojo). Ambos disabled durante request. |

**Backend:** `UserController::destroy()` (`/users/{id}`) ya hacía soft-delete (desactiva, no borra físicamente) — no se tocó nada del backend.

**Verificación:** `vite build` ✓ verde. Errores TS restantes (3) son pre-existentes en TabCategorias y TabProductos (no relacionados).

**Pendiente al cierre:** commit + push único de toda la jornada 2026-05-15 (matutina + vespertina + nocturna), deploy a Cloud Run.

---

### Sesión 2026-05-15 (vespertina) — Escaneo QR/barras en Caja + RBAC por rol

**Contexto:** Después del cleanup matutino del esquema legacy, Joel quiso cerrar dos pendientes de prioridad media del backlog: escaneo de folios en caja y gestión de visibilidad por rol. La auditoría inicial mostró que CRUD de usuarios + asignación de tienda + reset password + permisos granulares (`can_view_cost`, `store_access`, `product_scope`) **ya estaban implementados** pero nadie los enforzaba en UI. Lo que faltaba era el gating real por rol en pantallas.

**1. Escaneo QR/barras (USB HID + cámara) en SellPage**

| Archivo | Cambio |
|---------|--------|
| `landing/src/hooks/useBarcodeScanner.ts` | **NUEVO** — Listener global de `keydown` con heurística HID: intervalos < 35ms entre teclas, mínimo 4 chars, termina en Enter o flush a 100ms. Captura via `window.addEventListener('keydown', ..., { capture: true })` y dispara `preventDefault` en todos los eventos del scan cuando detecta ráfaga (evita que el código quede "tipeado" en el input enfocado). |
| `landing/src/components/CameraScannerModal.tsx` | **NUEVO** — Modal con `html5-qrcode` (soporta QR + Code128 + EAN13 + más). Cámara trasera por default (`facingMode: environment`), 12 fps, qrbox 260×260. Cleanup correcto al cerrar (stop + nullify ref). |
| `landing/package.json` | Dep añadida: `html5-qrcode` |
| `landing/src/pages/SellPage.tsx` | Import del hook y modal. Estado `showCameraScanner`. Handler `handleScannedCode(raw)`: si matchea `/^PREV-\d+/i` → `searchByFolio(code)`; sino busca SKU exacto en `products` → `addToCart`; sino → rellena `search` + toast warning. `useBarcodeScanner` activo siempre que no haya un modal de form abierto (catalog/apartar/cash). Botón "Escanear" ahora abre el modal de cámara en lugar de solo enfocar el input. |

**Cómo funciona:**
- **Lector USB HID**: el cajero conecta un lector tipo teclado, escanea cualquier código → ráfaga de teclas + Enter → el hook detecta velocidad de máquina, captura el buffer y dispara `handleScannedCode` sin necesidad de focus en input. Si el usuario tipea manualmente un SKU, el intervalo natural (>100ms) impide el match.
- **Cámara**: botón "Escanear" → modal con preview de cámara → autodetect → cierra y procesa el código.

**2. RBAC visibility por rol (admin/gerente/cajero)**

Hoy `Layout.tsx:41-44` solo distinguía admin vs todo lo demás → gerente y cajero veían el mismo nav. Joel definió reglas concretas:

| Pantalla | Admin | Gerente | Cajero |
|---|---|---|---|
| Inicio | AdminPage | Dashboard | Dashboard |
| Tiendas (caja) | — | ✅ | ✅ |
| Productos | ✅ edit + costo | ✅ edit, sin costo | ✅ solo alta, sin costo |
| Ventas (tickets) | ✅ | ✅ | ✅ |
| Clientes | ✅ | ✅ | ❌ (solo desde Caja) |
| Preventas | ✅ | ✅ sin costo | ❌ |
| Traslados | ✅ | ✅ | ❌ |
| Reportes | ✅ ganancia bruta | ✅ sin ganancia bruta | ❌ |
| Config | ✅ | ❌ | ❌ |

| Archivo | Cambio |
|---------|--------|
| `landing/src/lib/permisos.ts` | Extendido con: `isAdmin/isManager/isCashier` (helpers de rol), `primaryRole` (precedencia admin > gerente > cajero), tipo `PageKey`, `canAccessPage(roles, page)` con registry `PAGE_ACCESS` por rol, `canEditProducts/canCreateProducts/canDeleteProducts/canSeeGrossProfit`. Centraliza todas las reglas — antes estaban hardcoded en cada página. |
| `landing/src/layouts/Layout.tsx` | Reescrito el nav: `ALL_NAV_ITEMS` único con `page: PageKey`, filtra por `NAV_BY_ROLE[primaryRole(user.roles)]`. Eliminados los arrays separados `adminNavItems` y `staffNavItems`. |
| `landing/src/components/ProtectedRoute.tsx` | Nuevo prop opcional `requiresPage`. Si el usuario no tiene acceso, redirige a `/` (no a `/login`). |
| `landing/src/router/index.tsx` | Todas las rutas sensibles envueltas con `<ProtectedRoute requiresPage="...">`: sales, products, transfers, clients, pre-sales, reports, settings, stores, admin. Cajero que tipee `/reports` en URL → rebota a `/`. |
| `landing/src/pages/ProductsPage.tsx` | Reemplazado cálculo manual de `isAdmin/isGerente` por helpers de `permisos`. Añadidos `canEdit = admin\|gerente` y `canDelete = admin`. Columna "Editar" en tabla productos: renderiza `null` para cajero. Row onClick: solo handleEdit si `canEdit`. Card grid: cursor-pointer solo si puede editar. Misma lógica para columna Manga. |

**3. Auditoría completa de UsersPage + TabPermisos**

Confirmado que el módulo ya está completo:
- `TabUsuarios` (`AdminPage.tsx:474`): CRUD — crear, editar nombre/email/teléfono, asignar rol, asignar tienda, password (campo opcional al editar = reset), active toggle.
- `TabPermisos`: toggle `can_view_cost` por usuario, radio buttons para `store_access` (assigned/specific/all), checkboxes de `product_scope` (all/specific). Persiste en `users.can_view_cost` + `system_settings.price_permissions`.

Solo falta: botón de borrar usuario desde UI (hoy no existe — Joel decidió que no es prioritario). Backlog actualizado.

**Verificación:**
- `vite build` ✓ verde
- `vitest run src/lib/permisos.test.ts` → 18/18 tests pasan (preservados los originales + helpers nuevos)
- Errores TS pre-existentes (322) sin cambio — los archivos nuevos (`useBarcodeScanner`, `CameraScannerModal`, `permisos.ts`) sin errores

**Pendiente al cierre:**
- Pruebas en dev server con cuentas de cada rol (Joel/QA).
- Commit + push (Joel prefiere un push único al final).
- Deploy a Cloud Run.

---

### Sesión 2026-05-15 (matutina) — Verificación deuda técnica + extinción total del esquema legacy de preventas

**Contexto:** Joel revisó el MASTERLOG y notó que varias tareas marcadas como pendientes ya estaban resueltas o eran candidatas a cierre. Sesión dedicada a verificación y cleanup definitivo.

**1. Supabase loyalty en Cloud Run prod — ya estaba activado**
- Verificación: `gcloud run services describe tadaima --region=us-central1` → `TADAIMA_SUPABASE_URL` + `TADAIMA_SUPABASE_SERVICE_KEY` presentes.
- Smoke test confirmó lookup de socios funcional en prod.
- Estado en MASTERLOG actualizado de 🟡 a ✅.

**2. Servicio duplicado `tadaima` us-west1 — borrado**
- Verificación de tráfico (últimos 30 días): 1 hit aislado el 2026-05-02, sin domain mapping.
- Comando ejecutado: `gcloud run services delete tadaima --region=us-west1 --project=impusodigitaldorado --quiet`.
- Quedan solo `tadaima` us-central1 (real) y `pos` us-west1 (otro cliente, no tocar).

**3. Frontend — eliminado todo el flujo legacy de preventas**

Decisión Joel: "deberíamos quitar todo ese flujo para no confundir con lo que tenemos en preventas catálogos/folios/difusión, funciona bien el flujo con todo lo nuevo".

| Archivo | Cambio |
|---------|--------|
| `landing/src/pages/PreSalesPage.tsx` | Reescrito de 2,172 → 110 líneas. Ahora es shell que solo renderiza 3 tabs: Catálogos, Folios, Difusión. |
| `landing/src/components/presales/LiquidateModal.tsx` | **Borrado** |
| `landing/src/components/presales/PreSalesOpsPanel.tsx` | **Borrado** |
| `landing/src/components/presales/NewPreSaleModal.tsx` | **Borrado** |
| `landing/src/components/presales/EditPreSaleModal.tsx` | **Borrado** |
| `landing/src/components/presales/ArrivalModal.tsx` | **Borrado** |
| `landing/src/components/presales/ProductFormModal.tsx` | **Borrado** |
| `landing/src/components/presales/CreateProductFromPreSaleModal.tsx` | **Borrado** |
| `landing/src/components/presales/AdminStoreFilter.tsx` | **Borrado** |
| `landing/src/lib/presales.ts` + `.test.ts` | **Borrados** (sin consumidores) |
| `packages/api/src/preSales.ts` | **Borrado** (180 líneas, 13 funciones legacy) |
| `packages/api/src/index.ts` | Eliminado `export * from './preSales'` |
| `packages/api/src/types.ts` | Eliminados 7 tipos: `PreSale`, `PreSaleItem`, `PreSalePayment`, `PreSaleStatus`, `CreatePreSaleInput`, `AddPreSalePaymentInput`, `UpdatePreSaleStatusInput`, `GetPreSalesParams` |

**Verificación frontend:** `vite build` ✅ pasa. Errores TS pre-existentes bajaron de 401 → 322 (79 errores muertos eliminados).

**4. Backend — drop total del esquema legacy**

Después de auditoría completa, decisión Joel: "drop directo, no importan" sobre datos legacy en prod + "quitar las queries legacy" del ReportsController.

| Archivo | Cambio |
|---------|--------|
| `backend/app/Http/Controllers/Api/PreSalesController.php` | **Borrado** |
| `backend/app/Models/PreSale.php` | **Borrado** |
| `backend/app/Models/PreSaleItem.php` | **Borrado** |
| `backend/app/Models/PreSalePayment.php` | **Borrado** |
| `backend/app/Models/PreSaleLog.php` | **Borrado** |
| `backend/app/Http/Requests/StorePreSaleRequest.php` | **Borrado** |
| `backend/app/Http/Requests/UpdatePreSaleRequest.php` | **Borrado** |
| `backend/app/Http/Requests/UpdatePreSaleStatusRequest.php` | **Borrado** |
| `backend/app/Http/Resources/PreSaleResource.php` | **Borrado** |
| `backend/app/Http/Resources/PreSaleItemResource.php` | **Borrado** |
| `backend/app/Http/Resources/PreSalePaymentResource.php` | **Borrado** |
| `backend/app/Services/PreSaleService.php` | **Borrado** (605 líneas) |
| `backend/app/Models/Supplier.php` | Removida relación `preSales(): HasMany` |
| `backend/routes/api.php` | Eliminado bloque `/pre-sales` (10 rutas) + import |
| `backend/app/Http/Controllers/Api/ReportsController.php` | Removidos UNION legacy en `/reports/sales` (feed pre_sale_payments) y `/reports/pre-sales` (~70 líneas). Reportes ahora solo consultan esquema nuevo. |
| `backend/database/migrations/2026_05_15_000001_drop_legacy_pre_sales_tables.php` | **NUEVA** — drop ordenado por FKs: `pre_sale_logs` → `pre_sale_payments` → `pre_sale_items` → `pre_sales`. `down()` intencionalmente vacío. |

**Tablas dropeadas en MySQL prod** (Cloud SQL Proxy local apuntaba a `tadaimaposlite` en `pos-lite-db`): `pre_sales`, `pre_sale_items`, `pre_sale_payments`, `pre_sale_logs`. Verificado con `Schema::hasTable()` post-migración.

**Verificación backend:** `php artisan test` → 27/27 PHPUnit pasan. `php artisan route:list --path=pre-sale` → solo rutas del esquema nuevo.

**Métricas finales del cleanup:**
- **6,977 líneas eliminadas, 40 nuevas** en 31 archivos (frontend + backend + package + migración).
- Deuda técnica legacy pre_sales: completamente cerrada (4 ítems → 0).
- Backlog filas #4, #9, #10, #19 eliminadas.

**Estado pendiente al cierre:**
- Commit + push de toda la sesión (Joel prefiere un único push al final).
- Deploy a Cloud Run con `gcloud run deploy tadaima --source . --region=us-central1`.

---

### Sesión 2026-05-14 — QA Ruben: 12 fixes + plan de pruebas + permisos costos

**Contexto:** QA Ruben subió PDF (`QA - Tadaima Web.pdf`) con bugs en prod: "no puede vender". Joel reactivó proxy Cloud SQL y Laravel local. Cliente final aún no usa el sistema → fase de test, OK ensuciar prod.

**Decisión de entorno** (memoria persistente `project_prod_test_phase.md`): QA se hace directo contra MySQL prod vía Cloud SQL Proxy. No SQLite, no DB separada. Los datos creados durante QA se quedan.

**Bugs fixeados (12 cambios):**

| # | Origen del bug | Archivo | Fix |
|---|----------------|---------|-----|
| 1 | Admin "Sin tiendas asignadas" bloqueaba caja en prod | `StoreContext.tsx:34-38` | Lógica defensiva — admin u user sin store_id ven todas las tiendas. Hipótesis original: combinación rara de `user.roles` vacío + `store_id` apuntando a tienda inactiva. |
| 2 | `POST /products → 422` mostraba "Datos no válidos" genérico | `ProductsPage.tsx:20-32, 970` + `CatalogToProductModal.tsx:173` | `alert()` reemplazado por toast que extrae `errors` por campo de la respuesta Laravel. Causa más probable del 422 era SKU duplicado oculto. |
| 3 | Modal Productos↔Tomos/Mangas se cerraba al cambiar tab | `ProductsPage.tsx` | Modal mount movido fuera del fragmento `{pageSection === 'productos' && <>...}`. Antes vivía dentro y no se renderizaba al switchear desde Tomos. |
| 4 | `TypeError: Cannot read properties of undefined (reading 'length')` al ver inventario de manga | `packages/api/src/mangas.ts:23-26` + `MangaEditModal.tsx:98-109` | `getMangaInventory` hacía `response.data.data` pero el interceptor ya unwrapea `{data: ...}` → segundo `.data` daba undefined. Fix: `return response.data ?? []`. Defensive: `Array.isArray(items) ? items : []` en consumer. |
| 5 | Columna `P1 / Anticipo` en lista de catálogos mostraba precio prominente y anticipo chico — confuso | `PreSaleCatalogsPanel.tsx:234-245` | Swap visual: Anticipo prominente arriba, "Precio: $X" chico abajo. Header → "Anticipo · Precio". |
| 6 | Toggle "Publicar ahora" sin contexto al usuario | `NewPreSaleCatalogModal.tsx:300-322` | Copy dinámico según estado: ON → "Se podrá vender en Caja al guardar." · OFF → "Queda como borrador — NO aparecerá en Caja hasta que lo publiques." |
| 7 | Check "Notificado" en Difusión sin persistencia backend | `PreSaleDifusionPanel.tsx:157-167` | Comentado. Decisión: agregar persistencia en sprint dedicado (columna `notified_at` o entrada en `pre_sale_order_logs`). |
| 8 | Imágenes no aparecían en catálogo de Caja | `SellPage.tsx:17, 391-410` | Adapter de `getProducts → forma local SellPage` no mapeaba `image`. Agregado `firstImage?.url ?? storageUrl(firstImage?.image_path)`. |
| 9 | Imágenes parejas en catálogo (algunas se cortaban, otras dejaban espacios) | `ProductCatalogModal.tsx:255, 446` | Ratio cambiado de `2/1` (banner ancho) a `1/1` cuadrado + `objectFit: contain` con padding 6px. Estándar de productos. |
| 10 | Caja 2+: "carrito no sincronizado: pantalla muestra $2,000 pero servidor tiene $1,000" | `SellPage.tsx changeQty` | Dos bugs: (a) si el `addDraftItem` inicial aún no termina y el user clickea `+`, `itemId` undefined → early return SIN rollback; (b) si `updateDraftItem` falla, solo toast.error sin revertir UI. Fix: rollback de cantidad + depositAmount en ambos casos, marca `syncError` para bloquear checkout. |
| 11 | Item de preventa nueva en carrito mostraba precio×cantidad ($1,100) en lugar de anticipo ($100) | `SellPage.tsx:2718-2738` | Items con `sellingCatalogId != null` ahora muestran `item.depositAmount` prominente (ámbar) + `de $1,100` chico. Items regulares y de folio cargado sin cambios. |
| 12 | Imágenes thumbnail en listas de mangas y preventas | `ProductsPage.tsx:1237-1253` + `PreSaleCatalogsPanel.tsx:210-225` | Mangas: thumbnail 40×40 si hay `image_url`, sino fallback al badge de volumen. Preventas: thumbnail 36×36 si hay `image_path` (via storageUrl), sino placeholder con icon Package. |

**Permisos de costo — enforcement real:**

Encontrado: el `TabPermisos` (`Inicio → Permisos` PRICE_PERMISSIONS) existe y **guarda** datos (`users.can_view_cost` + JSON en `system_settings.price_permissions`) pero **nadie lee** esos datos fuera del editor.

- Fix aplicado: `ProductsPage.tsx:852` cambiado de `(isAdmin && (user?.can_view_cost ?? true)) || false` → `isAdmin || !!user?.can_view_cost`. Ahora gerente/cajero ven costos solo si admin les activa el toggle desde Permisos.
- Fix aplicado: `ReportsPage.tsx:117-120` añadido `canViewCost` + gate en KPI "Ganancia bruta" (líneas 376-388 del bloque ventas).
- Pendiente: los permisos granulares (`product_scope: specific|all` + `store_access: assigned|specific|all` + `extra_store_ids` + `product_ids`) **siguen sin enforcement**. Sprint dedicado.

**Plan QA generado:** `docs/QA_PLAN_2026-05-14.md` (30+ casos en bloques A-G, prioridades P0/P1/P2, comandos, criterios de aceptación). Para Ruben ejecutar cuando todo esté deployado.

**Memoria nueva guardada:** `project_prod_test_phase.md` — durante fase de test, QA va directo contra MySQL prod, no migrar a SQLite.

**Decisiones del producto (Joel):**
- Lock de `preorder_limit` post-arrived: dejar como está, no permitir subir aunque llegue stock de más.
- Límite por tienda: no implementar, sin límite por tienda (lo que entra es el límite).
- Imagen en perfil cliente: requiere migración nueva + endpoint, defer a sprint dedicado.
- Roles: dueño/admin ven todo, gerente y cajero ven solo su tienda asignada. Gerente puede vender + gestionar pero NO ve costos reales/finanzas a menos que admin le active el flag.
- Comisiones de terminal nunca al cliente (regla ya cableada).

**Pendientes inmediatos al cierre:**
- QA: Joel está probando en local (vite + Laravel local + MySQL prod). Va a reportar bugs encontrados.
- Deploy: commit + push + `gcloud run deploy tadaima` cuando termine el smoke test local.
- Ruben: no está probando ahora — esperará al deploy para probar contra `tadaima.poslite.com.mx`.

---

### Sesiones anteriores a 2026-05-14 — archivadas (depurado 2026-06-03)

> Las narrativas detalladas de las sesiones de **2026-05-12 y anteriores** (hasta 2026-04-22) se removieron de este log el 2026-06-03 para mantenerlo ligero (>20 días). Están **completas en el git history** del repo (`git log -p MASTERLOG.md`).
>
> Lo que sigue vigente está capturado en: **§7 ADRs** (010–016), **§2 Arquitectura del sistema**, **§3 Evolución del módulo de preventas**, y el **Backlog → Completado recientemente**. Hitos de ese periodo: migración a Cloud SQL MySQL + GCS (05-01), deploy inicial a Cloud Run (04-30/05-02), Loyalty Supabase (05-05), extinción del esquema legacy de preventas (05-15), React Query global + IndexedDB (05-15).
