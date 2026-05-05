import { useState, type CSSProperties } from 'react'
import { X, Save, Loader2, BookOpen } from 'lucide-react'
import { updateManga } from '@tadaima/api'
import type { Manga } from '@tadaima/api'
import { EDITORIALS, MANGA_GENRES } from './mangaConstants'

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
  textPrimary:   'var(--td-text-hi)',
  textSecondary: 'var(--td-text-md)',
  textMuted:     'var(--td-text-lo)',
  redBright:     '#FF4422',
}

interface Props {
  manga: Manga
  onClose: () => void
  onSuccess: (updated: Manga) => void
  canViewCost?: boolean
}

const PRICE_LABELS = ['A (Default)', 'B', 'C', 'D', 'E'] as const

export function MangaEditModal({ manga, onClose, onSuccess, canViewCost = false }: Props) {
  const [form, setForm] = useState({
    name:                   manga.name,
    volume_number:          manga.volume_number != null ? String(manga.volume_number) : '',
    editorial:              manga.editorial ?? '',
    code:                   manga.code ?? '',
    genre:                  manga.genre ?? '',
    public_price:           String(manga.public_price),
    profit_margin_percent:  String(manga.profit_margin_percent),
    active:                 manga.active,
    price_1:                manga.price_1 != null ? String(manga.price_1) : '',
    price_2:                manga.price_2 != null ? String(manga.price_2) : '',
    price_3:                manga.price_3 != null ? String(manga.price_3) : '',
    price_4:                manga.price_4 != null ? String(manga.price_4) : '',
    price_5:                manga.price_5 != null ? String(manga.price_5) : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const costoReal = (() => {
    const p = parseFloat(form.public_price), m = parseFloat(form.profit_margin_percent)
    return (!isNaN(p) && !isNaN(m) && m >= 0 && m < 100) ? p * (1 - m / 100) : null
  })()

  function set(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('La serie es obligatoria.'); return }
    const precio = parseFloat(form.public_price)
    if (isNaN(precio) || precio <= 0) { setError('El precio público es obligatorio.'); return }

    setSaving(true)
    setError(null)
    try {
      const payload = {
        name:                  form.name.trim(),
        volume_number:         form.volume_number.trim() ? Number(form.volume_number) : null,
        editorial:             form.editorial.trim() || null,
        code:                  form.code.trim() || null,
        genre:                 form.genre.trim() || null,
        public_price:          precio,
        profit_margin_percent: parseFloat(form.profit_margin_percent) || 0,
        active:                form.active,
        price_1:               form.price_1.trim() ? Number(form.price_1) : null,
        price_2:               form.price_2.trim() ? Number(form.price_2) : null,
        price_3:               form.price_3.trim() ? Number(form.price_3) : null,
        price_4:               form.price_4.trim() ? Number(form.price_4) : null,
        price_5:               form.price_5.trim() ? Number(form.price_5) : null,
      }
      const updated = await updateManga(manga.id, payload)
      onSuccess(updated)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'No se pudo guardar.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const labelCls = 'text-[10px] font-black uppercase tracking-widest mb-1 block'
  const inputCls = 'w-full px-4 py-3 rounded-2xl text-sm outline-none transition-all focus:ring-1 focus:ring-red-500/30'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative w-full max-w-lg rounded-[28px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]" style={T.glass}>

        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-6 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#990000,#CC2200)' }}>
              <BookOpen size={16} color="#fff" />
            </div>
            <div>
              <h2 className="text-base font-black" style={{ color: T.textPrimary }}>Editar Tomo</h2>
              <p className="text-[11px]" style={{ color: T.textMuted }}>{manga.name}{manga.volume_number != null ? ` Vol. ${manga.volume_number}` : ''}</p>
            </div>
          </div>
          <button onClick={() => !saving && onClose()} className="p-2 rounded-xl hover:bg-white/10 transition-all" style={{ color: T.textMuted }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-7 py-5 space-y-4">

          {/* Serie + Vol */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls} style={{ color: T.textMuted }}>Serie *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} style={T.input} placeholder="Ej. Naruto" />
            </div>
            <div>
              <label className={labelCls} style={{ color: T.textMuted }}>Volumen</label>
              <input type="number" min={1} value={form.volume_number} onChange={e => set('volume_number', e.target.value)} className={inputCls} style={T.input} placeholder="1" />
            </div>
          </div>

          {/* ISBN + Editorial + Género */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: T.textMuted }}>ISBN / Código</label>
              <input value={form.code} onChange={e => set('code', e.target.value)} className={inputCls} style={T.input} placeholder="978-…" />
            </div>
            <div>
              <label className={labelCls} style={{ color: T.textMuted }}>Editorial</label>
              <select value={form.editorial} onChange={e => set('editorial', e.target.value)} className={inputCls} style={T.input}>
                <option value="">Sin editorial</option>
                {EDITORIALS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: T.textMuted }}>Género</label>
            <select value={form.genre} onChange={e => set('genre', e.target.value)} className={inputCls} style={T.input}>
              <option value="">Sin género</option>
              {MANGA_GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* Precio + Margen */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.textMuted }}>Precio</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} style={{ color: T.textMuted }}>Precio público *</label>
                <input type="number" min={0} step={0.01} value={form.public_price} onChange={e => set('public_price', e.target.value)} className={inputCls} style={T.input} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls} style={{ color: T.textMuted }}>Margen %</label>
                <input type="number" min={0} max={99} step={1} value={form.profit_margin_percent} onChange={e => set('profit_margin_percent', e.target.value)} className={inputCls} style={T.input} placeholder="30" />
              </div>
            </div>
            {canViewCost && costoReal != null && (
              <p className="text-xs" style={{ color: T.textMuted }}>Costo calculado: <span className="font-bold" style={{ color: T.textSecondary }}>${costoReal.toFixed(2)}</span></p>
            )}
          </div>

          {/* Precios especiales */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.textMuted }}>Precios especiales (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              {(['price_1','price_2','price_3','price_4','price_5'] as const).map((key, i) => (
                <div key={key}>
                  <label className={labelCls} style={{ color: T.textMuted }}>Precio {PRICE_LABELS[i]}</label>
                  <input type="number" min={0} step={0.01} value={form[key]} onChange={e => set(key, e.target.value)} className={inputCls} style={T.input} placeholder="—" />
                </div>
              ))}
            </div>
          </div>

          {/* Activo */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: T.textSecondary }}>Activo</span>
            <button
              type="button"
              onClick={() => set('active', !form.active)}
              className="relative w-11 h-6 rounded-full transition-all"
              style={{ background: form.active ? T.redBright : 'rgba(255,255,255,0.12)' }}
            >
              <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform" style={{ transform: form.active ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </div>

          {error && (
            <p className="text-sm rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.1)', color: '#FF4422', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-7 py-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => !saving && onClose()} className="px-5 py-2.5 rounded-2xl text-sm font-bold transition-all hover:bg-white/10" style={{ color: T.textMuted }} disabled={saving}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60" style={T.btnRed}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  )
}
