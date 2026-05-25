# MASTERLOG — Tadaima POS

> Registro maestro del proyecto: arquitectura, evolución, decisiones clave y estado actual.
> Actualizado: 2026-05-25 (QA fixes ronda 5 + sesiones de caja conflict modal + margen visible mangas + quitar cliente desde caja)

---

## ESTADO ACTUAL DEL PROYECTO (resumen rápido para nuevas sesiones)

| Componente | Estado | Notas |
|-----------|--------|-------|
| Backend API (Laravel) | ✅ En producción | revision `tadaima-00053-697` (2026-05-25), URL: tadaima-987277625193.us-central1.run.app. **`min-instances=1`** desde 2026-05-21 (~$8-10/mes, elimina cold starts de 5-37s). **ADR-015 (2026-05-22): cost_at_sale** — sale_items/pre_sale_order_items/layaways tienen columna `cost` snapped al INSERT. Reportes históricos inmutables aunque admin re-precie productos. **Cash session conflict (2026-05-25)**: `CashSessionConflictException` + `POST /cash/sessions/{id}/force-close` admin-only + `cash/registers` embed `active_session`. |
| Landing / Web (React) | ✅ En producción | Email folio, historial mixto, Tarjeta/Transferencia, checkout mixto. **ADR-014 (2026-05-18): client-authoritative cart**. Dashboard gerente con Cajeros conectados + Cortes de hoy. Tab "Reporte del Día" en /sales (admin/gerente) con secciones A-F + Imprimir + Exportar PDF. **Helpers de fecha local** en `lib/date.ts` (`getTodayLocal`/`useTodayLocal`/`daysAgoLocal`/`toLocalYmd`) eliminan bug UTC stale en todos los filtros "Hoy". |
| App móvil (Expo) | ⏳ Pendiente | Estructura base existe en `apps/`, sin paridad de features |
| Deploy / Cloud Run | ✅ Operacional | `gcloud run deploy --source .`, región us-central1. Build remoto en Cloud Build (no requiere Docker local) |
| DB Producción | ✅ Operacional | MySQL `pos-lite-db` en us-west1, vía Cloud SQL Proxy en local o `DB_SOCKET` en Cloud Run |
| Bucket GCS | ✅ Configurado | `gs://tadaima-media`, FILESYSTEM_DISK=gcs en producción |
| Dominio custom | ✅ Activo | `tadaima.poslite.com.mx` mapeado a `tadaima` us-central1 |
| Loyalty Supabase | ✅ Activo en prod | `TADAIMA_SUPABASE_URL` + `SERVICE_KEY` configuradas en Cloud Run `tadaima` us-central1. Lookup de socios funciona end-to-end (verificado 2026-05-15) |
| Servicio duplicado | ✅ Borrado | `tadaima` us-west1 eliminado 2026-05-15. Solo queda `tadaima` us-central1 (real) y `pos` us-west1 (otro cliente) |

---

## BACKLOG PRIORIZADO — actualizado 2026-05-12

> Qué hay para trabajar, en orden de valor/impacto.

### ✅ Completado recientemente

| # | Área | Feature | Sesión |
|---|------|---------|--------|
| 1 | Caja | Email folio preventa al cliente | 2026-05-01/02 |
| 2 | Caja | Historial mixto persiste entre sesiones (`linked_sale_id`) | 2026-05-01/02 |
| 3 | Ventas | SalesPage "Por Cobrar" migrado a `getPreSaleOrders` | 2026-05-01/02 |
| 6 | Caja | Tarjeta y Transferencia habilitados en preventas | 2026-05-01/02 |
| 7 | Reportes | `GET /reports/pre-sales` (UNION legacy+nuevo) | 2026-05-01/02 |
| 13 | Productos | Force-delete admin con cleanup GCS cascada | 2026-05-04 |
| 14 | Productos | Replace image GCS+DB; cleanup huérfanas | 2026-05-04 |
| 15 | Mangas | Edit/delete mangas+tomos; modal con diseño Alta de Tomos | 2026-05-04 |
| 16 | Loyalty | Integración Supabase `external/card` + `external/customers` (lookup, search, auto-sync, card "Socio encontrado") | 2026-05-05 |
| 17 | Caja | **Fix bug checkout mixto** — liquidación + regular + nueva preventa ahora funciona y dispara ticket | 2026-05-12 |
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
| - | Deploy | **Dominio custom activo** `tadaima.poslite.com.mx` | 2026-05-05 |

### 🟡 Media prioridad (mejora flujo o datos)

| # | Área | Feature / Fix | Detalle |
|---|------|--------------|---------|
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

### Sesión 2026-05-12 — Fix bug checkout mixto + deploy a prod

**Objetivo**: Arreglar un bug donde una venta que mezclaba (a) liquidación de un folio cargado, (b) un producto regular y (c) una nueva preventa con anticipo, registraba la liquidación pero **no generaba ticket** y descartaba silenciosamente la nueva preventa.

**Diagnóstico** (`landing/src/pages/SellPage.tsx`):
- La rama 1 de `handleCheckout` (`activeMesa.loadedPreSaleOrderId`) tenía 3 bugs:
  1. `newItemsSubtotal` (línea 819) incluía catálogos de preventa nuevos como si fueran regulares → `createSale` enviaba un monto que no cuadraba con el draft del backend → trono silencioso.
  2. La rama nunca llamaba a `createPreSaleOrder` → la nueva preventa se descartaba.
  3. No había `triggerPrintFlow` → liquidación quedaba sin ticket.
- Orden problemático: `addPreSaleOrderPayment` + `updatePreSaleOrderStatus(delivered)` se ejecutaban **antes** del `createSale`, así que cuando trono no hubo rollback.

**Fix aplicado**:
- Nuevo campo `loadedPreSaleOrderCode?: string` en Mesa interface (persistir el código del folio cargado para mostrarlo en el ticket).
- Reescritura de rama 1: split del carrito en 3 grupos (`liquidationItems` / `regularItems` / `newCatalogItems`) y orden seguro de operaciones:
  1. `createSale` con regulares (si falla, no se ha tocado el folio cargado)
  2. `createPreSaleOrder` con catálogos nuevos (con `linked_sale_id` si hay venta regular)
  3. `addPreSaleOrderPayment` + `updatePreSaleOrderStatus(delivered)` (al final)
  4. `triggerPrintFlow` con ticket mixto (items entregados con folio entre paréntesis + productos regulares + sección de nueva preventa con anticipo)

**Deploy**:
- Build remoto vía `gcloud run deploy tadaima --source . --region=us-central1 --project=impusodigitaldorado` (no requiere Docker local; Cloud Build construye y publica la imagen).
- Revisión nueva: `tadaima-00034-ghr` en us-central1, 100% del tráfico.
- Smoke test: `tadaima.poslite.com.mx` HTTP 200; `/api/v1/auth/login` HTTP 422 (validación correcta).

**Hallazgos secundarios**:
- Hay **3 servicios** en Cloud Run del proyecto: `pos` us-west1 (otro cliente, NO TOCAR), `tadaima` us-west1 (duplicado sin tráfico, candidato a borrar), `tadaima` us-central1 (el real con dominio).
- El servicio prod **NO tiene** `TADAIMA_SUPABASE_URL` / `TADAIMA_SUPABASE_SERVICE_KEY` configuradas, así que la integración loyalty (introducida en sesión 2026-05-05) solo funciona en local. Usuario va a agregarlas manualmente.

**Resultado**: ✅ Fix en prod. Pendiente: usuario agrega Supabase vars en Cloud Run + valida flujo mixto end-to-end.

---

### Sesión 2026-05-05 — Integración Tadaima Loyalty (Supabase) en lookup de socios

**Objetivo**: Conectar el lookup de tarjetas externas (escanear / buscar por nombre / email / ID) con la base de datos de socios Tadaima alojada en Supabase. Sincronizar el socio encontrado al modelo `customers` del POS sin duplicar registros.

**Endpoints implementados** (`backend/app/Http/Controllers/Api/ExternalCardController.php`):
- `GET /api/v1/external/card/{code}` — lookup por código exacto.
- `GET /api/v1/external/customers?query=...` — búsqueda por nombre/email/ID con lista de coincidencias.
- `POST /api/v1/external/customer` — register/sync explícito al hacer click en "Agregar".

**Config**:
- `backend/config/services.php` lee `TADAIMA_SUPABASE_URL` y `TADAIMA_SUPABASE_SERVICE_KEY` desde env.
- Mapper de columnas Supabase confirmado: `nombre`, `apellidos`, `telefono`, `email`, `id`.
- Si las vars están vacías → controlador retorna error "servicio no configurado" sin tronar.

**Cambios de UX (landing)**:
- Al escanear código: ya no auto-crea customer. Muestra card "Socio encontrado" con datos y botón **Agregar**.
- Búsqueda por nombre/email/ID en `ClientsPage` y `SellPage` con lista de resultados (no solo match exacto).

**Política definida** (memoria persistente):
- Supabase es **solo lectura** desde el POS. NO modificar tablas Supabase, NO crear migraciones del lado loyalty, NO escribir puntos. Cualquier cambio se hace solo del lado POS (MySQL) hasta aprobación explícita.

**Commits**: `87ac7dd bb15a9f dc54599 732b924 cc010d0`.

**Resultado**: ✅ Funciona en local con `php artisan serve`. Pendiente activar vars en Cloud Run prod (ver sesión 2026-05-12).

---

### Sesión 2026-05-04 — Productos, mangas e imágenes

**Objetivo**: Cerrar varios pendientes del módulo de productos: gestión de imágenes en GCS, edición/borrado de mangas y tomos, force-delete administrativo.

**Cambios principales**:
- **Force-delete admin** de producto (`ProductController`): cleanup en cascada de ventas, layaways, inventory, product_images y archivos GCS. Confirmación con dialog. Bloqueado si tiene layaways activos (sin force).
- **Replace image**: al editar producto, borra archivo anterior de GCS + fila DB antes de subir el nuevo. Evita huérfanos.
- **Migración `clean_corrupt_product_images`**: limpia filas que apuntan a archivos inexistentes en GCS.
- **`ProductThumb`**: reset de estado de error cuando cambia `src` (evita placeholder permanente tras una imagen rota).
- **CSP**: agregado `storage.googleapis.com` a `img-src` en config (las imágenes ahora se sirven directo desde GCS, no del backend).
- **Mangas**: modal de edición con el mismo diseño del modal "Alta de Tomos" (consistencia visual). Endpoints edit/delete para `mangas` y `tomos`.

**Commits**: `74c4fd0 a9623a3 a1e3f96 a24fc23 85e452b 682c890 030ff0a 768d9a0 70c429e 9f90ffa`.

**Resultado**: ✅ Productos y mangas con CRUD completo + cleanup robusto de imágenes.

---

### Sesión 2026-05-02 — Deploy a producción funcional + Bug crítico .gitignore + QA completo

**Objetivo**: Completar el deploy a Cloud Run con MySQL, ejecutar migraciones en producción, y verificar que el sistema funciona end-to-end.

**Resultado**: ✅ Sistema 100% operacional en producción. 14/14 endpoints QA pasando.

---

#### Bug crítico encontrado y resuelto — `backend/app/` excluido de Cloud Build

**Síntoma**: Todos los endpoints devolvían `500 Server Error` con `Class "App\Http\Controllers\Api\AuthController" does not exist`.

**Causa raíz**: El patrón `app/` (sin `/` inicial) en el `.gitignore` raíz del monorepo matcheaba recursivamente cualquier directorio llamado `app/` en cualquier nivel del árbol, incluyendo `backend/app/`. `gcloud run deploy --source .` usa Cloud Build, que respeta `.gitignore` al crear el tarball fuente. Resultado: el container se construía sin ningún archivo PHP de la aplicación (controllers, models, services, etc.).

