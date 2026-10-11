import { describe, expect, it } from 'vitest'
import type { ProductDeletePreview } from '@tadaima/api'
import { resolveDeleteGuards, type DeleteGuardInput } from './deletePreviewGuards'

function makePreview(overrides: Partial<ProductDeletePreview> = {}): ProductDeletePreview {
  return {
    product: { id: 1, name: 'Figura Goku', sku: 'SKU-1', product_type: 'product', active: true },
    stock: { total: 0, central: 0, movements_count: 0, stores: [] },
    sales: { count: 0, last_sold_at: null },
    layaways: { total: 0, open: 0 },
    presales: { catalogs: 0, open_items: 0 },
    transfers: { pending: 0 },
    bundles: { component_of: [], assembled_stock: 0 },
    promos: { count: 0 },
    counts: { stock_total: 0, layaways: 0, transfers_pending: 0 },
    warnings: [],
    force_warnings: [],
    blockers: [],
    force_blockers: [],
    ...overrides,
  }
}

function input(overrides: Partial<DeleteGuardInput> = {}): DeleteGuardInput {
  return { preview: makePreview(), mode: 'soft', kind: 'product', ackStock: false, typed: '', name: 'Figura Goku', busy: false, ...overrides }
}

describe('resolveDeleteGuards', () => {
  it('sin vista previa no deja enviar', () => {
    // Arrange / Act
    const guards = resolveDeleteGuards(input({ preview: undefined }))

    // Assert
    expect(guards.canSubmit).toBe(false)
    expect(guards.blockers).toEqual([])
  })

  it('producto sin stock ni bloqueos se elimina directo', () => {
    const guards = resolveDeleteGuards(input())

    expect(guards.needsStockAck).toBe(false)
    expect(guards.needsTypedName).toBe(false)
    expect(guards.canSubmit).toBe(true)
  })

  it('con stock exige la casilla de "entiendo que se pierde"', () => {
    const preview = makePreview({ stock: { total: 7, central: 0, movements_count: 0, stores: [] } })

    expect(resolveDeleteGuards(input({ preview })).canSubmit).toBe(false)
    expect(resolveDeleteGuards(input({ preview, ackStock: true })).canSubmit).toBe(true)
  })

  it('"Borrar TODO" exige tipear el nombre sin importar mayúsculas ni espacios', () => {
    const base = input({ mode: 'force' })

    expect(resolveDeleteGuards(base).needsTypedName).toBe(true)
    expect(resolveDeleteGuards(base).canSubmit).toBe(false)
    expect(resolveDeleteGuards({ ...base, typed: '  figura goku ' }).canSubmit).toBe(true)
  })

  it('los tomos siempre exigen tipear el nombre', () => {
    const base = input({ kind: 'manga', name: 'Naruto Vol. 3' })

    expect(resolveDeleteGuards(base).canSubmit).toBe(false)
    expect(resolveDeleteGuards({ ...base, typed: 'Naruto Vol. 3' }).canSubmit).toBe(true)
  })

  it('usa los bloqueos del modo activo', () => {
    const preview = makePreview({ blockers: ['tiene 1 apartado(s)'], force_blockers: [] })

    const soft = resolveDeleteGuards(input({ preview }))
    const force = resolveDeleteGuards(input({ preview, mode: 'force', typed: 'Figura Goku' }))

    expect(soft.blockers).toEqual(['tiene 1 apartado(s)'])
    expect(soft.canSubmit).toBe(false)
    expect(force.blockers).toEqual([])
    expect(force.canSubmit).toBe(true)
  })

  it('un componente de paquete bloquea los dos modos', () => {
    const preview = makePreview({ blockers: ['es componente'], force_blockers: ['es componente'] })

    expect(resolveDeleteGuards(input({ preview })).canSubmit).toBe(false)
    expect(resolveDeleteGuards(input({ preview, mode: 'force', typed: 'Figura Goku' })).canSubmit).toBe(false)
  })

  it('"Borrar TODO" suma los avisos de apartados', () => {
    const preview = makePreview({ warnings: ['stock'], force_warnings: ['apartados'] })

    expect(resolveDeleteGuards(input({ preview })).warnings).toEqual(['stock'])
    expect(resolveDeleteGuards(input({ preview, mode: 'force' })).warnings).toEqual(['stock', 'apartados'])
  })

  it('mientras está borrando no deja volver a enviar', () => {
    expect(resolveDeleteGuards(input({ busy: true })).canSubmit).toBe(false)
  })
})
