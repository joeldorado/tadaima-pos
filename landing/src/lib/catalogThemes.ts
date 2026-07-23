import type {
  CatalogBackgroundSlug,
  CatalogLayoutSlug,
  CatalogThemeSlug,
} from "@tadaima/api"

/**
 * Apariencia del Catálogo Online (Catálogo v4).
 *
 * Tres ejes INDEPENDIENTES que se combinan libremente:
 *  - TEMA    → el color (paleta de vars `--cat-*`)
 *  - FONDO   → el efecto detrás del contenido (nebulosa / degradado / galaxia)
 *  - LAYOUT  → el acomodo de los productos (clásico / menú lateral / revista)
 *
 * Contrato de CSS vars `--cat-*` que consumen página/header/footer/cards:
 *  --cat-accent       acento sólido de marca (botones activos, links)
 *  --cat-accent-text  acento legible para TEXTO sobre fondo oscuro
 *  --cat-accent-dim   fondo de pill activa (acento ~15% alpha)
 *  --cat-accent-brd   borde de pill activa / CTA (~30% alpha)
 *  --cat-accent-g     gradiente del CTA primario
 *  --cat-glow         sombra/glow de CTAs y logo (~40% alpha)
 *  --cat-bar-bg       fondo del header sticky y footer
 *  --cat-page-bg      fondo de página (base bajo el efecto animado)
 *  --cat-price        color del precio
 *  --cat-good         verde semántico (stock/WhatsApp) — FIJO en todos los temas
 *
 * Cada tema además declara cómo se ve en LOS TRES fondos, para que el color
 * mande siempre:
 *  - `shaderTint`     vec3 del tinte de la nebulosa
 *  - `gradientBg`     el degradado propio del tema (fondo "degradado")
 *  - `galaxyColors`   núcleo/borde de la galaxia (fondo "galaxia")
 *
 * MANTENER EN SYNC: backend/app/Services/CatalogConfigService.php
 * (THEMES / BACKGROUNDS / LAYOUTS) y mcp/catalog/src/themes.ts.
 */

const GOOD_GREEN = "#34D399"

