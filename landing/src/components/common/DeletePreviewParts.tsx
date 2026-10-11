import type { ReactNode } from 'react'

/**
 * Piezas compartidas de los modales de "vista previa antes de borrar/cancelar"
 * (Borrar corte, Eliminar producto/tomo, Cancelar catálogo de preventa).
 * Mismo look en todos: celdas de resumen, cajas de avisos/bloqueos y tablas.
 */
export const DELETE_RED = '#ef4444'
export const WARN_AMBER = '#f59e0b'

export function Cell({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'muted' | undefined }) {
  const color = tone === 'danger' ? DELETE_RED : tone === 'muted' ? 'var(--td-text-lo)' : 'var(--td-text-hi)'
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'var(--td-card-bg)', border: '1px solid var(--td-card-border)' }}>
      <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--td-text-lo)' }}>{label}</p>
      <p className="font-black truncate" style={{ color }}>{value}</p>
    </div>
  )
}

export function Box({ tone, title, children }: { tone: 'warn' | 'block'; title: string; children: ReactNode }) {
  const color = tone === 'block' ? DELETE_RED : WARN_AMBER
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: `${color}14`, border: `1px solid ${color}55` }}>
      <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color }}>{title}</p>
      <ul className="list-disc pl-4 space-y-1 text-xs" style={{ color: 'var(--td-text-md)' }}>{children}</ul>
    </div>
  )
}

export interface TableRow {
  cells: string[]
  /** Resalta la fila (p. ej. la tienda del usuario). */
  highlight?: boolean
}

export function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: Array<string[] | TableRow>; empty: string }) {
  const normalized: TableRow[] = rows.map(r => (Array.isArray(r) ? { cells: r } : r))
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--td-text-lo)' }}>{title}</p>
      {normalized.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--td-text-ghost)' }}>{empty}</p>
      ) : (
        <div className="rounded-xl overflow-x-auto" style={{ border: '1px solid var(--td-card-border)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--td-card-bg)' }}>
                {head.map(h => <th key={h} className="text-left px-3 py-2 font-black uppercase tracking-wider text-[9px]" style={{ color: 'var(--td-text-lo)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {normalized.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--td-divider)', background: r.highlight ? `${WARN_AMBER}14` : undefined }}>
                  {r.cells.map((c, j) => (
                    <td key={j} className="px-3 py-1.5" style={{ color: r.highlight ? 'var(--td-text-hi)' : 'var(--td-text-md)', fontWeight: r.highlight ? 800 : undefined }}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
