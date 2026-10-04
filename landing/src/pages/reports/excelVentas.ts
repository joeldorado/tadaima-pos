// Hoja "Ventas" del Excel de Reportes y de los cortes de caja (tienda / cajero).
// Réplica del Excel de la app (Joel 2026-10-03): tablas lado a lado
// (Efectivo · Tarjeta · Transferencias · Preventas · Devoluciones); debajo de cada
// método sus descuentos/ofertas y aumentos por ticket; al final Egresos.
// Totales, IVA, neto y utilidad son fórmulas de Excel.
import type { Workbook } from "exceljs";
import type { GroupedProduct, ReportExportParams } from "./reportTypes";
import { fmtDate } from "./reportFormat";
import {
  MONEY_FMT, align, createSheet, fill, font, sectionHeader, type CellStyle, type SheetBuilder,
} from "./excelSheet";
import {
  FIRST_TABLE_ROW, cardTable, drawPresales, drawProductTable, drawReturns, drawTableHeaders, isCashLike,
  isTransferMethod, isCardMethod, methodTable, tableWidth, withMethod, type MangaSubtotal,
} from "./excelTopTables";
import { bottomLayout, drawEgresos, drawMethodAdjustments } from "./excelBottomTables";

// 4 columnas entre tablas: las de descuentos/aumentos de abajo usan 3 de ellas para caber.
const TABLE_GAP = 4;
const MANGA_BLUE = "1D4ED8";
const MANGA_FILL = fill("DBEAFE");

const isPresale = (g: GroupedProduct) => g.pre_sale_apartado !== undefined;

function drawTitle(sh: SheetBuilder, p: ReportExportParams): void {
  const store = !p.effectiveStoreId ? "Todas" : p.stores.find((s) => s.id === p.effectiveStoreId)?.name ?? "Todas";
  const user = !p.selectedUserId ? "Todos" : p.users.find((u) => u.id === p.selectedUserId)?.name ?? "Todos";
  const period = p.periodLabel ?? (p.from === p.to ? fmtDate(p.from) : `${fmtDate(p.from)} al ${fmtDate(p.to)}`);

  sh.merge(1, 1, 7);
  sh.set(1, 1, p.title ?? "TADAIMA - REPORTE DE AUDITORÍA Y VENTAS", { font: font({ sz: 14, bold: true, color: "FFFFFF" }), fill: fill("CC2200"), alignment: align("center") });
  sh.height(1, 35);
  sh.merge(2, 1, 7);
  sh.set(2, 1, `Periodo: ${period}  |  Tienda: ${store}  |  Usuario: ${user}`, { font: font({ sz: 10, italic: true }), alignment: align("center") });
  sh.height(2, 20);
  sh.merge(4, 1, 7);
  sh.set(4, 1, "INGRESOS COBRADOS EN CAJA (CONCEPTO VS MONTO NETO REAL DEL PERIODO)", { font: font({ bold: true, color: "666666" }), fill: fill("F8F8F8"), alignment: align("center") });
  sh.height(4, 24);

  // Lo cobrado (ventas + anticipos de preventa, neto de cancelaciones) por método.
  const label: CellStyle = { font: font({ sz: 10, bold: true, color: "333333" }), alignment: align("right") };
  const amount: CellStyle = { numFmt: MONEY_FMT, font: font({ sz: 10, bold: true, color: "333333" }), alignment: align("left") };
  const { total, cash, card, deposits } = p.paymentBreakdown;
  sh.set(5, 1, "Total Bruto:", label);
  sh.set(5, 3, "Efectivo:", label);
  sh.set(5, 4, cash, amount);
  sh.set(5, 5, "Tarjetas:", label);
  sh.set(5, 6, card, amount);
  sh.set(5, 7, "Depósitos:", label);
  sh.set(5, 8, deposits, amount);
  // Un método no reconocido entra al total pero a ninguna columna: ahí va como valor.
  if (Math.abs(total - (cash + card + deposits)) < 0.005) sh.setF(5, 2, "D5+F5+H5", total, amount);
  else sh.set(5, 2, total, amount);
  sh.height(5, 20);
}

/** Cuadro "Manga Nacional" del resumen: suma los subtotales azules (efectivo + tarjeta bruto + transferencias). */
function drawMangaSummary(sh: SheetBuilder, parts: readonly (MangaSubtotal | null)[]): void {
  const present = parts.filter((x): x is MangaSubtotal => x !== null);
  const style: CellStyle = { numFmt: MONEY_FMT, font: font({ sz: 10, bold: true, color: MANGA_BLUE }), fill: MANGA_FILL, alignment: align("left") };
  sh.set(5, 9, "📘 Manga Nacional:", { font: font({ sz: 10, bold: true, color: MANGA_BLUE }), fill: MANGA_FILL, alignment: align("right") });
  if (present.length > 0) sh.setF(5, 10, present.map((x) => x.ref).join("+"), present.reduce((a, x) => a + x.value, 0), style);
  else sh.set(5, 10, 0, style);
}

