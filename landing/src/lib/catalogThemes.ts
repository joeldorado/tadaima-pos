import type { CatalogThemeSlug } from "@tadaima/api"

/**
 * Temas del Catálogo Online (Catálogo v3).
 *
 * Contrato de CSS vars `--cat-*` que consumen página/header/footer/cards:
 *  --cat-accent       acento sólido de marca (botones activos, links)
 *  --cat-accent-text  acento legible para TEXTO sobre fondo oscuro
 *  --cat-accent-dim   fondo de pill activa (acento ~15% alpha)
 *  --cat-accent-brd   borde de pill activa / CTA (~30% alpha)
 *  --cat-accent-g     gradiente del CTA primario
 *  --cat-glow         sombra/glow de CTAs y logo (~40% alpha)
 *  --cat-bar-bg       fondo del header sticky y footer
 *  --cat-page-bg      fondo de página (base bajo el shader; único bg si useShader=false)
 *  --cat-price        color del precio
 *  --cat-good         verde semántico (stock/WhatsApp) — FIJO en todos los temas
 *
 * `shaderTint` = vec3 del tinte de la nebulosa (mismo patrón de brillo que el
 * original `vec3(bg*.24, bg*.075, bg*.05)`).
 *
 * MANTENER EN SYNC: backend/app/Services/CatalogConfigService.php (THEMES)
 * y mcp/catalog/src/themes.ts.
 */

const GOOD_GREEN = "#34D399"

export interface CatalogTheme {
  slug: CatalogThemeSlug
  label: string
  /** Descripción corta para pickers (admin / MCP). */
  description: string
  useShader: boolean
  shaderTint: [number, number, number]
  vars: Record<string, string>
}

const baseVars = (v: {
  accent: string
  accentText: string
  accentDim: string
  accentBrd: string
  accentG: string
  glow: string
  barBg: string
  pageBg: string
  price: string
}): Record<string, string> => ({
  "--cat-accent": v.accent,
  "--cat-accent-text": v.accentText,
  "--cat-accent-dim": v.accentDim,
  "--cat-accent-brd": v.accentBrd,
  "--cat-accent-g": v.accentG,
  "--cat-glow": v.glow,
  "--cat-bar-bg": v.barBg,
  "--cat-page-bg": v.pageBg,
  "--cat-price": v.price,
  "--cat-good": GOOD_GREEN,
})

export const CATALOG_THEMES: Record<CatalogThemeSlug, CatalogTheme> = {
  tadaima: {
    slug: "tadaima",
    label: "Tadaima (rojo)",
    description: "El look clásico: nebulosa roja con calidez ámbar.",
    useShader: true,
    shaderTint: [0.24, 0.075, 0.05],
    vars: baseVars({
      accent: "#E0221A",
      accentText: "#FF8A80",
      accentDim: "rgba(224,34,26,0.15)",
      accentBrd: "rgba(224,34,26,0.30)",
      accentG: "linear-gradient(135deg, #BB1100, #FF3322)",
      glow: "rgba(224,34,26,0.40)",
      barBg: "rgba(11,8,13,0.82)",
      pageBg: "var(--td-page-bg)",
      price: "#FFB020",
    }),
  },
  gradient: {
    slug: "gradient",
    label: "Gradiente elegante",
    description: "Azul-noche con dorado, sin animación de fondo. Sobrio y premium.",
    useShader: false,
    shaderTint: [0.24, 0.075, 0.05], // no aplica (useShader=false)
    vars: baseVars({
      accent: "#C9A96A",
      accentText: "#E8CD9A",
      accentDim: "rgba(201,169,106,0.15)",
      accentBrd: "rgba(201,169,106,0.30)",
      accentG: "linear-gradient(135deg, #8E7040, #C9A96A)",
      glow: "rgba(201,169,106,0.35)",
      barBg: "rgba(10,13,24,0.85)",
      pageBg: "linear-gradient(160deg, #0B0E1A 0%, #141B2E 45%, #0A0C16 100%)",
      price: "#E8CD9A",
    }),
  },
  navidad: {
    slug: "navidad",
    label: "Navidad",
    description: "Verde pino con rojo y dorado navideño.",
    useShader: true,
    shaderTint: [0.07, 0.22, 0.1],
    vars: baseVars({
      accent: "#E03C4A",
      accentText: "#FF9A9A",
      accentDim: "rgba(224,60,74,0.15)",
      accentBrd: "rgba(224,60,74,0.30)",
      accentG: "linear-gradient(135deg, #8F1622, #E03C4A)",
      glow: "rgba(224,60,74,0.40)",
      barBg: "rgba(6,17,11,0.85)",
      pageBg: "linear-gradient(150deg, #06110B 0%, #0B1F12 55%, #12060A 100%)",
      price: "#F5C542",
    }),
  },
  halloween: {
    slug: "halloween",
    label: "Halloween",
    description: "Naranja calabaza sobre morado profundo.",
    useShader: true,
    shaderTint: [0.2, 0.08, 0.26],
    vars: baseVars({
      accent: "#F97316",
      accentText: "#FFB273",
      accentDim: "rgba(249,115,22,0.15)",
      accentBrd: "rgba(249,115,22,0.30)",
      accentG: "linear-gradient(135deg, #C2410C, #F97316)",
      glow: "rgba(249,115,22,0.40)",
      barBg: "rgba(13,6,20,0.85)",
      pageBg: "linear-gradient(150deg, #0A0512 0%, #1A0B26 55%, #0D0410 100%)",
      price: "#FFB020",
    }),
  },
  patrio: {
    slug: "patrio",
    label: "Mes patrio",
    description: "Verde bandera con acentos cálidos para septiembre.",
    useShader: true,
    shaderTint: [0.05, 0.2, 0.08],
    vars: baseVars({
      accent: "#1B9E4B",
      accentText: "#6EE7A0",
      accentDim: "rgba(27,158,75,0.15)",
      accentBrd: "rgba(27,158,75,0.30)",
      accentG: "linear-gradient(135deg, #046A38, #1B9E4B)",
      glow: "rgba(27,158,75,0.40)",
      barBg: "rgba(6,14,9,0.85)",
      pageBg: "linear-gradient(150deg, #07100A 0%, #0C1F12 50%, #160709 100%)",
      price: "#FFB020",
    }),
  },
  muertos: {
    slug: "muertos",
    label: "Día de Muertos",
    description: "Rosa mexicano con morado y cempasúchil.",
    useShader: true,
    shaderTint: [0.24, 0.06, 0.16],
    vars: baseVars({
      accent: "#E4007C",
      accentText: "#FF7AC1",
      accentDim: "rgba(228,0,124,0.15)",
      accentBrd: "rgba(228,0,124,0.30)",
      accentG: "linear-gradient(135deg, #9D0059, #E4007C)",
      glow: "rgba(228,0,124,0.40)",
      barBg: "rgba(18,5,26,0.85)",
      pageBg: "linear-gradient(150deg, #12051A 0%, #26082E 50%, #1A0512 100%)",
      price: "#FF9E1B",
    }),
  },
}

export const DEFAULT_CATALOG_THEME = CATALOG_THEMES.tadaima

export function resolveCatalogTheme(slug: string | null | undefined): CatalogTheme {
  if (slug && slug in CATALOG_THEMES) {
    return CATALOG_THEMES[slug as CatalogThemeSlug]
  }
  return DEFAULT_CATALOG_THEME
}
