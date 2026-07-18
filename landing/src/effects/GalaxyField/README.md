# GalaxyField

> **Galaxia espiral de partículas** en WebGL: decenas de miles de estrellas repartidas en
> brazos que giran lentamente, con núcleo incandescente, centelleo y parallax de cámara con
> el mouse. Sin CDN, sin escena remota — todo se genera en tu máquina.

- **Categoría:** background
- **GPU:** medium · **CPU:** very-low · **Score:** 86/100
- **Fondo:** oscuro y transparente
- **Móvil:** sí (baja `count` y `dpr`)

![preview](./preview.png)

---

## Por qué existe

El sitio original cargaba esta galaxia como una **escena 3D remota de Spline**, servida
desde un CDN externo. Eso significa: no funciona offline, depende de que dos servicios de
terceros respondan, arrastra un runtime 3D completo y no puedes cambiarle ni un color.

`GalaxyField` genera la misma idea de forma **nativa**: unos pocos KB de código, cero
dependencias externas más allá de `ogl`, y cada parámetro expuesto como prop.

---

## Cómo funciona

Cada estrella es **un vértice** dibujado con `gl.POINTS`. La forma de galaxia sale del
generador clásico de espirales:

1. **Radio** — a cada estrella se le da un radio aleatorio dentro del disco.
   Se usa `random^0.7` para concentrar algo más de población hacia el centro.
2. **Brazo** — la estrella `i` se asigna al brazo `i % branches`, cuyo ángulo base es
   `(i / branches) · 2π`.
3. **Spin** — se suma un giro **proporcional al radio**:
   ```
   ángulo = ánguloDelBrazo + radio · spin
   ```
   Como las estrellas lejanas giran más que las cercanas, el brazo recto se **curva** en
   espiral. Esta línea es literalmente lo que hace que parezca una galaxia.
4. **Dispersión** — cada estrella se desplaza con un offset aleatorio elevado a
   `randomnessPower`. Elevar a una potencia > 1 hace que **la mayoría de offsets sean
   pequeños** y solo unos pocos grandes: el brazo queda nítido en su eje y difuso en los
   bordes, en vez de una nube uniforme.
5. **Color** — se guarda el radio normalizado (0 centro → 1 borde) y el *shader* mezcla
   `coreColor → edgeColor`.

### Blending aditivo
Las estrellas se dibujan sumando luz (`SRC_ALPHA, ONE`). Donde se acumulan muchas —el
núcleo— el color satura y aparece el resplandor incandescente **sin necesidad de un pase
de bloom**. Es la razón de que el centro brille solo.

### Dos clases de parámetros (importante para el rendimiento)

| Tipo | Parámetros | Coste al cambiar |
|------|------------|------------------|
| **Estructurales** | `count`, `radius`, `branches`, `spin`, `randomness`, `randomnessPower`, `thickness` | Regeneran la geometría (recorren las N estrellas). Solo al moverlos. |
| **Apariencia** | `coreColor`, `edgeColor`, `size`, `opacity`, `twinkle`, `speed`, `tilt`, `zoom`, `mouseParallax` | Son *uniforms*: se aplican en caliente, **coste cero**. |

Por eso el color NO se hornea en la geometría: se guarda solo el radio normalizado y la
mezcla ocurre en el vertex shader. Cambiar la paleta es instantáneo aunque haya 80.000
estrellas.

---

## Uso

```tsx
import { GalaxyField } from './GalaxyField'

export default function Hero() {
  return (
    <section style={{ position: 'relative', height: '100vh' }}>
      <GalaxyField style={{ position: 'absolute', inset: 0 }} />
      <h1 style={{ position: 'relative' }}>Tu contenido encima</h1>
    </section>
  )
}
```

### Props

| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `count` | `number` | `32000` | Número de estrellas |
| `radius` | `number` | `5` | Radio del disco |
| `branches` | `number` | `4` | Brazos espirales |
| `spin` | `number` | `1` | Cuánto se enrosca cada brazo (negativo = gira al revés) |
| `randomness` | `number` | `0.22` | Dispersión fuera del brazo |
| `randomnessPower` | `number` | `3` | Concentración de esa dispersión |
| `thickness` | `number` | `0.35` | Grosor vertical del disco |
| `coreColor` | `string` (hex) | `#ffd9a0` | Color del núcleo |
| `edgeColor` | `string` (hex) | `#8b7dff` | Color del borde |
| `size` | `number` | `26` | Tamaño base de estrella en px |
| `opacity` | `number` | `1` | Opacidad global |
| `twinkle` | `number` | `0.35` | Amplitud del centelleo |
| `speed` | `number` | `1` | Velocidad de rotación |
| `tilt` | `number` | `0.7` | 0 = de canto, 1 = cenital |
| `zoom` | `number` | `8.2` | Distancia de cámara |
| `mouseParallax` | `number` | `0.5` | Reacción al mouse |
| `transparent` | `boolean` | `false` | Fondo transparente |
| `dpr` | `number` | `2` | Cap del devicePixelRatio |
| `paused` | `boolean` | `false` | Pausa la rotación |
| `preset` | `string` | — | Preset base |

### Presets
`Default` (paleta SOTSI: núcleo dorado + disco periwinkle) · `Milky Way` · `Nebula` ·
`Cyberpunk` · `Ember` · `Ice` · `Aurora` · `Monochrome` · `Edge On` (vista de canto).

---

## Integración

### Vite
`npm i ogl`, copia la carpeta y úsalo. El `import './GalaxyField.css'` funciona sin configuración.

### Next.js (App Router)
Usa WebGL, así que es Client Component:

```tsx
'use client'
import { GalaxyField } from '@/effects/GalaxyField'

<GalaxyField preset="Milky Way" style={{ position: 'fixed', inset: 0, zIndex: -1 }} />
```

---

## Rendimiento

El coste es sobre todo **fill-rate**: cuántos píxeles pintan las estrellas. Depende de
`count` × `size`, no solo del número de estrellas.

Para más FPS:
- Baja `count` (en móvil, ~10.000 va sobrado).
- Baja `size`: estrellas más pequeñas pintan mucho menos.
- Baja `dpr` (`dpr={1.5}`).
- `paused` + un `IntersectionObserver` en tu app cuando salga del viewport.

Otras decisiones de rendimiento ya incluidas:
- `discard` de las esquinas del punto: no se hace blending en píxeles transparentes.
- Sin z-buffer (`depth: false`): las partículas aditivas no lo necesitan.
- El `delta` del loop está limitado a 50 ms para que al volver de otra pestaña la galaxia
  no dé un salto.
- **Cero rerenders de React** durante la animación: todo se muta por `ref`.
- Al regenerar la geometría se liberan los buffers anteriores (`geometry.remove()`), así
  mover el slider de `count` no acumula VRAM.
- Con `prefers-reduced-motion: reduce` la galaxia se queda quieta (se sigue viendo, no gira).

---

## Customización común

| Quiero… | Cambia… |
|---------|---------|
| Espiral más cerrada | ↑ `spin` |
| Que gire al otro lado | `spin` negativo |
| Galaxia más difusa/nebulosa | ↑ `randomness`, ↓ `randomnessPower` |
| Brazos más nítidos | ↓ `randomness`, ↑ `randomnessPower` |
| Verla de canto | `tilt` cerca de `0` (preset `Edge On`) |
| Que llene la pantalla | ↓ `zoom` |
| Superponer contenido encima | `transparent` + posicionar con `style` |
| Estrellas más gruesas | ↑ `size` |

---

## Versionado
Original **1.0.0**; no se modifica salvo bugfix. Para mejoras visuales o de API, crea
`GalaxyField-v2/` como carpeta hermana (ver `../../CONTRIBUTING.md`).
