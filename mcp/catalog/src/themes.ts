/**
 * Apariencia del Catálogo Online — espejo informativo para el MCP.
 *
 * Tres ejes INDEPENDIENTES que se combinan libremente (Catálogo v4):
 * tema (color) · fondo (efecto) · layout (acomodo).
 *
 * MANTENER EN SYNC con:
 *  - landing/src/lib/catalogThemes.ts (fuente de verdad visual)
 *  - backend/app/Services/CatalogConfigService.php (THEMES/BACKGROUNDS/LAYOUTS)
 * Un slug desconocido degrada al default en el backend, así que el drift
 * no rompe — solo deja de aplicar.
 */

export const THEME_SLUGS = ["tadaima", "gradient", "navidad", "halloween", "patrio", "muertos"] as const
export type ThemeSlug = (typeof THEME_SLUGS)[number]

export const THEMES: Record<ThemeSlug, { label: string; description: string }> = {
  tadaima: { label: "Tadaima (rojo)", description: "El look clásico: rojo de marca con calidez ámbar." },
  gradient: { label: "Dorado elegante", description: "Azul noche con dorado. Sobrio y premium." },
  navidad: { label: "Navidad", description: "Verde pino con rojo y dorado navideño." },
  halloween: { label: "Halloween", description: "Naranja calabaza sobre morado profundo." },
  patrio: { label: "Mes patrio", description: "Verde bandera con acentos cálidos para septiembre." },
  muertos: { label: "Día de Muertos", description: "Rosa mexicano con morado y cempasúchil." },
}

export const BACKGROUND_SLUGS = ["shader", "gradient", "galaxy"] as const
export type BackgroundSlug = (typeof BACKGROUND_SLUGS)[number]

export const BACKGROUNDS: Record<BackgroundSlug, { label: string; description: string }> = {
  shader: { label: "Nebulosa", description: "Nube de color que respira lento con el tono del tema." },
  gradient: { label: "Degradado", description: "Degradado quieto en el color del tema. El más ligero y sobrio." },
  galaxy: { label: "Galaxia", description: "Galaxia espiral de estrellas girando en 3D. El más llamativo." },
}

export const LAYOUT_SLUGS = ["classic", "sidebar", "masonry"] as const
export type LayoutSlug = (typeof LAYOUT_SLUGS)[number]

export const LAYOUTS: Record<LayoutSlug, { label: string; description: string }> = {
  classic: { label: "Clásico", description: "Filtros arriba y cuadrícula pareja. El acomodo de siempre." },
  sidebar: {
    label: "Menú lateral",
    description: "Categorías fijas a la izquierda y productos a la derecha, más anchos. En celular se ve como el clásico.",
  },
  masonry: {
    label: "Revista",
    description: "Mosaico donde cada tarjeta respeta la forma real de su foto. Luce con fotos buenas.",
  },
}

export const SORTS = {
  new: "Más nuevos primero (novedad)",
  featured: "Destacados primero, luego novedad",
} as const

export const TOGGLES: Record<string, string> = {
  show_price: "Mostrar precios en el catálogo",
  show_stock: "Mostrar existencias por sucursal",
  hide_out_of_stock: "Ocultar agotados (solo catálogo por sucursal, legado)",
  cart_enabled: "Carrito activo (si no, pedido por producto)",
  show_search: "Buscador visible",
  show_categories: "Filtro de categorías visible",
  show_description: "Descripciones de producto visibles",
  show_stores: "Lista de sucursales en el footer",
  show_address: "Domicilio de cada sucursal en el footer",
  show_contact: "Teléfono de cada sucursal en el footer",
}

export const SOCIAL_KEYS = ["instagram", "facebook", "tiktok", "x", "youtube", "discord"] as const
export type SocialKey = (typeof SOCIAL_KEYS)[number]
