/**
 * Checks de precondición para los tours guiados.
 *
 * Son funciones PURAS sobre el DOM: leen anclas `data-tour` que las páginas ya
 * exponen, sin importar componentes ni stores de página — así el motor de
 * tours no se acopla a SellPage y compañía. Cada check devuelve `true` cuando
 * la precondición se cumple y el paso puede mostrarse.
 *
 * Para agregar un check: función aquí + usarlo en `precondition.check` de un
 * paso (el validador de `schema.ts` rechaza checks desconocidos).
 */

export const TOUR_CHECKS: Record<string, () => boolean> = {
  /**
   * Caja abierta.
   * SellPage tiene un gate temprano: sin sesión de caja renderiza la pantalla
   * "Caja cerrada" (con el CTA `[data-tour="sell-open-register"]`) y NADA de
   * la barra de venta. Con sesión abierta monta el buscador de productos
   * `[data-tour="sell-search"]`. Presencia del buscador ⇔ caja abierta.
   * Fuera de /caja ninguno de los dos existe → false (el paso que usa este
   * check siempre lleva route:"/caja").
   */
  "caja-abierta": () =>
    typeof document !== "undefined" &&
    document.querySelector('[data-tour="sell-search"]') !== null,

  /**
   * Carrito con items.
   * El botón Cobrar `[data-tour="sell-cobrar"]` solo existe con caja abierta,
   * y SellPage lo pone `disabled` cuando `items.length === 0` (también con
   * método de pago bloqueado o procesando — para efectos del tour, cualquier
   * caso donde el cobro no procede cuenta como "aún no listo").
   */
  "carrito-con-items": () => {
    if (typeof document === "undefined") return false
    const btn = document.querySelector('[data-tour="sell-cobrar"]')
    return btn !== null && !btn.hasAttribute("disabled")
  },
}

/** Nombres válidos para `precondition.check` (los consume el validador). */
export const TOUR_CHECK_NAMES: string[] = Object.keys(TOUR_CHECKS)
