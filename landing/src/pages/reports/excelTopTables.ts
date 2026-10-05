// Tablas por producto del Excel de Ventas (Efectivo, Tarjeta, Transferencias,
// cada una normal o solo Manga) · Preventas · Devoluciones. TOTAL, IVA, neto y
// utilidad van como FÓRMULAS de Excel (con el valor ya calculado).
import type { GroupedProduct, PresaleRow } from "./reportTypes";
import { fmt } from "./reportFormat";
import {
  AMBER, GRAY, GREEN, MONEY_FMT, RED, align, cellMoney, sectionHeader, subHeader, cellName, cellQty, cellRef, fill, font, rowRange, sumFormula,
  totalLabel, totalMoney, totalQty, type CellStyle, type SheetBuilder,
} from "./excelSheet";

/** Fila del encabezado de las tablas en cada pestaña (abajo del título y periodo). */
export const FIRST_TABLE_ROW = 4;
const FIRST_DATA_ROW = FIRST_TABLE_ROW + 2;

const lc = (n: string) => n.toLowerCase();
export const isCardMethod = (n: string): boolean =>
  ["tarjeta", "credit", "debito", "débito", "tpv", "terminal"].some((k) => lc(n).includes(k));
export const isTransferMethod = (n: string): boolean =>
  ["transfer", "deposit", "spei"].some((k) => lc(n).includes(k));
/** Efectivo y dólares: lo que entra al cajón físico. */
export const isCashLike = (n: string): boolean =>
  ["efectivo", "cash", "dolar", "dólar", "usd"].some((k) => lc(n).includes(k));

// Manga Nacional = productos dados de alta como tomo (product_type 'manga').
const MANGA_BLUE = "1D4ED8";
const MANGA_FILL = fill("DBEAFE");
export const isManga = (g: GroupedProduct): boolean => g.product_type === "manga";
const cellNameManga: CellStyle = { font: font({ bold: true, color: MANGA_BLUE }), alignment: align("left", "middle", true) };

const displayName = (g: GroupedProduct) => (g.show_cost_tag ? `${g.name} · Costo ${fmt(g.cost_tag ?? 0)}` : g.name);

/** Piezas y venta del producto cobradas con los métodos que cumplen `pred`. */
function methodPart(g: GroupedProduct, pred: (name: string) => boolean): { qty: number; revenue: number } {
  let qty = 0;
  let revenue = 0;
  // Incluye los "(Devuelto)" negativos de devoluciones legacy: netean contra su venta.
  for (const [name, data] of Object.entries(g.payment_breakdown)) {
    if (!pred(name)) continue;
    qty += data.qty;
    revenue += data.revenue;
  }
  return { qty, revenue };
}

/** Costo por PIEZAS del método (costo unitario × piezas), no por ingresos. */
const costByPieces = (g: GroupedProduct, qty: number) => (g.total_quantity ? (g.total_cost / g.total_quantity) * qty : 0);

/** Columna numérica de una tabla por producto. `formula` = fórmula del renglón (si no, valor). */
interface ColumnSpec {
  key: string;
  header: string;
  qty?: boolean;
  color: string;
  bold?: boolean;
  /** Valor ya calculado del renglón (también es el `cached` de la fórmula). */
  value: (g: GroupedProduct) => number;
  formula?: (r: number, ref: (key: string, r: number) => string) => string;
}

interface ProductTable {
  col: number;
  totalText: string;
  columns: ColumnSpec[];
  /** Columna cuya celda azul de Manga suma al cuadro del resumen. */
  mangaKey: string;
}

/** Celda con el subtotal de manga de una tabla (para el cuadro del resumen). */
export interface MangaSubtotal {
  ref: string;
  value: number;
}

export interface TableResult {
  /** Siguiente fila libre. */
  next: number;
  manga: MangaSubtotal | null;
  /** Celda del TOTAL de cada columna (por `key`) y su valor; vacío si la tabla no tiene renglones. */
  totals: Record<string, MangaSubtotal>;
}

export const tableWidth = (t: Pick<ProductTable, "columns">): number => t.columns.length + 1;

