// Pestañas del Excel de Reportes y de los cortes de caja (tienda / cajero).
// 5 pestañas: Resumen · Efectivo · Tarjeta · Transferencias · Preventas.
// Dentro de Efectivo/Tarjeta/Transferencias: sub-tabla de regulares arriba,
// sub-tabla de Manga Nacional abajo, y renglón "TOTAL FINAL {TAB}" combinado.
// Totales, IVA, neto y utilidad son fórmulas; el Resumen se liga al
// TOTAL FINAL de cada pestaña con fórmulas entre pestañas.
import type { Workbook } from "exceljs";
import type { GroupedProduct, ReportExportParams } from "./reportTypes";
import { fmtDate } from "./reportFormat";
import {
  EGRESO, MONEY_FMT, align, cellRef, createSheet, fill, font, sectionHeader,
  totalLabel, totalMoney, totalQty,
  type CellStyle, type SheetBuilder,
} from "./excelSheet";
import {
  FIRST_DATA_ROW, FIRST_TABLE_ROW, PRESALE_COLS, RETURN_COLS,
  cardTable, drawPresales, drawProductTable, drawReturns, drawTableHeaders,
  isCardMethod, isCashLike, isManga, isTransferMethod, methodTable, tableWidth, withMethod,
  type TableResult,
} from "./excelTopTables";
import { bottomLayout, drawEgresos, drawMethodAdjustments } from "./excelBottomTables";

/** Columnas vacías entre dos tablas de la misma pestaña. */
const GAP = 1;
/** Ancho de las tablas de descuentos/aumentos/egresos. */
const BLOCK_WIDTH = 8;
/** Filas vacías entre tablas apiladas. */
const STACK_GAP = 2;
/** Color de encabezado de la sub-tabla Manga Nacional. */
const MANGA_HDR_COLOR = "0D9488";
/** Color de sub-encabezado de columnas Manga Nacional. */
const MANGA_SUB_COLOR = "14B8A6";

const isPresale = (g: GroupedProduct) => g.pre_sale_apartado !== undefined;

/** Título y periodo arriba de cada pestaña (filas 1-2). */
function drawTitle(sh: SheetBuilder, p: ReportExportParams, width: number): void {
  const store = !p.effectiveStoreId ? "Todas" : p.stores.find((s) => s.id === p.effectiveStoreId)?.name ?? "Todas";
  const user = !p.selectedUserId ? "Todos" : p.users.find((u) => u.id === p.selectedUserId)?.name ?? "Todos";
  const period = p.periodLabel ?? (p.from === p.to ? fmtDate(p.from) : `${fmtDate(p.from)} al ${fmtDate(p.to)}`);
  const w = Math.max(width, 5);
  sh.merge(1, 1, w);
  sh.set(1, 1, p.title ?? "TADAIMA - REPORTE DE AUDITORÍA Y VENTAS", { font: font({ sz: 14, bold: true, color: "FFFFFF" }), fill: fill("CC2200"), alignment: align("center") });
  sh.height(1, 35);
  sh.merge(2, 1, w);
  sh.set(2, 1, `Periodo: ${period}  |  Tienda: ${store}  |  Usuario: ${user}`, { font: font({ sz: 10, italic: true }), alignment: align("center") });
  sh.height(2, 20);
}

/** Anchos: nombre ancho, cantidad mediana, montos iguales. */
function tableWidths(sh: SheetBuilder, col: number, n: number): void {
  sh.width(col, 34);
  sh.width(col + 1, 14);
  for (let c = col + 2; c < col + n; c++) sh.width(c, 15);
}

interface ProductSheet {
  name: string;
  /** Columna de lo cobrado (Venta / Bruto) y de la utilidad, para el Resumen. */
  ventaKey: string;
  result: TableResult;
}

/**
 * Pestaña con dos sub-tablas apiladas: productos regulares arriba y
 * Manga Nacional abajo (mismo formato). Al pie, renglón "TOTAL FINAL {name}"
 * que combina ambos totales — esa celda es la que el Resumen referencia.
 */
