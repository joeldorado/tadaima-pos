/**
 * Forma SERIALIZABLE del contenido del Centro de Documentación + validador.
 *
 * Estos tipos describen el contenido tal como vive en `data/*.json` (el campo
 * `icon` es un string kebab-case que `icons.ts` resuelve a componente Lucide).
 * `validateTopicData` es el guardián de esos JSON: TS puro, sin dependencias,
 * con mensajes en español que incluyen la ruta exacta del campo inválido
 * (p.ej. `caja[0].sections[1].blocks[2]: kind desconocido 'x'`).
 *
 * El MCP `tadaima-docs` edita la documentación escribiendo estos JSON; todo
 * pasa por este validador antes de llegar a la UI (ver `hydrate.ts`).
 */

export const CALLOUT_TONES = ["info", "warn", "gold"] as const
export const CHIP_TONES = ["amber", "blue", "green"] as const
export const DOC_ROLES = ["admin", "gerente", "cajero"] as const

export type CalloutTone = (typeof CALLOUT_TONES)[number]
export type ChipTone = (typeof CHIP_TONES)[number]
export type DocRole = (typeof DOC_ROLES)[number]

/** Un campo de formulario recreado como mini-mock (con su label real de la UI). */
export interface DocFieldData {
  label: string
  hint?: string
  required?: boolean
}

/** Bloques de contenido. Un componente de render por `kind`. */
export type DocBlockData =
  | { kind: "prose"; text: string }
  | { kind: "steps"; items: { title: string; detail?: string }[] }
  | { kind: "callout"; tone: CalloutTone; title: string; text: string }
  | { kind: "chips"; chips: { label: string; tone: ChipTone }[] }
  | { kind: "fields"; fields: DocFieldData[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "image"; src: string; alt: string; caption?: string }
  | { kind: "link"; toTopic: string; label?: string }

export interface DocSectionData {
  /** Anchor opcional para deep-links dentro del tema. */
  id?: string
  heading: string
  blocks: DocBlockData[]
}

export interface DocTopicData {
  /** slug estable para el deep-link `?tema=slug`. */
  slug: string
  title: string
  /** Categoría para agrupar en el hub (el orden lo define `index.ts`). */
  category: string
  /** Key kebab-case de `ICON_MAP` (icons.ts). */
  icon: string
  /** Resumen de una línea para la card del hub. */
  summary: string
  sections: DocSectionData[]
  /** Roles que ven el tema (ausente = todos). */
  roles?: DocRole[]
  /** Términos extra para el buscador del hub. */
  keywords?: string[]
  /** Tour guiado asociado (Documentación 2.0, F2+). */
  tourId?: string
  /** Fecha de última edición (ISO), la escribe el MCP. */
  updatedAt?: string
}

export type ValidationResult =
  | { ok: true; value: DocTopicData }
  | { ok: false; errors: string[] }

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const BLOCK_KINDS = ["prose", "steps", "callout", "chips", "fields", "table", "image", "link"] as const

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function isString(v: unknown): v is string {
  return typeof v === "string"
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString)
}

/** Valida un string requerido no vacío; empuja el error con su ruta. */
function checkRequiredString(obj: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (!isNonEmptyString(obj[key])) errors.push(`${path}.${key}: requerido, debe ser string no vacío`)
}

/** Valida un string opcional; empuja el error con su ruta. */
function checkOptionalString(obj: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (obj[key] !== undefined && !isString(obj[key])) errors.push(`${path}.${key}: debe ser string`)
}

function validateSteps(block: Record<string, unknown>, path: string, errors: string[]): void {
  const items = block["items"]
  if (!Array.isArray(items)) {
    errors.push(`${path}.items: requerido, debe ser un array de pasos`)
    return
  }
  items.forEach((item, i) => {
    const p = `${path}.items[${i}]`
    if (!isRecord(item)) {
      errors.push(`${p}: debe ser un objeto { title, detail? }`)
      return
    }
    checkRequiredString(item, "title", p, errors)
    checkOptionalString(item, "detail", p, errors)
  })
}

function validateChips(block: Record<string, unknown>, path: string, errors: string[]): void {
  const chips = block["chips"]
  if (!Array.isArray(chips)) {
    errors.push(`${path}.chips: requerido, debe ser un array de chips`)
    return
  }
  chips.forEach((chip, i) => {
    const p = `${path}.chips[${i}]`
    if (!isRecord(chip)) {
      errors.push(`${p}: debe ser un objeto { label, tone }`)
      return
    }
    checkRequiredString(chip, "label", p, errors)
    if (!CHIP_TONES.includes(chip["tone"] as ChipTone)) {
      errors.push(`${p}.tone: tone inválido '${String(chip["tone"])}' (válidos: ${CHIP_TONES.join(", ")})`)
    }
  })
}

function validateFields(block: Record<string, unknown>, path: string, errors: string[]): void {
  const fields = block["fields"]
  if (!Array.isArray(fields)) {
    errors.push(`${path}.fields: requerido, debe ser un array de campos`)
    return
  }
  fields.forEach((field, i) => {
    const p = `${path}.fields[${i}]`
    if (!isRecord(field)) {
      errors.push(`${p}: debe ser un objeto { label, hint?, required? }`)
      return
    }
    checkRequiredString(field, "label", p, errors)
    checkOptionalString(field, "hint", p, errors)
    if (field["required"] !== undefined && typeof field["required"] !== "boolean") {
      errors.push(`${p}.required: debe ser boolean`)
    }
  })
}

