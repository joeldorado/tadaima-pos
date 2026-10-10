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
import type { PresaleRow } from "./reportTypes";
import {
  FIRST_TABLE_ROW, PRESALE_COLS, PRESALE_FOLIO_COLS, RETURN_COLS,
  cardTable, drawPresales, drawPresaleFolios, drawProductTable, drawReturns, drawTableHeaders,
  isCardMethod, isCashLike, isManga, isTransferMethod, methodTable, tableWidth, withMethod,
  type PresaleTotals, type TableResult,
} from "./excelTopTables";
import { bottomLayout, drawEgresos, drawMethodAdjustments } from "./excelBottomTables";
import { sortPresaleFolioRows } from "./buildReportData";

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
function drawTitle(sh: SheetBuilder, p: ReportExportParams, width: number, startRow = 1): void {
  const store = !p.effectiveStoreId ? "Todas" : p.stores.find((s) => s.id === p.effectiveStoreId)?.name ?? "Todas";
  const user = !p.selectedUserId ? "Todos" : p.users.find((u) => u.id === p.selectedUserId)?.name ?? "Todos";
  const period = p.periodLabel ?? (p.from === p.to ? fmtDate(p.from) : `${fmtDate(p.from)} al ${fmtDate(p.to)}`);
  const w = Math.max(width, 5);
  sh.merge(startRow, 1, w);
  sh.set(startRow, 1, p.title ?? "TADAIMA - REPORTE DE AUDITORÍA Y VENTAS", { font: font({ sz: 14, bold: true, color: "FFFFFF" }), fill: fill("CC2200"), alignment: align("center") });
  sh.height(startRow, 35);
  sh.merge(startRow + 1, 1, w);
  sh.set(startRow + 1, 1, `Periodo: ${period}  |  Tienda: ${store}  |  Usuario: ${user}`, { font: font({ sz: 10, italic: true }), alignment: align("center") });
  sh.height(startRow + 1, 20);
}

/** Anchos: nombre ancho, cantidad mediana, montos iguales. `nameWidth` más
 *  grande para columnas de Producto (nombres reales son largos: figuras,
 *  mangas con subtítulo, bundles de TCG, etc. — los de prueba son cortos). */
function tableWidths(sh: SheetBuilder, col: number, n: number, nameWidth = 34): void {
  sh.width(col, nameWidth);
  sh.width(col + 1, 14);
  for (let c = col + 2; c < col + n; c++) sh.width(c, 15);
}

interface ProductSheet {
  name: string;
  /** Columna de lo cobrado (Venta / Bruto) y de la utilidad, para el Resumen. */
  ventaKey: string;
  result: TableResult;
  /** Totales de productos regulares (sin manga) para el resumen desglosado. */
  regularTotals: Record<string, { ref: string; value: number }>;
  /** Totales de manga para el resumen desglosado. */
  mangaTotals: Record<string, { ref: string; value: number }>;
  /** Totales de la sub-tabla de Preventas de este método ("TOTAL PREVENTAS"), para el Resumen. */
  presaleTotals: PresaleTotals | null;
}

/**
 * Pestaña con dos sub-tablas apiladas: productos regulares arriba y
 * Manga Nacional abajo (mismo formato). Al pie, renglón "TOTAL FINAL {name}"
 * que combina ambos totales — esa celda es la que el Resumen referencia.
 */
