import type { CSSProperties } from 'react'
import { Package, BookOpen, X } from 'lucide-react'

interface Props {
  onSelectNormal: () => void
  onSelectManga: () => void
  onClose: () => void
}

const T = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.72)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  } as CSSProperties,
  modal: {
    background: 'var(--td-panel-bg)',
    backdropFilter: 'blur(28px) saturate(160%)',
    WebkitBackdropFilter: 'blur(28px) saturate(160%)',
    border: '1px solid var(--td-panel-border)',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
    borderRadius: '24px',
    width: '520px',
    maxWidth: 'calc(100vw - 32px)',
    padding: '32px',
  } as CSSProperties,
  card: {
    background: 'var(--td-card-bg)',
    border: '1px solid var(--td-card-border)',
    borderRadius: '16px',
    padding: '28px 24px',
    cursor: 'pointer',
    transition: 'all 200ms ease',
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '14px',
    textAlign: 'center' as const,
  } as CSSProperties,
}

export function ProductTypeSelectorModal({ onSelectNormal, onSelectManga, onClose }: Props) {
  return (
    <div style={T.overlay} onClick={onClose}>
      <div style={T.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <p style={{ color: 'var(--td-text-lo)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
              Alta de producto
            </p>
            <h2 style={{ color: 'var(--td-text-hi)', fontSize: '20px', fontWeight: 700, margin: '4px 0 0' }}>
              ¿Qué tipo de producto?
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--td-text-lo)', padding: '4px', borderRadius: '8px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Cards */}
        <div style={{ display: 'flex', gap: '14px' }}>
          <TypeCard
            icon={<Package size={32} />}
            title="Producto Normal"
            description="Figuras, merch, accesorios, juguetes, artículos en general"
            accent="#3B82F6"
            onClick={onSelectNormal}
          />
          <TypeCard
            icon={<BookOpen size={32} />}
            title="Manga Nacional"
            description="Alta de tomos individuales o en lote con ISBN y número de volumen"
            accent="#CC2200"
            onClick={onSelectManga}
          />
        </div>
      </div>
    </div>
  )
}

function TypeCard({
  icon,
  title,
  description,
  accent,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  accent: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...T.card,
        textAlign: 'center',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.borderColor = accent + '66'
        el.style.boxShadow = `0 0 0 1px ${accent}33, 0 8px 24px rgba(0,0,0,0.2)`
        el.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.borderColor = 'var(--td-card-border)'
        el.style.boxShadow = 'none'
        el.style.transform = 'translateY(0)'
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: '16px',
          background: accent + '22',
          border: `1px solid ${accent}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: accent,
        }}
      >
        {icon}
      </div>
      <div>
        <p style={{ color: 'var(--td-text-hi)', fontWeight: 700, fontSize: '15px', margin: '0 0 6px' }}>
          {title}
        </p>
        <p style={{ color: 'var(--td-text-lo)', fontSize: '12px', lineHeight: 1.5, margin: 0 }}>
          {description}
        </p>
      </div>
    </button>
  )
}
