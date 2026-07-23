/**
 * GalaxyField
 * ==================================================================
 * Galaxia espiral de partículas renderizada con OGL. Miles de estrellas
 * distribuidas en brazos espirales que giran lentamente, con un núcleo
 * brillante y un degradado de color hacia el borde.
 *
 * Es el reemplazo NATIVO de la galaxia 3D que el sitio original cargaba
 * desde un CDN externo (Spline). Ventajas de hacerlo aquí:
 *   - Funciona offline y sin escena remota: nada que se caiga.
 *   - Pesa unos pocos KB en vez de un runtime 3D completo.
 *   - Es configurable de verdad (colores, densidad, brazos, giro…).
 *
 * Diseño (ver STANDARDS.md §3):
 *   - La animación vive en un rAF y muta uniforms/transform por `ref`:
 *     React no re-renderiza ni un solo frame.
 *   - Los parámetros se separan en dos grupos:
 *       · ESTRUCTURALES (count, radius, branches, spin, randomness…)
 *         → obligan a regenerar la geometría. Ocurre solo al cambiarlos.
 *       · DE APARIENCIA (colores, tamaño, opacidad, velocidad…)
 *         → son uniforms: se actualizan en caliente, sin regenerar nada.
 *   - Cleanup completo en unmount y seguro bajo React StrictMode.
 *
 * Integración: Vite y Next.js (marca `'use client'`). Requiere `npm i ogl`.
 * ==================================================================
 */

import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { Renderer, Camera, Transform, Geometry, Program, Mesh, Vec3 } from 'ogl'
import { galaxyVertexShader } from './shaders/galaxy.vert'
import { galaxyFragmentShader } from './shaders/galaxy.frag'
import { GalaxyFieldPresets } from './presets'
import './GalaxyField.css'

export interface GalaxyFieldProps {
  preset?: string
  /** Número de estrellas. Estructural. */
  count?: number
  /** Radio del disco galáctico. Estructural. */
  radius?: number
  /** Cantidad de brazos espirales. Estructural. */
  branches?: number
  /** Cuánto se enrosca cada brazo. Estructural. */
  spin?: number
  /** Dispersión de las estrellas fuera del brazo. Estructural. */
  randomness?: number
  /** Concentración de esa dispersión (más alto = más pegadas al brazo). Estructural. */
  randomnessPower?: number
  /** Grosor vertical del disco. Estructural. */
  thickness?: number
  /** Color del núcleo. */
  coreColor?: string
  /** Color del borde exterior. */
  edgeColor?: string
  /** Tamaño base de cada estrella en px. */
  size?: number
  /** Opacidad global [0..1]. */
  opacity?: number
  /** Amplitud del centelleo [0..1]. */
  twinkle?: number
  /** Velocidad de rotación. */
  speed?: number
  /** Inclinación de la cámara (0 = de canto, 1 = cenital). */
  tilt?: number
  /** Distancia de cámara: menor = más cerca. */
  zoom?: number
  /** Cuánto reacciona la galaxia al mouse [0..1]. */
  mouseParallax?: number
  /** Fondo transparente (true) u oscuro (false). */
  transparent?: boolean
  /** Cap del devicePixelRatio. */
  dpr?: number
  /** Pausa la rotación. */
  paused?: boolean
  className?: string
  style?: CSSProperties
}

/** Valores por defecto (coherentes con controls.ts). */
const DEFAULTS = {
  count: 32000,
  radius: 5,
  branches: 4,
  spin: 1,
  // Dispersión baja: con valores altos los brazos se difuminan y la galaxia
  // se ve como polvo suelto en vez de una espiral.
  randomness: 0.22,
  randomnessPower: 3,
  thickness: 0.35,
  coreColor: '#ffd9a0',
  edgeColor: '#8b7dff',
  size: 26,
  opacity: 1,
  twinkle: 0.35,
  speed: 1,
  // Bastante cenital: es el ángulo donde la espiral se lee mejor.
  tilt: 0.7,
  // Distancia suficiente para que el disco (diámetro = radius*2) entre en cuadro.
  zoom: 8.2,
  mouseParallax: 0.5,
  transparent: false,
}

/** Convierte "#rrggbb" o "#rgb" a [r,g,b] normalizado 0..1. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full =
    h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6)
  const int = parseInt(full, 16)
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255]
}

/** Interpolación lineal. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Genera las posiciones de la galaxia.
 *
 * ALGORITMO (el clásico "galaxy generator"):
 *  1. A cada estrella se le asigna un radio aleatorio dentro del disco.
 *  2. Se reparte entre los brazos: el brazo i ocupa el ángulo (i/branches)·2π.
 *  3. SPIN: se le suma un giro proporcional al radio → cuanto más lejos del
 *     centro, más girado está el brazo. Eso es lo que curva la espiral.
 *  4. RANDOMNESS: se desplaza cada estrella con un offset aleatorio elevado
 *     a `randomnessPower`. Elevar a una potencia >1 hace que la mayoría de
 *     offsets sean pequeños y solo unos pocos grandes, así el brazo se ve
 *     denso en el centro y difuso en los bordes (en vez de una nube uniforme).
 *  5. Se guarda además el radio NORMALIZADO para que el shader mezcle color.
 */
