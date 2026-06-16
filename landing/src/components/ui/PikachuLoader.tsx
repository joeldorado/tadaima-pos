import React from 'react'

interface PikachuLoaderProps {
  /** Texto bajo el Pikachu. `null` para ocultarlo. */
  label?: string | null
  /** Ancho del gif en px. */
  size?: number
  /**
   * `true` (default) ocupa toda la pantalla con el fondo de página.
   * `false` llena su contenedor de forma transparente (para usarlo dentro de
   * paneles/secciones).
   */
  fullScreen?: boolean
}

/**
 * Loader principal de la app: Pikachu corriendo (pixel-art). Reemplaza el
 * spinner circular en la carga de páginas (ProtectedRoute) y sirve para
 * cualquier estado de carga a pantalla/contenedor completo.
 */
export function PikachuLoader({
  label = 'Cargando...',
  size = 140,
  fullScreen = true,
}: PikachuLoaderProps): React.JSX.Element {
  return (
    <div
      className={`${fullScreen ? 'h-screen' : 'h-full w-full'} flex flex-col items-center justify-center gap-4`}
      style={{ background: fullScreen ? 'var(--td-page-bg)' : 'transparent' }}
    >
      <img
        src="/pikachu-loading.gif"
        alt="Cargando"
        width={size}
        // pixel-art: sin suavizado al escalar para que se vea nítido.
        style={{ width: size, height: 'auto', imageRendering: 'pixelated' }}
      />
      {label && (
        <p
          style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: '0.3em',
            color: 'var(--td-text-ghost)',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </p>
      )}
    </div>
  )
}
