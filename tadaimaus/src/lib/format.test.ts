import { describe, expect, it } from 'vitest'
import { formatUsd } from './format'

describe('formatUsd', () => {
  it('formats decimal strings from the API', () => {
    expect(formatUsd('12.00')).toBe('USD 12.00')
    expect(formatUsd('9.5')).toBe('USD 9.50')
  })

  it('formats numbers', () => {
    expect(formatUsd(59.5)).toBe('USD 59.50')
    expect(formatUsd(0)).toBe('USD 0.00')
  })

  it('falls back to USD 0.00 for non-numeric input', () => {
    expect(formatUsd('not-a-price')).toBe('USD 0.00')
    expect(formatUsd(Number.NaN)).toBe('USD 0.00')
  })
})
