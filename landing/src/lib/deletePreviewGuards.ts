import type { ProductDeletePreview } from '@tadaima/api'

/**
 * Reglas del modal "Eliminar producto / tomo" con vista previa (2026-10-09).
 * Lógica pura, sin React, para probarla aislada.
 *
 * - "soft" (Solo el producto) respeta `blockers`; "force" (Borrar TODO, solo
 *   admin) respeta `force_blockers` y suma los `force_warnings`.
 * - Con stock > 0 hay que marcar la casilla "entiendo que se pierde".
 * - "force" y los tomos exigen tipear el nombre (como siempre fue).
 */
export type DeleteMode = 'soft' | 'force'
export type DeleteKind = 'product' | 'manga'

export interface DeleteGuardInput {
  preview: ProductDeletePreview | undefined
  mode: DeleteMode
  kind: DeleteKind
  /** Casilla "Entiendo que se pierde el stock". */
  ackStock: boolean
  /** Lo tipeado cuando se exige el nombre. */
  typed: string
  name: string
  busy: boolean
}

export interface DeleteGuards {
  blockers: string[]
  warnings: string[]
  needsStockAck: boolean
  needsTypedName: boolean
  typedOk: boolean
  canSubmit: boolean
}

const normalize = (s: string): string => s.trim().toLowerCase()

export function resolveDeleteGuards(input: DeleteGuardInput): DeleteGuards {
  const { preview, mode, kind } = input
  const isForce = mode === 'force'
  const blockers = preview ? (isForce ? preview.force_blockers : preview.blockers) : []
  const warnings = preview ? (isForce ? [...preview.warnings, ...preview.force_warnings] : preview.warnings) : []
  const needsStockAck = (preview?.stock.total ?? 0) > 0
  const needsTypedName = isForce || kind === 'manga'
  const typedOk = !needsTypedName || normalize(input.typed) === normalize(input.name)
  const canSubmit = !!preview && blockers.length === 0 && (!needsStockAck || input.ackStock) && typedOk && !input.busy

  return { blockers, warnings, needsStockAck, needsTypedName, typedOk, canSubmit }
}