export function drawTableHeaders(sh: SheetBuilder, t: ProductTable, subBg: string, nameHeader = "Producto"): void {
  const style: CellStyle = { font: font({ bold: true, color: "FFFFFF" }), fill: fill(subBg), alignment: align("center", "middle", true) };
  const r = FIRST_TABLE_ROW + 1;
  sh.set(r, t.col, nameHeader, style);
  t.columns.forEach((c, i) => sh.set(r, t.col + 1 + i, c.header, style));
  sh.height(r, 20);
}

/** Renglón de resumen (TOTAL / Manga): SUM de cada columna sobre `rows`. */
function sumRow(
  sh: SheetBuilder, r: number, t: ProductTable, label: string, rows: readonly number[], groups: readonly GroupedProduct[],
  styles: { label: CellStyle; qty: CellStyle; money: (color: string) => CellStyle },
): void {
  sh.set(r, t.col, label, styles.label);
  t.columns.forEach((c, i) => {
    const value = groups.reduce((a, g) => a + c.value(g), 0);
    const cached = c.qty ? Number(value.toFixed(1)) : value;
    const style = c.qty ? styles.qty : styles.money(c.color);
    if (rows.length > 0) sh.setF(r, t.col + 1 + i, sumFormula(t.col + 1 + i, rows), cached, style);
    else sh.set(r, t.col + 1 + i, 0, style);
  });
  sh.height(r, 20);
}

const totalStyles = { label: totalLabel, qty: totalQty, money: totalMoney };
const mangaStyles = {
  label: { font: font({ bold: true, color: MANGA_BLUE }), fill: MANGA_FILL, alignment: align("left") } as CellStyle,
  qty: { font: font({ bold: true, color: MANGA_BLUE }), fill: MANGA_FILL, alignment: align("center") } as CellStyle,
  money: (): CellStyle => ({ numFmt: MONEY_FMT, font: font({ bold: true, color: MANGA_BLUE }), fill: MANGA_FILL, alignment: align("right") }),
};

/**
 * Tabla por producto y TOTAL; con `mangaRow`, además el renglón azul "Manga
 * Nacional (incluido)". Los productos ya vienen ordenados por categoría A-Z,
 * sin encabezado ni subtotal por categoría: el orden queda implícito (Ruben
 * 2026-10-03). `groups` ya viene filtrado a los productos de la tabla.
 */
export function drawProductTable(sh: SheetBuilder, t: ProductTable, groups: readonly GroupedProduct[], mangaRow = true): TableResult {
  if (groups.length === 0) return { next: FIRST_DATA_ROW, manga: null, totals: {} };
  const colOf = (key: string) => t.col + 1 + t.columns.findIndex((c) => c.key === key);
  const ref = (key: string, r: number) => cellRef(r, colOf(key));

  let r = FIRST_DATA_ROW;
  const productRows: number[] = [];
  const mangaRows: number[] = [];
  for (const g of groups) {
    sh.set(r, t.col, displayName(g), isManga(g) ? cellNameManga : cellName);
    t.columns.forEach((c, ci) => {
      const v = c.value(g);
      const style = c.qty ? cellQty : cellMoney(c.color, c.bold);
      const cached = c.qty ? Number(v.toFixed(1)) : v;
      if (c.formula) sh.setF(r, t.col + 1 + ci, c.formula(r, ref), cached, style);
      else sh.set(r, t.col + 1 + ci, cached, style);
    });
    sh.height(r, 20);
    productRows.push(r);
    if (isManga(g)) mangaRows.push(r);
    r++;
  }

  sumRow(sh, r, t, t.totalText, productRows, groups, totalStyles);
  const totals = Object.fromEntries(t.columns.map((c) => [
    c.key, { ref: ref(c.key, r), value: groups.reduce((a, g) => a + c.value(g), 0) },
  ]));
  if (!mangaRow) return { next: r + 1, manga: null, totals };
  const mRow = r + 1;
  sumRow(sh, mRow, t, "📘 MANGA NACIONAL (incluido)", mangaRows, groups.filter(isManga), mangaStyles);
  const mangaCol = t.columns.find((c) => c.key === t.mangaKey)!;
  return {
    next: mRow + 1,
    manga: { ref: ref(t.mangaKey, mRow), value: groups.filter(isManga).reduce((a, g) => a + mangaCol.value(g), 0) },
    totals,
  };
}

