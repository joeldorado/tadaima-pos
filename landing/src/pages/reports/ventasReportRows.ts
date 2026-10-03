// De los datos del reporte (GroupedProduct) a los renglones del Excel y el PDF
// de ventas, con el formato que pidió el equipo (2026-10-03):
//  - tres bloques por método: efectivo, tarjeta y transferencias/depósitos;
//  - productos por más vendidos (sin categorías) y los tomos al final, para
//    sacar el subtotal "Manga Nacional" de cada bloque;
//  - detalle por ticket de promos/descuentos y de aumentos, por método.
// Puro: Excel (excelVentasModel) y PDF (exportPdf) solo pintan estos renglones.
import { DISCOUNT_REASON_LABELS, SURCHARGE_REASON_LABELS } from "@/lib/discountReasons";
import { fmtDate } from "./reportFormat";
import { PAY_BUCKETS, payBucketOf, type PayBucket } from "./paymentBucket";
import type { GroupedProduct, TicketAdjustment } from "./reportTypes";

/** Un producto dentro del bloque de un método de pago. */
export interface MethodRow {
  name: string;
  /** Tomo (manga nacional): va al final del bloque y entra al subtotal. */
  isManga: boolean;
  qty: number;
  /** Venta del método (en tarjeta, el bruto). */
  revenue: number;
  /** Costo por PIEZAS: costo unitario × piezas vendidas con este método. */
  cost: number;
  /** Comisión de la terminal (solo tarjeta). */
  commission: number;
}

/** Un renglón del detalle por ticket (x.1 Descuentos y ofertas / x.2 Aumentos). */
export interface AdjustmentRow {
  kind: TicketAdjustment["kind"];
  /** "Producto ×cantidad". */
  product: string;
  /** Motivo y nota, o "Promo: nombre" (sin emoji: el PDF no los pinta). */
  label: string;
  /** "#123", o "#123 (mixto)" si el ticket se pagó con más de un método. */
  ticket: string;
  cashier: string;
  date: string;
  amount: number;
}

export interface ReturnRow {
  name: string;
  qty: number;
  amount: number;
}

export interface VentasReportRows {
  blocks: Record<PayBucket, MethodRow[]>;
  discounts: Record<PayBucket, AdjustmentRow[]>;
  surcharges: Record<PayBucket, AdjustmentRow[]>;
  returns: ReturnRow[];
}

interface TaggedRow {
  saleId: number;
  row: AdjustmentRow;
}

const EPSILON = 0.005;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000;
const money2 = (n: number): string =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(n);

/** Nombre del renglón; lleva el costo cuando el producto se vendió con costos distintos. */
const rowName = (p: GroupedProduct): string =>
  p.show_cost_tag ? `${p.name} · Costo ${money2(p.cost_tag ?? 0)}` : p.name;

/**
 * Tomo vendido (manga nacional). Una preventa de manga NO cuenta: su renglón
 * es solo el anticipo y ya tiene su propio bloque (4. Apartados y preventas).
 */
const isTomo = (p: GroupedProduct): boolean => p.product_type === "manga" && p.pre_sale_apartado === undefined;

/**
 * Orden del Excel/PDF: no-tomos primero y tomos al final; dentro de cada grupo,
 * más vendidos primero (cantidad total del producto en todos los métodos), con
 * las variantes de costo de un mismo producto juntas. No mira la categoría.
 */
export function sortBySalesRank(products: readonly GroupedProduct[]): GroupedProduct[] {
  const baseOf = (p: GroupedProduct) => p.base_product_id ?? p.id;
  const qtyByBase = new Map<number | string, number>();
  for (const p of products) {
    qtyByBase.set(baseOf(p), (qtyByBase.get(baseOf(p)) ?? 0) + (p.total_quantity || 0));
  }
  return [...products].sort((a, b) => {
    const aManga = isTomo(a), bManga = isTomo(b);
    if (aManga !== bManga) return aManga ? 1 : -1;
    const ba = baseOf(a), bb = baseOf(b);
    const qa = qtyByBase.get(ba) ?? 0, qb = qtyByBase.get(bb) ?? 0;
    if (qb !== qa) return qb - qa;
    if (ba !== bb) return String(ba) < String(bb) ? -1 : 1;
    return (a.cost_tag ?? 0) - (b.cost_tag ?? 0);
  });
}

