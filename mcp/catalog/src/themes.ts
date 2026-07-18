/**
 * Temas del Catálogo Online — espejo informativo para el MCP.
 *
 * MANTENER EN SYNC con:
 *  - landing/src/lib/catalogThemes.ts (fuente de verdad visual)
 *  - backend/app/Services/CatalogConfigService.php (whitelist THEMES)
 * Un slug desconocido degrada a "tadaima" en el backend, así que el drift
 * no rompe — solo deja de aplicar.
 */

export const THEME_SLUGS = ["tadaima", "gradient", "navidad", "halloween", "patrio", "muertos"] as const
export type ThemeSlug = (typeof THEME_SLUGS)[number]

export const THEMES: Record<ThemeSlug, { label: string; description: string }> = {
  tadaima: { label: "Tadaima (rojo)", description: "El look clásico: nebulosa roja animada con calidez ámbar." },
  gradient: { label: "Gradiente elegante", description: "Azul-noche con dorado, sin animación de fondo. Sobrio y premium." },
  navidad: { label: "Navidad", description: "Verde pino con rojo y dorado navideño." },
  halloween: { label: "Halloween", description: "Naranja calabaza sobre morado profundo." },
  patrio: { label: "Mes patrio", description: "Verde bandera con acentos cálidos para septiembre." },
  muertos: { label: "Día de Muertos", description: "Rosa mexicano con morado y cempasúchil." },
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