function productSheet(
  wb: Workbook, p: ReportExportParams, name: string,
  titles: { main: string; manga: string }, colors: [string, string],
  table: ReturnType<typeof methodTable>, groups: GroupedProduct[], ventaKey: string,
): ProductSheet & { sh: SheetBuilder } {
  const sh = createSheet(wb.addWorksheet(name));
  const w = tableWidth(table);
  drawTitle(sh, p, w);

  const regular = groups.filter((g) => !isManga(g));
  const mangaGroups = groups.filter(isManga);

  // Sub-tabla 1: productos regulares
  sectionHeader(sh, FIRST_TABLE_ROW, 1, w, titles.main, colors[0]);
  drawTableHeaders(sh, table, colors[1]);
  const r1 = drawProductTable(sh, table, regular, false);

  let result: TableResult;

  if (mangaGroups.length > 0) {
    // Sub-tabla 2: Manga Nacional
    const mangaHdrRow = r1.next + STACK_GAP;
    sectionHeader(sh, mangaHdrRow, 1, w, titles.manga, MANGA_HDR_COLOR);
    drawTableHeaders(sh, table, MANGA_SUB_COLOR, "Producto", mangaHdrRow + 1);
    const r2 = drawProductTable(sh, table, mangaGroups, false, mangaHdrRow + 2);

    // Renglón "TOTAL FINAL" que combina ambas sub-tablas
    const grandRow = r2.next + 1;
    sh.set(grandRow, 1, `TOTAL FINAL ${name.toUpperCase()}`, { ...totalLabel, fill: fill(colors[0]) });
    sh.height(grandRow, 22);

    const grandTotals: Record<string, { ref: string; value: number }> = {};
    table.columns.forEach((c, ci) => {
      const colN = table.col + 1 + ci;
      const v1 = r1.totals[c.key];
      const v2 = r2.totals[c.key];
      const combined = (v1?.value ?? 0) + (v2?.value ?? 0);
      const style = c.qty ? totalQty : totalMoney(c.color);
      if (v1 && v2) {
        sh.setF(grandRow, colN, `${v1.ref}+${v2.ref}`, combined, style);
      } else {
        sh.set(grandRow, colN, combined, style);
      }
      grandTotals[c.key] = { ref: cellRef(grandRow, colN), value: combined };
    });

    result = { next: grandRow + 1, manga: null, totals: grandTotals };
  } else {
    // Sin manga: una sola sub-tabla, sin renglón TOTAL FINAL
    result = r1;
  }

  tableWidths(sh, 1, w);
  return { sh, name, ventaKey, result };
}

/** Anchos de un bloque de descuentos/aumentos/egresos. */
function blockWidths(sh: SheetBuilder, col: number): void {
  const L = bottomLayout(col, BLOCK_WIDTH);
  sh.width(L.ins, 30);
  for (let c = L.desc; c <= L.descEnd; c++) sh.width(c, 14);
  sh.width(L.orig, 10);
  sh.width(L.reg, 18);
  sh.width(L.tienda, 14);
  sh.width(L.monto, 14);
}

/** Ref a la celda de otra pestaña: 'Efectivo'!D12. */
const xref = (sheet: string, ref: string) => `'${sheet}'!${ref}`;

/**
 * Pestaña Resumen: lo vendido por pestaña (ligado a su TOTAL FINAL), Total Bruto,
 * Egresos y Total Final; abajo descuentos/aumentos por método y Egresos.
 * Con canViewCost muestra además Costo y Utilidad por método.
 */
