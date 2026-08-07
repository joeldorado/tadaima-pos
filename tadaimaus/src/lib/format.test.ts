import { describe, expect, it } from 'vitest'
import { formatUsd } from './format'

describe('formatUsd', () => {
  it('formats decimal strings from the API', () => {
    expect(formatUsd('12.00')).toBe('$12.00 USD')
    expect(formatUsd('9.5')).toBe('$9.50 USD')
  })

  it('formats numbers', () => {
    expect(formatUsd(59.5)).toBe('$59.50 USD')
    expect(formatUsd(0)).toBe('$0.00 USD')
  })

  it('falls back to $0.00 USD for non-numeric input', () => {
    expect(formatUsd('not-a-price')).toBe('$0.00 USD')
    expect(formatUsd(Number.NaN)).toBe('$0.00 USD')
  })
})
