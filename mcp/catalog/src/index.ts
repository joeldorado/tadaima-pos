import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { getProductFlags, getSettings, putProductFlags, putSettings } from "./api.js"
import { SOCIAL_KEYS, SORTS, THEME_SLUGS, THEMES, TOGGLES, type SocialKey } from "./themes.js"

/**
 * MCP del Catálogo Online de Tadaima POS.
 *
 * Alcance DELIBERADAMENTE acotado a la configuración del catálogo público
 * (/catalogo): tema, visibilidad, redes, descripción, orden y flags por
 * producto (destacado/oculto). NO toca ventas, caja, inventario ni usuarios.
 *
 * Auth: token Sanctum de un usuario admin vía env TADAIMA_API_TOKEN.
 */

const server = new McpServer({ name: "tadaima-catalog", version: "1.0.0" })

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] })
const fail = (e: unknown) => ({
  content: [{ type: "text" as const, text: `⚠️ ${e instanceof Error ? e.message : String(e)}` }],
  isError: true,
})

const boolStr = (v: boolean) => (v ? "true" : "false")

// ── 1. list_options — descubrimiento ("¿qué puedo hacer?") ───────────────────
server.tool(
  "list_options",
  "Lista TODO lo configurable del Catálogo Online de Tadaima: temas de color disponibles, toggles de visibilidad, órdenes de entrada y redes sociales soportadas. Úsalo primero para saber qué se puede cambiar.",
  {},
  async () => {
    const themes = THEME_SLUGS.map((s) => `  · ${s} — ${THEMES[s].label}: ${THEMES[s].description}`).join("\n")
    const toggles = Object.entries(TOGGLES).map(([k, d]) => `  · ${k} — ${d}`).join("\n")
    const sorts = Object.entries(SORTS).map(([k, d]) => `  · ${k} — ${d}`).join("\n")
    return ok(
      `OPCIONES DEL CATÁLOGO ONLINE (tienda pública /catalogo)\n\n` +
        `TEMAS (set_theme):\n${themes}\n\n` +
        `TOGGLES de visibilidad (set_toggles):\n${toggles}\n\n` +
        `ORDEN de entrada (set_default_sort):\n${sorts}\n\n` +
        `REDES del footer (set_socials): ${SOCIAL_KEYS.join(", ")} — URL https, "" para quitar.\n` +
        `DESCRIPCIÓN de la tienda (set_description): texto del footer, máx 600 caracteres.\n` +
        `PRODUCTOS (list_products / set_product_flags): destacar (featured) u ocultar (catalog_visible) productos del catálogo público.`
    )
  }
)

// ── 2. get_config — lectura completa ─────────────────────────────────────────
server.tool(
  "get_config",
  "Lee la configuración ACTUAL del Catálogo Online: tema activo, toggles de visibilidad, orden de entrada, descripción, redes sociales y conteo de productos destacados/ocultos.",
  {},
  async () => {
    try {
      const settings = await getSettings()
      const get = (k: string) => settings[`catalog_${k}`] ?? null

      const theme = get("theme") ?? "tadaima (default)"
      const sort = get("default_sort") ?? "new (default)"
      const description = get("description") ?? "(sin descripción)"

      let socials = "(sin redes configuradas)"
      const rawSocials = get("socials")
      if (rawSocials) {
        try {
          const parsed = JSON.parse(rawSocials) as Record<string, string>
          const entries = Object.entries(parsed).filter(([, v]) => !!v)
          if (entries.length) socials = entries.map(([k, v]) => `  · ${k}: ${v}`).join("\n")
        } catch {
          socials = "(JSON corrupto — el catálogo lo ignora)"
        }
      }

      const toggleLines = Object.keys(TOGGLES)
        .map((k) => `  · ${k}: ${get(k) ?? "(default)"}`)
        .join("\n")

      const [featured, hidden] = await Promise.all([
        getProductFlags({ filter: "featured", per_page: 1 }),
        getProductFlags({ filter: "hidden", per_page: 1 }),
      ])

      return ok(
        `CONFIGURACIÓN ACTUAL DEL CATÁLOGO\n\n` +
          `Tema: ${theme}\nOrden de entrada: ${sort}\nDescripción: ${description}\n\n` +
          `Redes:\n${socials}\n\nToggles:\n${toggleLines}\n\n` +
          `Productos destacados: ${featured.pagination.total} · ocultos: ${hidden.pagination.total}`
      )
    } catch (e) {
      return fail(e)
    }
  }
)

