import { describe, expect, it } from 'vitest'
import { compareWarehouses, warehouseOptionLabel } from './warehouse'

const macro = { name: 'Tadaima MACRO' }

describe('warehouseOptionLabel', () => {
  it('distingue los 2 almacenes de la misma tienda (piso vs almacén)', () => {
    expect(warehouseOptionLabel({ name: 'Tadaima Macro', type: 'store', store: macro }))
      .toBe('Tadaima MACRO · Exhibición (piso)')
    expect(warehouseOptionLabel({ name: 'Bodega — Tadaima Macro', type: 'bodega', store: macro }))
      .toBe('Tadaima MACRO · Bodega (almacén)')
  })

  it('central y almacenes sin tienda usan su propio nombre', () => {
    expect(warehouseOptionLabel({ name: 'Central', type: 'central', store: null }))
      .toBe('Central · Central')
    expect(warehouseOptionLabel({ name: 'Viejo' })).toBe('Viejo')
    expect(warehouseOptionLabel({})).toBe('—')
  })
})

describe('compareWarehouses', () => {
  it('ordena por tienda y dentro de la tienda Exhibición antes que Bodega', () => {
    const list = [
      { id: 6, type: 'bodega', store: macro },
      { id: 2, type: 'bodega', store: { name: 'Tadaima CENTRO' } },
      { id: 5, type: 'store', store: macro },
      { id: 1, type: 'store', store: { name: 'Tadaima CENTRO' } },
    ]
    expect([...list].sort(compareWarehouses).map(w => w.id)).toEqual([1, 2, 5, 6])
  })
})
