import type { TourDefinition } from "./types"
import { validateTourDefinition } from "./schema"

/**
 * Hidratación JSON → runtime de los tours guiados (gemelo de
 * `content/docs/hydrate.ts`): cada tour de `data/*.json` pasa por
 * `validateTourDefinition`. En dev/test un JSON inválido REVIENTA (throw con
 * todos los errores, para atrapar el problema al editar); en prod solo se
 * avisa por consola y el tour inválido se omite — los demás siguen vivos.
 */

function isStrictEnv(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === "test"
}

/**
 * Valida e hidrata un array de tours serializables.
 * `source` prefija las rutas de error (p.ej. `"tours"` → `tours[0].id: …`).
 */
export function hydrateTours(raw: unknown[], source = "tours"): TourDefinition[] {
  const tours: TourDefinition[] = []
  const allErrors: string[] = []

  raw.forEach((item, i) => {
    const result = validateTourDefinition(item, `${source}[${i}]`)
    if (result.ok) {
      tours.push(result.value)
    } else {
      allErrors.push(...result.errors)
    }
  })

  if (allErrors.length > 0) {
    const message = `[tours] Definición de tour inválida:\n${allErrors.join("\n")}`
    if (isStrictEnv()) throw new Error(message)
    console.warn(message)
  }

  return tours
}