export interface CatalogTheme {
  slug: CatalogThemeSlug
  label: string
  /** Descripción corta para pickers (admin / MCP). */
  description: string
  /** Fondo que usa este tema cuando el admin no eligió uno explícitamente. */
  defaultBackground: CatalogBackgroundSlug
  shaderTint: [number, number, number]
  /** Fondo del modo "degradado": sin animación, en el color del tema. */
  gradientBg: string
  /** Núcleo y borde de la galaxia, en hex (el shader los interpola por radio). */
  galaxyColors: { core: string; edge: string }
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
    description: "El look clásico: rojo de marca con calidez ámbar.",
    defaultBackground: "shader",
    shaderTint: [0.24, 0.075, 0.05],
    gradientBg:
      "radial-gradient(130% 90% at 15% 0%, rgba(224,34,26,0.20) 0%, transparent 55%), radial-gradient(100% 70% at 85% 100%, rgba(255,176,32,0.10) 0%, transparent 60%), linear-gradient(165deg, #150809 0%, #1F0A0C 45%, #0A0709 100%)",
    galaxyColors: { core: "#FFC46B", edge: "#E0221A" },
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
    // v4: ya no significa "sin animación" (eso ahora es el FONDO); es la paleta.
    label: "Dorado elegante",
    description: "Azul noche con dorado. Sobrio y premium.",
    defaultBackground: "gradient",
    shaderTint: [0.1, 0.11, 0.2],
    gradientBg:
      "radial-gradient(120% 80% at 80% 0%, rgba(201,169,106,0.18) 0%, transparent 55%), linear-gradient(160deg, #0B0E1A 0%, #141B2E 45%, #0A0C16 100%)",
    galaxyColors: { core: "#F3DEAF", edge: "#6E7FC0" },
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
    defaultBackground: "shader",
    shaderTint: [0.07, 0.22, 0.1],
    gradientBg:
      "radial-gradient(120% 85% at 20% 0%, rgba(224,60,74,0.18) 0%, transparent 55%), radial-gradient(100% 70% at 85% 95%, rgba(245,197,66,0.12) 0%, transparent 60%), linear-gradient(155deg, #06110B 0%, #0B1F12 55%, #12060A 100%)",
    galaxyColors: { core: "#F5C542", edge: "#2FA05A" },
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
    defaultBackground: "shader",
    shaderTint: [0.2, 0.08, 0.26],
    gradientBg:
      "radial-gradient(125% 85% at 25% 0%, rgba(249,115,22,0.18) 0%, transparent 55%), linear-gradient(155deg, #0A0512 0%, #1A0B26 55%, #0D0410 100%)",
    galaxyColors: { core: "#FFB273", edge: "#7B3BC9" },
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
    defaultBackground: "shader",
    shaderTint: [0.05, 0.2, 0.08],
    gradientBg:
      "radial-gradient(120% 85% at 20% 0%, rgba(27,158,75,0.20) 0%, transparent 55%), radial-gradient(100% 70% at 85% 100%, rgba(255,176,32,0.10) 0%, transparent 60%), linear-gradient(155deg, #07100A 0%, #0C1F12 50%, #160709 100%)",
    galaxyColors: { core: "#FFB020", edge: "#1B9E4B" },
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
    defaultBackground: "shader",
    shaderTint: [0.24, 0.06, 0.16],
    gradientBg:
      "radial-gradient(125% 85% at 22% 0%, rgba(228,0,124,0.20) 0%, transparent 55%), radial-gradient(100% 70% at 85% 100%, rgba(255,158,27,0.12) 0%, transparent 60%), linear-gradient(155deg, #12051A 0%, #26082E 50%, #1A0512 100%)",
    galaxyColors: { core: "#FF9E1B", edge: "#E4007C" },
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

// ─── Fondos ───────────────────────────────────────────────────────────────────

export interface CatalogBackgroundOption {
  slug: CatalogBackgroundSlug
  label: string
  description: string
}

export const CATALOG_BACKGROUNDS: Record<CatalogBackgroundSlug, CatalogBackgroundOption> = {
  shader: {
    slug: "shader",
    label: "Nebulosa",
    description: "Nube de color que respira lento con el tono del tema.",
  },
  gradient: {
    slug: "gradient",
    label: "Degradado",
    description: "Degradado quieto en el color del tema. El más ligero y sobrio.",
  },
  galaxy: {
    slug: "galaxy",
    label: "Galaxia",
    description: "Galaxia espiral de estrellas girando en 3D. El más llamativo.",
  },
}

/**
 * Qué fondo pintar. `null` (nunca configurado) hereda el del tema, para que un
 * catálogo publicado antes de v4 se siga viendo idéntico.
 */
export function resolveCatalogBackground(
  slug: string | null | undefined,
  theme: CatalogTheme
): CatalogBackgroundSlug {
  if (slug && slug in CATALOG_BACKGROUNDS) {
    return slug as CatalogBackgroundSlug
  }
  return theme.defaultBackground
}

/**
 * Vars del tema ya resueltas para el fondo activo. En modo "degradado" el
 * `--cat-page-bg` plano del tema se sustituye por su degradado propio (si no,
 * temas como tadaima —que dejan el fondo liso para que el shader vaya encima—
 * saldrían grises).
 */
export function catalogSurfaceVars(
  theme: CatalogTheme,
  background: CatalogBackgroundSlug
): Record<string, string> {
  if (background !== "gradient") return theme.vars
  return { ...theme.vars, "--cat-page-bg": theme.gradientBg }
}

// ─── Layouts ──────────────────────────────────────────────────────────────────

export interface CatalogLayoutOption {
  slug: CatalogLayoutSlug
  label: string
  description: string
}

export const CATALOG_LAYOUTS: Record<CatalogLayoutSlug, CatalogLayoutOption> = {
  classic: {
    slug: "classic",
    label: "Clásico",
    description: "Filtros arriba y cuadrícula pareja. El acomodo de siempre.",
  },
  sidebar: {
    slug: "sidebar",
    label: "Menú lateral",
    description:
      "Categorías fijas a la izquierda y productos a la derecha, más anchos. En celular se ve como el clásico.",
  },
  masonry: {
    slug: "masonry",
    label: "Revista",
    description:
      "Mosaico donde cada tarjeta respeta la forma real de su foto. Luce con fotos buenas.",
  },
}

export function resolveCatalogLayout(slug: string | null | undefined): CatalogLayoutSlug {
  if (slug && slug in CATALOG_LAYOUTS) {
    return slug as CatalogLayoutSlug
  }
  return "classic"
}