**Fix**: Cambiar `app/` → `/app/` en `.gitignore` (el `/` inicial ancla el patrón al directorio raíz del repositorio). Esto ignora la carpeta Expo en la raíz (`/app/`) sin afectar `backend/app/`.

**Por qué no se detectó antes**: Los deploys anteriores con `./deploy.sh` hacían un `docker build` local, que usa el filesystem real (no git), por lo que incluía todos los archivos. Solo `gcloud run deploy --source .` (Cloud Build) es afectado por `.gitignore`.

---

#### Flujo de la sesión

| Paso | Acción | Resultado |
|------|--------|-----------|
| 1 | Crear Cloud Run Job `tadaima-migrate` y ejecutar migraciones | `Nothing to migrate` — migraciones ya estaban aplicadas desde el deploy anterior |
| 2 | Nuevo deploy `tadaima-00016-n7n` | `500` en todos los endpoints |
| 3 | Rollback a revisión 00015 | También `500` — problema sistémico, no de esta revisión |
| 4 | Debug job para inspeccionar filesystem del container | `FILE_MISSING` para `AuthController.php` |
| 5 | Verificar git: `git ls-files --others backend/app/` | 175 archivos no trackeados |
| 6 | Identificar causa: `app/` en `.gitignore` raíz | El patrón recursivo excluía `backend/app/` del source upload |
| 7 | Fix `.gitignore`: `app/` → `/app/` | `backend/app/` ya no ignorado |
| 8 | Deploy `tadaima-00017-tr4` | ✅ Login responde `200` |
| 9 | QA smoke test 14 endpoints | 13/14 ✓ (report/pre-sales pendiente) |
| 10 | Add método `preSales()` en ReportsController + ruta | Deploy `tadaima-00018` → 500 por usar accessors Eloquent |
| 11 | Fix query: subqueries SQL en lugar de `.sum('total')` | Deploy `tadaima-00019` → ✅ 14/14 QA pass |

---

#### Commits de esta sesión

| Hash | Mensaje |
|------|---------|
| `08ad0db` | `feat: track backend/app source, fix Cloud Build deploy, add production features` (201 archivos) |
| `93974bc` | `feat: add GET /reports/pre-sales endpoint (UNION legacy + new schema)` |
| `3a96600` | `fix: reports/pre-sales use SQL subqueries (total/paid_amount are Eloquent accessors)` |

---

#### QA resultados (producción, revisión 00019)

| Endpoint | Resultado |
|----------|-----------|
| `POST /auth/login` | ✅ |
| `GET /stores` | ✅ 2 tiendas |
| `GET /payment-methods` | ✅ 4 métodos |
| `GET /cash/session` | ✅ |
| `GET /customers` | ✅ |
| `GET /products` | ✅ |
| `GET /pre-sale-catalogs` | ✅ |
| `GET /pre-sale-orders` | ✅ |
| `GET /sales` | ✅ |
| `GET /reports/sales` | ✅ |
| `GET /reports/cash` | ✅ |
| `GET /reports/pre-sales` | ✅ |
| `GET /reports/customers` | ✅ |
| `GET /reports/top-products` | ✅ |
| **Crear cliente** | ✅ |
| **Crear catálogo preventa** | ✅ |
| **Crear folio PREV-00001** | ✅ total=$8999, anticipo=$1500, saldo=$7499 |

---

#### Estado de producción al cierre

| Item | Estado |
|------|--------|
| URL | `https://tadaima-987277625193.us-central1.run.app` |
| Revisión activa | `tadaima-00019-k2c` |
| DB | MySQL Cloud SQL `pos-lite-db` · todas las migraciones aplicadas |
| GCS | `gs://tadaima-media` · `FILESYSTEM_DISK=gcs` |
| Usuarios | 3 (admin, gerente×2) · password: `devaccess` |
| Dominio custom | ⏳ `tadaima.poslite.com.mx` pendiente asignar |
| Email real | ⏳ `MAIL_MAILER=log` (no envía, solo loguea) |

---

#### Lección aprendida — .gitignore con patrones sin `/` inicial

Un patrón como `app/` en `.gitignore` aplica a CUALQUIER subdirectorio en el árbol, no solo en la raíz. Para ignorar solo el directorio raíz usar `/app/`. Esto afecta a Cloud Build, `git archive`, y cualquier herramienta que respete gitignore. Los `docker build` locales no se ven afectados porque usan el filesystem real.

---

### Sesión 2026-05-01 — Migración a Cloud SQL MySQL + GCS + Bug Fixes

**Objetivo**: Reemplazar SQLite efímero por Cloud SQL MySQL persistente, agregar GCS para imágenes, y cerrar bugs #2 y #3 del backlog.

**Estado**: Código implementado — pendiente que el usuario ejecute Fase 1 (comandos gcloud) y luego `./deploy.sh`.

#### Infraestructura a crear (usuario ejecuta Fase 1)

Ver comandos completos en la sesión del chat. Resumen:
- `gcloud sql databases create tadaimaposlite --instance=pos-lite-db`
- Usuario MySQL `tadaima_app` con GRANT solo sobre `tadaimaposlite`
- Secret Manager: `tadaima-db-password`
- Bucket: `gs://tadaima-media` (público, CORS configurado)
- IAM: service account de Cloud Run con `cloudsql.client` + `storage.objectAdmin`

#### Cambios en código (implementados en esta sesión)

| Archivo | Cambio |
|---------|--------|
| `Dockerfile` | Reemplazado `pdo_sqlite` por `pdo_mysql`, eliminados paquetes sqlite |
| `docker/entrypoint.sh` | Reescrito para MySQL: wait loop + seed condicional por users count |
| `deploy.sh` | `--add-cloudsql-instances`, env vars MySQL/GCS, secret `tadaima-db-password` |
| `backend/config/filesystems.php` | Disco `gcs` con `spatie/laravel-google-cloud-storage` |
| `backend/composer.json` | `spatie/laravel-google-cloud-storage: ^2.4` instalado |
| `backend/.env` | Actualizado a MySQL local (Cloud SQL Proxy) |
| `backend/.env.example` | Documentado MySQL + GCS |
| `backend/.env.production.example` | **NUEVO** — referencia completa para producción |
| `docs/LOCAL_DEV_SETUP.md` | **NUEVO** — guía Cloud SQL Proxy local |
| `backend/database/migrations/2026_05_01_000001_add_linked_sale_id_to_pre_sale_orders.php` | **NUEVA** — columna `linked_sale_id` FK a `sales` |
| `backend/app/Models/PreSaleOrder.php` | `linked_sale_id` en fillable + relación `linkedSale()` |
| `backend/app/Http/Requests/StorePreSaleOrderRequest.php` | Validación `linked_sale_id` |
| `backend/app/Services/PreSaleOrderService.php` | `createOrder` acepta y persiste `linked_sale_id` |
| `backend/app/Http/Resources/PreSaleOrderResource.php` | Expone `linked_sale_id` |
| `backend/app/Http/Controllers/Api/PreSaleOrdersController.php` | Status CSV (`pending,ready`) en `index()` |
| `packages/api/src/types.ts` | `linked_sale_id` en `PreSaleOrder` + `CreatePreSaleOrderInput`; status como `string` |
| `landing/src/pages/SalesPage.tsx` | **Fix #3** — migrado de `getPreSales` a `getPreSaleOrders` con status `pending,ready` |
| `landing/src/pages/SellPage.tsx` | **Fix #2** — venta mixta crea sale primero y pasa `linked_sale_id` al folio |

#### Para ejecutar deploy después de Fase 1

```bash
# Obtener password del secret (para .env local)
gcloud secrets versions access latest --secret=tadaima-db-password --project=impusodigitaldorado

# Actualizar backend/.env con el password real

# Deploy a producción
./deploy.sh
```

#### QA a verificar post-deploy (Fase 4)

1. Cold start conecta a Cloud SQL (buscar `[entrypoint] MySQL conectado` en logs)
2. Crear preventa → sobrevive cold start (datos en MySQL no se borran)
3. Subir imagen → URL `https://storage.googleapis.com/tadaima-media/...` accesible
4. SalesPage "Por Cobrar" muestra suma correcta de folios `pending/ready`
5. Venta mixta guarda `linked_sale_id` en BD

---

### Sesión 2026-04-30 — Deploy a Cloud Run + Fix Login Network Error

**Objetivo**: Subir Tadaima POS a Google Cloud Run con Docker y dejarlo funcionando en producción.

**Resultado**: ✅ App corriendo en `https://tadaima-hbsx563yua-uc.a.run.app` — login funcional, seed automático en cold start.

---

#### Infraestructura Docker

| Componente | Decisión |
|-----------|----------|
| Base PHP | `php:8.3-fpm-alpine` |
| Web server | nginx (puerto 8080) vía unix socket a php-fpm |
| Proceso manager | supervisord |
| DB | SQLite efímero — recreado en cada cold start con seed automático |
| Build | Multi-stage: Node 20 Alpine (Vite) → Composer 2 → runtime PHP Alpine |
| Deploy | `deploy.sh` → `docker build` → Artifact Registry → `gcloud run deploy` |

**Archivos creados/configurados:**
- `Dockerfile` — multi-stage, linux/amd64
- `docker/nginx.conf` — puerto 8080, location `/api/` → php-fpm, `/` → SPA fallback `index.html`
- `docker/supervisord.conf` — php-fpm priority=10, nginx priority=20, `fatal-exit` eventlistener
- `docker/entrypoint.sh` — crea SQLite si no existe, migrations, seed solo en DB nueva, storage:link
- `deploy.sh` — build + push + deploy automatizado con `IMAGE_TAG=gitsha-timestamp`

---

#### Bugs encontrados y corregidos

| # | Síntoma | Causa raíz | Fix |
|---|---------|-----------|-----|
| #1 | **Network Error en login** (browser, no curl) | `import.meta['env']` (bracket notation) no es reemplazado por Vite en build time — `PROD` siempre `undefined` → cae a fallback `http://127.0.0.1:8000` | Cambiar a `import.meta.env.PROD` y `import.meta.env.VITE_API_URL` directo en `packages/api/src/client.ts` |
| #2 | PHP extensions `intl` y `zip` no cargan en Cloud Run | `apk del icu-dev libzip-dev` removía también los runtime libs `icu-libs` y `libzip` | Agregar `icu-libs`, `libzip`, `oniguruma` explícitamente al `apk add` para que no sean auto-removidos |
| #3 | Docker reusaba imagen vieja (mismo git hash `d0b591e`) | `IMAGE_TAG=$(git rev-parse --short HEAD)` nunca cambia sin commit nuevo | Cambiar a `IMAGE_TAG=gitsha-timestamp` (`d0b591e-1777520125`) para forzar nueva revisión siempre |
| #4 | SQLite seeder nunca corría | `touch database.sqlite` en Dockerfile hacía que entrypoint creyera que la DB ya existía | Eliminar el `touch` del Dockerfile — entrypoint lo crea y detecta DB nueva |
| #5 | Secret Manager Permission Denied | Service account de Cloud Run sin acceso a `tadaima-app-key` | `gcloud secrets add-iam-policy-binding ... --role=roles/secretmanager.secretAccessor` |
| #6 | CORS rechaza URLs de Cloud Run | `allowed_origins` solo tenía `APP_URL` (URL regional) pero user accede por URL canónica `hbsx563yua` | Agregar `allowed_origins_patterns` con regex para ambas URLs de Cloud Run |