/** Efectivo y Transferencias: Producto · Cant · [Costo] · Venta · [Utilidad]. */
export function methodTable(col: number, pred: (n: string) => boolean, label: string, totalText: string, canViewCost: boolean): ProductTable {
  const qty = (g: GroupedProduct) => methodPart(g, pred).qty;
  const revenue = (g: GroupedProduct) => methodPart(g, pred).revenue;
  const cost = (g: GroupedProduct) => costByPieces(g, qty(g));
  return {
    col,
    totalText,
    mangaKey: "venta",
    columns: [
      { key: "qty", header: `Cant. ${label}`, qty: true, color: GRAY, value: qty },
      ...(canViewCost ? [{ key: "costo", header: "Costo Producto", color: GRAY, value: cost }] : []),
      { key: "venta", header: `Venta ${label}`, color: GREEN, bold: true, value: revenue },
      ...(canViewCost ? [{
        key: "util", header: `Utilidad ${label}`, color: GREEN, bold: true,
        value: (g: GroupedProduct) => revenue(g) - cost(g),
        formula: (r: number, ref: (k: string, r: number) => string) => `${ref("venta", r)}-${ref("costo", r)}`,
      }] : []),
    ],
  };
}

/** Tarjeta: IVA = Comisión × tasa; Neto = Bruto − Comisión − IVA; Utilidad = Neto − Costo. */
export function cardTable(col: number, canViewCost: boolean, ivaRate: number, totalText = "TOTAL TARJETA"): ProductTable {
  const part = (g: GroupedProduct) => methodPart(g, isCardMethod);
  const comm = (g: GroupedProduct) => g.commission_amount || 0;
  const net = (g: GroupedProduct) => part(g).revenue - comm(g) * (1 + ivaRate);
  const cost = (g: GroupedProduct) => costByPieces(g, part(g).qty);
  return {
    col,
    totalText,
    mangaKey: "bruto",
    columns: [
      { key: "qty", header: "Cant. Tarjeta", qty: true, color: GRAY, value: (g) => part(g).qty },
      { key: "bruto", header: "Bruto Tarjeta", color: GRAY, value: (g) => part(g).revenue },
      ...(canViewCost ? [{ key: "costo", header: "Costo Producto", color: GRAY, value: cost }] : []),
      { key: "comm", header: "Comisión TPV", color: RED, value: comm },
      {
        key: "iva", header: `IVA (${Math.round(ivaRate * 100)}%)`, color: AMBER, value: (g) => comm(g) * ivaRate,
        formula: (r, ref) => `${ref("comm", r)}*${ivaRate}`,
      },
      {
        key: "neto", header: "Neto Tarjeta", color: GREEN, bold: true, value: net,
        formula: (r, ref) => `${ref("bruto", r)}-${ref("comm", r)}-${ref("iva", r)}`,
      },
      ...(canViewCost ? [{
        key: "util", header: "Utilidad Tarjeta", color: GREEN, bold: true,
        value: (g: GroupedProduct) => net(g) - cost(g),
        formula: (r: number, ref: (k: string, r: number) => string) => `${ref("neto", r)}-${ref("costo", r)}`,
      }] : []),
    ],
  };
}

/** Productos con movimiento en el método (preventas fuera: van en su propia tabla). */
export const withMethod = (groups: readonly GroupedProduct[], pred: (n: string) => boolean): GroupedProduct[] =>
  groups.filter((g) => {
    const { qty, revenue } = methodPart(g, pred);
    return qty !== 0 || revenue !== 0;
  });

export const PRESALE_COLS = (canViewCost: boolean): number => (canViewCost ? 7 : 5);

/**
 * Preventas (con su encabezado en la fila `top`): Producto · Cant · Abonado ·
 * Pendiente · Pactado(=Abonado+Pendiente) · [Costo · Utilidad(=Abonado−Costo)].
 */
