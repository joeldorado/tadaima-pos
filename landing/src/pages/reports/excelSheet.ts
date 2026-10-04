// Helpers de hoja (ExcelJS) para el Excel de Ventas / corte de caja. Réplica de
// los de la app (tadaima-app-pos/src/components/reportes/excelSheet.ts) para que
// los dos Excel salgan iguales: coordenadas 1-indexadas, fórmulas con el valor ya
// calculado (visores que no recalculan, como el iPhone, muestran ese valor).
import type { Alignment, Fill, Font, Style, Worksheet } from "exceljs";

export type CellStyle = Partial<Style>;

export const MONEY_FMT = '"$"#,##0.00';

export const GREEN = "009944";
export const GRAY = "444444";
export const RED = "FF2200";
export const AMBER = "F59E0B";
export const EGRESO = "CC2200";

export const fill = (rgb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${rgb}` } });

export const font = (opts: { sz?: number; bold?: boolean; italic?: boolean; color?: string }): Partial<Font> => ({
  name: "Arial",
  size: opts.sz ?? 9,
  bold: !!opts.bold,
  italic: !!opts.italic,
  ...(opts.color ? { color: { argb: `FF${opts.color}` } } : {}),
});

export const align = (
  horizontal: "left" | "center" | "right",
  vertical: "top" | "middle" = "middle",
  wrapText = false,
): Partial<Alignment> => ({ horizontal, vertical, wrapText });

/** "A1" de una celda (fila/columna 1-indexadas). */
export function cellRef(r: number, c: number): string {
  let col = "";
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) col = String.fromCharCode(65 + ((n - 1) % 26)) + col;
  return `${col}${r}`;
}

// Excel acepta máx. 255 argumentos por SUM: partimos en bloques y los sumamos.
const SUM_ARGS_PER_CALL = 200;

/** SUM de la columna `c` solo en `rows` (agrupa filas contiguas en rangos). Sin '=' inicial. */
export function sumFormula(c: number, rows: readonly number[]): string {
  if (rows.length === 0) return "0";
  const sorted = [...rows].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0]!;
  for (let i = 1; i <= sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]! + 1) continue;
    const end = sorted[i - 1]!;
    parts.push(start === end ? cellRef(start, c) : `${cellRef(start, c)}:${cellRef(end, c)}`);
    start = sorted[i]!;
  }
  const calls: string[] = [];
  for (let i = 0; i < parts.length; i += SUM_ARGS_PER_CALL) calls.push(`SUM(${parts.slice(i, i + SUM_ARGS_PER_CALL).join(",")})`);
  return calls.join("+");
}

/** Filas consecutivas [from, to]. */
export const rowRange = (from: number, to: number): number[] =>
  to < from ? [] : Array.from({ length: to - from + 1 }, (_, i) => from + i);

export interface SheetBuilder {
  set: (r: number, c: number, v: string | number, s?: CellStyle) => void;
  /** Celda con fórmula; `cached` es el valor ya calculado. */
  setF: (r: number, c: number, formula: string, cached: number, s?: CellStyle) => void;
  merge: (r: number, c1: number, c2: number) => void;
  height: (r: number, pt: number) => void;
  width: (c: number, w: number) => void;
}

export function createSheet(ws: Worksheet): SheetBuilder {
  const style = (r: number, c: number, s?: CellStyle) => {
    if (!s) return;
    const cell = ws.getCell(r, c);
    if (s.font) cell.font = s.font;
    if (s.fill) cell.fill = s.fill;
    if (s.alignment) cell.alignment = s.alignment;
    if (s.numFmt) cell.numFmt = s.numFmt;
  };
  return {
    set(r, c, v, s) {
      ws.getCell(r, c).value = v;
      style(r, c, s);
    },
    setF(r, c, formula, cached, s) {
      ws.getCell(r, c).value = { formula, result: cached };
      style(r, c, s);
    },
    merge(r, c1, c2) {
      if (c2 > c1) ws.mergeCells(r, c1, r, c2);
    },
    height(r, pt) {
      ws.getRow(r).height = pt;
    },
    width(c, w) {
      ws.getColumn(c).width = w;
    },
  };
}

export function sectionHeader(sh: SheetBuilder, r: number, c1: number, c2: number, title: string, bg: string): void {
  sh.merge(r, c1, c2);
  sh.set(r, c1, title, { font: font({ sz: 10, bold: true, color: "FFFFFF" }), fill: fill(bg), alignment: align("center") });
  sh.height(r, 25);
}

export function subHeader(sh: SheetBuilder, r: number, c1: number, headers: readonly string[], bg: string): void {
  headers.forEach((h, i) => sh.set(r, c1 + i, h, { font: font({ bold: true, color: "FFFFFF" }), fill: fill(bg), alignment: align("center", "middle", true) }));
  sh.height(r, 20);
}

const TOTAL_FILL = fill("EDEDED");
export const totalLabel: CellStyle = { font: font({ bold: true, color: "111111" }), fill: TOTAL_FILL, alignment: align("left") };
export const totalQty: CellStyle = { font: font({ bold: true, color: "111111" }), fill: TOTAL_FILL, alignment: align("center") };
export const totalMoney = (color: string): CellStyle => ({ numFmt: MONEY_FMT, font: font({ bold: true, color }), fill: TOTAL_FILL, alignment: align("right") });
export const cellMoney = (color: string, bold = false): CellStyle => ({ numFmt: MONEY_FMT, font: font({ bold, color }), alignment: align("right") });
export const cellQty: CellStyle = { alignment: align("center") };
export const cellName: CellStyle = { alignment: align("left", "middle", true) };
