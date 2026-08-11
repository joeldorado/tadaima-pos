// Branding + shared constants for the TadaimaUS storefront.
// Frozen contract: categories are `figures | manga | tcg | other`.
// Assets de marca DESCARGADOS a public/img/ (originales del sitio Wix del
// cliente — el CDN de Wix muere si cancelan esa suscripción, no hotlinkear).

/**
 * Resuelve un asset de `public/` respetando la base del build (`./`): la
 * tienda se monta en /tadaimaus/ del POS hoy y en la raíz de su propio
 * dominio en la fase futura, con el MISMO bundle. Con el hash router el path
 * del documento nunca cambia, así que las URLs relativas siempre resuelven.
 */
export function assetUrl(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\/+/, '')
}

export const BRAND = {
  legalName: 'Tadaima Okaeri LLC',
  shortName: 'TADAIMA US',
  tagline: 'Your anime store — Welcome home!',
  logoUrl: assetUrl('img/logo.png'),
  heroUrl: assetUrl('img/hero-figures.webp'),
} as const

export const US_CATEGORIES = ['figures', 'manga', 'tcg', 'other'] as const
export type UsCategory = (typeof US_CATEGORIES)[number]

export function isUsCategory(value: string): value is UsCategory {
  return (US_CATEGORIES as readonly string[]).includes(value)
}

export interface ShopCategory {
  readonly slug: UsCategory
  readonly label: string
  readonly blurb: string
}

/**
 * Categorías navegables (nav, sidebar, footer y encabezado de `#/{slug}`).
 * `other` se muestra como **Goods**: sus productos ya salían en el catálogo y
 * en los breadcrumbs con esa etiqueta, así que dejarla fuera del nav creaba
 * una categoría a la que solo se llegaba desde la ficha de un producto.
 */
export const SHOP_CATEGORIES: readonly ShopCategory[] = [
  {
    slug: 'figures',
    label: 'Figures',
    blurb: 'Funko Pop!, scale figures and prize figures from your favorite series.',
  },
  {
    slug: 'manga',
    label: 'Manga',
    blurb: 'English-language volumes, box sets and hard-to-find prints.',
  },
  {
    slug: 'tcg',
    label: 'TCG',
    blurb: 'Booster boxes, premium collections and singles — One Piece, Pokémon and more.',
  },
  {
    slug: 'other',
    label: 'Goods',
    blurb: 'Pins, plushies, apparel and everyday goods from the series you love.',
  },
]

/** Categorías destacadas en los tiles de la home ("Pick your aisle"). */
export const FEATURED_CATEGORIES: readonly ShopCategory[] = SHOP_CATEGORIES.filter(
  (category) => category.slug !== 'other',
)

/** Display label for a listing's category slug. */
export function categoryLabel(slug: string): string {
  const match = SHOP_CATEGORIES.find((category) => category.slug === slug)
  return match ? match.label : 'Goods'
}

// PENDIENTE (Joel): datos REALES de contacto de Tadaima Okaeri LLC.
// Vacío = la UI oculta ese dato (Footer y ContactPage lo saltan) — jamás
// publicar teléfonos/direcciones inventados.
export interface ContactInfo {
  readonly email: string
  readonly phone: string
  readonly location: string
  readonly hours: ReadonlyArray<{ readonly days: string; readonly time: string }>
}

export const CONTACT_INFO: ContactInfo = {
  email: '',
  phone: '',
  location: '',
  hours: [],
}

// PENDIENTE (Joel): URLs REALES de las redes (el Wix las tiene en el footer
// pero las renderiza desde su propia config, no salen en el HTML — hay que
// copiarlas del panel de Wix). Vacío = el footer no pinta ese ícono; jamás
// inventar un perfil que no existe.
export interface SocialLinks {
  readonly facebook: string
  readonly instagram: string
  readonly tiktok: string
}

export const SOCIAL_LINKS: SocialLinks = {
  facebook: '',
  instagram: '',
  tiktok: '',
}

export const CART_STORAGE_KEY = 'tadaimaus-cart-v1'
export const MAX_LINE_QUANTITY = 99
export const MAX_CART_LINES = 50
