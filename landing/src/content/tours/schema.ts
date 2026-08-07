/**
 * Forma SERIALIZABLE de los tours guiados + validador.
 *
 * Mismo patrón que `content/docs/schema.ts` (Documentación 2.0): los tours
 * viven como JSON en `data/*.json`, y `validateTourDefinition` es el guardián
 * de esos JSON — TS puro, sin dependencias, con mensajes en español que
 * incluyen la ruta exacta del campo inválido (p.ej.
 * `venta-caja.steps[2].placement: placement inválido 'center'`).
 *
 * Un paso SIN `target` se muestra como tarjeta centrada (intro / cierre).
 * `precondition.check` debe existir en `TOUR_CHECKS` (checks.ts).
 */

import { TOUR_CHECK_NAMES } from "./checks"

export const TOUR_PLACEMENTS = ["top", "bottom", "left", "right", "auto"] as const
export const TOUR_ROLES = ["admin", "gerente", "cajero"] as const

export type TourPlacement = (typeof TOUR_PLACEMENTS)[number]
export type TourRole = (typeof TOUR_ROLES)[number]

export interface TourPreconditionData {
  /** Key de `TOUR_CHECKS` (checks.ts) que decide si el paso puede mostrarse. */
  check: string
  failTitle: string
  failBody: string
  /** Permite "Saltar paso" cuando el check falla (default: false). */
  allowSkip?: boolean
  /**
   * Ancla `data-tour` donde se muestra el popover bloqueado (p.ej. el CTA
   * "Abrir Caja"). Sin él, se usa el target del paso o tarjeta centrada.
   */
  target?: string
}

export interface TourStepData {
  id: string
  /** Ruta a la que navega el paso (p.ej. "/caja"). */
  route?: string
  /** Ancla `data-tour="…"` a resaltar. Ausente = tarjeta centrada. */
  target?: string
  title: string
  body: string
  placement?: TourPlacement
  /** Espera el target hasta 5s tras navegar (polling + MutationObserver). */
  waitFor?: boolean
  /** Roles que ven el paso (ausente = todos). */
  roles?: TourRole[]
  precondition?: TourPreconditionData
}

export interface TourDefinitionData {
  id: string
  title: string
  description: string
  /** Key kebab-case del mapa de íconos del picker (opcional). */
  icon?: string
  /** Roles que ven el tour completo (ausente = todos). */
  roles?: TourRole[]
  /** Slug del tema de docs relacionado (deep-link `?tema=slug`). */
  topicSlug?: string
  steps: TourStepData[]
}

