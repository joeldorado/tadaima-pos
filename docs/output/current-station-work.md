# Tadaima POS Web — Estado actual de trabajo

> Última actualización: 2026-04-10
> Plan de referencia: `docs/frontend-web.md`

---

## Dónde estamos

**Completadas:** Fase 0 · Fase 0.5 · Fase 1A · Fase 2 · Fase 2B · Fase 3
**Bloqueado en:** Pruebas manuales de Fase 3 (ver abajo)
**Siguiente:** Fase 4 — Permissions / `useCurrentUser`

---

## Fase 3 — Estado: código completo, pendiente prueba manual

El flujo de venta está implementado y pasa `tsc + build`. El usuario va a probar:

1. Agregar producto → `POST /drafts` + `POST /drafts/:id/items`
2. Subir/bajar cantidad → `PATCH /drafts/:id/items/:itemId`
3. Eliminar item → `DELETE /drafts/:id/items/:itemId`
4. Cobrar (cash) → `POST /sales`
5. Confirmar venta en backend (Laravel)

Si pasa → avanzar a Fase 4.

---

## Archivos clave modificados en Fase 3

| Archivo | Qué hace |
|---------|---------|
| `landing/src/pages/SellPage.tsx` | POS principal — `@ts-nocheck`, se reescribe Fase 9–14 |
| `landing/src/stores/cartDraftStore.ts` | Zustand: `draftIds` + `draftItemIds` por mesa |
| `packages/api/src/drafts.ts` | `createDraft`, `addDraftItem`, `updateDraftItem`, `removeDraftItem` |
| `packages/api/src/sales.ts` | `createSale` |
| `packages/api/src/types.ts` | `Draft`, `DraftItem`, `AddDraftItemInput`, `UpdateDraftItemInput`, `Sale` |

---

## Fase 2B — Auth wiring + Cart persistence (completada)

| Archivo | Qué hace |
|---------|---------|
| `landing/src/lib/tokenStorage.ts` | Implementación concreta de `TokenStorage` con `localStorage` |
| `landing/src/pages/LoginPage.tsx` | Pantalla de login — email/password, `useAuth().login()`, redirect post-login |
| `landing/src/components/ProtectedRoute.tsx` | Guard — espera `isLoading`, redirige a `/login` si no hay user |
| `landing/src/router/index.tsx` | Agrega ruta `/login`, protege `/` y children con `ProtectedRoute` |
| `landing/src/App.tsx` | Envuelve `RouterProvider` con `<AuthProvider storage={localStorageTokenStorage}>` |
| `landing/src/stores/cartDraftStore.ts` | Agrega `persist` middleware → `draftIds`+`draftItemIds` sobreviven recarga |
| `packages/api/src/drafts.ts` | Agrega `getDraft(id)` → `GET /drafts/:id` |
| `landing/src/pages/SellPage.tsx` | `useEffect` en mount valida drafts persistidos; limpia si 404/completed |

**Flujo post-2B:**
- Usuario abre app → `AuthProvider` llama `GET /api/me` con token de localStorage
- Si token válido → usuario entra directo al POS
- Si token inválido/no existe → `ProtectedRoute` redirige a `/login`
- Al recargar con carrito activo → `draftIds` persisten, mount valida contra backend

---

## Fase 2 — Completada

| Archivo | Qué hace |
|---------|---------|
| `packages/auth/src/AuthContext.tsx` | `AuthProvider` — login, logout, session restore, 401 handler |
| `packages/auth/src/useCurrentUser.ts` | `useCurrentUser()` — fail-secure hasta Fase 4 |
| `packages/auth/src/types.ts` | `TokenStorage`, `AuthContextValue`, `CurrentUser` |
| `packages/api/src/client.ts` | Axios con `setTokenGetter`, `setOnUnauthorized`, `resolveBaseUrl` |
| `packages/auth/tsconfig.json` | TS config del package |

---

## Seguridad aplicada (pre-Fase 4)

### Fixes de seguridad Fase 3 (sale flow)
- **HIGH**: `total <= 0` guard en checkout
- **HIGH**: Draft/cart divergence → `draftItemIds` en store + `updateDraftItem`/`removeDraftItem` en sync
- **HIGH**: Double-submit → `isCheckoutLockedRef`
- **MEDIUM**: total $0 guard (mismo fix)

### Fixes silent-failure-hunter (post-Fase 3)
- **CRITICAL**: `changeQty` leía `newQty` de closure antes de setState flush → siempre era 0 → DELETE incorrecto. Fix: capturar de `activeMesa.items` antes de `updMesa`.
- **HIGH**: `removeFromCart` saltaba DELETE silenciosamente si IDs faltaban → ahora toast + rollback
- **HIGH**: `addToCart` leía qty del snapshot stale de `mesas[]` → Fix: `newQty = preItem.quantity + 1` pre-`updMesa`
- **HIGH**: `handleCheckout` enviaba `method: "cash"` para Tarjeta/Transferencia → ahora bloquea con toast

### Pendientes MEDIUM/LOW (no críticos, atacar después)
- M6: No hay rollback de UI en `addToCart`/`changeQty` cuando falla backend
- M7: `getProducts` no mapea `stock_details`, `payment_restriction`, `stock_damaged` (requiere cambios en API backend)
- M8: Dólares: total se envía en MXN sin indicador de divisa
- M9: Concurrent adds mismo producto → duplicado en servidor
- L10: `clearCart` re-lee `activeMesa.id` que pudo cambiar mid-flight
- L11: Errores 422 field-level se descartan
- L12: `getProducts` no re-fetcha durante sesión

---

## Arquitectura monorepo (referencia rápida)

```
/Tadaima/
  landing/          → app web (Vite + React 19 + TS)
  packages/api/     → cliente Axios (@tadaima/api)
  packages/auth/    → AuthProvider, useAuth, useCurrentUser (@tadaima/auth)
  backend/          → Laravel API
  apps/             → (mobile pendiente)
```

TSConfig estricto: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`

---

## Fase 4 — Próxima: Permissions

Ver `docs/frontend-web.md` para spec completa.
`useCurrentUser.can()` actualmente retorna `false` (fail-secure). Fase 4 implementa permisos reales.