function drawResumen(sh: SheetBuilder, p: ReportExportParams, groups: GroupedProduct[], tabs: ProductSheet[]): void {
  const { canViewCost } = p;
  // Con costo: cols B=label C=Costo D=Venta E=Utilidad → 5 cols total (A-E)
  // Sin costo: cols B=label C=Venta → 4 cols total (A-D)
  const totalCols = canViewCost ? 5 : 4;
  const ventaCol  = canViewCost ? 4 : 3;
  const costoCol  = 3;
  const utilCol   = 5;

  const blocksTop = FIRST_TABLE_ROW + tabs.length + 14;
  const leftL = bottomLayout(1, BLOCK_WIDTH);
  const rightCol = 1 + BLOCK_WIDTH + GAP;
  const cashEnd = drawMethodAdjustments(sh, blocksTop, leftL, groups, "cash", "EFECTIVO", 1);
  const egTop = cashEnd + STACK_GAP + 1;
  const egEnd = drawEgresos(sh, egTop, leftL, p.supplyMovements, p.stores, 6);
  const cardEnd = drawMethodAdjustments(sh, blocksTop, bottomLayout(rightCol, BLOCK_WIDTH), groups, "card", "TARJETA", 2);
  drawMethodAdjustments(sh, cardEnd + STACK_GAP + 1, bottomLayout(rightCol, BLOCK_WIDTH), groups, "transfer", "TRANSFERENCIAS", 3);
  blockWidths(sh, 1);
  blockWidths(sh, rightCol);

  const header: CellStyle = { font: font({ sz: 10, bold: true, color: "FFFFFF" }), fill: fill("B8732E"), alignment: align("left") };
  sh.merge(FIRST_TABLE_ROW, 1, totalCols);
  sh.set(FIRST_TABLE_ROW, 1, "RESUMEN DE VENTAS", header);

  if (canViewCost) {
    const subH: CellStyle = { font: font({ sz: 9, bold: true, color: "FFFFFF" }), fill: fill("CC9944"), alignment: align("center") };
    const hRow = FIRST_TABLE_ROW + 1;
    sh.set(hRow, costoCol, "Costo", subH);
    sh.set(hRow, ventaCol, "Venta", subH);
    sh.set(hRow, utilCol,  "Utilidad", subH);
    sh.height(hRow, 18);
  }

  const label: CellStyle = { font: font({ sz: 10, bold: true, color: "333333" }), alignment: align("right") };
  const money: CellStyle = { numFmt: MONEY_FMT, font: font({ sz: 10, bold: true, color: "333333" }), alignment: align("left") };
  const green: CellStyle = { ...money, font: font({ sz: 10, bold: true, color: "059669" }) };
  const sep = fill("DDDDDD");

  let r = FIRST_TABLE_ROW + 2;
  const ventaRows: number[] = [];
  const costoRows: number[] = [];
  const utilRows:  number[] = [];

  tabs.forEach((t, i) => {
    if (i > 0) {
      for (let c = 1; c <= totalCols; c++) sh.set(r, c, "", { fill: sep });
      r++;
    }
    const venta = t.result.totals[t.ventaKey];
    const costo = t.result.totals["costo"];
    const util  = t.result.totals["util"];

    sh.set(r, 2, `${t.name}:`, label);

    if (canViewCost) {
      if (costo) sh.setF(r, costoCol, xref(t.name, costo.ref), costo.value, money);
      else sh.set(r, costoCol, 0, money);
      costoRows.push(r);
    }

    if (venta) sh.setF(r, ventaCol, xref(t.name, venta.ref), venta.value, money);
    else sh.set(r, ventaCol, 0, money);
    ventaRows.push(r);

    if (canViewCost) {
      if (util) sh.setF(r, utilCol, xref(t.name, util.ref), util.value, green);
      else sh.set(r, utilCol, 0, green);
      utilRows.push(r);
    }
    r++;
  });

  for (let c = 1; c <= totalCols; c++) sh.set(r, c, "", { fill: sep });
  r++;

  const bruto = tabs.reduce((a, t) => a + (t.result.totals[t.ventaKey]?.value ?? 0), 0);
  const brutoRow = r;
  sh.set(r, 2, "Total Bruto:", label);
  sh.setF(r, ventaCol, ventaRows.map((x) => cellRef(x, ventaCol)).join("+"), bruto, money);
  if (canViewCost) {
    const tc = tabs.reduce((a, t) => a + (t.result.totals["costo"]?.value ?? 0), 0);
    const tu = tabs.reduce((a, t) => a + (t.result.totals["util"]?.value ?? 0), 0);
    sh.setF(r, costoCol, costoRows.map((x) => cellRef(x, costoCol)).join("+"), tc, money);
    sh.setF(r, utilCol,  utilRows.map((x)  => cellRef(x, utilCol)).join("+"),  tu, green);
  }
  r++;

  const egresos = p.supplyMovements.reduce((a, m) => a + (m.amount || 0), 0);
  const egRow = r;
  const red: CellStyle = { font: font({ sz: 10, bold: true, color: EGRESO }), alignment: align("right") };
  sh.set(r, 2, "Egresos:", red);
  const egresoStyle: CellStyle = { ...money, font: font({ sz: 10, bold: true, color: EGRESO }) };
  if (p.supplyMovements.length > 0) sh.setF(r, ventaCol, cellRef(egEnd, leftL.monto), egresos, egresoStyle);
  else sh.set(r, ventaCol, 0, egresoStyle);
  const what = [...new Set(p.supplyMovements.map((m) => m.supply?.name).filter(Boolean))].join(", ");
  if (what) sh.set(r, ventaCol + 1, `(${what})`, { font: font({ sz: 10, bold: true, color: EGRESO }), alignment: align("left") });
  r += 2;

  const finalStyle: CellStyle = { ...money, fill: fill("F8D9B8") };
  sh.set(r, 2, "TOTAL FINAL:", label);
  if (canViewCost) {
    const util = tabs.reduce((a, t) => a + (t.result.totals["util"]?.value ?? 0), 0);
    sh.setF(r, utilCol, `${utilRows.map((x) => cellRef(x, utilCol)).join("+")}-${cellRef(egRow, ventaCol)}`, util - egresos, { ...finalStyle, font: font({ sz: 10, bold: true, color: "059669" }) });
  } else {
    sh.setF(r, ventaCol, `${cellRef(brutoRow, ventaCol)}-${cellRef(egRow, ventaCol)}`, bruto - egresos, finalStyle);
  }
}

