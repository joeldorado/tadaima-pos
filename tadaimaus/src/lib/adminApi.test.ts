import { describe, expect, it } from 'vitest'
import { absoluteImageUrl, isAdmin, mapListing, mapOrder } from './adminApi'

// En pruebas no hay VITE_API_URL ni PROD, así que resolveApiBase() cae al
// fallback de desarrollo y el origen es http://127.0.0.1:8000.
const ORIGIN = 'http://127.0.0.1:8000'

describe('absoluteImageUrl', () => {
  it('leaves absolute URLs untouched', () => {
    expect(absoluteImageUrl('https://storage.googleapis.com/b/a.jpg')).toBe(
      'https://storage.googleapis.com/b/a.jpg',
    )
    expect(absoluteImageUrl('http://cdn.example.com/a.jpg')).toBe(
      'http://cdn.example.com/a.jpg',
    )
    expect(absoluteImageUrl('//cdn.example.com/a.jpg')).toBe('//cdn.example.com/a.jpg')
  })

  it('resolves backend-relative paths against the API origin, not the storefront', () => {
    // Es el caso del disco `public`: Storage::url() devuelve "/storage/...".
    expect(absoluteImageUrl('/storage/us-listings/a.jpg')).toBe(
      `${ORIGIN}/storage/us-listings/a.jpg`,
    )
    expect(absoluteImageUrl('us-img/products/a.jpg')).toBe(`${ORIGIN}/us-img/products/a.jpg`)
  })

  it('treats null and empty string as "no photo"', () => {
    expect(absoluteImageUrl(null)).toBeNull()
    expect(absoluteImageUrl('')).toBeNull()
  })
})

describe('mapListing', () => {
  const raw = {
    id: 7,
    name: 'Rengoku Figure',
    description: null,
    price_usd: '45.00',
    category: 'figures',
    image_url: null,
    visible: true,
    in_stock: true,
    is_custom: true,
    created_at: '2026-08-01T10:00:00Z',
  }

  it('coerces the decimal string the backend sends into a number', () => {
    expect(mapListing(raw).price_usd).toBe(45)
    expect(mapListing({ ...raw, price_usd: '1234.56' }).price_usd).toBe(1234.56)
  })

  it('falls back to 0 instead of NaN when the price is unusable', () => {
    expect(mapListing({ ...raw, price_usd: 'oops' }).price_usd).toBe(0)
  })

  it('keeps unknown categories inside the frozen contract', () => {
    expect(mapListing({ ...raw, category: 'figures' }).category).toBe('figures')
    expect(mapListing({ ...raw, category: 'weird' }).category).toBe('other')
  })

  it('assumes custom + in stock when the backend omits those flags', () => {
    const { in_stock: _stock, is_custom: _custom, ...partial } = raw
    const mapped = mapListing(partial)
    expect(mapped.in_stock).toBe(true)
    expect(mapped.is_custom).toBe(true)
  })

  it('defaults sold_out to false when an old backend omits it', () => {
    expect(mapListing(raw).sold_out).toBe(false)
    expect(mapListing({ ...raw, sold_out: true }).sold_out).toBe(true)
  })
})

describe('mapOrder', () => {
  const raw = {
    id: 3,
    order_number: 'TUS-000003',
    customer_name: 'John Doe',
    customer_email: 'john@example.com',
    customer_phone: '+1 619 555 0100',
    total_usd: '65.00',
    status: 'new',
    created_at: '2026-08-12T10:00:00Z',
    items: [
      {
        id: 9,
        name: 'Rengoku Figure',
        price_usd: '12.50',
        quantity: 2,
        line_total_usd: '25.00',
      },
    ],
  }

  it('coerces the decimal strings the backend sends into numbers', () => {
    const mapped = mapOrder(raw)
    expect(mapped.total_usd).toBe(65)
    expect(mapped.items[0]?.price_usd).toBe(12.5)
    expect(mapped.items[0]?.line_total_usd).toBe(25)
  })

  it('keeps unknown statuses inside the frozen contract', () => {
    expect(mapOrder(raw).status).toBe('new')
    expect(mapOrder({ ...raw, status: 'weird' }).status).toBe('new')
    expect(mapOrder({ ...raw, status: 'cancelled' }).status).toBe('cancelled')
  })

  it('tolerates a payload without items', () => {
    const { items: _items, ...partial } = raw
    expect(mapOrder(partial).items).toEqual([])
  })
})

describe('isAdmin', () => {
  const base = { id: 1, name: 'A', email: 'a@b.c' }

  it('accepts every admin-flavoured role, case-insensitively', () => {
    expect(isAdmin({ ...base, roles: ['admin'] })).toBe(true)
    expect(isAdmin({ ...base, roles: ['Owner'] })).toBe(true)
    expect(isAdmin({ ...base, roles: ['cajero', 'SUPER_ADMIN'] })).toBe(true)
  })

  it('rejects POS-only roles — the backend would 403 every US call', () => {
    expect(isAdmin({ ...base, roles: ['cajero'] })).toBe(false)
    expect(isAdmin({ ...base, roles: ['gerente'] })).toBe(false)
    expect(isAdmin({ ...base, roles: [] })).toBe(false)
  })
})
