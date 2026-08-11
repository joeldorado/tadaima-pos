import { describe, expect, it } from 'vitest'
import type { UsListing } from './api'
import { filterByPriceRange, priceBounds, sortListings } from './sortFilter'

function listing(overrides: Partial<UsListing>): UsListing {
  return {
    id: 1,
    name: 'Item',
    description: null,
    price_usd: '10.00',
    image_url: null,
    category: 'figures',
    ...overrides,
  }
}

const CATALOG: readonly UsListing[] = [
  listing({ id: 1, name: 'Nezuko Figure', price_usd: '38.00' }),
  listing({ id: 2, name: 'Rengoku Figure', price_usd: '45.00' }),
  listing({ id: 3, name: 'Booster Box', price_usd: '5.50' }),
]

describe('sortListings', () => {
  it('keeps input order for "newest"', () => {
    expect(sortListings(CATALOG, 'newest')).toEqual(CATALOG)
  })

  it('sorts by price ascending', () => {
    expect(sortListings(CATALOG, 'price-asc').map((l) => l.id)).toEqual([3, 1, 2])
  })

  it('sorts by price descending', () => {
    expect(sortListings(CATALOG, 'price-desc').map((l) => l.id)).toEqual([2, 1, 3])
  })

  it('sorts by name A-Z', () => {
    expect(sortListings(CATALOG, 'name-asc').map((l) => l.id)).toEqual([3, 1, 2])
  })

  it('sorts by name Z-A', () => {
    expect(sortListings(CATALOG, 'name-desc').map((l) => l.id)).toEqual([2, 1, 3])
  })

  it('does not mutate the input array', () => {
    const copy = [...CATALOG]
    sortListings(CATALOG, 'price-asc')
    expect(CATALOG).toEqual(copy)
  })
})

describe('filterByPriceRange', () => {
  it('keeps only listings within the inclusive range', () => {
    expect(filterByPriceRange(CATALOG, 10, 40).map((l) => l.id)).toEqual([1])
  })

  it('treats an unparsable price as 0', () => {
    const broken = [listing({ id: 9, price_usd: 'not-a-number' })]
    expect(filterByPriceRange(broken, 0, 0)).toEqual(broken)
  })
})

describe('priceBounds', () => {
  it('returns [min, max] across the list', () => {
    expect(priceBounds(CATALOG)).toEqual([5.5, 45])
  })

  it('returns [0, 0] for an empty list', () => {
    expect(priceBounds([])).toEqual([0, 0])
  })
})