export function addVentasSheets(workbook: Workbook, p: ReportExportParams): void {
  const { canViewCost, ivaRate } = p;
  const groups = p.groupedProducts.filter((g) => !isPresale(g));

  const resumen = createSheet(workbook.addWorksheet("Resumen"));

  // Efectivo: regulares arriba + Manga abajo + TOTAL FINAL EFECTIVO
  const cashT = methodTable(1, isCashLike, "Efectivo", "TOTAL EFECTIVO", canViewCost);
  const cash = productSheet(workbook, p, "Efectivo",
    { main: " 1. VENTAS EN EFECTIVO", manga: "1. EFECTIVO — MANGA NACIONAL" },
    ["33BB66", "55CC77"], cashT, withMethod(groups, isCashLike), "venta");
  const retCol = tableWidth(cashT) + GAP + 1;
  drawReturns(cash.sh, groups, retCol);
  tableWidths(cash.sh, retCol, RETURN_COLS);

  // Tarjeta: regulares arriba + Manga abajo + TOTAL FINAL TARJETA
  const card = productSheet(workbook, p, "Tarjeta",
    { main: " 2. DESGLOSE DE COBROS CON TARJETA", manga: "2. TARJETA — MANGA NACIONAL" },
    ["2266BB", "4488DD"], cardTable(1, canViewCost, ivaRate), withMethod(groups, isCardMethod), "bruto");

  // Transferencias: regulares arriba + Manga abajo + TOTAL FINAL TRANSFERENCIAS
  const transfer = productSheet(workbook, p, "Transferencias",
    { main: " 3. TRANSFERENCIAS / DEPÓSITOS", manga: "3. TRANSFERENCIAS — MANGA NACIONAL" },
    ["119999", "33BBBB"], methodTable(1, isTransferMethod, "Transferencia", "TOTAL TRANSFERENCIAS", canViewCost),
    withMethod(groups, isTransferMethod), "venta");

  // Preventas: última pestaña
  const pre = createSheet(workbook.addWorksheet("Preventas"));
  drawTitle(pre, p, PRESALE_COLS(canViewCost));
  drawPresales(pre, p.presaleRows, 1, canViewCost);
  tableWidths(pre, 1, PRESALE_COLS(canViewCost));

  drawTitle(resumen, p, BLOCK_WIDTH * 2 + GAP);
  drawResumen(resumen, p, groups, [cash, card, transfer]);
}