// ── 3. set_theme ─────────────────────────────────────────────────────────────
server.tool(
  "set_theme",
  "Cambia el TEMA de color del Catálogo Online (aplica de inmediato a la tienda pública). Temas: tadaima, gradient, navidad, halloween, patrio, muertos.",
  { theme: z.enum(THEME_SLUGS).describe("Slug del tema a activar") },
  async ({ theme }) => {
    try {
      await putSettings({ catalog_theme: theme })
      return ok(`✅ Tema "${THEMES[theme].label}" activado. ${THEMES[theme].description} Recarga /catalogo para verlo.`)
    } catch (e) {
      return fail(e)
    }
  }
)

// ── 4. set_toggles ───────────────────────────────────────────────────────────
const toggleShape = Object.fromEntries(
  Object.entries(TOGGLES).map(([k, d]) => [k, z.boolean().optional().describe(d)])
) as Record<string, z.ZodOptional<z.ZodBoolean>>

server.tool(
  "set_toggles",
  "Prende/apaga elementos del Catálogo Online (precios, existencias, carrito, buscador, categorías, descripciones, sucursales/domicilio/contacto del footer). Manda SOLO los que quieras cambiar.",
  toggleShape,
  async (args) => {
    try {
      const entries = Object.entries(args).filter(([, v]) => typeof v === "boolean") as [string, boolean][]
      if (!entries.length) return fail(new Error("Manda al menos un toggle (ej. show_price: false)."))
      const payload = Object.fromEntries(entries.map(([k, v]) => [`catalog_${k}`, boolStr(v)]))
      await putSettings(payload)
      return ok(`✅ Actualizado: ${entries.map(([k, v]) => `${k}=${v ? "ON" : "OFF"}`).join(", ")}.`)
    } catch (e) {
      return fail(e)
    }
  }
)

// ── 5. set_socials ───────────────────────────────────────────────────────────
const socialShape = Object.fromEntries(
  SOCIAL_KEYS.map((k) => [k, z.string().optional().describe(`URL https de ${k} — "" para quitarla`)])
) as Record<SocialKey, z.ZodOptional<z.ZodString>>

server.tool(
  "set_socials",
  "Configura las redes sociales del footer del catálogo (instagram, facebook, tiktok, x, youtube, discord). Manda solo las que cambien; \"\" borra una red. Se conservan las demás.",
  socialShape,
  async (args) => {
    try {
      const incoming = Object.entries(args).filter(([, v]) => typeof v === "string") as [string, string][]
      if (!incoming.length) return fail(new Error('Manda al menos una red (ej. instagram: "https://instagram.com/tadaima").'))

      const badUrl = incoming.find(([, v]) => v.trim() !== "" && !v.trim().startsWith("https://"))
      if (badUrl) return fail(new Error(`La URL de ${badUrl[0]} debe empezar con https:// (o "" para quitarla).`))

      // Merge con lo existente para no borrar redes no mencionadas.
      const settings = await getSettings()
      let current: Record<string, string> = {}
      try {
        current = JSON.parse(settings["catalog_socials"] ?? "{}") as Record<string, string>
      } catch { /* corrupto → empezar de cero */ }

      for (const [k, v] of incoming) {
        const trimmed = v.trim()
        if (trimmed === "") delete current[k]
        else current[k] = trimmed
      }

      await putSettings({ catalog_socials: JSON.stringify(current) })
      const active = Object.keys(current)
      return ok(`✅ Redes guardadas. Activas ahora: ${active.length ? active.join(", ") : "ninguna"}.`)
    } catch (e) {
      return fail(e)
    }
  }
)