export function drawPresales(sh: SheetBuilder, rows: readonly PresaleRow[], col: number, canViewCost: boolean, top = FIRST_TABLE_ROW): number {
  sectionHeader(sh, top, col, col + PRESALE_COLS(canViewCost) - 1, " 4. APARTADOS Y PREVENTAS", "AA66FF");
  subHeader(sh, top + 1, col, ["Producto", "Cant. Preventa", "Abonado", "Pendiente", "Pactado", ...(canViewCost ? ["Costo Producto", "Utilidad"] : [])], "CC88FF");
  const first = top + 2;
  let r = first;
  for (const p of rows) {
    sh.set(r, col, p.name, cellName);
    sh.set(r, col + 1, p.qty, cellQty);
    sh.set(r, col + 2, p.apartado, cellMoney(GREEN, true));
    sh.set(r, col + 3, p.deuda, cellMoney(RED, true));
    sh.setF(r, col + 4, `${cellRef(r, col + 2)}+${cellRef(r, col + 3)}`, p.pactado, cellMoney(GRAY));
    if (canViewCost) {
      sh.set(r, col + 5, p.costoNeto, cellMoney(GRAY));
      // Modelo del dueño: apartada → costo = abono (utilidad $0); liquidada → venta − costo.
      sh.setF(r, col + 6, `${cellRef(r, col + 2)}-${cellRef(r, col + 5)}`, p.utilidad, cellMoney(p.utilidad < 0 ? RED : GREEN, true));
    }
    sh.height(r, 20);
    r++;
  }
  if (rows.length === 0) return r;
  const all = rowRange(first, r - 1);
  const sum = (pick: (p: PresaleRow) => number) => rows.reduce((a, p) => a + pick(p), 0);
  const tUtil = sum((p) => p.utilidad);
  sh.set(r, col, "TOTAL PREVENTAS", totalLabel);
  sh.setF(r, col + 1, sumFormula(col + 1, all), sum((p) => p.qty), totalQty);
  sh.setF(r, col + 2, sumFormula(col + 2, all), sum((p) => p.apartado), totalMoney(GREEN));
  sh.setF(r, col + 3, sumFormula(col + 3, all), sum((p) => p.deuda), totalMoney(RED));
  sh.setF(r, col + 4, sumFormula(col + 4, all), sum((p) => p.pactado), totalMoney(GRAY));
  if (canViewCost) {
    sh.setF(r, col + 5, sumFormula(col + 5, all), sum((p) => p.costoNeto), totalMoney(GRAY));
    sh.setF(r, col + 6, sumFormula(col + 6, all), tUtil, totalMoney(tUtil < 0 ? RED : GREEN));
  }
  sh.height(r, 20);
  return r + 1;
}

export const RETURN_COLS = 3;

/** Devoluciones (con su encabezado en la fila `top`): Producto · Cant. Devuelta · Monto Devuelto. */
export function drawReturns(sh: SheetBuilder, groups: readonly GroupedProduct[], col: number, top = FIRST_TABLE_ROW): number {
  sectionHeader(sh, top, col, col + RETURN_COLS - 1, " 5. DEVOLUCIONES Y CANCELACIONES", "FF7755");
  subHeader(sh, top + 1, col, ["Producto", "Cant. Devuelta", "Monto Devuelto"], "FF8866");
  const returned = groups.filter((g) => (g.returned_quantity || 0) > 0 || (g.returned_revenue || 0) > 0);
  const first = top + 2;
  let r = first;
  for (const g of returned) {
    sh.set(r, col, displayName(g), cellName);
    sh.set(r, col + 1, g.returned_quantity || 0, { font: font({ bold: true, color: RED }), alignment: align("center") });
    sh.set(r, col + 2, g.returned_revenue || 0, cellMoney(RED, true));
    sh.height(r, 20);
    r++;
  }
  if (returned.length === 0) return r;
  const all = rowRange(first, r - 1);
  sh.set(r, col, "TOTAL DEVOLUCIONES", totalLabel);
  sh.setF(r, col + 1, sumFormula(col + 1, all), returned.reduce((a, g) => a + (g.returned_quantity || 0), 0), totalQty);
  sh.setF(r, col + 2, sumFormula(col + 2, all), returned.reduce((a, g) => a + (g.returned_revenue || 0), 0), totalMoney(RED));
  sh.height(r, 20);
  return r + 1;
}
