import { useState, type CSSProperties, type ReactNode, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * Aceternity-style Hover Effect — wrapper que añade dos capas al hover:
 *  1. Una "blob" semi-transparente que aparece detrás cuando el cursor entra.
 *  2. Un spotlight radial que sigue al cursor mientras se mueve dentro.
 *
 * Se compone alrededor del contenido existente sin cambiar el layout interno.
 * El glass `var(--td-*)` se preserva — solo se agrega la capa de efecto.
 *
 * Uso típico:
 *   <HoverCard className="...estilos card normales..." accent="#E0221A">
 *     <SectionLabel>...</SectionLabel>
 *     ...contenido...
 *   </HoverCard>
 */
export function HoverCard({
  children,
  className,
  style,
  accent = 'rgba(224,34,26,0.18)',
  onClick,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Color del spotlight + blob. Default rojo Tadaima. */
  accent?: string
  onClick?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={handleMouseMove}
      onClick={onClick}
      className={cn('relative group/card', onClick && 'cursor-pointer', className)}
      style={style}
    >
      {/* Capa 1: blob de hover (aparece detrás del contenido) */}
      <AnimatePresence>
        {hovered && (
          <motion.span
            className="absolute inset-0 rounded-[inherit] pointer-events-none"
            style={{
              background: accent,
              filter: 'blur(40px)',
              zIndex: 0,
            }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1.05 }}
            exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Capa 2: spotlight radial que sigue al cursor (sutil, encima del bg) */}
      <div
        className="absolute inset-0 rounded-[inherit] opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(220px circle at ${pos.x}px ${pos.y}px, ${accent}, transparent 60%)`,
          zIndex: 1,
        }}
      />

      {/* Contenido — relative + z-10 para que quede encima de las dos capas */}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