function productSheet(
  wb: Workbook, p: ReportExportParams, name: string,
  titles: { main: string; manga: string; presale: string }, colors: [string, string],
  table: ReturnType<typeof methodTable>, groups: GroupedProduct[], ventaKey: string,
  presaleRows: readonly PresaleRow[],
): ProductSheet & { sh: SheetBuilder } {
  const sh = createSheet(wb.addWorksheet(name));
  const w = tableWidth(table);
  drawTitle(sh, p, w);

  const regular = groups.filter((g) => !isManga(g));
  const mangaGroups = groups.filter(isManga);

  // Sub-tabla 1: productos regulares (Ventas)
  sectionHeader(sh, FIRST_TABLE_ROW, 1, w, titles.main, colors[0]);
  drawTableHeaders(sh, table, colors[1]);
  const r1 = drawProductTable(sh, table, regular, false);

  // Sub-tabla 2: Preventas de este método, apilada justo debajo de Ventas y
  // ANTES de Manga (orden pedido: Ventas → Preventas → Manga). Sus totales se
  // exponen para que el Resumen agregue una fila "Preventas:" por método.
  let presaleTotals: PresaleTotals | null = null;
  let afterPresale = r1.next;
  if (presaleRows.length > 0) {
    const presaleTop = r1.next + STACK_GAP;
    const pr = drawPresales(sh, presaleRows, 1, p.canViewCost, presaleTop, titles.presale);
    presaleTotals = pr.totals;
    afterPresale = pr.next;
  }

  // A qué columna de `table` va cada total de Preventas (mismo venta/costo/util
  // que usan Manga y el Resumen).
  const presaleFor = (key: string): { ref: string; value: number } | undefined => {
    if (!presaleTotals) return undefined;
    if (key === ventaKey) return presaleTotals.apartado;
    if (key === "costo") return presaleTotals.costoNeto;
    if (key === "util") return presaleTotals.utilidad;
    return undefined;
  };

  let result: TableResult;
  let mangaTotals: Record<string, { ref: string; value: number }> = {};
  const hasManga = mangaGroups.length > 0;

  if (hasManga || presaleTotals) {
    let r2: TableResult | null = null;
    if (hasManga) {
      // Sub-tabla 3: Manga Nacional — con su propio título de encabezado
      const titleRow = afterPresale + STACK_GAP;
      drawTitle(sh, p, w, titleRow);
      const mangaHdrRow = titleRow + 3; // título (2 filas) + 1 fila de espacio
      sectionHeader(sh, mangaHdrRow, 1, w, titles.manga, MANGA_HDR_COLOR);
      drawTableHeaders(sh, table, MANGA_SUB_COLOR, "Producto", mangaHdrRow + 1);
      const mangaTable = { ...table, totalText: `${table.totalText} MANGA` };
      r2 = drawProductTable(sh, mangaTable, mangaGroups, false, mangaHdrRow + 2);
      mangaTotals = r2.totals;
    }

    // Renglón "TOTAL FINAL" que combina Ventas + Preventas + Manga.
    const grandRow = (hasManga && r2 ? r2.next : afterPresale) + 1;
    sh.set(grandRow, 1, `TOTAL FINAL ${name.toUpperCase()}`, { ...totalLabel, fill: fill(colors[0]) });
    sh.height(grandRow, 22);

    const grandTotals: Record<string, { ref: string; value: number }> = {};
    table.columns.forEach((c, ci) => {
      const colN = table.col + 1 + ci;
      if (c.noSum) { grandTotals[c.key] = { ref: cellRef(grandRow, colN), value: 0 }; return; }
      const v1 = r1.totals[c.key];
      const v2 = r2?.totals[c.key];
      const vp = presaleFor(c.key);
      const combined = (v1?.value ?? 0) + (v2?.value ?? 0) + (vp?.value ?? 0);
      const style = c.qty ? totalQty : totalMoney(c.color);
      const parts = [v1?.ref, v2?.ref, vp?.ref].filter((ref): ref is string => !!ref);
      if (parts.length > 0) {
        sh.setF(grandRow, colN, parts.join("+"), combined, style);
      } else {
        sh.set(grandRow, colN, combined, style);
      }
      grandTotals[c.key] = { ref: cellRef(grandRow, colN), value: combined };
    });

    result = { next: grandRow + 1, manga: null, totals: grandTotals };
  } else {
    // Sin manga ni preventas: solo Ventas, sin renglón TOTAL FINAL
    result = { ...r1, next: afterPresale };
  }

  tableWidths(sh, 1, Math.max(w, PRESALE_COLS(p.canViewCost)), 48);
  return { sh, name, ventaKey, result, regularTotals: r1.totals, mangaTotals, presaleTotals };
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
// xref: referencia cross-tab usada en drawResumen para conectar con cada pestaña

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

  const leftL = bottomLayout(1, BLOCK_WIDTH);
  const rightCol = 1 + BLOCK_WIDTH + GAP;

  const header: CellStyle = { font: font({ sz: 10, bold: true, color: "FFFFFF" }), fill: fill("B8732E"), alignment: align("left") };
  sh.merge(FIRST_TABLE_ROW, 1, totalCols);
  sh.set(FIRST_TABLE_ROW, 1, "RESUMEN DE VENTAS", header);

  const subH: CellStyle = { font: font({ sz: 9, bold: true, color: "FFFFFF" }), fill: fill("CC9944"), alignment: align("center") };
  const hRow = FIRST_TABLE_ROW + 1;
  if (canViewCost) {
    sh.set(hRow, costoCol, "Costo", subH);
    sh.set(hRow, utilCol,  "Utilidad", subH);
  }
  sh.set(hRow, ventaCol, "Venta", subH);
  sh.height(hRow, 18);

  const label: CellStyle = { font: font({ sz: 10, bold: true, color: "333333" }), alignment: align("right") };
  const labelLeft: CellStyle = { font: font({ sz: 10, bold: true, color: "333333" }), alignment: align("left") };
  const money: CellStyle = { numFmt: MONEY_FMT, font: font({ sz: 10, bold: true, color: "333333" }), alignment: align("left") };
  const green: CellStyle = { ...money, font: font({ sz: 10, bold: true, color: "059669" }) };
  const red: CellStyle = { font: font({ sz: 10, bold: true, color: EGRESO }), alignment: align("right") };
  const egresoMoney: CellStyle = { ...money, font: font({ sz: 10, bold: true, color: EGRESO }) };
  const sep = fill("E8E8E8");
  const sepDark = fill("DDDDDD");

  // Nombres por método (regular + manga)
  const NAMES: Record<string, [string, string]> = {
    Efectivo:       ["Efectivo:",       "Efectivo Manga:"],
    Tarjeta:        ["Tarjeta:",        "Tarjeta Manga:"],
    Transferencias: ["Transferencias:", "Transferencias Manga:"],
  };
  // Color de encabezado de bloque por método
  const BLOCK_COLORS: Record<string, string> = {
    Efectivo: "33BB66", Tarjeta: "3388CC", Transferencias: "CC9944",
  };

  let r = FIRST_TABLE_ROW + 2;
  const totalUtilRows: number[] = [];
  const totalCostoRows: number[] = [];
  const totalVentaRows: number[] = [];

  const egresos = p.supplyMovements.reduce((a, m) => a + (m.amount || 0), 0);
  let egRow = -1;

  tabs.forEach((t, i) => {
    if (i > 0) {
      for (let c = 1; c <= totalCols; c++) sh.set(r, c, "", { fill: sepDark });
      r++;
    }

    const [nameReg, nameManga] = NAMES[t.name] ?? [`${t.name}:`, `${t.name} Manga:`];
    const isCash = t.name === "Efectivo";

    // Encabezado de bloque (columna 2 en color)
    const blkHdr: CellStyle = { font: font({ sz: 9, bold: true, color: "FFFFFF" }), fill: fill(BLOCK_COLORS[t.name] ?? "888888"), alignment: align("left") };
    sh.set(r, 2, t.name.toUpperCase(), blkHdr);
    sh.set(r, costoCol, "", { fill: fill(BLOCK_COLORS[t.name] ?? "888888") });
    sh.set(r, ventaCol, "", { fill: fill(BLOCK_COLORS[t.name] ?? "888888") });
    sh.set(r, utilCol,  "", { fill: fill(BLOCK_COLORS[t.name] ?? "888888") });
    sh.height(r, 16);
    r++;

    const regTotals  = t.regularTotals;
    const mangTotals = t.mangaTotals;
    const hasManga   = Object.keys(mangTotals).length > 0;

    // Fila regular — referencia cross-tab a la pestaña del método
    sh.set(r, 2, nameReg, label);
    const regVenta = regTotals[t.ventaKey];
    const regCosto = regTotals["costo"];
    const regUtil  = regTotals["util"];
    if (regVenta) sh.setF(r, ventaCol, xref(t.name, regVenta.ref), regVenta.value, money);
    if (canViewCost) {
      if (regCosto) sh.setF(r, costoCol, xref(t.name, regCosto.ref), regCosto.value, money);
      if (regUtil)  sh.setF(r, utilCol,  xref(t.name, regUtil.ref),  regUtil.value,  green);
    }
    const regRow = r;
    r++;

    // Fila manga (si existe) — referencia cross-tab a la pestaña del método
    let mangaRow = -1;
    if (hasManga) {
      sh.set(r, 2, nameManga, label);
      const mVenta = mangTotals[t.ventaKey];
      const mCosto = mangTotals["costo"];
      const mUtil  = mangTotals["util"];
      if (mVenta) sh.setF(r, ventaCol, xref(t.name, mVenta.ref), mVenta.value, money);
      if (canViewCost) {
        if (mCosto) sh.setF(r, costoCol, xref(t.name, mCosto.ref), mCosto.value, money);
        if (mUtil)  sh.setF(r, utilCol,  xref(t.name, mUtil.ref),  mUtil.value,  green);
      }
      mangaRow = r;
      r++;
    }

    // Fila Preventas (si este método tiene abonos/liquidaciones en el rango) —
    // referencia cross-tab a "TOTAL PREVENTAS" de la sub-tabla 3 de este método.
    let presaleRow = -1;
    if (t.presaleTotals) {
      sh.set(r, 2, "Preventas:", label);
      sh.setF(r, ventaCol, xref(t.name, t.presaleTotals.apartado.ref), t.presaleTotals.apartado.value, money);
      if (canViewCost) {
        if (t.presaleTotals.costoNeto) sh.setF(r, costoCol, xref(t.name, t.presaleTotals.costoNeto.ref), t.presaleTotals.costoNeto.value, money);
        if (t.presaleTotals.utilidad)  sh.setF(r, utilCol,  xref(t.name, t.presaleTotals.utilidad.ref),  t.presaleTotals.utilidad.value,  green);
      }
      presaleRow = r;
      r++;
    }

    // Separador antes del subtotal
    for (let c = 1; c <= totalCols; c++) sh.set(r, c, "", { fill: sep });
    r++;

    // Subtotal del método
    const subRows = [regRow, ...(mangaRow >= 0 ? [mangaRow] : []), ...(presaleRow >= 0 ? [presaleRow] : [])];
    const subVenta = (regTotals[t.ventaKey]?.value ?? 0) + (hasManga ? (mangTotals[t.ventaKey]?.value ?? 0) : 0) + (t.presaleTotals?.apartado.value ?? 0);
    const subCosto = (regTotals["costo"]?.value ?? 0) + (hasManga ? (mangTotals["costo"]?.value ?? 0) : 0) + (t.presaleTotals?.costoNeto?.value ?? 0);
    const subUtil  = (regTotals["util"]?.value  ?? 0) + (hasManga ? (mangTotals["util"]?.value  ?? 0) : 0) + (t.presaleTotals?.utilidad?.value ?? 0);
    const subLabel = canViewCost ? `$ ` : `$ `;

    sh.set(r, 2, subLabel, labelLeft);
    sh.setF(r, ventaCol, subRows.map((x) => cellRef(x, ventaCol)).join("+"), subVenta, money);
    if (canViewCost) {
      sh.setF(r, costoCol, subRows.map((x) => cellRef(x, costoCol)).join("+"), subCosto, money);
      sh.setF(r, utilCol,  subRows.map((x) => cellRef(x, utilCol)).join("+"),  subUtil,  green);
    }
    const subtotalRow = r;
    totalVentaRows.push(r);
    totalCostoRows.push(r);
    r++;

    // Egresos y Total Efectivo — solo para el bloque de Efectivo
    if (isCash) {
      egRow = r;
      sh.set(r, 2, "Egresos", red);
      sh.set(r, utilCol, egresos > 0 ? egresos : 0, egresoMoney);
      sh.set(r, ventaCol, "", {});
      if (canViewCost) sh.set(r, costoCol, "", {});
      r++;

      const cashUtil = subUtil - egresos;
      const totalEfRow = r;
      sh.set(r, 2, "Total efectivo", { font: font({ sz: 10, bold: true, color: "333333" }), alignment: align("left") });
      // Solo la columna de Utilidad (igual que el reference): Subtotal util − Egresos
      if (canViewCost) {
        sh.setF(r, utilCol,
          `${cellRef(subtotalRow, utilCol)}-${cellRef(egRow, utilCol)}`,
          cashUtil,
          { ...green, fill: fill("E8F5E9") },
        );
      } else {
        sh.setF(r, ventaCol,
          `${cellRef(subtotalRow, ventaCol)}-${cellRef(egRow, utilCol)}`,
          subVenta - egresos,
          { ...money, fill: fill("E8F5E9") },
        );
      }
      totalUtilRows.push(totalEfRow); // para que TOTALES FINALES sume este row
      totalCostoRows.push(subtotalRow); // costo = subtotal (no cambia con egresos)
      r++;
    } else {
      totalUtilRows.push(subtotalRow);
    }
  });

  // Separador final
  for (let c = 1; c <= totalCols; c++) sh.set(r, c, "", { fill: sepDark });
  r++;

  // TOTALES FINALES — t.result.totals ya trae Ventas + Preventas + Manga
  // combinados (el "TOTAL FINAL {TAB}" de cada pestaña), no hay que sumar
  // t.presaleTotals aparte aquí (se contaría dos veces).
  const finalStyle: CellStyle = { ...money, fill: fill("B8732E"), font: font({ sz: 11, bold: true, color: "FFFFFF" }) };
  const totalVenta = tabs.reduce((a, t) => a + (t.result.totals[t.ventaKey]?.value ?? 0), 0);
  const totalCosto = tabs.reduce((a, t) => a + (t.result.totals["costo"]?.value ?? 0), 0);
  const totalUtil  = tabs.reduce((a, t) => a + (t.result.totals["util"]?.value ?? 0), 0) - egresos;

  sh.set(r, 2, "TOTALES FINALES:", { font: font({ sz: 11, bold: true, color: "FFFFFF" }), fill: fill("B8732E"), alignment: align("right") });
  sh.set(r, 1, "", { fill: fill("B8732E") });
  sh.setF(r, ventaCol, totalVentaRows.map((x) => cellRef(x, ventaCol)).join("+"), totalVenta, finalStyle);
  if (canViewCost) {
    sh.setF(r, costoCol, totalCostoRows.map((x) => cellRef(x, costoCol)).join("+"), totalCosto, finalStyle);
    sh.setF(r, utilCol,  totalUtilRows.map((x)  => cellRef(x, utilCol)).join("+"),  totalUtil,  { ...finalStyle, fill: fill("8B3A00") });
  }
  sh.height(r, 24);
  r++;

  // Lista de egresos a la derecha del resumen principal
  const egListCol = totalCols + 2; // columna donde empieza la lista (deja 1 col de separación)
  const egListMoneyCol = egListCol + 1;
  const egListCatCol   = egListCol + 2;
  const egLabelStyle: CellStyle = { font: font({ sz: 10, bold: true, color: EGRESO }), alignment: align("right") };
  const egAmtStyle: CellStyle   = { numFmt: MONEY_FMT, font: font({ sz: 10, bold: true, color: EGRESO }), alignment: align("left") };
  const egCatStyle: CellStyle   = { font: font({ sz: 9, color: EGRESO }), alignment: align("left") };
  let er = FIRST_TABLE_ROW; // fila de inicio a la derecha
  p.supplyMovements.forEach((m, mi) => {
    if (mi === 0) sh.set(er, egListCol, "Egresos:", egLabelStyle);
    sh.set(er, egListMoneyCol, m.amount, egAmtStyle);
    const cat = m.supply?.category ?? m.supply?.name ?? "";
    if (cat) sh.set(er, egListCatCol, `(${cat})`, egCatStyle);
    sh.height(er, 18);
    er++;
  });
  if (p.supplyMovements.length > 0) {
    sh.set(er, egListCol, "Total Egreso:", egLabelStyle);
    sh.set(er, egListMoneyCol, egresos, egAmtStyle);
    sh.height(er, 18);
    er++;
    er++; // fila en blanco antes de TOTAL FINAL
    sh.set(er, egListCol, "TOTAL FINAL:", { font: font({ sz: 10, bold: true, color: "333333" }), alignment: align("right") });
    sh.set(er, egListMoneyCol, totalUtil, { numFmt: MONEY_FMT, font: font({ sz: 10, bold: true, color: "333333" }), fill: fill("F5DEB3"), alignment: align("left") });
  }
  sh.width(egListCol, 14);
  sh.width(egListMoneyCol, 12);
  sh.width(egListCatCol, 16);

  // Tablas de detalle (descuentos/aumentos/egresos) debajo del resumen
  const blocksTop = r + STACK_GAP;
  const cashEnd = drawMethodAdjustments(sh, blocksTop, leftL, groups, "cash", "EFECTIVO", 1);
  const egTop = cashEnd + STACK_GAP + 1;
  drawEgresos(sh, egTop, leftL, p.supplyMovements, p.stores, 6);
  const cardEnd = drawMethodAdjustments(sh, blocksTop, bottomLayout(rightCol, BLOCK_WIDTH), groups, "card", "TARJETA", 2);
  drawMethodAdjustments(sh, cardEnd + STACK_GAP + 1, bottomLayout(rightCol, BLOCK_WIDTH), groups, "transfer", "TRANSFERENCIAS", 3);
  blockWidths(sh, 1);
  blockWidths(sh, rightCol);
}