export function addVentasSheet(workbook: Workbook, p: ReportExportParams): void {
  const { canViewCost, ivaRate } = p;
  const sh = createSheet(workbook.addWorksheet("Ventas"));
  const groups = p.groupedProducts.filter((g) => !isPresale(g));
  drawTitle(sh, p);

  const cashT = methodTable(1, isCashLike, "Efectivo", "TOTAL EFECTIVO", canViewCost);
  const cardT = cardTable(cashT.col + tableWidth(cashT) + TABLE_GAP, canViewCost, ivaRate);
  const transferT = methodTable(cardT.col + tableWidth(cardT) + TABLE_GAP, isTransferMethod, "Transferencia", "TOTAL TRANSFERENCIAS", canViewCost);
  const T4 = transferT.col + tableWidth(transferT) + TABLE_GAP;
  const T4N = canViewCost ? 7 : 5;
  const T5 = T4 + T4N + TABLE_GAP;
  const T5N = 3;
  const hr = FIRST_TABLE_ROW + 1;

  sectionHeader(sh, FIRST_TABLE_ROW, cashT.col, cashT.col + tableWidth(cashT) - 1, " 1. VENTAS EN EFECTIVO", "33BB66");
  sectionHeader(sh, FIRST_TABLE_ROW, cardT.col, cardT.col + tableWidth(cardT) - 1, " 2. DESGLOSE DE COBROS CON TARJETA", "2266BB");
  sectionHeader(sh, FIRST_TABLE_ROW, transferT.col, transferT.col + tableWidth(transferT) - 1, " 3. TRANSFERENCIAS / DEPÓSITOS", "119999");
  sectionHeader(sh, FIRST_TABLE_ROW, T4, T4 + T4N - 1, " 4. APARTADOS Y PREVENTAS", "AA66FF");
  sectionHeader(sh, FIRST_TABLE_ROW, T5, T5 + T5N - 1, " 5. DEVOLUCIONES Y CANCELACIONES", "FF7755");
  drawTableHeaders(sh, cashT, "55CC77");
  drawTableHeaders(sh, cardT, "4488DD");
  drawTableHeaders(sh, transferT, "33BBBB");
  ["Producto", "Cant. Preventa", "Abonado", "Pendiente", "Pactado", ...(canViewCost ? ["Costo Producto", "Utilidad"] : [])]
    .forEach((h, i) => sh.set(hr, T4 + i, h, { font: font({ bold: true, color: "FFFFFF" }), fill: fill("CC88FF"), alignment: align("center", "middle", true) }));
  ["Producto", "Cant. Devuelta", "Monto Devuelto"]
    .forEach((h, i) => sh.set(hr, T5 + i, h, { font: font({ bold: true, color: "FFFFFF" }), fill: fill("FF8866"), alignment: align("center", "middle", true) }));

  const cash = drawProductTable(sh, cashT, withMethod(groups, isCashLike));
  const card = drawProductTable(sh, cardT, withMethod(groups, isCardMethod));
  const transfer = drawProductTable(sh, transferT, withMethod(groups, isTransferMethod));
  drawMangaSummary(sh, [cash.manga, card.manga, transfer.manga]);
  const r4 = drawPresales(sh, p.presaleRows, T4, canViewCost);
  const r5 = drawReturns(sh, groups, T5);

  // Debajo de cada método, sus descuentos/ofertas y aumentos (ancho = tabla + 3 columnas del hueco).
  const adjWidth = (n: number) => n + TABLE_GAP - 1;
  const adjStart = Math.max(cash.next, card.next, transfer.next) + 2;
  const a1 = drawMethodAdjustments(sh, adjStart, bottomLayout(cashT.col, adjWidth(tableWidth(cashT))), groups, "cash", "EFECTIVO", 1);
  const a2 = drawMethodAdjustments(sh, adjStart, bottomLayout(cardT.col, adjWidth(tableWidth(cardT))), groups, "card", "TARJETA", 2);
  const a3 = drawMethodAdjustments(sh, adjStart, bottomLayout(transferT.col, adjWidth(tableWidth(transferT))), groups, "transfer", "TRANSFERENCIAS", 3);
  const egresos = bottomLayout(1, 8);
  drawEgresos(sh, Math.max(a1, a2, a3, r4, r5) + 3, egresos, p.supplyMovements, p.stores, 6);

  // Orden de anchos: huecos → columnas de Egresos → tablas de arriba (estas mandan).
  const tables: Array<[number, number]> = [
    [cashT.col, tableWidth(cashT)], [cardT.col, tableWidth(cardT)], [transferT.col, tableWidth(transferT)], [T4, T4N], [T5, T5N],
  ];
  for (const [start, n] of tables.slice(0, 3)) {
    for (let c = start + n; c < start + adjWidth(n); c++) sh.width(c, 14);
  }
  sh.width(9, 18); // etiqueta del cuadro Manga Nacional (si es columna de tabla, la tabla la sobrescribe)
  sh.width(egresos.reg, 20);
  sh.width(egresos.tienda, 16);
  sh.width(egresos.monto, 15);
  for (const [start, n] of tables) {
    sh.width(start, 28);
    sh.width(start + 1, 14);
    for (let c = start + 2; c < start + n; c++) sh.width(c, 15);
  }
}
