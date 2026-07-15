import type { DiscountReason } from "@/lib/saleCalc";

/**
 * Motivos del descuento por línea (Descuentos v2). El código viaja al backend
 * (sale_items.discount_reason) y la etiqueta se muestra en badge/ticket.
 */
export const DISCOUNT_REASON_LABELS: Record<DiscountReason, string> = {
  danado: "Dañado",
  caducidad: "Caducidad próxima",
  exhibicion: "Exhibición",
  cortesia: "Cortesía",
  otro: "Otro",
};

export const DISCOUNT_REASONS = Object.keys(DISCOUNT_REASON_LABELS) as DiscountReason[];