---

#### Cambios en archivos existentes

| Archivo | Cambio |
|---------|--------|
| `packages/api/src/client.ts` | `import.meta.env.PROD` directo (no bracket notation) en `resolveBaseUrl()` y `storageUrl()` |
| `landing/src/pages/LoginPage.tsx` | Eye toggle para ver/ocultar password (`showPassword` state + `Eye`/`EyeOff` de lucide) |
| `landing/src/App.tsx` | `ErrorBoundary` class component wrapping toda la app — muestra stack trace en pantalla si hay crash |
| `backend/config/cors.php` | `allowed_origins_patterns` con regex para `tadaima-*-uc.a.run.app` |
| `backend/database/seeders/DatabaseSeeder.php` | Password cambiado de `password` a `devaccess` |
| `deploy.sh` | Tag único con timestamp, `--build-arg VITE_API_URL=""` explícito |
| `package.json` | `"packageManager": "npm@10.8.2"` (requerido por Turbo 2.9.6) |

---

#### Credenciales de producción (seed)

| Usuario | Email | Password |
|---------|-------|----------|
| Admin | admin@tadaima.mx | devaccess |
| Gerente T1 | gerente1@tadaima.mx | devaccess |
| Gerente T2 | gerente2@tadaima.mx | devaccess |

> Nota: SQLite se recrea en cada cold start de Cloud Run — las credenciales siempre quedan limpias del seed.

---

#### URLs de producción

| URL | Tipo |
|-----|------|
| `https://tadaima-hbsx563yua-uc.a.run.app` | Canónica (usar esta) |
| `https://tadaima-987277625193.us-central1.run.app` | Regional |
| `https://tadaima.poslite.com.mx` | Dominio custom (en proceso — pendiente verificar `poslite.com.mx` con cuenta `joel@poslite.com`) |

---

#### Estado al cierre de sesión

| Item | Estado |
|------|--------|
| Deploy automático con `./deploy.sh` | ✅ |
| Login funcional en producción | ✅ |
| SQLite + seed en cold start | ✅ |
| PHP extensions (intl, zip) cargando | ✅ |
| Dominio `tadaima.poslite.com.mx` | ⏳ Pendiente — verificar domain con `gcloud auth login joel@poslite.com` luego `gcloud beta run domain-mappings create --service=tadaima --domain=tadaima.poslite.com.mx --region=us-central1` |

---

### Sesión 2026-04-29 (tarde)

**Objetivo**: Reportes mejorados (corte por día), bug de terminales en caja, checkboxes de pago en productos, QA SQL de reportes.

**Trabajo realizado**:

| Área | Fix / Feature | Archivos |
|------|--------------|---------|
| Bug CRÍTICO | Terminales nunca se cargaban en caja — `getTerminals()` no se llamaba; `terminals` estado siempre vacío | `SellPage.tsx` |
| Bug | Campo `activeTerminal.commission` → `.commission_percent` (nombre incorrecto vs API) | `SellPage.tsx` |
| Bug | `selectedTerminalId?: string` → `number` — el `find()` nunca matcheaba por mismatch de tipo | `SellPage.tsx` |
| Feature | Checkboxes "Acepta efectivo" / "Acepta tarjeta" en formulario de producto (tab Precios) | `ProductsPage.tsx` |
| Feature | Validación: al menos un método de pago requerido (toast + return) | `ProductsPage.tsx` |
| Feature | Backend ya tenía `allow_cash`/`allow_card` — solo faltaba exponer en frontend | `ProductsPage.tsx`, `types.ts` |
| Feature | Advertencia inline en carrito cuando método de pago activo ≠ lo que acepta el producto | `SellPage.tsx` |
| Feature | Corte por día expandible en ReportsPage con desglose por método de pago + lista de tickets | `ReportsPage.tsx` |
| Feature | KPIs: Ganancia bruta prominente + Ingresos + Anticipos + Transacciones + Descuentos + Comisiones | `ReportsPage.tsx` |
| QA | Script SQL `verify_report.sql` — valida coherencia de reportes contra datos crudos | `backend/scripts/verify_report.sql` |

**Resultado QA SQL** (ejecutado contra DB real):
- 3 ventas completadas · $144,995 ingresos
- 4/4 checks PASS: coherencia día-total, pagos por método, ventas sin pago huérfanas, items vs subtotales
- 5 folios de preventa (sistema nuevo) · $50,299

**Pendientes que salieron de esta sesión**:
- Email folio PREV-XXXXX al cliente cuando se crea PreSaleOrder (entry point: `PreSaleOrdersController::store()`)
- SalesPage "Por Cobrar" todavía usa `getPreSales` (API legacy)

---

### Sesión 2026-04-23

**Objetivo**: QA completo del módulo de preventas + corrección de bugs.

**Trabajo realizado**:

| Hora aprox | Actividad |
|-----------|-----------|
| 00:00 | Evaluación fase 8 (cleanup legacy) — bloqueado por PreSalesPage/SalesPage que aún usan API vieja |
| 00:10 | Reescritura completa de `DatabaseSeeder.php` — seed limpio: 2 tiendas, 5 usuarios, 3 catálogos publicados, 0 inventario/productos |
| 00:30 | Fix bug SQLite en seeder: batch insert con columnas distintas → cambiado a `foreach` + insert individual |
| 01:00 | Generación de `MASTERLOG.md` en raíz del proyecto |
| 01:15 | Generación de 3 test cases QA en `docs/testcases/` (QA-01, QA-02, QA-03) |
| 01:30 | Ejecución QA-02 (ciclo de caja) contra API live → 9/11 PASS, 2 notas de diseño |
| 02:00 | Ejecución QA-01 (flujo completo preventa) → 13/14 PASS, 1 falso positivo corregido |
| 02:30 | Ejecución QA-03 (límites, validaciones, permisos) → 10/16 PASS, 4 bugs encontrados |
| 03:00 | Generación de `docs/testcases/QA-REPORT-2026-04-23.md` con todos los hallazgos |
| 03:30 | Corrección de los 5 bugs encontrados en QA |

**Bugs encontrados y corregidos**:

| # | Severidad | Módulo | Síntoma | Fix aplicado |
|---|-----------|--------|---------|-------------|
| #1 | P1 MEDIA | `StoreCustomerRequest` | Teléfono duplicado aceptado (201) | `unique:customers,phone` en rules() |
| #2 | P2 NEGOCIO | `PreSaleOrderService::cancel()` | `reserved_count` no bajaba al cancelar | Filtrar solo pedidos `pending\|ready` con `activeOrderItems()` |
| #3 | P0 ALTA | `PreSaleOrderService::createOrder()` | Anticipo > precio total aceptado | Calcular `$totalPrice` y lanzar DomainException si `advance > total` |
| #4 | P0 ALTA | `PreSaleCatalogsController` | Cajero podía crear/modificar catálogos | Check `hasRole('admin')\|\|hasRole('gerente')` en `store()` y `updateStatus()` |
| #5 | P1 MEDIA | `PreSaleOrdersController::index()` | Cajero veía folios de otras sucursales | Forzar `store_id = $user->store_id` cuando rol es `cajero` |

**Archivos modificados (sesión 2026-04-23)**:

- `backend/database/seeders/DatabaseSeeder.php` — reescrito completo
- `backend/app/Models/PreSaleCatalog.php` — agregado `activeOrderItems()` relation + uso en `getReservedCountAttribute()`
- `backend/app/Services/PreSaleOrderService.php` — validación `advance ≤ total`, uso de `activeOrderItems` en limit check
- `backend/app/Http/Controllers/Api/PreSaleCatalogsController.php` — role check en `store()` y `updateStatus()`
- `backend/app/Http/Controllers/Api/PreSaleOrdersController.php` — cajero scoped a su `store_id`
- `backend/app/Http/Requests/StoreCustomerRequest.php` — `unique:customers,phone`
- `MASTERLOG.md` — creado y actualizado
- `docs/testcases/QA-01-flujo-completo-preventa.md` — creado
- `docs/testcases/QA-02-ciclo-caja-preventa.md` — creado
- `docs/testcases/QA-03-limites-validaciones-reportes.md` — creado
- `docs/testcases/QA-REPORT-2026-04-23.md` — creado

---

### Sesión 2026-04-22

**Objetivo**: Refactorizar el sistema de preventas completo.

**Trabajo realizado**:
1. **Análisis arquitectónico** — identificada necesidad de separar catálogos de folios
2. **Diseño de BD** (planner + architect agents) — schema de 5 nuevas tablas
3. **Migraciones** — 5 migraciones nuevas + 1 migración de datos
4. **Backend Phase 1** — Modelos, Resources, FormRequests, PreSaleOrderService
5. **Backend Phase 2** — Controllers (PreSaleCatalogsController, PreSaleOrdersController), rutas en api.php
6. **Frontend Phase 3** — PreSaleCatalogsPanel.tsx (nuevo componente admin)
7. **Package API Phase 4** — preSaleCatalogs.ts, preSaleOrders.ts, types.ts actualizados
8. **Frontend Phase 5** — ProductCatalogModal.tsx refactorizado con CatalogCard / OrderCard
9. **Frontend Phase 6** — SellPage.tsx completamente refactorizado al nuevo esquema
10. **Tests Phase 7** — 17 tests backend (PHPUnit) + 8 tests E2E (TC-78 a TC-85, Bloque 12)
11. **Seed Phase 8** — DatabaseSeeder.php reescrito: 2 tiendas, 5 usuarios, 3 catálogos publicados

**Bugs corregidos**:
- Migration SQLite upsert bug (`seed_points_multiplier_setting.php`) — guard para SQLite
- UserFactory `email_verified_at` inexistente — usar `User::create()` directo en tests
- TypeScript `exactOptionalPropertyTypes` — conditional spread en `createPreSaleOrder` call

**Archivos modificados** (sesión completa):
- `backend/database/migrations/` — 6 nuevas migraciones
- `backend/app/Models/` — 5 nuevos modelos (PreSaleCatalog, PreSaleOrder, ...)
- `backend/app/Http/Resources/` — 4 nuevos resources
- `backend/app/Http/Controllers/Api/` — 2 nuevos controllers + deliverItem en PreSaleOrdersController
- `backend/app/Services/PreSaleOrderService.php` — nuevo service
- `backend/app/Http/Requests/` — 3 nuevos form requests
- `backend/routes/api.php` — 2 nuevos grupos de rutas
- `backend/database/seeders/DatabaseSeeder.php` — reescrito completo
- `backend/tests/Feature/PreSaleCatalogsTest.php` — nuevo
- `backend/tests/Feature/PreSaleOrdersTest.php` — nuevo
- `packages/api/src/types.ts` — tipos del nuevo esquema
- `packages/api/src/preSaleCatalogs.ts` — nuevo módulo
- `packages/api/src/preSaleOrders.ts` — nuevo módulo
- `packages/api/src/index.ts` — exports nuevos módulos
- `landing/src/pages/SellPage.tsx` — refactor completo
- `landing/src/components/ProductCatalogModal.tsx` — CatalogCard + OrderCard
- `tests/e2e/tadaima.spec.ts` — Bloque 12 (TC-78 a TC-85)
- `docs/flujos-preventas.md` — documentación actualizada

---

## SESIÓN 2026-04-27 — Historial Caja, Ticket de impresión, Venta mixta y Bugs críticos

### Contexto
Continuación de sesiones anteriores. El sistema de preventas por catálogo ya funciona en backend y frontend. Esta sesión agregó el historial de ventas del día en Caja, el flujo de impresión de tickets con preferencia, soporte de venta mixta (preventa + productos regulares en el mismo carrito), y corrigió varios bugs críticos de runtime y base de datos.

