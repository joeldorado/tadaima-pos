// Modelo de una hoja de Excel SIN ExcelJS: celdas, fórmulas, combinaciones,
// anchos y altos. El armado del reporte (excelVentasModel) produce este modelo
// y se prueba en node; `writeSheetModel` es el único punto que toca ExcelJS.
//
// Las fórmulas van estructuradas (no como texto) para poder calcular su valor
// desde las mismas celdas del modelo: cada fórmula se escribe con su resultado
// guardado, porque el celular y las vistas previas no recalculan.
import type { Worksheet } from "exceljs";

export interface CellRef {
  row: number;
  col: number;
}

export type FormulaSpec =
  | { op: "sum"; col: number; r1: number; r2: number }
  | { op: "add"; refs: CellRef[] }
  /** refs[0] − refs[1] − refs[2] … */
  | { op: "sub"; refs: CellRef[] }
  | { op: "mulConst"; ref: CellRef; k: number };

export interface CellStyle {
  /** `color` y `fill` en ARGB ("FF1D4ED8"). */
  font?: { name?: string; size?: number; bold?: boolean; italic?: boolean; color?: string };
  fill?: string;
  align?: { horizontal?: "left" | "center" | "right"; vertical?: "top" | "middle"; wrapText?: boolean };
  numFmt?: string;
}

export type CellValue = string | number | FormulaSpec;

export interface ModelCell extends CellRef {
  value: CellValue;
  style?: CellStyle;
}

export interface MergeRange {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface SheetModel {
  cells: ModelCell[];
  merges: MergeRange[];
  colWidths: Record<number, number>;
  rowHeights: Record<number, number>;
}

/** 1 → "A", 27 → "AA". */
export function colLetter(col: number): string {
  let n = col, letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export const cellAddress = (ref: CellRef): string => `${colLetter(ref.col)}${ref.row}`;

export const isFormula = (value: CellValue): value is FormulaSpec => typeof value === "object";

/** Texto de la fórmula como lo espera Excel (sin "=" inicial). */
export function formulaText(f: FormulaSpec): string {
  switch (f.op) {
    case "sum": {
      const col = colLetter(f.col);
      return f.r1 === f.r2 ? `SUM(${col}${f.r1})` : `SUM(${col}${f.r1}:${col}${f.r2})`;
    }
    case "add": return f.refs.map(cellAddress).join("+");
    case "sub": return f.refs.map(cellAddress).join("-");
    // toFixed evita literales como 0.14000000000000001.
    case "mulConst": return `${cellAddress(f.ref)}*${Number(f.k.toFixed(4))}`;
  }
}

/** Celdas de las que depende una fórmula (un SUM se expande a cada fila). */
export function formulaRefs(f: FormulaSpec): CellRef[] {
  switch (f.op) {
    case "sum": return Array.from({ length: f.r2 - f.r1 + 1 }, (_, i) => ({ row: f.r1 + i, col: f.col }));
    case "add":
    case "sub": return f.refs;
    case "mulConst": return [f.ref];
  }
}

export function cellMap(model: SheetModel): Map<string, ModelCell> {
  return new Map(model.cells.map(c => [cellAddress(c), c]));
}

/**
 * Valor de cada fórmula, calculado desde las celdas del modelo (un texto o una
 * celda inexistente cuenta como 0). Es lo que Excel mostraría al recalcular.
 */
export function resolveResults(model: SheetModel): Map<string, number> {
  const cells = cellMap(model);
  const results = new Map<string, number>();
  const visiting = new Set<string>();

  const valueAt = (ref: CellRef): number => {
    const addr = cellAddress(ref);
    const value = cells.get(addr)?.value;
    if (typeof value === "number") return value;
    if (value === undefined || !isFormula(value)) return 0;
    const known = results.get(addr);
    if (known !== undefined) return known;
    if (visiting.has(addr)) return 0; // referencia circular: no debería existir
    visiting.add(addr);
    const refs = formulaRefs(value).map(valueAt);
    const raw = value.op === "mulConst"
      ? (refs[0] ?? 0) * value.k
      : value.op === "sub"
        ? refs.slice(1).reduce((acc, n) => acc - n, refs[0] ?? 0)
        : refs.reduce((acc, n) => acc + n, 0);
    visiting.delete(addr);
    const result = Math.round(raw * 1e6) / 1e6;
    results.set(addr, result);
    return result;
  };

  for (const cell of model.cells) {
    if (isFormula(cell.value)) valueAt(cell);
  }
  return results;
}

/** Acumula celdas, combinaciones y tamaños para armar un SheetModel. */
export class SheetBuilder {
  private readonly cells = new Map<string, ModelCell>();
  private readonly merges: MergeRange[] = [];
  private readonly colWidths: Record<number, number> = {};
  private readonly rowHeights: Record<number, number> = {};

  set(row: number, col: number, value: CellValue, style?: CellStyle): CellRef {
    this.cells.set(cellAddress({ row, col }), style ? { row, col, value, style } : { row, col, value });
    return { row, col };
  }

  merge(r1: number, c1: number, r2: number, c2: number): void {
    if (r1 !== r2 || c1 !== c2) this.merges.push({ r1, c1, r2, c2 });
  }

  /** Las filas se comparten entre bloques lado a lado: se queda el alto mayor. */
  rowHeight(row: number, height: number): void {
    this.rowHeights[row] = Math.max(this.rowHeights[row] ?? 0, height);
  }

  colWidth(col: number, width: number): void {
    this.colWidths[col] = width;
  }

  build(): SheetModel {
    return {
      cells: [...this.cells.values()],
      merges: [...this.merges],
      colWidths: { ...this.colWidths },
      rowHeights: { ...this.rowHeights },
    };
  }
}

/** Pinta el modelo en una hoja de ExcelJS. */
export function writeSheetModel(sheet: Worksheet, model: SheetModel): void {
  const results = resolveResults(model);

  for (const c of model.cells) {
    const cell = sheet.getCell(c.row, c.col);
    if (isFormula(c.value)) {
      const result = results.get(cellAddress(c)) ?? 0;
      cell.value = { formula: formulaText(c.value), result: Number.isFinite(result) ? result : 0 };
    } else {
      cell.value = typeof c.value === "number" && !Number.isFinite(c.value) ? 0 : c.value;
    }
    const style = c.style;
    if (!style) continue;
    if (style.font) {
      const { color, ...font } = style.font;
      cell.font = color ? { ...font, color: { argb: color } } : font;
    }
    if (style.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
    if (style.align) cell.alignment = style.align;
    if (style.numFmt) cell.numFmt = style.numFmt;
  }

  // Después de los estilos: al combinar, ExcelJS copia el estilo de la primera celda.
  for (const m of model.merges) sheet.mergeCells(m.r1, m.c1, m.r2, m.c2);
  for (const [col, width] of Object.entries(model.colWidths)) sheet.getColumn(Number(col)).width = width;
  for (const [row, height] of Object.entries(model.rowHeights)) sheet.getRow(Number(row)).height = height;
}
