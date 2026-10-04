// Tablas "de auditoría" del Excel de Ventas: Egresos y, por método, descuentos/
// ofertas y aumentos por ticket. Mismo molde que la app:
// Producto · Motivo (combinada) · Ticket · Cobró · Fecha · Monto.
import type { SupplyMovementRecord, Store as StoreType } from "@tadaima/api";
import { DISCOUNT_REASON_SHORT, SURCHARGE_REASON_SHORT } from "@/lib/discountReasons";
import type { AdjustmentEntry, BenefitBucket, GroupedProduct } from "./reportTypes";
import { fmtDate } from "./reportFormat";
import {
  EGRESO, MONEY_FMT, RED, align, fill, font, rowRange, sectionHeader, sumFormula, totalLabel, totalMoney,
  type CellStyle, type SheetBuilder,
} from "./excelSheet";

const SUPPLY_SOURCE_LABEL: Record<string, string> = { caja: "Caja", caja_chica: "Caja chica", propio: "Dinero propio" };

const DISC_BG = "B8860B";
const DISC_SUB_BG = "D4A82A";
const SUR_BG = "CC7722";
const SUR_SUB_BG = "DD9944";
const EMPTY_STYLE: CellStyle = { font: font({ italic: true, color: "999999" }), alignment: align("left") };
const cellLeft: CellStyle = { alignment: align("left", "top", true) };

/** Columnas físicas de una tabla de abajo. Motivo/Descripción absorbe el ancho sobrante. */
export interface BottomLayout {
  ins: number;
  desc: number;
  descEnd: number;
  orig: number;
  reg: number;
  tienda: number;
  monto: number;
}

const MIN_BOTTOM_WIDTH = 6;

export function bottomLayout(c1: number, width: number): BottomLayout {
  const w = Math.max(width, MIN_BOTTOM_WIDTH);
  return { ins: c1, desc: c1 + 1, descEnd: c1 + w - 5, orig: c1 + w - 4, reg: c1 + w - 3, tienda: c1 + w - 2, monto: c1 + w - 1 };
}

type Headers = readonly [string, string, string, string, string, string];

function header(sh: SheetBuilder, r: number, L: BottomLayout, title: string, headers: Headers, bg: string, subBg: string): void {
  sectionHeader(sh, r, L.ins, L.monto, title, bg);
  const sub: CellStyle = { font: font({ bold: true, color: "FFFFFF" }), fill: fill(subBg), alignment: align("center", "middle", true) };
  const [a, b, c, d, e, f] = headers;
  sh.merge(r + 1, L.desc, L.descEnd);
  sh.set(r + 1, L.ins, a, sub);
  sh.set(r + 1, L.desc, b, sub);
  sh.set(r + 1, L.orig, c, sub);
  sh.set(r + 1, L.reg, d, sub);
  sh.set(r + 1, L.tienda, e, sub);
  sh.set(r + 1, L.monto, f, sub);
  sh.height(r + 1, 20);
}

/** TOTAL = SUM de la columna Monto desde `firstRow` hasta la fila anterior. */
function total(sh: SheetBuilder, r: number, L: BottomLayout, firstRow: number, label: string, value: number, color: string): void {
  sh.merge(r, L.desc, L.descEnd);
  for (const c of [L.ins, L.desc, L.orig, L.reg, L.tienda]) sh.set(r, c, c === L.ins ? label : "", totalLabel);
  sh.setF(r, L.monto, sumFormula(L.monto, rowRange(firstRow, r - 1)), value, totalMoney(color));
  sh.height(r, 20);
}

function row(sh: SheetBuilder, r: number, L: BottomLayout, cells: readonly [string, string, string, string, string], amount: number, color: string): void {
  sh.merge(r, L.desc, L.descEnd);
  sh.set(r, L.ins, cells[0], cellLeft);
  sh.set(r, L.desc, cells[1], cellLeft);
  sh.set(r, L.orig, cells[2], cellLeft);
  sh.set(r, L.reg, cells[3], cellLeft);
  sh.set(r, L.tienda, cells[4], cellLeft);
  sh.set(r, L.monto, amount, { numFmt: MONEY_FMT, font: font({ bold: true, color }), alignment: align("right", "top") });
  sh.height(r, 18);
}