export type TourValidationResult =
  | { ok: true; value: TourDefinitionData }
  | { ok: false; errors: string[] }

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function isString(v: unknown): v is string {
  return typeof v === "string"
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

function checkRequiredString(obj: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (!isNonEmptyString(obj[key])) errors.push(`${path}.${key}: requerido, debe ser string no vacío`)
}

function checkOptionalString(obj: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (obj[key] !== undefined && !isString(obj[key])) errors.push(`${path}.${key}: debe ser string`)
}

function checkOptionalBoolean(obj: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (obj[key] !== undefined && typeof obj[key] !== "boolean") errors.push(`${path}.${key}: debe ser boolean`)
}

function validateRoles(raw: unknown, path: string, errors: string[]): void {
  if (raw === undefined) return
  if (!Array.isArray(raw)) {
    errors.push(`${path}: debe ser un array de roles`)
    return
  }
  raw.forEach((role, i) => {
    if (!TOUR_ROLES.includes(role as TourRole)) {
      errors.push(`${path}[${i}]: rol inválido '${String(role)}' (válidos: ${TOUR_ROLES.join(", ")})`)
    }
  })
}

function validatePrecondition(raw: unknown, path: string, errors: string[]): void {
  if (!isRecord(raw)) {
    errors.push(`${path}: debe ser un objeto { check, failTitle, failBody, allowSkip?, target? }`)
    return
  }
  if (!isNonEmptyString(raw["check"])) {
    errors.push(`${path}.check: requerido, debe ser string no vacío`)
  } else if (!TOUR_CHECK_NAMES.includes(raw["check"])) {
    errors.push(`${path}.check: check desconocido '${raw["check"]}' (válidos: ${TOUR_CHECK_NAMES.join(", ")})`)
  }
  checkRequiredString(raw, "failTitle", path, errors)
  checkRequiredString(raw, "failBody", path, errors)
  checkOptionalBoolean(raw, "allowSkip", path, errors)
  checkOptionalString(raw, "target", path, errors)
}

function validateStep(raw: unknown, path: string, errors: string[]): void {
  if (!isRecord(raw)) {
    errors.push(`${path}: debe ser un objeto TourStepData`)
    return
  }
  if (!isNonEmptyString(raw["id"])) {
    errors.push(`${path}.id: requerido, debe ser string no vacío`)
  } else if (!SLUG_RE.test(raw["id"])) {
    errors.push(`${path}.id: '${raw["id"]}' no es kebab-case (solo minúsculas, números y guiones)`)
  }
  checkRequiredString(raw, "title", path, errors)
  checkRequiredString(raw, "body", path, errors)
  if (raw["route"] !== undefined) {
    if (!isNonEmptyString(raw["route"]) || !raw["route"].startsWith("/")) {
      errors.push(`${path}.route: debe ser una ruta que empiece con '/' (ej. '/caja')`)
    }
  }
  checkOptionalString(raw, "target", path, errors)
  const placement = raw["placement"]
  if (placement !== undefined && !TOUR_PLACEMENTS.includes(placement as TourPlacement)) {
    const shown = typeof placement === "string" ? placement : JSON.stringify(placement) ?? "?"
    errors.push(`${path}.placement: placement inválido '${shown}' (válidos: ${TOUR_PLACEMENTS.join(", ")})`)
  }
  checkOptionalBoolean(raw, "waitFor", path, errors)
  validateRoles(raw["roles"], `${path}.roles`, errors)
  if (raw["precondition"] !== undefined) {
    validatePrecondition(raw["precondition"], `${path}.precondition`, errors)
  }
}

/**
 * Valida un tour serializable (lo que vive en `data/*.json`).
 * `path` prefija los mensajes de error (p.ej. `"venta-caja"`).
 */
export function validateTourDefinition(raw: unknown, path = "tour"): TourValidationResult {
  const errors: string[] = []
  if (!isRecord(raw)) {
    return { ok: false, errors: [`${path}: debe ser un objeto TourDefinitionData`] }
  }

  if (!isNonEmptyString(raw["id"])) {
    errors.push(`${path}.id: requerido, debe ser string no vacío`)
  } else if (!SLUG_RE.test(raw["id"])) {
    errors.push(`${path}.id: '${raw["id"]}' no es kebab-case (solo minúsculas, números y guiones)`)
  }
  checkRequiredString(raw, "title", path, errors)
  checkRequiredString(raw, "description", path, errors)
  checkOptionalString(raw, "icon", path, errors)
  validateRoles(raw["roles"], `${path}.roles`, errors)
  if (raw["topicSlug"] !== undefined && (!isNonEmptyString(raw["topicSlug"]) || !SLUG_RE.test(raw["topicSlug"]))) {
    errors.push(`${path}.topicSlug: debe ser un slug kebab-case (ej. 'cobro-caja')`)
  }

  const steps = raw["steps"]
  if (!Array.isArray(steps) || steps.length === 0) {
    errors.push(`${path}.steps: requerido, debe ser un array de pasos NO vacío`)
  } else {
    steps.forEach((step, i) => validateStep(step, `${path}.steps[${i}]`, errors))
    const ids = steps
      .filter(isRecord)
      .map((s) => s["id"])
      .filter(isNonEmptyString)
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${path}.steps: id de paso duplicado '${id}' (deben ser únicos)`)
      seen.add(id)
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: raw as unknown as TourDefinitionData }
}
