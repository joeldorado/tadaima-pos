import type { DocBlockData } from "@/content/docs/schema"

/**
 * Lógica PURA del buscador del Centro de Documentación.
 *
 * Aquí no hay React: solo normalización de texto, slugs de anclas por sección
 * y construcción/consulta del índice de búsqueda. La UI vive en
 * `components/docs/DocsSearch.tsx`; esta capa se testea en aislamiento
 * (patrón del repo: lógica de negocio en `lib/` con test al lado).
 */

// ─── Tipos ──────────────────────────────────────────────────────────────────

/** Forma mínima de una sección que el índice necesita (subset de DocSection). */
export interface DocsSearchSectionInput {
  id?: string | undefined
  heading: string
  blocks: DocBlockData[]
}

/** Forma mínima de un tema (subset estructural de DocTopic, sin icono). */
export interface DocsSearchTopicInput {
  slug: string
  title: string
  category: string
  summary: string
  keywords?: string[] | undefined
  sections: DocsSearchSectionInput[]
}

/** Una entrada del índice: un tema completo o una sección puntual. */
export interface DocsSearchEntry {
  /** `tema` = deep-link `?tema=`; `seccion` = deep-link `?tema=&seccion=`. */
  type: "tema" | "seccion"
  /** Slug del tema destino. */
  tema: string
  /** Ancla de la sección destino (solo para `type: "seccion"`). */
  seccion?: string
  /** Texto principal del resultado (título del tema o heading de la sección). */
  label: string
  /** Contexto secundario (summary del tema, o título del tema padre). */
  context: string
  category: string
  /** Texto normalizado (minúsculas, sin acentos) contra el que se busca. */
  haystack: string
}

// ─── Normalización y slugs ──────────────────────────────────────────────────

/** Minúsculas + sin acentos (NFD), para matching insensible a diacríticos. */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

/** `"Cerrar tu caja"` → `"cerrar-tu-caja"`. Sin dependencias externas. */
export function slugify(text: string): string {
  return normalizeSearchText(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Ancla estable de una sección: su `id` explícito o el slug del heading. */
export function sectionAnchor(section: { id?: string | undefined; heading: string }): string {
  return section.id ?? slugify(section.heading)
}

// ─── Índice de búsqueda ─────────────────────────────────────────────────────

/**
 * Aplana a texto plano los bloques buscables de una sección
 * (prose, steps, callout y table; los demás kinds son visuales).
 */
export function flattenBlocksText(blocks: DocBlockData[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    switch (block.kind) {
      case "prose":
        parts.push(block.text)
        break
      case "steps":
        for (const item of block.items) {
          parts.push(item.title)
          if (item.detail) parts.push(item.detail)
        }
        break
      case "callout":
        parts.push(block.title, block.text)
        break
      case "table":
        parts.push(...block.head)
        for (const row of block.rows) parts.push(...row)
        break
      default:
        break
    }
  }
  return parts.join(" ")
}

/**
 * Construye el índice desde los temas VISIBLES para el rol actual:
 * una entrada por tema (title + summary + keywords) y una por sección
 * (heading + textos aplanados de sus bloques).
 */
export function buildSearchIndex(topics: DocsSearchTopicInput[]): DocsSearchEntry[] {
  const entries: DocsSearchEntry[] = []
  for (const topic of topics) {
    entries.push({
      type: "tema",
      tema: topic.slug,
      label: topic.title,
      context: topic.summary,
      category: topic.category,
      haystack: normalizeSearchText([topic.title, topic.summary, ...(topic.keywords ?? [])].join(" ")),
    })
    for (const section of topic.sections) {
      entries.push({
        type: "seccion",
        tema: topic.slug,
        seccion: sectionAnchor(section),
        label: section.heading,
        context: topic.title,
        category: topic.category,
        haystack: normalizeSearchText(`${section.heading} ${flattenBlocksText(section.blocks)}`),
      })
    }
  }
  return entries
}

/**
 * Busca en el índice: todos los tokens de la query (normalizados) deben
 * aparecer como substring del haystack. Query vacía → sin resultados.
 */
export function searchDocs(index: DocsSearchEntry[], query: string): DocsSearchEntry[] {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  return index.filter((entry) => tokens.every((token) => entry.haystack.includes(token)))
}
