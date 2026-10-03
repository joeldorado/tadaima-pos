// Hoja "Ventas" del Excel con el formato que pidió el equipo (2026-10-03, muestra
// Tadaima_Reporte_2026-10-03.xlsx). La usan el reporte general y el del corte.
//
//  fila 5   resumen: Total Bruto (fórmula) · Efectivo · Tarjetas · Depósitos · 📘 Manga Nacional
//  fila 8   cinco bloques lado a lado: 1 Efectivo · 2 Tarjeta · 3 Transferencias ·
//           4 Preventas · 5 Devoluciones. Productos por más vendidos, tomos al final;
//           TOTAL con SUM y, debajo, "📘 MANGA NACIONAL (incluido)".
//  debajo   por cada método: x.1 Descuentos y ofertas y x.2 Aumentos, por ticket.
//  al final 6 Egresos.
//
// Los cálculos son fórmulas (utilidad, IVA, neto, totales) para que el equipo
// pueda capturar un costo en Excel y ver la utilidad recalculada.
import { SheetBuilder, type CellRef, type CellStyle, type CellValue, type FormulaSpec, type SheetModel } from "./excelSheetModel";
import type { PayBucket } from "./paymentBucket";
import type { PresaleRow, ReportPaymentBreakdown } from "./reportTypes";
import type { AdjustmentRow, MethodRow, VentasReportRows } from "./ventasReportRows";

export interface SupplyRow {
  name: string;
  note: string;
  origin: string;
  user: string;
  store: string;
  amount: number;
}

