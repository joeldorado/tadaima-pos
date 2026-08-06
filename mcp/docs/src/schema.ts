/**
 * Copia consciente del schema canónico en landing/src/content/docs/schema.ts —
 * cambios SIEMPRE en pareja: si el schema TS de landing cambia (kinds, tonos,
 * roles, campos), esta réplica en zod DEBE actualizarse en el mismo commit.
 *
 * También define TourDefinition/TourStep (Documentación 2.0 — tours guiados),
 * cuyos JSON viven en landing/src/content/tours/data/*.json.
 */
import { z } from "zod"

export const CALLOUT_TONES = ["info", "warn", "gold"] as const
export const CHIP_TONES = ["amber", "blue", "green"] as const
export const DOC_ROLES = ["admin", "gerente", "cajero"] as const

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** String requerido no vacío (sin transformar el valor). */
const nonEmpty = z
  .string()
  .refine((s) => s.trim().length > 0, { message: "requerido, debe ser string no vacío" })

const slugSchema = z
  .string()
  .regex(SLUG_RE, "debe ser un slug kebab-case (solo minúsculas, números y guiones)")

const rolesSchema = z.array(z.enum(DOC_ROLES))

// ── Bloques de contenido (8 kinds — espejo exacto de DocBlockData) ───────────

const proseBlock = z.object({
  kind: z.literal("prose"),
  text: nonEmpty.describe("Texto del párrafo"),
})

const stepsBlock = z.object({
  kind: z.literal("steps"),
  items: z
    .array(
      z.object({
        title: nonEmpty.describe("Título del paso"),
        detail: z.string().optional().describe("Detalle opcional del paso"),
      })
    )
    .describe("Pasos numerados"),
})

const calloutBlock = z.object({
  kind: z.literal("callout"),
  tone: z.enum(CALLOUT_TONES).describe("Tono visual: info | warn | gold"),
  title: nonEmpty.describe("Título del callout"),
  text: nonEmpty.describe("Texto del callout"),
})

const chipsBlock = z.object({
  kind: z.literal("chips"),
  chips: z
    .array(
      z.object({
        label: nonEmpty.describe("Etiqueta del chip"),
        tone: z.enum(CHIP_TONES).describe("Tono: amber | blue | green"),
      })
    )
    .describe("Lista de chips"),
})

const fieldsBlock = z.object({
  kind: z.literal("fields"),
  fields: z
    .array(
      z.object({
        label: nonEmpty.describe("Label real del campo en la UI"),
        hint: z.string().optional().describe("Ayuda del campo"),
        required: z.boolean().optional().describe("¿Es obligatorio?"),
      })
    )
    .describe("Campos de formulario recreados como mini-mock"),
})

/** El cross-check filas-vs-head se hace en checkTableRows (post-parse):
 *  zod v3 no admite ZodEffects dentro de discriminatedUnion. */
const tableBlock = z.object({
  kind: z.literal("table"),
  head: z.array(z.string()).min(1).describe("Encabezados de columna (no vacío)"),
  rows: z.array(z.array(z.string())).describe("Filas — cada una con tantas celdas como head"),
})

const imageBlock = z.object({
  kind: z.literal("image"),
  src: nonEmpty.describe("Ruta de la imagen (screenshot en landing/src/assets/docs/...)"),
  alt: nonEmpty.describe("Texto alternativo"),
  caption: z.string().optional().describe("Pie de imagen"),
})

const linkBlock = z.object({
  kind: z.literal("link"),
  toTopic: slugSchema.describe("Slug del tema destino (ej. 'cobro-caja')"),
  label: z.string().optional().describe("Texto del link (default: título del tema destino)"),
})

export const DocBlockSchema = z.discriminatedUnion("kind", [
  proseBlock,
  stepsBlock,
  calloutBlock,
  chipsBlock,
  fieldsBlock,
  tableBlock,
  imageBlock,
  linkBlock,
])
export type DocBlockData = z.infer<typeof DocBlockSchema>

