import type { LucideIcon } from "lucide-react"
import type { DocBlockData, DocFieldData, DocSectionData, DocTopicData } from "./schema"

/**
 * Modelo de contenido del Centro de Documentación (formas RUNTIME).
 *
 * Desde Documentación 2.0 el contenido vive como JSON serializable en
 * `data/*.json` (su forma y validador están en `schema.ts`, con `icon` como
 * string kebab-case). `hydrate.ts` valida cada tema con `validateTopicData`
 * y resuelve el icono a componente Lucide (`icons.ts`) para producir estos
 * tipos runtime, que consumen `DocsPage` y el renderer
 * (`components/docs/DocBlocks.tsx`).
 *
 * Editar o agregar un tutorial = editar `data/*.json` y registrarlo en
 * `index.ts` — a mano o vía el MCP `tadaima-docs`, que escribe JSON validado.
 */

/** Un campo de formulario recreado como mini-mock (con su label real de la UI). */
export type DocField = DocFieldData

/** Bloques de contenido. Un componente de render por `kind`. */
export type DocBlock = DocBlockData

export type DocSection = DocSectionData

/** Tema hidratado: igual que `DocTopicData` pero con el icono ya resuelto. */
export type DocTopic = Omit<DocTopicData, "icon"> & { icon: LucideIcon }