---

### 1. SalesPage (`/sales`) — rediseño y filtros

- Filtro de fechas rediseñado: presets chips (Hoy / 7 días / Este mes) + inputs de rango, con CSS vars del tema (ya no hardcoded rgba blanco).
- Selector de tienda role-based: admin ve todas las tiendas con "Todas las tiendas", cajero ve solo badge de su sucursal.
- Dropdown de método de pago usa `var(--td-panel-bg)` / `var(--td-panel-border)` — visible en light mode.
- Botón **"Ticket"** de reimpresión en cada fila expandida de la tabla — llama `printTicket(sale)` que abre ventana 72mm.
- `SalesController::index()` — ahora eager-carga `items.product` (antes solo `customer` + `payments`) → fix "Sin detalle de artículos" en historial expandido.

---

### 2. SellPage — Historial del Día modal

- Botón **Historial** en toolbar de Caja (ícono `History`).
- `fetchHistorial()` llama en paralelo `getSales` + `getPreSaleOrders` filtrados por fecha de hoy y `store_id`.
- Lista unificada `HistorialEntry` (discriminated union `{ type: 'sale' | 'presale'; data }`) ordenada por hora desc.
- Ventas regulares → borde rojo, expandible con items + pagos + totales.
- Preventas → borde ámbar, badge "Preventa", expandible con artículos del catálogo + anticipo/saldo/estado.
- Cada fila tiene botón reimpresión de ticket (ícono `Printer`).
- Botón "Actualizar historial" al pie que refetch sin importar el cache.
- Cache se invalida (`setHistorialEntries([])`) al completar cualquier venta o preventa → al reabrirse el modal se refetch automático.

---

### 3. SellPage — Ticket de impresión con preferencia

- `doPrintTicket(sale: CompletedSaleData)` abre ventana 72mm con HTML inline, llama `win.print()` tras 300ms. El navegador siempre muestra el diálogo de impresión (limitación web — sin impresión silenciosa).
- Preferencia guardada en `localStorage['tadaima_print_pref']`: `'auto'` | `'ask'` (default) | `'never'`.
- `triggerPrintFlow(sale)`: si `auto` → imprime directo, si `never` → no hace nada, si `ask` → muestra modal.
- Modal "¿Imprimir ticket?": resumen de venta + checkbox "No preguntar de nuevo". Al imprimir con checkbox → guarda `auto`; al omitir con checkbox → guarda `never`. Link "Restablecer preferencia" elimina la clave.

---

### 4. SellPage — Venta mixta (preventa catálogo + productos regulares en mismo carrito)

**Problema:** `StorePreSaleOrderRequest` valida `items.*.catalog_id` como requerido. Al mezclar un artículo de catálogo con un producto regular en el carrito, el regular (sin `sellingCatalogId`) enviaba `undefined` y el backend retornaba `422 Los datos enviados no son válidos`.

**Fix:** En el branch `isPreventa` de `handleCheckout`:
- `catalogItems = items.filter(i => i.sellingCatalogId != null)` → van a `createPreSaleOrder`
- `regularItems = items.filter(i => i.sellingCatalogId == null && !i.isFromPreSale)` → van a `createSale` con draft normal

**Ticket mixto:**
- `CompletedSaleData` extendido con `preSaleCode?`, `preSaleItems?`, `preSaleAnticipo?`.
- `doPrintTicket` renderiza sección "★ PREVENTA · Folio PREV-XXXXX" cuando `preSaleCode` está presente, seguida de sección "PRODUCTOS" si hay regulares, y grand total combinado al pie.
- Cuando es solo preventa o solo venta regular, el ticket muestra solo esa sección normalmente.

---

### 5. Pendiente — Email con folio de preventa al cliente

Cuando el cliente tiene email registrado, enviarle automáticamente el folio PREV-XXXXX con detalle del anticipo pagado. **No implementado aún.** Cuando se implemente, agregar en `PreSaleOrdersController::store()` un `Mail::to($customer->email)->send(new FolioCreatedMailable($order))` o equivalente con queue.

---

### Bugs corregidos

| # | Módulo | Síntoma | Causa | Fix |
|---|--------|---------|-------|-----|
| #1 | `SalesController::index()` | "Sin detalle de artículos" al expandir historial | `Sale::with([...])` no incluía `items.product` | Añadido `items.product` al eager load |
| #2 | `SellPage` runtime | `ChevronRight is not defined` al expandir historial | Import faltante en SellPage (solo estaba en SalesPage) | Añadido `ChevronRight` a imports de lucide-react |
| #3 | `SellPage` runtime | `setHistorialSales is not defined` al completar venta regular | Nombre de estado refactorizado a `historialEntries` pero llamada no actualizada | `setHistorialSales([])` → `setHistorialEntries([])` en línea 1465 |
| #4 | SQLite FK | `no such table: main.pre_sale_catalogs_old` al crear preventa | SQLite auto-actualiza FKs en otras tablas al renombrar; migración `000001` renombró la tabla y luego la borró dejando `pre_sale_order_items` con FK rota | Migración correctiva `2026_04_27_000001_fix_pre_sale_order_items_fk` recrea la tabla con `REFERENCES pre_sale_catalogs(id)` correcto, preservando datos |

---

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `landing/src/pages/SalesPage.tsx` | Rediseño filtros, store picker role-based, CSS vars, reimpresión ticket |
| `landing/src/pages/SellPage.tsx` | Historial modal, ticket print flow, venta mixta, fix setHistorialEntries |
| `backend/app/Http/Controllers/Api/SalesController.php` | `items.product` en eager load de `index()` |
| `backend/database/migrations/2026_04_27_000001_fix_pre_sale_order_items_fk.php` | **NUEVO** — fix FK rota a pre_sale_catalogs_old |

### Estado al cierre de sesión

| Feature | Estado |
|---------|--------|
| Historial del día en Caja (ventas + preventas unificadas) | ✅ |
| Ticket de impresión con preferencia auto/ask/never | ✅ |
| Venta mixta preventa catálogo + producto regular | ✅ |
| Ticket mixto con ambas secciones + grand total | ✅ |
| Folio PREV-XXXXX en ticket de preventa | ✅ |
| FK SQLite rota corregida (migration 2026-04-27) | ✅ |
| Email con folio al cliente | ⏳ Pendiente |

---

## SESIÓN 2026-04-24b — UX Catálogos: ciclo completo, historial, imágenes, header Preventas, TanStack Table

### Contexto
Continuación de la misma jornada del 2026-04-24. Se pulió el flujo completo del módulo de catálogos de preventa desde el estado borrador hasta el cierre del ciclo, además de mejoras en Productos y navegación de Preventas.

---

### 1. Folios — colores de items y estado "Liquidado" real

- Items pendientes: texto/ícono cambiado de blanco a ámbar `#fbbf24` (antes era invisible en dark mode).
- Badge por item por catálogo: entregado = azul CheckCircle2, expirado = rojo AlertCircle + fecha, pendiente = ámbar Clock.
- Estado **Liquidado** del folio solo se asigna cuando TODOS los items de TODOS los catálogos están entregados. Antes se marcaba al pagar aunque hubiera items pendientes.
- `PreSaleOrderService::liquidate()` reescrito: marca items llegados como entregados → cuenta pendientes → solo cambia order.status a `delivered` si count = 0, si no registra "Entrega parcial" y mantiene `ready`.
- `PreSaleOrdersController::deliverItem()` auto-cierra el folio cuando el último item se marca delivered.

---

### 2. Modales de confirmación en acciones de catálogo

- Botones Publicar / Llegó / Cerrar / Cancelar / Completar ciclo ahora muestran un modal de confirmación con título, descripción descriptiva del impacto, y checkbox **"No mostrar de nuevo"** (persiste en `localStorage` con key `td_confirm_skip_${action_key}`).
- `CompletedBlockModal`: si el catálogo tiene `sold_count === delivered_count > 0` y el admin intenta cancelar, se muestra este modal explicando que debe usar "Completar ciclo" en su lugar.

---

### 3. Lock del límite de unidades al editar catálogo

- `preorder_limit` deshabilitado en el modal de edición cuando `catalog.status` es `arrived | closed | cancelled`.
- Label muestra 🔒, opacity 0.45, cursor not-allowed y tooltip. Previene errores humanos de cambiar el límite después de que el producto ya llegó.

---

### 4. Status `completed` — cierre del ciclo de preventa

**Backend:**
- `PreSaleCatalog::STATUS_COMPLETED = 'completed'` añadido al modelo.
- `UpdatePreSaleCatalogStatusRequest` actualizado con `completed` en la validación.
- `PreSaleCatalogsController::updateStatus()` acepta transición `arrived → completed`.
- Migración `2026_04_24_000002_add_completed_status_to_pre_sale_catalogs.php` — solo MySQL (ALTER ENUM).
- Migración `2026_04_25_000001_fix_completed_status_sqlite.php` — SQLite: usa `PRAGMA writable_schema = ON` + `UPDATE sqlite_master` para parchear el CHECK constraint. Solución a `SQLSTATE[23000]: Integrity constraint violation: 19 CHECK constraint failed`.

**Frontend:**
- `packages/api/src/types.ts` — `PreSaleCatalogStatus` incluye `'completed'`.
- `STATUS_CFG['completed']`: badge morado `#A78BFA`, ícono Star.
- `NEXT_STATUSES['arrived']` incluye `{ to: "completed", label: "Completar ciclo", onlyWhenComplete: true }` — solo aparece cuando `sold_count === delivered_count > 0`.
- Catálogos completados: se ocultan de Caja y Difusión (filtro por status).
- Vista admin: catálogos completados muestran SOLO botón "Ver historial", sin Editar ni acciones de transición.

---

### 5. CatalogHistoryModal — historial de ventas

- **NUEVO** `landing/src/components/presales/CatalogHistoryModal.tsx`.
- Fetch de `getPreSaleOrders({ catalog_id, per_page: 200 })`.
- Stats en header: total folios, entregados, unidades totales, total recaudado.
- Tabla: Folio | Cliente + teléfono | Cant. | Total | Pagado | Saldo (o "Liquidado") | Estado badge | Fecha.
- Accesible desde:
  - Botón **"Ver historial"** en catálogos `completed`.
  - Botón **"Ventas"** en catálogos activos con `sold_count > 0`.

---

### 6. ProductsPage — imágenes y layout sin imagen

- Bug corregido: `apiProductToProducto` siempre asignaba `imagen: ''` — nunca leía `p.images[]`.
- Fix: `imagen: p.images[0]?.image_path ? storageUrl(p.images[0].image_path) : ''`.
- Vista tabla: si no hay imagen, no se renderiza el `<img>` (sin placeholder vacío).
- Vista tarjeta: si hay imagen → layout original con `aspect-square`; si no hay imagen → tarjeta compacta (nombre, SKU, stock, precio, categoría) sin espacio desperdiciado.

---

### 7. PreSalesPage — header y reordenamiento de tabs

- Header añadido: "Preventas **Tadaima**" + badge de rol (Admin / Vendedor activo según `isAdmin`) + subtítulo "Gestión de catálogos y folios de preventa".
- Tabs reordenados: **Catálogos** (admin-only) → **Folios** → **Difusión**.
- Tab "Llegados" comentado (`// { id: "llegados" ... }`) — no se ocupa por ahora.
- Effect y render block de "Llegados" también comentados.
- Tipo de `adminTab` actualizado para excluir `"llegados"`.

---

### 8. PreSaleCatalogsPanel — migración a TanStack Table