export const DocSectionSchema = z.object({
  id: nonEmpty.optional().describe("Anchor opcional para deep-links dentro del tema"),
  heading: nonEmpty.describe("Encabezado de la sección"),
  blocks: z.array(DocBlockSchema).describe("Bloques de contenido de la sección"),
})
export type DocSectionData = z.infer<typeof DocSectionSchema>

/** Valida que cada fila de cada tabla tenga tantas celdas como su head. */
export function checkTableRows(topic: { sections: DocSectionData[] }, path: string): string[] {
  const errors: string[] = []
  topic.sections.forEach((section, si) => {
    section.blocks.forEach((block, bi) => {
      if (block.kind !== "table") return
      block.rows.forEach((row, ri) => {
        if (row.length !== block.head.length) {
          errors.push(
            `${path}.sections[${si}].blocks[${bi}].rows[${ri}]: tiene ${row.length} celdas pero head tiene ${block.head.length}`
          )
        }
      })
    })
  })
  return errors
}

export const DocTopicSchema = z.object({
  slug: slugSchema.describe("Slug estable para el deep-link ?tema=slug"),
  title: nonEmpty.describe("Título del tema"),
  category: nonEmpty.describe("Categoría para agrupar en el hub (texto visible, ej. 'Caja y ventas')"),
  icon: nonEmpty.describe("Key kebab-case de ICON_MAP (ver list_icons)"),
  summary: nonEmpty.describe("Resumen de una línea para la card del hub"),
  sections: z.array(DocSectionSchema).describe("Secciones del tema"),
  roles: rolesSchema.optional().describe("Roles que ven el tema (ausente = todos)"),
  keywords: z.array(z.string()).optional().describe("Términos extra para el buscador del hub"),
  tourId: nonEmpty.optional().describe("Tour guiado asociado (id de tours/data/<id>.json)"),
  updatedAt: z.string().optional().describe("Fecha ISO de última edición (la escribe el MCP)"),
})
export type DocTopicData = z.infer<typeof DocTopicSchema>

// ── Tours guiados (TourDefinition) ───────────────────────────────────────────

export const TourStepSchema = z.object({
  id: nonEmpty.describe("Id estable del paso"),
  route: z.string().optional().describe("Ruta de la app donde vive el paso (ej. '/caja')"),
  target: z.string().optional().describe("Valor de data-tour del elemento a resaltar"),
  title: nonEmpty.describe("Título del paso"),
  body: nonEmpty.describe("Texto del paso"),
  placement: z.string().optional().describe("Posición del tooltip (top/bottom/left/right...)"),
  waitFor: z.string().optional().describe("Selector/condición a esperar antes de mostrar el paso"),
  roles: rolesSchema.optional().describe("Roles que ven el paso (ausente = todos)"),
  precondition: z
    .object({
      check: nonEmpty.describe("Nombre del check de precondición"),
      failTitle: nonEmpty.describe("Título si la precondición falla"),
      failBody: nonEmpty.describe("Texto si la precondición falla"),
      allowSkip: z.boolean().optional().describe("¿Permite saltar el paso si falla?"),
    })
    .optional()
    .describe("Precondición del paso (ej. caja abierta)"),
})
export type TourStep = z.infer<typeof TourStepSchema>

export const TourSchema = z.object({
  id: slugSchema.describe("Id del tour — también nombre del archivo tours/data/<id>.json"),
  title: nonEmpty.describe("Título del tour"),
  description: nonEmpty.describe("Descripción corta del tour"),
  icon: z.string().optional().describe("Key kebab-case de ICON_MAP"),
  roles: rolesSchema.optional().describe("Roles que ven el tour (ausente = todos)"),
  topicSlug: slugSchema.optional().describe("Tema de documentación asociado"),
  steps: z.array(TourStepSchema).min(1).describe("Pasos del tour (mínimo 1)"),
})
export type TourDefinition = z.infer<typeof TourSchema>

/** Formatea errores de zod con la ruta exacta del campo, estilo del validador de landing. */
export function formatZodErrors(error: z.ZodError, path: string): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.length ? `${path}.${issue.path.join(".")}` : path
    return `${where}: ${issue.message}`
  })
}
