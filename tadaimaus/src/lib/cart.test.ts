import { describe, expect, it } from 'vitest'
import type { UsListing } from './api'
import {
  addListing,
  cartCount,
  cartSubtotal,
  changeQuantity,
  parseStoredCart,
  removeListing,
  type CartLine,
} from './cart'
import { MAX_LINE_QUANTITY } from './constants'

function makeListing(overrides: Partial<UsListing> = {}): UsListing {
  return {
    id: 1,
    name: 'Rengoku Funko Pop',
    description: null,
    price_usd: '25.00',
    image_url: null,
    category: 'figures',
    ...overrides,
  }
}

function makeLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    listingId: 1,
    name: 'Rengoku Funko Pop',
    priceUsd: 25,
    imageUrl: null,
    quantity: 1,
    ...overrides,
  }
}

describe('addListing', () => {
  it('adds a new line with quantity 1 and parsed price', () => {
    // Arrange
    const listing = makeListing()

    // Act
    const result = addListing([], listing)

    // Assert
    expect(result).toEqual([makeLine()])
  })

  it('increments quantity when the listing is already in the cart', () => {
    const lines = [makeLine({ quantity: 2 })]

    const result = addListing(lines, makeListing())

    expect(result).toEqual([makeLine({ quantity: 3 })])
  })

  it('does not mutate the original lines array', () => {
    const lines = [makeLine()]

    addListing(lines, makeListing({ id: 2 }))

    expect(lines).toHaveLength(1)
  })

  it('falls back to price 0 when price_usd is not numeric', () => {
    const result = addListing([], makeListing({ price_usd: 'not-a-price' }))

    expect(result[0]?.priceUsd).toBe(0)
  })

  it('ignores sold-out listings (no new line, no quantity bump)', () => {
    const soldOut = makeListing({ sold_out: true })
    const lines = [makeLine({ listingId: 2, quantity: 1 })]

    expect(addListing([], soldOut)).toEqual([])
    expect(addListing(lines, soldOut)).toBe(lines)
    // Existing line for the same listing does not get bumped either.
    const withLine = [makeLine()]
    expect(addListing(withLine, soldOut)).toBe(withLine)
  })

  it('adds normally when sold_out is absent (old backend payload)', () => {
    const result = addListing([], makeListing())

    expect(result).toHaveLength(1)
  })
})

describe('changeQuantity', () => {
  it('sets the quantity of the matching line only', () => {
    const lines = [makeLine(), makeLine({ listingId: 2, quantity: 5 })]

    const result = changeQuantity(lines, 2, 7)

    expect(result).toEqual([makeLine(), makeLine({ listingId: 2, quantity: 7 })])
  })

  it('clamps the quantity to the maximum', () => {
    const result = changeQuantity([makeLine()], 1, 500)

    expect(result[0]?.quantity).toBe(MAX_LINE_QUANTITY)
  })

  it('removes the line when quantity drops below 1', () => {
    const result = changeQuantity([makeLine()], 1, 0)

    expect(result).toEqual([])
  })
})

describe('removeListing', () => {
  it('removes only the matching line', () => {
    const lines = [makeLine(), makeLine({ listingId: 2 })]

    const result = removeListing(lines, 1)

    expect(result).toEqual([makeLine({ listingId: 2 })])
  })
})

describe('cartSubtotal / cartCount', () => {
  it('sums price × quantity across lines', () => {
    const lines = [
      makeLine({ priceUsd: 25, quantity: 2 }),
      makeLine({ listingId: 2, priceUsd: 9.5, quantity: 1 }),
    ]

    expect(cartSubtotal(lines)).toBe(59.5)
    expect(cartCount(lines)).toBe(3)
  })

  it('returns 0 for an empty cart', () => {
    expect(cartSubtotal([])).toBe(0)
    expect(cartCount([])).toBe(0)
  })
})

describe('parseStoredCart', () => {
  it('restores a valid persisted cart', () => {
    const raw = JSON.stringify([makeLine({ quantity: 3 })])

    expect(parseStoredCart(raw)).toEqual([makeLine({ quantity: 3 })])
  })

  it('returns [] for null, empty, invalid JSON and non-arrays', () => {
    expect(parseStoredCart(null)).toEqual([])
    expect(parseStoredCart('')).toEqual([])
    expect(parseStoredCart('{oops')).toEqual([])
    expect(parseStoredCart('{"a":1}')).toEqual([])
  })

  it('drops malformed lines and clamps oversized quantities', () => {
    const raw = JSON.stringify([
      makeLine(),
      { listingId: 'bad' },
      makeLine({ listingId: 2, quantity: 1000 }),
    ])

    const result = parseStoredCart(raw)

    expect(result).toEqual([
      makeLine(),
      makeLine({ listingId: 2, quantity: MAX_LINE_QUANTITY }),
    ])
  })
})