- Motor cambiado de tabla HTML manual a **`@tanstack/react-table` v8** (ya instalado en el proyecto).
- Sorting por columna con click en header: Producto, Categoría, P1/Anticipo, Límite (vendidos), Status. Ícono `⇅ ↑ ↓` indica estado de orden.
- Paginación manejada internamente por TanStack (eliminados `useState(page)`, `totalPages`, `safePage`, `paginated` manual).
- Columna Acciones: `enableSorting: false`.
- Estilo visual 100% idéntico al original: glass, colores, tipografía, botones de acción, badges.
- `columnDef.meta.tdStyle` usado para aplicar `padding`, `textAlign` por columna sin duplicar JSX.

---

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `landing/src/components/presales/PreSaleOrdersPanel.tsx` | Colores items, badge por catálogo, estado Liquidado real |
| `landing/src/components/presales/PreSaleCatalogsPanel.tsx` | Modales confirmación, lock límite, status completed, TanStack Table |
| `landing/src/components/presales/CatalogHistoryModal.tsx` | **NUEVO** — modal historial de ventas |
| `landing/src/components/presales/NewPreSaleCatalogModal.tsx` | Lock de preorder_limit para arrived/closed/cancelled |
| `landing/src/pages/PreSalesPage.tsx` | Header, tabs reordenados, Llegados comentado |
| `landing/src/pages/ProductsPage.tsx` | Fix imágenes con storageUrl, layout sin imagen compacto |
| `landing/src/pages/SellPage.tsx` | Filtro catalogs completed en vista Caja |
| `packages/api/src/types.ts` | PreSaleCatalogStatus incluye 'completed' |
| `backend/app/Models/PreSaleCatalog.php` | STATUS_COMPLETED const |
| `backend/app/Http/Requests/UpdatePreSaleCatalogStatusRequest.php` | 'completed' en validación |
| `backend/app/Http/Controllers/Api/PreSaleCatalogsController.php` | Transición arrived→completed, lock preorder_limit |
| `backend/app/Http/Controllers/Api/PreSaleOrdersController.php` | Auto-cierre folio al entregar último item |
| `backend/app/Services/PreSaleOrderService.php` | liquidate() reescrito con entrega parcial |
| `backend/database/migrations/2026_04_24_000002_*` | MySQL ALTER ENUM → completed |
| `backend/database/migrations/2026_04_25_000001_*` | SQLite PRAGMA writable_schema fix |

### Estado al cierre de sesión

| Feature | Estado |
|---------|--------|
| Ciclo completo: draft→published→arrived→completed | ✅ |
| Modales de confirmación con "no mostrar de nuevo" | ✅ |
| Lock de límite post-arrived | ✅ |
| SQLite CHECK constraint corregido | ✅ |
| Historial de ventas por catálogo | ✅ |
| Botón Ventas en catálogos activos con ventas | ✅ |
| ProductsPage imágenes cargando | ✅ |
| Header Preventas con rol badge | ✅ |
| Tabs: Catálogos → Folios → Difusión | ✅ |
| TanStack Table con sorting en Catálogos | ✅ (pendiente verificar visual) |

---

## SESIÓN 2026-04-24 — UX Preventa: Toaster, Cliente Nuevo, Folios y Bug crítico hasRole

### Contexto
Continuación directa de la sesión 2026-04-23. El sistema de preventa por catálogo ya funciona en backend. Esta sesión se enfocó en pulir el flujo completo de cajero/admin en frontend y corregir un bug crítico de backend que impedía listar folios.

---

### 1. Toaster sonner no aparecía (pantalla en blanco)

**Problema:** `<Toaster>` nunca estaba montado en la app — todos los `toast()` eran silenciosos. Además, el wrapper `components/ui/sonner.tsx` usaba `useTheme` de `next-themes` (no instalado), causando crash al montarlo.

**Fix:**
- `landing/src/App.tsx` — import directo desde `'sonner'` (no el wrapper), montado con `toastOptions` de estilo slate azul oscuro.

---

### 2. Validaciones de checkout en Preventa (dos toasts simultáneos)

