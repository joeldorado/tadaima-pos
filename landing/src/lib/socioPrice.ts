/**
 * Precio Socio en Caja: qué nivel lleva cada línea y qué se le dice al cajero.
 *
 * Reglas (ver AGENTS.md → «Precio socio»):
 *  - Socio ACTIVO: precio Socio automático, salvo tarjeta o preventa.
 *  - Socio INACTIVO (membresía vencida u otro estatus que no sea ACTIVO) o cliente
 *    sin membresía: precio Normal, pero el cajero puede
 *    poner Socio a mano en la línea (2026-11-18, pedido de la tienda: amigos y
 *    clientes de confianza). Del 2026-06-25 a esa fecha el inactivo estaba bloqueado.
 */
import type { PriceLevel } from "@/types/pos";

interface SocioLine {
  priceLevel: PriceLevel;
  product: { price_b?: number | null | undefined };
}

/**
 * Reaplica el nivel Socio/Normal a las líneas del carril automático (a ↔ b).
 * Respeta mayoreo (c/d/e) y deja en Normal los productos sin precio Socio.
 */
export function repriceForSocio<L extends SocioLine>(items: readonly L[], level: PriceLevel): L[] {
  return items.map(i => {
    if (i.priceLevel !== "a" && i.priceLevel !== "b") return i;
    const target: PriceLevel = level === "b" && (i.product.price_b ?? 0) > 0 ? "b" : "a";
    return i.priceLevel === target ? i : { ...i, priceLevel: target };
  });
}

/**
 * Niveles al cambiar a un método que NO es tarjeta (con tarjeta siempre es
 * Normal: la tienda absorbe la comisión). Solo el socio activo se re-precia;
 * sin socio activo las líneas se quedan como están, para no borrar un precio
 * Socio que el cajero puso a mano.
 */
export function repriceOnPaymentChange<L extends SocioLine>(
  items: L[],
  mesa: { socioEligible: boolean; isPreventa: boolean },
): L[] {
  if (!mesa.socioEligible) return items;
  return repriceForSocio(items, mesa.isPreventa ? "a" : "b");
}

export type SocioBadgeTone = "inactive" | "card" | "active";

/** Etiqueta bajo el nombre del cliente cuando es socio Tadaima. */
export function socioBadge(state: {
  eligible: boolean;
  isTarjeta: boolean;
  hasManualSocio: boolean;
}): { tone: SocioBadgeTone; label: string } {
  if (!state.eligible) {
    return {
      tone: "inactive",
      label: state.hasManualSocio ? "Socio inactivo · precio socio manual" : "Socio inactivo · precio normal",
    };
  }
  return state.isTarjeta
    ? { tone: "card", label: "Precio normal · tarjeta" }
    : { tone: "active", label: "Precio socio aplicado" };
}

/** Nota de la opción «Socio» del selector de nivel: avisa que es una decisión manual. */
export function socioOptionNote(level: PriceLevel, customer: { isSocio: boolean; eligible: boolean }): string {
  return level === "b" && customer.isSocio && !customer.eligible ? " · manual" : "";
}
