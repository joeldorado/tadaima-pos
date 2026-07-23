import { useEffect, useRef } from "react"

/**
 * Fondo animado de la Tienda Online (v2.2): nebulosa fbm en WebGL2
 * (basado en el shader de Matthias Hurrle @atzedent), re-tintada a la
 * identidad Tadaima (rojo profundo + ámbar).
 *
 * Catálogo v3: el tinte de la nebulosa es un uniform (`tint`) para soportar
 * temas festivos (navidad/halloween/patrio/muertos) — valores en
 * lib/catalogThemes.ts. Al cambiar de tema, pasar `key={slug}` para remontar.
 *
 * Decorativo puro:
 * - Sin interacción (solo uniforms resolution/time/tint) y pointer-events:none.
 * - NO se monta si el dispositivo pide reduced-motion o no hay WebGL2
 *   (queda el --cat-page-bg de siempre).
 * - Render a 0.5×devicePixelRatio para que sea barato en móvil.
 */

/** Tinte original Tadaima: rojo profundo con calidez ámbar. */
const DEFAULT_TINT: [number, number, number] = [0.24, 0.075, 0.05]

const VERT = `#version 300 es
precision highp float;
in vec4 position;
void main(){gl_Position=position;}`

const FRAG = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
uniform vec3 tint;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
float rnd(vec2 p) {
  p=fract(p*vec2(12.9898,78.233));
  p+=dot(p,p+34.56);
  return fract(p.x*p.y);
}
float noise(in vec2 p) {
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  float a=rnd(i), b=rnd(i+vec2(1,0)), c=rnd(i+vec2(0,1)), d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p) {
  float t=.0, a=1.; mat2 m=mat2(1.,-.5,.2,1.2);
  for (int i=0; i<5; i++) { t+=a*noise(p); p*=2.*m; a*=.5; }
  return t;
}
float clouds(vec2 p) {
  float d=1., t=.0;
  for (float i=.0; i<3.; i++) {
    float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);
    t=mix(t,d,a);
    d=a;
    p*=2./(i+1.);
  }
  return t;
}
void main(void) {
  vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2,1);
  vec3 col=vec3(0);
  float bg=clouds(vec2(st.x+T*.5,-st.y));
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for (float i=1.; i<12.; i++) {
    uv+=.1*cos(i*vec2(.1+.01*i, .8)+i*i+T*.5+.1*uv.x);
    vec2 p=uv;
    float d=length(p);
    col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.);
    float b=noise(i+p+bg*1.731);
    col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)));
    // Tinte de la nebulosa — uniform por tema (Catálogo v3)
    col=mix(col,bg*tint,d);
  }
  O=vec4(col,1);
}`

interface ShaderBackgroundProps {
  /** Tinte [r,g,b] de la nebulosa — de CATALOG_THEMES[slug].shaderTint. */
  tint?: [number, number, number]
  /**
   * Renderiza dentro del contenedor padre (`absolute inset-0`) en vez de a
   * pantalla completa. Lo usa la tira de preview del admin; el padre necesita
   * `position: relative` y `overflow: hidden`.
   */
  contained?: boolean
  /** Multiplicador del devicePixelRatio. 0.5 (default) es barato en móvil. */
  dprScale?: number
}

export function ShaderBackground({ tint = DEFAULT_TINT, contained = false, dprScale = 0.5 }: ShaderBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const gl = canvas.getContext("webgl2")
    if (!gl) return

    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)
      if (!sh) return null
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh)
        return null
      }
      return sh
    }

    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return
    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, "position")
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const uResolution = gl.getUniformLocation(program, "resolution")
    const uTime = gl.getUniformLocation(program, "time")
    const uTint = gl.getUniformLocation(program, "tint")
    gl.useProgram(program)
    gl.uniform3f(uTint, tint[0], tint[1], tint[2])

    // Se mide el CANVAS, no la ventana: a pantalla completa es lo mismo
    // (fixed inset-0 w-full h-full), y contenido es lo único correcto. El `||`
    // cubre el frame previo al primer layout, cuando clientWidth aún es 0.
    const resize = () => {
      const dpr = Math.max(1, dprScale * window.devicePixelRatio)
      const w = canvas.clientWidth || window.innerWidth
      const h = canvas.clientHeight || window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    // ResizeObserver cubre también el resize de ventana (el canvas es 100%).
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let raf = 0
    const loop = (now: number) => {
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.uniform2f(uResolution, canvas.width, canvas.height)
      gl.uniform1f(uTime, now * 1e-3)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buffer)
    }
    // tint entra por deps: si cambia el tema sin remount, recompila limpio.
  }, [tint, dprScale])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`${contained ? "absolute" : "fixed"} inset-0 w-full h-full pointer-events-none`}
      style={{ zIndex: 0, opacity: 0.55 }}
    />
  )
}
