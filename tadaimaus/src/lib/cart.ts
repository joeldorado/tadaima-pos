// Pure cart logic — immutable operations, no React, unit-tested in cart.test.ts.
import type { UsListing } from './api'
import { MAX_CART_LINES, MAX_LINE_QUANTITY } from './constants'

export interface CartLine {
  readonly listingId: number
  readonly name: string
  readonly priceUsd: number
  readonly imageUrl: string | null
  readonly quantity: number
}

/** Adds one unit of a listing (new line, or +1 on the existing line). */
export function addListing(
  lines: readonly CartLine[],
  listing: UsListing,
): readonly CartLine[] {
  const existing = lines.find((line) => line.listingId === listing.id)
  if (existing) {
    return changeQuantity(lines, listing.id, existing.quantity + 1)
  }
  if (lines.length >= MAX_CART_LINES) return lines

  const price = Number.parseFloat(listing.price_usd)
  const newLine: CartLine = {
    listingId: listing.id,
    name: listing.name,
    priceUsd: Number.isFinite(price) ? price : 0,
    imageUrl: listing.image_url,
    quantity: 1,
  }
  return [...lines, newLine]
}

/** Sets a line's quantity, clamped to 1..MAX; a quantity < 1 removes the line. */
export function changeQuantity(
  lines: readonly CartLine[],
  listingId: number,
  quantity: number,
): readonly CartLine[] {
  if (quantity < 1) return removeListing(lines, listingId)
  const clamped = Math.min(Math.trunc(quantity), MAX_LINE_QUANTITY)
  return lines.map((line) =>
    line.listingId === listingId ? { ...line, quantity: clamped } : line,
  )
}

export function removeListing(
  lines: readonly CartLine[],
  listingId: number,
): readonly CartLine[] {
  return lines.filter((line) => line.listingId !== listingId)
}

export function cartSubtotal(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.priceUsd * line.quantity, 0)
}

export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}

// ── localStorage hydration ───────────────────────────────────────────────────

function isStoredLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record['listingId'] === 'number' &&
    Number.isInteger(record['listingId']) &&
    typeof record['name'] === 'string' &&
    typeof record['priceUsd'] === 'number' &&
    Number.isFinite(record['priceUsd']) &&
    (record['imageUrl'] === null || typeof record['imageUrl'] === 'string') &&
    typeof record['quantity'] === 'number' &&
    record['quantity'] >= 1
  )
}

/** Parses a persisted cart defensively — anything malformed yields []. */
export function parseStoredCart(raw: string | null): readonly CartLine[] {
  if (raw === null || raw === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isStoredLine)
      .slice(0, MAX_CART_LINES)
      .map((line) => ({
        ...line,
        quantity: Math.min(Math.trunc(line.quantity), MAX_LINE_QUANTITY),
      }))
  } catch {
    return []
  }
}
