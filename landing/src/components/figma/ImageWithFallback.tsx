import React, { useState } from 'react'

// Branded placeholder shown when a product has no image or the image fails to load.
// Matches Tadaima's dark theme + red accent.
function TadaimaPlaceholder({
  className,
  style,
}: {
  className?: string | undefined
  style?: React.CSSProperties | undefined
}) {
  return (
    <div
      className={`inline-flex items-center justify-center flex-col gap-2 ${className ?? ''}`}
      style={{
        background: 'linear-gradient(145deg, #100a1a 0%, #1a0505 60%, #0d0d18 100%)',
        ...style,
      }}
    >
      {/* Mini logo */}
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: '4px 7px',
          boxShadow: '0 0 14px rgba(204,34,0,0.35), 0 2px 6px rgba(0,0,0,0.4)',
          border: '1px solid rgba(204,34,0,0.12)',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 900,
            color: '#E0221A',
            letterSpacing: '-0.02em',
            display: 'block',
            lineHeight: 1,
          }}
        >
          Tadaima
        </span>
      </div>
      {/* Label */}
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.18em',
          color: 'rgba(255,255,255,0.18)',
          textTransform: 'uppercase',
        }}
      >
        Sin foto
      </span>
    </div>
  )
}

// Override src to also accept null (product images can be null from the API)
type ImageWithFallbackProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null | undefined
}

export function ImageWithFallback({ src, alt, style, className, ...rest }: ImageWithFallbackProps) {
  const [didError, setDidError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Show placeholder immediately if src is missing — no need to wait for an error event
  if (!src || didError) {
    return (
      <TadaimaPlaceholder
        {...(className !== undefined ? { className } : {})}
        {...(style !== undefined ? { style } : {})}
      />
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      // Fade-in al cargar: la foto aparece suave en vez de "brincar".
      style={{ ...style, opacity: loaded ? 1 : 0, transition: 'opacity 0.35s ease' }}
      // Lazy: solo descarga cuando entra al viewport (ahorra bandwidth en catálogos
      // largos). Async: decodifica fuera del main thread, sin bloquear render.
      loading="lazy"
      decoding="async"
      {...rest}
      // Imágenes ya en caché pueden estar completas antes de que onLoad enganche.
      ref={(el) => { if (el?.complete && el.naturalWidth > 0 && !loaded) setLoaded(true) }}
      onLoad={() => { setLoaded(true) }}
      onError={() => { setDidError(true) }}
    />
  )
}
