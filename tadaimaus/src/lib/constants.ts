// Branding + shared constants for the TadaimaUS demo storefront.
// Frozen contract: categories are `figures | manga | tcg | other`.
// Assets de marca DESCARGADOS a public/img/ (originales del sitio Wix del
// cliente — el CDN de Wix muere si cancelan esa suscripción, no hotlinkear).

export const BRAND = {
  legalName: 'Tadaima Okaeri LLC',
  shortName: 'TADAIMA US',
  tagline: 'Your anime store in the USA — Welcome home!',
  logoUrl: '/img/logo.png',
  heroUrl: '/img/hero.jpg',
} as const

export const US_CATEGORIES = ['figures', 'manga', 'tcg', 'other'] as const
export type UsCategory = (typeof US_CATEGORIES)[number]

export function isUsCategory(value: string): value is UsCategory {
  return (US_CATEGORIES as readonly string[]).includes(value)
}

export interface ShopCategory {
  readonly slug: UsCategory
  readonly label: string
  readonly jpLabel: string
  readonly blurb: string
}

/** Categories shown in the nav + home tiles (`other` stays internal-only). */
export const SHOP_CATEGORIES: readonly ShopCategory[] = [
  {
    slug: 'figures',
    label: 'Figures',
    jpLabel: 'フィギュア',
    blurb: 'Funko Pop!, scale figures and prize figures from your favorite series.',
  },
  {
    slug: 'manga',
    label: 'Manga',
    jpLabel: 'マンガ',
    blurb: 'English-language volumes, box sets and hard-to-find prints.',
  },
  {
    slug: 'tcg',
    label: 'TCG',
    jpLabel: 'カードゲーム',
    blurb: 'Booster boxes, premium collections and singles — One Piece, Pokémon and more.',
  },
]

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

export const CART_STORAGE_KEY = 'tadaimaus-cart-v1'
export const MAX_LINE_QUANTITY = 99
export const MAX_CART_LINES = 50
export const FEATURED_COUNT = 8
