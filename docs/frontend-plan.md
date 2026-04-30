# Tadaima POS — Frontend Roadmap
> Arquitectura: Turborepo monorepo · Web: React + Vite · Mobile: Expo (ya existe en `/app`)
> API: Laravel `/api/v1` con Sanctum Bearer token · 110 endpoints

---

## Estructura final del monorepo

```
tadaima/
├── apps/
│   ├── web/              # React + Vite (crear)
│   └── mobile/           # Expo — migrar desde /app
├── packages/
│   ├── api/              # Axios client + tipos + funciones de endpoint
│   ├── hooks/            # TanStack Query hooks
│   ├── auth/             # AuthContext + interfaz de token storage
│   ├── permissions/      # Lógica de roles y guards
│   └── utils/            # Formatters, constantes
├── turbo.json
└── package.json          # workspaces root
```

---

## Fases del roadmap

| Fase | Nombre | Apps | Tiempo estimado |
|---|---|---|---|
| 0 | Monorepo + tooling | ambas | 2–3h |
| 1 | Package `@tadaima/api` | ambas | 3–4h |
| 2 | Auth — shared logic | ambas | 2h |
| 3 | Auth — Web UI | web | 2h |
| 4 | Auth — Mobile UI | mobile | 1–2h |
| 5 | Layout Web + routing | web | 2–3h |
| 6 | Layout Mobile + navegación | mobile | 2h |
| 7 | **POS Mobile** — cart + checkout | mobile | 4–5h |
| 8 | **POS Mobile** — caja + apartados | mobile | 3–4h |
| 9 | Web — Productos + Inventario | web | 4–5h |
| 10 | Web — Ventas + Clientes | web | 3–4h |
| 11 | Web — Traspasos + PreVentas | web | 3h |
| 12 | Web — Reportes | web | 3–4h |
| 13 | Web — Usuarios + Roles | web | 3h |
| 14 | Web — Configuración + Catálogo | web | 3–4h |
| 15 | Mobile — pantallas secundarias | mobile | 3h |
| 16 | Polish: errores, offline, loading | ambas | 3–4h |
| 17 | Build + Deploy | ambas | 2–3h |

**Total estimado:** ~50–60 horas de trabajo

---

## Dependencias entre fases

```
Fase 0 ──► Fase 1 ──► Fase 2 ──┬──► Fase 3 ──► Fase 5 ──► Fase 9..14
                                 └──► Fase 4 ──► Fase 6 ──► Fase 7 ──► Fase 8 ──► Fase 15
```

Las fases 9–14 (web) y 7–8 (mobile) pueden desarrollarse en paralelo una vez superadas las fases de auth y layout.

---

## Módulos por app

### Solo Web
- Usuarios & Roles
- Reportes completos (gráficas, tablas)
- Gestión de inventario (CRUD completo, ajustes, traspasos)
- Catálogo online (configuración)
- Configuración del sistema (tiendas, bodegas, terminales, ajustes)
- Companies / Payment Methods / Categorías

### Solo Mobile
- POS Checkout (flujo de venta completo)
- Apertura/cierre de caja
- Búsqueda rápida de stock
- Pre-Ventas (crear + registrar pago en mostrador)

### Ambas apps (lógica compartida, UI diferente)
- Auth (login/logout/me)
- Búsqueda y consulta de productos
- Clientes (buscar, ver crédito)
- Vista de ventas recientes

---

## Convenciones del proyecto

- **Imports:** `@tadaima/api`, `@tadaima/hooks`, `@tadaima/auth`, etc.
- **Variables de entorno:** `VITE_API_URL` (web) · `EXPO_PUBLIC_API_URL` (mobile)
- **Idioma del código:** inglés (variables, funciones, tipos)
- **Idioma de UI:** español
- **Errores de API:** siempre mostrar `error.message` del backend, nunca mensajes genéricos inventados
- **Fechas:** siempre ISO 8601 al enviar, formatear con `@tadaima/utils/date` al mostrar
- **Moneda:** siempre formatear con `@tadaima/utils/currency` (MXN por defecto)
- **Loading states:** skeleton en web, ActivityIndicator en mobile — nunca pantalla en blanco
- **Mutation feedback:** toast/snackbar en éxito y error, siempre

---

## Criterios de "fase completada"

Una fase está completa cuando:
- [ ] El flujo happy-path funciona end-to-end contra la API real
- [ ] Los estados de loading y error están manejados
- [ ] No hay `console.log` ni `any` sin comentario `// TODO`
- [ ] El código está tipado (TypeScript strict)
