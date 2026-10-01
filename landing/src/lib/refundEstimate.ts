/**
 * Estimado del reembolso al cancelar (2026-09-29) — espejo EXACTO de
 * SaleCancellationService::cancelSale. Se devuelve lo que la venta deja de
 * cobrar: total antes − total después, con descuento/aumento/promo de cada
 * línea prorrateados por cantidad. Ventas legacy (descuento global sin montos
 * por línea) prorratean el descuento de la venta por bruto.
 */
import { isLegacyGlobalDiscountSale } from "@/lib/saleItemNet";

export interface RefundItem {
  id: number;
  quantity: number;
  price: number;
  total: number;
  discount_amount?: number | null;
  surcharge_amount?: number | null;
}

export interface RefundSale {
  subtotal?: number | null;
  discount?: number | null;
  surcharge?: number | null;
  total: number;
  items: readonly RefundItem[];
}

export interface RefundEstimate {
  /** Total a devolver. */
  total: number;
  /** Devolución por renglón (id → monto), en el orden cancelado. */
  perLine: Record<number, number>;
}

const EPS = 0.005;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * @param toCancel id del renglón → piezas a cancelar. Vacío = cancelación total.
 */
export function estimateSaleRefund(sale: RefundSale, toCancel: Readonly<Record<number, number>> = {}): RefundEstimate {
  const entries = Object.keys(toCancel).length === 0
    ? sale.items.map(i => [i.id, i.quantity] as const)
    : sale.items.filter(i => (toCancel[i.id] ?? 0) > 0).map(i => [i.id, toCancel[i.id]!] as const);

  const legacy = isLegacyGlobalDiscountSale(sale);
  let runSubtotal = round2(sale.items.reduce((s, i) => s + Number(i.total || 0), 0));
  let runDiscount = round2(Number(sale.discount || 0));
  let runSurcharge = round2(Number(sale.surcharge || 0));
  const remaining = new Map(sale.items.map(i => [i.id, { ...i }]));
  const perLine: Record<number, number> = {};

  for (const [id, qtyRaw] of entries) {
    const item = remaining.get(id);
    if (!item) continue;
    const qty = Math.min(qtyRaw, item.quantity);
    if (qty <= 0) continue;

    const whole = qty >= item.quantity - 0.0001;
    const ratio = qty / item.quantity;
    const gross = whole ? round2(item.total) : round2(qty * item.price);
    let discount = whole ? round2(Number(item.discount_amount || 0)) : round2(Number(item.discount_amount || 0) * ratio);
    let surcharge = whole ? round2(Number(item.surcharge_amount || 0)) : round2(Number(item.surcharge_amount || 0) * ratio);
    if (legacy) {
      surcharge = 0;
      discount = runSubtotal <= EPS ? 0
        : gross >= runSubtotal - EPS ? runDiscount
        : round2(runDiscount * gross / runSubtotal);
    }
    perLine[id] = round2(gross - discount + surcharge);

    if (whole) {
      remaining.delete(id);
    } else {
      remaining.set(id, {
        ...item,
        quantity: item.quantity - qty,
        total: round2(item.total - gross),
        discount_amount: legacy ? item.discount_amount ?? 0 : round2(Number(item.discount_amount || 0) - discount),
        surcharge_amount: legacy ? item.surcharge_amount ?? 0 : round2(Number(item.surcharge_amount || 0) - surcharge),
      });
    }
    runSubtotal = round2(runSubtotal - gross);
    runDiscount = round2(runDiscount - discount);
    runSurcharge = round2(runSurcharge - surcharge);
  }

  const totalAfter = remaining.size === 0
    ? 0
    : round2(Math.max(0, runSubtotal - Math.max(0, runDiscount) + Math.max(0, runSurcharge)));
  return { total: round2(Math.max(0, Number(sale.total || 0) - totalAfter)), perLine };
}

export interface RefundSplit {
  /** Sale del cajón (salida de caja en la sesión de quien cancela). */
  cash: number;
  /** Se devuelve por la terminal (tarjeta) o el banco (transferencia). */
  other: number;
}

interface RefundPayment {
  amount: number;
  payment_method?: { name?: string | null } | null;
}

/**
 * Parte el reembolso igual que SaleCancellationService (cashRatio): del cajón
 * sale solo la proporción cobrada en efectivo/dólares. Sin pagos registrados o
 * sin método (legacy) cuenta como efectivo, igual que el backend.
 */
export function splitRefundByCash(amount: number, payments: readonly RefundPayment[]): RefundSplit {
  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  if (payments.length === 0 || total <= 0) return { cash: round2(amount), other: 0 };

  const isCashLike = (p: RefundPayment): boolean => {
    if (!p.payment_method) return true;
    const name = (p.payment_method.name ?? "").toLowerCase();
    return name.includes("efectivo") || name.includes("dolar") || name.includes("dólar");
  };
  const cashPaid = payments.filter(isCashLike).reduce((s, p) => s + Number(p.amount || 0), 0);
  const cash = round2(amount * (cashPaid / total));

  return { cash, other: round2(amount - cash) };
}
