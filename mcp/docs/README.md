# tadaima-docs-mcp

Servidor MCP para gestionar la **documentación-tutorial** de Tadaima POS desde
Claude (Claude Code o Claude Desktop). A diferencia de `mcp/catalog`, este
server **no usa el API de Laravel ni token**: opera directamente sobre los
archivos del repo, porque la documentación vive como DATOS:

| Qué | Dónde |
|---|---|
| Temas del Centro de Documentación | `landing/src/content/docs/data/*.json` (8 archivos de categoría) |
| Tours guiados | `landing/src/content/tours/data/*.json` |
| Screenshots | `landing/src/assets/docs/<slug>/<nn>-<nombre>.png` |
| Iconos válidos | `ICON_MAP` en `landing/src/content/docs/icons.ts` (solo lectura) |
| Historial de deploys | `MASTERLOG.md` (raíz) — para el reporte de cobertura |
| Mapping feature→temas | `mcp/docs/coverage-map.json` (curado a mano) |

## Setup

```bash
cd mcp/docs
npm install
npm run build          # → dist/index.js (dist/ está gitignorado — SIEMPRE buildear tras clonar)
```

Ya está registrado en el `.mcp.json` de la raíz. **No necesita variables de
entorno**: la raíz del repo se resuelve relativa al propio módulo
(`dist/index.js` → `../../..`), así que funciona sin importar el cwd con el que
el cliente MCP arranque el proceso. Si quieres apuntarlo a otro checkout,
exporta `TADAIMA_REPO_ROOT=/ruta/al/repo` (tiene prioridad sobre el fallback).

## Regla de oro: schema en pareja

`src/schema.ts` es una **copia consciente en zod** del schema canónico de
`landing/src/content/docs/schema.ts` (los 8 kinds de bloque, tonos, roles).
Cualquier cambio al schema de landing **DEBE** replicarse aquí en el mismo
commit — y viceversa. Si divergen, el MCP aceptará/rechazará contenido que la
UI valida distinto.

## Tools

| Tool | Qué hace |
|---|---|
| `list_topics` | Lista temas (slug, título, categoría, roles, tour, updatedAt, #secciones); filtra por categoría/rol |
| `get_topic` | JSON completo de un tema por slug |
| `upsert_topic` | Crea o reemplaza un tema completo (validado; reemplaza en su archivo actual si ya existe) |
| `patch_topic` | Patch superficial (title/summary/keywords/roles/tourId/updatedAt) sin tocar secciones |
| `add_block` | Inserta un bloque validado en una sección (por id o heading) |
| `update_section` | Reemplaza heading/id/blocks de una sección |
| `delete_topic` | ⚠️ Elimina un tema completo (destructivo — solo git lo recupera) |
| `list_tours` / `get_tour` | Lee los tours guiados (tolera que la carpeta aún no exista) |
| `upsert_tour` | Valida y escribe `tours/data/<id>.json` |
| `list_icons` | Keys válidas de `ICON_MAP` (solo lectura) |
| `list_images` | Screenshots en `landing/src/assets/docs` (filtrable por tema) |
| `validate` | Validación cruzada del corpus completo (schema, slugs, iconos, imágenes, links, tours, targets, rutas) — reporte ✅/⚠️/❌ |
| `coverage_report` | Deploys del MASTERLOG desde una rev × coverage-map.json × updatedAt de temas |
| `capture_screenshots` | Corre `npx playwright test tests/e2e/capture-docs.spec.ts` con `DOCS_CAPTURE=1` (⚠️ requiere front :5173 y backend :8000 locales) |

## Uso conversacional (ejemplos)

- «Agrega un callout de advertencia al tema **cobro-caja**, en la sección
  *Cobrar*, que diga que el pago mixto admite efectivo + transferencia» →
  `add_block` con `{ slug: "cobro-caja", section: "Cobrar", block: { kind: "callout", tone: "warn", ... } }`
- «¿Qué temas ve un cajero?» → `list_topics { role: "cajero" }`
- «Cámbiale el resumen al tema de preventas» → `patch_topic { slug: "preventas", set: { summary: "..." } }`
- «¿Está todo consistente después de mis ediciones?» → `validate`
- «¿Qué features deployadas no tienen doc al día?» → `coverage_report`
- «Liga el tour de caja al tema» → `patch_topic { slug: "cobro-caja", set: { tourId: "tour-cobro-caja" } }`

## Notas de comportamiento

- **Escrituras serializadas**: las llamadas MCP por el mismo pipe stdio corren
  concurrentes; todas las operaciones de archivos se encadenan en una cola de
  promesas (`src/files.ts`) para que un `get` tras un `set` del mismo batch
  nunca lea datos viejos.
- **Escritura estándar**: JSON pretty con 2 espacios + newline final (igual que
  el resto del repo).
- `upsert_topic` y las herramientas de edición **sellan `updatedAt`**
  automáticamente (hoy, ISO) salvo que mandes uno explícito — ese campo
  alimenta `coverage_report`.
- `validate` **no arregla nada**: reporta. Los errores del corpus se corrigen
  con las tools de edición (o en landing, si el problema es de código).

## Probar a mano (MCP Inspector)

```bash
cd mcp/docs
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

Abre la UI del inspector, conecta y ejecuta `list_topics` o `validate` para
verificar que el server ve el corpus.