function methodRow(p: GroupedProduct, bucket: PayBucket): MethodRow | null {
  let qty = 0, revenue = 0;
  for (const [method, data] of Object.entries(p.payment_breakdown)) {
    if (payBucketOf(method) !== bucket) continue;
    qty += data.qty;
    revenue += data.revenue;
  }
  const commission = bucket === "card" ? round4(p.commission_amount || 0) : 0;
  // Sin movimiento con este método (o una devolución legacy que neteó a cero).
  // La comisión de una venta devuelta sí se conserva: la terminal ya la cobró.
  if (Math.abs(qty) < EPSILON && Math.abs(revenue) < EPSILON && Math.abs(commission) < EPSILON) return null;
  const unitCost = (p.total_quantity || 0) > 0 ? (p.total_cost || 0) / p.total_quantity : 0;
  return {
    name: rowName(p),
    isManga: isTomo(p),
    qty: round2(qty),
    revenue: round2(revenue),
    cost: round2(unitCost * qty),
    commission,
  };
}

function adjustmentLabel(e: TicketAdjustment): string {
  if (e.kind === "promo") return `Promo: ${e.reason}`;
  const labels: Record<string, string> = e.kind === "surcharge" ? SURCHARGE_REASON_LABELS : DISCOUNT_REASON_LABELS;
  return `${labels[e.reason] ?? e.reason}${e.note ? ` · ${e.note}` : ""}`;
}

/** Renglones del reporte de ventas (bloques por método, detalle por ticket y devoluciones). */
export function buildVentasReportRows(products: readonly GroupedProduct[]): VentasReportRows {
  const sorted = sortBySalesRank(products);
  const empty = <T>(): Record<PayBucket, T[]> => ({ cash: [], card: [], transfer: [] });
  const blocks = empty<MethodRow>();
  // Con el ticket aparte para ordenar: los productos llegan por más vendidos, no por ticket.
  const tagged = { discounts: empty<TaggedRow>(), surcharges: empty<TaggedRow>() };

  for (const p of sorted) {
    for (const bucket of PAY_BUCKETS) {
      const row = methodRow(p, bucket);
      if (row) blocks[bucket].push(row);
    }
    for (const e of p.adjustment_entries ?? []) {
      const isMixed = PAY_BUCKETS.filter(b => e.shares[b] > EPSILON).length > 1;
      for (const bucket of PAY_BUCKETS) {
        const amount = round2(e.amount * e.shares[bucket]);
        if (amount < EPSILON) continue;
        (e.kind === "surcharge" ? tagged.surcharges : tagged.discounts)[bucket].push({
          saleId: e.sale_id,
          row: {
            kind: e.kind,
            product: `${p.name} ×${e.quantity}`,
            label: adjustmentLabel(e),
            ticket: `#${e.sale_id}${isMixed ? " (mixto)" : ""}`,
            cashier: e.cashier,
            date: e.date ? fmtDate(e.date) : "—",
            amount,
          },
        });
      }
    }
  }

  const bySale = (rows: TaggedRow[]): AdjustmentRow[] =>
    [...rows].sort((a, b) => a.saleId - b.saleId).map(t => t.row);
  const byBucket = (group: Record<PayBucket, TaggedRow[]>): Record<PayBucket, AdjustmentRow[]> =>
    ({ cash: bySale(group.cash), card: bySale(group.card), transfer: bySale(group.transfer) });

  return {
    blocks,
    discounts: byBucket(tagged.discounts),
    surcharges: byBucket(tagged.surcharges),
    returns: sorted
      .filter(p => (p.returned_revenue ?? 0) > 0 || (p.returned_quantity ?? 0) > 0)
      .map(p => ({ name: rowName(p), qty: p.returned_quantity || 0, amount: round2(p.returned_revenue || 0) })),
  };
}

/** Totales de un bloque (el PDF los imprime; el Excel los guarda como valor de sus SUM). */
export function sumMethodRows(rows: readonly MethodRow[]): { qty: number; revenue: number; cost: number; commission: number } {
  return rows.reduce((t, r) => ({
    qty: round2(t.qty + r.qty),
    revenue: round2(t.revenue + r.revenue),
    cost: round2(t.cost + r.cost),
    commission: round4(t.commission + r.commission),
  }), { qty: 0, revenue: 0, cost: 0, commission: 0 });
}
