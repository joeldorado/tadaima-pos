/**
 * Resolución de imágenes de la documentación.
 *
 * Las capturas viven en `src/assets/docs/<tema>/<n>-<nombre>.png` y los
 * bloques `{ kind: "image" }` las referencian con ruta RELATIVA a esa carpeta
 * (p.ej. `"caja/01-pantalla-caja.png"`). Vite las incluye en el build vía
 * `import.meta.glob` y aquí se traducen a la URL final con hash.
 *
 * Un glob vacío (carpeta sin PNGs) no truena: regresa `{}` y todo bloque
 * imagen cae al placeholder de `DocBlocks.tsx`.
 */

const DOC_IMAGES = import.meta.glob("../../assets/docs/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>

const GLOB_PREFIX = "../../assets/docs/"

/** URL final de una imagen de docs, o undefined si no existe la captura. */
export function resolveDocImage(rel: string): string | undefined {
  return DOC_IMAGES[`${GLOB_PREFIX}${rel}`]
}
