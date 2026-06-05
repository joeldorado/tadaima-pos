import { useReducer, useState, useCallback, useRef, type CSSProperties } from 'react'
import {
  X, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, BookOpen,
  DollarSign, Warehouse, Save, ChevronDown, ChevronRight,
  Camera, Scan,
} from 'lucide-react'
import { createManga, updateMangaInventory, uploadMangaImage } from '@tadaima/api'
import type { ApiError } from '@tadaima/api'
import { EDITORIALS, MANGA_GENRES } from './mangaConstants'
import { generateBarcode } from '@/lib/barcode'

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  glass: {
    background: 'var(--td-panel-bg)',
    backdropFilter: 'blur(28px) saturate(160%)',
    WebkitBackdropFilter: 'blur(28px) saturate(160%)',
    border: '1px solid var(--td-panel-border)',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
  } as CSSProperties,
  input: {
    background: 'var(--td-input-bg)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--td-input-border)',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)',
    color: 'var(--td-input-text)',
  } as CSSProperties,
  btnRed: {
    background: 'linear-gradient(135deg, #CC2200 0%, #FF4422 100%)',
    borderRadius: '9999px',
    border: '1px solid rgba(255,120,90,0.3)',
    boxShadow: '0 0 28px rgba(204,34,0,0.45), 0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,180,160,0.25)',
    color: '#ffffff',
  } as CSSProperties,
  chipActive: {
    background: 'linear-gradient(135deg, #CC2200, #FF4422)',
    border: '1px solid rgba(255,120,90,0.4)',
    boxShadow: '0 0 16px rgba(204,34,0,0.35), inset 0 1px 0 rgba(255,160,140,0.2)',
    color: '#fff',
  } as CSSProperties,
  textPrimary:   'var(--td-text-hi)',
  textSecondary: 'var(--td-text-md)',
  textMuted:     'var(--td-text-lo)',
  redBright:     '#FF4422',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractMsg(err: unknown): string {
  if (err && typeof err === 'object') {
    if ('message' in err && typeof (err as ApiError).message === 'string') {
      return (err as ApiError).message
    }
  }
  if (err instanceof Error) return err.message
  return 'Error al registrar'
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'tomos' | 'precios' | 'inventario'

interface SeriesFields {
  nombre: string; editorial: string; genero: string
  precioPublico: string; margenPct: string
}

interface PriceFields {
  price1: string; price2: string; price3: string; price4: string; price5: string
}

interface TomoStock {
  tomoId: string
  cantidad: string
}

interface WarehouseGroup {
  id: string
  warehouseId: number
  expanded: boolean
  tomoStocks: TomoStock[]
}

type VolumeStatus = 'idle' | 'loading' | 'ok' | 'error'

interface VolumeRow {
  id: string; numero: string; isbn: string
  imageFile?: File; imagePreview?: string
  status: VolumeStatus; errorMsg?: string
}

type TomoAction =
  | { type: 'ADD'; row: VolumeRow }
  | { type: 'REMOVE'; id: string }
  | { type: 'UPDATE'; id: string; field: 'numero' | 'isbn'; value: string }
  | { type: 'SET_IMAGE'; id: string; imageFile: File; imagePreview: string }
  | { type: 'SET_STATUS'; id: string; status: VolumeStatus; errorMsg?: string }

function makeRow(): VolumeRow {
  return { id: crypto.randomUUID(), numero: '', isbn: '', status: 'idle' }
}

function tomoReducer(state: VolumeRow[], action: TomoAction): VolumeRow[] {
  switch (action.type) {
    case 'ADD':        return [...state, action.row]
    case 'REMOVE':     return state.filter(r => r.id !== action.id)
    case 'UPDATE':     return state.map(r => r.id === action.id ? { ...r, [action.field]: action.value } : r)
    case 'SET_IMAGE':  return state.map(r => r.id === action.id ? { ...r, imageFile: action.imageFile, imagePreview: action.imagePreview } : r)
    case 'SET_STATUS': return state.map(r => r.id === action.id ? { ...r, status: action.status, errorMsg: action.errorMsg } : r)
    default:           return state
  }
}

const PRICE_LABELS = ['Precio A (Default)', 'Precio B', 'Precio C', 'Precio D', 'Precio E'] as const
const PRICE_KEYS   = ['price1', 'price2', 'price3', 'price4', 'price5'] as const

// ─── Props ────────────────────────────────────────────────────────────────────

interface Location {
  warehouseId: number; name: string; store: string; type: 'central' | 'store'
}

interface Props {
  onClose: () => void
  onSuccess: () => void
  locations?: Location[]
  canViewCost?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MangaBatchModal({ onClose, onSuccess, locations = [], canViewCost = false }: Props) {
  const [tab, setTab] = useState<Tab>('tomos')

  const [series, setSeries] = useState<SeriesFields>({
    nombre: '', editorial: '', genero: '', precioPublico: '', margenPct: '30',
  })
  const [prices, setPrices] = useState<PriceFields>({
    price1: '', price2: '', price3: '', price4: '', price5: '',
  })

  // Inventory: tienda groups, each with per-tomo quantities
  const [warehouseGroups, setWarehouseGroups] = useState<WarehouseGroup[]>([])
  const [addWarehouseId, setAddWarehouseId] = useState<number | ''>('')

  const [tomos, dispatch] = useReducer(tomoReducer, [makeRow()])
  const [submitting, setSubmitting] = useState(false)

  // ── costo = precio × (1 − margen/100) ─────────────────────────────────────
  const costoReal = (() => {
    const p = parseFloat(series.precioPublico), m = parseFloat(series.margenPct)
    return (!isNaN(p) && !isNaN(m) && m >= 0 && m < 100) ? p * (1 - m / 100) : null
  })()

  const nombreOk = !!series.nombre.trim()
  const precioOk = !!series.precioPublico.trim() && parseFloat(series.precioPublico) > 0
  const tomosOk  = tomos.some(t => t.numero.trim() !== '' || t.isbn.trim() !== '')

  const tabValid: Record<Tab, boolean> = {
    tomos:      nombreOk,
    precios:    precioOk,
    inventario: tomosOk,
  }

  const canSave = nombreOk && precioOk && tomosOk && !submitting

  const successCount = tomos.filter(t => t.status === 'ok').length
  const errorCount   = tomos.filter(t => t.status === 'error').length
  const pendingCount = tomos.filter(t => t.status !== 'ok').length

  const assignedWarehouseIds = new Set(warehouseGroups.map(g => g.warehouseId))
  const availableLocs = locations.filter(l => !assignedWarehouseIds.has(l.warehouseId))

  // ── Tomo handlers — also sync warehouse groups ─────────────────────────────

  function handleAddTomo() {
    const row = makeRow()
    dispatch({ type: 'ADD', row })
    setWarehouseGroups(prev => prev.map(g => ({
      ...g,
      tomoStocks: [...g.tomoStocks, { tomoId: row.id, cantidad: '0' }],
    })))
  }

  function handleRemoveTomo(id: string) {
    dispatch({ type: 'REMOVE', id })
    setWarehouseGroups(prev => prev.map(g => ({
      ...g,
      tomoStocks: g.tomoStocks.filter(s => s.tomoId !== id),
    })))
  }

  // ── Warehouse group handlers ───────────────────────────────────────────────

  function handleAddWarehouse() {
    if (addWarehouseId === '') return
    setWarehouseGroups(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        warehouseId: addWarehouseId as number,
        expanded: true,
        tomoStocks: tomos.map(t => ({ tomoId: t.id, cantidad: '0' })),
      },
    ])
    setAddWarehouseId('')
  }

  function toggleGroup(id: string) {
    setWarehouseGroups(prev => prev.map(g => g.id === id ? { ...g, expanded: !g.expanded } : g))
  }

  function removeGroup(id: string) {
    setWarehouseGroups(prev => prev.filter(g => g.id !== id))
  }

  function removeTomoFromGroup(groupId: string, tomoId: string) {
    setWarehouseGroups(prev => prev.map(g =>
      g.id === groupId
        ? { ...g, tomoStocks: g.tomoStocks.filter(s => s.tomoId !== tomoId) }
        : g
    ))
  }

  function updateCantidad(groupId: string, tomoId: string, val: string) {
    setWarehouseGroups(prev => prev.map(g =>
      g.id === groupId
        ? { ...g, tomoStocks: g.tomoStocks.map(s => s.tomoId === tomoId ? { ...s, cantidad: val } : s) }
        : g
    ))
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!canSave) return
    setSubmitting(true)

    const precio = parseFloat(series.precioPublico)
    const margen = parseFloat(series.margenPct)
    const toPrice = (v: string) => v.trim() !== '' ? parseFloat(v) : null

    let anyError = false

    for (const tomo of tomos) {
      if (tomo.status === 'ok') continue
      dispatch({ type: 'SET_STATUS', id: tomo.id, status: 'loading' })
      try {
        // Stock for this tomo = sum across all its warehouse quantities
        const totalStock = warehouseGroups.reduce((sum, g) => {
          const s = g.tomoStocks.find(ts => ts.tomoId === tomo.id)
          return sum + (parseInt(s?.cantidad || '0') || 0)
        }, 0)

        const manga = await createManga({
          name: series.nombre.trim(),
          volume_number: tomo.numero !== '' ? parseInt(tomo.numero, 10) : null,
          editorial: series.editorial || null,
          code: tomo.isbn.trim() || null,
          genre: series.genero || null,
          public_price: precio,
          profit_margin_percent: margen,
          active: true,
          price_1: toPrice(prices.price1),
          price_2: toPrice(prices.price2),
          price_3: toPrice(prices.price3),
          price_4: toPrice(prices.price4),
          price_5: toPrice(prices.price5),
          stock: totalStock,
        })

        // Upload image if provided (non-blocking on failure)
        if (tomo.imageFile) {
          await uploadMangaImage(manga.id, tomo.imageFile).catch(() => {})
        }

        // Per-warehouse inventory for this specific tomo
        await Promise.all(
          warehouseGroups.map(g => {
            const s = g.tomoStocks.find(ts => ts.tomoId === tomo.id)
            const qty = parseInt(s?.cantidad || '0') || 0
            return updateMangaInventory(manga.id, g.warehouseId, qty)
          })
        )

        dispatch({ type: 'SET_STATUS', id: tomo.id, status: 'ok' })
      } catch (err: unknown) {
        anyError = true
        dispatch({ type: 'SET_STATUS', id: tomo.id, status: 'error', errorMsg: extractMsg(err) })
      }
    }

    setSubmitting(false)
    if (!anyError) { onSuccess(); onClose() }
  }, [canSave, series, prices, warehouseGroups, tomos, onSuccess, onClose])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-[32px] flex flex-col shadow-2xl"
        style={T.glass}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(204,34,0,0.15)', border: '1px solid rgba(204,34,0,0.3)', color: T.redBright }}>
              <BookOpen size={16} />
            </div>
            <div>
              <h2 className="text-xl font-black" style={{ color: T.textPrimary }}>Alta de Tomos</h2>
              <p className="text-xs" style={{ color: T.textSecondary }}>Librería · Manga · Lote</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
            <X size={20} style={{ color: T.textSecondary }} />
          </button>
        </div>

        {/* ── Checklist bar ───────────────────────────────────────────────── */}
        <div className="px-6 py-2.5 flex items-center gap-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {([
            { label: 'Nombre',             done: nombreOk },
            { label: 'Precio A',           done: precioOk },
            { label: `${tomos.length} tomo${tomos.length !== 1 ? 's' : ''}`, done: tomosOk },
          ]).map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              {item.done
                ? <CheckCircle2 size={11} style={{ color: '#4ade80' }} />
                : <div className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: 'rgba(255,255,255,0.18)' }} />
              }
              <span style={{ fontSize: 10, fontWeight: 600, color: item.done ? T.textMuted : T.textSecondary, textDecoration: item.done ? 'line-through' : 'none' }}>
                {item.label}
              </span>
            </div>
          ))}
          {errorCount > 0 && (
            <span className="ml-auto text-[10px] font-bold" style={{ color: T.redBright }}>{errorCount} con error</span>
          )}
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div className="flex px-6 pt-4 gap-4">
          {([
            { id: 'tomos' as Tab,      label: `Tomos (${tomos.length})`, icon: BookOpen },
            { id: 'precios' as Tab,    label: 'Precios',                 icon: DollarSign },
            { id: 'inventario' as Tab, label: 'Inventario',              icon: Warehouse },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={tab === t.id ? T.chipActive : { color: T.textMuted }}
            >
              <t.icon size={14} />
              {t.label}
              {!tabValid[t.id] && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide" style={{ background: 'rgba(224,34,26,0.18)', color: '#FF6644' }}>
                  req
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ── TAB: Tomos ──────────────────────────────────────────────── */}
          {tab === 'tomos' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Nombre de la Serie *</label>
                  <input
                    className="w-full px-4 py-3 rounded-2xl outline-none"
                    style={T.input}
                    placeholder="Ej. Naruto, Attack on Titan, Berserk…"
                    value={series.nombre}
                    onChange={e => setSeries(s => ({ ...s, nombre: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Editorial</label>
                    <select className="w-full px-4 py-3 rounded-2xl outline-none appearance-none" style={T.input}
                      value={series.editorial} onChange={e => setSeries(s => ({ ...s, editorial: e.target.value }))}>
                      <option value="">— Seleccionar —</option>
                      {EDITORIALS.map(ed => <option key={ed} value={ed}>{ed}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Género</label>
                    <select className="w-full px-4 py-3 rounded-2xl outline-none appearance-none" style={T.input}
                      value={series.genero} onChange={e => setSeries(s => ({ ...s, genero: e.target.value }))}>
                      <option value="">— Seleccionar —</option>
                      {MANGA_GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>
                  Tomos del lote — {tomos.length}
                </label>
                {tomos.map((tomo, idx) => (
                  <TomoCard
                    key={tomo.id} tomo={tomo} index={idx} inputStyle={T.input}
                    onRemove={tomos.length > 1 ? () => handleRemoveTomo(tomo.id) : undefined}
                    onChangeNumero={v => dispatch({ type: 'UPDATE', id: tomo.id, field: 'numero', value: v })}
                    onChangeIsbn={v => dispatch({ type: 'UPDATE', id: tomo.id, field: 'isbn', value: v })}
                    onSetImage={(file, preview) => dispatch({ type: 'SET_IMAGE', id: tomo.id, imageFile: file, imagePreview: preview })}
                  />
                ))}
                <button
                  onClick={handleAddTomo}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', color: T.textMuted }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(204,34,0,0.4)'; e.currentTarget.style.color = T.redBright }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = T.textMuted }}
                >
                  <Plus size={14} /> Agregar tomo
                </button>
              </div>
            </div>
          )}

          {/* ── TAB: Precios ────────────────────────────────────────────── */}
          {tab === 'precios' && (
            <div className="space-y-6">
              {/* Mismo criterio que MangaEditModal: Margen % + Costo real
                  siempre visibles al dar de alta tomos (Joel 2026-05-25). */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Precio Público (MXN) *</label>
                  <input
                    className="w-full px-4 py-3 rounded-2xl outline-none font-black"
                    style={{ ...T.input, color: T.redBright }}
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={series.precioPublico}
                    onChange={e => setSeries(s => ({ ...s, precioPublico: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Margen %</label>
                  <input
                    className="w-full px-4 py-3 rounded-2xl outline-none"
                    style={T.input}
                    type="number" min="0" max="99" step="0.1" placeholder="30"
                    value={series.margenPct}
                    onChange={e => setSeries(s => ({ ...s, margenPct: e.target.value }))}
                  />
                </div>
                {costoReal !== null && (
                  <div className="col-span-2 flex items-center gap-2 px-4 py-2.5 rounded-2xl" style={{ background: 'rgba(0,180,100,0.08)', border: '1px solid rgba(0,180,100,0.2)' }}>
                    <CheckCircle2 size={13} style={{ color: '#4ade80' }} />
                    <span className="text-xs" style={{ color: T.textMuted }}>Costo real:</span>
                    <span className="text-sm font-black" style={{ color: '#00CC66' }}>${costoReal.toFixed(2)}</span>
                    <span className="text-[10px] ml-auto" style={{ color: T.textMuted }}>precio × (1 − {series.margenPct}%)</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                {PRICE_KEYS.map((key, i) => (
                  <div key={key} className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>{PRICE_LABELS[i]}</label>
                    <input
                      className={`w-full px-4 py-3 rounded-2xl outline-none${i === 0 ? ' font-black' : ''}`}
                      style={{ ...T.input, ...(i === 0 ? { color: T.redBright } : {}) }}
                      type="number" min="0" step="0.01"
                      placeholder={i === 0 && series.precioPublico ? series.precioPublico : '0.00'}
                      value={prices[key]}
                      onChange={e => setPrices(p => ({ ...p, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>

              <p className="text-xs px-1" style={{ color: T.textMuted }}>
                Aplican igual a todos los tomos del lote. Si Precio A queda vacío, se usa el Precio Público.
              </p>
            </div>
          )}

          {/* ── TAB: Inventario ─────────────────────────────────────────── */}
          {tab === 'inventario' && (
            <div className="space-y-3">

              {/* No warehouses configured */}
              {locations.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                  <Warehouse size={28} style={{ color: 'rgba(255,255,255,0.15)' }} />
                  <p className="text-xs text-center" style={{ color: T.textMuted }}>
                    No hay almacenes configurados.<br />
                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>Ve a <strong>Tiendas</strong> para crear uno primero.</span>
                  </p>
                </div>
              )}

              {/* Add warehouse form */}
              {locations.length > 0 && availableLocs.length > 0 && (
                <div className="flex gap-2 items-end p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex-1">
                    <label className="text-[9px] font-black uppercase tracking-widest block mb-1.5" style={{ color: T.textMuted }}>Agregar tienda / almacén</label>
                    <select
                      value={addWarehouseId}
                      onChange={e => setAddWarehouseId(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl outline-none text-sm appearance-none"
                      style={T.input}
                    >
                      <option value="">Selecciona…</option>
                      {availableLocs.map(l => (
                        <option key={l.warehouseId} value={l.warehouseId}>
                          {l.name}{l.store ? ` — ${l.store}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleAddWarehouse}
                    disabled={addWarehouseId === ''}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                    style={addWarehouseId !== '' ? T.btnRed : { ...T.input, opacity: 0.4, cursor: 'not-allowed' }}
                  >
                    <Plus size={13} /> Agregar
                  </button>
                </div>
              )}

              {locations.length > 0 && warehouseGroups.length === 0 && (
                <p className="text-xs px-1 text-center py-4" style={{ color: T.textMuted }}>
                  Agrega una tienda para asignar existencias por tomo.
                </p>
              )}

              {/* Warehouse groups */}
              {warehouseGroups.map(group => {
                const loc = locations.find(l => l.warehouseId === group.warehouseId)
                const groupTotal = group.tomoStocks.reduce((s, ts) => s + (parseInt(ts.cantidad) || 0), 0)

                return (
                  <div key={group.id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    {/* Group header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                      style={{ background: 'rgba(255,255,255,0.05)' }}
                      onClick={() => toggleGroup(group.id)}
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }}>
                        <Warehouse size={13} style={{ color: 'rgba(255,255,255,0.5)' }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black truncate" style={{ color: T.textPrimary }}>{loc?.name ?? '—'}</span>
                          {loc?.type && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest shrink-0"
                              style={{ background: loc.type === 'central' ? 'rgba(100,160,255,0.12)' : 'rgba(100,220,130,0.12)', color: loc.type === 'central' ? '#88AAFF' : '#55CC88' }}>
                              {loc.type === 'central' ? 'Central' : 'Tienda'}
                            </span>
                          )}
                        </div>
                        {loc?.store && <p className="text-[10px] truncate" style={{ color: T.textMuted }}>{loc.store}</p>}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-bold" style={{ color: T.textSecondary }}>
                          {groupTotal} uds · {group.tomoStocks.length} tomo{group.tomoStocks.length !== 1 ? 's' : ''}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); removeGroup(group.id) }}
                          className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20"
                          style={{ color: 'rgba(255,255,255,0.3)' }}
                        >
                          <Trash2 size={12} />
                        </button>
                        {group.expanded
                          ? <ChevronDown size={14} style={{ color: T.textMuted }} />
                          : <ChevronRight size={14} style={{ color: T.textMuted }} />
                        }
                      </div>
                    </div>

                    {/* Per-tomo rows */}
                    {group.expanded && (
                      <div className="divide-y" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', divideColor: 'rgba(255,255,255,0.04)' }}>
                        {group.tomoStocks.length === 0 && (
                          <p className="text-xs text-center py-4" style={{ color: T.textMuted }}>Sin tomos asignados.</p>
                        )}
                        {group.tomoStocks.map(ts => {
                          const tomo = tomos.find(t => t.id === ts.tomoId)
                          if (!tomo) return null
                          const tomoNum = tomo.numero !== '' ? parseInt(tomo.numero, 10) : (tomos.indexOf(tomo) + 1)

                          return (
                            <div key={ts.tomoId} className="flex items-center gap-3 px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                              {/* Vol badge */}
                              <div className="shrink-0 w-9 h-9 rounded-xl flex flex-col items-center justify-center" style={{
                                background: 'linear-gradient(135deg,#990000,#CC2200)',
                              }}>
                                <span style={{ fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>TOMO</span>
                                <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{isNaN(tomoNum) ? '?' : tomoNum}</span>
                              </div>

                              {/* Name */}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate" style={{ color: T.textPrimary }}>
                                  {series.nombre || '—'}{tomo.numero ? ` #${tomo.numero}` : ''}
                                </p>
                                {tomo.isbn && <p className="text-[10px] font-mono truncate" style={{ color: T.textMuted }}>{tomo.isbn}</p>}
                              </div>

                              {/* Qty input */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px]" style={{ color: T.textMuted }}>uds</span>
                                <input
                                  type="number" min={0} placeholder="0"
                                  value={ts.cantidad}
                                  onChange={e => updateCantidad(group.id, ts.tomoId, e.target.value)}
                                  className="w-16 px-2 py-1.5 rounded-xl text-center outline-none font-bold text-sm"
                                  style={T.input}
                                />
                              </div>

                              {/* Remove tomo from this group */}
                              <button
                                onClick={() => removeTomoFromGroup(group.id, ts.tomoId)}
                                className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20 shrink-0"
                                style={{ color: 'rgba(255,255,255,0.25)' }}
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              {locations.length > 0 && availableLocs.length === 0 && warehouseGroups.length > 0 && (
                <p className="text-xs px-1 text-center" style={{ color: T.textMuted }}>Todas las tiendas ya están asignadas.</p>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="p-6 border-t border-white/10 flex items-center justify-between gap-4">
          <div className="text-xs" style={{ color: T.textMuted }}>
            {successCount > 0 && <span style={{ color: '#4ade80', fontWeight: 700 }}>{successCount} registrado{successCount !== 1 ? 's' : ''}</span>}
            {successCount > 0 && pendingCount > 0 && <span className="mx-1">·</span>}
            {pendingCount > 0 && <span>{pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}</span>}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-6 py-2.5 rounded-full text-sm font-bold transition-all hover:bg-white/5" style={{ color: T.textSecondary }}>
              Cancelar
            </button>
            <button
              onClick={handleSubmit} disabled={!canSave}
              className="flex items-center gap-2 px-8 py-2.5 text-sm font-bold transition-all shadow-lg shadow-red-500/20"
              style={{ ...T.btnRed, opacity: canSave ? 1 : 0.4, cursor: canSave ? 'pointer' : 'not-allowed' }}
            >
              {submitting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
              Registrar {pendingCount} tomo{pendingCount !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── TomoCard ─────────────────────────────────────────────────────────────────

interface TomoCardProps {
  tomo: VolumeRow; index: number; inputStyle: CSSProperties
  onRemove?: () => void
  onChangeNumero: (v: string) => void
  onChangeIsbn: (v: string) => void
  onSetImage: (file: File, preview: string) => void
}

function TomoCard({ tomo, index, onRemove, onChangeNumero, onChangeIsbn, onSetImage, inputStyle }: TomoCardProps) {
  const isbnRef = useRef<HTMLInputElement>(null)

  const sc = {
    idle:    { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.07)' },
    loading: { bg: 'rgba(255,170,0,0.06)',   border: 'rgba(255,170,0,0.25)'   },
    ok:      { bg: 'rgba(0,180,100,0.07)',   border: 'rgba(0,180,100,0.25)'   },
    error:   { bg: 'rgba(204,34,0,0.07)',    border: 'rgba(204,34,0,0.3)'     },
  }[tomo.status]

  const tomoNum = tomo.numero !== '' ? parseInt(tomo.numero, 10) : index + 1
  const disabled = tomo.status === 'ok' || tomo.status === 'loading'

  return (
    <div className="p-4 rounded-2xl transition-all" style={{ background: sc.bg, border: `1px solid ${sc.border}` }}>
      <div className="flex items-start gap-3">

        {/* ── Imagen / Estado ── */}
        <div className="shrink-0 relative group" style={{ width: 52, height: 52 }}>
          {tomo.imagePreview ? (
            <>
              <img src={tomo.imagePreview} alt="" className="w-full h-full object-cover rounded-[14px]" />
              {!disabled && (
                <div className="absolute inset-0 rounded-[14px] bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera size={16} color="#fff" />
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full rounded-[14px] flex flex-col items-center justify-center" style={{
              background: tomo.status === 'ok' ? 'linear-gradient(135deg,#00AA55,#00CC66)'
                : tomo.status === 'loading' ? 'rgba(255,170,0,0.15)'
                : 'linear-gradient(135deg,#990000,#CC2200)',
            }}>
              {tomo.status === 'ok'      ? <CheckCircle2 size={20} color="#fff" /> :
               tomo.status === 'loading' ? <Loader2 size={20} color="#FFAA00" style={{ animation: 'spin 1s linear infinite' }} /> :
               tomo.status === 'error'   ? <AlertCircle size={20} color="#fff" /> : (
                <>
                  <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>TOMO</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{isNaN(tomoNum) ? '?' : tomoNum}</span>
                </>
              )}
            </div>
          )}
          {!disabled && (
            <input
              type="file" accept="image/*"
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              style={{ fontSize: 0 }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) onSetImage(file, URL.createObjectURL(file))
              }}
            />
          )}
        </div>

        {/* ── Campos ── */}
        <div className="flex-1 grid gap-3" style={{ gridTemplateColumns: '80px 1fr' }}>
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest block" style={{ color: T.textSecondary }}>Vol. #</label>
            <input
              className="w-full px-3 py-2 rounded-xl outline-none text-sm font-bold"
              style={inputStyle}
              type="number" min="0" placeholder={String(index + 1)}
              value={tomo.numero}
              disabled={disabled}
              onChange={e => onChangeNumero(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest block" style={{ color: T.textSecondary }}>ISBN / Código</label>
            <div className="relative">
              <input
                ref={isbnRef}
                className="w-full pl-3 pr-9 py-2 rounded-xl outline-none text-sm font-mono"
                style={inputStyle}
                placeholder="Escanear o escribir…"
                value={tomo.isbn}
                disabled={disabled}
                onChange={e => onChangeIsbn(e.target.value)}
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChangeIsbn(generateBarcode())}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-all hover:text-red-400 hover:bg-red-500/10"
                  style={{ color: T.textSecondary }}
                  title="Generar código (sin lector)"
                >
                  <Scan size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {onRemove && !disabled && (
          <button onClick={onRemove} className="p-2 rounded-xl transition-all hover:bg-red-500/20 hover:text-red-400 shrink-0 mt-5" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {tomo.status === 'error' && tomo.errorMsg && (
        <div className="mt-2.5 px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(204,34,0,0.1)', border: '1px solid rgba(204,34,0,0.2)', color: '#FF4422' }}>
          {tomo.errorMsg}
        </div>
      )}
    </div>
  )
}