// ── 6. set_description ───────────────────────────────────────────────────────
server.tool(
  "set_description",
  "Cambia la DESCRIPCIÓN de la tienda que aparece en el footer del catálogo (máx 600 caracteres). \"\" la quita.",
  { description: z.string().max(600).describe("Texto del footer; \"\" para quitarla") },
  async ({ description }) => {
    try {
      await putSettings({ catalog_description: description.trim() })
      return ok(description.trim() ? `✅ Descripción actualizada (${description.trim().length} caracteres).` : "✅ Descripción eliminada.")
    } catch (e) {
      return fail(e)
    }
  }
)

// ── 7. set_default_sort ──────────────────────────────────────────────────────
server.tool(
  "set_default_sort",
  "Define qué ve PRIMERO el cliente al entrar al catálogo: 'new' (más nuevos) o 'featured' (destacados primero).",
  { sort: z.enum(["new", "featured"]).describe("Orden de entrada del catálogo") },
  async ({ sort }) => {
    try {
      await putSettings({ catalog_default_sort: sort })
      return ok(`✅ Orden de entrada: ${SORTS[sort]}.`)
    } catch (e) {
      return fail(e)
    }
  }
)

// ── 8. list_products ─────────────────────────────────────────────────────────
server.tool(
  "list_products",
  "Lista productos con sus flags del catálogo (★ = destacado, 🚫 = oculto del catálogo público). Filtra por texto o por estado para encontrar el product_id a modificar.",
  {
    search: z.string().optional().describe("Buscar por nombre o SKU"),
    filter: z.enum(["all", "featured", "hidden"]).optional().describe("all (default) | featured | hidden"),
    page: z.number().int().min(1).optional().describe("Página (50 por página)"),
  },
  async ({ search, filter, page }) => {
    try {
      const resp = await getProductFlags({
        per_page: 50,
        ...(search ? { search } : {}),
        ...(filter ? { filter } : {}),
        ...(page ? { page } : {}),
      })
      if (!resp.data.length) return ok("Sin productos para ese filtro/búsqueda.")
      const lines = resp.data.map((p) => {
        const marks = `${p.featured ? "★" : " "}${p.catalog_visible ? "" : " 🚫"}${p.active ? "" : " (inactivo)"}`
        return `  #${p.id} ${marks} ${p.name} · ${p.sku}${p.category ? ` · ${p.category.name}` : ""}`
      })
      const { total, current_page, last_page } = resp.pagination
      return ok(
        `PRODUCTOS (página ${current_page}/${last_page} · ${total} en total)\n` +
          `★ = destacado · 🚫 = oculto del catálogo\n\n${lines.join("\n")}`
      )
    } catch (e) {
      return fail(e)
    }
  }
)

// ── 9. set_product_flags ─────────────────────────────────────────────────────
server.tool(
  "set_product_flags",
  "Destaca/quita destacado (featured) u oculta/muestra (catalog_visible) UN producto en el catálogo público. Usa list_products para encontrar el product_id.",
  {
    product_id: z.number().int().positive().describe("ID del producto"),
    featured: z.boolean().optional().describe("true = destacar, false = quitar destacado"),
    catalog_visible: z.boolean().optional().describe("false = ocultar del catálogo, true = mostrar"),
  },
  async ({ product_id, featured, catalog_visible }) => {
    try {
      if (featured === undefined && catalog_visible === undefined) {
        return fail(new Error("Manda featured y/o catalog_visible."))
      }
      const resp = await putProductFlags(product_id, {
        ...(featured !== undefined ? { featured } : {}),
        ...(catalog_visible !== undefined ? { catalog_visible } : {}),
      })
      return ok(
        `✅ "${resp.name}" → destacado: ${resp.featured ? "SÍ ★" : "no"} · visible en catálogo: ${resp.catalog_visible ? "sí" : "NO 🚫"}.`
      )
    } catch (e) {
      return fail(e)
    }
  }
)

// ── Arranque ─────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
console.error("tadaima-catalog MCP listo (stdio). API:", process.env.TADAIMA_API_URL ?? "prod")
