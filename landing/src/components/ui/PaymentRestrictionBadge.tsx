import { Banknote, CreditCard } from "lucide-react";

export type PayRestriction = "cash_only" | "card_only" | null;

/**
 * Restricción de método de pago de un producto:
 *  - "cash_only" → solo efectivo/transferencia (no tarjeta)
 *  - "card_only" → solo tarjeta (no efectivo)
 *  - null        → acepta ambos
 *
 * `payment_restriction === "cash_only"` ya viene resuelto del mapeo de Caja,
 * pero también derivamos de los flags allow_cash/allow_card por robustez.
 */
export function getPayRestriction(p: {
  payment_restriction?: string;
  allow_cash?: boolean;
  allow_card?: boolean;
}): PayRestriction {
  if (p.payment_restriction === "cash_only") return "cash_only";
  if (p.allow_card === false && p.allow_cash !== false) return "cash_only";
  if (p.allow_cash === false && p.allow_card !== false) return "card_only";
  return null;
}

const STYLES = {
  sm: { pad: "2px 8px", font: 9, icon: 11, gap: 4, radius: 7 },
  md: { pad: "4px 11px", font: 11, icon: 14, gap: 6, radius: 9 },
} as const;

/**
 * Pill que denota la restricción de pago de un artículo. Ámbar para "Solo
 * Efectivo", azul para "Solo Tarjeta". `size="md"` para el catálogo de Caja
 * (notorio), `size="sm"` para el carrito.
 */
export function PaymentRestrictionBadge({
  restriction,
  size = "sm",
}: {
  restriction: PayRestriction;
  size?: "sm" | "md";
}) {
  if (!restriction) return null;

  const isCash = restriction === "cash_only";
  const d = STYLES[size];
  // Ámbar = efectivo, Azul = tarjeta (misma identidad cromática del POS).
  const rgb = isCash ? "245,158,11" : "96,165,250";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: d.gap,
        padding: d.pad,
        borderRadius: d.radius,
        fontSize: d.font,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        whiteSpace: "nowrap",
        color: `rgb(${rgb})`,
        background: `rgba(${rgb},0.12)`,
        border: `1px solid rgba(${rgb},0.32)`,
      }}
    >
      {isCash ? <Banknote size={d.icon} /> : <CreditCard size={d.icon} />}
      {isCash ? "Solo Efectivo" : "Solo Tarjeta"}
    </span>
  );
}
