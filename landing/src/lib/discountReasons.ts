import type { DiscountReason, SurchargeReason } from "@/lib/saleCalc";

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

/**
 * Motivos del AUMENTO de precio por línea (Joel 2026-09-29). Viajan a
 * sale_items.surcharge_reason; espejo de SaleCalculator::SURCHARGE_REASONS.
 */
export const SURCHARGE_REASON_LABELS: Record<SurchargeReason, string> = {
  precio_especial: "Precio especial",
  escasez: "Escasez / reventa",
  envio: "Envío / entrega",
  otro: "Otro",
};

export const SURCHARGE_REASONS = Object.keys(SURCHARGE_REASON_LABELS) as SurchargeReason[];

/** Etiquetas cortas en minúscula para reportes (Excel/PDF). */
export const DISCOUNT_REASON_SHORT: Record<string, string> = {
  danado: "dañado", caducidad: "caducidad", exhibicion: "exhibición", cortesia: "cortesía", otro: "otro",
};

export const SURCHARGE_REASON_SHORT: Record<string, string> = {
  precio_especial: "precio especial", escasez: "escasez", envio: "envío", otro: "otro",
};
