# Deep Check — Tadaima POS (2026-06-25)

> Auditoría de "posibles truenes", aguante bajo tráfico, cruces de datos entre tiendas, mocks que truenan,
> código muerto y bugs de persistencia. Contexto: **una empresa (Tadaima), varias tiendas**; prod en vivo
> en Cloud Run + Cloud SQL (MySQL). Reconocimiento con agentes (security/database/performance/silent-failure)
> + verificación contra `routes/api.php`. **Lo CRÍTICO/ALTO ya quedó arreglado en esta pasada** (ver ✅).

## Resumen ejecutivo

| Área | Estado | Severidad original |
|------|--------|--------------------|
| A. Cruce de datos entre tiendas | ✅ **Arreglado** (11 controllers + tests) | ALTA (control interno) |
| B. Aguante bajo tráfico / escala | ✅ **Endurecido** (config + resiliencia) | ALTA |
| C. Mocks/stubs que truenan en prod | ✅ **Arreglado** (guard de prod) + 1 pendiente | CRÍTICA |
| D. Persistencia / datos que no se guardan | ✅ Limpio (proveedor/categoría ya estaba) | — |
| E. Código muerto | Mínimo (1 archivo) | BAJA |

---

## A. Cruce de datos entre TIENDAS (lo que más preocupaba)

**Problema:** ~10 endpoints confiaban en el `store_id`/`warehouse_id`/`session_id` del request sin validar
que fueran de la tienda del usuario → un gerente/cajero de la tienda A podía **ver o editar** datos de la
tienda B (inventario con costo, apartados, movimientos de caja con montos, precios por tienda, usuarios/PII,
y config de tienda/bodega/terminal). **Ventas, Reportes, Traslados y Preventas YA estaban bien** (usan
`storeScopeError()`/`scopedStoreId()`).

**✅ Arreglado** reusando los helpers existentes (`User::canActOnStore`, `Controller::storeScopeError`,
`adminOrManagerGateError`, nuevo `adminOnlyError`):

| Controller | Método(s) | Fix |
|---|---|---|
| `InventoryController` | index, movements | filtra por bodegas de SU tienda (no-admin) |
| `LayawayController` | index, byProduct, store, show, update, updateStatus, addPayment, payments | scope + guard por `store_id` |
| `CashRegisterController` | movements, open | valida tienda **y** dueño de la sesión (cajero solo la suya) |
| `UserController` | index | no-admin solo ve usuarios de su tienda (PII) |
| `ProductController` | updateStorePrices, removeStorePrices | admin/gerente + scope de tienda |
| `SalesDraftController` | index, store, show, cancel | scope por tienda |
| `Store/Warehouse/Terminal` | store, update, destroy, addPaymentMethod | **admin-only** (config) |
| `ProductCategory/Suppliers` | update, destroy | admin/gerente (crear queda abierto: el cajero da de alta productos) |

**Tests:** `StoreScopeEnforcementTest` ampliado (12 → 17): un gerente/cajero de la tienda A recibe **403** al
tocar inventario/apartados/caja/config de la tienda B; admin sigue viendo todo. **Falsos positivos descartados:**
los métodos de `SalesDraft` `addItem/updateItem/removeItem/extend/reserved-stock` están comentados (ADR-014),
no son alcanzables. **Hallazgo extra:** 2 tests usaban un "admin" sin rol asignado y un cajero abriendo caja en
otra tienda — corregidos (reflejan la realidad: en prod el admin SÍ tiene rol).

**Nota:** `customers`, `categories`, `suppliers` son **globales** a propósito (una empresa, base compartida);
solo se gateó su **mutación**.

---

## B. Aguante bajo tráfico pesado

**Problema:** techo de **~20 requests concurrentes** (PHP-FPM `pm.max_children=10` × `max-instances=2`), cola
`sync`, **llamadas a Supabase síncronas** sin timeout (una lenta colgaba el worker hasta 30s → cascada a 503),
sesión/cache en DB, sin rate limit, polling del front 10–60s.

**✅ Endurecido:**
- **Cloud Run** (`deploy.sh` + flags del deploy): `cpu` 1→**2**, `memory` 512Mi→**1Gi**, `max-instances`
  2→**10** → techo ~**200 concurrentes** (≈10× más).
- **PHP-FPM** (`Dockerfile`): `pm.max_children` 10→**20** (start 4, spare 2–10).
- **Rate limit** (`routes/api.php`): `throttle:120,1` por usuario (amortigua polling/abuso; el cajero ronda ~25/min).
- **Resiliencia Supabase** (`TadaimaMemberService`): `timeout 4s` + `retry 0` (falla rápido, no cuelga el worker)
  + **cache** (lookup 60s, search 30s) para no martillar + `safeGet` que no truena ante timeout. Corta la cascada.

**Siguiente nivel (no en esta pasada — requiere infra):** mover `SESSION/CACHE/QUEUE` a **Redis** y las llamadas
a Supabase a **job async**. Hoy session/cache/queue viven en DB (`sync`) — funciona, pero Redis daría otro salto.

---

## C. Mocks / stubs que truenan en producción

**CRÍTICO (✅ arreglado):** `TadaimaMemberService` caía a un **stub con socios falsos `@stub.local`** si faltaba
`TADAIMA_SUPABASE_URL/KEY` — y eso **ya pasó en prod** (jun-15, se perdió la config en un deploy). El cajero no
distinguía un socio real de uno falso. **Fix:** guard de producción — si falta la config **en prod**, se loguea
error y se devuelve **vacío/null** (los stubs solo viven en local/dev). Nunca más socios falsos en prod.

**PENDIENTE (BAJO):** `POST /external/customer` (`ExternalCardController::register`) devuelve un `external_member_id`
falso (`EXT-...`) sin escribir a Supabase (TODO histórico). Hoy **el frontend NO lo usa** (los socios se importan,
no se registran), así que no truena — pero conviene quitar el endpoint o implementarlo cuando exista el alta en
Supabase. Supabase es **solo lectura** desde el POS por decisión de producto.

---

## D. Persistencia / datos que no se guardan

Se comparó, para cada entidad (Customer, Product, Store, User, PreSaleCatalog/Order, Sale, Terminal, Supplier,
Category, Warehouse), lo que valida el `FormRequest` vs lo que persiste el controller vs el `$fillable`.
**No se encontraron campos que se manden y no se guarden.** El bug histórico de **proveedor/categoría ya está
resuelto** (verificado: `supplier_id` se valida, persiste y está en `$fillable`).

---

## E. Código muerto

- `landing/src/components/ui/sonner.tsx` — wrapper de shadcn **sin uso** (la app usa `AppToaster.tsx`). Se puede
  borrar (bajo). El resto "comentado" (drafts en `routes/api.php`) es intencional (ADR-014), no es código muerto.

---

## Pendientes recomendados (orden sugerido)

1. (Infra, mayor impacto en escala) Redis para session/cache/queue + job async para Supabase.
2. Quitar/implementar `POST /external/customer` (hoy stub).
3. Borrar `ui/sonner.tsx`.
4. (Opcional) Scope de lectura en `Store/Warehouse/Terminal index` para que el gerente solo vea su tienda en
   selectores (hoy las mutaciones ya son admin-only; las lecturas las maneja el frontend vía StoreContext).
