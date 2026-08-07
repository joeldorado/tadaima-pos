import type { Role } from "@/lib/permisos"
import type { TourDefinition, TourStep } from "./types"
import type { TourRole } from "./schema"
import { hydrateTours } from "./hydrate"
import ventaCajaData from "./data/venta-caja.json"
import preventasData from "./data/preventas.json"
import corteCajaData from "./data/corte-caja.json"
import altaProductoData from "./data/alta-producto.json"

export type { TourDefinition, TourStep, TourPrecondition } from "./types"
export { TOUR_CHECKS } from "./checks"

/**
 * Registro ordenado de los tours guiados (el orden define el picker).
 * El contenido vive en `data/*.json` (ver `schema.ts` / `hydrate.ts`).
 * Para agregar un tour: JSON nuevo en `data/` + import aquí.
 */
export const TOURS: TourDefinition[] = hydrateTours(
  [ventaCajaData, preventasData, corteCajaData, altaProductoData],
  "tours",
)

export function findTour(id: string | null | undefined): TourDefinition | undefined {
  if (!id) return undefined
  return TOURS.find((t) => t.id === id)
}

/**
 * Pasos visibles para un rol (función pura, testeable en aislamiento).
 * Un paso sin `roles` lo ven todos; con `roles`, solo esos. El rol
 * `"unknown"` solo ve pasos sin restricción.
 */
export function stepsForRole(steps: TourStep[], role: Role): TourStep[] {
  return steps.filter((s) => !s.roles || s.roles.includes(role as TourRole))
}

/**
 * Tours visibles para un rol (para el picker): respeta `roles` a nivel tour
 * y descarta tours que, ya filtrados por rol, quedarían sin pasos.
 */
export function toursForRole(role: Role): TourDefinition[] {
  return TOURS.filter(
    (t) => (!t.roles || t.roles.includes(role as TourRole)) && stepsForRole(t.steps, role).length > 0,
  )
}