function buildGalaxyAttributes(p: typeof DEFAULTS) {
  const count = Math.max(1, Math.floor(p.count))
  const positions = new Float32Array(count * 3)
  const radii = new Float32Array(count)
  const randoms = new Float32Array(count)

  const branches = Math.max(1, Math.floor(p.branches))

  for (let i = 0; i < count; i++) {
    const i3 = i * 3

    // 1. Radio: Math.random()^0.7 concentra un poco más las estrellas
    //    hacia el centro, como en una galaxia real.
    const starRadius = Math.pow(Math.random(), 0.7) * p.radius

    // 2. Ángulo del brazo al que pertenece esta estrella.
    const branchAngle = ((i % branches) / branches) * Math.PI * 2

    // 3. Giro proporcional al radio: curva la espiral.
    const spinAngle = starRadius * p.spin

    // 4. Dispersión. El signo aleatorio evita que todo se desplace al mismo lado.
    const scatter = () =>
      Math.pow(Math.random(), p.randomnessPower) *
      (Math.random() < 0.5 ? 1 : -1) *
      p.randomness *
      starRadius

    const offsetX = scatter()
    const offsetY = scatter() * p.thickness
    const offsetZ = scatter()

    const angle = branchAngle + spinAngle
    positions[i3] = Math.cos(angle) * starRadius + offsetX
    positions[i3 + 1] = offsetY
    positions[i3 + 2] = Math.sin(angle) * starRadius + offsetZ

    // 5. Radio normalizado (0 centro → 1 borde) para el degradado de color.
    radii[i] = Math.min(starRadius / p.radius, 1)
    randoms[i] = Math.random()
  }

  return { positions, radii, randoms }
}

