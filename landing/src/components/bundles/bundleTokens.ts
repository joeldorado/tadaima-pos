/**
 * Textos y colores propios del módulo Paquetes (2026-10-07). El look general
 * (fondos, bordes, tipografía) se reutiliza de Promos (`promoTokens`): este
 * archivo solo agrega lo que es del módulo, empezando por el NOMBRE — si
 * algún día se llama "Combos" o "Kits", se cambia aquí y en el menú.
 */
import { AMBER, GREEN, RED_SOFT } from "@/components/promos/promoTokens";

export const MODULE_LABEL = "Paquetes";
export const ENTITY = { one: "paquete", many: "paquetes", One: "Paquete", Many: "Paquetes" } as const;

/** Violeta: distinto del azul de "Tomo" y del verde de "Promo" en Caja. */
export const BUNDLE_COLOR = "#A78BFA";

export const TONE_COLOR = { green: GREEN, amber: AMBER, red: RED_SOFT } as const;

export const pluralize = (n: number, one: string, many: string): string =>
  `${n.toLocaleString("es-MX")} ${n === 1 ? one : many}`;

/** "3 paquetes" / "1 paquete". */
export const bundlesLabel = (n: number): string => pluralize(n, ENTITY.one, ENTITY.many);

/** Caja: un paquete sin armados no se "agrega stock" a mano — se arma desde su módulo. */
export const BUNDLE_NO_STOCK_IN_CAJA = `Este ${ENTITY.one} no tiene armados en esta tienda. Ármalo desde el menú ${MODULE_LABEL}.`;