/** Devuelve la última fila escrita. */
export function drawEgresos(
  sh: SheetBuilder, startRow: number, L: BottomLayout, supplyMovements: readonly SupplyMovementRecord[],
  stores: readonly StoreType[], num: number,
): number {
  header(sh, startRow, L, ` ${num}. EGRESOS — INSUMOS DE OPERACIÓN`, ["Insumo", "Descripción", "Origen", "Registró", "Tienda", "Monto"], SUR_BG, SUR_SUB_BG);
  const r0 = startRow + 2;
  if (supplyMovements.length === 0) {
    sh.set(r0, L.ins, "Sin egresos de insumos en el periodo", EMPTY_STYLE);
    return r0;
  }
  let sum = 0;
  supplyMovements.forEach((m, i) => {
    const origen = SUPPLY_SOURCE_LABEL[m.money_source ?? "caja"] ?? (m.money_source ?? "—");
    const storeId = m.supply?.store_id;
    sum += m.amount || 0;
    row(sh, r0 + i, L, [
      m.supply?.name ?? "Insumo",
      m.note ?? "",
      m.money_source === "propio" && m.payer_name ? `${origen} · ${m.payer_name}` : origen,
      m.user?.name ?? "—",
      storeId ? (stores.find((s) => s.id === storeId)?.name ?? `Tienda ${storeId}`) : "Toda la empresa",
    ], m.amount || 0, EGRESO);
  });
  const totalRow = r0 + supplyMovements.length;
  total(sh, totalRow, L, r0, "TOTAL EGRESOS", sum, EGRESO);
  return totalRow;
}

export type ProductEntry = AdjustmentEntry & { product: string };

interface AdjustmentTable {
  title: string;
  amountHeader: string;
  totalText: string;
  bg: string;
  subBg: string;
  color: string;
  entries: ProductEntry[];
  reasonText: (e: AdjustmentEntry) => string;
}

/** Auditoría por ticket. Devuelve la última fila escrita. */
function drawAdjustments(sh: SheetBuilder, startRow: number, L: BottomLayout, t: AdjustmentTable): number {
  header(sh, startRow, L, t.title, ["Producto", "Motivo / nota", "Ticket", "Cobró", "Fecha", t.amountHeader], t.bg, t.subBg);
  const r0 = startRow + 2;
  if (t.entries.length === 0) {
    sh.set(r0, L.ins, "Sin movimientos en el periodo", EMPTY_STYLE);
    return r0;
  }
  const sorted = [...t.entries].sort((a, b) => a.date.localeCompare(b.date));
  let sum = 0;
  sorted.forEach((e, i) => {
    sum += e.amount;
    row(sh, r0 + i, L, [
      `${e.product} ×${e.quantity}`,
      `${t.reasonText(e)}${e.note ? ` · ${e.note}` : ""}`,
      `#${e.sale_id}`,
      e.cashier,
      e.date ? fmtDate(e.date) : "—",
    ], e.amount, t.color);
  });
  const totalRow = r0 + sorted.length;
  total(sh, totalRow, L, r0, t.totalText, sum, t.color);
  return totalRow;
}

export const entriesFor = (
  groups: readonly GroupedProduct[], pick: (g: GroupedProduct) => readonly AdjustmentEntry[] | undefined, bucket: BenefitBucket,
): ProductEntry[] =>
  groups.flatMap((g) => (pick(g) ?? []).filter((e) => e.bucket === bucket).map((e) => ({ ...e, product: g.name })));

/** Bajo la tabla del método `num`: `num.1` descuentos/ofertas y `num.2` aumentos. Devuelve la última fila. */
export function drawMethodAdjustments(
  sh: SheetBuilder, startRow: number, L: BottomLayout, groups: readonly GroupedProduct[],
  bucket: BenefitBucket, label: string, num: number,
): number {
  const discEnd = drawAdjustments(sh, startRow, L, {
    title: ` ${num}.1 ${label} — DESCUENTOS Y OFERTAS`,
    amountHeader: "Descuento",
    totalText: `TOTAL DESCUENTOS ${label}`,
    bg: DISC_BG,
    subBg: DISC_SUB_BG,
    color: RED,
    entries: entriesFor(groups, (g) => g.discount_entries, bucket),
    reasonText: (e) => (e.kind === "promo" ? `🎁 Promo: ${e.reason}` : `🏷️ ${DISCOUNT_REASON_SHORT[e.reason] ?? e.reason}`),
  });
  return drawAdjustments(sh, discEnd + 3, L, {
    title: ` ${num}.2 ${label} — AUMENTOS DE PRECIO`,
    amountHeader: "Aumento",
    totalText: `TOTAL AUMENTOS ${label}`,
    bg: SUR_BG,
    subBg: SUR_SUB_BG,
    color: SUR_BG,
    entries: entriesFor(groups, (g) => g.surcharge_entries, bucket),
    reasonText: (e) => `📈 ${SURCHARGE_REASON_SHORT[e.reason] ?? e.reason}`,
  });
}