export function GalaxyField(props: GalaxyFieldProps) {
  const { className, style, dpr = 2, paused = false } = props

  // DEFAULTS <- preset <- props explícitas.
  const presetValues = props.preset ? GalaxyFieldPresets[props.preset] ?? {} : {}
  const explicit = Object.fromEntries(
    Object.entries(props).filter(([, v]) => v !== undefined),
  )
  const p = { ...DEFAULTS, ...presetValues, ...explicit } as typeof DEFAULTS

  const containerRef = useRef<HTMLDivElement>(null)

  // Refs vivos: el loop los lee sin provocar rerenders.
  const uniformsRef = useRef<Record<string, { value: number | Vec3 }>>({})
  const meshRef = useRef<Mesh | null>(null)
  const cameraRef = useRef<Camera | null>(null)
  const rebuildRef = useRef<((next: typeof DEFAULTS) => void) | null>(null)
  const targetMouseRef = useRef({ x: 0, y: 0 })
  const paramsRef = useRef(p)
  paramsRef.current = p
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  // ---- Montaje: crea WebGL una sola vez ----
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: false,
      dpr: Math.min(dpr, window.devicePixelRatio || 1),
      antialias: false, // los puntos ya salen suaves desde el shader
      depth: false, // partículas aditivas: no necesitamos z-buffer
    })
    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)

    const canvas = gl.canvas as HTMLCanvasElement
    canvas.style.cssText = 'display:block;width:100%;height:100%'
    container.appendChild(canvas)

    const camera = new Camera(gl, { fov: 50, near: 0.1, far: 200 })
    cameraRef.current = camera

    const scene = new Transform()

    const start = paramsRef.current
    const uniforms = {
      uTime: { value: 0 },
      uSize: { value: start.size },
      uPixelRatio: { value: renderer.dpr },
      uCoreColor: { value: new Vec3(...hexToRgb(start.coreColor)) },
      uEdgeColor: { value: new Vec3(...hexToRgb(start.edgeColor)) },
      uTwinkle: { value: start.twinkle },
      uOpacity: { value: start.opacity },
    }
    uniformsRef.current = uniforms

    const program = new Program(gl, {
      vertex: galaxyVertexShader,
      fragment: galaxyFragmentShader,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    // BLENDING ADITIVO: donde se superponen estrellas la luz se SUMA, y así
    // el núcleo se ve incandescente sin un pase extra de bloom.
    program.setBlendFunc(gl.SRC_ALPHA, gl.ONE)

    /** Crea (o recrea) la geometría de la galaxia. */
    const makeGeometry = (params: typeof DEFAULTS) => {
      const { positions, radii, randoms } = buildGalaxyAttributes(params)
      return new Geometry(gl, {
        position: { size: 3, data: positions },
        aRadius: { size: 1, data: radii },
        aRandom: { size: 1, data: randoms },
      })
    }

    const mesh = new Mesh(gl, {
      mode: gl.POINTS,
      geometry: makeGeometry(start),
      program,
    })
    mesh.setParent(scene)
    meshRef.current = mesh

    // Expone la regeneración para el efecto de parámetros estructurales.
    rebuildRef.current = (next) => {
      const previous = mesh.geometry
      mesh.geometry = makeGeometry(next)
      // Libera los buffers de la geometría anterior: sin esto, mover el
      // slider de "count" iría acumulando VRAM.
      previous.remove()
    }

    // ---- Resize ----
    const resize = () => {
      const w = container.clientWidth || 1
      const h = container.clientHeight || 1
      renderer.setSize(w, h)
      camera.perspective({ aspect: w / h })
      uniforms.uPixelRatio.value = renderer.dpr
    }
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    resize()

    // ---- Mouse: se guarda el objetivo y el loop lo suaviza ----
    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      targetMouseRef.current = {
        x: (event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5,
        y: (event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5,
      }
    }
    container.addEventListener('pointermove', onPointerMove)

    // ---- Loop ----
    let raf = 0
    let elapsed = 0
    let last = performance.now()
    const smoothMouse = { x: 0, y: 0 }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const delta = Math.min((now - last) / 1000, 0.05) // clamp: evita saltos al volver de otra pestaña
      last = now
      if (pausedRef.current) return

      const params = paramsRef.current

      // El tiempo solo avanza si hay animación (respeta reduced-motion).
      if (!prefersReducedMotion) elapsed += delta * params.speed
      uniforms.uTime.value = elapsed

      // Rotación de la galaxia sobre su eje.
      mesh.rotation.y = elapsed * 0.12

      // Parallax suavizado: la cámara orbita ligeramente con el puntero.
      smoothMouse.x = lerp(smoothMouse.x, targetMouseRef.current.x, 0.05)
      smoothMouse.y = lerp(smoothMouse.y, targetMouseRef.current.y, 0.05)

      const orbit = params.mouseParallax
      // `tilt` sitúa la cámara entre el plano del disco y la vista cenital.
      const height = lerp(0.2, 1, params.tilt) * params.zoom * 0.55
      camera.position.set(
        smoothMouse.x * orbit * 2.4,
        height - smoothMouse.y * orbit * 1.8,
        params.zoom,
      )
      camera.lookAt([0, 0, 0])

      renderer.render({ scene, camera })
    }
    raf = requestAnimationFrame(frame)

    // ---- Cleanup total ----
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      container.removeEventListener('pointermove', onPointerMove)
      mesh.geometry.remove()
      const lose = gl.getExtension('WEBGL_lose_context')
      lose?.loseContext()
      if (canvas.parentNode === container) container.removeChild(canvas)
      uniformsRef.current = {}
      meshRef.current = null
      cameraRef.current = null
      rebuildRef.current = null
    }
    // Solo dpr recrea el contexto; el resto se sincroniza abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpr])

  // ---- Parámetros de APARIENCIA -> uniforms (en caliente) ----
  useEffect(() => {
    // Tadaima: el repo compila con noUncheckedIndexedAccess, así que cada
    // uniform se lee con optional chaining en vez de confiar en el guard de
    // uTime (el mapa está vacío hasta que monta el contexto WebGL).
    const u = uniformsRef.current
    if (!u.uTime) return
    ;(u.uCoreColor?.value as Vec3 | undefined)?.set(...hexToRgb(p.coreColor))
    ;(u.uEdgeColor?.value as Vec3 | undefined)?.set(...hexToRgb(p.edgeColor))
    if (u.uSize) u.uSize.value = p.size
    if (u.uOpacity) u.uOpacity.value = p.opacity
    if (u.uTwinkle) u.uTwinkle.value = p.twinkle
  }, [p.coreColor, p.edgeColor, p.size, p.opacity, p.twinkle])

  // ---- Parámetros ESTRUCTURALES -> regeneran la geometría ----
  // Se ejecuta solo cuando cambia uno de ellos, no por frame.
  useEffect(() => {
    rebuildRef.current?.(paramsRef.current)
  }, [
    p.count,
    p.radius,
    p.branches,
    p.spin,
    p.randomness,
    p.randomnessPower,
    p.thickness,
  ])

  return (
    <div
      ref={containerRef}
      className={`galaxyfield${className ? ` ${className}` : ''}`}
      data-transparent={p.transparent || undefined}
      style={style}
    />
  )
}

export default GalaxyField
