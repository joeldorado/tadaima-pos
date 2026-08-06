import type { DocTopic } from "./types"
import { validateTopicData } from "./schema"
import { resolveIcon } from "./icons"

/**
 * Hidratación JSON → runtime del Centro de Documentación.
 *
 * Cada tema de `data/*.json` pasa por `validateTopicData` y su `icon` string
 * se resuelve a componente Lucide. En dev/test un JSON inválido REVIENTA
 * (throw con todos los errores, para atrapar el problema al editar); en prod
 * solo se avisa por consola y el tema inválido se omite — la documentación
 * restante sigue funcionando.
 */

function isStrictEnv(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === "test"
}

/**
 * Valida e hidrata un array de temas serializables.
 * `source` prefija las rutas de error (p.ej. `"caja"` → `caja[0].slug: …`).
 */
export function hydrateTopics(raw: unknown[], source = "docs"): DocTopic[] {
  const topics: DocTopic[] = []
  const allErrors: string[] = []

  raw.forEach((item, i) => {
    const result = validateTopicData(item, `${source}[${i}]`)
    if (result.ok) {
      const { icon, ...rest } = result.value
      topics.push({ ...rest, icon: resolveIcon(icon) })
    } else {
      allErrors.push(...result.errors)
    }
  })

  if (allErrors.length > 0) {
    const message = `[docs] Contenido de documentación inválido:\n${allErrors.join("\n")}`
    if (isStrictEnv()) throw new Error(message)
    console.warn(message)
  }

  return topics
}
