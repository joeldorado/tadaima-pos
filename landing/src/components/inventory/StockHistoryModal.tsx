import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, History, Info, Loader2, Minus, RefreshCw, X } from 'lucide-react'
import { useAuth } from '@tadaima/auth'
import type { WarehouseCurrentStock } from '@tadaima/api'
import { isAdmin as isAdminRole } from '@/lib/permisos'
import { BUSINESS_TZ, daysAgoLocal, getTodayLocal } from '@/lib/date'
import { buildStockHistory, isInLocalRange, summarizeStockHistory, type StockHistoryRow } from '@/lib/stockHistory'
import { useStockHistoryQuery } from '@/hooks/queries/useInventory'
import { useStoresQuery } from '@/hooks/queries/useStores'

/**
 * Historial de stock de UN producto (2026-11-19): cada entrada y salida por
 * almacén con quién, referencia y el saldo después del movimiento. Gerente y
 * cajero solo ven su tienda (lo limita el servidor); el admin elige tienda.
 * Sirve para encontrar entradas mal capturadas o algo que no se descontó.
 */

const RANGE_PRESETS = [
  { label: '7 días', days: 6 },
  { label: '30 días', days: 29 },
  { label: '90 días', days: 89 },
  { label: '1 año', days: 364 },
] as const

const TONE_COLOR = {
  in: '#059669',
  out: 'var(--td-red)',
  zero: 'var(--td-text-lo)',
} as const