function validateTable(block: Record<string, unknown>, path: string, errors: string[]): void {
  const head = block["head"]
  if (!isStringArray(head) || head.length === 0) {
    errors.push(`${path}.head: requerido, debe ser un array de strings no vacío`)
    return
  }
  const rows = block["rows"]
  if (!Array.isArray(rows)) {
    errors.push(`${path}.rows: requerido, debe ser un array de filas`)
    return
  }
  rows.forEach((row, i) => {
    if (!isStringArray(row)) {
      errors.push(`${path}.rows[${i}]: debe ser un array de strings`)
    } else if (row.length !== head.length) {
      errors.push(`${path}.rows[${i}]: tiene ${row.length} celdas pero head tiene ${head.length}`)
    }
  })
}

function validateBlock(raw: unknown, path: string, errors: string[]): void {
  if (!isRecord(raw)) {
    errors.push(`${path}: debe ser un objeto con 'kind'`)
    return
  }
  const kind = raw["kind"]
  if (!BLOCK_KINDS.includes(kind as (typeof BLOCK_KINDS)[number])) {
    errors.push(`${path}: kind desconocido '${String(kind)}' (válidos: ${BLOCK_KINDS.join(", ")})`)
    return
  }
  switch (kind) {
    case "prose":
      checkRequiredString(raw, "text", path, errors)
      break
    case "steps":
      validateSteps(raw, path, errors)
      break
    case "callout":
      if (!CALLOUT_TONES.includes(raw["tone"] as CalloutTone)) {
        errors.push(`${path}.tone: tone inválido '${String(raw["tone"])}' (válidos: ${CALLOUT_TONES.join(", ")})`)
      }
      checkRequiredString(raw, "title", path, errors)
      checkRequiredString(raw, "text", path, errors)
      break
    case "chips":
      validateChips(raw, path, errors)
      break
    case "fields":
      validateFields(raw, path, errors)
      break
    case "table":
      validateTable(raw, path, errors)
      break
    case "image":
      checkRequiredString(raw, "src", path, errors)
      checkRequiredString(raw, "alt", path, errors)
      checkOptionalString(raw, "caption", path, errors)
      break
    case "link":
      if (!isNonEmptyString(raw["toTopic"]) || !SLUG_RE.test(raw["toTopic"])) {
        errors.push(`${path}.toTopic: requerido, debe ser un slug kebab-case (ej. 'cobro-caja')`)
      }
      checkOptionalString(raw, "label", path, errors)
      break
  }
}

function validateSection(raw: unknown, path: string, errors: string[]): void {
  if (!isRecord(raw)) {
    errors.push(`${path}: debe ser un objeto { heading, blocks }`)
    return
  }
  checkRequiredString(raw, "heading", path, errors)
  if (raw["id"] !== undefined && !isNonEmptyString(raw["id"])) {
    errors.push(`${path}.id: debe ser string no vacío`)
  }
  const blocks = raw["blocks"]
  if (!Array.isArray(blocks)) {
    errors.push(`${path}.blocks: requerido, debe ser un array de bloques`)
    return
  }
  blocks.forEach((block, i) => validateBlock(block, `${path}.blocks[${i}]`, errors))
}

/**
 * Valida un tema serializable (lo que vive en `data/*.json`).
 * `path` prefija los mensajes de error (p.ej. `"caja[0]"`).
 */
export function validateTopicData(raw: unknown, path = "tema"): ValidationResult {
  const errors: string[] = []
  if (!isRecord(raw)) {
    return { ok: false, errors: [`${path}: debe ser un objeto DocTopicData`] }
  }

  if (!isNonEmptyString(raw["slug"])) {
    errors.push(`${path}.slug: requerido, debe ser string no vacío`)
  } else if (!SLUG_RE.test(raw["slug"])) {
    errors.push(`${path}.slug: '${raw["slug"]}' no es kebab-case (solo minúsculas, números y guiones)`)
  }
  checkRequiredString(raw, "title", path, errors)
  checkRequiredString(raw, "category", path, errors)
  checkRequiredString(raw, "icon", path, errors)
  checkRequiredString(raw, "summary", path, errors)

  const sections = raw["sections"]
  if (!Array.isArray(sections)) {
    errors.push(`${path}.sections: requerido, debe ser un array de secciones`)
  } else {
    sections.forEach((section, i) => validateSection(section, `${path}.sections[${i}]`, errors))
  }

  const roles = raw["roles"]
  if (roles !== undefined) {
    if (!Array.isArray(roles)) {
      errors.push(`${path}.roles: debe ser un array de roles`)
    } else {
      roles.forEach((role, i) => {
        if (!DOC_ROLES.includes(role as DocRole)) {
          errors.push(`${path}.roles[${i}]: rol inválido '${String(role)}' (válidos: ${DOC_ROLES.join(", ")})`)
        }
      })
    }
  }
  if (raw["keywords"] !== undefined && !isStringArray(raw["keywords"])) {
    errors.push(`${path}.keywords: debe ser un array de strings`)
  }
  if (raw["tourId"] !== undefined && !isNonEmptyString(raw["tourId"])) {
    errors.push(`${path}.tourId: debe ser string no vacío`)
  }
  checkOptionalString(raw, "updatedAt", path, errors)

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: raw as unknown as DocTopicData }
}
