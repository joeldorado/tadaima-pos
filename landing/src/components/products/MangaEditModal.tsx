import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import {
  X, Save, Loader2, BookOpen, DollarSign, Warehouse,
  CheckCircle2, AlertTriangle, Camera, Scan, Trash2,
} from 'lucide-react'
import { updateManga, deleteManga, uploadMangaImage, getMangaInventory, updateMangaInventory, getWarehouses } from '@tadaima/api'
import type { Manga, MangaInventoryItem, Warehouse } from '@tadaima/api'
import { EDITORIALS, MANGA_GENRES } from './mangaConstants'
import { toast } from 'sonner'
import { useAuth } from '@tadaima/auth'
import { isAdmin as isAdminRole } from '@/lib/permisos'

// ─── Design tokens (same as MangaBatchModal) ──────────────────────────────────
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

const PRICE_LABELS = ['Precio A (Default)', 'Precio B', 'Precio C', 'Precio D', 'Precio E'] as const
const PRICE_KEYS   = ['price_1', 'price_2', 'price_3', 'price_4', 'price_5'] as const

type Tab = 'tomo' | 'precios' | 'inventario'

interface Props {
  manga: Manga
  onClose: () => void
  onSuccess: (updated: Manga) => void
  onDeleted: () => void
  canViewCost?: boolean
  isAdmin?: boolean
  locations?: { warehouseId: number; name: string; store: string; type: 'central' | 'store' }[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MangaEditModal({
  manga, onClose, onSuccess, onDeleted,
  canViewCost = false, isAdmin = false, locations = [],
}: Props) {
  const [tab, setTab] = useState<Tab>('tomo')
  // Gerente/cajero: el tab Inventario muestra y modifica solo el stock de su
  // tienda. Admin ve y edita todas. Backend igual valida (defensa en profundidad).
  const { user } = useAuth()
  const userIsAdmin = isAdmin || isAdminRole(user?.roles)
  const restrictedStoreId = !userIsAdmin ? (user?.store_id ?? null) : null

  // ── Series fields ──────────────────────────────────────────────────────────
  const [nombre,    setNombre]    = useState(manga.name)
  const [editorial, setEditorial] = useState(manga.editorial ?? '')
  const [genero,    setGenero]    = useState(manga.genre ?? '')
  const [active,    setActive]    = useState(manga.active)

  // ── Single-volume fields ───────────────────────────────────────────────────
  const [volNum,    setVolNum]    = useState(manga.volume_number != null ? String(manga.volume_number) : '')
  const [isbn,      setIsbn]      = useState(manga.code ?? '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(manga.image_url ?? null)
  const isbnRef = useRef<HTMLInputElement>(null)

  // ── Prices ────────────────────────────────────────────────────────────────
  const [precioPublico, setPrecioPublico] = useState(String(manga.public_price))
  const [margenPct,     setMargenPct]     = useState(String(manga.profit_margin_percent))
  const [prices, setPrices] = useState({
    price_1: manga.price_1 != null ? String(manga.price_1) : '',
    price_2: manga.price_2 != null ? String(manga.price_2) : '',
    price_3: manga.price_3 != null ? String(manga.price_3) : '',
    price_4: manga.price_4 != null ? String(manga.price_4) : '',
    price_5: manga.price_5 != null ? String(manga.price_5) : '',
  })

  // ── Inventory ─────────────────────────────────────────────────────────────
  const [inventory,     setInventory]     = useState<MangaInventoryItem[]>([])
  const [invLoading,    setInvLoading]    = useState(false)
  const [quantities,    setQuantities]    = useState<Record<number, string>>({})
  // Lista completa de warehouses para el selector "Agregar tienda" del tab
  // Inventario. Filtrado por restrictedStoreId cuando no es admin.
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([])
  const [pendingAddWh,  setPendingAddWh]  = useState<number | ''>('')
  const [pendingAddQty, setPendingAddQty] = useState('')

  useEffect(() => {
    setInvLoading(true)
    Promise.all([
      getMangaInventory(manga.id).catch(() => []),
      getWarehouses({ active: true }).catch(() => []),
    ])
      .then(([items, whs]) => {
        const list = Array.isArray(items) ? items : []
        // Para no-admin: filtra el inventario a warehouses de su propia tienda.
        // Stock de otras tiendas existe en DB pero NO entra al state → no se
        // renderiza ni se envía al guardar.
        const allowedInventory = restrictedStoreId == null
          ? list
          : list.filter(i => i.warehouse?.store?.id === restrictedStoreId)
        setInventory(allowedInventory)
        const init: Record<number, string> = {}
        allowedInventory.forEach(i => { init[i.warehouse_id] = String(i.quantity) })
        setQuantities(init)

        // Warehouses disponibles para "Agregar": admin todas, no-admin solo
        // las que pertenezcan a su tienda asignada.
        const allowedWarehouses = restrictedStoreId == null
          ? whs
          : whs.filter(w => w.store?.id === restrictedStoreId)
        setAllWarehouses(allowedWarehouses)
      })
      .finally(() => setInvLoading(false))
  }, [manga.id, restrictedStoreId])

  // Warehouses que NO están aún en el inventario del manga — opciones del selector "Agregar".
  const availableWarehousesToAdd = allWarehouses.filter(
    w => !(w.id in quantities)
  )

  // ── Save state ────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // ── Delete state ──────────────────────────────────────────────────────────
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting,         setDeleting]         = useState(false)

  // ── Derived ───────────────────────────────────────────────────────────────
  const costoReal = (() => {
    const p = parseFloat(precioPublico), m = parseFloat(margenPct)
    return (!isNaN(p) && !isNaN(m) && m >= 0 && m < 100) ? p * (1 - m / 100) : null
  })()

  const nombreOk = !!nombre.trim()
  const precioOk = !!precioPublico.trim() && parseFloat(precioPublico) > 0

  const tabValid: Record<Tab, boolean> = {
    tomo:       nombreOk,
    precios:    precioOk,
    inventario: true,
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!nombreOk) { setError('La serie es obligatoria.'); return }
    if (!precioOk) { setError('El precio público es obligatorio.'); return }
    setSaving(true); setError(null)
    const toPrice = (v: string) => v.trim() !== '' ? parseFloat(v) : null
    try {
      const updated = await updateManga(manga.id, {
        name:                  nombre.trim(),
        volume_number:         volNum.trim() ? Number(volNum) : null,
        editorial:             editorial.trim() || null,
        code:                  isbn.trim() || null,
        genre:                 genero.trim() || null,
        public_price:          parseFloat(precioPublico),
        profit_margin_percent: parseFloat(margenPct) || 0,
        active,
        price_1: toPrice(prices.price_1),
        price_2: toPrice(prices.price_2),
        price_3: toPrice(prices.price_3),
        price_4: toPrice(prices.price_4),
        price_5: toPrice(prices.price_5),
      })

      if (imageFile) {
        await uploadMangaImage(manga.id, imageFile).catch(() => {})
      }

      // Save inventory changes
      await Promise.all(
        Object.entries(quantities).map(([wid, qty]) =>
          updateMangaInventory(manga.id, Number(wid), parseInt(qty) || 0)
        )
      )

      onSuccess(updated)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'No se pudo guardar.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [nombre, volNum, editorial, isbn, genero, precioPublico, margenPct, active, prices, quantities, imageFile, manga.id, nombreOk, precioOk, onSuccess])

  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteManga(manga.id)
      onDeleted()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'No se pudo eliminar el tomo (puede tener ventas/apartados activos)'
      toast.error(msg)
      setDeleting(false)
      setShowDeleteDialog(false)
      setDeleteConfirmText("")
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => !saving && onClose()} />

        <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-[32px] flex flex-col shadow-2xl" style={T.glass}>

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(204,34,0,0.15)', border: '1px solid rgba(204,34,0,0.3)', color: T.redBright }}>
                <BookOpen size={16} />
              </div>
              <div>
                <h2 className="text-xl font-black" style={{ color: T.textPrimary }}>Editar Tomo</h2>
                <p className="text-xs" style={{ color: T.textSecondary }}>{manga.name}{manga.volume_number != null ? ` · Vol. ${manga.volume_number}` : ''}</p>
              </div>
            </div>
            <button onClick={() => !saving && onClose()} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
              <X size={20} style={{ color: T.textSecondary }} />
            </button>
          </div>

          {/* ── Checklist bar ───────────────────────────────────────────────── */}
          <div className="px-6 py-2.5 flex items-center gap-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {([
              { label: 'Nombre', done: nombreOk },
              { label: 'Precio A', done: precioOk },
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
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px]" style={{ color: T.textMuted }}>Activo</span>
              <button
                type="button"
                onClick={() => setActive(v => !v)}
                className="relative w-9 h-5 rounded-full transition-all"
                style={{ background: active ? T.redBright : 'rgba(255,255,255,0.12)' }}
              >
                <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: active ? 'translateX(16px)' : 'translateX(0)' }} />
              </button>
            </div>
          </div>

          {/* ── Tab bar ─────────────────────────────────────────────────────── */}
          <div className="flex px-6 pt-4 gap-4">
            {([
              { id: 'tomo' as Tab,       label: 'Tomo',       icon: BookOpen },
              { id: 'precios' as Tab,    label: 'Precios',    icon: DollarSign },
              { id: 'inventario' as Tab, label: 'Inventario', icon: Warehouse },
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

            {/* ── TAB: Tomo ───────────────────────────────────────────────── */}
            {tab === 'tomo' && (
              <div className="space-y-6">
                {/* Series info */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Nombre de la Serie *</label>
                    <input
                      className="w-full px-4 py-3 rounded-2xl outline-none"
                      style={T.input}
                      placeholder="Ej. Naruto, Attack on Titan…"
                      value={nombre}
                      onChange={e => setNombre(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Editorial</label>
                      <select className="w-full px-4 py-3 rounded-2xl outline-none appearance-none" style={T.input} value={editorial} onChange={e => setEditorial(e.target.value)}>
                        <option value="">— Seleccionar —</option>
                        {EDITORIALS.map(ed => <option key={ed} value={ed}>{ed}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Género</label>
                      <select className="w-full px-4 py-3 rounded-2xl outline-none appearance-none" style={T.input} value={genero} onChange={e => setGenero(e.target.value)}>
                        <option value="">— Seleccionar —</option>
                        {MANGA_GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Single volume card — same style as TomoCard in batch modal */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Detalle del Tomo</label>
                  <div className="p-4 rounded-2xl transition-all" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-start gap-3">

                      {/* Image */}
                      <div className="shrink-0 relative group" style={{ width: 52, height: 52 }}>
                        {imagePreview ? (
                          <>
                            <img src={imagePreview} alt="" className="w-full h-full object-cover rounded-[14px]" />
                            <div className="absolute inset-0 rounded-[14px] bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Camera size={16} color="#fff" />
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full rounded-[14px] flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg,#990000,#CC2200)' }}>
                            <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>TOMO</span>
                            <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
                              {volNum.trim() ? volNum : '?'}
                            </span>
                          </div>
                        )}
                        <input
                          type="file" accept="image/*"
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          style={{ fontSize: 0 }}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) { setImageFile(file); setImagePreview(URL.createObjectURL(file)) }
                          }}
                        />
                      </div>

                      {/* Fields */}
                      <div className="flex-1 grid gap-3" style={{ gridTemplateColumns: '80px 1fr' }}>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase tracking-widest block" style={{ color: T.textSecondary }}>Vol. #</label>
                          <input
                            className="w-full px-3 py-2 rounded-xl outline-none text-sm font-bold"
                            style={T.input}
                            type="number" min="0" placeholder="1"
                            value={volNum}
                            onChange={e => setVolNum(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase tracking-widest block" style={{ color: T.textSecondary }}>ISBN / Código</label>
                          <div className="relative">
                            <input
                              ref={isbnRef}
                              className="w-full pl-3 pr-9 py-2 rounded-xl outline-none text-sm font-mono"
                              style={T.input}
                              placeholder="Escanear o escribir…"
                              value={isbn}
                              onChange={e => setIsbn(e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => isbnRef.current?.focus()}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-all hover:text-red-400 hover:bg-red-500/10"
                              style={{ color: T.textSecondary }}
                            >
                              <Scan size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: Precios ────────────────────────────────────────────── */}
            {tab === 'precios' && (
              <div className="space-y-6">
                {/* En mangas/librería, Margen % + Costo real SIEMPRE visibles
                    (admin/gerente/cajero). Decisión Joel 2026-05-25: el costo
                    en librería se deriva del margen sobre precio público, y
                    todos los roles necesitan ver/editar ese cálculo cuando
                    dan de alta o editan un tomo. NO afecta a productos
                    regulares (que mantienen el gate canViewCost). */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Precio Público (MXN) *</label>
                    <input
                      className="w-full px-4 py-3 rounded-2xl outline-none font-black"
                      style={{ ...T.input, color: T.redBright }}
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={precioPublico}
                      onChange={e => setPrecioPublico(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Margen %</label>
                    <input
                      className="w-full px-4 py-3 rounded-2xl outline-none"
                      style={T.input}
                      type="number" min="0" max="99" step="0.1" placeholder="30"
                      value={margenPct}
                      onChange={e => setMargenPct(e.target.value)}
                    />
                  </div>
                  {costoReal !== null && (
                    <div className="col-span-2 flex items-center gap-2 px-4 py-2.5 rounded-2xl" style={{ background: 'rgba(0,180,100,0.08)', border: '1px solid rgba(0,180,100,0.2)' }}>
                      <CheckCircle2 size={13} style={{ color: '#4ade80' }} />
                      <span className="text-xs" style={{ color: T.textMuted }}>Costo real:</span>
                      <span className="text-sm font-black" style={{ color: '#00CC66' }}>${costoReal.toFixed(2)}</span>
                      <span className="text-[10px] ml-auto" style={{ color: T.textMuted }}>precio × (1 − {margenPct}%)</span>
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
                        placeholder={i === 0 && precioPublico ? precioPublico : '0.00'}
                        value={prices[key]}
                        onChange={e => setPrices(p => ({ ...p, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB: Inventario ─────────────────────────────────────────── */}
            {tab === 'inventario' && (
              <div className="space-y-3">
                {/* Selector "Agregar tienda": carga warehouses disponibles que no
                    están aún asignadas a este manga. Decisión Joel 2026-05-25:
                    sin esto solo se podía editar stock de tiendas existentes,
                    nunca dar de alta en una nueva. */}
                {availableWarehousesToAdd.length > 0 && (
                  <div className="flex gap-2 items-end p-3 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex-1">
                      <label style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: T.textMuted, display: 'block', marginBottom: 4 }}>
                        Agregar tienda
                      </label>
                      <select
                        value={pendingAddWh}
                        onChange={e => setPendingAddWh(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl outline-none text-sm font-bold"
                        style={T.input}
                      >
                        <option value="">Selecciona…</option>
                        {availableWarehousesToAdd.map(w => (
                          <option key={w.id} value={w.id}>{w.store?.name ?? w.name}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ width: 90 }}>
                      <label style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: T.textMuted, display: 'block', marginBottom: 4 }}>
                        Stock
                      </label>
                      <input
                        type="number" min={0} placeholder="0"
                        value={pendingAddQty}
                        onChange={e => setPendingAddQty(e.target.value)}
                        disabled={pendingAddWh === ''}
                        className="w-full px-3 py-2 rounded-xl outline-none text-sm font-bold text-center"
                        style={T.input}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={pendingAddWh === '' || pendingAddQty === '' || Number(pendingAddQty) < 0}
                      onClick={() => {
                        const whId = Number(pendingAddWh);
                        const wh = allWarehouses.find(w => w.id === whId);
                        if (!wh) return;
                        // Agregar fila virtual al inventory para que renderice,
                        // y actualizar quantities con la cantidad inicial.
                        setInventory(prev => [...prev, {
                          id: -whId, // negativo para distinguir de filas reales
                          manga_id: manga.id,
                          warehouse_id: whId,
                          quantity: 0,
                          warehouse: {
                            id: wh.id,
                            name: wh.name,
                            type: wh.type ?? 'store',
                            store: wh.store ?? null,
                          },
                        }]);
                        setQuantities(prev => ({ ...prev, [whId]: pendingAddQty }));
                        setPendingAddWh('');
                        setPendingAddQty('');
                      }}
                      style={{
                        padding: '8px 14px', borderRadius: 10,
                        background: (pendingAddWh !== '' && pendingAddQty !== '') ? T.redBright : 'rgba(255,255,255,0.05)',
                        color: (pendingAddWh !== '' && pendingAddQty !== '') ? '#fff' : T.textMuted,
                        border: 'none', fontSize: 10, fontWeight: 900, textTransform: 'uppercase' as const,
                        cursor: (pendingAddWh !== '' && pendingAddQty !== '') ? 'pointer' : 'not-allowed',
                      }}
                    >
                      + Agregar
                    </button>
                  </div>
                )}

                {invLoading ? (
                  <div className="flex items-center justify-center py-10 gap-3">
                    <Loader2 size={18} className="animate-spin" style={{ color: T.redBright }} />
                    <span className="text-sm" style={{ color: T.textMuted }}>Cargando inventario…</span>
                  </div>
                ) : inventory.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <Warehouse size={28} style={{ color: 'rgba(255,255,255,0.15)' }} />
                    <p className="text-xs text-center" style={{ color: T.textMuted }}>Sin inventario asignado.<br /><span style={{ color: 'rgba(255,255,255,0.25)' }}>Usa "Agregar tienda" arriba para asignar stock.</span></p>
                  </div>
                ) : (
                  inventory.map(item => {
                    const wh = item.warehouse
                    const qty = quantities[item.warehouse_id] ?? String(item.quantity)
                    return (
                      <div key={item.warehouse_id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }}>
                            <Warehouse size={13} style={{ color: 'rgba(255,255,255,0.5)' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black truncate" style={{ color: T.textPrimary }}>{wh?.name ?? '—'}</span>
                              {wh?.type && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest shrink-0"
                                  style={{ background: wh.type === 'central' ? 'rgba(100,160,255,0.12)' : 'rgba(100,220,130,0.12)', color: wh.type === 'central' ? '#88AAFF' : '#55CC88' }}>
                                  {wh.type === 'central' ? 'Central' : 'Tienda'}
                                </span>
                              )}
                            </div>
                            {wh?.store && <p className="text-[10px] truncate" style={{ color: T.textMuted }}>{wh.store.name}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px]" style={{ color: T.textMuted }}>uds</span>
                            <input
                              type="number" min={0} placeholder="0"
                              value={qty}
                              onChange={e => setQuantities(prev => ({ ...prev, [item.warehouse_id]: e.target.value }))}
                              className="w-16 px-2 py-1.5 rounded-xl text-center outline-none font-bold text-sm"
                              style={T.input}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {error && (
              <p className="text-sm rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.1)', color: '#FF4422', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</p>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────────────── */}
          <div className="p-6 border-t border-white/10 flex items-center justify-between gap-4">
            <div>
              {isAdmin && (
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all hover:bg-red-500/15"
                  style={{ color: T.redBright, border: '1px solid rgba(239,68,68,0.25)' }}
                >
                  <Trash2 size={13} />
                  Eliminar
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => !saving && onClose()} className="px-6 py-2.5 rounded-full text-sm font-bold transition-all hover:bg-white/5" style={{ color: T.textSecondary }}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !nombreOk || !precioOk}
                className="flex items-center gap-2 px-8 py-2.5 text-sm font-bold transition-all shadow-lg shadow-red-500/20"
                style={{ ...T.btnRed, opacity: saving || !nombreOk || !precioOk ? 0.4 : 1, cursor: saving || !nombreOk || !precioOk ? 'not-allowed' : 'pointer' }}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Delete dialog (super alert con confirmación tipeada) ───────────── */}
      {showDeleteDialog && (() => {
        const fullName = `${manga.name}${manga.volume_number != null ? ` Vol. ${manga.volume_number}` : ''}`;
        const confirmed = deleteConfirmText.trim().toLowerCase() === fullName.trim().toLowerCase();
        return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={() => { if (!deleting) { setShowDeleteDialog(false); setDeleteConfirmText(""); } }} />
          <div className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl" style={{ background: '#1a1a1a', border: '1px solid rgba(239,68,68,0.5)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 animate-pulse">
                <AlertTriangle size={26} className="text-red-400" />
              </div>
              <div>
                <h3 className="font-black text-white text-lg uppercase tracking-wider">⚠️ Eliminar tomo</h3>
                <p className="text-xs text-gray-400 mt-1">Esta acción <span className="text-red-400 font-bold">NO se puede deshacer</span>.</p>
              </div>
            </div>
            <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="font-bold text-white text-sm">{fullName}</p>
              {manga.code && <p className="text-[10px] text-gray-400 mt-0.5">Código: {manga.code}</p>}
            </div>
            <div className="rounded-xl p-3 mb-4 text-xs space-y-1" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <p className="text-red-400 font-bold">Se eliminará:</p>
              <ul className="text-gray-300 list-disc list-inside space-y-0.5">
                <li>Registro del tomo</li>
                <li>Imagen del bucket</li>
                <li>Inventario en todas las tiendas</li>
              </ul>
              <p className="text-amber-400 text-[11px] mt-2">Si tiene ventas o apartados activos, el backend rechazará. No hay borrado forzado para tomos.</p>
            </div>

            <div className="mb-4">
              <p className="text-[11px] font-bold text-red-400 mb-2 uppercase tracking-wider">
                Para confirmar, tipea el nombre completo:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder={fullName}
                disabled={deleting}
                className="w-full px-3 py-2 rounded-xl text-sm font-bold bg-black/40 border outline-none transition-all"
                style={{ borderColor: confirmed ? '#10b981' : 'rgba(239,68,68,0.4)', color: confirmed ? '#10b981' : '#fff' }}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(""); }}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all hover:bg-white/10"
                style={{ color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || !confirmed}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg,#991b1b,#dc2626)', color: '#fff', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={14} />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </>
  )
}