const dateTimeFmt = new Intl.DateTimeFormat('es-MX', {
  timeZone: BUSINESS_TZ,
  day: '2-digit',
  month: 'short',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

function fmtSigned(n: number): string {
  if (n > 0) return `+${fmtQty(n)}`
  if (n < 0) return `−${fmtQty(Math.abs(n))}`
  return '0'
}

function warehouseKind(type: string | null | undefined): string {
  if (type === 'store') return 'Exhibición'
  if (type === 'bodega') return 'Bodega'
  return type ?? ''
}

interface WarehouseOption {
  id: number
  label: string
}

function warehouseLabel(name: string | null | undefined, type: string | null | undefined, storeName: string | null | undefined, showStore: boolean): string {
  const kind = warehouseKind(type)
  const base = kind && name && !name.toLowerCase().includes(kind.toLowerCase()) ? `${name} (${kind})` : (name ?? kind) || 'Almacén'
  return showStore && storeName ? `${storeName} · ${base}` : base
}

export interface StockHistoryModalProps {
  productId: number
  productName: string
  sku?: string | null
  onClose: () => void
}

export function StockHistoryModal({ productId, productName, sku, onClose }: StockHistoryModalProps) {
  const { user } = useAuth()
  const isAdmin = isAdminRole(user?.roles)
  const today = getTodayLocal()

  const [from, setFrom] = useState(() => daysAgoLocal(29))
  const [to, setTo] = useState(today)
  const [storeId, setStoreId] = useState<number | undefined>(undefined)
  const [warehouseId, setWarehouseId] = useState<number | undefined>(undefined)

  const { data: stores = [] } = useStoresQuery({ active: true, enabled: isAdmin })

  const query = useStockHistoryQuery({
    productId,
    from,
    ...(storeId !== undefined ? { storeId } : {}),
    ...(warehouseId !== undefined ? { warehouseId } : {}),
  })
  const data = query.data

  const allRows = useMemo<StockHistoryRow[]>(
    () => (data ? buildStockHistory(data.movements, data.currentStock) : []),
    [data],
  )
  const rows = useMemo(
    () => allRows.filter(r => isInLocalRange(r.movement.created_at, from, to)),
    [allRows, from, to],
  )
  const totals = useMemo(
    () => summarizeStockHistory(rows, { skipInternalMoves: warehouseId === undefined }),
    [rows, warehouseId],
  )
  const mismatches = rows.filter(r => r.computedAfter !== null).length

  // Almacenes visibles: los del stock actual (filtrados por tienda) + los que
  // aparecen en movimientos (un almacén sin fila de inventario también cuenta).
  const visibleStock = useMemo<WarehouseCurrentStock[]>(
    () => (data?.currentStock ?? []).filter(s => storeId === undefined || s.store_id === storeId),
    [data, storeId],
  )
  const showStore = isAdmin && storeId === undefined
  const warehouseOptions = useMemo<WarehouseOption[]>(() => {
    const map = new Map<number, string>()
    for (const s of visibleStock) map.set(s.warehouse_id, warehouseLabel(s.warehouse_name, s.warehouse_type, s.store_name, showStore))
    for (const r of allRows) {
      const w = r.movement.warehouse
      if (w && !map.has(w.id)) map.set(w.id, warehouseLabel(w.name, w.type, w.store_name, showStore))
    }
    return [...map.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [visibleStock, allRows, showStore])

  const stockToday = visibleStock
    .filter(s => warehouseId === undefined || s.warehouse_id === warehouseId)
    .reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)

  const applyPreset = (days: number) => {
    setFrom(daysAgoLocal(days))
    setTo(today)
  }
  const activePreset = to === today ? RANGE_PRESETS.find(p => daysAgoLocal(p.days) === from)?.days : undefined

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="stock-history-title">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-[28px] flex flex-col"
        style={{ background: 'var(--td-popup-bg)', border: '1px solid var(--td-popup-border)', boxShadow: '0 30px 80px rgba(0,0,0,0.35)' }}
      >
        {/* Encabezado */}
        <header className="px-5 sm:px-6 pt-5 pb-4 flex items-start justify-between gap-4" style={{ borderBottom: '1px solid var(--td-divider)' }}>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5" style={{ color: 'var(--td-red)' }}>
              <History size={12} /> Historial de stock
            </p>
            <h2 id="stock-history-title" className="text-lg sm:text-xl font-black truncate mt-1" style={{ color: 'var(--td-text-hi)' }}>{productName}</h2>
            {sku && <p className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--td-text-lo)' }}>{sku}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="p-2 rounded-xl transition-colors hover:opacity-80 disabled:opacity-50"
              style={{ background: 'var(--td-surface-soft)', border: '1px solid var(--td-card-border)' }}
              title="Actualizar"
              aria-label="Actualizar historial"
            >
              <RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} style={{ color: 'var(--td-text-md)' }} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl transition-colors hover:opacity-80"
              style={{ background: 'var(--td-surface-soft)', border: '1px solid var(--td-card-border)' }}
              aria-label="Cerrar"
            >
              <X size={18} style={{ color: 'var(--td-text-md)' }} />
            </button>
          </div>
        </header>

        {/* Filtros */}
        <div className="px-5 sm:px-6 py-3 flex flex-wrap items-end gap-3" style={{ borderBottom: '1px solid var(--td-divider)' }}>
          {isAdmin && (
            <FilterField label="Tienda">
              <select
                value={storeId ?? ''}
                onChange={e => { setStoreId(e.target.value ? Number(e.target.value) : undefined); setWarehouseId(undefined) }}
                style={INPUT_STYLE}
              >
                <option value="">Todas</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FilterField>
          )}
          <FilterField label="Almacén">
            <select
              value={warehouseId ?? ''}
              onChange={e => setWarehouseId(e.target.value ? Number(e.target.value) : undefined)}
              style={INPUT_STYLE}
            >
              <option value="">Todos</option>
              {warehouseOptions.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </FilterField>
          <FilterField label="Desde">
            <input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} style={INPUT_STYLE} />
          </FilterField>
          <FilterField label="Hasta">
            <input type="date" value={to} min={from} max={today} onChange={e => e.target.value && setTo(e.target.value)} style={INPUT_STYLE} />
          </FilterField>
          <div className="flex flex-wrap gap-1.5">
            {RANGE_PRESETS.map(p => {
              const active = activePreset === p.days
              return (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p.days)}
                  className="px-3 h-9 rounded-xl text-xs font-bold transition-colors"
                  style={active
                    ? { background: 'var(--td-red-dim)', border: '1px solid var(--td-red-brd)', color: 'var(--td-red)' }
                    : { background: 'var(--td-surface-soft)', border: '1px solid var(--td-card-border)', color: 'var(--td-text-md)' }}
                  aria-pressed={active}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Resumen */}
        <div className="px-5 sm:px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <SummaryTile label="Entró" value={`+${fmtQty(totals.entradas)}`} color={TONE_COLOR.in} />
          <SummaryTile label="Salió" value={`−${fmtQty(totals.salidas)}`} color={TONE_COLOR.out} />
          <SummaryTile label="Neto del rango" value={fmtSigned(totals.neto)} color="var(--td-text-hi)" />
          <SummaryTile label={warehouseId === undefined ? 'Stock hoy (todos)' : 'Stock hoy'} value={fmtQty(stockToday)} color="var(--td-text-hi)" emphasis />
        </div>

        <p className="mx-5 sm:mx-6 mb-3 px-3 py-2 rounded-xl text-[11px] leading-snug flex gap-2" style={{ background: 'var(--td-surface-muted)', color: 'var(--td-text-md)' }}>
          <Info size={14} className="shrink-0 mt-px" />
          <span>
            El <b>saldo</b> se cuenta hacia atrás desde el stock de hoy de cada almacén. Es aproximado en historia vieja o
            importada: ahí pudo cambiar stock sin dejar movimiento.
            {mismatches > 0 && <> <b style={{ color: '#D97706' }}>⚠ {mismatches === 1 ? '1 ajuste no cuadra' : `${mismatches} ajustes no cuadran`}</b> con la cuenta: después de esa fecha cambió stock sin registro.</>}
          </span>
        </p>

        {/* Tabla */}
        <div className="flex-1 overflow-auto px-2 sm:px-4 pb-4">
          {query.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: 'var(--td-text-lo)' }}>
              <Loader2 size={16} className="animate-spin" /> Cargando movimientos…
            </div>
          ) : query.isError ? (
            <div className="py-16 text-center text-sm" style={{ color: 'var(--td-red)' }}>
              No se pudo cargar el historial. <button className="underline font-bold" onClick={() => void query.refetch()}>Reintentar</button>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm" style={{ color: 'var(--td-text-lo)' }}>
              Sin movimientos de este producto en el rango.
            </div>
          ) : (
            <table className="w-full min-w-[760px] text-sm border-separate border-spacing-0">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--td-table-head-bg)' }}>
                <tr className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--td-text-lo)' }}>
                  <th className="text-left px-3 py-2.5">Fecha</th>
                  <th className="text-left px-3 py-2.5">Movimiento</th>
                  <th className="text-right px-3 py-2.5">Cantidad</th>
                  <th className="text-right px-3 py-2.5">Saldo</th>
                  <th className="text-left px-3 py-2.5">Quién</th>
                  <th className="text-left px-3 py-2.5">Referencia</th>
                  <th className="text-left px-3 py-2.5">Almacén</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => <HistoryRow key={r.movement.id} row={r} showStore={showStore} />)}
              </tbody>
            </table>
          )}
          {data?.truncated && (
            <p className="mt-3 text-center text-[11px]" style={{ color: '#D97706' }}>
              Hay más movimientos de los que caben: se muestran los más recientes. Acorta el rango para ver los más viejos.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const INPUT_STYLE = {
  height: 36,
  borderRadius: 12,
  padding: '0 10px',
  fontSize: 13,
  background: 'var(--td-input-bg)',
  border: '1px solid var(--td-input-border)',
  color: 'var(--td-input-text)',
} as const

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--td-text-lo)' }}>{label}</span>
      {children}
    </label>
  )
}

