import { describe, expect, it } from 'vitest'
import { mapCustomerOrder } from './customerApi'

describe('mapCustomerOrder', () => {
  const raw = {
    id: 3,
    order_number: 'TUS-000003',
    status: 'new',
    total_usd: '65.00',
    created_at: '2026-08-12T10:00:00Z',
    shipping: {
      address: '742 Evergreen Terrace',
      city: 'San Diego',
      state: 'CA',
      zip: '92101',
      country: 'United States',
    },
    items: [
      { id: 9, name: 'Rengoku Figure', price_usd: '12.50', quantity: 2, line_total_usd: '25.00' },
    ],
  }

  it('coerces decimal strings into numbers', () => {
    const mapped = mapCustomerOrder(raw)
    expect(mapped.total_usd).toBe(65)
    expect(mapped.items[0]?.price_usd).toBe(12.5)
    expect(mapped.shipping.city).toBe('San Diego')
  })

  it('keeps unknown statuses inside the frozen contract', () => {
    expect(mapCustomerOrder({ ...raw, status: 'weird' }).status).toBe('new')
  })

  it('tolerates legacy payloads without shipping or items', () => {
    const { shipping: _shipping, items: _items, ...partial } = raw
    const mapped = mapCustomerOrder(partial)
    expect(mapped.shipping.address).toBeNull()
    expect(mapped.items).toEqual([])
  })
})
