import { describe, expect, it } from 'vitest'
import { parseRoute, routeToHash } from './routes'

describe('parseRoute', () => {
  it('parses the home routes', () => {
    expect(parseRoute('')).toEqual({ page: 'home' })
    expect(parseRoute('#')).toEqual({ page: 'home' })
    expect(parseRoute('#/')).toEqual({ page: 'home' })
  })

  it('parses category routes (case-insensitive, trailing slash tolerant)', () => {
    expect(parseRoute('#/figures')).toEqual({ page: 'category', category: 'figures' })
    expect(parseRoute('#/MANGA/')).toEqual({ page: 'category', category: 'manga' })
    expect(parseRoute('#/tcg')).toEqual({ page: 'category', category: 'tcg' })
  })

  it('parses contact and checkout', () => {
    expect(parseRoute('#/contact')).toEqual({ page: 'contact' })
    expect(parseRoute('#/checkout')).toEqual({ page: 'checkout' })
  })

  it('falls back to home for unknown hashes', () => {
    expect(parseRoute('#/nope')).toEqual({ page: 'home' })
    expect(parseRoute('#main')).toEqual({ page: 'home' })
  })
})

describe('routeToHash', () => {
  it('is the inverse of parseRoute for every page', () => {
    expect(routeToHash({ page: 'home' })).toBe('#/')
    expect(routeToHash({ page: 'category', category: 'tcg' })).toBe('#/tcg')
    expect(routeToHash({ page: 'contact' })).toBe('#/contact')
    expect(routeToHash({ page: 'checkout' })).toBe('#/checkout')
  })
})
