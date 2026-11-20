import type { InventoryMovement, WarehouseCurrentStock } from "@tadaima/api";
import { toLocalYmd } from "./date";

/**
 * Historial de stock por producto (2026-11-19, pedido de Tadaima Tijuana:
 * «ver cuánto entra y sale de cada producto, por si una entrada se capturó mal
 * o algo no se descontó»).
 *
 * No hay columna de saldo en `inventory_movements`: el saldo después de cada
 * movimiento se reconstruye HACIA ATRÁS desde el stock actual de cada almacén
 * (`inventory.quantity`). Por eso solo hacen falta los movimientos más nuevos
 * que el que se quiere ver, nunca los más viejos.
 *
 * Es aproximado en historia vieja o importada: el import y los ajustes de antes
 * de 2026-10-29 pudieron cambiar stock sin dejar movimiento. Los ajustes dejan
 * en la nota cuánto había y cuánto quedó («Ajuste manual: 10 → 8»); cuando eso
 * no cuadra con la cuenta, el renglón se marca y la cuenta sigue desde lo que
 * dice el ajuste (lo que de verdad había en ese momento).
 */

/** Diferencia menor a esto se considera igual (cantidades con decimales). */
const EPSILON = 0.0001;

export type MovementTone = "in" | "out" | "zero";

export interface StockHistoryRow {
  movement: InventoryMovement;
  /** Cambio real al stock con signo. */
  delta: number;
  tone: MovementTone;
  label: string;
  /** Saldo del almacén después del movimiento; null sin almacén. */
  balanceAfter: number | null;
  /**
   * Solo ajustes: lo que la nota dice que quedó cuando NO cuadra con la cuenta
   * hacia atrás desde hoy. `balanceAfter` toma ese valor y `computedAfter` guarda
   * el de la cuenta; la diferencia cambió sin movimiento después de esta fecha.
   */
  computedAfter: number | null;
}

const BASE_LABELS: Record<string, string> = {
  entrada: "Entrada",
  venta: "Venta",
  ajuste: "Ajuste",
  transferencia: "Movimiento entre almacenes",
  devolucion: "Cancelación / devolución",
  preventa: "Preventa",
  preventa_cancelada: "Preventa cancelada",
  apartado: "Apartado",
  apartado_cancelado: "Apartado cancelado",
};

/** Nombre legible del movimiento (usa la referencia para afinar transferencias). */
export function movementLabel(type: string, reference: string | null, delta: number): string {
  const ref = (reference ?? "").toUpperCase();
  if (type === "transferencia") {
    if (ref.startsWith("PAQ-")) return delta >= 0 ? "Paquete: entra" : "Paquete: sale";
    if (ref.startsWith("TRASLADO-")) return delta >= 0 ? "Traslado recibido" : "Traslado enviado";
    if (ref.startsWith("MOV-")) return delta >= 0 ? "Llegó de otro almacén" : "Pasó a otro almacén";
  }
  if (type === "devolucion" && ref.startsWith("BORRADO-CORTE-")) return "Corte borrado (regresa)";
  return BASE_LABELS[type] ?? type;
}

/** «Ajuste manual: 10 → 8» (o «10 -> 8») ⇒ {before:10, after:8}. Espejo de ActivityFeedService::parseBeforeAfter. */
export function parseAdjustmentNote(notes: string | null | undefined): { before: number; after: number } | null {
  if (!notes) return null;
  const m = /(-?\d+(?:[.,]\d+)?)\s*(?:→|->)\s*(-?\d+(?:[.,]\d+)?)/u.exec(notes);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  return { before: Number(m[1].replace(",", ".")), after: Number(m[2].replace(",", ".")) };
}

function toneOf(delta: number): MovementTone {
  if (delta > EPSILON) return "in";
  if (delta < -EPSILON) return "out";
  return "zero";
}

/** Más nuevo primero; el id desempata (un traslado deja 2 renglones a la misma hora). */
function compareNewestFirst(a: InventoryMovement, b: InventoryMovement): number {
  const ta = a.created_at ? Date.parse(a.created_at) : 0;
  const tb = b.created_at ? Date.parse(b.created_at) : 0;
  return tb - ta || b.id - a.id;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Arma los renglones del Historial con el saldo de su almacén después de cada
 * movimiento. `movements` puede venir en cualquier orden; deben ser TODOS los
 * movimientos más nuevos que el más viejo que se quiere ver (de esos almacenes).
 * Un almacén sin fila en `currentStock` arranca en 0.
 */
export function buildStockHistory(
  movements: readonly InventoryMovement[],
  currentStock: readonly WarehouseCurrentStock[],
): StockHistoryRow[] {
  const running = new Map<number, number>(currentStock.map(s => [s.warehouse_id, Number(s.quantity) || 0]));

  return [...movements].sort(compareNewestFirst).map((movement): StockHistoryRow => {
    const delta = Number(movement.stock_delta ?? movement.quantity) || 0;
    const base = { movement, delta, tone: toneOf(delta), label: movementLabel(movement.type, movement.reference, delta) };
    const wh = movement.warehouse_id;
    if (wh == null) return { ...base, balanceAfter: null, computedAfter: null };

    const computed = round(running.get(wh) ?? 0);
    const note = movement.type === "ajuste" ? parseAdjustmentNote(movement.notes) : null;
    if (note && Math.abs(note.after - computed) > EPSILON) {
      // La cuenta desde hoy no llega a lo que el ajuste dejó: algo cambió sin
      // movimiento después. Se sigue desde lo que había antes del ajuste.
      running.set(wh, note.before);
      return { ...base, balanceAfter: note.after, computedAfter: computed };
    }
    running.set(wh, round(computed - delta));
    return { ...base, balanceAfter: computed, computedAfter: null };
  });
}

/** ¿El movimiento cae en el rango de días de negocio (America/Tijuana)? Extremos opcionales. */
export function isInLocalRange(createdAt: string | null, from?: string, to?: string): boolean {
  if (!createdAt) return !from && !to;
  const day = toLocalYmd(new Date(createdAt));
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export interface StockHistoryTotals {
  entradas: number;
  salidas: number;
  neto: number;
}

/** Exhibición ↔ Bodega de la misma tienda (`MOV-`): no entra ni sale de la tienda. */
export function isInternalMove(m: InventoryMovement): boolean {
  return m.type === "transferencia" && (m.reference ?? "").toUpperCase().startsWith("MOV-");
}

/**
 * Piezas que entraron y salieron en los renglones dados. Con `skipInternalMoves`
 * (vista de todos los almacenes) el paso Exhibición ↔ Bodega no cuenta: saldría
 * como entrada y salida a la vez sin que la tienda gane ni pierda nada.
 */
export function summarizeStockHistory(
  rows: readonly StockHistoryRow[],
  options: { skipInternalMoves?: boolean } = {},
): StockHistoryTotals {
  const counted = options.skipInternalMoves ? rows.filter(r => !isInternalMove(r.movement)) : rows;
  const entradas = counted.reduce((acc, r) => (r.delta > 0 ? acc + r.delta : acc), 0);
  const salidas = counted.reduce((acc, r) => (r.delta < 0 ? acc - r.delta : acc), 0);
  return { entradas: round(entradas), salidas: round(salidas), neto: round(entradas - salidas) };
}
