import { useEffect, useState } from "react"
import { GalaxyField } from "@/effects/GalaxyField"
import type { CatalogTheme } from "@/lib/catalogThemes"

/**
 * Fondo "galaxia" del Catálogo Online (Catálogo v4).
 *
 * Envuelve el efecto GalaxyField de la FX library resolviendo tres cosas que el
 * efecto no trae y que en una tienda SÍ importan:
 *
 *  1. El efecto no verifica WebGL. `ogl` no lanza cuando no puede crear el
 *     contexto: deja `gl` en null y el efecto revienta con TypeError, lo que
 *     tumbaría el catálogo entero. Aquí se hace probe ANTES de montarlo.
 *  2. El efecto escucha `pointermove` en su contenedor y no trae
 *     `pointer-events: none` → tal cual, se come los clics de las tarjetas.
 *     Se sacrifica el parallax de mouse: en una tienda, comprar gana.
 *  3. Presupuesto móvil: 32 000 estrellas es mucho para un celular; el README
 *     del efecto recomienda ~10 000 y dpr 1.5.
 *
 * Este archivo se carga con React.lazy desde `./index`, así que `ogl` sale en
 * su propio chunk y solo baja si el catálogo está en modo galaxia.
 */

const MOBILE_BREAKPOINT = 768

/**
 * Estrellas y resolución según el aparato (README del efecto).
 *
 * `size` va bastante por encima del default (26): a la distancia de cámara que
 * usamos, con el tamaño original las estrellas quedan como polvo invisible
 * sobre los fondos claros de algunos temas (muertos, halloween).
 */
const BUDGET = {
  mobile: { count: 10000, dpr: 1.5, size: 34 },
  desktop: { count: 30000, dpr: 2, size: 42 },
} as const

/**
 * Velo oscuro DETRÁS del canvas. La galaxia son puntos de luz sumados: sin
 * algo oscuro debajo se pierde contra los fondos morados/verdes de los temas
 * festivos. El radial deja el color del tema respirando en los bordes.
 */
const VEIL =
  "radial-gradient(75% 65% at 50% 45%, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.12) 100%)"

interface GalaxyBackgroundProps {
  theme: CatalogTheme
}

/** WebGL disponible y sin reduced-motion. Se evalúa una vez, en el cliente. */
function useCanRenderGalaxy(): boolean {
  const [canRender, setCanRender] = useState(false)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const probe = document.createElement("canvas")
    const gl =
      probe.getContext("webgl2") ??
      probe.getContext("webgl") ??
      probe.getContext("experimental-webgl")

    if (gl) setCanRender(true)
  }, [])

  return canRender
}

export function GalaxyBackground({ theme }: GalaxyBackgroundProps) {
  const canRender = useCanRenderGalaxy()
  const isMobile = typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
  const budget = isMobile ? BUDGET.mobile : BUDGET.desktop

  // Sin WebGL o con reduced-motion no se monta nada: queda el --cat-page-bg
  // del tema, igual que hace ShaderBackground.
  if (!canRender) return null

  return (
    <div
      aria-hidden
      className="fixed inset-0"
      style={{ zIndex: 0, pointerEvents: "none", background: VEIL }}
    >
      <GalaxyField
        // Remonta limpio al cambiar de paleta (mismo criterio que el shader).
        key={theme.slug}
        // El fondo lo pone el tema (--cat-page-bg) + el velo de arriba, no el
        // radial azul que trae el efecto por defecto.
        transparent
        coreColor={theme.galaxyColors.core}
        edgeColor={theme.galaxyColors.edge}
        count={budget.count}
        dpr={budget.dpr}
        size={budget.size}
        // Más cerca que el default (8.2): así la espiral llena la pantalla.
        zoom={6.4}
        // Sin parallax: el wrapper no deja pasar eventos de puntero.
        mouseParallax={0}
        speed={0.6}
        opacity={1}
        style={{ position: "absolute", inset: 0 }}
      />
    </div>
  )
}

export default GalaxyBackground
