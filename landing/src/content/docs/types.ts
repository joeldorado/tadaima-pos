import type { LucideIcon } from "lucide-react"

/**
 * Modelo de contenido del Centro de Documentación.
 *
 * La documentación vive como DATOS (no como JSX): cada tema es un objeto
 * `DocTopic` con secciones y bloques tipados. Agregar un tutorial nuevo =
 * agregar un objeto a `landing/src/content/docs/*` y registrarlo en `index.ts`.
 * El renderer (`components/docs/DocBlocks.tsx`) pinta cada `kind` de bloque.
 */

/** Un escalón de "descuento por cantidad" (espejo de PromoTier del motor). */
export interface DocTier {
  qty: number
  amount: number
}

/** Un campo de formulario recreado como mini-mock (con su label real de la UI). */
export interface DocField {
  label: string
  hint?: string
  required?: boolean
}

/** Bloques de contenido. Un componente de render por `kind`. */
export type DocBlock =
  | { kind: "prose"; text: string }
  | { kind: "steps"; items: { title: string; detail?: string }[] }
  | { kind: "callout"; tone: "info" | "warn" | "gold"; title: string; text: string }
  | { kind: "tiers"; tiers: DocTier[]; example: number }
  | { kind: "chips"; chips: { label: string; tone: "amber" | "blue" | "green" }[] }
  | { kind: "fields"; fields: DocField[] }
  | { kind: "table"; head: string[]; rows: string[][] }

export interface DocSection {
  heading: string
  blocks: DocBlock[]
}

export interface DocTopic {
  /** slug estable para el deep-link `?tema=slug`. */
  slug: string
  title: string
  /** Categoría para agrupar en el hub (el orden lo define `index.ts`). */
  category: string
  icon: LucideIcon
  /** Resumen de una línea para la card del hub. */
  summary: string
  sections: DocSection[]
}