function SummaryTile({ label, value, color, emphasis = false }: { label: string; value: string; color: string; emphasis?: boolean }) {
  return (
    <div
      className="rounded-2xl px-3.5 py-2.5"
      style={{
        background: emphasis ? 'var(--td-surface-strong)' : 'var(--td-card-bg)',
        border: '1px solid var(--td-card-border)',
      }}
    >
      <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--td-text-lo)' }}>{label}</p>
      <p className="text-xl font-black tabular-nums leading-tight mt-0.5" style={{ color }}>{value}</p>
    </div>
  )
}

function HistoryRow({ row, showStore }: { row: StockHistoryRow; showStore: boolean }) {
  const m = row.movement
  const Icon = row.tone === 'in' ? ArrowUpRight : row.tone === 'out' ? ArrowDownRight : Minus
  const color = TONE_COLOR[row.tone]
  const when = m.created_at ? dateTimeFmt.format(new Date(m.created_at)) : '—'
  const ref = m.reference ?? (m.notes ? m.notes : null)
  const wh = m.warehouse
  const cell = 'px-3 py-2.5 align-top'
  const border = { borderBottom: '1px solid var(--td-divider)' }

  return (
    <tr className="transition-colors hover:bg-[var(--td-hover-bg)]">
      <td className={`${cell} whitespace-nowrap tabular-nums text-xs`} style={{ ...border, color: 'var(--td-text-md)' }}>{when}</td>
      <td className={cell} style={border}>
        <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: 'var(--td-text-hi)' }}>
          <Icon size={14} style={{ color }} aria-hidden />
          {row.label}
        </span>
      </td>
      <td className={`${cell} text-right font-black tabular-nums`} style={{ ...border, color }}>{fmtSigned(row.delta)}</td>
      <td className={`${cell} text-right tabular-nums`} style={border}>
        {row.balanceAfter === null ? (
          <span style={{ color: 'var(--td-text-lo)' }}>—</span>
        ) : (
          <span className="inline-flex items-center justify-end gap-1 font-bold" style={{ color: 'var(--td-text-hi)' }}>
            {row.computedAfter !== null && (
              <span
                title={`El ajuste dejó ${fmtQty(row.balanceAfter)}; contando hacia atrás desde hoy daría ${fmtQty(row.computedAfter)}. Después de esta fecha cambiaron ${fmtSigned(row.computedAfter - row.balanceAfter)} piezas sin movimiento.`}
                aria-label="El saldo no cuadra"
              >
                <AlertTriangle size={13} style={{ color: '#D97706' }} />
              </span>
            )}
            {fmtQty(row.balanceAfter)}
          </span>
        )}
      </td>
      <td className={`${cell} text-xs`} style={{ ...border, color: 'var(--td-text-md)' }}>{m.user?.name ?? '—'}</td>
      <td className={`${cell} text-xs max-w-[220px]`} style={border}>
        {ref ? (
          <span className={`block truncate ${m.reference ? 'font-mono' : ''}`} style={{ color: 'var(--td-text-md)' }} title={[m.reference, m.notes].filter(Boolean).join(' · ')}>
            {ref}
          </span>
        ) : (
          <span style={{ color: 'var(--td-text-lo)' }}>—</span>
        )}
      </td>
      <td className={`${cell} text-xs whitespace-nowrap`} style={{ ...border, color: 'var(--td-text-md)' }}>
        {wh ? warehouseLabel(wh.name, wh.type, wh.store_name, showStore) : '—'}
      </td>
    </tr>
  )
}