**Problema:** Al dar "Apartar" sin cliente ni efectivo, solo se veía el flash del input pero no el toast (por bug #1 arriba).

**Fix en `landing/src/pages/SellPage.tsx`:**
- Reestructura de validaciones: ahora acumula `blocked = true` sin early-return inmediato.
- Toast ámbar "Falta cliente para la preventa" + flash/focus en input de cliente.
- Toast rojo "Ingresa el anticipo recibido" si Efectivo/Dólares y `cashReceived < totalDeposit`.
- Ambos toasts se muestran simultáneamente si faltan los dos.
- Import `Banknote` de lucide-react añadido.

---

### 3. Anticipo como label (no editable)

**Problema:** El input de anticipo en el carrito permitía borrar el valor.

**Fix:** Reemplazado completamente por un label estático con badge verde (liquidado) o ámbar (anticipo parcial). Función `setItemDeposit` eliminada.

---

### 4. Formulario "Cliente Nuevo" con botón Agregar

**Problema:** El formulario de nuevo cliente solo tenía nombre + teléfono + leyenda estática "se registrará al confirmar el apartado". El cliente no se registraba hasta hacer el apartado, lo que generaba confusion.

**Fix en `landing/src/pages/SellPage.tsx`:**
- Nuevo campo `customerEmail?: string` en tipo Mesa.
- Campo email (opcional) en el formulario.
- Botón **Agregar** que llama `createCustomer()` al instante, selecciona el cliente creado y muestra toast verde.
- Estado `isRegisteringCustomer` con spinner en el botón.
- Leyenda estática eliminada.
- `createCustomer` importado de `@tadaima/api`.

---

### 5. Tab "Folios" en PreSalesPage

**Problema:** Los apartados de catálogo (`pre_sale_orders`) no aparecían en ningún tab — estaban en un sistema nuevo separado del tab "Gestión" (que usa el sistema viejo de `/pre-sales`).

**Fix:**
- `landing/src/components/presales/PreSaleOrdersPanel.tsx` — nuevo componente creado.
  - Tabla paginada de `PreSaleOrder` con filtros por status, tienda, búsqueda por folio.
  - Muestra: folio, cliente, productos, total, anticipo, saldo pendiente, estado con badge de color, tienda, fecha.
  - Admins ven todos; cajeros ven solo su tienda (backend filtra por rol).
- `landing/src/pages/PreSalesPage.tsx`:
  - Nuevo tab "Folios" visible para todos (Catálogos y Operaciones siguen siendo admin-only).
  - Default tab cambiado a "folios" (antes era "gestion").
  - Badge rojo en tab Folios con count de `pending + ready`.
  - `getPreSaleOrders` importado para calcular el count del badge.

---

### 6. Bug crítico: `hasRole()` no existe en User model → GET /pre-sale-orders retornaba 500

**Causa raíz:** El User model en Tadaima no usa Spatie `HasRoles`. Tiene `getRolesAttribute(): array` propio pero no el método `hasRole()`. El `PreSaleOrdersController::index()` llamaba `$user->hasRole('cajero')` → `BadMethodCallException` → HTTP 500 para TODOS los usuarios.

**Consecuencia:** El tab Folios siempre mostraba "Sin folios" porque el API retornaba 500 (capturado silenciosamente por el catch del panel).

**Fix en `backend/app/Models/User.php`:**
```php
public function hasRole(string|array $roles): bool
{
    $roles = (array) $roles;
    return count(array_intersect($this->roles, $roles)) > 0;
}
```
Verificado con `curl` real: endpoint devuelve los 2 folios correctamente post-fix.

**Otros controllers afectados (mismo patrón, misma solución):** `PreSaleCatalogsController` (store, update, updateStatus) también usaba `hasRole()` pero esas acciones son solo para admin — si el admin lo llamaba el check también explotaba, pero como el admin no era cajero el error solo impactaba en listado.

---

### Archivos modificados en esta sesión

| Archivo | Cambio |
|---------|--------|
| `landing/src/App.tsx` | Toaster sonner montado con estilo custom |
| `landing/src/pages/SellPage.tsx` | Validaciones checkout, label anticipo, formulario cliente nuevo con Agregar, import Banknote + createCustomer |
| `landing/src/pages/PreSalesPage.tsx` | Tab Folios, default folios, badge count, import getPreSaleOrders |
| `landing/src/components/presales/PreSaleOrdersPanel.tsx` | **NUEVO** — tabla paginada de PreSaleOrders |
| `packages/api/src/cash.ts` | `register.store_id` añadido al tipo CashSession |
| `backend/app/Models/User.php` | Método `hasRole()` añadido — fix bug crítico |

### Estado al cierre de sesión

| Feature | Estado |
|---------|--------|
| Toasts visibles en toda la app | ✅ |
| Checkout preventa con validaciones dobles | ✅ |
| Anticipo como label no editable | ✅ |
| Cliente nuevo con registro inmediato | ✅ |
| Tab Folios con lista de apartados | ✅ |
| GET /pre-sale-orders funcional | ✅ Fix aplicado |
| Folios del Samsung Galaxy visibles en UI | ✅ Verificado con curl |

---

## Sesión 2026-05-19 — QA Web 4 + perf checkout + UNIFICACIÓN mangas como productos

### Resumen de la sesión

Múltiples bugs reportados por Rubén en QA Web 4 (PDF), más optimizaciones y una decisión arquitectónica grande al final: **unificar mangas con productos** para eliminar deuda técnica del sistema dual.

### Bugs QA Web 4 resueltos (commit `4f900af`)

| # | Bug | Causa | Fix |
|---|---|---|---|
| 1 | Terminal: campo "Sucursal" desaparece al editar | `{!modal.data.id && ...}` envolvía el field | Removido wrapper + `store_id` añadido a `UpdateTerminalPayload` y `updateTerminal()` call |
| 2 | Cajero ve todas las tiendas + puede editar | `StoresPage` no filtraba por user.store_id ni gateaba el botón Editar/Nueva Tienda | Añadidos helpers `isAdminUser`, `canEditStores`; filtro `getStores().filter()`; props `canEdit` en `StoreCard` |
| 3 | Cajero ve productos de otras sucursales | `ProductsPage` inicializaba `selectedStoreId = null` y el cajero veía global | `useEffect` que fuerza `selectedStoreId = user.store_id` para no-admin |
| 6 | Scanner agrega 2 productos por escaneo | Físico (rebote del HID) o React StrictMode en dev | `useRef` con timestamp en `handleScannedCode` — ignora mismo código <500ms |

### Bug A — Stock fantasma cross-caja (commit `e82681e`)

**Síntoma:** "Otros cajeros reservaron 4, disponible para ti: -2, solicitado: 1" — venta bloqueada aunque el producto físicamente existe.

**Causa raíz:** `CheckoutService::reserveStock` sumaba `sales_drafts.status='open'` de OTROS cajeros para restar del stock disponible. Con ADR-014 (carrito client-side) los drafts solo deberían vivir milisegundos dentro de la transacción, pero quedaban huérfanos por:
- Checkouts antiguos pre-ADR-014 que la migración previa no había alcanzado
- Crashes mid-transacción que dejaban drafts open en MySQL
- Crons de expiración (`drafts:expire-warned`) estaban comentados en `routes/console.php`

**Fix:**
1. `reserveStock` ahora solo valida stock real + `lockForUpdate` (que ya prevenía oversell). Mensaje de error compatible con el regex del frontend para que auto-quite el item del carrito.
2. Migración one-shot `2026_05_19_000001_cancel_open_drafts_after_killing_cross_caja.php` cancela todos los `status='open'` atorados en prod.

### Bug B — Admin no veía selector al cerrar caja (commit `e82681e`)

**Causa:** `useEffect` (SellPage:537) re-asignaba `activeStore` desde `cashSession` apenas el admin lo ponía en null tras `handleCloseCash`. La query de session aún no se invalidaba y el efecto leía la cached → admin nunca veía el guard de selector de tiendas.

**Fix:** El efecto ahora solo aplica si `cashSession?.status === 'open'`. Sesiones cerradas no reviven el `activeStore`.

### UX caja — rename + atajo flotante (commits `e82681e`, `e58e99d`, `73952d8`)

- Tab 1 → "Caja Principal" (turno del cajero), tabs 2..5 → "Venta 2/3/4/5"
- Header del tab bar muestra "CAJA · {tienda} · {cajero}"
- Card flotante bottom-right con accesos rápidos a otras ventas (Crown icon para principal, ShoppingCart para ventas paralelas)
- Pulso rojo en filas con items, gris en vacías
- Botón "cancelar venta" (Trash2) solo en Venta 2..5 — Caja Principal nunca se borra
- Variables `--td-*` para soporte light/dark theme

### Auto-refresh React Query (commit `e58e99d`)

**Síntoma:** producto nuevo no se veía en Caja hasta darle sync manual.

**Causa:** `useProductsLightQuery` tenía `refetchOnMount: false` con `staleTime: 24h`. Cuando `ProductsPage` invalidaba post-create, la query marcaba stale pero al volver a Caja NUNCA refetcheaba.

**Fix:** Removido `refetchOnMount: false` de `useProductsQuery`, `useProductsLightQuery`, `useProductsInfiniteQuery`, `useCustomersAllQuery`. Default `true`: si stale, refetch al mount; si fresh, lee del cache. Cero overhead extra.

### Perf checkout — -24% queries por venta (commit `73952d8`)

Tres optimizaciones validadas con phpunit 27/27:

1. **`SalesDraftItem::withoutEvents()` en checkoutDirect**: el observer `bumpDraftFromItem` gastaba 2 queries por item (lazy load del draft + saveQuietly). En checkout el draft se completa en la misma transacción — bump es desperdicio. Replicamos el cálculo de `total` y `created_at` a mano.
2. **`reserveStock` fusiona sum + lock en 1 query**: antes hacía `Inventory::sum()` y luego `Inventory::lockForUpdate()->first()` por separado. Ahora trae las filas con lock + suma en PHP + elige bodega en PHP.
3. **Prefetch warehouses + `whereIn`**: una sola query al inicio del loop trae los warehouse_ids activos de la tienda. El loop usa `whereIn('warehouse_id', $ids)` en lugar de `whereHas('warehouse', ...)` que generaba `EXISTS` correlacionadas.

**Resultado:** ~21 → ~16 queries para venta de 1 item, ~28 → ~22 para 3 items. Lock transaccional más corto.

### Deploy

Cambio a Cloud Build (`gcloud run deploy --source`) para no depender de Docker local. Revisión `tadaima-00039-8fr` sirviendo 100% del tráfico en us-central1.

---

## Sesión 2026-05-19 (continuación) — Unificar mangas como productos

### Decisión arquitectónica

Los mangas (librerías) viven hoy en tablas paralelas (`mangas`, `manga_inventories`) con su propio controller, modelo y modal. En Caja NUNCA se han podido cobrar porque `CheckoutService::reserveStock` solo consulta `inventories`, no `manga_inventories`. Las columnas `manga_id` en `sale_items` y `sales_draft_items` existen pero la lógica de checkout, devoluciones y `inventory_movements` no las usa.

**Opciones evaluadas** (validadas con `code-architect` agent):

| Opción | Pros | Contras |
|---|---|---|
| Mantener dual + añadir branching en checkout/return/inventory | Sin migración de datos | Branching en muchos archivos, deuda técnica permanente |
| **Migrar mangas a products con `product_type='manga'`** (Class Table Inheritance) | Cero branching en checkout/return/reportes, schema extensible | Migración de datos histórica (mitigable con backup) |

**Elegida:** Class Table Inheritance — `products` (base) + `product_manga_details` (extensión) + `inventories` (compartida). Los detalles específicos de manga (`volume_number`, `editorial`, `genre`) viven en la tabla extensión, no como nullables en `products`.

### Plan

#### Schema (1 migración nueva)
- `products.product_type ENUM('product','manga')` default `'product'` + índice
- Nueva tabla `product_manga_details(product_id PK, volume_number, editorial, genre)`
- Migración de datos (atomic):
  - Por cada manga → INSERT en products + product_manga_details + product_prices
  - Copia `manga_inventories` → `inventories` con el nuevo `product_id`
  - Remappea `sale_items.manga_id` → `product_id` (mapping manga_id → new product_id)
  - `sales_draft_items` ya están cancelados todos (migración del Bug A)
- Mantiene `mangas` y `manga_inventories` como backup. Drop después de 1-2 semanas en prod.

#### Backend
- `ProductController::index` acepta `?type=manga|product`
- `MangaController` se convierte en facade que delega a Product con `type='manga'`
- `CheckoutService` — **CERO cambios** (manga ahora es product, ya funciona)
- `SalesController::return` — **CERO cambios** (manga ahora es product)
- `InventoryMovement` — **CERO cambios** (todo es product_id)
- `SaleItem::manga()` — no se necesita, `product()` cubre todo

#### Frontend
- `ProductsPage` tab "Tomos" → `useProductsQuery({ type: 'manga' })`
- `MangaEditModal` sigue existiendo (UI específica para alta de tomo) pero internamente POSTea a `/products` con `product_type='manga'` + payload de details
- `SellPage` — **CERO cambios** (los mangas aparecen como productos normales en search/scan/catálogo)

### Riesgos críticos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Conflicto de `sku` único entre product y manga | Prefijar `MANGA-{code}` si colisiona durante migración |
| Mangas históricas en sale_items rompen reportes existentes | UPDATE de remapping atomic en la misma transacción de migración |
| `mangas` con `manga_inventories` 1:N por bodega | Mismo schema en `inventories`, copia directa |
| `mangas` sin `allow_cash/allow_card` | Default `true,true` al INSERT |
| Rollback necesario | `down()` de la migración vacía las columnas nuevas; los datos siguen intactos en `mangas` y `manga_inventories` originales |
| Stock de manga editado desde MangaEditModal | El modal debe POSTear a `/inventory/{product_id}/{warehouse_id}` (no a `/manga-inventory/`). Cambio de 1 línea. |

### Estimación

- Migración SQL + datos: 45 min
- Backend (ProductController filtro + MangaController facade): 30 min  
- Frontend (ProductsPage hook + MangaEditModal POST a products): 30 min
- Tests + dry-run de migración + deploy: 30 min
- **Total: ~2.25 horas**

### Estado actual

🟡 En progreso — arrancando con la migración SQL.


### Implementación completada

**Backend (compatible al 100%, frontend cero cambios obligatorios):**

| Archivo | Cambio |
|---|---|
| `backend/database/migrations/2026_05_19_000002_unify_mangas_into_products.php` | Schema + data migration. Agrega `product_type` y `product_manga_details`. Migra cada manga → product (resuelve colisiones de SKU prefijando `MANGA-{id}-{code}`). Copia inventarios. Re-mapea `sale_items.manga_id` → `product_id`. Idempotente: si re-corre, skipea las ya migradas. Mantiene `mangas` y `manga_inventory` como backup. |
| `backend/app/Models/Product.php` | Constantes `TYPE_PRODUCT`, `TYPE_MANGA`. `product_type` en fillable + default. Relación `mangaDetails()`. Scope `ofType()`. |
| `backend/app/Models/ProductMangaDetail.php` | **NUEVO** — modelo CTI extensión, PK `product_id`, FK cascade. |
| `backend/app/Http/Controllers/Api/ProductController.php` | `index()` acepta `?type=manga\|product`, eager-loads `mangaDetails` cuando filtra mangas. `store()`/`update()` aceptan `product_type` + sub-objeto `manga_details` (o flat compat). Helper `syncMangaDetails()`. |
| `backend/app/Http/Controllers/Api/MangaController.php` | **Reescrito como facade**: opera sobre Product (type=manga) y ProductMangaDetail. Mantiene la API pública `/mangas` con shape compatible vía `MangaCompatResource`. Detecta intentos de editar productos no-manga y rechaza. Destroy desactiva si tiene ventas. |
| `backend/app/Http/Controllers/Api/MangaInventoryController.php` | **Reescrito como facade**: lee/escribe `inventory` filtrando por `products.product_type='manga'`. Los IDs en la URL ahora son product_id. |
| `backend/app/Http/Resources/MangaCompatResource.php` | **NUEVO** — toma un `Product` y devuelve el shape histórico de `MangaResource`. Deriva `profit_margin_percent` de cost/price cuando se necesita. |
| `backend/app/Http/Resources/ProductResource.php` | Añade `product_type` y `manga_details` (when eager-loaded). |
| `backend/app/Http/Resources/ProductLightResource.php` | Añade `product_type` para que SellPage pueda etiquetar/filtrar si quiere. |
| `backend/app/Http/Resources/MangaInventoryResource.php` | Mapea `product_id` → `manga_id` en el shape de salida para compat con frontend. |
| `backend/app/Http/Requests/StoreProductRequest.php` + `UpdateProductRequest.php` | Reglas para `product_type`, `manga_details.{volume_number,editorial,genre}` (sub-objeto o flat). |

**Frontend:**

| Archivo | Cambio |
|---|---|
| `landing/src/pages/ProductsPage.tsx` | Tras crear/editar/borrar manga, invalida **además** `queryKeys.products.all` para que SellPage vea el manga nuevo en su catálogo/scan/búsqueda. Cero cambios más — `useMangasQuery` sigue funcionando contra el endpoint legacy `/mangas` (que ahora es facade). |

**Lo que se logra:**

- Cajero escanea código de manga → backend busca en `products` por barcode/sku → encuentra y agrega al carrito como producto normal
- Cajero busca por nombre de manga → aparece en resultados de búsqueda igual que producto
- Cajero cobra venta con mangas → `CheckoutService` descuenta `inventory` automáticamente (no necesita branching)
- Devoluciones de mangas → `SalesController::return` restaura `inventory` automáticamente
- Reportes de inventario → unificados en `inventory` table
- Admin crea/edita manga desde tab Tomos → escribe en `products` + `product_manga_details` + `inventory` (manga_inventory legacy queda intacto como backup)

**Cero código nuevo en checkout, returns, inventory_movements, reportes.** La unificación elimina la deuda técnica permanente que el architect identificó como riesgo crítico.


---

## Cierre sesión 2026-05-19

### Deploys del día

| Revisión | Commits incluidos | Contenido |
|---|---|---|
| `tadaima-00039-8fr` | `4f900af` + `e82681e` + `e58e99d` + `73952d8` | Fixes QA Web 4 (terminal/cajero/productos/scanner) + kill cross-caja + admin selector cerrar caja + rename Caja Principal/Venta 2-5 + atajo flotante + auto-refresh React Query + -24% queries checkout |
| `tadaima-00040-jd5` | `1207d9f` | **Unificación mangas → products** (Class Table Inheritance). Migración de schema + datos. MangaController/MangaInventoryController como facade. Frontend cero cambios obligatorios |
| `tadaima-00041-49m` | `df8a220` | Bug A: +/- en catálogo no escalaba anticipo (faltaba sellingCatalogId en la condición de changeQty). Bug B: Caja respeta store_limits por tienda (backend expone reserved_by_store, frontend lo lee en CatalogCard) |

### Estado del sistema en prod (`https://tadaima-987277625193.us-central1.run.app`)

- ✅ Migración `unify_mangas_into_products` aplicada — todos los mangas existentes ahora viven en `products` con `product_type='manga'`. Tablas `mangas` y `manga_inventory` quedan como backup (drop después de 2 semanas)
- ✅ Cajas/ventanas: Caja Principal + Venta 2..5, atajo flotante a otras ventas funcionando
- ✅ Catálogo de Caja (búsqueda/scan) ahora ve productos Y mangas indistintamente
- ✅ Checkout funciona para mangas sin código nuevo (mismo pipeline que productos regulares)
- ✅ +/- en catálogo escala anticipo correctamente
- ✅ store_limits respetados en UI (badge "X disponibles" por tienda) y backend (enforce al cobrar)
- ✅ PHPUnit 27/27 OK

### Lo que sigue (pendiente)

1. **Bugs nuevos de mañana** — Joel los reportará después de testing con Rubén/hermano
2. **Cleanup tablas legacy** — drop `mangas` y `manga_inventory` después de validar 1-2 semanas que la unificación no rompió nada en prod
3. **Caso A de preventas (cargar múltiples folios en misma mesa)** — confirmado por Joel que ya se maneja vía folio con array interno de preventas, no se requiere cambio
4. **Devoluciones de mangas como producto** — verificar que funciona end-to-end en prod (no se hizo migración de tests para esto pero el código ya no branchea)

### Notas operativas

- Deploy script ahora usa `gcloud run deploy --source` (Cloud Build remoto) — ya no se necesita Docker Desktop local
- Frontend cache (React Query + IndexedDB persister) refresca automáticamente al volver a Caja después de mutaciones gracias a `refetchOnMount: true`
- Migraciones corren automáticamente en el entrypoint del contenedor Cloud Run

---

## Sesión 2026-05-20 — QA Web 5 (round 2) + stock por tienda obligatorio

### Bugs QA resueltos en código (pendientes de deploy)

| # | Bug | Causa | Fix |
|---|---|---|---|
| 1 | Caja: botón "Escanear" abre la webcam de la laptop | Botón gatillaba `CameraScannerModal` en desktop donde se usa scanner USB-HID | Botón oculto con `{false &&}` en SellPage. Lector USB HID sigue activo globalmente vía `useBarcodeScanner` |
| 2 | Scanner suma 2 productos por escaneo | Dedup `lastScanRef` a 500ms no cubría rebote del HID; además `addToCart` incrementaba al re-leer | Dedup → 1500ms + scanner NO incrementa si el item ya está en venta (toast: "ya está en la venta · usa + para sumar") |
| 3 | Manga (barcode 820650858406) no se trae al escanear | `ProductLightResource` no exponía `barcode`, el match exacto fallaba | Backend: `ProductLightResource` agrega `barcode`. Frontend: tipo `ProductLight.barcode`, lookup local + match del backend por SKU OR barcode |
| 4 | Catálogo de preventa: botón "Guardar borrador" nunca se pinta de rojo | `(isEdit \|\| publishNow)` excluía el caso "draft listo" | Footer ahora muestra "Falta: …" cuando hay campos pendientes (Nombre, P1, fechas válidas). Botón pinta gradient rojo solo cuando `missingFields.length === 0` |
| 5 | Tarjeta se permite con preventas en el carrito | Sin guard al cambiar `paymentMethod` ni al agregar catálogo / cargar folio | `setPayment("Tarjeta")` bloqueado con toast. `addCatalogToCart` + `togglePreventa` + `loadPreSaleOrderIntoCart` fuerzan a Efectivo + avisan al cajero |
| 6 | Admin: tras cerrar caja, solo se ve Tienda 1 (hard reload arreglaba) | El efecto auto-asignar leía la caché stale de `cashSession` (status='open') después de `setActiveStore(null)`, reasignando la tienda | `handleCloseCash` ahora hace `queryClient.setQueryData(['cash','activeSession'], null)` síncrono antes del `setActiveStore(null)` |

### Cambio de política: store_limits como única fuente de verdad

| Archivo | Cambio |
|---|---|
| `backend/app/Models/PreSaleCatalog.php` (`limitForStore`) | Eliminado el fallback al `preorder_limit` global. Ahora: tienda asignada en `store_limits` → su `limit_qty`; tienda no asignada (o tabla vacía) → 0 (no se vende). Retorna `int`, ya no `?int` |
| `backend/app/Services/PreSaleOrderService.php` (`createOrder`) | Si `limitForStore` retorna 0 → `DomainException` claro: "X no está disponible para venta en esta tienda. Pídele al admin asignar stock en el tab Stock del catálogo." |
| `landing/src/components/presales/NewPreSaleCatalogModal.tsx` | Copy actualizado: "Sin tiendas asignadas → este catálogo no se podrá vender en ninguna tienda". Empty state ahora rojo |
| `landing/src/pages/SellPage.tsx` (`CatalogCard`) | Cálculo de `remaining` simplificado a `storeLimitRow.limit_qty - reserved_by_store[active]`. Sin entrada → `Agotado` automático |
| `backend/tests/Feature/PreSaleOrdersTest.php` | `makePublishedCatalog` ahora crea una entrada `store_limits` (default 99). Test nuevo: `test_catalog_without_store_limits_cannot_be_sold` |

**Razón:** el fallback al `preorder_limit` global convertía cualquier catálogo "sin tiendas configuradas" en "se vende en todas las tiendas con el mismo cap", lo que no es lo que queremos. Joel quiere que el admin diga explícitamente en qué tiendas se vende y cuántas en cada una. Si el admin olvida asignar tiendas, el catálogo no se vende — eso es seguro por defecto.

**Verificación:** PHPUnit 28/28 verde (incluye el test nuevo). `vite build` verde.

### ⏸ PAUSADO — `preorder_limit` como límite por cliente

**Decisión Joel 2026-05-20:** se deja como está. `preorder_limit` sigue funcionando como tope por línea del carrito y no se elimina por ahora. No es prioridad ni se retomará a menos que aparezca un caso real que lo justifique.

**Estado del campo:**
- `PreSaleCatalog.preorder_limit` (int, nullable) — se sigue llenando desde el modal General → "Límite de unidades"
- Ya **no afecta** la disponibilidad por tienda (eso lo controla `store_limits` desde el deploy `tadaima-00042-zcb`)
- En frontend (`addCatalogToCart`) se usa como tope por línea del carrito (`existing.quantity + 1 > catalog.preorder_limit` → bloquea)
- En backend ya no se valida en `createOrder`

**Si se retoma en el futuro:** ver el historial git de este archivo para el plan de 5 pasos que se había documentado y luego se retiró. Riesgo principal: `unitLimit` también se propaga al `CartItem` y al render — limpiar todo el camino UI → CartItem → display.

---

## Sesión 2026-05-20 (round 2) — RBAC gerente + imágenes Historial + UX caja compartida

### Deploy `tadaima-00042-zcb` ya en prod con los 7 fixes anteriores + store_limits whitelist.

### Bugs RBAC gerente — todos resueltos

| # | Bug | Archivo | Cambio |
|---|---|---|---|
| 1 | Gerente veía transferencias de TODAS las tiendas | `backend/app/Http/Controllers/Api/TransferController.php` | `scopeToUserStore()` en `index()`; `show/items/complete/cancel` validan con `canAccessTransfer()`; admin pasa sin scope |
| 2 | Gerente podía crear traslados desde otras tiendas | `TransferController::store` | Valida que `from_warehouse.store_id === user.store_id` para no-admin; devuelve 403 si no |
| 2b | UI permitía origen de otra tienda | `landing/src/pages/TransfersPage.tsx` | `availableOriginWarehouses` filtra `row.warehouse.store_id === user.store_id` para no-admin |
| 3 | Gerente no veía sus folios de preventa | `backend/app/Http/Controllers/Api/PreSaleOrdersController.php` | `index()`: ahora scoping para TODOS los no-admin (antes solo cajero). `show()` también valida acceso por `store_id` |
| 4 | Gerente veía tab Tiendas con todas las sucursales | `landing/src/pages/StoresPage.tsx` | `canSeeAllStores = isAdminUser` (antes incluía gerente) — gerente y cajero ven solo su tienda |
| 5 | Edit Producto mostraba stock de las 4 tiendas al gerente | `landing/src/pages/ProductsPage.tsx` | `locations` filtra warehouses por `store_id` para no-admin |

### Bug imágenes en Historial / Ventas

| Archivo | Cambio |
|---|---|
| `landing/src/pages/SalesPage.tsx` | `productMap[id].imagen` ahora se llena con `p.images[0]?.url` (antes siempre `""` → thumbnails rotos en historial mostrado por ProductThumb) |

### UX "caja ya tiene sesión abierta"

**Problema:** Admin deja sesión abierta → cajero/gerente intenta abrir Caja 1 y recibe error "ya tiene una sesión abierta" sin poder continuar. Tenían que pedirle al admin que cerrara desde otro lado.

**Solución:**

| Archivo | Cambio |
|---|---|
| `backend/app/Services/CashRegisterService.php` | `activeSession(userId)` ahora hace fallback: si el usuario no tiene su propia sesión abierta pero tiene `store_id`, devuelve la sesión abierta de cualquier caja de su tienda. Doc explica que el ownership (`user_id` de la sesión) no cambia — las ventas igual se registran con el `user_id` real del cajero |
| `backend/app/Http/Controllers/Api/CashRegisterController.php` | `close()` y `addMovement()` usan `service->activeSession()` (mismo fallback) — cualquiera del turno puede cerrar o registrar movimientos en la sesión activa de la tienda |

**Workflow ahora:**
- Admin abre Caja 1 en la mañana → sesión queda con `user_id = admin`
- Cajero entra → `getActiveSession` devuelve la sesión del admin (porque cae al fallback por store_id) → UI muestra "Caja abierta" en lugar del modal de abrir
- Cajero cobra ventas → cada venta queda con `user_id = cajero` en la tabla `sales`
- Cajero cierra al final del día → backend cierra la sesión (no importa quién la abrió)

**Audit:** la sesión recuerda quién la abrió. Si quieres saber quién la cerró → habría que agregar `closed_by_user_id` a la tabla en un sprint futuro (P3).

### Verificación
- ✅ `vite build` verde
- ✅ PHPUnit 28/28
- ✅ Sin nuevos errores TS específicos a los archivos tocados

### Estado del deploy

- Deploy `tadaima-00042-zcb` en prod tiene los 7 fixes + store_limits whitelist.
- Esta segunda tanda (RBAC + Historial + UX caja compartida) está commiteada y pusheada; pendiente deploy.

---

## Sesión 2026-05-21 — Avisos de stock RBAC + detalle solo lectura en Productos/Tomos

### Objetivo

Joel pidió que `cajero` no pudiera editar filas en `Productos` ni en `Tomos/Librerías`, pero sí abrir el detalle completo del item y poder mandar un aviso rápido cuando el stock de su tienda se esté agotando. También pidió que el flujo respetara jerarquía por rol:

- `cajero` → gerente de su tienda + admin
- `gerente` → solo admin
- `admin` → master de todas las tiendas

Además, si el mismo item ya fue reportado antes, no debía duplicarse la notificación: solo actualizar el stock restante. Visualmente, después de avisar, el botón debía ponerse verde por ahora.

### Cambios aplicados

| Archivo | Cambio |
|---|---|
| `landing/src/pages/ProductsPage.tsx` | `cajero` ahora abre modal de detalle solo lectura al hacer click en una fila/card de `Productos` o `Tomos`. Se muestran datos útiles según el tipo: producto regular (`nombre`, `foto`, `código`, `categoría`, `proveedor`, `precios`, `métodos de pago`, `pieza única`, `stock de su tienda`) y tomo/librería (`nombre`, `foto`, `código`, `editorial`, `género`, `detalle del tomo/volumen`, `precio`, `stock de su tienda`). |
| `landing/src/pages/ProductsPage.tsx` | Nueva acción rápida `Avisar` en tabla y modales. Tras enviar, el botón cambia a estado visual verde `Avisado` (estado local de sesión). |
| `backend/app/Http/Controllers/Api/NotificationsController.php` | Nuevo endpoint `POST /notifications/stock-alert`. Resuelve destinatarios por rol/tienda y hace `updateOrCreate` por destinatario para evitar duplicados. Si vuelven a avisar el mismo producto/tomo, actualiza mensaje + stock y resetea `read_at` a unread. |
| `backend/routes/api.php` | Ruta protegida `notifications/stock-alert`. |
| `packages/api/src/notifications.ts` + `packages/api/src/types.ts` | Cliente y tipos para `sendStockAlert`. |
| `landing/src/components/notifications/NotificationBadge.tsx` | El badge de Avisos ahora refresca al abrirse y también escucha el evento `tadaima:notifications-changed` para reflejar avisos nuevos sin reload manual. |
| `backend/tests/Feature/NotificationsStockAlertTest.php` | Cobertura para garantizar que `cajero` notifica a gerente+admin sin duplicados y que `gerente` notifica solo a admin. |

### Reglas finales

- `cajero` sigue sin editar productos/tomos existentes.
- `cajero` sí puede ver detalle completo y mandar aviso.
- `gerente` conserva edición y también puede mandar aviso a admin.
- Si ya existía aviso del mismo item para el mismo destinatario y la misma tienda, se actualiza en lugar de crear otro.
- El botón pasa a verde `Avisado` después de enviarlo para feedback inmediato.

### Verificación

- ✅ `php artisan test tests/Feature/NotificationsStockAlertTest.php`
- ⚠️ `npm run type-check --workspace=@tadaima/web` sigue fallando por errores viejos del repo fuera de este cambio; no aparecieron errores nuevos aislados de este flujo en la revisión manual del diff

---

## Sesión 2026-05-21 (extendida) — 50+ commits: QA, UX, perf, cortes de caja

Maratón de mejoras pre-deploy. Acumulado de la sesión 2026-05-20 (no deployado) + correcciones 2026-05-21.

### Bugs críticos resueltos

| # | Bug | Causa | Fix |
|---|---|---|---|
| 1 | Cajero no ve sus ventas hechas hoy en /ventas ni en Caja Historial | Frontend `toISOString` da UTC; backend `whereDate` también UTC. Desde 18:00 MX el filtro 'Hoy' saltaba al día siguiente UTC | Helper `localDateISO()` frontend + `App\Support\DateRange::fromUtc/toUtc` backend (zona `America/Mexico_City`) |
| 2 | Skeleton no aparecía al cambiar filtro de fecha en /ventas | `loading = isPending` solo se activa en primer load; cambios de queryKey con cache previo saltaban directo | `loading = isPending \|\| (isFetching && !hasData)` |
| 3 | 'Selecciona una terminal' sin opción de elegir si Tarjeta venía del localStorage | El botón cambiar-terminal requería `activeTerminal && ...`; sin terminal no aparecía | Botón siempre visible cuando `paymentMethod === 'Tarjeta'`; texto 'Elegir terminal' en ámbar si no hay; useEffect limpia `selectedTerminalId` zombie |
| 4 | Difusión mostraba catálogos `arrived` sin folios (0 clientes a notificar) | No había filtro client-side | Filtrar por `reserved_count > 0`; mensaje informativo sobre los ocultos |

### Features nuevas

| Feature | Detalles |
|---|---|
| **Sistema de avatares** | `users.avatar_url` + endpoints upload/external/delete + `UserAvatar` reusable + `AvatarPicker` modal con Pokémon (24 curados, GitHub raw) + Subir foto. CSP whitelist + backend whitelist. DiceBear removido por seguridad |
| **Presencia / Heartbeat** | `users.last_seen_at` + middleware `TouchLastSeen` dedupe 30s + `/users/online` (last_seen < 2min). Badge azul 'N conectados sin caja' en selector de tiendas + sección 'Conectados sin caja' en Caja cerrada. Layout heartbeat 90s |
| **Sesiones activas por tienda** | `/cash/active-sessions` endpoint + UI bonita: card verde con dot pulsante + UserAvatar de cajeros + 'hace X min'. Selector de tiendas con badges 'N cajas / +N conectados' |
| **Corte de Caja** | Modal post-cierre con resumen completo (efectivo inicial, ventas, entradas/salidas, esperado vs cerrado, diferencia con badge cuadra/falta/sobra) + Imprimir 58mm. Tab 'Cortes' en /reportes (admin/gerente). Botón 'Mis Cortes' en Inicio del cajero |
| **Cajero Preventas** | Nav reemplaza 'Tiendas' por 'Preventas'. Tabs: Disponibles (read-only catálogos con stock por su tienda), Difusión, Vencidos (folios con pickup_deadline pasada) |
| **Cajero Mi Perfil** | Inicio simplificado: avatar editable + nombre/email/tienda read-only. Sin KPIs ni setup. 'Configuración' del user menu oculto para no-admin |
| **Difusión email** | Botón mailto: precarga subject + body. Cero backend |
| **Auto-cierre Venta 2-5** | Al cobrar desde mesa secundaria, se cierra automáticamente tras print flow. Caja Principal nunca se cierra |
| **Sticky headers** | Productos, Tomos, Catálogos Preventa, Folios — header fijo + body scrollable |
| **Scanner-ready inputs** | Productos y Tomos: auto-focus + Enter limpia + match por nombre/SKU/barcode |
| **Notificaciones React Query** | Polling condicional 15s/60s (popup abierto vs cerrado) + invalidate + multi-tab sync vía BroadcastChannel + botón borrar |

### RBAC reforzado

- `TransferController`: scope por tienda en index/show/items/complete/cancel; gerente no crea desde otras tiendas
- `PreSaleOrdersController::index`: gerente scoped a su tienda (antes solo cajero)
- `SalesController::index`: cajero forzado a su user_id + tienda; gerente a su tienda
- `ReportsController::cash`: igual que sales
- `NotificationsController::storeStockAlert` (Codex): cajero → gerente+admin; gerente → admin; dedupe por upsert
- `StoresPage`: gerente y cajero solo ven su tienda
- `ProductsPage`: locations filtradas por user.store_id para no-admin

### Performance / costo

- `useExchangeRateQuery`: staleTime 24h → 5min + refetchOnWindowFocus. Admin cambia TC y cajeros lo ven en ≤5min sin reload
- `usePreSaleOrdersQuery`: refetchInterval 60s (cross-machine)
- `useTransfersQuery`: refetchInterval 60s (cross-machine)
- `useActiveSessionQuery`: refetchInterval 60s
- `useSalesQuery`: staleTime 30s
- `useNotificationsQuery`: 15s con bell abierto, 60s cerrado
- Heartbeat `/auth/me`: 60s → 90s
- Botones 'Actualizar' manuales (Productos/Ventas) ocultos — RQ ya cubre
- **Costo estimado mensual:** $0 (dentro de free tier Cloud Run con 6-15 usuarios)

### UX / UI

- `SalesPage`: filtro de fechas como row prominente arriba de la tabla; chips Hoy/7d/Mes con preset activo resaltado; 2 pills separados Desde/Hasta con `showPicker()` para abrir el calendar nativo en cualquier clic; dropdown 'Métodos' con bg sólido + z-index 60
- `Modal Abrir Caja`: caja registradora como texto (no dropdown — ya se eligió tienda)
- Pantalla 'Caja cerrada': botón 'Cambiar tienda' al lado del CTA Abrir Caja (solo admin >1 tienda)
- Modal 'Nuevo Usuario': eye toggle + generador password (`Palabra4827!`) + 'Nombre completo'
- Tras crear usuario nuevo: auto-abre AvatarPicker
- Auto-cierra mesas secundarias post-cobro tras print flow

### Decisión de arquitectura: NO Pusher/SSE

Joel preguntó por real-time. Análisis: 2-4 tiendas, 6-15 usuarios activos, polling 60s+ es suficiente. SSE costaría ~$30-50/mes (Cloud Run con CPU activo 24/7). Pusher Cloud free tier serviría pero añade SaaS externo. Veredicto: polling React Query optimizado, $0/mes. Re-evaluar si Tadaima crece a 50+ tiendas.

### Estado del deploy

- Acumulado pre-deploy: **54 commits** desde `tadaima-00043-7zr`
- Migraciones nuevas (corren en container startup):
  - `2026_05_21_000001_add_avatar_url_to_users`
  - `2026_05_21_000002_add_last_seen_at_to_users`
- Backend tests: 30/30 ✓
- Vite build: ✓
- Deploy pendiente al cierre de esta entrada

---

## Sesión 2026-05-21 (cierre) — Perf de "Abrir Caja" en prod

### Síntoma reportado
Admin tarda mucho al abrir caja en `tadaima.poslite.com.mx`: primero pensaba al click "Abrir Caja", luego se quedaba congelado en el spinner "Verificando sesión de caja" hasta 3 segundos.

### Diagnóstico (de logs Cloud Run)
- `POST /cash/open` ~1.1s + `GET /cash/session` ~1.0s en refetch = ~2.2s perceived al abrir caja (innecesario, el POST ya devolvía la sesión)
- Gate "Verificando sesión de caja" esperaba 3 queries para admin: `activeSession` + `activeSessions` + `onlineUsers`. Las dos últimas tardaban hasta 3.26s en prod
- N+1 en `/users/online`: el endpoint cargaba `store` eager pero no `roles`. Cada user serializado disparaba SELECT extra a `model_has_roles` cross-region (~30ms × N usuarios)
- Cold starts de 5-37s con `min-instances=0` (502s visibles en logs)

### Cambios aplicados

| Commit | Archivo | Cambio |
|---|---|---|
| `9983fd4` | `landing/src/pages/SellPage.tsx` (handleOpenCash) | `queryClient.setQueryData(['cash','activeSession'], session)` con response del POST en vez de `invalidateQueries(['cash'])` — evita el GET extra. Invalidaciones pesadas (TC + products + preventas) diferidas a `requestIdleCallback` |
| `3471137` | `landing/src/pages/SellPage.tsx` (gate verifyingSession) | Gate solo bloquea con `activeSessionQuery.isPending`. Las queries decorativas (`activeSessions`, `onlineUsersInStore`) cargan en background; el card "Cajeros activos" tiene su propio loading inline |
| `edec171` | `backend/app/Http/Controllers/Api/UserController.php` | Fix N+1: `->with(['store:id,name', 'roles:id,name'])` en `/users/online` |
| (infra) | Cloud Run config | `min-instances=1`, `max-instances=100`. Costo ~$8-10/mes pero elimina cold starts |

### Verificación
- Backend tests: 30/30 ✓
- Vite build: ✓
- Deploys: `tadaima-00046-8pt` → `00047-4z9` → `00048-h6j` (todos verdes, 100% tráfico)

### Pending para próximas sesiones
- Mover Cloud Run a `us-west1` (misma región que MySQL `pos-lite-db`) cuando Joel migre a la cuenta nueva de GCP. Cada query interna pasaría de ~30ms RTT a ~1ms — bajaría el piso de `/cash/session` de ~500ms a ~150ms
- Revisar si `TouchLastSeen` middleware podría usar `Cache::remember` en vez de read+write a `users` cada 30s (ahora suma ~30ms cross-region a toda ruta autenticada)