export function addVentasSheets(workbook: Workbook, p: ReportExportParams): void {
  const { canViewCost, ivaRate } = p;
  const groups = p.groupedProducts.filter((g) => !isPresale(g));

  const resumen = createSheet(workbook.addWorksheet("Resumen"));

  // Efectivo: regulares arriba + Manga abajo + Preventas abonadas en efectivo + TOTAL FINAL EFECTIVO
  const cashT = methodTable(1, isCashLike, "Efectivo", "TOTAL EFECTIVO", canViewCost);
  const cash = productSheet(workbook, p, "Efectivo",
    { main: " 1. VENTAS EN EFECTIVO", manga: "1. EFECTIVO — MANGA NACIONAL", presale: "1. EFECTIVO — APARTADOS Y PREVENTAS" },
    ["33BB66", "55CC77"], cashT, withMethod(groups, isCashLike), "venta", p.presaleRowsByMethod.cash);
  const retCol = tableWidth(cashT) + GAP + 1;
  drawReturns(cash.sh, groups, retCol);
  tableWidths(cash.sh, retCol, RETURN_COLS, 48);

  // Tarjeta: regulares arriba + Manga abajo + Preventas abonadas con tarjeta + TOTAL FINAL TARJETA
  const card = productSheet(workbook, p, "Tarjeta",
    { main: " 2. DESGLOSE DE COBROS CON TARJETA", manga: "2. TARJETA — MANGA NACIONAL", presale: "2. TARJETA — APARTADOS Y PREVENTAS" },
    ["2266BB", "4488DD"], cardTable(1, canViewCost, ivaRate), withMethod(groups, isCardMethod), "neto", p.presaleRowsByMethod.card);

  // Transferencias: regulares arriba + Manga abajo + Preventas abonadas por transferencia + TOTAL FINAL TRANSFERENCIAS
  const transfer = productSheet(workbook, p, "Transferencias",
    { main: " 3. TRANSFERENCIAS / DEPÓSITOS", manga: "3. TRANSFERENCIAS — MANGA NACIONAL", presale: "3. TRANSFERENCIAS — APARTADOS Y PREVENTAS" },
    ["119999", "33BBBB"], methodTable(1, isTransferMethod, "Transferencia", "TOTAL TRANSFERENCIAS", canViewCost),
    withMethod(groups, isTransferMethod), "venta", p.presaleRowsByMethod.transfer);

  // Preventas: última pestaña — 3 tablas separadas por método de pago
  // (Efectivo · Tarjeta · Transferencias), cada una agrupada por producto.
  const pre = createSheet(workbook.addWorksheet("Preventas"));
  drawTitle(pre, p, PRESALE_FOLIO_COLS);
  const byMethod = (m: "cash" | "card" | "transfer") =>
    sortPresaleFolioRows(p.presaleFolioRows.filter((r) => r.method === m));
  let preRow = FIRST_TABLE_ROW;
  preRow = drawPresaleFolios(pre, byMethod("cash"), 1, preRow, " 1. EFECTIVO — APARTADOS Y PREVENTAS") + STACK_GAP;
  preRow = drawPresaleFolios(pre, byMethod("card"), 1, preRow, " 2. TARJETA — APARTADOS Y PREVENTAS") + STACK_GAP;
  preRow = drawPresaleFolios(pre, byMethod("transfer"), 1, preRow, " 3. TRANSFERENCIAS — APARTADOS Y PREVENTAS") + STACK_GAP;
  // Pago con método no identificado (no debería pasar, pero no se descarta en silencio).
  const otherRows = sortPresaleFolioRows(p.presaleFolioRows.filter((r) => r.method === "other"));
  if (otherRows.length > 0) drawPresaleFolios(pre, otherRows, 1, preRow, " 4. OTRO MÉTODO — APARTADOS Y PREVENTAS");
  tableWidths(pre, 1, PRESALE_FOLIO_COLS);

  drawTitle(resumen, p, BLOCK_WIDTH * 2 + GAP);
  drawResumen(resumen, p, groups, [cash, card, transfer]);
}
