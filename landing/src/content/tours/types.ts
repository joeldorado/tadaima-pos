import type { TourDefinitionData, TourPreconditionData, TourStepData } from "./schema"

/**
 * Modelo de los tours guiados (formas RUNTIME).
 *
 * Los tours viven como JSON serializable en `data/*.json` (forma y validador
 * en `schema.ts`). A diferencia de docs, aquí no hay resolución de íconos en
 * la hidratación — `icon` queda como string kebab-case y el picker
 * (`components/tour/TourPickerDialog.tsx`) lo mapea a Lucide localmente —
 * así que los tipos runtime son alias directos de los serializables.
 *
 * Agregar un tour = JSON en `data/` + registrarlo en `index.ts`.
 */

export type TourStep = TourStepData
export type TourPrecondition = TourPreconditionData
export type TourDefinition = TourDefinitionData
