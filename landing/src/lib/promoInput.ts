import type { ProductPromotionInput, Promotion } from "@tadaima/api";
import { BUSINESS_TZ } from "@/lib/date";

/**
 * Helpers compartidos por el PromoForm, la gestión de PromosPage y el tab de
 * promos del editor de producto (viven aquí y no en PromoForm.tsx por la regla
 * react-refresh/only-export-components).
 */

/** Fecha ISO (UTC) → día en la ZONA DEL NEGOCIO (Tijuana). Slicear el ISO
 *  mostraría el día UTC (ej. vence 20 · 23:59 Tijuana = 21 · 06:59Z → "21"). */
export const toDateInput = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: BUSINESS_TZ }) : "";

/**
 * Convierte una promo existente en el body COMPLETO que exige el PUT
 * (pausar/reanudar reenvía la promo entera para no reconfigurar nada).
 * También sirve para clonarla ("Personalizar para mi tienda").
 */
export function promoToInput(promo: Promotion): ProductPromotionInput {
  return {
    name: promo.name,
    // Mandar los campos de SU tipo (el backend prohíbe los del otro).
    ...(promo.type === "qty_discount"
      ? {
          type: "qty_discount" as const,
          ...(promo.min_qty != null ? { min_qty: promo.min_qty } : {}),
          ...(promo.discount_per_unit != null ? { discount_per_unit: promo.discount_per_unit } : {}),
        }
      : { type: "nxm" as const, buy_n: promo.buy_n ?? 2, pay_m: promo.pay_m ?? 1 }),
    allow_cash: promo.allow_cash !== false,
    allow_card: promo.allow_card !== false,
    starts_at: promo.starts_at ?? null,
    ends_at: promo.ends_at ?? null,
    priority: promo.priority,
    store_id: promo.store_id ?? null,
  };
}
