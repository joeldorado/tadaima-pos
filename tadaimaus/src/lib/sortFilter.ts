// Pure client-side sort + price-range filter over an already-fetched catalog
// page (the public API has no `sort`/`price` params — see UsCatalogController).
import type { UsListing } from './api'

export const SORT_OPTIONS = [
  'newest',
  'price-asc',
  'price-desc',
  'name-asc',
  'name-desc',
] as const

export type SortOption = (typeof SORT_OPTIONS)[number]

export const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest',
  'price-asc': 'Price (low to high)',
  'price-desc': 'Price (high to low)',
  'name-asc': 'Name A-Z',
  'name-desc': 'Name Z-A',
}

function priceOf(listing: UsListing): number {
  const amount = Number.parseFloat(listing.price_usd)
  return Number.isFinite(amount) ? amount : 0
}

/** `newest` keeps the backend's own order (already `created_at desc`). */
export function sortListings(
  listings: readonly UsListing[],
  sortBy: SortOption,
): readonly UsListing[] {
  if (sortBy === 'newest') return listings

  const sorted = [...listings]
  switch (sortBy) {
    case 'price-asc':
      return sorted.sort((a, b) => priceOf(a) - priceOf(b))
    case 'price-desc':
      return sorted.sort((a, b) => priceOf(b) - priceOf(a))
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    case 'name-desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name))
  }
}

export function filterByPriceRange(
  listings: readonly UsListing[],
  min: number,
  max: number,
): readonly UsListing[] {
  return listings.filter((listing) => {
    const price = priceOf(listing)
    return price >= min && price <= max
  })
}

/** `[0, 0]` when the list is empty — callers should disable the price UI in that case. */
export function priceBounds(listings: readonly UsListing[]): readonly [number, number] {
  if (listings.length === 0) return [0, 0]
  const prices = listings.map(priceOf)
  return [Math.min(...prices), Math.max(...prices)]
}
