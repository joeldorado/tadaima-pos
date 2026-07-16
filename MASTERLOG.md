# MASTERLOG — Tadaima POS

> Registro maestro del proyecto: arquitectura, evolución, decisiones clave y estado actual.
> Actualizado: 2026-06-30 (**DEPLOY rev `tadaima-00110-9lg` — Caja: FIX descuento que NO se restaba del total (cobraba de más) + promo con % en ticket/historial + ticket legible en térmica + cierre de caja visible + etiquetas MXN.**) Bloque de la sesión (revs 00107→00110, deploys iterativos; commit `92bad87` en `main` consolida el código). Deploy `gcloud run deploy tadaima --source . --region us-central1` (Cloud Build, SIN flags de env, **desde la raíz**). rev 100%, bundle nuevo `index-Cs9YCb2H.js` vivo (verificado: "Promo ("×2, "Descuento (", "Cerrar caja ahora", " MXN"×5); `vitest` promo **13/13**, `vite build` OK, 0 errores tsc nuevos. **(1) FIX descuento (foto 4r.png):** el panel de cobro mostraba "TOTAL A PAGAR/COBRAR" SIN restar la promo (subtotal $360 con promo −$60 cobraba $360) → el cajero pedía de más al cliente, aunque el backend SÍ cobraba bien ($300 vía `total`/`totalBeforeComm`). Causa: `currentPayAmount` (alimenta el total grande + FALTA/CAMBIO) en la rama de venta regular/mixta sumaba `regularSubtotal + catalogDeposit` y **NO restaba `discountAmt`**. Fix: helper puro `computeRegularChargeAmount` en `landing/src/lib/promo.ts` (resta + clamp ≥0) consumido por `currentPayAmount`; tests en `promo.test.ts`. Solo display, backend intacto. **(2) Promo con % (pedido Joel):** el descuento se guarda como MONTO absoluto (`activeMesa.discount`/`sales.discount`); el % se DERIVA (`discountPct(discount, subtotal)`, redondeado) y se muestra en: ticket de venta ("Promo (17%) −$60"), reimpresión desde Historial (antes ni mostraba el descuento), fila del Historial (chip ámbar "−17%") y detalle expandido ("Descuento (17%)"). Si la promo fue por precio final, el % puede salir redondeado (16.7→17). **(3) Ticket legible en térmica (00107-00108):** los grises `#555/#888` salían lavados en la Xprinter → todos a NEGRO + jerarquía (nombre 11px bold) en los **3** puntos de impresión (`doPrintTicket`, `SalesPage::printTicket`, `CashCloseSummaryModal`). **(4) Cierre de caja visible (00108):** botón "Cerrar Caja" prominente (ámbar sólido + ícono Scissors, separado de "Cortes" que es solo historial) + **banner** cuando la caja quedó abierta de días anteriores (`isStaleSession` vía `toLocalYmd`/`getTodayLocal`, zona Tijuana) + indicador "Abierta {hora}". Contexto: la tienda dejó la caja abierta 4 días sin cortar y no hallaba cómo cerrarla; el botón existía pero se confundía con "Cortes". **(5) Panel USD/MXN (00109):** se quitó el "Total a cobrar" repetido de la caja verde y se etiquetaron los pesos con "MXN" (`fmtMXN`) para distinguir de US$. **Incluye** el módulo promo/descuento backend (discount en checkout, `SaleDiscountTest` 4 tests) + ajustes de reportes. **OJO deploy:** correr SIEMPRE desde la raíz del repo (usa Dockerfile); desde `landing/` cae a Buildpacks y FALLA. **CACHÉ PWA:** probar en incógnito/hard refresh. Ver [[project_promo_descuento]], [[project_ticket_print]], [[project_corte_caja_ux]].
> Actualizado: 2026-06-29 (**DEPLOY rev `tadaima-00106-rgp` — Ticket: LOGO de Tadaima + ajuste 58 mm CSP-safe.**) Deploy `gcloud run deploy tadaima --source . --region us-central1` (Cloud Build, SIN flags de env). Commit `e859d69` en `main` (solo `landing/src/pages/SellPage.tsx`); **NO se tocó `dev/qa-handoff`**. rev sirviendo 100%, Home=200, bundle nuevo `index-DQEhjXK3.js` (con `img.logo`+`tadaima-logo.jpeg`) vivo; `vite build` OK, 0 errores tsc nuevos. **Contexto:** Joel mandó foto del ticket impreso con texto **cortado a la derecha**; resultó ser un **bundle VIEJO servido por el caché del PWA** (layout columnar "Artículo/Cant Total", título "Ticket #18"), NO el 00105 — verificado: el bundle vivo tenía `tadaima_ticket` y NO `Cant Total`, y el 00105 ya envolvía el nombre y cabía en 58 mm. **(1) Logo en el ticket:** se agregó `landing/public/tadaima-logo.jpeg` como **data URI** (patrón `fetch→blob→readAsDataURL` de `ReportsPage:1413`, cacheado a nivel módulo + `useEffect` al montar) en el encabezado de `doPrintTicket`, con `filter:grayscale(1) contrast(1.18)` → sale oscuro/nítido en térmica (no rojo desvaído). Fallback al `<h2>TADAIMA</h2>` de texto si el data URI no está listo. Se borró el placeholder muerto `const tadaimaLogo = null`. **(2) Impresión CSP-safe:** el CSP (`script-src 'self'`, sin unsafe-inline) bloquea scripts/`onclick` inline en la ventana `about:blank` (hereda el CSP del opener), así que `window.print()` y los botones Imprimir/Cerrar se disparan/cablean desde el PADRE con `addEventListener` (los `onclick` inline del 00105 estaban muertos por CSP; el data URI sí pasa por `img-src ... data:`). El print espera a que el logo pinte (`img.onload` + fallback 1200 ms). **Verificado** con `chrome --headless --print-to-pdf` a 58 mm: logo arriba, nombre largo envuelve a 2 líneas, importes alineados, "Efectivo"/"$180.00" completos (nada cortado). **CLAVE caché PWA:** Joel debe probar en **incógnito**/hard refresh (el SW sirve el bundle viejo); auto-update del PWA queda pendiente aparte. Ver [[project_ticket_print]].
> Actualizado: 2026-06-29 (**DEPLOY rev `tadaima-00105-pkj` — Caja: Cambio/Falta en la MONEDA ACTIVA (USD/MXN) + Ticket imprime VERTICAL.**) Deploy `gcloud run deploy tadaima --source . --region us-central1` (Cloud Build, SIN flags de env). Commit `81b344b` en `main` (solo `landing/src/pages/SellPage.tsx`; backend sin cambios); **NO se tocó `dev/qa-handoff`** (pedido de Joel). rev sirviendo 100%, Home=200, bundle nuevo `index-B-AMFts6.js` vivo; `vite build` OK, 0 errores tsc nuevos (baseline ~447 pre-existentes). **(1) Caja — Cambio/Falta sigue el toggle de moneda:** el cálculo ya existía (`cambio`/`faltaCubrir`); ahora el número grande del resumen de cobro usa la moneda activa (`usdPrimary = showUsdInput`): en modo dólares sale en **US$** (con `≈ $MXN` chiquito), en pesos en **MXN** (con `≈ US$` chiquito). Se agregó `faltaUsd` y se quitó la condición `receivedUsd>0` de `cambioUsd` para que el USD aplique aunque aún no teclee. No cambia el cobro guardado (sigue en MXN: `cash_received`/`change_amount`). Pedido de Joel: que el cajero vea cuánto falta/sobra en la moneda que está usando (zona Tijuana, USD común). **(2) Ticket — impresión vertical:** el ticket de venta (`doPrintTicket` en `SellPage.tsx`) salía GIRADO 90° en la Xprinter porque imprimía con un **iframe oculto 0×0** → Chrome ignoraba el `@page 58mm` y rotaba. Se reemplazó por una **ventana real** `window.open("","tadaima_ticket")` (mismo método que el corte de caja `printCashCut`, que ya imprimía bien) con barra **Imprimir/Cerrar** (clase `.no-print`) para ver el detalle o reimprimir, y CSS 58 mm anclado en `@media print`. Nombre de ventana fijo → no se acumulan. Fallback al iframe anterior solo si el popup está bloqueado (para no perder el auto-print bajo `--kiosk-printing`). QZ Tray (RAW ESC/POS sin Chrome) queda como escalación futura si alguna caja siguiera girando. El sistema viejo imprimía bien porque no usaba Chrome.
> Actualizado: 2026-06-27 (**DEPLOY rev `tadaima-00104-wlb` — Catálogo Online v1→v3 + cambio de Ruben "gerentes gestionan usuarios de su tienda" + cierre de FUGA de escalada de privilegios.**) Deploy `gcloud run deploy tadaima --source . --region us-central1` (Cloud Build, SIN flags de env → env/secrets intactos); rev sirviendo 100%, `/catalogo`=200, API viva. **(1) Catálogo Online (commit `29f70b9`):** catálogo de cadena público en `/catalogo` por inventario — endpoint global `GET /api/v1/public/catalog` (productos activos con stock vendible/exhibición en alguna sucursal + desglose `stores[{store_id,qty,whatsapp}]` por tienda + total); carrito client-side → checkout WhatsApp **POR TIENDA** (un mensaje a cada sucursal; número `catalog_settings.whatsapp_number ?? stores.phone`); flags de visibilidad GLOBALES en `system_settings` (`catalog_*`); permiso `can_edit_catalog` (flag-based, espejo de `can_view_cost`); rediseño glass premium (skills ui-ux-pro-max "Liquid Glass" + premium-library): filas por categoría tipo Netflix + tabs Mangas/Productos, tipografía Space Grotesk+Inter, `HoverCard` spotlight, `ImageWithFallback` (placeholder de marca para productos sin foto). Cerró fuga de seguridad del `CatalogController` (6 rutas admin sin gate → `catalogEditError`+`storeScopeError`) + hardening `UpdateCatalogSettingsRequest` (whatsapp/slug vacío→null, unique slug `ignore` propio). **(2) Cambio de Ruben (cherry-pick `98d5002` "Gerentes pueden crear usuarios-gerentes y cajeros" — traído SOLO ese commit de `origin/develop`, NO los 2 de reportes `80b19bf`/`8a8b95f` que revertirían el fix `a7b2dae` de Utilidad Neta):** gerente gestiona usuarios de SU tienda; frontend (`AdminPage`/`DashboardPage`) limita (no ofrece rol admin ni otra tienda). **(3) FUGA de escalada cerrada (commit `10c05cd`):** `UserController::store()` y `assignRole()` NO tenían gate → cualquier token (cajero/gerente) podía crear o promover a ADMIN por API directa. Ahora: solo admin libre; gerente (rol real, NO el proxy `can_view_cost`) crea/cambia usuarios SOLO de su tienda y NUNCA rol admin (helper `roleIsAdmin`); proxy 'manager' endurecido a `hasRole(gerente/manager)` en update/destroy/avatars. Tests: **210 backend** (CatalogOnlineTest 18, UserManagementEscalationTest 8) + **35 vitest**, vite build OK.)
> Actualizado: 2026-06-25 (**DEPLOY rev `tadaima-00100-5sf` — MÓDULO DE REPORTES (utilidad/costo para gerentes) de Ruben bajado a `main` + cierre de FUGA de "Utilidad Neta" a usuarios SIN permiso.** Cherry-pick `3eef6b4` (commit de Ruben "Reportes utilidad validacion gerentes", traído desde `origin/develop` —NO desde QA `dev/qa-handoff`— donde Ruben lo pusheó; `develop` = `main` de hoy **+ ese 1 commit** → entró por ENCIMA de 00098/00099, **0 conflictos, nada perdido**) + fix `a7b2dae`; ambos en `main`. Deploy `gcloud run deploy tadaima --source . --region us-central1` (Cloud Build, sin Docker local, **SIN flags de env** → env/secrets intactos); revisión sirviendo 100%, ambas URLs=200, SPA `/`=200. Solo frontend (`landing/src/pages/ReportsPage.tsx`). **(1) Lo que trajo el commit de Ruben:** en Reportes→tab Ventas, costo+utilidad por producto (`total_cost`/`total_profit` en `GroupedProduct`, `unitCost = item.cost ?? item.product?.cost`), columna/tarjeta **"Utilidad Neta"** (= utilidad − comisión − IVA) en tabla, PDF y Excel **gateadas por `canViewCost = isAdmin || user.can_view_cost`**, costo de preventa (Opción B: solo descuenta costo el día de entrega/liquidación) y selector de usuario en encabezados PDF/Excel. **(2) FUGA cerrada (fix `a7b2dae`):** en la **tabla principal** (no la del modal) el **TOTAL de "Utilidad Neta"** y la **tarjeta resumen** se pintaban SIN `canViewCost &&` → un **gerente sin permiso veía la ganancia total** aunque las columnas por-fila sí estaban ocultas. Gateados ambos (espejo de la tabla del modal, que ya estaba bien); grid de tarjetas **6→5 columnas** sin permiso (sin hueco). Regla final: **con permiso "ver costos" → costo+utilidad; sin permiso → NADA (ni costo, ni utilidad por fila, ni total, ni tarjeta).** El Corte del Día (`SalesPage`, prop `isAdmin` que en realidad recibe `canViewCost`) YA estaba bien, no se tocó. **(3) Limpieza de tipos:** se corrigieron los 2 errores `tsc` que traía el commit (`sale.cancelled_items` posible undefined → `(… ?? [])`; `item.catalog?.cost` **inexistente** → la preventa usa `item.cost`, el fallback al catálogo nunca existió) → `ReportsPage.tsx` **0 errores** (724→722, baseline pre-existente sin tocar). **⚠️ OJO Ruben (preventa):** como `item.catalog.cost` no existe, **si el backend NO manda `cost` en items de preventa entregados, la utilidad de preventa sale inflada (costo 0)** — falta confirmar que llegue `cost`. **Pendiente:** los commits de código ya están en `main` y DEPLOYADOS; el **push de este masterlog** (y la sync opcional de `dev/qa-handoff` por ff) queda en pausa hasta el QA de Joel (decisión: no propagar por si truena algo). **NOTA caché PWA:** QA por rol en incógnito NUEVO o hard refresh.)
> Actualizado: 2026-06-25 (**DEEP CHECK + DEPLOY rev `tadaima-00099-xjs` — cierre de CRUCE DE DATOS ENTRE TIENDAS (11 endpoints) + endurecimiento de ESCALA + resiliencia Supabase.** Commit `0ba6992` en `main` (+ `dev/qa-handoff` ff). Backend **184 tests / 622 assertions verdes** (`StoreScopeEnforcementTest` 12→17). Deploy `gcloud run deploy --source .` con flags de escala (SIN flags de env → **22 env/secrets intactos**, 3 secretRef verificados). Reporte completo: `docs/DEEP_CHECK_2026-06-25.md`. Contexto: **una empresa (Tadaima), varias tiendas** → el riesgo es cruce entre TIENDAS. **(A) CRUCE DE DATOS ENTRE TIENDAS (lo que más preocupaba):** ~10 endpoints confiaban en `store_id`/`warehouse_id`/`session_id` del request sin validar → un gerente/cajero de la tienda A podía VER/EDITAR datos de la B (inventario+costo, apartados, movimientos de caja+montos, precios por tienda, usuarios/PII, config de tienda/bodega/terminal). Cerrado reusando `storeScopeError`/`canActOnStore` + nuevo `adminOnlyError`: **Inventory** index/movements (filtra por bodegas de su tienda), **Layaway** (index/byProduct/store/show/update/status/addPayment/payments), **CashRegister** movements (valida tienda **Y** dueño de la sesión; cajero solo la suya) + open, **User** index (PII por tienda), **Product** updateStorePrices/removeStorePrices (admin/gerente + scope), **SalesDraft** store/show/cancel; **Store/Warehouse/Terminal** config → **admin-only**; **Category/Supplier** editar/borrar → admin/gerente (**crear queda abierto** para NO romper el alta de producto del cajero). `Sales`/`Reports`/`Transfers`/`PreSaleOrders` YA estaban bien. **Falsos positivos descartados:** métodos de `SalesDraft` addItem/updateItem/removeItem/extend/reserved-stock están comentados (ADR-014). Tests nuevos (gerente/cajero de A → **403** en inventario/apartados/caja/config de B; admin OK) + fix de 2 tests que usaban un "admin" SIN rol y un cajero abriendo caja en otra tienda (revelado por el guard). **(B) ESCALA (techo ~20 → ~200 concurrentes):** Cloud Run `cpu` 1→2, `memory` 512Mi→1Gi, `max-instances` 2→10 (`deploy.sh` + flags del deploy); PHP-FPM `pm.max_children` 10→20 (`Dockerfile`); **rate limit** `throttle:120,1` por usuario en el grupo `auth:sanctum` (`routes/api.php`). **(C) RESILIENCIA SUPABASE (CRÍTICO):** las llamadas síncronas sin timeout colgaban el worker 30s (cascada a 503) y, si faltaba la config, servían **socios FALSOS `@stub.local` en silencio** (incidente jun-15). Ahora `TadaimaMemberService`: `timeout(4)` + `retry(0)` + **cache** (lookup 60s / search 30s) + `safeGet` (no truena en timeout) + **GUARD DE PRODUCCIÓN** (si falta `TADAIMA_SUPABASE_URL/KEY` en prod → log + vacío, NUNCA stubs falsos). **(D) Persistencia:** auditada, limpia (proveedor/categoría ya estaba resuelto). **(E) Código muerto:** mínimo (`components/ui/sonner.tsx` sin uso). **Pendientes (siguiente nivel, requieren infra):** Redis para session/cache/queue + Supabase a job async; quitar/implementar `POST /external/customer` (hoy stub, el front no lo usa). Verificado prod: `cpu=2`/`memory=1Gi`/`maxScale=10`, 22 env (3 secretRef) intactos, SPA `/`=200, login=422. **NOTA caché PWA:** QA por rol en incógnito NUEVO.)
> Actualizado: 2026-06-25 (**DEPLOY rev `tadaima-00098-92v` — Caja: bloqueo de precio socio para socio INACTIVO + Tipo de Cambio visible en el cobro.** Commit `c033dde` en `main` (+ `dev/qa-handoff` sincronizada por ff). `vite build` OK; `tsc` 453=baseline. Solo frontend (`SellPage.tsx`), sin backend. **(1) Socio inactivo no vende a precio socio (QA Joel, captura w2):** un socio **inactivo** ya mostraba el badge "SOCIO INACTIVO · PRECIO NORMAL" y `setCustomer` forzaba los ítems a Normal, PERO el dropdown de nivel del ítem seguía ofreciendo "Socio" y `changeLevel` no validaba → el cajero podía re-elegir "Socio" a mano y cobrar el descuento. Ahora la opción **"Socio" (b)** del `<select>` queda **deshabilitada** (sufijo "· inactivo") cuando `customerIsSocio && !customerSocioEligible`, con **guard de respaldo en `changeLevel`** (toast "Socio inactivo — no aplica precio socio"). Cliente normal (override manual) y socio activo sin cambios. **(2) Tipo de Cambio visible:** el `tc` (de `system_settings` vía `useExchangeRateQuery`) solo se veía en modo dólares; en modo **PESOS recibidos** vivía en un `title`/tooltip oculto. Nuevo chip **"TC $X.XX"** (emerald) junto al toggle ⇄, visible en **ambos** modos (pesos y dólares). Display-only (editar el TC sigue en el engranaje/popover existente). **OJO QA:** el socio **inactivo** solo se prueba **en prod** (Supabase real); el stub local solo da socios activos. **NOTA caché PWA:** incógnito NUEVO o hard refresh.)
> Actualizado: 2026-06-25 (**DEPLOY rev `tadaima-00097-9xb` — SOCIOS TADAIMA (estatus+precio socio), TICKET 58mm VERTICAL, TOASTS CRISTAL.** Commit `435ebf7` en `main`. Backend **179 tests / 602 assertions verdes** (incl. 2 suites de socio); `vite build` OK; `tsc` **453 = baseline, 0 nuevos**. Deploy `gcloud run deploy tadaima --source . --region us-central1` SIN flags de env (preserva las 22 env/secrets). 1 migración **ADITIVA** (columnas nullable `member_*` en `customers`) corre sola. **Verificado SIN impresora** con render headless (Playwright/Chrome): ticket a 219px(=58mm)×314px → VERTICAL, con fila "Cambio". **(1) SOCIOS — fix 422 "Los datos enviados no son válidos" al agregar socio:** el nivel de membresía de Supabase (`nivel_membresia`="b") se mandaba como `loyalty_tier` (enum Bronce/Plata/Oro/Leyenda) → 422 en los 4 puntos de alta (Caja×3 `addExternalToDb`/`confirmAssignCustomer`/`handleAddExtCust` + ClientsPage); ahora va a **`member_level`** (campo nuevo, separado del tier de gamificación). **(2) SOCIOS — snapshot local del estatus:** migración `2026_06_25_000001` agrega `customers.member_status`(ACTIVO/INACTIVO)/`member_level`/`member_expires_at`/`member_debt`(reservado, sin uso)/`member_synced_at`; antes se perdía el estatus de Supabase al importar. Modelo `$fillable`/`$casts`, Store/UpdateCustomerRequest (reglas), CustomerController (`only()`+`member_synced_at=now()` en alta), CustomerResource (expone `member_*`) y tipos `packages/api` cableados. **(3) SOCIOS — refresh contra Supabase (SOLO LECTURA):** `App\Services\TadaimaMemberService` (extraído de `ExternalCardController`, DRY: `lookup`/`search`/`mapSocio`/stubs) + endpoint **`POST /customers/{id}/refresh-member`** que actualiza solo `member_*`+`synced_at` (no pisa name/phone/email locales; 404 de Supabase NO borra el snapshot, queda "stale"). `refreshMember()` en `packages/api`. Frontend refresca al **abrir** la ficha (ClientsPage, effect por `selectedId`) y al **asignar** un socio en Caja (await en local con spinner; externo ya viene fresco; nunca bloquea si Supabase falla). **(4) SOCIOS — precio socio solo si ACTIVO (decisión Joel):** se separó **etiqueta** (`Mesa.customerIsSocio`) de **precio** (`Mesa.customerSocioEligible` = socio && `isSocioEligible`); el reprice a nivel `b` (en `setCustomer`/`addToCart`/`setPayment`) solo aplica si `member_status==='ACTIVO'`; socio inactivo cobra normal + toast "se cobra precio normal". Helper `SOCIO_ELIGIBILITY{checkExpiry:false,checkDebt:false}` listo para sumar vigencia/adeudo a futuro (un punto). Gating client-side/advisory (ADR-014, carrito client-authoritative). Socios importados antes de esto tienen estatus NULL → se auto-curan al 1er refresh. **(5) SOCIOS — separación en Clientes:** filtro **Todos/Socios/Normales** + badge de estatus (verde activo/rojo inactivo) por fila + bloque de socio en la ficha (estatus/nivel/vigencia/última sync + botón "Actualizar estatus") + stat "Socios". Badges de estatus también en las filas del modal "Asignar cliente" de Caja. Tests: `CustomerSocioUpsertTest` (+2: snapshot persiste con `member_synced_at`, `loyalty_tier:'b'`→422 vs `member_level:'b'`→201) y nuevo `CustomerRefreshMemberTest` (4, con `Http::fake`: refresh actualiza, no-socio→422, Supabase vacío→404 sin borrar snapshot). **(6) TICKET 58mm — sale VERTICAL (no horizontal):** `doPrintTicket` (`SellPage`) tenía `@page{...orientation:portrait}` (declaración INVÁLIDA en `@page` — la orientación va dentro de `size`) → caía al papel por defecto de la impresora y salía de lado; ahora `@page{size:58mm auto;margin:0}` limpio, anchos en `mm` (no px), `table-layout:fixed`+`word-break:break-word` (correo/USD se PARTEN, no se cortan ni fuerzan landscape). **Impresión por IFRAME OCULTO** en vez de popup `window.open` → sin ventana emergente (no la bloquea el navegador, no deja preview-popup), y apto para impresión **silenciosa/automática** (Chrome `--kiosk-printing` + impresora por defecto + pref "auto"). Impresora **JP-58H aún no en mano** — se entregó verificado a PDF/PNG. **(7) TOASTS — cristal on-brand:** el `<Toaster>` (sonner) en `App.tsx` no seguía el tema (fondo hardcodeado `#1e293b`) ni tenía botón cerrar y "se perdía a la derecha"; nuevo componente **`AppToaster`** con `theme` del `ThemeContext` (dark/light reales), **`closeButton`** ✕, estilo cristal con tokens `--td-popup-bg/--td-text-hi/...`, sombra fuerte y, en `styles/toast.css`, **acento de color por tipo** (verde éxito/rojo error/ámbar aviso/azul info) + ✕ arriba-derecha + margen seguro responsive. Arregla ~298 toasts (de 307) desde un solo lugar; las ~9 con estilo inline propio conservan su look y ganan el ✕. **NOTA caché PWA:** QA en incógnito NUEVO o hard refresh.)
> Actualizado: 2026-06-24 (**DEPLOY rev `tadaima-00096-ldt` — LOTE DE 6 FIXES/FEATURES POS (productos, caja, clientes, recibo, bodega).** Commit `ceef7bf` en `main` (rama de prod). Backend **174 tests / 588 assertions verdes** (incl. 2 suites nuevas); `vite build` OK (el Dockerfile usa `npx vite build`, salta tsc → los ~453 errores `exactOptionalPropertyTypes` PRE-EXISTENTES no bloquean; verificado **0 nuevos** por diff contra baseline). Deploy `gcloud run deploy tadaima --source . --region us-central1` (Cloud Build, sin Docker local, SIN flags de env → preserva las 22 env/secrets). 1 migración **ADITIVA** corre sola (`add_supplier_id_to_products`, columna nullable + FK). Verificado prod: SPA `/`=200, `POST /auth/login` (body vacío)=422 (backend vivo + BD sana tras `migrate --force`). **(1) PRODUCTOS — proveedor + categoría persisten:** el proveedor NUNCA se guardaba (no existía la relación) → nueva columna `products.supplier_id` (nullable FK a `suppliers`, que ya existía para preventas), `Product::supplier()`, `StoreProductRequest`/`UpdateProductRequest` (`exists:suppliers,id`), `ProductResource` expone `supplier {id,name}`+`supplier_id`, `ProductController` lo persiste y eager-loadea. Frontend `ProductsPage`: mapa `proveedorIdByName`, mapeo de vuelta `proveedor: p.supplier?.name`, y **`handleSaveProduct` ahora resuelve/crea el id de categoría Y proveedor de forma síncrona ANTES de enviar** (`resolveCategoryId`/`resolveSupplierId`: si el nombre recién tecleado con "+" aún no está en el cache, lo crea on-the-fly) → arregla el bug de timing por el que la **categoría se perdía** (`onAddCategoria` era fire-and-forget; `categoriaIdByName.get()` daba null al guardar rápido). **(2) PRODUCTOS — drag & drop de imagen** en el modal (HTML5 nativo, sin librería; estado `isDragging` + `applyImageFile` compartido con el `<input file>`). **(3) CAJA — PRECIO SOCIO automático (decisión Joel):** al asignar un socio Tadaima (cliente con `external_member_id`, = los que viven en Supabase) los items pasan a **precio socio (nivel `b`)**; si se paga con **Tarjeta** bancaria revierten a normal (`a`) — la tienda absorbe la comisión, sin descuento; **preventa excluida** (usa anticipo, no priceLevel). `Mesa.customerIsSocio`; helper `repriceForSocio` (togglea a↔b, respeta overrides mayoristas c/d/e, deja en `a` si no hay `price_b`); enganchado en `setCustomer`/`clearCustomer`/`setPayment`/`selectTerminal`/`addToCart`/`addScanToCart` + reset en `clearCart` y los "cliente nuevo manual"; badge "Precio socio aplicado / Precio normal · tarjeta" en el panel de cobro. **(4) CLIENTES — fix "no se puede agregar socio":** al elegir un socio de Supabase, `createCustomer` reventaba contra el `unique` de `external_member_id` (si ya se había importado antes) o de `phone` nulo → toast "No se pudo asignar". `CustomerController::store` ahora hace **`updateOrCreate` por `external_member_id`** (idempotente); `StoreCustomerRequest`: phone `unique` con `whereNotNull` (varios nulos OK) y sin `unique` en `external_member_id`. `CustomerSocioUpsertTest` (3). **(5) RECIBO/CORTE — sale vertical:** los 3 puntos de impresión (`SellPage::doPrintTicket`, `SalesPage::printTicket`, `CashCloseSummaryModal::printCashCut`) ahora `@page{size:58mm auto;orientation:portrait}` (faltaba `orientation`). **(6) BODEGAS — fix rename no persistía (efecto colateral del rev `00089`):** `WarehouseResource` devolvía `name = store->name` cuando la bodega tenía tienda (cambio para selectores de Traslados) → renombrar una bodega "se guardaba" (toast OK) pero la UI mostraba SIEMPRE el nombre de la TIENDA. Ahora `name = $this->name` (real); `TransfersPage` (resúmenes origen/destino + proyección post-traslado) y el selector de `AdminPage` usan `store?.name ?? name` / `warehouseTypeLabel(type)` para seguir mostrando la tienda igual que antes; `ReportsPage` NO se tocó (usa su propio query con `warehouses.name`/`stores.name` separados). `WarehouseRenameTest` (2). **NOTA caché PWA:** QA en incógnito NUEVO o Cmd+Shift+R.)
> Actualizado: 2026-06-24 (**LIMPIEZA DE BD PARA HANDOFF AL CLIENTE + QA PREVIA.** Joel pidió dejar prod listo para que el cliente arranque de cero con un admin. **(0) QA previa (sin tocar datos):** suite backend completa **158 tests / 530 assertions verdes**; verificado por código + datos que el flujo "admin crea tienda/terminal/usuarios desde cero" NO truena: `StoreController::store` auto-crea las 2 bodegas (Exhibición `store` + Bodega `bodega`); el checkout valida métodos de pago contra el catálogo **GLOBAL** (`PaymentMethod::whereIn`), no `store_payment_methods` (probado: prod tenía 0 store_payment_methods + 99 ventas OK); el front carga métodos vía `GET /payment-methods` global; `CashRegisterService::open` **auto-crea la caja por usuario** (`firstOrCreate store_id+owner_user_id`, ADR-017) → no requiere caja pre-sembrada. **(1) Backup full** de prod vía `mysqldump --single-transaction` → `backups/tadaima_prod_PRE-CLEAN_2026-06-24_104056.sql` (220K, 60 tablas + datos, marcador de cierre OK). **(2) Limpieza:** `TRUNCATE` de las 60 tablas excepto `migrations` (`SET FOREIGN_KEY_CHECKS=0`), preservando el esquema deployado (NO `migrate:fresh`, cero riesgo de drift). **(3) Reseed** con `PierFreshSeeder`: 1 empresa (Tadaima), 3 roles (admin/gerente/cajero, guard `api`), 4 métodos de pago, **1 admin `Pier` <pier@tadaima.mx / Tadaima2026>** (store_id null, can_view_cost true) — SIN tiendas/terminales/productos/ventas. **(4) Verificación:** estado prístino confirmado (companies=1, roles=3, payment_methods=4, users=1, model_has_roles=1, migrations=98; todo lo transaccional=0); **login real contra prod** `POST tadaima.poslite.com.mx/api/v1/auth/login` → **HTTP 200, success:true, roles:['admin'], token emitido** (502 inicial = cold start de Cloud Run). Tokens/sesiones de prueba limpiados → 0. **Sin cambios de código, sin deploy** (solo data en prod). El cliente entra como Pier y crea tienda → terminales → usuarios desde la UI.)
> Actualizado: 2026-06-22 (**SESIÓN GIT/MERGE + DEPLOY rev `tadaima-00089-7wm` — UNIFICACIÓN DE RAMAS Y CIERRE DEL TRABAJO DE PROD SIN COMMITEAR.** Diagnóstico inicial: el hermano (Ruben) "hacía pull y no veía los cambios" → la causa era que TODO el trabajo de prod rev `00083`→`00088` (Bodega/Exhibición, USD en caja, límite de preventa por cliente, cambio de contraseña, default proveedor/categoría) estaba **desplegado en prod pero SIN commitear** (solo working tree + imagen de Cloud Run), y además Joel (`dev/qa-handoff`) y Ruben (`develop`) estaban divergidos. **(1) Commit del working tree de prod** → `7677ef6` en `dev/qa-handoff` (67 archivos, escaneo de secretos limpio), pusheado. **(2) Merge `dev/qa-handoff` → `develop`** (`edca333`, backup en rama `backup/pre-merge-qa-into-develop-2026-06-22`): merge de 3 vías (base `bb62445`); ÚNICO conflicto `TransfersPage.tsx`; verificado que el resto auto-mergeó conservando AMBOS lados (el selector de usuario en Reportes de Ruben + el USD de Joel conviven, nada se perdió en silencio). `develop` ya contenía 26 commits nuevos de Ruben (reportes para gerentes, selector de usuario, transferencias/traslados para gerentes, reportes de ventas canceladas) que NO estaban en prod. **(3) Fix `TransfersPage.tsx`** (`3b2b7aa`): la versión de Ruben agrupaba traslados POR TIENDA (asumía 1 bodega/tienda) → incompatible con el modelo de 2 stocks y desalineada con su propio backend (que transfiere por `warehouse_id`); reescritos `availableOriginWarehouses`/`destinationWarehouses` a **nivel-bodega** (elige Bodega/Exhibición específica, etiquetas "Tienda · Bodega/Exhibición" vía `warehouseTypeLabel`) **CONSERVANDO el RBAC de gerentes de Ruben** (`canCompleteTransfer`, gerente origen completa/cancela) y el preview de items. El movimiento intra-tienda Bodega↔Exhibición sigue por `POST /inventory/move` (QuickStockModal), NO por Traslados. **(4) `develop` = RAMA OFICIAL** (decisión Joel); ambos trabajan ahí (Ruben: `git pull origin develop`). `dev/qa-handoff` queda como snapshot histórico; `main` sigue atrasada. **(5) Verificación prod-ready:** `vite build` OK; **155 tests backend** (515 assertions) incl. migraciones de ambos en DB fresca + `TransferRbacTest`; ~450 errores `tsc` PRE-EXISTENTES (exactOptionalPropertyTypes) en TODAS las ramas que NO bloquean prod (el Dockerfile usa `npx vite build`, salta tsc) — el fix NO introdujo errores nuevos (verificado por diff contra baseline). **(6) DEPLOY a prod `tadaima-00089-7wm`** vía `gcloud run deploy tadaima --source . --region us-central1` (Cloud Build, **sin Docker local** — pedido de Joel): respaldo previo de la config de Cloud Run (`--format=export`); deploy SIN flags de env para **PRESERVAR** las env/secrets → verificado **22/22 intactas** (APP_KEY, DB_PASSWORD, Supabase key, DB socket Cloud SQL, GCS, Sanctum); migraciones no-op (cero nuevas vs prod, diff vacío); health `/`=200 en 0.32s. **Este deploy subió a prod por PRIMERA VEZ los 26 commits de Ruben** → pendiente QA de esos módulos. **NOTA caché PWA:** QA en incógnito NUEVO o hard refresh.)
>
> Actualizado previo: 2026-06-20 (**SESIÓN QA EN VIVO — 6 DEPLOYS rev `00083`→`00088` (frontend+backend). Backend 155/155, `vite build` OK en cada paso. ⚠️ TODO desplegado vía `gcloud run deploy --source .` desde el working tree — el código NO está commiteado/pusheado (sigue solo local + en prod); backup del working tree en `backups/working-tree-pre-ruben-2026-06-19.tar.gz`. Joel prueba y avisa.** **(00083) Push del lote 06-17 (Bodega/Exhibición + límite preventa por cliente) — corrieron solas las 3 migraciones (enum `bodega`, backfill bodegas, `limit_per_customer`) + esta sesión:** (1) **Caja = CTA primario del nav** — movida del último lugar a la **2ª posición** (bajo Inicio) con la marca roja Tadaima SIEMPRE encendida; resto de items neutros (refactor `NavItemLink` en `Layout.tsx`). (2) **Cambiar contraseña self-service** en el menú del avatar (los 3 roles): `POST /auth/password` con verificación de contraseña ACTUAL (`Hash::check`, min 8, distinta) + `ChangePasswordModal` (toggle ver/ocultar, validación inline). **🔴 Fix de seguridad CRÍTICO de paso:** `UpdateUserRequest::authorize()` devolvía `true` sin guard → cualquier token podía cambiarle la contraseña a CUALQUIER usuario; ahora `UserController::update` solo deja a admin editar a otros y a un no-admin tocar su propia cuenta (sin auto-asignarse tienda/costo/estado). `ChangePasswordTest` (5). (3) **Tipo "Manga Nacional"** (antes "Libro / Manga", "Alta de Tomos", "Manga · Lote", tab "Tomos / Manga"); las UNIDADES siguen siendo "Tomos". (4) **Preventa: límite de retiro sugerido 10→7 días** (`PICKUP_DAYS_AFTER_ARRIVAL`). (5) **Caja: método de pago vuelve SIEMPRE a Efectivo tras cobrar** (reset en `clearCart`) + **dropdown de método crece al hover** (alto 44→60, ícono/texto, vuelve al salir). (6) **Merge selectivo de `origin/develop` (Ruben) — módulos Reportes/Traslados/Existencias:** `ReportsPage`, `TransfersPage`, `StockSearchPage` + backend ADITIVO (`product_type`/`product_id` en `SaleResource`/`SaleItemResource`/`PreSaleOrderItemResource` + eager-load en `PreSaleOrdersController`, backward-compatible, NO rompe Ventas/Caja → no hizo falta separar endpoints); `types.ts` mergeado a mano (sin perder bodega/preventa). Excluido: SellPage/SalesPage de Ruben (no-op + pisaría la sesión), package.json/lock (`motion` ya existía), `patch_reports_negative.js` (basura), LoginPage (logo). El ReportsPage de Ruben CONSERVÓ el polling 20s + preventa por fecha de pago de Joel. **(00084-00086) LÍMITE PREVENTA POR CLIENTE — diagnóstico y UX:** QA de Joel "me deja vender 2 veces" → investigado contra prod (API admin, solo lectura): **el feature SIEMPRE funcionó** (`reservedCountForCustomerIds` cuenta bien entre folios; test `test_per_customer_limit_blocks_when_exceeded` lo prueba con 2 POST separados) — **la causa real era que NINGÚN catálogo tenía `limit_per_customer` configurado (todos null = sin límite)**. Joel siempre probó en "Preventa Admin" (#1, null). Se pusieron #1 y #6 en límite 2 vía API para QA. Mejoras UX deployadas: (00084) chequeo en vivo del límite **al AGREGAR** la preventa al carrito (`addCatalogToCart` async, antes solo al asignar cliente/cobrar); (00085) **card deshabilitada + label rojo** en el modal de preventas (flujo cliente-primero); (00086) **banner rojo persistente en el carrito** — cubre el flujo real "clic catálogo → asignar cliente que ya pasó el tope" donde `confirmAssignCustomer` rechazaba la asignación con solo un toast (`customerLimitWarning`, visible aunque no se asigne, con X). **(00087) Alta de producto: placeholder "Elige categoría" / "Elige proveedor"** (antes el select sin opción vacía mostraba la 1ª aunque el valor fuera ""). **(00088) GUARDAR DÓLARES RECIBIDOS EN CAJA (pedido Joel — antes NO se guardaba, solo el MXN equivalente):** columnas nuevas `sales.cash_received_usd` + `sales.exchange_rate` (snapshot, ADR-015), migración corre sola; `CheckoutRequest`/`SalesController`/`CheckoutService` (threading a checkoutDirect→checkout) + `SaleResource`; 0 USD → null. Agregación en el Corte (`/reports/cash` suma `total_usd_received` por sesión + summary). **3 vistas:** (a) Historial/Ventas → chip verde "N USD" por ticket; (b) Corte → fila "Dólares recibidos" en pantalla + impreso; (c) Reporte del Día → tarjeta "Pago en efectivo" muestra "incluye N USD recibidos". `SaleUsdReceivedTest` (3). **NOTA caché PWA:** entre deploys el bundle viejo persiste; QA en incógnito NUEVO o Cmd+Shift+R.)
>
> Actualizado previo: 2026-06-17 (**SESIÓN BODEGA/EXHIBICIÓN + LÍMITE PREVENTA POR CLIENTE — TODO LOCAL, SIN deploy. Backend 147/147, `vite build` OK, 0 errores tsc nuevos (baseline 447 pre-existentes). Joel hace push + QA mañana.** [DEPLOYADO 2026-06-20 en rev 00083] Pendiente al deployar: corren solas 3 migraciones nuevas (enum `bodega`, backfill bodegas, `limit_per_customer`). **(A) MODELO DE 2 STOCKS POR TIENDA (decisión Joel):** cada tienda = **Exhibición** (`warehouses.type='store'`, el front, VENDIBLE en Caja) + **Bodega** (`type='bodega'` NUEVO, backstock atrás, NO vendible). Migración ALTER enum `warehouses.type` (+`'bodega'`, solo-MySQL en prod; el `create_warehouses` ya lo incluye para SQLite/fresh) + backfill idempotente que crea la Bodega (en 0) de cada tienda existente — el stock actual se queda en Exhibición → todo sigue vendible (cutover seguro, sin ventana de "nada vendible"). `StoreController::store` + seeder ahora crean los 2 almacenes; **quitado el `createWarehouse` duplicado de `StoresPage`** (bug: la alta por `/stores` creaba 2 Exhibiciones). `CheckoutService::reserveStock` vende SOLO de Exhibición (`where type='store'`); si falta avisa "hay N en bodega, muévelo". `SaleCancellationService::restoreInventory` regresa a Exhibición. **Endpoint nuevo `POST /inventory/move`** (Exhibición↔Bodega misma tienda, guard de tienda, `InventoryMovement` tipo transferencia). `ProductController` GET /products con `store_id` desglosa `stock_exhibicion`/`stock_bodega`; Caja (light) ve SOLO Exhibición + `stock_bodega` para el badge. Tests `BodegaExhibicionTest` (6). **Frontend:** Productos con columnas Exhibición/Bodega/Stock(suma) cuando hay tienda en scope; **`QuickStockModal` rediseñado** (pedidos de Joel iterando con screenshots): tienda en el HEADER (chip gerente / dropdown admin, scopea todo el modal), **TABS** "Existencias" (editor 2 columnas Exhibición|Bodega, input directo + Vaciar) y "Mover stock" (toggle de dirección Exhibición→Bodega / Bodega→Exhibición + preview "old → new" + el Mover GUARDA solo, optimista con rollback si truena, sin esperar refetch); badge "N en bodega · surtir" en el catálogo de Caja cuando Exhibición=0; `StoreStockBreakdown` muestra Exhib/Bodega; AdminPage Bodegas con opción Exhibición/Bodega/Central. Helper `lib/warehouse.ts` (labels/colores). **(B) PREVENTA — rename cosmético:** el "Stock" por tienda del catálogo (`store_limits.limit_qty`, el cupo por tienda) → **"Unidades por tienda"** en `NewPreSaleCatalogModal` (tab + label + total) y `PreSaleCatalogsPanel` (header) para no confundir con el stock real nuevo; el "Límite de unidades" global queda igual. **(C) LÍMITE DE UNIDADES POR CLIENTE EN PREVENTA (decisión Joel):** columna nueva `pre_sale_catalogs.limit_per_customer` (null=sin límite). Por catálogo e independiente (ej #34=5 y #35=3 no se suman); **de por vida** (cuenta folios pending+ready+delivered, NO cancelados; como al `arrived` ya no se vende preventa, el conteo cierra solo); **BLOQUEA** (422). Identidad amplia del cliente: mismo `id` ∥ teléfono normalizado(10díg) ∥ socio Tadaima `external_member_id` → registros duplicados de la misma persona cuentan juntos (la tarjeta TD es UNIQUE → en la práctica el teléfono es el que atrapa duplicados). `Customer::sameIdentityIds()` + `PreSaleCatalog::reservedCountForCustomer/Ids()` + validación en `PreSaleOrderService::createOrder` (tras el check de cupo-por-tienda). Endpoint `GET /pre-sale-catalogs/{id}/customer-usage?customer_id=` → `{used,limit,remaining}`. La venta del producto regular post-llegada (otro id) NO cuenta (se cuenta por `pre_sale_order_items.pre_sale_catalog_id`). Tests `PreSaleCustomerLimitTest` (7). **Frontend:** input "Límite por cliente" en el tab General del catálogo; Caja consulta `customer-usage` al asignar cliente (los 3 caminos: local, socio TD, cliente nuevo) y **bloquea con aviso** "ya tiene X/N de '...'" — el backend igual valida al cobrar. NO se reusó `preorder_limit` (es el tope global, otra semántica).)
>
> Actualizado previo: 2026-06-16 (**SESIÓN REPORTES — DEPLOY rev `tadaima-00082-7nj`.** (1) **Polling live en Reportes** (pedido de Joel: "que cargue rápido/live mientras esté en esta pantalla"): `refetchInterval: 20_000` (`LIVE_POLL_MS`, mismo ritmo que Ventas/Caja/Productos) en las 6 queries del Reporte (`salesReportQuery`, `salesListQuery`, `preSaleOrdersQuery`, `invQuery`, `topQuery`, `custQuery`). Cada query ya estaba `enabled` por tab → **solo la pestaña activa hace polling**, no las 4 a la vez; React Query pausa el intervalo en background (`refetchIntervalInBackground` default false) → live solo mientras se está EN la pantalla. Se mantiene `staleTime: 30s` + skeletons/indicador "Actualizando…" honestos → el refetch de fondo es invisible. (2) **Refactor de preventa en el Reporte (sin commitear de la sesión previa de hoy, se empaquetó en este deploy)**: `preSaleOrderToSyntheticSales` → `presalePaymentsInRange`; cuenta anticipos/liquidaciones por su FECHA DE PAGO espejando el filtro backend `payment_from`/`payment_to`. (3) **Deploy vía Cloud Build `gcloud run deploy tadaima --source . --region us-central1`** (Docker local NO estaba corriendo; `--source .` además **preserva** las env vars/secrets/Cloud SQL de Cloud Run — más seguro que `deploy.sh` que con `--set-env-vars` las reemplaza, causa del incidente Supabase del 06-15). Verificado en prod: Home `/`=200, `POST /api/v1/auth/login`=422 (backend vivo, Supabase preservado). Commit `d9a1503` en `dev/qa-handoff`. **Backend sin cambios** (frontend-only). **Nota:** quedan 4 errores `tsc -b` pre-existentes en `ReportsPage.tsx` (helpers de fecha + Popover, líneas 62/86/1399) que NO bloquean `vite build` ni runtime — pendiente limpieza opcional.)
>
> Actualizado previo: 2026-06-15 (QA) (**SESIÓN QA — 4 DEPLOYS rev `00078`→`00081` (frontend+backend) + FIX INFRA Supabase.** (1) **Puente Supabase de socios estaba CAÍDO en prod** (Clientes→buscar no traía socios): Cloud Run había perdido `TADAIMA_SUPABASE_URL`/`SERVICE_KEY` → el backend caía al stub (devolvía datos `@stub.tadaima.local`). Causa raíz: **bug de llave `}` en `deploy.sh`** (presente desde el commit inicial de Supabase `87ac7dd`, 2026-05-05) → la expansión se tragaba ambas vars en el patrón de `SANCTUM_STATEFUL_DOMAINS` y `--set-env-vars` (que REEMPLAZA todas) las borraba en cada deploy. Fix: `deploy.sh` corregido + service key movida a **Secret Manager** (`tadaima-supabase-service-key`, como APP_KEY/DB_PASSWORD) + IAM accessor a la SA de runtime; Cloud Run restaurado vía `--update-secrets` (rev `00078`). Verificado local+prod: socios reales (`q='ma'`→10). Ya NO se vuelve a perder en deploys. (2) **Logo Tadaima** en el sidebar del dashboard (imagen `tadaima-logo.jpeg` traída de `origin/develop` —commit de Ruben— con fallback a texto) — rev `00079`. (3) **Buscador de Caja no se recorta** (rev `00080`): el dropdown de resultados era `absolute left-0 right-0` y al achicarse el área de Caja recortaba las 3 columnas de precio (Normal/Socio/Mayorista); ahora `minWidth 620 + maxWidth 90vw + z-110` → ancho fijo, no se encoge con la caja. (4) **Liquidaciones de preventa ahora SÍ salen en el Reporte, por FECHA DE PAGO** (rev `00081`): el Reporte (de Ruben) solo leía `/sales` y perdía las liquidaciones (una liquidación sola no crea `Sale`; liquidar un folio existente no lo liga al sale de productos — `linked_sale_id` solo se pone al CREAR folio nuevo). Ahora cuenta los cobros de preventa **por pago** y por **fecha de pago** (anticipo y liquidación cada uno en su día); a las ventas reales se les vacía `pre_sale_orders` para no doblar el conteo. Backend: `/pre-sale-orders` acepta `payment_from`/`payment_to` (folios con un pago en el rango, por fecha de pago — trae liquidaciones del día aunque el folio se creara antes; antes filtraba por `created_at`). (5) **RBAC cajero — solo ve lo suyo en preventa** (rev `00081`): `/sales` y `/reports/cash` ya forzaban cajero a su `user_id`; faltaban los movimientos de preventa en la Lista de Ventas. `/pre-sale-orders` acepta `mine=1` (folios creados o cobrados por el usuario: `user_id` ∥ `payments.cashier_id`); SalesPage lo manda para cajero. **Opt-in**: Caja NO lo manda → el cajero sigue pudiendo liquidar folios de otros. (6) **Confirmado sin cambio:** el scan/búsqueda de Caja ya filtra por la tienda del usuario (`ProductController` `whereHas('inventory'...store_id)`). Suite backend **134/134** (+2 tests: payment-date filter, mine filter). Branch `dev/qa-handoff` y prod sincronizados en `d7a3784`.)
>
> Actualizado previo: 2026-06-15 (noche) (**SESIÓN UI MASCOTAS POKÉMON + GIT/MERGE RUBEN — LOCAL, sin deploy (Joel deploya manual con `gcloud run deploy tadaima --source . --region us-central1`).** (1) **Loaders Pikachu**: nuevo componente reutilizable `landing/src/components/ui/PikachuLoader.tsx` (gif `public/pikachu-loading.gif`, `image-rendering:pixelated`) reemplaza el spinner circular `Loader2` de `ProtectedRoute` → el loader principal al cargar páginas ahora es Pikachu corriendo. (2) **Caja cerrada**: el cuadro con icono `ShoppingBag` del estado sin sesión en `SellPage` ahora es Pikachu sobre Pokébola (`public/pikachu-caja.gif`) con glow rojo de marca. (3) **Fondo del carrito en Caja**: Charizard (`public/charizard-bg.gif`) detrás de la lista de items (`isolation:isolate` + `z-index:-1`, NO tapa filas); **baja con la cantidad de items** (`translateY(min(items*56,360))`); **nítido/visible sin items** (blur 0, opacity .95), **blur sutil con items** (blur 7px, opacity .18). **Efecto vuelo**: `td-charizard-in` (entra desde `-500`, overshoot, aterriza, 1 vez) + `td-charizard-hover` loop (baja `44px` y regresa a la base) — keyframes en `<style>` inline para NO tocar `glass.css`. (4) **FIX build**: Codex dejó SIN COMMITEAR un ternario roto en `SellPage.tsx` (`${requireCustomerFlash ? "..." }` sin rama `:`) que tronaba `vite build`; corregido con `: ""`. (5) **GIT — lote del día**: commit `9a61088` (sesión preventas + lote local de Codex Reportes/Cash/Dashboard) → push a **`origin/main`** (lo de Joel, ANTES del merge). Luego SOLO `ReportsPage.tsx` de Ruben (`origin/develop`, "Reporte Excel", frontend only, NO requiere backend) → commit `57dfdac` → push a **`origin/dev/qa-handoff`**. Backup previo: rama `backup/pre-ruben-merge-2026-06-15_175616` + tarball en `backups/`. **⚠️ Codex edita `SellPage.tsx` EN PARALELO (el archivo cambió varias veces entre lectura y edición) — riesgo de pisarse; coordinar.** **Las mascotas Pikachu/Charizard siguen SIN commitear.** **🔴 PENDIENTE: bloquear el LOGOUT / cierre de sesión cuando el usuario tiene CAJA ABIERTA** — no debe permitir salir si hay sesión de caja activa; primero cerrar corte (o avisar/confirmar).)
>
> Actualizado previo: 2026-06-15 (**SESIÓN QA PREVENTAS GERENTE + CANCELACIÓN EN VENTAS — LOCAL, SIN deploy. Backend 132/132.** (1) **Panel Catálogos de Preventa por tienda para el gerente**: la columna apretada `vendidos·entregados·límite` mostraba `sold_count` (= apartados+liquidados) como "vendidos" y confundía (un apartado contaba como venta) → **4 columnas limpias**: **Stock** (disponible/tope = `store_limits[tienda]` − `reserved_by_store[tienda]`; "Sin asignar" rojo si no hay entrada), **Apartados** (`reserved_by_store[tienda]`), **Liquidados** (`delivered_by_store[tienda]`); "Límite de unidades" (`preorder_limit` global) **OCULTO al gerente** (su límite real es el tope de Stock). Antes Apartados mostraba el GLOBAL → el gerente veía 27 (suma de 3 tiendas) cuando la suya tenía 1. (2) **Acciones → dropdown Radix** (`@radix-ui/react-dropdown-menu`) en vez de fila de 3-4 botones. (3) **Indicador de Stock en el modal** (tab General, junto a "Límite de unidades") verde/rojo + salto al tab Stock. (4) **Cancelación de preventa visible en Ventas**: la query de folios trae `cancelled`, se pinta fila roja distinta (`Ban`, −$reversado, "Cancelación") sin contaminar revenue/reportes (filtran por status). (5) **Backend**: `delivered_by_store` (espejo de `reserved_by_store`) y `cancelled_amount` (suma de `SaleCancellation.amount_refunded`; en full-cancel se borran payments → `paid_amount` inservible) en los resources; el index carga `deliveredOrderItems.order:id,store_id` y `cancellations`. Tests nuevos `delivered_by_store` + `cancelled_amount index`. (6) **Polling 20s** en el panel de Catálogos + `invalidateAfterSale` con `refetchType:'all'` en `preSaleCatalogs` (al cancelar en Caja, el panel del gerente se quedaba en 49 stale). **Este commit también empaqueta el lote local de Codex (Reportes/Cash/Dashboard, backend+front) que estaba sin commitear.** Estrategia de push: estado actual → `origin/main` (queda lo de Joel, ANTES del merge); luego se trae SOLO `ReportsPage.tsx` de Ruben (`origin/develop`, "Reporte Excel" — solo frontend, NO requiere backend) → `origin/dev/qa-handoff`.)
>
> Actualizado previo: 2026-06-13 (**SESIÓN QA RUBEN — 5 DEPLOYS rev `00073`→`00077`, SOLO frontend (landing); backend sin cambios desde 00072.** Verificado en prod tras cada deploy (Home 200, login 422). (1) **FIX stock de tomos no bajaba en Productos/Tomos** (rev `00073`): el tab Tomos lee la query `['mangas']` (distinta de `['products']`) y ni `invalidateAfterSale` ni `decrementProductStockInCaches` la tocaban → Existencias bajaba 5→4 (lee `['inventory']`) pero Tomos seguía en 5 (cache viejo, staleTime 5min). Ahora `invalidateAfterSale` invalida `['mangas']` y el optimista camina también ese cache (el id del tomo == `product_id`, mismo `decrementDeep`). Era cache, NO el backend (descuenta bien con `Inventory::decrement`). (2) **Historial del Día con max-height de viewport** (rev `00074`): nuevo hook `useViewportMaxHeight` (callback ref) mide el top real del contenedor vs `window.innerHeight` → topa la lista de tickets con scroll interno garantizado, sin depender solo de la cadena flex; reactivo a resize. (3) **Calendarios react-aria** (rev `00074`): nuevo `SingleDatePicker` (Calendar single, SIN rango) reemplaza los `<input type=date>` del catálogo de preventa — el "límite de retiro" usa `minValue = fecha de llegada` (deshabilita días anteriores a la llegada) y se habilita solo tras elegir la llegada; nuevo `DateRangePicker` (RangeCalendar 2 meses, estilo de Ventas, popover portea a body) reemplaza los inputs nativos del rango en `CortesModal` y `CashCutsPage`. (4) **Badge de restricción de pago** (rev `00075`): nuevo `PaymentRestrictionBadge` (ámbar **Solo Efectivo** / azul **Solo Tarjeta**) + helper `getPayRestriction` (deriva de `payment_restriction` + flags `allow_cash`/`allow_card`); pill GRANDE bajo el SKU en el catálogo de Caja (antes el catálogo no mostraba ninguna restricción) y reemplaza el "Solo Efectivo" suelto del carrito agregando además "Solo Tarjeta". (5) **Cancelación de preventa sin elección de modo** (rev `00076`): `CancelTicketModal` ya NO da 2 opciones — liquidada (delivered) → SOLO rollback (cancela la venta del día, folio vuelve a "Listo · Liquidar", regresa stock entregado, reversa solo el cobro de la liquidación, MANTIENE el anticipo); solo anticipo → cancelación completa (regresa anticipo + stock). Quitados los `ModeButton` + componente muerto; backend sin cambios (ya soportaba `liquidation_rollback`, ADR-016). (6) **Ocultar cancelar en preventas liquidadas** (rev `00077`): el botón de cancelar del historial solo aparece para folios con anticipo pendiente (pending/ready); en delivered/cancelled se oculta → una liquidación ya NO se puede cancelar. **NOTA — bug LOCAL de Ruben (no prod):** su SQLite tronaba al cerrar caja por `no such column: local_date` — no había corrido `php artisan migrate` en su DB local; prod (MySQL) ya tiene la columna desde 00072. Branch `dev/qa-handoff` y prod sincronizados en `269f503`.)
>
> Actualizado previo: 2026-06-12 (**DESPLEGADO rev `tadaima-00072-6bk` — TODO el lote acumulado 06-10→06-12 ya en prod + merge UI transferencias de Ruben.** Ver sesión en §11. (1) **Backup a `main`**: commit `0d0d8bd` con el lote completo (48 archivos) pusheado a `dev/qa-handoff` Y fast-forward a `main` ANTES de traer lo de Ruben; sacados del repo `pos-app/` (repo propio) y `backend/tadaimaposlite` (SQLite accidental) → `.gitignore`. (2) **Cherry-pick `e7e8e7b` de `origin/develop`** (Ruben, solo `TransfersPage.tsx`): solo admin/gerente entran a Transferencias, gerente solicita viendo stock de TODAS las tiendas, solo admin completa, cancela admin o gerente creador + responsive. SIN traer: commit `2146837` (logo en Layout+Login) — decisión pendiente de Joel. (3) **Backend de transfers alineado al flujo nuevo** (la UI sola habría tronado: `store()` daba 403 al gerente con origen ajeno; complete/cancel solo se bloqueaban en UI): cajero 403 al crear, gerente origen libre pero su tienda debe ser origen o destino, `complete()` admin-only, `cancel()` admin o gerente creador. `TransferRbacTest` (5). (4) **`local_date` en cortes**: la UI manda la fecha local al cerrar caja (`closeSession(amount, getTodayLocal())`), columna nueva `cash_register_sessions.local_date` (migración ya aplicada a prod), `/reports/cash` filtra por ella cuando existe (legacy/abiertas caen al traslape) — el corte de las 11:30pm ya NO se va al día siguiente; corte #17 backfileado a 06-11; fallback backend zona negocio. `CashReportRangeTest` +3. **Suite 129/129.** Verificado en prod: login ✓, `/transfers` 200, corte #17 sale en 06-11 y NO en 06-12, `cancelled_amount` en `/sales`, bundle nuevo con strings de Ruben, `/cortes` 200.)
>
> Actualizado previo: 2026-06-11/12 noche (**SESIÓN QA VENTAS/REPORTE + TZ TIJUANA — LOCAL, SIN deploy, se suma al lote pendiente. Backend 121/121 tests.** (1) **Fix calendario de rango en Ventas** (react-aria-components 1.18): el trigger era `<button>` nativo dentro de `DialogTrigger` y el press nunca llegaba (PressResponder solo lo consume el `Button` de la lib) → popover muerto + error en consola; ahora `AriaButton`. Popover con **bg sólido** `--td-popup-bg` (el glass se transparentaba sobre la tabla) y día activo con número centrado (`flex items-center justify-center`). **Loading al elegir rango**: spinner en el chip + "Actualizando…" en el footer del popover (`isFetching` de sales+preSales). (2) **Toast "Error al cargar datos financieros" arreglado**: con el polling de 20s un refetch de fondo fallido (red/sleep/timeout) disparaba el toast aunque hubiera data en pantalla; ahora solo avisa si la falla deja la pantalla SIN datos y dice QUÉ falló y por qué (mensaje del ApiError). (3) **Home del gerente rediseñado**: card de perfil del gerente (avatar editable + badge + tienda) arriba junto a Cajeros conectados, Cortes de hoy abajo; FUERA los 4 stats (Sesiones/Ventas/Entradas/Salidas — ya viven en Ventas/Reportes) y FUERA "Acciones rápidas" (el sidebar ya tiene Caja/Productos); `ActionCard` muerto eliminado. (4) **Tabla Tarjeta del Reporte = espejo del Excel de corte del gerente** (analizado `ejemplo corte Tadaima.xlsx`): columnas **Comisión** (repartida POR FILA desde el snapshot `commission_amount` — cada terminal su % p.ej. Banorte 6% vs 16%, pill con % efectivo), **IVA s/comisión** e **Venta real** = Venta − Comisión − IVA; **Utilidad de tarjeta corregida** = Venta real − Costo (antes no restaba comisión/IVA); fórmulas visibles en el subtítulo de Efectivo y Tarjeta; footer "Comisión terminal" con copy claro (el 16% es IVA SOBRE la comisión, no % de comisión). **IVA s/comisión editable en el header del Reporte** (chip ámbar, persiste en localStorage por dispositivo, recalcula tabla+exports al vuelo). Costo $0 guardado ahora también pinta ROJO + flag "sin costo" (antes solo null). (5) **Expand/colapso animado** de las tablas gemelas (Efectivo|Tarjeta y Apartados|Liquidaciones): botón ⛶ expande una a todo el ancho empujando la otra (transición `grid-template-columns` 0.45s); <xl se apilan y no aplica. (6) **TZ NEGOCIO → `America/Tijuana` (cierra #117, decisión Joel)**: a las 11pm Tijuana el "Hoy" brincaba de día (medianoche CDMX) y Ventas quedaba vacío; `BUSINESS_TZ` en `lib/date.ts` + backend `DateRange`/`config/app.business_timezone` (env `BUSINESS_TIMEZONE`). (7) **Fix filtro de Cortes (`/reports/cash`)**: comparaba `whereDate(opened_at)` en UTC crudo Y solo por fecha de apertura → corte nocturno desaparecía y una caja abierta varios días no salía; ahora rango zona-negocio→UTC + **TRASLAPE con la vida de la sesión** (`CashReportRangeTest` 3 tests: corte nocturno, cruza medianoche sale en ambos días, caja abierta de días sigue saliendo). (8) **Scroll del historial de Caja**: cadena de alturas explícita (`height:100%` + `minHeight:0`) + barra ROJA visible 10px (`.td-scroll-visible` en glass.css — la global de 5px parecía "sin scroll"); verificado EN VIVO con Playwright (lista 656px, 2,264px de contenido, scrollea). **Nuevo pendiente #135**: corte final debe sumar retiros de caja al efectivo total del día. **⚠️ TODO el lote backend sigue SIN deploy** — hasta deployar, los cortes/ventas cerca de medianoche se ven corridos 1h (front Tijuana vs prod CDMX).)
>
> Actualizado previo: 2026-06-12 madrugada (**SESIÓN QA CORTES + CANCELACIONES — LOCAL, SIN deploy, se suma al lote pendiente. Incluye BACKEND (118/118 tests).** Ver sesión en §11. (1) **Página "Cortes" (`/cortes`) en el menú** para cajero/gerente/admin (RBAC del backend en `/reports/cash`) con detalle INLINE expandible: resumen abrió/cerró/descuadre + tabla de TODOS los tickets del corte + preventa + movimientos + imprimir 58mm; pestaña "Cortes de Caja" removida de Reportes. (2) **Historial de Caja full-screen** (patrón catálogo) con buscador ticket/folio/cliente/producto/SKU/método. (3) **Fix IVA s/comisión:** `Number(null)=0` hacía que arrancara en 0 en vez de 16; input ahora se puede borrar (string local, placeholder 0) y el 0 no se persiste. (4) **Apartados del Reporte con Venta/Abono/Resta + Costo/Utilidad** (gate `canViewCost`, snapshot ADR-015, fórmulas visibles) en pantalla + print/PDF/Excel. (5) **Cancelaciones −$X simbólico:** `SaleResource` expone `cancelled_amount` + `cancelled_items` (la venta editada in-place queda en $0 y no decía cuánto se regresó) → Lista de Ventas e historial muestran **−$2,400 en rojo + detalle de lo cancelado** SIN tocar sumas (el total ya lo descuenta); fix KPI sección H que sumaba total=0. (6) Historial: label "Tarjeta" corto + botón cancelar OCULTO si hay pago tarjeta (regla 06-10, backend ya bloqueaba).)
>
> Actualizado previo: 2026-06-12 noche (**SESIÓN PERF + UX QA — todo LOCAL, SIN deploy, se suma al lote pendiente.** Ver sesión 2026-06-12 noche en §11. **(1) Veredicto NO Redux** (2 agentes: arquitecto + auditoría RQ): el dolor era latencia de Cloud Run (300ms–2s por refetch), no la librería; migrar costaría 12–20 días con riesgo alto. Palanca correcta: **escritura optimista al cache** — nuevo `lib/optimisticSale.ts` (`prependSaleToSalesCaches`, `prependPreSaleOrderToCaches`, `patchPreSaleOrderInCaches`, `decrementProductStockInCaches`): tras el POST exitoso la venta aparece en Ventas y el stock baja en Caja AL INSTANTE; la invalidación reconcilia en bg; sin rollback (solo se escribe lo confirmado). **(2) `invalidateAfterSale()` centralizada** (3 checkouts + cancelación + devolución usaban copias divergentes) + **fix gap: KPIs del Dashboard nunca se invalidaban** tras vender/cancelar/devolver. **(3) Polling casi-live 20s SOLO en ventana activa + tab enfocada** (opción `refetchIntervalMs` en hooks): Ventas (admin/gerente; cajero excluido — ya es optimista), Productos/Tomos por tab, panel Folios; cajero solo con modal Catálogo/Preventas ABIERTO. Indicadores de refetch solo con `isPlaceholderData` → el polling es invisible (la lista de Ventas se atenuaba y bloqueaba clicks en cada fetch). **(4) Validación inline tel/correo** (regex de `lib/validation.ts`) con label rojo + botón bloqueado en alta de cliente ×3: popup de Caja, form preventa, modal Clientes. **(5) Fix crash `hasCashOnly is not defined`** al abrir el menú de método de pago (variable fantasma desde 06-10) → ahora `itemAcceptsMethod` por opción (bloquea Tarjeta con items cash_only/preventa Y Efectivo con items solo-tarjeta). **(6) Footer Caja:** iconos por método (Banknote/CreditCard/ArrowLeftRight/DollarSign), terminal como icono compacto 📱+✓ verde / ⚠ ámbar (nombre en tooltip — antes apretaba todo), botón outlined "Buscar terminales" en el modal. **(7) Ticket formato clásico 2 líneas:** nombre / `cant × precio unit` + importe (antes "×2 $800" se leía como precio por pieza) — impreso 58mm + reimpresión + preview. **(8) Ventas:** método "Tarjeta débito/crédito" → display "Tarjeta" (`shortMethodName`). **(9) Reporte (tab renombrado, 2ª posición):** sub-tabs 5→3 — "Ventas" = Efectivo|Tarjeta 2 columnas y "Preventas" = 1·Apartados|2·Liquidaciones, títulos centrados; **desglose por P. Unit** (agrupación producto+fecha+precio unitario: mismo tomo a $400 y $1,000 = filas separadas); columna **Costo $0 + flag rojo "sin costo"** (también costo $0 guardado) + contador en footer; texto 12→14px; **paneles de altura FIJA** (`calc(100vh-430px)`, CSS puro) con body scroll y fila Total anclada al fondo en banda aparte (colgroup compartido + table-layout fixed → columnas alineadas, las 2 columnas terminan parejas); gate de costos `canViewCost` (admin ∥ flag — antes solo admin); subtítulos fuera; desc del reporte + Imprimir/Excel/PDF movidos AL FONDO. `vite build` OK en cada paso. Exports print/PDF/Excel sin tocar (siguen emitiendo las 5 tablas).)
>
> Sesión previa mismo día (referencia): (**SESIÓN QA EN VIVO gerente+cajero Macro — DEPLOY rev `tadaima-00071-6lt` + LOTE LOCAL PENDIENTE DE DEPLOY.** Ver sesión 2026-06-11/12 en §11. **Deployado en 00071:** (1) stock que no refrescaba — la devolución en Lista de Ventas solo invalidaba `sales` (ni products, ni inventory, ni historial) y NINGÚN flujo de venta/cancelación invalidaba `['inventory']` (Existencias) → invalidaciones agregadas en checkout×3, CancelTicketModal y handleReturn + polling 30s en el desglose por tienda; (2) `volume_number` en payload light (`ProductLightResource` + eager-load mangaDetails, `ProductLightVolumeTest` 2 tests) → pill "Tomo N" en catálogo de Caja, fila de búsqueda y Existencias; (3) cards sin foto compactos en catálogo de Caja (franja con badges en vez de cuadro 1:1, `CardMedia`); (4) tab Productos ya NO muestra mangas (GET /products trae todo y los tomos salían duplicados como producto normal); (5) staleTime catálogos productos/tomos 24h→**5min** (cross-máquina no hay invalidación; gerente creaba tomo y el cajero no lo veía hasta 24h). **PENDIENTE DE DEPLOY (working tree, sin commit):** (a) **FIX CRÍTICO heartbeat `TouchLastSeen`** — Carbon 3 hace diffs CON SIGNO → `$now->diffInSeconds($pasado)` negativo → el dedupe nunca re-escribía `last_seen_at` tras el primer touch + el middleware corría antes de `auth:sanctum` (user null con bearer) → "Cajeros conectados" SIEMPRE vacío (verificado contra prod); ahora toca después de `$next` (`TouchLastSeenTest` 2 tests); (b) Alta de Tomos exige stock (cada tomo pendiente cantidad>0 en ≥1 tienda; paso "Stock" en checklist — antes se creaban tomos sin existencias); (c) Precio Normal se autollena con Precio Público (sync hasta que el user lo edite a mano); (d) sidebar: chip **#tienda + iniciales + rol** (Cajero azul/Gerente ámbar/Admin rojo) bajo el logo para QA multi-ventana; (e) fix menú del avatar tapado por el Dashboard (aside z-10→z-20; las secciones del Dashboard son z-10 y venían después en el DOM). Backend **117/117 tests**. **QA aclarados (no eran bugs):** `gcentro@gmail.com` es gerente de tienda 3 Test1-Joel-Centro, NO de Macro → RBAC correcto al no ver cajas de tienda 4 (el gerente de Macro es `gmacro@gmail.com`); el tomo "creado como producto" era el duplicado visual del punto 4.)
>
> Sesión previa 2026-06-11 (referencia): (**SESIÓN QA + DEPLOY rev `tadaima-00069-c95`→`00070` — se deployó TODO lo acumulado de la sesión 06-10 + lo de hoy.** Backend 113/113 tests, `vite build` OK. Ver sesión 2026-06-11 en §11: preselección de tienda única en inventarios, toasts/skeletons honestos al crear producto, "Sin asignar + Avisar" en preventas de Caja (endpoint `presale-assign-alert`, fix gerente por `store_id`), fechas inteligentes y anticipo $100 en catálogo de preventa, labels Normal/Socio/Mayorista centralizados con colores en Caja, perf de Ventas (keepPreviousData + sin bloquear por products) y Preventas (debounce folios, staleTime catálogos 24h→2min), **fix crítico `reserved_by_store` aplanado por JsonResource (`array_values` en keys numéricas → cast `(object)`)**.)
>
> Sesión previa 2026-06-10 (referencia): (**SESIÓN GRANDE LOCAL — deployada el 2026-06-11.** Branch `dev/qa-handoff`. Backend 106/106 tests, `vite build` OK. **(1) Bug QA company_id:** usuarios creados por UI nacían con `company_id=NULL` → no podían crear tiendas/bodegas (422) ni ver settings reales. Fix: `UserController::store` deriva company del creador (o de la tienda) + migración backfill idempotente `2026_06_10_000001` (**YA aplicada a prod vía proxy** — los 8 usuarios quedaron company=1). Tests `UserCompanyDerivationTest`. **(2) Forms:** validación regex teléfono (10 díg, +52 opcional) y email en Nueva/Editar Sucursal y Nuevo/Editar Usuario (`lib/validation.ts` + vitest); listas de Usuarios y Sucursales con buscador + alto máximo + scroll (`ListSearchBar`/`LIST_SCROLL` reutilizables en `AdminPage`). **(3) MODELO DE ROLES (auditoría con 3 agentes + fixes):** gerente = TODO de SU tienda; admin = dropdown; cajero igual. **Guards server-side cross-tienda** (`User::canActOnStore` + `Controller::storeScopeError`, 403): ajuste de stock y movimientos de inventario (valida tienda de la BODEGA), manga-inventory, folios (crear con store_id del body validado + pagos/status/deliver/cancel), ventas (checkout directo, show, return, cancel). **Reportes anclados por rol** (`ReportsController::scopedStoreId`): sales/inventory/top-products/customers/pre-sales ignoran el store_id del request para no-admin (solo cash lo hacía; fail-closed sin tienda → -1). **Costos:** gate central `User::canViewCost()` (admin ∥ flag) usado por TODOS los resources — tapada fuga de `cost`/`margin_percent` en `PreSaleCatalogResource` (iba a cajeros) y `SaleItemResource`/`PreSaleOrderItemResource` ya respetan el flag. **Catálogo:** editar/borrar productos y mangas requiere admin/gerente (`adminOrManagerGateError`); cajero solo crea. **Gerente auto-costo (decisión Joel):** crear/promover gerente CON tienda → `can_view_cost=true` automático (admin lo revoca en Permisos de Precios); `GerenteAutoCostTest`. **UI:** TabPermisos sin la sección "Acceso a Precios por Tienda" (Existencias ya cubre stock cross-tienda); `PreSaleOrdersPanel` gerente SIN dropdown de tiendas (usaba `includes("admin"/"gerente")` frágil → helper `isAdmin` de permisos); `StoreContext` fail-closed (no-admin sin store_id ya NO ve todas las tiendas — pendiente del plan QA 06-08); `SellPage` isAdmin detecta owner/dueño. **Datos:** user 12 `gerenteMacro` reparado en prod → rol gerente + tienda Macro (2) + can_view_cost. Tests `StoreScopeEnforcementTest` (12). **(4) CRÍTICO QA RESUELTO — método de pago por producto:** los useMemo del catálogo de Caja NO mapeaban `allow_cash/allow_card` (la API sí los manda) → producto solo-efectivo se cobraba con Tarjeta. FE: mapeo en topProducts/products, `payBlocked` REAL (estaba muerto) vía `itemAcceptsMethod` en disabled de COBRAR + guard en `handleCheckout` (cubre atajos Enter). BE: `CheckoutService::assertPaymentMethodsAllowed` (clasifica por nombre vía `PaymentMethod::isCard()`; cubre pagos mixtos) → 422 aunque la UI falle (protege también a la app móvil). **(5) Tarjeta NO cancela/devuelve (decisión Joel — la tienda pierde la comisión):** `assertNoCardPayments` en `cancelSale` y `cancelPreSaleOrder` (full=todos los pagos; rollback=solo la liquidación) + bloqueado el endpoint legacy `POST /sales/{id}/return`. `PaymentRestrictionTest` (9). **(6) Auditoría de cancelaciones vs spec Joel: CUMPLE** — stock regresa (mov. `devolucion`), utilidad baja (edit-in-place), salida de caja con desglose en snapshot, cancelar anticipo LIBERA el cupo del catálogo (reservedCountForStore solo cuenta pending/ready), rollback de liquidación reversa SOLO el pago y el folio vuelve a `ready` (apartado NO se libera; stock físico se re-incrementa simétrico para re-liquidar). **(7) Cortes de caja DETALLADOS:** nuevo `GET /reports/cash/{session}/detail` (tickets con items+pagos+cancelado, cobros de preventa por cajero+ventana del corte, movimientos de caja; RBAC igual que cash) + `CashCloseSummaryModal` con sección "Desglose del corte" (sirve en Reportes→Cortes Y ventana Cortes de Caja) + impresión 58mm con desglose completo. **(8) Plan QA 06-08 5/5 COMPLETO:** scanner lock (causa real: `preventDefault` retroactivo es no-op → el código quedaba tipeado en el input y se re-procesaba; fix: limpiar input vía setter nativo + lock 500ms misma lectura), "restante por apartar" en tab Stock del catálogo (`reserved_by_store`), saldo restante en ticket de preventa (Total preventa/Anticipo/SALDO RESTANTE; liquidación = "$0 ✓ LIQUIDADO"; 3 sitios incl. reimpresión). **(9) UI Caja precios:** niveles 1/2/3 renombrados **Normal/Socio/Mayorista** (`PRICE_LEVEL_LABELS` central, pills del carrito incluidas) y el catálogo muestra **un row grande por nivel asignado** (antes labels de 8px). **Pendientes:** TZ #117, catálogo online C-E, SMTP, unificar helpers permisos restantes (SalesPage/ReportsPage inline + packages/permissions duplicado), exigir tienda al asignar rol gerente/cajero.)
>
> Actualizado: 2026-06-09 (**DESPLEGADO rev `tadaima-00068-8t2`** — **preventa en la Lista de Ventas + pre-warm de React Query Caja→Ventas.** (1) El tab **"Lista de Ventas"** (`SalesPage.tsx`) antes mostraba solo `/sales`; un **anticipo o liquidación standalone NO crea registro en `/sales`** (es un `pre_sale_order`) → era invisible. Ahora la lista **mezcla movimientos de preventa como filas**: **Anticipo** (folio `pending`/`ready`, badge ámbar) y **Liquidación** (folio `delivered`, badge verde), ordenadas por fecha junto a las ventas, expandibles (items + total/pagado/saldo), buscables por folio/cliente/método/producto. Nuevo componente `PreSaleMovementRow` + helper `getPreSaleMethodName`. **Sin doble conteo:** se excluyen folios con `linked_sale_id != null` (ya salen como hijas de su `SaleRow` en cobro mixto). Stats del header del tab y el contador incluyen los movimientos. (2) Backend `PreSaleOrdersController::index` ahora eager-loadea `payments.paymentMethod` → la fila muestra el método de pago real (no "—") sin N+1. (3) **React Query Caja→Ventas:** las 3 ramas del checkout (`SellPage.tsx`) pasaron de `invalidateQueries` default (`refetchType:'active'`, solo refetchea queries montadas → SalesPage desmontada solo se marcaba stale y al navegar se veía cache viejo ~1s) a **`refetchType:'all'`** en `sales.all`/`preSaleOrders.all` → la lista se pre-calienta en background desde Caja y al ir a Ventas ya está fresca. (4) `.gcloudignore`: excluidos ~560MB de basura local (`CSP_502m_app.pkg`, `everything-claude-code-main`, `tienda-T*`, zips) del contexto de Cloud Build. Verificado en prod: `/`=200, `/api/v1/auth/login`=422. **Decisión de producto resuelta:** la abierta "preventa en Lista de Ventas (by-design preventa≠venta)" — Joel decidió mostrarlas. **Sigue pendiente el plan QA de 5 fixes:** método de pago [CRÍTICO FE+BE], hardening StoreContext, saldo ticket preventa, restante por apartar, scanner lock.)
>
> Actualizado: 2026-06-08 (**SESIÓN DE ANÁLISIS QA — sin cambios de código, sin deploy.** Joel entregó 3 PDFs de QA (Admin, Gerente, Cajero). Análisis a fondo con agentes (arquitecto + exploradores) contra el código local de `dev/qa-handoff`. **Hallazgos:** (1) **PDF Admin = QA contra versión vieja**: los 6 bugs reportados (#106 selects ilegibles, #112 abrir caja, #118 generador de código, #119 costo librería, #121 precios D/E en modal de edición, #122 categorías/proveedores desde backend) **YA están fixeados y completos** en rev `00067`. NO requieren acción. (2) **CRÍTICO nuevo (Cajero): Caja vende con tarjeta un producto que solo acepta efectivo.** Causa raíz: los `useMemo` `topProducts` (`SellPage.tsx:402-431`) y `products` (`:504-530`) NO mapean `allow_cash`/`allow_card`/`payment_restriction` → `itemAcceptsMethod` (`:1483`) y `payBlocked` (`:1704`) siempre pasan; además `payBlocked` no está en el `disabled` del botón COBRAR (`~:5292`); y falta guard server-side en `CheckoutService`. (3) **Gerente Mario ve datos/cortes de Centro siendo de Macro = bug de DATOS, no de código.** El RBAC del backend filtra correcto por `user.store_id` (`SalesController::index:60-66`, `ReportsController::cash:211-223`, `CashRegisterController::activeSessions:90-95`, `UserController::online:39-44`). Mario tiene `users.store_id` apuntando a Centro → reasignar en BD. Agravante latente: `StoreContext.tsx:37` deja a un no-admin sin `store_id` ver TODAS las tiendas (endurecer). (4) Bugs FE menores nuevos: ticket de preventa sin saldo restante (`SellPage.tsx:~2340`), tab Stock del catálogo sin "restante por apartar" (`NewPreSaleCatalogModal.tsx`, dato `reserved_by_store` ya en API), scanner doble-conteo 1ª lectura (`useBarcodeScanner.ts`). El filtro por cajero en SalesPage YA existe (caveat: admin sin tienda no lo ve). **PLAN DE 5 FIXES armado y PENDIENTE de aplicar** (todo local): 1) método de pago [CRÍTICO, FE+BE], 2) hardening StoreContext [FE], 3) saldo ticket preventa [FE], 4) restante por apartar [FE], 5) scanner lock [FE]. **Decisiones abiertas de Joel:** preventa en "Lista de Ventas" del cajero (hoy by-design preventa≠venta), transferencias gerente elegir sucursal origen, buscar preventa por nombre de cliente.)
>
> Actualizado: 2026-06-05 (**DESPLEGADO rev `tadaima-00067-68l`** — todo lo de la sesión 2026-06-04/05 ya en prod (commit `73b0e4e`): caja por store_id, fix Clock, historial+TZ negocio, costo de librería, generador de código, categorías/proveedores desde backend, precios D/E, corte del gerente con 5 tablas tipo Excel + fecha, skeletons/perf en Productos/Preventas/Reportes, preview de impresión con preventa, toggle dólar⇄pesos. Login en prod verificado. **TODO pendiente: TZ por tienda (#117).** El bundle usa same-origin — el AVISO de `VITE_API_URL` en deploy.sh es cosmético.)
>
> Actualizado: 2026-06-04 (**probado en local contra prod vía proxy** antes del deploy 00067. 5 fixes de QA: (#112) **admin no podía abrir caja** — deadlock huevo-gallina: tras el reset no hay `cash_registers` y las tiendas creadas por UI solo crean warehouse, pero el front exigía caja pre-existente del dropdown → fix: **abrir por `store_id`**, el backend crea la caja personal al vuelo (ADR-017); (#113) **crash "Clock is not defined"** al abrir caja — icono lucide sin importar en el botón "Cortes"; hallazgo: el typecheck del landing usa `tsc --noEmit` sobre un tsconfig solo-`references` → **no chequea nada**, el correcto es `tsc -b`; (#114) **historial no mostraba ventas del día** — queryKey sin fecha + (#115) **"hoy" usaba la TZ del dispositivo** (Mac de Joel en Tijuana UTC-7 vs backend MX UTC-6) → ventas pasada la medianoche MX "desaparecían"; fix: anclar "hoy" a la TZ del negocio (`America/Mexico_City`) y meter la fecha en la queryKey; (#116) **historial abre instantáneo** (`keepPreviousData` + indicador sutil "actualizando"). **⚠️ TODO mañana:** decidir TZ negocio-fija vs TZ-por-tienda si abren en otra zona (#117). Setup local: backend con `.env.sqlitelocal`/SQLite o contra prod vía proxy; `.env` de prod intacto.)
>
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
| Backend API (Laravel) | ✅ En producción | revision **`tadaima-00089-7wm`** (2026-06-22: deploy de la rama UNIFICADA `develop` — todo el trabajo de prod 00083-00088 ya commiteado + los 26 commits de Ruben + fix de Traslados a nivel-bodega; env/secrets 22/22 preservadas, 155 tests backend OK, sin Docker local. Ver entrada 2026-06-22). Previa **`tadaima-00082-7nj`** (2026-06-16: deploy frontend-only — polling live 20s en Reportes + refactor preventa por fecha de pago en el Reporte; backend sin cambios desde 00081). Previa **`tadaima-00081-fxh`** (2026-06-15 QA: liquidaciones de preventa en el Reporte por FECHA DE PAGO —`/pre-sale-orders` con `payment_from`/`payment_to`— + RBAC cajero solo ve lo suyo en preventa —`mine=1`, `user_id`∥`payments.cashier_id`—; suite 134/134. Antes en esta sesión: rev `00078` restauró las env vars de Supabase en Cloud Run vía Secret Manager —`deploy.sh` tenía un bug de llave que las borraba—, `00079` logo del dashboard, `00080` dropdown del buscador de Caja). Previa **`tadaima-00077-qlh`** (2026-06-13: lote QA Ruben — SOLO frontend, backend sin cambios desde 00072: fix cache de tomos, calendarios react-aria en preventa/cortes, badges Solo Efectivo/Solo Tarjeta, cancelación de preventa determinística + ocultar cancelar en liquidadas). Previa **`tadaima-00072-6bk`** (2026-06-12: TODO el lote 06-10→06-12 deployado — Cortes en menú, capa optimista RQ, heartbeat, `local_date` en cortes, RBAC transfers alineado a UI de Ruben; backend 129/129). Previa `tadaima-00071-6lt` (2026-06-12: `volume_number` en payload light + fixes de invalidación de stock del frontend). Lote que incluyó: fix heartbeat `TouchLastSeen` (Cajeros conectados) + alta de tomos exige stock + precio Normal autollenado + chip sidebar + capa optimista RQ/polling 20s/validación clientes/ticket 2 líneas/Reporte fusionado (sesión 06-12 noche) **+ página Cortes en menú (`/cortes`, 3 roles) + historial Caja full-screen con buscador + fix IVA s/comisión (default 16) + Apartados con Venta/Resta/Costo/Utilidad + `cancelled_amount`/`cancelled_items` en SaleResource con −$X rojo simbólico en listas + tarjeta sin botón cancelar (sesión 06-12 madrugada — backend 118/118)**. Previa `tadaima-00070-bmp`/`00069` (2026-06-11, sesión QA preventas). Previa `tadaima-00067-68l` (2026-06-05, **sesión QA 2026-06-04/05**: caja por store_id, costo de librería derivado del margen, categorías/proveedores desde backend + category_id, corte del gerente con 5 tablas tipo Excel, fixes de impresión/historial de preventa). Previa `tadaima-00066-szd` (2026-06-03, **backfill de bodegas para tiendas legacy** vía migración idempotente + `backend/AGENTS.md` con referencia completa de endpoints para handoff). Previa `tadaima-00065-bwf` (2026-06-03, **alta de tienda auto-crea su warehouse `type='store'`**; `assignRole` sincroniza en vez de acumular; `/users/online` sin eager-load roto). Previa `tadaima-00063-gwt` (2026-06-03, expone `cost` admin-gated en preventas para utilidad real del corte). Previa `tadaima-00062-l6m` (2026-05-30, ADR-017 + guard de precios + fixes QA). **DB de prod RESETEADA a cero 2026-05-30** (solo admin Pier — fase de pruebas; respaldo previo en `backups/`). URL: tadaima-987277625193.us-central1.run.app. **`min-instances=1`** desde 2026-05-21 (~$8-10/mes, elimina cold starts de 5-37s). **ADR-015 (2026-05-22): cost_at_sale** — sale_items/pre_sale_order_items/layaways tienen columna `cost` snapped al INSERT. Reportes históricos inmutables aunque admin re-precie productos. **Cash session conflict (2026-05-25)**: `CashSessionConflictException` + `POST /cash/sessions/{id}/force-close` admin-only + `cash/registers` embed `active_session`. |
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
| 148 | Cancelaciones | **Ocultar cancelar en preventas liquidadas** — el botón de cancelar del historial solo sale en folios con anticipo pendiente (pending/ready); en delivered/cancelled se oculta (una liquidación ya no se puede cancelar). Deployado rev 00077 | 2026-06-13 |
| 147 | Cancelaciones | **Cancelación de preventa sin elección de modo** (`CancelTicketModal`) — liquidada → SOLO rollback (cancela la venta del día, mantiene el anticipo); solo anticipo → cancelación completa. Quitados los 2 `ModeButton` + componente muerto. Backend ya soportaba el modo (ADR-016). Deployado rev 00076 | 2026-06-13 |
| 146 | Caja/UX | **Badge de restricción de pago** (`PaymentRestrictionBadge` + `getPayRestriction`): Solo Efectivo (ámbar) / Solo Tarjeta (azul); pill grande bajo el SKU en el catálogo de Caja (antes no se mostraba) + carrito con "Solo Tarjeta" agregado. Deployado rev 00075 | 2026-06-13 |
| 145 | Cortes/UX | **DateRangePicker react-aria en Cortes** (`CortesModal` + `CashCutsPage`) reemplaza los `<input type=date>` nativos por el RangeCalendar (2 meses, estilo Ventas, popover a body). Deployado rev 00074 | 2026-06-13 |
| 144 | Preventa/UX | **SingleDatePicker react-aria en catálogo de preventa** — Calendar sin rango; el límite de retiro usa `minValue=llegada` (deshabilita días previos) y se habilita tras elegir la llegada. Deployado rev 00074 | 2026-06-13 |
| 143 | Caja/UX | **Historial del Día con max-height de viewport** (`useViewportMaxHeight`) — mide el top real vs `window.innerHeight` → scroll interno garantizado sin depender de la cadena flex. Deployado rev 00074 | 2026-06-13 |
| 142 | Perf/Data | **Fix cache de tomos no bajaba tras venta** — el tab Tomos lee `['mangas']`; `invalidateAfterSale` + el optimista ahora tocan ese cache (antes solo `['products']`/`['inventory']`). El backend sí descontaba. Deployado rev 00073 | 2026-06-13 |
| 141 | Reportes/Corte | **Tab "Reporte" (2ª pos) + sub-tabs fusionados** (Ventas = Efectivo\|Tarjeta y Preventas = Apartados\|Liquidaciones, 2 columnas títulos centrados) + **desglose por P. Unit** (producto+fecha+precio = filas separadas) + **Costo $0 + flag rojo "sin costo"** con contador en footer + paneles **altura fija** con Total anclado al fondo (parejo) + gate `canViewCost` + texto 14px + desc/acciones movidas abajo. Deployado rev 00072 (2026-06-12) | 2026-06-12 |
| 140 | Caja/Tickets/UX | **Ticket 2 líneas** (`cant × precio unit` + importe; antes "×2 $800" confundía) en impreso/reimpresión/preview + **fix crash `hasCashOnly`** (menú métodos de pago; ahora `itemAcceptsMethod` por opción) + iconos por método + terminal compacta ✓/⚠ + botón "Buscar terminales" + Ventas muestra "Tarjeta" (no "Tarjeta débito"). Deployado rev 00072 (2026-06-12) | 2026-06-12 |
| 139 | Clientes/Forms | **Validación inline tel/correo en alta de cliente ×3** (popup Caja, form preventa, modal Clientes): label rojo + borde + botón bloqueado; regex compartido `lib/validation.ts`. Deployado rev 00072 (2026-06-12) | 2026-06-12 |
| 138 | Perf/Data | **Polling casi-live 20s solo ventana activa + tab enfocada** (`refetchIntervalMs` opcional en hooks): Ventas admin/gerente, Productos/Tomos por tab, panel Folios, Caja solo con modal Catálogo/Preventas abierto. Indicadores solo con `isPlaceholderData` → polling invisible (la lista de Ventas se atenuaba/bloqueaba en cada fetch). Deployado rev 00072 (2026-06-12) | 2026-06-12 |
| 137 | Perf/Data | **Capa optimista post-checkout** (`lib/optimisticSale.ts`): venta/folio/liquidación/stock escritos directo al cache RQ tras el POST (visible al instante, refetch reconcilia) + **`invalidateAfterSale()` centralizada** (5 copias divergentes) + **fix: KPIs Dashboard nunca se invalidaban**. **Veredicto NO Redux** (latencia de red, no estado; 12–20 días de migración por nada). Deployado rev 00072 (2026-06-12) | 2026-06-12 |
| 134 | Dashboard/Presencia | **FIX CRÍTICO heartbeat `TouchLastSeen`** — Carbon 3 (diffs con signo) hacía que `last_seen_at` nunca se re-actualizara tras el primer write + el middleware corría antes de `auth:sanctum` (user null con bearer) → "Cajeros conectados" siempre vacío (verificado live contra prod). Toca después de `$next` + dedupe con `$previous->diffInSeconds($now)`. `TouchLastSeenTest` (2). Deployado rev 00072 (2026-06-12) | 2026-06-12 |
| 133 | Librería/UX | **Alta de Tomos exige stock** (cada tomo pendiente cantidad>0 en ≥1 tienda; paso "Stock" en checklist) + **Precio Normal se autollena con Precio Público** (sync hasta edición manual). Deployado rev 00072 (2026-06-12) | 2026-06-12 |
| 132 | Sidebar/UX | **Chip #tienda + iniciales + rol bajo el logo** (Cajero azul/Gerente ámbar/Admin rojo; tooltip = nombre completo) para QA multi-ventana + **fix menú del avatar tapado** por las secciones z-10 del Dashboard (aside z-10→z-20). Deployado rev 00072 (2026-06-12) | 2026-06-12 |
| 131 | Caja/Inventario | **Stock que no refrescaba al vender/cancelar/devolver** — devolución en Lista de Ventas solo invalidaba `sales`; ningún flujo invalidaba `['inventory']` (Existencias). Invalidaciones en checkout×3 + CancelTicketModal + handleReturn, polling 30s en desglose por tienda, staleTime catálogos 24h→5min (cross-máquina). Deployado rev 00071 | 2026-06-11 |
| 130 | Librería/Caja | **Pill "Tomo N"** en catálogo de Caja, búsqueda y Existencias (`volume_number` en `ProductLightResource`, `ProductLightVolumeTest`) + **cards sin foto compactos** (`CardMedia`) + **tab Productos ya no muestra mangas** (salían duplicados). Deployado rev 00071 | 2026-06-11 |
| 128 | Reportes/Corte gerente | **"Reporte del Día" rediseñado como corte detallado tipo Excel** — Joel: el gerente trabaja por PRODUCTO, no por ticket. Se quitó el resumen ejecutivo (KPIs/método/top/cajeros/cancelaciones) del tab y se reemplazó por **5 tablas simples agrupadas por producto con sub-tabs**, espejo del Excel de corte real: (1) Ventas normales efectivo/transfer, (2) Ventas con tarjeta, (3) Abonos preventa, (4) Preventa liquidación, (5) Preventa vencidas. Columnas Producto·Cantidad·Venta·Costo·Utilidad (Costo/Utilidad admin-only) + fila Total. Export **Excel/PDF/Imprimir** regenerados para emitir las 5 tablas tal cual. Visible admin+gerente (`canSeeFinancials`). Query de preventas ampliada a `pending,ready,delivered,expired` para alimentar tablas 4/5 (filteredPreSales re-filtra a pending/ready, no afecta otras vistas). Decisiones: venta→tarjeta si algún pago es tarjeta; abono repartido proporcional a venta del item; preventa usa `catalog.product_name` + `subtotal`. **Pendiente deploy** | 2026-06-04 |
| 127 | Reportes/Perf-UX | **Carga de Reportes: skeleton + staleTime + indicador sutil** — antes mostraba spinner centrado en CADA `isFetching` (parpadeaba aun con cache). Nuevo `ReportsSkeleton` (KPIs + bloque) que sale SOLO cuando no hay datos (1ª carga / cambio de filtro o tab); el refetch de fondo con datos en pantalla muestra "Actualizando…" en el botón sin tapar el contenido. `staleTime: 30s` en las 6 queries (ventas/inventario/productos/clientes/cortes) → revisitar tab dentro de 30s es instantáneo. **Pendiente deploy** | 2026-06-04 |
| 126 | Preventas/Perf-UX | **Carga de Preventas: skeleton + keepPreviousData** (mismo patrón que Productos #123) — los 4 paneles (Folios, Disponibles, Catálogos, Vencidos) mostraban spinner "Cargando…" en la 1ª carga. Nuevo `PreSalesSkeleton` (variantes `cards`/`rows`) reemplaza el spinner; `placeholderData: keepPreviousData` en `usePreSaleOrdersQuery`/`usePreSaleCatalogsQuery` → cambiar filtro/página/tienda no parpadea. Recargas siguientes ya eran instantáneas (cache 24h catálogos / 5min folios + IndexedDB). **Pendiente deploy** | 2026-06-04 |
| 124 | Ventas/Reportes/TZ | **Filtros de fecha de Ventas y Reportes anclados a zona del negocio** — Joel: "Ventas no cargó nada (eran las 11:50) y ni '7 días' trae la venta". Causa: `SalesPage` tenía su propio `localDateISO` con `new Date()` del DISPOSITIVO (Tijuana UTC-7 = 4-jun) en vez del helper de negocio; la venta del 5-jun (hora MX) quedaba en el FUTURO del rango (que terminaba "ayer") → ni "hoy" ni "7 días" la traían. Fix: `SalesPage` (presets today/week/month + activePreset) y `ReportsPage` (firstOfMonth + presets ayer/7/30/mes pasado/año) ahora usan `getTodayLocal`/`daysAgoLocal`/`toLocalYmd` (zona `America/Mexico_City`). Verificado: la venta del 5-jun aparece en "Hoy" y "7 días". Cierra el resto del riesgo de #115. **Pendiente deploy** | 2026-06-04 |
| 125 | Reportes/Dashboard/TZ | **Display y agrupación de fechas en zona del negocio** — además del filtro (#124), ReportsPage (a) agrupaba ventas por día con `.split("T")[0]` = fecha UTC → ventas de madrugada MX caían en el día equivocado del gráfico; ahora agrupa con `toLocalYmd` (MX). (b) `fmtDate`/`fmtTime`/tickets del día/sesiones renderizaban en zona del DISPOSITIVO; ahora con `timeZone: BUSINESS_TZ`. Mismo fix de display aplicado a `SalesPage` (`fmtDateTime`) y `DashboardPage` (timeAgo, "Abrió caja HH:MM", sesiones). `BUSINESS_TZ` ahora exportado de `lib/date.ts`. **Pendiente deploy** | 2026-06-04 |
| 123 | Productos/Perf-UX | **Carga de Productos: skeleton + prefetch de librerías** — la 1ª carga (sin cache) tapaba toda la página con un spinner full-screen "Cargando catálogo…" (lento contra el proxy de prod). Fix: (a) `ProductsSkeleton` que imita la estructura (toolbar/buscador/grid o tabla) → sensación de carga progresiva; (b) `placeholderData: keepPreviousData` en `useProductsQuery`/`useMangasQuery` → cambiar de tienda no parpadea; (c) **prefetch de tomos en background** (`enabled: tab==='tomos' || productsQuery.isSuccess`) → al dar clic en "Tomos" ya están en cache. Recargas siguientes ya eran instantáneas (cache 24h + IndexedDB). **Pendiente deploy** | 2026-06-04 |
| 122 | Productos/Catálogo | **Categorías y proveedores desde el backend (no hardcodeados)** — QA #2/#3: aparecían categorías ("Funko Pop, Naruto, Dragon Ball…") y proveedores ("Funko Corp, Panini…") que nadie creó, y una categoría nueva ("Pokemon TCG") no aparecía. Causa: `ProductsPage` tenía las listas HARDCODEADAS en `useState` y **nunca mandaba `category_id`** al guardar. Fix: `useQuery` a `/categories` + `/suppliers`, mapa nombre→id, `createCategory`/`createSupplier` al agregar (con invalidación), y `handleSaveProduct` ahora manda `category_id` en create+update. Proveedor queda cosmético (productos no tienen `supplier_id` en backend). Verificado: `/categories` ya devuelve "Pokemon TCG", `/suppliers` vacío. **Pendiente deploy** | 2026-06-04 |
| 121 | Productos/Precios | **Precios D y E en alta/edición de producto** — QA #4: faltaban 2 niveles de precio. El backend ya soporta `price_1..5`; el form solo exponía A/B/C. Agregados inputs Precio D/E + se mandan `price_4`/`price_5` en create+update + se muestran en el detalle. **Pendiente deploy** | 2026-06-04 |
| 119 | Librería/Costo | **Costo real de librería se guarda (derivado del margen)** — QA: al registrar/editar un tomo el costo quedaba NULL. Causa: el front manda `public_price`+`profit_margin_percent` pero `MangaController` guardaba `cost = data['cost'] ?? null` (nunca llega `cost`). El diseño original (migración `2026_04_09_000013`) ya calculaba `cost = public_price × (1−margen/100)` en backend; se perdió en la unificación a `products`. Fix: helper `MangaController::resolveCost` deriva y persiste el costo en store + update. Ahora lo leen caja, reportes de utilidad y el snapshot ADR-015. 2 tests `MangaCostTest` (store + recálculo en update). 76/76 PHPUnit. **Pendiente deploy** | 2026-06-04 |
| 118 | Productos/Librería | **Generador de código (sin lector) en alta de producto y tomos** — QA #5: el "auto generador de código" del producto normal no servía (usaba `mockSku` sin `type="button"` → podía submitear el form) y en librerías el icono de scan solo hacía `focus` (no generaba nada). Fix: helper compartido `lib/barcode.ts` (`generateBarcode` → 13 dígitos, prefijo interno "200"), botón con `type="button"` en SKU de producto + iconos de scan de `MangaBatchModal`/`MangaEditModal` ahora generan código. Útil para test sin scanner físico. **Pendiente deploy** | 2026-06-04 |
| 116 | Caja UX/Perf | **Historial del día abre instantáneo** — `useTodayHistorialQuery` con `placeholderData: keepPreviousData` (no blankea al cambiar de tienda/día) + spinner grande solo en primera carga sin cache; refresco en background se muestra como indicador sutil "actualizando" en el header (no tapa la lista). Pedido de Joel: "que quede en memoria y nomás cuando se actualice se vea un loading abajo". **Pendiente deploy** | 2026-06-04 |
| 115 | Fechas/TZ | **"Hoy" anclado a la zona del NEGOCIO (`America/Mexico_City`)** — `lib/date.ts` (`getTodayLocal`/`toLocalYmd`/`daysAgoLocal`) ahora calcula el día en la TZ del negocio vía `Intl.DateTimeFormat`, NO la del dispositivo. Antes usaba la TZ del navegador → un equipo en otra zona (Mac de Joel en Tijuana UTC-7 vs backend MX UTC-6) pedía el día anterior y una venta hecha pasada la medianoche MX "desaparecía" del historial. Ahora frontend y backend (`App\Support\DateRange`) siempre coinciden. **Pendiente deploy. ⚠️ Ver TODO de TZ en backlog** | 2026-06-04 |
| 114 | Caja/Historial | **Historial no mostraba ventas recién hechas (queryKey sin fecha)** — la key `['historial','today',storeId]` no incluía el día → al cruzar medianoche el cache persistido (IndexedDB) del día anterior enmascaraba el nuevo. Ahora la fecha local va en la key (`useTodayLocal`, reactivo a medianoche) → refetch fresco al cambiar de día. **Pendiente deploy** | 2026-06-04 |
| 113 | Caja/UI | **Crash "Clock is not defined" al abrir caja** — el botón "Cortes" (toolbar de Caja) usaba `<Clock>` de lucide sin importarlo → `ReferenceError` tumbaba todo el render de Caja. Agregado al import. **Hallazgo de fondo:** el typecheck del landing (`tsc --noEmit`) NO chequea nada porque el `tsconfig.json` solo tiene `references`; el comando correcto es `tsc -b`. Por eso un icono sin importar llegó a "prod". **Pendiente deploy** | 2026-06-04 |
| 112 | Caja | **Admin (y todos) no podían abrir caja — deadlock huevo-gallina** — tras el reset de prod no hay `cash_registers`, y las tiendas creadas por UI solo crean su warehouse (no caja). El frontend exigía elegir una caja pre-existente del dropdown → si la tienda no tenía caja, no se podía abrir. Fix: **abrir por `store_id`** (la UI siempre lo conoce) y el backend crea la caja personal `"{usuario}·{tienda}"` al vuelo (ADR-017, `firstOrCreate`). `register_id` queda como atajo opcional. Backend: `CashRegisterService::open(?registerId, cash, userId, ?storeId)` + `OpenCashSessionRequest` (`required_without`) + controller. Frontend: `openSession({storeId, registerId}, monto)`. +2 tests en `CashSessionConcurrencyTest` (abrir sin caja previa + validación). 76/76 PHPUnit. **Pendiente deploy** | 2026-06-04 |
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
| 135 | Caja/Cortes | **⏳ PENDIENTE (Joel 2026-06-11) — corte final debe SUMAR los retiros de caja al total de efectivo** | En la operación real el cajero hace **retiros de caja** (salidas) durante el día para no acumular efectivo en el cajón. Hoy el corte compara `esperado = apertura + ventas efectivo + entradas − salidas` contra lo declarado en el cajón — correcto para cuadrar el CAJÓN, pero el **corte final del día** debe además mostrar el **total de efectivo que ENTRÓ** (cajón declarado + retiros sumados de vuelta) para que "lo que fue el corte de efectivo" dé bien: `efectivo del día = declarado al cierre + retiros del turno`. Falta: línea "Retiros del turno" + "Efectivo total del día" en `CashCloseSummaryModal`, impresión 58mm del corte y Reporte del Día (sección D). Distinguir retiros (type `salida` con motivo retiro) de otras salidas (gastos) si se quiere granularidad. |
| 117 | Fechas/TZ | **TZ por tienda — fase 2 (opcional)** | 2026-06-11: Joel decidió y se aplicó **negocio anclado a `America/Tijuana`** (frontend `lib/date.ts` BUSINESS_TZ + backend `DateRange`/`config/app.business_timezone`, env `BUSINESS_TIMEZONE`). Queda como fase 2 OPCIONAL: TZ por tienda (`stores.timezone`) solo si algún día abren sucursal en otra zona horaria. |
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

Hay **dos** seeders, para dos propósitos distintos:

### PROD — `PierFreshSeeder` (estado real de producción)

Estado actual de prod tras la **limpieza para handoff al cliente (2026-06-24)**.
Comando: `php artisan db:seed --class=PierFreshSeeder --force` (sobre BD truncada).

| Entidad | Valor |
|---------|-------|
| Empresa | Tadaima (id 1) |
| Roles | admin, gerente, cajero (guard `api`) |
| Métodos de pago | Efectivo, Tarjeta Débito, Tarjeta Crédito, Transferencia |
| **Admin** | **Pier — `pier@tadaima.mx` / `Tadaima2026`** (store_id null, can_view_cost true) |

**No hay** (lo crea el cliente desde la UI): tiendas, terminales, bodegas, usuarios
extra, productos, inventario, clientes, cajas, ventas, preventas, traslados.
El admin entra → crea tienda (auto-genera Exhibición + Bodega) → terminales → usuarios.

### DEV — `DatabaseSeeder` (demo local, NO usar en prod)

Comando: `php artisan migrate:fresh --seed`. Siembra 2 tiendas (Centro/Macroplaza),
admin + 2 gerentes (`*@tadaima.mx` / `devaccess`), 1 caja + 1 terminal (3.5%) por
tienda, métodos de pago por tienda y warehouses Exhibición/Bodega. Solo para
desarrollo local con datos de ejemplo. **No** incluye productos ni ventas.

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

### Sesión 2026-07-15 — UI/UX POS (4 frentes) — DEPLOYADO rev tadaima-00116-848

Rediseño pedido por Joel + Ruben. Deploy único `gcloud run deploy` (Cloud Build); bundle vivo `index-BrI9vR-c.js` verificado (markers "Colapsar menú", "Piso", "cortesía"×2, "tadaima-nav-collapsed"). `vite build` OK, `vitest` 73/73. Ticket 58mm bold (rev previa, sin deploy) viajó también en este deploy.

- **(1) Menú lateral (`Layout.tsx`):** rail de 76px → sidebar ancha (216px) con etiquetas y grupos colapsables. Agrupación de Ruben: **Ventas** ⊃ Historial/Cortes/Reportes · **Inventario** ⊃ Existencias/Traslados; Productos/Insumos/Clientes/Preventas sueltos; Inicio + Caja (CTA rojo) arriba. El grupo con la ruta activa se auto-expande; estado de grupos + colapso del rail persistidos en localStorage; botón para colapsar a icon-rail (recupera espacio en Caja). Gating por rol intacto (grupo con 1 hijo → link directo). Un solo menú para Dashboard y POS.
- **(2) Editar Producto → Inventario (`ProductsPage.tsx`):** lista plana mezclada → **una tarjeta por tienda con columnas Piso | Bodega** conectadas (cada una su input de uds), patrón QuickStock; central/sin-tienda en "Otros almacenes". Admin ve todas; gerente/cajero solo la suya. Se quitó el select "agregar ubicación" (slots directos). `locations` gana `storeId`. Mismo guardado (`updateInventory` por almacén).
- **(3) Caja responsiva (`SellPage.tsx` + `hooks/useMediaQuery.ts`):** bajo 768px el panel se ocultaba entero (`hidden md:flex`) → ahora **hoja completa** que abre desde una **barra inferior fija** con TOTAL + COBRAR SIEMPRE visibles. Ancho md fluido (360→460).
- **(4) Hardening Total $0 (`SellPage.tsx`):** confirmación **"¿Cobrar $0?"** cuando un descuento deja el total en $0 con subtotal>0 (evita $0 accidental por descuento atorado en localStorage; la foto del bug era caché PWA del build viejo con "PROMO" global ya retirado). Clamp ≥0 en la rama de preventa cargada. QA en prod pendiente de Joel (menú, inventario, caja angosta, preventa+descuento; hard-refresh por caché PWA).

### Sesión 2026-07-15 — Productos sin Costo (captura rápida) — DEPLOYADO rev tadaima-00115-l4f · + Ticket 58mm en BOLD (local, sin deploy)

**Productos sin Costo (deployado):** botón con contador en la barra de Productos — rojo con N cuando faltan, apagado/deshabilitado en 0 — que abre un modal-tabla grande (`MissingCostModal.tsx`) para capturar el **costo real** rápido, sin abrir el editor completo del producto. Solo visible para quien ve costos (admin siempre, o flag `can_view_cost`); editar gateado a admin/gerente (igual que el backend). Cada fila guarda solo `{cost}` vía `PUT /products/{id}` (name es `sometimes` → no toca precios ni nada más), optimista + invalida el cache → la fila se pone verde, baja el contador "faltan X" y sale de la lista. Reemplaza el viejo filtro in-grid `showNoCost`. **Sin cambios de backend.** Bundle vivo `index-RcI7CXPq.js` verificado ("Productos sin Costo"×2 + testid `missing-cost-modal`). `vite build` ✅.

**Ticket 58mm en BOLD (aplicado local, NO deployado por instrucción de Joel):** `font-weight:700` en el `body{}` de los 3 puntos de impresión (`doPrintTicket`/SellPage, `printTicket`/SalesPage, `buildPrintHtml`/CashCloseSummaryModal) → todo el texto sale en negrita en la térmica; título y totales en `900` siguen como el peso más fuerte (jerarquía intacta). Colores ya en `#000` (los grises restantes eran de la barra de pantalla `.no-print`, oculta al imprimir). Viaja en el próximo deploy. Ver [[project_ticket_print]].

### Sesión 2026-07-15 — Descuentos v2 FASE 3: PROMOCIONES NxM por producto (2x1, 3x2…) — DEPLOYADO rev tadaima-00114-ntt

**Promos "compra N, paga M" pegadas al producto, aplicadas SOLAS en caja.** El motor ya existía en `saleCalc.ts` desde la Fase 0 — esta fase lo activó end-to-end.

**Backend:**
- Migración `2026_07_15_000002`: `product_promotions` (product_id, name, buy_n/pay_m, starts_at/ends_at, status active|paused|expired, priority). Índice (product_id, status, ends_at).
- `ProductPromotion` con scope `currentlyActive()` (vigencia lazy en SQL, sin cron); listado admin marca `expired` honesto (write-behind).
- CRUD anidado `products/{product}/promotions` (mutar = admin/gerente vía adminOrManagerGate; listar = todos). Validación `pay_m < buy_n`.
- `SaleCalculator::bestPromoBenefit` (espejo exacto de saleCalc.ts): groups=floor(Q/N), gratis=groups×(N−M), mejor-para-cliente gana (ahorro > priority > id), POR LÍNEA. CheckoutService carga las vigentes de los productos del carrito y recomputa — `applied_promotion_id` del cliente jamás se lee. Snapshot promo_name/promo_free_qty en sale_items (ADR-015: borrar la promo no toca tickets).
- `active_promotions` embebido en el payload de productos (light + full, eager-load) — cero round-trips extra en Caja.
- Tests: `PromotionCheckoutTest` 6 (2x1 con snapshot, mejor gana, no-stacking manual>promo, pausada/vencida/futura no aplican, Q<N full, pago con promo inexistente → 422) + `PromotionCrudTest` 7 (validación, RBAC, pause/resume, expiración lazy, 404 cross-product, **TZ negocio**). Suite **244/244**.

**Frontend:**
- 4ª tab **"Promos"** en el editor de producto (`ProductPromotionsTab.tsx`): alta nombre/N×M/vigencia/prioridad + pausar/reanudar + eliminar; aviso "guarda el producto primero" en alta nueva.
- Caja: badge VERDE automático en la línea ("2x1 Verano · 1 gratis −$100"), neto con bruto tachado; el badge aparece/desaparece solo al cambiar cantidades. Los 3 snapshots de ticket generalizados (etiqueta "Promo X" además de "Desc. motivo").
- El motor del carrito recibe las promos del payload de productos (`recalculateSale({promotions})`).

**Review (code-reviewer) — 1 HIGH corregido antes del deploy:** las fechas de vigencia se guardaban en UTC crudo → una promo "vence el 20" moría a las ~5pm de Tijuana. Fix: `vigencyDates()` en el controller ancla fechas planas al día completo en la TZ del negocio vía `DateRange` (mismo patrón de cortes, TODO #117), display en la tab convierte de vuelta con BUSINESS_TZ, y test de regresión con Carbon::setTestNow (22:00 Tijuana del último día = viva; 00:30 del siguiente = muerta). + MEDIUM: 422 de total desincronizado (promo vencida con cache fresco) ahora refresca productos y avisa claro al cajero en vez del error críptico.

**Verificación:** phpunit 244/244 · vitest 73/73 · vite build ✅ · Playwright `promotions.spec.ts` 3/3 (API snapshot, pausada→422/full ok, UI badge verde + total) + insumos 3/3 + line-discounts 4/4 + suite general 27 passed / 0 failed.

### Sesión 2026-07-15 — Descuentos v2 FASE 2: módulo INSUMOS ligado a caja + fix Historial — DEPLOYADO rev tadaima-00113-k7r

**Módulo Insumos completo** (compras de operación pagadas con efectivo de la caja) + fix del Historial del Día que pidió Joel (las líneas con descuento salían en bruto).

**Backend:**
- Migración `2026_07_15_000001`: `supplies` (catálogo por empresa: name/category/unit/is_active) + `supply_movements` (type purchase|consumption|adjustment, quantity, amount, note, register_session_id, **cash_movement_id** linkeado, user_id).
- `SupplyService::registerPurchase`: transacción única → valida caja abierta del usuario (422 si no) → crea `cash_movements salida "Insumo: X"` → crea supply_movement linkeado (patrón ADR-016). **Clave:** el corte ya resta TODAS las salidas en expected_cash → la compra se auto-balancea; el bloque de insumos en reportes es informativo, jamás se re-resta.
- `SuppliesController`: catálogo (CRUD admin/gerente vía adminOrManagerGate; listar todos), compras (cualquier user con caja abierta), movimientos (cajero solo los suyos), `GET /reports/supplies?from&to` (gasto por categoría + top insumos).
- `ReportsController`: `total_supplies`/`supplies_count` por sesión en `/reports/cash` + summary; `supply_purchases[]` en el detail del corte.
- Tests: `SupplyPurchaseCashLinkTest` (7: salida linkeada misma tx, atómico, sin caja→422, expected_cash refleja, consumo no toca caja, RBAC, amount>0) + `SupplyReportRangeTest` (2). Suite **231/231**.

**Frontend:**
- Página **Insumos** (`/insumos`, nav para admin/gerente/cajero): tab Registrar compra (insumo + qty + efectivo + nota, aviso si no hay caja abierta, compras recientes) · tab Catálogo (CRUD con modal, admin/gerente) · tab Reporte (rango, por categoría + top).
- `CashCloseSummaryModal`: fila "· De salidas, insumos (N)" en el resumen + bloque "Insumos del día" en el desglose + ambas en la impresión 58mm.
- `packages/api/src/supplies.ts` + hooks `useSupplies` + queryKeys + PageKey/nav/ruta.
- **Fix Historial del Día** (pedido de Joel tras probar Fase 1 en prod): las filas de items ahora muestran bruto tachado + badge "Desc. Dañado −$X" + neto; el chip "Descuento" del footer leía `sale.discount_amount` (campo inexistente) → `sale.discount` (nunca se había mostrado).

**Review (code-reviewer): 0 CRITICAL/HIGH.** Fixes aplicados: (1) invalidación con key real `queryKeys.reports.cash()` + `cash-session-detail` (el `["cash"]` a secas no prefixea `['reports','cash']` → Cortes quedaba stale 30s); (2) `esc()` en TODO el HTML del corte impreso (nombres de insumo/item/descripciones — document.write no escapa). OJO aprendido: `noopener` en `window.open` devuelve null y ROMPE la impresión — no usarlo; la defensa es el escape.

**Verificación:** phpunit 231/231 · vitest 73/73 · vite build ✅ · Playwright: `insumos.spec.ts` 3/3 (salida linkeada + expected_cash baja $80, sin caja 422, flujo UI completo) + `line-discounts.spec.ts` 4/4 + suite 27 passed / 0 failed.

### Sesión 2026-07-14/15 — Descuentos v2 FASE 1: descuento POR LÍNEA end-to-end + eliminado el descuento global — DEPLOYADO rev tadaima-00112-mkl

**El reemplazo completo del "Promo" global buggy.** El cajero ahora descuenta N de M unidades de una línea (ej. 2 de 3 dañadas): si N < M la línea se PARTE en unidades a precio completo + unidades descontadas; quitar el descuento re-fusiona. Caso del cliente validado end-to-end: 3 uds $100, 2 dañadas −$20 c/u = **$260** (test API + test UI Playwright).

**Backend (el server ya NO confía en montos del cliente):**
- Migración `2026_07_14_000001`: 11 columnas de beneficio en `sale_items` (benefit_type, discount_kind/basis/value/**amount**/reason/note/authorized_by + applied_promotion_id/promo_name/promo_free_qty para Fase 3). `sale_items.total` sigue BRUTO; `sales.discount` = rollup Σ beneficios → el invariante `total = subtotal − discount` sobrevive en TODOS los reportes.
- `SaleCalculator.php` (gemelo de saleCalc.ts): recomputa cada beneficio server-side. Payload v2 = `calc_version: 2` + `items[].line_discount {kind,basis,value,reason,note}` — **nunca viaja un monto**. Pago que no cuadra con el recompute → 422.
- `CheckoutRequest`: v2 prohíbe el `discount` global (`in:0`) y `calc_version` sin items (`prohibited`); percent > 100 → 422. Path legacy intacto (ventana de compat para PWA cacheado, se retira en Fase 5).
- Zip posicional items→draft_items→sale_items con `orderBy(id)` + guard de conteo. `discount_authorized_by` = user del token, nunca del payload.
- Tests: `LineDiscountCheckoutTest` 8/8 (split persiste, server pisa montos manipulados, legacy vivo, clamp, resource). Suite completa **222/222**.

**Frontend:**
- ELIMINADO: modal Promo, botón Promo, `Mesa.discount`, applyPromoPct/Final/clearPromo. `promo.ts` queda congelado solo para reimprimir tickets históricos (`discountPct`).
- `LineDiscountModal` (componente nuevo en components/sell/): unidades a descontar (menos que la línea → aviso de split), $/% × por unidad/por línea, motivos (Dañado/Caducidad/Exhibición/Cortesía/Otro) + nota, preview en vivo con el MISMO cálculo del cobro.
- SellPage: `applyLineDiscount` (split) / `removeLineDiscount` (merge-back, prefiere línea padre); botón "Desc." + badge rojo con motivo en cada línea; neto con tachado del bruto; merge de addToCart solo en líneas "planas"; stock guard suma todas las líneas del producto.
- Los TRES checkout builders mandan v2 (arregla de paso el gap: los flujos mixtos de preventa nunca enviaban el descuento).
- Tickets (SellPage + SalesPage): sub-línea por beneficio ("Desc. Dañado −$40", negro puro 58mm), totales Subtotal/Descuentos/TOTAL; ventas viejas conservan el render "Promo (X%)". `esc()` nuevo escapa nombres/etiquetas en el HTML del ticket.

**Reviews (security + code, hallazgos corregidos antes del commit):**
- security: cero CRITICAL. Fix M1: `discount` bajo v2 era `max:0` → `in:0` (un negativo inflaba el total y rompía el invariante); `calc_version` prohibido sin items. Fix M2: escape HTML en tickets (promo_name de Fase 3 iba a ser sink XSS). H1 conocido: path legacy sigue confiando en `discount` hasta Fase 5 (aceptado, roadmap).
- code: fix HIGH — los tickets de los 2 flujos mixtos mostraban el BRUTO (sin restar descuentos de línea) aunque el cobro era correcto; ahora usan el neto + sub-líneas de descuento. + LOWs: key en modal, merge-back prefiere parentLineId, comment stale.

**Verificación:** phpunit 222/222 · vitest 73/73 · vite build ✅ · Playwright: `line-discounts.spec.ts` 4/4 (LD-01 API split $260, LD-02 monto manipulado 422, LD-03 legacy+v2 422, LD-04 UI completo) + suite general 29 passed / 0 failed.

**Fix de entorno e2e:** `landing/.env.local` apuntaba a :8002 (override muerto de otra sesión) → :8000. Esto desbloqueó los tests de UI que antes ni corrían (TC-54..70). Backend local para e2e: `php -S` desde `public/` con el router de Laravel (`vendor/laravel/framework/.../server.php`) — artisan serve no propaga env vars al hijo.

### Sesión 2026-07-14 — Descuentos v2 FASE 0: lineId + recalculateSale (fundación, cero cambio visible) — DEPLOYADO rev tadaima-00111-vb4

**Contexto:** arranca el proyecto Descuentos v2 (spec del cliente): eliminar el descuento global de mesa (buggy: estado mutable que sobrevive cambios del carrito) y reemplazarlo por descuentos por línea + promos NxM + cupones + módulo Insumos. Plan de 6 fases en `~/.claude/plans/ok-si-lo-ocupamos-structured-feigenbaum.md`; directo en main, deploy por fase.

**Fase 0 (esta sesión) — solo frontend, paridad exacta de comportamiento:**
- **`landing/src/lib/saleCalc.ts` (NUEVO):** calculadora PURA de totales (`recalculateSale`) — el total es siempre función del estado actual de líneas, nunca acarreo. Incluye ya el motor completo de fases futuras: descuento manual por línea (fixed/percent × unit/line, clamp ≥0), motor promo NxM (`floor(Q/N)×(N−M)`, mejor-para-cliente, por línea), cupón (solo líneas sin beneficio, min_purchase/max_discount/scope), no-stacking estructural. Redondeo único a nivel line-net. 25 tests en `saleCalc.test.ts` (incluye el caso del cliente: 3 uds, 2 dañadas −$20 = $260). El gemelo server (`SaleCalculator.php`) llega en Fase 1.
- **`CartItem.lineId`:** identidad estable de LÍNEA (crypto.randomUUID) — prerequisito del split de líneas de Fase 1. Asignado en los 4 puntos de creación (addToCart, addScanToCart, toCartItem de liquidación, addCatalogToCart); mutadores tier-1 (`changeQty/removeFromCart/changeLevel/toggleDamaged/setDamagedPrice`) re-keyed de product.id → lineId (7 call sites + React key del carrito).
- **Persistencia:** `cartDraftStore` bump a version 1 con `migrate` que asigna lineId a carritos guardados pre-deploy; hidratación defensiva también en SellPage.
- **SellPage totales:** `useMemo(recalculateSale)` reemplaza el math incremental; `activeMesa.discount` entra como `legacyGlobalDiscount` (passthrough temporal, muere en Fase 1).

**Review (code-reviewer) — 1 HIGH corregido antes de commit:** en liquidación de folio los precios ratio-scaled tienen decimales repetidos; el redondeo por línea podía mostrar/gatear $99.99 mientras el pago real postea order.balance=$100. Fix: la rama `loadedPreSaleOrderId` de `currentPayAmount` suma RAW (paridad exacta con math previo). También: `setDamagedPrice` ahora clampa a 2 decimales (input permitía 33.335 → desync amount vs items[].price).

**Verificación:** vitest 73/73 ✅ · vite build ✅ · tsc 452 vs baseline 449 (los +3 son usos nuevos del patrón `activeMesa` pre-existente, misma clase TS18048, no regresión) · Playwright e2e completo contra SQLite local: **17 passed / 15 did-not-run / 3 skipped = idéntico al baseline** (comparado con stash) ✅.

**Nota entorno local:** `php artisan serve --env=sqlitelocal` NO propaga el env al server hijo (relee `.env` = MySQL). Workaround que sí funciona: `DB_CONNECTION=sqlite DB_DATABASE=.../local.sqlite php -S 127.0.0.1:8000 -t public`. El e2e espera admin password `password` (el seeder siembra `devaccess` — ajustar con tinker).

**Siguiente:** Fase 1 — migración M1 (ALTER sale_items), SaleCalculator.php, CheckoutService v2 (server recomputa, deja de confiar en el monto del cliente), LineDiscountModal con auto-split, y ELIMINAR el modal Promo + mesa.discount.

### Sesión 2026-06-24 — QA previa + LIMPIEZA DE BD para handoff al cliente (admin Pier, prod a cero)

**Contexto:** Joel pidió dejar la BD de prod lista para entregar al cliente: limpiar todos los datos de QA y dejar solo un usuario admin, para que el cliente cree tienda → terminales → usuarios desde cero. Antes de limpiar, una última QA "a ver si no truena algo" con BD vacía. Proxy Cloud SQL ya abierto por Joel.

**1. QA previa (sin tocar datos) — todo verde:**

| Verificación | Resultado |
|---|---|
| Suite backend completa (`php artisan test`) | **158 tests / 530 assertions, 0 fallos** |
| Alta de tienda con BD vacía | `StoreController::store` auto-crea **2 warehouses** (Exhibición `store` + Bodega `bodega`) en una transacción ✅ |
| Checkout sin `store_payment_methods` | Valida contra catálogo **GLOBAL** (`PaymentMethod::whereIn`), NO por tienda. Prueba: prod tenía `store_payment_methods=0` + **99 ventas exitosas** ✅ |
| Front métodos de pago | `usePaymentMethodsQuery` → `GET /payment-methods` (global) — independiente de tienda ✅ |
| Abrir caja con BD vacía | `CashRegisterService::open` hace `CashRegister::firstOrCreate(store_id+owner_user_id)` → **auto-crea la caja por usuario** (ADR-017), no requiere caja pre-sembrada. Solo necesita `store_id` ✅ |
| Estado vacío (sin tiendas) | Guards defensivos en `StoreContext`/`SellPage`/`StoresPage` ✅ |

**Conclusión QA:** limpiar la data NO rompe nada. El flujo admin→tienda→terminal→usuario→cajero-vende es sólido con BD a cero.

**2. Limpieza ejecutada (data en prod, sin código ni deploy):**

| Paso | Detalle |
|---|---|
| Backup | `mysqldump --single-transaction --no-tablespaces --set-gtid-purged=OFF` → `backups/tadaima_prod_PRE-CLEAN_2026-06-24_104056.sql` (220K, 60 tablas + datos, exit 0, marcador de cierre OK). |
| Truncate | Generado desde `information_schema`: `TRUNCATE` de **las 60 tablas excepto `migrations`**, con `SET FOREIGN_KEY_CHECKS=0/1`. Se **preserva el esquema deployado** (NO `migrate:fresh` → cero riesgo de re-correr 98 migraciones contra prod). |
| Reseed | `php artisan db:seed --class=PierFreshSeeder --force` (`.env` apunta a prod vía proxy). Crea: 1 empresa, 3 roles, 4 métodos de pago, **1 admin Pier** `<pier@tadaima.mx / Tadaima2026>`. |

**Datos que se borraron** (eran de QA, fase de pruebas): 5 tiendas, 16 usuarios, 99 ventas + 122 items + 99 pagos, 29 productos, 46 inventario + 227 movimientos, 45 folios de preventa + 7 catálogos, 13 cajas + 34 sesiones, 6 clientes, 3 traslados, 80 logs, 64 tokens, etc. Todo respaldado en el dump.

**3. Verificación post-limpieza:**
- Estado prístino: `companies=1, roles=3, payment_methods=4, users=1, model_has_roles=1, migrations=98`; **todo lo transaccional = 0** (stores/terminals/warehouses/products/sales/payments/customers/inventory/cash_registers/sessions/pre_sale_orders/transfers/tokens/system_logs/system_settings).
- **Login real contra prod:** `POST https://tadaima.poslite.com.mx/api/v1/auth/login` con Pier → **HTTP 200, `success:true`, `roles:['admin']`, token emitido**. (El 502 inicial fue cold start de Cloud Run; resolvió al reintentar.)
- Tokens/sesiones de las pruebas de login limpiados → 0 sesiones activas (cliente entra fresco).

**Notas:**
- `system_settings` quedó vacío (antes solo tenía `price_permissions` stale del admin viejo). `points_multiplier` no estaba y prod ya funcionaba: `PointsService` usa default `0.001`. Estado limpio = correcto.
- **Sin cambios de código, sin commit, sin deploy.** Solo se modificó data de prod. El esquema/imagen de Cloud Run siguen en rev `00089`.
- **Pendiente (decisión de Joel):** si quiere credenciales de admin distintas a Pier para el cliente, cambiarlas desde la UI (o reseed con env `PIER_EMAIL`/`PIER_PASSWORD`).

#### Parte 2 — "Mover stock" en tomos + verificación de feature "perdida" en el merge

**Contexto:** Joel reportó (con screenshot del `QuickStockModal`) que en prod "se perdió" su cambio de mover stock Exhibición↔Bodega en productos tras el merge brutal del 2026-06-22, que cuando es admin se ocupa elegir tienda, y que eso debería estar también en alta de tomos.

**Diagnóstico — la feature NO se perdió (era caché PWA):**
- `git log` de `QuickStockModal.tsx`: último cambio en `7677ef6` (features prod 00083-00088). El merge NO lo tocó (único conflicto fue `TransfersPage.tsx`).
- **Verificación del bundle LIVE de prod** (`grep` a `index-Bmd-Hbyr.js`): contiene "Mover stock entre almacenes" ✅, "Bodega → Exhibición" ✅, `/inventory/move` ✅. **La feature está deployada.** Lo que Joel veía era el service worker sirviendo bundle viejo → solución: incógnito nuevo / hard refresh (ver [[feedback-pwa-cache-qa]]).
- **Selector de tienda para admin:** ya existe en `QuickStockModal` (dropdown cuando el admin ve >1 tienda; chip si es una sola; el modal entero se scopea a `headerStoreId`). También deployado.
- El bundle live además ya trae el trabajo del 2026-06-23 (detalle USD en ticket, Devolver→cancelación) → **prod = develop HEAD `d02530f`**, todo lo commiteado está en prod.

**Gap real implementado — habilitar "Mover stock" para TOMOS:**
- La pestaña estaba oculta para tomos por el gate `canShowMove = !isManga && ...` en `QuickStockModal.tsx`.
- Los tomos están unificados como `products` (`product_type='manga'`, CTI) y su inventario vive en la tabla compartida `inventory`; el facade `/manga-inventory` (que usa el modal) mapea a `inventory` con `manga_id = product_id`. Por eso `/inventory/move` funciona idéntico para tomos pasando su `product_id`.
- **Cambio** (`landing/src/components/products/QuickStockModal.tsx`): `canShowMove = !!moveExhibicion && !!moveBodega` (se quita `!isManga`) + invalidar `queryKeys.mangas.all` tras mover cuando `isManga`.
- **TDD backend** (`backend/tests/Feature/BodegaExhibicionTest.php`, +2 tests): `test_move_endpoint_moves_stock_for_manga_product` y `test_manga_inventory_facade_reflects_move` (el facade refleja el move → el preview "old → new" del modal no miente). **Suite: 160 verdes** (537 assertions). `vite build` ✅.
- **Deploy:** commit `27fab90` + `gcloud run deploy tadaima --source . --region us-central1` → **rev `tadaima-00092-mj8`** (sin flags de env → **22/22 secrets preservados**; migrate no-op). Verificado: health 200, login admin Pier 200, bundle nuevo `index-Dd2eiMv4.js`. Push a `origin/develop` (repo en sync con prod). **Para ver "Mover stock" en tomos: hard refresh / incógnito nuevo** (PWA).

**Arranque EN VIVO (mismo día, ~18:43):** el cliente/Joel ya empezó a configurar sobre la BD limpia — tienda **"Tadaima CENTRO"** (auto-creó Bodega + Exhibición ✅, prueba en vivo de la QA) + usuarios reales (Jesica, Iveth, Froy, Carlos). **El sistema ya está VIVO** → de aquí en adelante NO ensuciar/limpiar prod sin backup + aviso (ver [[project-prod-test-phase]]).

#### Parte 3 — Feature "Productos no asignados en todas las tiendas" + DEPLOY rev 00093 + cambio de estrategia de ramas

**Feature (request de Joel):** mejorar el alta de productos entre tiendas. Pier da de alta un producto/tomo **sin asignar sucursales** → aparece en **TODAS las tiendas como "No asignado"** → cada sucursal (gerente o cajero) le agrega su propio stock (self-service). Como el catálogo de preventas.

| Capa | Cambio |
|---|---|
| Backend | `ProductController::index` + `MangaController::index`: bandera opt-in `?include_unassigned=1` (gatea el `whereHas('inventory')`) + `withExists` → booleano `is_assigned`. **Default sin cambios.** Resources (`ProductLightResource`/`ProductResource`/`MangaCompatResource`) exponen `is_assigned` aditivo. |
| Caja (`SellPage`) | Inline: los no asignados muestran pill **"No asignado · Agregar stock"**; click/Enter/**escáner** abren `QuickStockModal` (scopeado a la tienda del cajero) en vez de cobrar. **No se puede vender un no-asignado** (stock 0 → guard de `addToCart` lo bloquea). Cubre catálogo, búsqueda y `ProductCatalogModal`. |
| Gestión (`ProductsPage`) | Badge "No asignado" + botón "Agregar stock" en tabla, tarjetas y pestaña Tomos. |
| Hooks/API | `include_unassigned` en `useProducts`/`useMangas` + tipos en `packages/api`. |
| Reuso | `QuickStockModal` ya existente (cajero ya podía agregar stock de su tienda — `storeScopeError` role-agnóstico). |

**Verificación:** `UnassignedProductsTest` +6 (productos+tomos, cajero agrega stock, cross-store 403) → **suite 166 verde**. `vite build` OK. **Code-review: 0 críticos** (fixeado un HIGH: escáner/Enter sobre no-asignado abría error confuso → ahora abre "Agregar stock"; + 2 defensivos).

**DEPLOY:** commit `3481979` en **`main`** + `gcloud run deploy tadaima --source . --region us-central1` (Cloud Build, **sin Docker Desktop**) → **rev `tadaima-00093-ldl`**. Verificado: health 200, login Pier 200, **22/22 secrets**, bundle nuevo `index-DS-R9Kt5.js` con "No asignado" presente. Migrate no-op (sin migraciones nuevas).

**CAMBIO DE ESTRATEGIA DE RAMAS (decisión Joel):** compartir un solo branch (`develop`) hizo que Joel y Ruben **perdieran cambios** por divergencia. Nueva separación:
- **`main`** = producción / rama de Joel (de aquí se deploya). Quedó FF a develop (todo prod 00089–00092) + la feature → `3481979`.
- **`dev/qa-handoff`** = rama de QA de Ruben (FF a `main`, también `3481979`). Ruben: `git fetch && git checkout dev/qa-handoff && git pull`. Su trabajo entra a `main` por merge/PR (no más push directo al branch de Joel).
- **`develop`** queda histórica en `3820a96` (1 commit detrás de main); ya nadie la comparte.

#### Parte 4 — 2 feedbacks cliente (gerente sin costos por default + admin ve passwords) + DEPLOY rev 00094

**Feedback 1 — gerente NO ve costos hasta que el admin lo permita.** Confirmado: `UserController::store()` (y `assignRole()`) **auto-encendían `can_view_cost=true`** al crear/asignar gerente con tienda (decisión vieja 2026-06-10). **Quitados ambos bloques** → el gerente arranca en el default `false`; el admin lo activa en TabPermisos (`PUT /users/{id}`). `GerenteAutoCostTest` invertido (gerente creado/asignado → false; admin puede activarlo). **Prod data:** reseteados los gerentes que ya lo tenían (Carlos id5, Joel-GR id7) `1→0` vía `UPDATE … WHERE rol IN ('gerente','manager') AND can_view_cost=1`; los 3 gerentes ahora en 0.

**Feedback 2 — admin puede VER passwords en users settings.** Los passwords son bcrypt (write-only) → imposible verlos sin copia. Decisión Joel: **copia reversible**.
| Pieza | Detalle |
|---|---|
| Migración | `2026_06_24_000001_add_password_enc_to_users.php` → columna `password_enc` text nullable. |
| Modelo `User` | cast `'password_enc' => 'encrypted'` (AES con APP_KEY) + en `$hidden` (no se auto-serializa) + en `$fillable`. |
| `UserController` | en `store()`/`update()`(reset admin) guarda `password_enc` desde el MISMO plaintext que `password`. `AuthController::changePassword` también la mantiene al día (fix del review). |
| `UserResource` | campo `password_plain` **solo si el viewer es admin** (`isAdminRole()`); descifrado por el cast; null si no hay copia. Los no-admin NUNCA reciben el campo. |
| Frontend | `AdminPage` (modal editar usuario): fila read-only "Contraseña actual (solo admin)" con toggle 👁; si null → "resetea para verla". |

Solo se capturan passwords creados/reseteados **después** del cambio (los previos solo tienen hash). El **login sigue usando el bcrypt** de `password`. **Tradeoff aceptado por Joel:** `password_enc` es reversible con la APP_KEY (mitigado: `$hidden` + gate admin en el resource).

**Verificación:** suite **169 verde** (GerenteAutoCostTest invertido + `PasswordVisibleAdminTest` +3). `vite build` OK. **Security-review: 0 críticos / 0 high** (leak paths limpios — `password_plain` nunca llega a no-admin, verificado; fixeados 1 MEDIUM = `changePassword` mantiene la copia, 1 LOW = comentario stale en `SaleItemResource`). **DEPLOY** commit `8a019ae` en `main` → **rev `tadaima-00094-wcc`** (Cloud Build, sin Docker, 22/22 secrets, migración `password_enc` aplicada). `dev/qa-handoff` sincronizada para Ruben.

### Sesión 2026-06-12 — local_date en cortes, backup main, merge transfers de Ruben + RBAC backend, DEPLOY rev 00072

**Contexto:** Joel hizo corte a las 11:36pm Tijuana con `testc1macro` y la BD guardó `closed_at` del día 12 (UTC). Pidió que la UI mande la fecha local. Después: backup a main, traer el cambio de transferencias de Ruben (`origin/develop`) y deploy de todo.

**1. `local_date` en cortes de caja (backend + frontend):**
- Migración `2026_06_12_000001`: columna `cash_register_sessions.local_date` (date, nullable, indexed) — aplicada a prod vía proxy.
- `POST /cash/close` acepta `local_date` (Y-m-d); `CashRegisterService::close()` la persiste con fallback `now(zona negocio)` (cubre force-close y clientes viejos). Resource la expone.
- `/reports/cash`: cortes CON `local_date` se filtran por ese día exacto; sin ella (abiertas/legacy) cae al traslape UTC de siempre. Un corte de 11:30pm ya NO aparece también al día siguiente.
- Frontend: `closeSession(amount, getTodayLocal())` en SellPage + tipo `CashSession.local_date`.
- Corte #17 de Joel backfileado a `2026-06-11`. `CashReportRangeTest` +3 tests.

**2. Backup a main + limpieza de repo:**
- Commit `0d0d8bd` (48 archivos, todo el lote local 06-10→06-12) → push a `dev/qa-handoff` y **fast-forward a `main`** ANTES de mergear lo de Ruben (main quedó como punto de restauración pre-merge).
- Sacados del repo: `pos-app/` (se había colado como gitlink — tiene repo propio) y `backend/tadaimaposlite` (SQLite accidental). Ambos a `.gitignore`.

**3. Merge transferencias de Ruben (cherry-pick `e7e8e7b` de `origin/develop`):**
- Solo tocó `landing/src/pages/TransfersPage.tsx` (+92/−40). Su IA no dejó notas aparte — el flujo está en comentarios del código: solo admin/gerente usan la pantalla; gerente solicita viendo stock de TODAS las tiendas; solo admin completa; cancela admin o el gerente creador; + responsive.
- **NO traído:** commit `2146837` (logo tadaima en Layout + LoginPage) — pendiente decisión de Joel.

**4. Backend de transfers alineado (la UI sola NO funcionaba):**
- `store()` daba 403 al gerente si la bodega origen no era de su tienda (regla vieja "bug QA Web 5") → la función principal del cambio de Ruben tronaba. Ahora: cajero 403; gerente origen libre PERO su tienda debe ser origen o destino (no puede mover entre tiendas ajenas).
- `complete()` ahora admin-only server-side (antes cualquiera con acceso a la tienda — el bloqueo era solo visual).
- `cancel()` ahora admin o gerente creador (`transfer.user_id`).
- `TransferRbacTest` nuevo (5 tests). Suite **129/129**. Commit `a38e0a9`.

**5. DEPLOY rev `tadaima-00072-6bk`** (Cloud Build remoto, landing + backend en una imagen). Verificado en prod: login admin ✓; `/transfers` 200; corte #17 sale en filtro 06-11 y NO en 06-12 (local_date funcionando); `cancelled_amount` presente en `/sales`; bundle nuevo confirmado (strings del UI de Ruben + `local_date`); ruta `/cortes` 200.

**Pendientes al cierre:** logo de Ruben (`2146837`) sin traer; probar RBAC de transfers en vivo con cuenta gerente (`gmacro`); pendientes menores de la auditoría RQ (queryKeys, staleTime prefetch Layout).

### Sesión 2026-06-12 madrugada — Cortes en menú, historial full-screen, IVA fix, Apartados con costo, cancelaciones −$X (deployado en rev 00072)

**Contexto:** QA en vivo de Joel. Todo local — se suma al lote pendiente de deploy. **Incluye backend** (118/118 tests, +1 nuevo). `vite build` OK en cada paso.

1. **Página "Cortes" (`/cortes`, PageKey `cash_cuts`)** — cajero y gerente no tenían menú para ver sus cortes. Nueva página para los 3 roles (backend ya acota `/reports/cash`: cajero→suyos, gerente→tienda, admin→todo + filtro tienda): presets Hoy/Ayer/7 días/Este mes, KPIs, y **detalle inline expandible** (pedido Joel: "que empuje, no modal"): resumen Abrió con/Ventas/Entradas/Salidas/Ajustes/Esperado/Cerró con/Diferencia (✓Cuadra/Falta/Sobra) + tabla de TODOS los tickets (fecha, cliente, items línea por línea, pagos, cancelados marcados) + preventa + movimientos + **Imprimir** (reusa `printCashCut` exportado de `CashCloseSummaryModal`). Pestaña "Cortes de Caja" removida de Reportes (vivía solo-admin). Archivos: `CashCutsPage.tsx` (nuevo), `permisos.ts`, `Layout.tsx`, `router/index.tsx`, `ReportsPage.tsx`.
2. **Historial de Caja full-screen** — el modal centrado 560px se empujaba con muchas ventas. Ahora pantalla completa (patrón del catálogo de Productos): header con buscador inteligente (ticket #, folio, cliente, producto, SKU, método — combinable con tabs Todas/Canceladas), botón Actualizar arriba, contenido centrado máx 1000px. Filas expandibles intactas.
3. **Fix IVA s/comisión (Reporte):** `loadIvaComisionPct` hacía `Number(localStorage.getItem())` = `Number(null)` = **0** → la variable arrancaba en 0, nunca en el default 16. Además el input controlado re-insertaba el 0 al borrarlo ("se batalla"). Fix: default 16 real, input con string local borrable + placeholder 0 (vacío = 0% en la sesión), el 0 NO se persiste (al recargar vuelve a 16).
4. **Apartados del Reporte (Preventas) con costo + fórmulas del Excel:** columnas Fecha | Producto | Cant | **Venta | Abono | Resta** (+ **Costo | Utilidad** gate `canViewCost`). Resta = Venta − Abono (ámbar si debe); Utilidad = Venta − Costo (regla Joel, NO la del gerente); flag rojo "sin costo" + contador como las demás tablas; fórmulas visibles en subtítulo. Espejo en print/PDF/Excel.
5. **Cancelaciones: −$X rojo simbólico + detalle** — la venta cancelada se edita in-place (total $0) y la lista mostraba "$0" sin decir cuánto se regresó. Backend: `SaleResource` expone `cancelled_amount` (suma `amount_refunded`) + `cancelled_items` (snapshot del log ADR-016), eager-load en `GET /sales` index+show; test nuevo en `SaleCancellationTest` fija el contrato. Frontend: Lista de Ventas e historial de Caja muestran **−$2,400 en rojo** (parcial: total vigente + −$X chico) y al expandir el bloque "Cancelado · se regresó" con items y nota "ya descontado — no se resta dos veces". **Regla Joel: solo simbólico** — ningún agregado lo resta (20,000 − 2,400 = 17,600 ya viene del total). Fix lateral: KPI sección H sumaba `s.total` de canceladas (=$0 siempre); ahora usa `cancelled_amount` e incluye parciales.
6. **Historial tarjeta:** label "Tarjeta débito/crédito" → "Tarjeta" (display) y **botón cancelar oculto** cuando el ticket tiene pago con tarjeta (decisión 06-10: tarjeta no se cancela/devuelve; backend ya respondía 422 — la UI ya no invita al error).

### Sesión 2026-06-12 noche — Perf (NO Redux, capa optimista RQ) + QA UX en vivo (todo local, sin deploy)

**Contexto:** Joel reportó que tras vender en Caja, al ir a Ventas/Existencias la data tardaba 1–3s y la UI "engañaba" (parecía que no había movimientos). Preguntó si migrar a Redux. Sesión 100% local en `landing/` — se suma al lote pendiente de deploy. `vite build` OK en cada paso; backend sin cambios (sigue 117/117).

**Análisis Redux vs React Query (2 agentes en paralelo — arquitecto + auditoría de la capa de datos):**
- **Veredicto: NO migrar a Redux/RTK Query.** El dolor es latencia física de Cloud Run (300ms–2s por refetch), no gestión de estado — RTK Query haría exactamente lo mismo (invalidar y refetchear contra el mismo backend). Migrar = reescribir 20 hooks + re-implementar a mano persister IndexedDB y multi-tab (RTK no los trae) + re-QA de todo el POS: **12–20 días-hombre, riesgo ALTO, beneficio cero**.
- La auditoría confirmó la estructura RQ sólida (queryKeys jerárquicas, keepPreviousData, persister) y encontró gaps: KPIs del Dashboard sin invalidación post-venta, invalidaciones copiadas en 5 lugares, `saleCancellations` y keys de Dashboard fuera de `queryKeys.ts` (pendiente), staleTime del prefetch de Layout desincronizado 24h vs 5min (pendiente).

**Implementado:**
1. **Capa optimista — `lib/optimisticSale.ts` (nuevo):** tras cada POST exitoso del checkout, la respuesta se escribe DIRECTO al cache: `prependSaleToSalesCaches` (la venta aparece en la lista de Ventas al soltar COBRAR, respetando filtros tienda/cajero/fechas), `prependPreSaleOrderToCaches` (folio nuevo), `patchPreSaleOrderInCaches` (liquidación → delivered/saldo 0), `decrementProductStockInCaches` (resta stock en TODOS los caches de productos: light/top/search/infinite/detail, walker inmutable). Sin rollback: solo se escribe lo que el servidor confirmó; el refetch de la invalidación reconcilia (cubre carreras entre cajas).
2. **`invalidateAfterSale(qc, {presale?})` centralizada** — reemplaza las 5 copias divergentes (checkout ×3, CancelTicketModal, handleReturn). Incluye el **fix del gap crítico: dashboards (`['dashboard']`, `['gerente-daily-cash']`, `['my-cuts']`) nunca se invalidaban** — el gerente con Dashboard abierto veía contadores congelados.
3. **Polling casi-live 20s** (pedido Joel: "solo en ventanas live exactas, sin que se note el refresh"): opción `refetchIntervalMs` en `useSalesQuery`/`usePreSaleOrdersQuery`/`usePreSaleCatalogsQuery`/`useProductsQuery`/`useProductsLightQuery`/`useMangasQuery`. Solo corre montada + tab enfocada (se apaga al salir). Wiring: Ventas (admin/gerente; cajero excluido — lo suyo ya es optimista), ProductsPage por tab activo, PreSaleOrdersPanel, y en Caja SOLO mientras el modal de Catálogo o Preventas está abierto (estados de modal movidos arriba de las queries). **Sin parpadeo:** chip "Cargando…"/atenuado de SalesPage y panel Folios ahora solo con `isPlaceholderData` (cambio de filtro) — el poll de fondo es invisible y las filas nuevas simplemente aparecen.
4. **Validación inline tel/correo en alta de cliente ×3** (popup "Crear cliente nuevo" de Caja, form inline de preventa, modal de Clientes): borde + label rojo en vivo, botón bloqueado, guard en submit (cubre Enter). Regex compartido `lib/validation.ts` (10 díg +52 opcional / email estándar). Socios Supabase no se validan (data ya capturada).
5. **Fix crash `ReferenceError: hasCashOnly is not defined`** al abrir el menú de método de pago (variable fantasma comiteada el 06-10, también estaba en HEAD): ahora cada opción se bloquea con `itemAcceptsMethod` real — Tarjeta bloqueada con items preventa/cash_only Y Efectivo bloqueado con items solo-tarjeta (antes solo contemplaba el primer caso). Joel creía que era por falta de terminal — era el dropdown.
6. **Footer de Caja (método de pago):** iconos por método (Banknote efectivo / CreditCard tarjeta / ArrowLeftRight transferencia / DollarSign dólares — el rayo Zap no decía nada); terminal ya NO muestra su nombre apretado: icono 📱 + ✓ verde (asignada, nombre en tooltip) o ⚠ ámbar pulsante (falta) — iteración: primero se abrevió "Tarj." + chip 96px y Joel lo rechazó ("quedó muy chico, deja solo Tarjeta"). Botón outlined **"Buscar terminales"** en el modal de Terminales (refetch sin cerrar — para cuando el admin da de alta una terminal desde otra máquina).
7. **Ticket formato clásico 2 líneas** (`doPrintTicket` — cubre impreso 58mm, reimpresión del historial y preview del modal): nombre del producto en su línea y abajo `2 × $400.00` + importe `$800.00` a la derecha. Antes `×2 $800` se leía como $800 por pieza. Items de preventa igual (con `unitPrice`).
8. **Ventas — columna método:** `shortMethodName` normaliza "Tarjeta débito/crédito" → "Tarjeta" (display only; débito+crédito en un folio ya no salen como "Varios"). Filtros y desglose intactos (usan includes).
9. **Reporte (antes "Reporte del Día"):** tab renombrado **"Reporte"** y movido a 2ª posición. Sub-tabs 5→3: **"Ventas"** = Efectivo | Tarjeta lado a lado (2 columnas, títulos centrados, apiladas <xl) y **"Preventas"** = 1·Apartados | 2·Liquidaciones; Vencidas sola. **Desglose por P. Unit:** agregación cambiada de producto+fecha a producto+fecha+**precio unitario** → el mismo tomo a $400 y $1,000 sale en filas separadas (`cant × P.Unit = Venta`), nueva columna P. Unit. **Costo:** $0 + flag rojo "sin costo" cuando falta O cuando el costo guardado es $0 (utilidad inflada visible de inmediato), contador "N sin costo" junto al Costo total del footer; gate cambiado de `isAdmin` a **`canViewCost`** (admin ∥ flag — el gerente con tienda ve costos, decisión 06-10). **Layout:** texto 12→14px; paneles de **altura FIJA** `max(320px, calc(100vh−430px))` (CSS puro, sin JS) — body con scroll interno + thead sticky + fila **Total en banda aparte anclada al fondo** (colgroup compartido + `table-layout:fixed` → columnas body/footer alineadas; las 2 columnas SIEMPRE terminan parejas, estado vacío también ocupa la altura). Subtítulos eliminados (solo título). **Desc del reporte + Imprimir/Excel/PDF movidos al fondo.** Exports sin tocar (siguen emitiendo las 5 tablas).

**Pendientes que dejó la auditoría (no urgentes):** mover `saleCancellations` y keys de Dashboard a `queryKeys.ts`; staleTime del prefetch de `Layout.tsx` (24h) desincronizado del hook real (5min); considerar P. Unit también en Excel/PDF si Joel lo pide.

### Sesión 2026-06-11/12 — QA en vivo gerente+cajero Macro: stock que no refresca, librería, heartbeat (rev 00071 + lote pendiente)

**Contexto:** QA en vivo de Joel con 2 ventanas (gerente `gmacro` + cajero `testc1macro`, ambos tienda 4 Test-Joel-Macro) contra prod. Backend 117/117 tests.

**DEPLOYADO — rev `tadaima-00071-6lt` (verificado contra prod):**
- **Stock no se reflejaba al vender/cancelar/devolver (QA: "vendí 2 de 20 y Existencias sigue en 20"):** (a) la devolución desde Lista de Ventas (`SalesPage.handleReturn`) solo invalidaba `sales.all` — ahora también `products` + `inventory` + `historial`; (b) NINGÚN flujo de venta/cancelación invalidaba `['inventory','by-product']` (lo que lee Existencias y el detalle de producto) — agregado en los 3 branches de checkout de `SellPage` y en `CancelTicketModal.onSuccess`; (c) `useProductInventoryQuery` ahora con `refetchInterval: 30s` (ventas desde OTRA máquina no disparan invalidación local — el desglose quedaba congelado con la página abierta).
- **Librería — tomos indistinguibles ("Naruto t1" ×2):** `ProductLightResource` expone `volume_number` (eager-load `mangaDetails` en light; `ProductLightVolumeTest` 2 tests) → pill azul "Tomo N" junto al SKU en catálogo de Caja (ambas variantes), fila de búsqueda de Caja y Existencias. Tomos viejos sin número no muestran pill hasta capturarlo en Editar tomo.
- **Cards sin foto compactos** en catálogo de Caja: franja con badges (stock + Efectivo) en vez del cuadro 1:1 (~180px menos por card). Componente `CardMedia` compartido normal/preventa.
- **Tab Productos mostraba los tomos duplicados** ("se creó como producto" — QA): GET /products devuelve TODO (la Caja necesita vender mangas) y `ProductsPage` lo mapeaba completo con `tipo:'normal'`. Filtro `product_type !== 'manga'`; el tomo SIEMPRE se creó bien como manga (POST /mangas fija `product_type`).
- **Cajero no veía productos/tomos creados en otra máquina:** staleTime de catálogos (products admin, products light Caja, mangas) 24h→**5min**, gcTime sigue 24h + IndexedDB (render instantáneo, refresh en bg al re-enfocar). Cross-máquina no hay invalidación posible (BroadcastChannel = solo tabs del mismo browser).

**PENDIENTE DE DEPLOY (working tree, sin commit — política Joel un solo push):**
- **FIX CRÍTICO heartbeat `TouchLastSeen` ("gerente no ve a su cajero con caja abierta"):** verificado live — `/users/online` vacío aun tras requests autenticados frescos. Causa doble: (1) **Carbon 3 hace diffs CON SIGNO** → `$now->diffInSeconds($pasado)` da negativo → el dedupe de 30s nunca volvía a escribir `last_seen_at` después del primer touch (por eso "funcionó" el 05-22 con los campos NULL y murió en silencio); (2) el middleware va en el grupo `api` y corría ANTES de `auth:sanctum` → `$request->user()` null con bearer en la ida. Fix: tocar después de `$next` + `$previous->diffInSeconds($now)`. `TouchLastSeenTest` (2, con bearer real). El threshold de /users/online es 2min y el heartbeat del Layout 90s — sin cambios.
- **Alta de Tomos exige stock:** el botón "Registrar" se activaba con solo nombre+precio (la tienda preseleccionada no implica stock asignado) → `stockOk`: cada tomo pendiente necesita cantidad>0 en ≥1 tienda; paso "Stock" agregado al checklist.
- **Precio Normal autollenado = Precio Público** en Alta de Tomos (antes solo placeholder + fallback backend); sigue en sync hasta que el usuario lo edite a mano.
- **Sidebar QA multi-ventana:** chip `#id` de tienda (rojo) + iniciales del nombre (TJM) + **rol** con color (Cajero azul / Gerente ámbar / Admin rojo) bajo el logo; tooltip = nombre completo. Rol visible aun sin tienda activa.
- **Menú del avatar tapado en Home:** el popup (z-50) vive dentro del stacking context del aside (`glass-dark` + z-10) y las secciones del Dashboard (`relative z-10`, después en el DOM) lo pintaban encima → aside a `z-20` (modales fixed z-50+ siguen arriba).

**QA aclarados (NO eran bugs):**
- "Gerente no ve que cajero tiene caja abierta" (primer reporte): `gcentro@gmail.com` es gerente de **tienda 3** (Test1-Joel-Centro) y el cajero `testc1macro` es de **tienda 4** — el RBAC scope por tienda funcionó correcto. El gerente de Macro es `gmacro@gmail.com`. (El segundo reporte con `gmacro` SÍ destapó el bug real del heartbeat.)
- Conteos de sesión verificados vía API admin: sesión #17 del cajero abierta correcta.

### Sesión 2026-06-12 — Handoff a Claude: UI Caja + calendario Ventas (avance ~94%, faltó cierre visual)

**Contexto:** sesión local larga de polish UI/UX en `landing/`. Joel pidió cerrar contexto en log porque el último tramo del calendario de `Ventas` “tronó” visualmente y quiere que **Claude** remate el ~6% final.

**Sí quedó hecho en working tree:**
- **Caja > catálogo productos (`ProductCatalogModal.tsx`):**
  - precios grandes estilo Preventas;
  - soporte visual para **tomos/libros** (`volume_number`, `product_type`);
  - overlay/badge `Vol. N` cuando hay imagen;
  - variante sin imagen con bloque centrado `VOL`;
  - tabs internas **Productos / Tomos** filtrando en memoria (sin refetch).
- **Admin productos (`ProductsPage.tsx`):**
  - cards y modal alineados al lenguaje visual de Preventas (precios más visibles, colores por nivel).
- **Caja > preventas disponibles (`SellPage.tsx`):**
  - badge de disponibilidad tipo semáforo: `>5` verde, `1-5` ámbar, `0` rojo;
  - removido el rótulo redundante `PREVENTA` arriba de la card;
  - `Anticipo mín.` subido debajo del nombre;
  - `Reservados` con más peso visual pero sin parecer botón;
  - eliminado footer inútil de “Precio base”.
- **Caja > carrito (`SellPage.tsx`):**
  - si el producto no tiene imagen, ya **no reserva placeholder**;
  - el row se compactó horizontalmente;
  - selector de precio movido a la zona de acciones finales;
  - `Borrar` ahora es botón táctil ancho;
  - columna de importe rearmada con **Subtotal** grande + desglose `xN × unitario`, centrado.
- **Ventas (`SalesPage.tsx`):**
  - se instalaron `react-aria-components` + `@internationalized/date`;
  - se reemplazaron los 2 pills `Desde/Hasta` por un solo `SalesDateRangePicker`;
  - el picker usa **`RangeCalendar` de React Aria** con `visibleDuration={{ months: 2 }}` y segundo grid con `offset={{ months: 1 }}`;
  - el trigger ya actualiza `filterStartDate` / `filterEndDate` del estado existente;
  - se corrigieron tipos locales de `SalesPage` para que ese archivo no siga rompiéndose por `exactOptionalPropertyTypes`.

**Dónde quedó el intento del calendario:**
- [landing/src/pages/SalesPage.tsx](/Users/joeldoradoaguilus/Documents/JOEL/Tadaima/landing/src/pages/SalesPage.tsx)
  - componente `SalesDateRangePicker` aprox. líneas **221-379**;
  - integración en header de filtros aprox. líneas **2250+**.
- Dependencias agregadas:
  - [landing/package.json](/Users/joeldoradoaguilus/Documents/JOEL/Tadaima/landing/package.json)
  - [package-lock.json](/Users/joeldoradoaguilus/Documents/JOEL/Tadaima/package-lock.json)

**Qué faltó (el ~6% para Claude):**
- **Validación visual/browser del calendario de Ventas.** No se alcanzó a abrir/verificar el popover en navegador tras el patch.
- Ajustar el look final del `RangeCalendar` para que se vea más integrado al módulo:
  - revisar spacing del popover,
  - revisar highlight de rango,
  - revisar si conviene footer con shortcuts (`Hoy`, `7 días`, `Este mes`) dentro del popover,
  - revisar si el trigger único cabe bien en el header con filtros de pago/cajero.
- Si React Aria no se ve bien o presenta fricción, Claude debe decidir si:
  - lo pule y lo deja,
  - o vuelve temporalmente al date picker previo.

**Verificación técnica alcanzada:**
- `npm install react-aria-components @internationalized/date` completado en `landing/`.
- Type-check global del proyecto **sigue rojo por errores viejos ajenos**, pero se corrió un grep focalizado y **`SalesPage.tsx` dejó de reportar errores propios** para este cambio.

### Sesión 2026-06-11 — QA de preventas/UX + deploy de todo lo acumulado (rev 00069→00070)

**Contexto:** sesión de QA en vivo de Joel (cajero/gerente Macro test contra prod). Se deployó por fin TODO lo de la sesión grande 2026-06-10 + lo de hoy. Backend 113/113 tests.

**Inventarios / formularios:**
- **Tienda única preseleccionada** en los selectores "Agregar tienda/almacén" de: alta de producto (tab Inventario), QuickStockModal (ahora también admin), MangaBatchModal, MangaEditModal y tab Stock del catálogo de preventa. Si solo hay 1 opción disponible, sale seleccionada.
- **Crear producto ya no "miente":** toast persistente "Creando «X»…" → ✓ éxito SOLO después del refetch (cuando el registro ya se ve en tabla y Caja); toast también al actualizar. Empty states honestos: "Actualizando catálogo…/tomos…" con spinner durante refetch en vez de "No hay productos".
- **Form de catálogo de preventa:** anticipo arranca en $100 (nuevo), "Fecha límite de retiro" se precarga llegada+10 días (`PICKUP_DAYS_AFTER_ARRIVAL`, sin pisar ediciones manuales, suma sin pasar por UTC).

**Preventas:**
- **"Sin asignar · Avisar" en Caja:** catálogo sin entrada en `store_limits` para la tienda activa ya NO sale "Agotado" — badge gris "Sin asignar" + botón 🔔 Avisar → `POST /notifications/presale-assign-alert` (cajero→gerente de su tienda+admins; gerente→admins; idempotente). **Fix crítico de destinatarios:** `resolveRecipients` confiaba en `stores.manager_id` (NULL en todas las tiendas de prod) → ahora resuelve gerentes por `users.store_id`+rol (la convención real del RBAC). Tests `NotificationsPreSaleAssignAlertTest` (6).
- **FIX CRÍTICO `reserved_by_store` llegaba aplanado:** `JsonResource::removeMissingValues` aplica `array_values()` a arrays con keys 100% numéricas → `{4:2}` llegaba como `[2]` y la Caja mostraba el límite completo como disponibles (20 en vez de 18 con 2 apartados). Fix: cast `(object)` en `PreSaleCatalogResource`. Test de regresión en `PreSaleCatalogsTest`.
- **Aclaración conteos:** el "24 vendidos" del catálogo Preventa Admin es data real de QA (18 folios desde 06-05); el "0 vendidos" del admin era cache stale de 24h (ver perf abajo). Gerentes SÍ ven catálogos de otros gerentes (index sin filtro por creador; el scope es solo al asignar stock).
- Tab default de Preventas: admin/gerente entran a **Catálogos** (antes Folios); cajero sigue en Disponibles.
- Notificaciones: polling ahora corre en background (`refetchIntervalInBackground` — antes la campana del gerente no se actualizaba con la pestaña desenfocada; 60s cerrado / 15s abierto).

**Precios (nombres de negocio + UI Caja):**
- `lib/priceLevels.ts` central: labels (1=Normal, 2=Socio, 3=Mayorista, D/E) + colores (`PRICE_LEVEL_COLORS/RGB`: verde/ámbar/azul/morado/rosa). Aplicado en forms de Productos (rows 3+2, antes 5 apretados), MangaEdit/MangaBatch, catálogo de preventa (grid 3+2 con $) y Caja (rows del catálogo y botones full-width del card de preventa con color por nivel + textos de cards más grandes).

**Perf / loading-UX (auditado con agentes; los índices MySQL ya estaban bien — FKs crean índice implícito):**
- **Ventas:** `useSalesQuery` con `keepPreviousData` + staleTime 30s→5min; la tabla ya NO espera al catálogo de productos (solo thumbnails); `per_page` 500→100 (el backend clampea a 100). Cambio de fecha visible: chip ámbar "Cargando…" en la barra de Periodo + lista atenuada (opacity .45, sin clicks) durante el refetch.
- **Preventas:** `usePreSaleCatalogsQuery` staleTime 24h→**2min** + `refetchOnWindowFocus` (el payload trae contadores vivos; el admin no veía ventas de otra máquina). Folios: buscador con debounce 300ms (antes 1 request por tecla), chip "Cargando…" + tabla atenuada, botón refresh girando. Catálogos: chip "Actualizando…". Badge del tab Folios: 1 query (`status=pending,ready` CSV) en vez de 2.

**Deploy:** rev `tadaima-00069-c95` (todo lo del 06-10 + hoy) y **`tadaima-00070-bmp`** (fix reserved_by_store) — 100% tráfico. Verificado contra prod: `/pre-sale-catalogs` devuelve `reserved_by_store` como objeto (`{"4":1}`).

**Cierre de sesión — push + rama de Ruben:**
- Commits `8009d37` + `941e2c6` en `dev/qa-handoff`; **`develop` (rama de Ruben) fast-forward al mismo punto** y pusheada.
- **QA de Ruben apunta a PROD (decisión Joel, en vez de regenerar SQLite):** `pos-app/.env` ya apuntaba a prod; `landing/.env.example` documenta `VITE_API_URL=https://tadaima.poslite.com.mx` → Ruben corre solo `npm run dev`, sin Laravel/DB/proxy local.
- Excluidos del repo: `backend/tadaimaposlite` (SQLite suelto) y `pos-app/` (repo propio).

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


### Sesión 2026-06-19 — Módulo de Traslados (Actualizaciones de flujo y UI)
- **Frontend ()**: Se reemplazó la validación estática de aprobación. Ahora el gerente de la **tienda origen** puede autocompletar traslados originados en su tienda. El admin mantiene poder global.
- **Frontend/Backend**: Se mejoró el componente visual de las transferencias.  ahora carga imágenes de productos con eager loading (`items.product.images`) y el  envía `image_url`. El Frontend muestra ahora la imagen del producto y su nombre real en lugar del texto crudo '1 SKU', mejorando drásticamente la UX.
- **Frontend**: Se modificó  para retornar el nombre de la sucursal (si está asociada) en los selectores de origen/destino al crear una transferencia.

