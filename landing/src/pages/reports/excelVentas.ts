// Pestañas del Excel de Reportes y de los cortes de caja (tienda / cajero).
// Una pestaña por tabla (Ruben 2026-10-05); los tomos (Manga Nacional) van en
// pestañas propias, separados de los productos regulares:
//   Resumen (+ descuentos, aumentos y egresos) · Efectivo (+ Devoluciones) ·
//   Efectivo Manga · Tarjeta · Tarjeta Manga · Transferencias ·
//   Transferencias Manga · Preventas.
// Totales, IVA, neto y utilidad son fórmulas; el Resumen se liga a los TOTAL de
// cada pestaña con fórmulas entre pestañas.
import type { Workbook } from "exceljs";
import type { GroupedProduct, ReportExportParams } from "./reportTypes";
import { fmtDate } from "./reportFormat";
import {
  EGRESO, MONEY_FMT, align, cellRef, createSheet, fill, font, sectionHeader, type CellStyle, type SheetBuilder,
} from "./excelSheet";
import {
  FIRST_TABLE_ROW, PRESALE_COLS, RETURN_COLS, cardTable, drawPresales, drawProductTable, drawReturns, drawTableHeaders,
  isCardMethod, isCashLike, isTransferMethod, methodTable, tableWidth, withMethod, type TableResult,
} from "./excelTopTables";
import { bottomLayout, drawEgresos, drawMethodAdjustments } from "./excelBottomTables";

/** Columnas vacías entre dos tablas de la misma pestaña. */
const GAP = 1;
/** Ancho de las tablas de descuentos/aumentos/egresos (Producto · Motivo×3 · Ticket · Cobró · Fecha · Monto). */
const BLOCK_WIDTH = 8;
/** Filas vacías entre tablas apiladas. */
const STACK_GAP = 2;

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

/** Pestaña con una tabla por producto (método normal o solo Manga). */
function productSheet(
  wb: Workbook, p: ReportExportParams, name: string, title: string, colors: [string, string],
  table: ReturnType<typeof methodTable>, groups: GroupedProduct[], ventaKey: string,
): ProductSheet & { sh: SheetBuilder } {
  const sh = createSheet(wb.addWorksheet(name));
  const w = tableWidth(table);
  drawTitle(sh, p, w);
  sectionHeader(sh, FIRST_TABLE_ROW, 1, w, title, colors[0]);
  drawTableHeaders(sh, table, colors[1]);
  const result = drawProductTable(sh, table, groups, true);
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

/** Ref a la celda de otra pestaña: 'Efectivo Manga'!D12. */
const xref = (sheet: string, ref: string) => `'${sheet}'!${ref}`;

/**
 * Pestaña Resumen: lo vendido por pestaña (ligado a sus TOTAL), Total Bruto,
 * Egresos y Total Final; abajo descuentos/aumentos por método y Egresos.
 * Con canViewCost muestra además Costo y Utilidad por método.
 */
function drawResumen(sh: SheetBuilder, p: ReportExportParams, groups: GroupedProduct[], tabs: ProductSheet[]): void {
  const { canViewCost } = p;
  // Con costo: cols B=label C=Costo D=Venta E=Utilidad → 5 cols total (A-E)
  // Sin costo: cols B=label C=Venta → 4 cols total (A-D)
  const totalCols = canViewCost ? 5 : 4;
  const ventaCol  = canViewCost ? 4 : 3;  // columna "Venta"
  const costoCol  = 3;                     // columna "Costo" (solo canViewCost)
  const utilCol   = 5;                     // columna "Utilidad" (solo canViewCost)

  // Abajo: izquierda Efectivo (1.1/1.2) y Egresos; derecha Tarjeta y Transferencias.
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

  // Encabezado "RESUMEN DE VENTAS"
  const header: CellStyle = { font: font({ sz: 10, bold: true, color: "FFFFFF" }), fill: fill("B8732E"), alignment: align("left") };
  sh.merge(FIRST_TABLE_ROW, 1, totalCols);
  sh.set(FIRST_TABLE_ROW, 1, "RESUMEN DE VENTAS", header);

  // Sub-encabezados de columnas (solo con canViewCost)
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

  // Fila "Total Bruto"
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

  // Fila "Egresos"
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

  // Fila "TOTAL FINAL"
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
  // Todos los productos (regulares + manga) van en la misma pestaña por método.
  // El renglón "📘 MANGA NACIONAL (incluido)" aparece al pie de cada tabla.
  const groups = p.groupedProducts.filter((g) => !isPresale(g));

  // El Resumen va primero, pero se llena al final (se liga a las demás pestañas).
  const resumen = createSheet(workbook.addWorksheet("Resumen"));

  // Efectivo (regulares + manga) con Devoluciones a la derecha.
  const cashT = methodTable(1, isCashLike, "Efectivo", "TOTAL EFECTIVO", canViewCost);
  const cash = productSheet(workbook, p, "Efectivo", " 1. VENTAS EN EFECTIVO", ["33BB66", "55CC77"], cashT, withMethod(groups, isCashLike), "venta");
  const retCol = tableWidth(cashT) + GAP + 1;
  drawReturns(cash.sh, groups, retCol);
  tableWidths(cash.sh, retCol, RETURN_COLS);

  // Tarjeta (regulares + manga). Al Resumen va el BRUTO cobrado.
  const card = productSheet(workbook, p, "Tarjeta", " 2. DESGLOSE DE COBROS CON TARJETA", ["2266BB", "4488DD"],
    cardTable(1, canViewCost, ivaRate), withMethod(groups, isCardMethod), "bruto");

  // Transferencias (regulares + manga).
  const transfer = productSheet(workbook, p, "Transferencias", " 3. TRANSFERENCIAS / DEPÓSITOS", ["119999", "33BBBB"],
    methodTable(1, isTransferMethod, "Transferencia", "TOTAL TRANSFERENCIAS", canViewCost), withMethod(groups, isTransferMethod), "venta");

  // Preventas: última pestaña.
  const pre = createSheet(workbook.addWorksheet("Preventas"));
  drawTitle(pre, p, PRESALE_COLS(canViewCost));
  drawPresales(pre, p.presaleRows, 1, canViewCost);
  tableWidths(pre, 1, PRESALE_COLS(canViewCost));

  drawTitle(resumen, p, BLOCK_WIDTH * 2 + GAP);
  drawResumen(resumen, p, groups, [cash, card, transfer]);
}
