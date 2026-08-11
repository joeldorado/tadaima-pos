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

  it('parses product routes (trailing slash tolerant)', () => {
    expect(parseRoute('#/product/42')).toEqual({ page: 'product', id: 42 })
    expect(parseRoute('#/product/42/')).toEqual({ page: 'product', id: 42 })
  })

  it('parses the admin panel routes', () => {
    expect(parseRoute('#/admin')).toEqual({ page: 'admin', section: 'listings' })
    expect(parseRoute('#/admin/')).toEqual({ page: 'admin', section: 'listings' })
    expect(parseRoute('#/admin/leads')).toEqual({ page: 'admin', section: 'leads' })
    expect(parseRoute('#/ADMIN/LEADS')).toEqual({ page: 'admin', section: 'leads' })
  })

  it('keeps unknown admin sections inside the panel instead of bouncing home', () => {
    expect(parseRoute('#/admin/nope')).toEqual({ page: 'admin', section: 'listings' })
  })

  it('falls back to home for unknown hashes', () => {
    expect(parseRoute('#/nope')).toEqual({ page: 'home' })
    expect(parseRoute('#main')).toEqual({ page: 'home' })
    expect(parseRoute('#/product/')).toEqual({ page: 'home' })
    expect(parseRoute('#/product/abc')).toEqual({ page: 'home' })
  })
})

describe('routeToHash', () => {
  it('is the inverse of parseRoute for every page', () => {
    expect(routeToHash({ page: 'home' })).toBe('#/')
    expect(routeToHash({ page: 'category', category: 'tcg' })).toBe('#/tcg')
    expect(routeToHash({ page: 'product', id: 42 })).toBe('#/product/42')
    expect(routeToHash({ page: 'contact' })).toBe('#/contact')
    expect(routeToHash({ page: 'checkout' })).toBe('#/checkout')
    expect(routeToHash({ page: 'admin', section: 'listings' })).toBe('#/admin')
    expect(routeToHash({ page: 'admin', section: 'leads' })).toBe('#/admin/leads')
  })
})