export interface VentasSheetInput {
  subtitle: string;
  rows: VentasReportRows;
  presaleRows: PresaleRow[];
  paymentBreakdown: Pick<ReportPaymentBreakdown, "cash" | "card" | "deposits">;
  supplies: SupplyRow[];
  canViewCost: boolean;
  ivaRate: number;
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const MONEY = '"$"#,##0.00';
const COLOR = {
  white: "FFFFFFFF", ink: "FF111111", gray: "FF444444", green: "FF009944", red: "FFFF2200",
  amber: "FFF59E0B", blue: "FF1D4ED8", orange: "FFCC7722", darkRed: "FFCC2200", muted: "FF999999",
};
const FILL = { total: "FFEDEDED", manga: "FFDBEAFE" };
const arial = (size: number, color: string, bold = false): NonNullable<CellStyle["font"]> =>
  bold ? { name: "Arial", size, bold: true, color } : { name: "Arial", size, color };

const titleStyle = (fill: string): CellStyle => ({ font: arial(10, COLOR.white, true), fill, align: { horizontal: "center", vertical: "middle" } });
const headStyle = (fill: string): CellStyle => ({ font: arial(9, COLOR.white, true), fill, align: { horizontal: "center", vertical: "middle", wrapText: true } });
const nameStyle = (isManga: boolean): CellStyle => ({
  ...(isManga ? { font: arial(9, COLOR.blue, true) } : {}),
  align: { horizontal: "left", vertical: "middle", wrapText: true },
});
const qtyStyle: CellStyle = { align: { horizontal: "center", vertical: "middle" } };
const moneyStyle = (color: string, bold: boolean): CellStyle => ({ numFmt: MONEY, font: arial(9, color, bold), align: { horizontal: "right", vertical: "middle" } });
const listText: CellStyle = { align: { horizontal: "left", vertical: "top", wrapText: true } };
const emptyNote: CellStyle = { font: { name: "Arial", size: 9, italic: true, color: COLOR.muted }, align: { horizontal: "left", vertical: "middle" } };

/** Fila de total / subtotal: mismo estilo de la celda, con relleno (y azul en Manga Nacional). */
const footLabel = (fill: string, color: string): CellStyle => ({ font: arial(9, color, true), fill, align: { horizontal: "left", vertical: "middle" } });
const footQty = (fill: string, color: string): CellStyle => ({ font: arial(9, color, true), fill, align: { horizontal: "center", vertical: "middle" } });
const footMoney = (fill: string, color: string): CellStyle => ({ numFmt: MONEY, font: arial(9, color, true), fill, align: { horizontal: "right", vertical: "middle" } });

// ── Bloques por método ───────────────────────────────────────────────────────
const FIRST_ROW = 8;
const DATA_ROW = FIRST_ROW + 2;
const MIN_SPAN = 8; // ancho mínimo de un bloque: lo que ocupa su detalle por ticket

interface NumCol {
  key: "cost" | "venta" | "util" | "comm" | "iva" | "net";
  header: string;
  color: string;
  bold: boolean;
  value: (row: MethodRow, at: (key: NumCol["key"]) => CellRef) => number | FormulaSpec;
}

interface MethodBlock {
  bucket: PayBucket;
  number: number;
  title: string;
  /** Nombre en los títulos de detalle y totales: EFECTIVO / TARJETA / TRANSFERENCIAS. */
  label: string;
  qtyHeader: string;
  titleFill: string;
  headFill: string;
  cols: NumCol[];
  /** Columna cuyo subtotal de tomos alimenta "Manga Nacional" del resumen. */
  mangaKey: NumCol["key"];
}

const sub = (...refs: CellRef[]): FormulaSpec => ({ op: "sub", refs });

function methodBlocks(canViewCost: boolean, ivaRate: number): MethodBlock[] {
  const cost: NumCol = { key: "cost", header: "Costo Producto", color: COLOR.gray, bold: false, value: r => r.cost };
  const visible = (cols: NumCol[]) => cols.filter(c => canViewCost || (c.key !== "cost" && c.key !== "util"));
  const simple = (name: string): NumCol[] => visible([
    cost,
    { key: "venta", header: `Venta ${name}`, color: COLOR.green, bold: true, value: r => r.revenue },
    { key: "util", header: `Utilidad ${name}`, color: COLOR.green, bold: true, value: (_r, at) => sub(at("venta"), at("cost")) },
  ]);
  return [
    { bucket: "cash", number: 1, title: "VENTAS EN EFECTIVO", label: "EFECTIVO", qtyHeader: "Cant. Efectivo", titleFill: "FF33BB66", headFill: "FF55CC77", cols: simple("Efectivo"), mangaKey: "venta" },
    {
      bucket: "card", number: 2, title: "DESGLOSE DE COBROS CON TARJETA", label: "TARJETA", qtyHeader: "Cant. Tarjeta", titleFill: "FF2266BB", headFill: "FF4488DD", mangaKey: "venta",
      cols: visible([
        { key: "venta", header: "Bruto Tarjeta", color: COLOR.gray, bold: false, value: r => r.revenue },
        cost,
        { key: "comm", header: "Comisión TPV", color: COLOR.red, bold: false, value: r => r.commission },
        { key: "iva", header: `IVA (${Math.round(ivaRate * 100)}%)`, color: COLOR.amber, bold: false, value: (_r, at) => ({ op: "mulConst", ref: at("comm"), k: ivaRate }) },
        { key: "net", header: "Neto Tarjeta", color: COLOR.green, bold: true, value: (_r, at) => sub(at("venta"), at("comm"), at("iva")) },
        { key: "util", header: "Utilidad Tarjeta", color: COLOR.green, bold: true, value: (_r, at) => sub(at("net"), at("cost")) },
      ]),
    },
    { bucket: "transfer", number: 3, title: "TRANSFERENCIAS / DEPÓSITOS", label: "TRANSFERENCIAS", qtyHeader: "Cant. Transferencia", titleFill: "FF119999", headFill: "FF33BBBB", cols: simple("Transferencia"), mangaKey: "venta" },
  ];
}

const tableCols = (block: MethodBlock): number => 2 + block.cols.length;
const blockSpan = (block: MethodBlock): number => Math.max(tableCols(block) + 3, MIN_SPAN);

/** Título combinado + encabezados de columna de un bloque. */
function blockHeader(b: SheetBuilder, start: number, cols: number, title: string, titleFill: string, headers: string[], headFill: string): void {
  b.set(FIRST_ROW, start, title, titleStyle(titleFill));
  b.merge(FIRST_ROW, start, FIRST_ROW, start + cols - 1);
  b.rowHeight(FIRST_ROW, 25);
  headers.forEach((h, i) => b.set(FIRST_ROW + 1, start + i, h, headStyle(headFill)));
  b.rowHeight(FIRST_ROW + 1, 20);
}

/** Pinta el bloque de un método; devuelve su última fila y la celda del subtotal de tomos. */
function renderMethodBlock(b: SheetBuilder, block: MethodBlock, start: number, rows: readonly MethodRow[]): { endRow: number; mangaRef: CellRef | null } {
  const qtyCol = start + 1;
  const colOf = (key: NumCol["key"]): number => start + 2 + block.cols.findIndex(c => c.key === key);
  blockHeader(b, start, tableCols(block), ` ${block.number}. ${block.title}`, block.titleFill, ["Producto", block.qtyHeader, ...block.cols.map(c => c.header)], block.headFill);

  rows.forEach((row, i) => {
    const r = DATA_ROW + i;
    b.set(r, start, row.name, nameStyle(row.isManga));
    b.set(r, qtyCol, row.qty, qtyStyle);
    block.cols.forEach(col => b.set(r, colOf(col.key), col.value(row, key => ({ row: r, col: colOf(key) })), moneyStyle(col.color, col.bold)));
    b.rowHeight(r, 20);
  });
  if (rows.length === 0) return { endRow: FIRST_ROW + 1, mangaRef: null };

  const lastRow = DATA_ROW + rows.length - 1;
  const footRow = (r: number, label: string, fill: string, labelColor: string, r1: number): void => {
    b.set(r, start, label, footLabel(fill, labelColor));
    b.set(r, qtyCol, { op: "sum", col: qtyCol, r1, r2: lastRow }, footQty(fill, labelColor));
    block.cols.forEach(col => b.set(r, colOf(col.key), { op: "sum", col: colOf(col.key), r1, r2: lastRow }, footMoney(fill, fill === FILL.manga ? COLOR.blue : col.color)));
    b.rowHeight(r, 20);
  };
  footRow(lastRow + 1, `TOTAL ${block.label}`, FILL.total, COLOR.ink, DATA_ROW);

  // Los tomos vienen al final del bloque: su subtotal es un rango contiguo.
  const firstManga = rows.findIndex(r => r.isManga);
  if (firstManga === -1) return { endRow: lastRow + 1, mangaRef: null };
  footRow(lastRow + 2, "📘 MANGA NACIONAL (incluido)", FILL.manga, COLOR.blue, DATA_ROW + firstManga);
  return { endRow: lastRow + 2, mangaRef: { row: lastRow + 2, col: colOf(block.mangaKey) } };
}

// ── Tablas tipo lista: detalle por ticket y egresos ──────────────────────────
interface ListTable {
  start: number;
  span: number;
  title: string;
  titleFill: string;
  headFill: string;
  /** Primera · combinada · tres columnas · monto. */
  headers: [string, string, string, string, string, string];
  rows: Array<{ texts: [string, string, string, string, string]; amount: number }>;
  amountColor: string;
  totalLabel: string;
  emptyText: string;
}

/** Devuelve la última fila usada. Columnas: 1ª · combinada · últimas cuatro (3 textos + monto). */
function renderListTable(b: SheetBuilder, top: number, t: ListTable): number {
  const end = t.start + t.span - 1;
  const mergedEnd = end - 4;
  const textCols = [t.start, t.start + 1, end - 3, end - 2, end - 1];
  const mergeMiddle = (r: number) => b.merge(r, t.start + 1, r, mergedEnd);

  b.set(top, t.start, t.title, titleStyle(t.titleFill));
  b.merge(top, t.start, top, end);
  b.rowHeight(top, 25);

  const head = top + 1;
  [...textCols, end].forEach((col, i) => b.set(head, col, t.headers[i] ?? "", headStyle(t.headFill)));
  mergeMiddle(head);
  b.rowHeight(head, 20);

  if (t.rows.length === 0) {
    b.set(head + 1, t.start, t.emptyText, emptyNote);
    b.rowHeight(head + 1, 18);
    return head + 1;
  }

  t.rows.forEach((row, i) => {
    const r = head + 1 + i;
    textCols.forEach((col, j) => b.set(r, col, row.texts[j] ?? "", listText));
    mergeMiddle(r);
    b.set(r, end, row.amount, { numFmt: MONEY, font: arial(9, t.amountColor, true), align: { horizontal: "right", vertical: "top" } });
    b.rowHeight(r, 18);
  });

  const total = head + 1 + t.rows.length;
  textCols.forEach((col, j) => b.set(total, col, j === 0 ? t.totalLabel : "", footLabel(FILL.total, COLOR.ink)));
  mergeMiddle(total);
  b.set(total, end, { op: "sum", col: end, r1: head + 1, r2: total - 1 }, footMoney(FILL.total, t.amountColor));
  b.rowHeight(total, 20);
  return total;
}

const ADJUSTMENT_EMOJI: Record<AdjustmentRow["kind"], string> = { promo: "🎁", discount: "🏷️", surcharge: "📈" };
const adjustmentRows = (rows: readonly AdjustmentRow[]): ListTable["rows"] =>
  rows.map(r => ({ texts: [r.product, `${ADJUSTMENT_EMOJI[r.kind]} ${r.label}`, r.ticket, r.cashier, r.date], amount: r.amount }));

// ── Bloques de preventas y devoluciones ──────────────────────────────────────
type PlainCol = { header: string; style: CellStyle; footStyle: CellStyle };

/** Bloque sin fórmulas por renglón (valores fijos) y TOTAL con SUM. Devuelve su última fila. */
function renderPlainBlock(b: SheetBuilder, start: number, title: string, titleFill: string, headFill: string, cols: PlainCol[], rows: Array<[string, ...number[]]>, totalLabel: string): number {
  blockHeader(b, start, cols.length + 1, title, titleFill, ["Producto", ...cols.map(c => c.header)], headFill);
  rows.forEach((row, i) => {
    const r = DATA_ROW + i;
    b.set(r, start, row[0], nameStyle(false));
    cols.forEach((col, j) => b.set(r, start + 1 + j, (row[j + 1] as CellValue | undefined) ?? 0, col.style));
    b.rowHeight(r, 20);
  });
  if (rows.length === 0) return FIRST_ROW + 1;
  const total = DATA_ROW + rows.length;
  b.set(total, start, totalLabel, footLabel(FILL.total, COLOR.ink));
  cols.forEach((col, j) => b.set(total, start + 1 + j, { op: "sum", col: start + 1 + j, r1: DATA_ROW, r2: total - 1 }, col.footStyle));
  b.rowHeight(total, 20);
  return total;
}

const plainMoney = (header: string, color: string, bold: boolean): PlainCol => ({ header, style: moneyStyle(color, bold), footStyle: footMoney(FILL.total, color) });

// ── Hoja completa ────────────────────────────────────────────────────────────
export function buildVentasSheetModel(input: VentasSheetInput): SheetModel {
  const { rows, presaleRows, paymentBreakdown, canViewCost } = input;
  const b = new SheetBuilder();

  // Encabezado
  b.set(1, 1, "TADAIMA - REPORTE DE AUDITORÍA Y VENTAS", { font: arial(14, COLOR.white, true), fill: "FFCC2200", align: { horizontal: "center", vertical: "middle" } });
  b.merge(1, 1, 1, 7);
  b.rowHeight(1, 35);
  b.set(2, 1, input.subtitle, { font: { name: "Arial", size: 10, italic: true }, align: { horizontal: "center", vertical: "middle" } });
  b.merge(2, 1, 2, 7);
  b.rowHeight(2, 20);
  b.set(4, 1, "INGRESOS COBRADOS EN CAJA (CONCEPTO VS MONTO NETO REAL DEL PERIODO)", { font: arial(9, "FF666666", true), fill: "FFF8F8F8", align: { horizontal: "center", vertical: "middle" } });
  b.merge(4, 1, 4, 7);
  b.rowHeight(4, 24);

  // Bloques por método, lado a lado
  const blocks = methodBlocks(canViewCost, input.ivaRate);
  const starts: number[] = [];
  let nextStart = 1;
  for (const block of blocks) {
    starts.push(nextStart);
    nextStart += blockSpan(block) + 1;
  }
  const rendered = blocks.map((block, i) => renderMethodBlock(b, block, starts[i]!, rows.blocks[block.bucket]));

  // 4. Preventas y 5. Devoluciones
  const presaleStart = nextStart;
  const presaleCols: PlainCol[] = [
    { header: "Cant. Preventa", style: qtyStyle, footStyle: footQty(FILL.total, COLOR.ink) },
    plainMoney("Abonado", COLOR.green, true),
    plainMoney("Pendiente", COLOR.red, true),
    plainMoney("Pactado", COLOR.gray, false),
    ...(canViewCost ? [plainMoney("Costo Producto", COLOR.gray, false), plainMoney("Utilidad", COLOR.green, true)] : []),
  ];
  const presaleEnd = renderPlainBlock(b, presaleStart, " 4. APARTADOS Y PREVENTAS", "FFAA66FF", "FFCC88FF", presaleCols,
    presaleRows.map(r => [r.name, r.qty, r.apartado, r.deuda, r.pactado, ...(canViewCost ? [r.costoNeto, r.utilidad] : [])]), "TOTAL PREVENTAS");

  const returnsStart = presaleStart + presaleCols.length + 1 + 4;
  const returnsEnd = renderPlainBlock(b, returnsStart, " 5. DEVOLUCIONES Y CANCELACIONES", "FFFF7755", "FFFF8866", [
    { header: "Cant. Devuelta", style: { font: arial(9, COLOR.red, true), align: { horizontal: "center", vertical: "middle" } }, footStyle: footQty(FILL.total, COLOR.ink) },
    plainMoney("Monto Devuelto", COLOR.red, true),
  ], rows.returns.map(r => [r.name, r.qty, r.amount]), "TOTAL DEVOLUCIONES");

  // Resumen (fila 5): valores numéricos; el total y Manga Nacional son fórmulas.
  const label: CellStyle = { font: arial(10, "FF333333", true), align: { horizontal: "right", vertical: "middle" } };
  const amount: CellStyle = { numFmt: MONEY, font: arial(10, "FF333333", true), align: { horizontal: "left", vertical: "middle" } };
  const cashRef = b.set(5, 4, paymentBreakdown.cash, amount);
  const cardRef = b.set(5, 6, paymentBreakdown.card, amount);
  const depositsRef = b.set(5, 8, paymentBreakdown.deposits, amount);
  b.set(5, 1, "Total Bruto:", label);
  b.set(5, 2, { op: "add", refs: [cashRef, cardRef, depositsRef] }, amount);
  b.set(5, 3, "Efectivo:", label);
  b.set(5, 5, "Tarjetas:", label);
  b.set(5, 7, "Depósitos:", label);
  const mangaRefs = rendered.flatMap(r => (r.mangaRef ? [r.mangaRef] : []));
  b.set(5, 9, "📘 Manga Nacional:", { ...label, font: arial(10, COLOR.blue, true), fill: FILL.manga });
  b.set(5, 10, mangaRefs.length > 0 ? { op: "add", refs: mangaRefs } : 0, { ...amount, font: arial(10, COLOR.blue, true), fill: FILL.manga });
  b.rowHeight(5, 20);

  // Detalle por ticket bajo cada método: x.1 descuentos y ofertas, x.2 aumentos.
  const detailTop = Math.max(...rendered.map(r => r.endRow), presaleEnd, returnsEnd) + 3;
  let lastRow = detailTop;
  blocks.forEach((block, i) => {
    const base = { start: starts[i]!, span: blockSpan(block), emptyText: "Sin movimientos en el periodo" };
    const columns = ["Producto", "Motivo / nota", "Ticket", "Cobró", "Fecha"] as const;
    const discountsEnd = renderListTable(b, detailTop, {
      ...base, title: ` ${block.number}.1 ${block.label} — DESCUENTOS Y OFERTAS`, titleFill: "FFB8860B", headFill: "FFD4A82A",
      headers: [...columns, "Descuento"], rows: adjustmentRows(rows.discounts[block.bucket]), amountColor: COLOR.red, totalLabel: `TOTAL DESCUENTOS ${block.label}`,
    });
    const surchargesEnd = renderListTable(b, discountsEnd + 3, {
      ...base, title: ` ${block.number}.2 ${block.label} — AUMENTOS DE PRECIO`, titleFill: "FFCC7722", headFill: "FFDD9944",
      headers: [...columns, "Aumento"], rows: adjustmentRows(rows.surcharges[block.bucket]), amountColor: COLOR.orange, totalLabel: `TOTAL AUMENTOS ${block.label}`,
    });
    lastRow = Math.max(lastRow, surchargesEnd);
  });

  // 6. Egresos
  renderListTable(b, lastRow + 3, {
    start: 1, span: MIN_SPAN, title: " 6. EGRESOS — INSUMOS DE OPERACIÓN", titleFill: "FFCC7722", headFill: "FFDD9944",
    headers: ["Insumo", "Descripción", "Origen", "Registró", "Tienda", "Monto"],
    rows: input.supplies.map(s => ({ texts: [s.name, s.note, s.origin, s.user, s.store], amount: s.amount })),
    amountColor: COLOR.darkRed, totalLabel: "TOTAL EGRESOS", emptyText: "Sin egresos de insumos en el periodo",
  });

  // Anchos (los de la muestra): producto 28, cantidad 14, montos 15; las columnas
  // extra del detalle y los huecos entre bloques, más angostos.
  blocks.forEach((block, i) => {
    const start = starts[i]!, table = tableCols(block), span = blockSpan(block);
    const extras = block.bucket === "cash" ? [20, 16, 15] : [14, 14, 14];
    for (let c = 0; c < span; c++) {
      b.colWidth(start + c, c === 0 ? 28 : c === 1 ? 14 : c < table ? 15 : extras[c - table] ?? 14);
    }
    b.colWidth(start + span, block.bucket === "cash" ? 18 : 10); // hueco (bajo "📘 Manga Nacional:" en efectivo)
  });
  [presaleStart, returnsStart].forEach((start, i) => {
    const cols = i === 0 ? presaleCols.length + 1 : 3;
    for (let c = 0; c < cols; c++) b.colWidth(start + c, c === 0 ? 28 : c === 1 ? 14 : 15);
  });
  for (let c = presaleStart + presaleCols.length + 1; c < returnsStart; c++) b.colWidth(c, 10);

  return b.build();
}
