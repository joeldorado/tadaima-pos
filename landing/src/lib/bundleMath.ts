import type { Bundle, BundleSource, BundleStoreAvailability } from "@tadaima/api";

/**
 * Aritmética pura de Paquetes: cuántos se pueden armar con el stock que hay,
 * qué componente limita, precio sugerido y ahorro. Sin React ni API — se usa
 * en el asistente (vista previa local mientras llega la del server) y en los
 * modales de armar/desarmar. El server SIEMPRE recalcula al armar; esto es
 * solo para pintar la pantalla al instante.
 */

export interface BundleLine {
  productId: number;
  /** Piezas de este producto por paquete. */
  quantity: number;
}

/** Stock de un producto por id (Exhibición, Bodega o la suma — según el caso). */
export type StockByProduct = ReadonlyMap<number, number>;

export type AvailabilityTone = "green" | "amber" | "red";

/** Hasta aquí (inclusive) la disponibilidad se pinta en ámbar: "quedan pocos". */
export const LOW_BUILDABLE = 2;

/** Paquetes que alcanza a armar UNA línea con su stock; cantidad inválida = 0. */
function lineBuildable(line: BundleLine, stock: StockByProduct): number {
  if (line.quantity <= 0) return 0;
  const available = stock.get(line.productId) ?? 0;
  return Math.max(Math.floor(available / line.quantity), 0);
}

/**
 * Máximo de paquetes armables = el mínimo entre componentes de
 * floor(stock / piezas por paquete). Sin componentes, sin stock o con una
 * cantidad ≤ 0 → 0.
 */
export function maxBuildable(lines: readonly BundleLine[], stock: StockByProduct): number {
  if (lines.length === 0) return 0;
  return lines.reduce((min, line) => Math.min(min, lineBuildable(line, stock)), Number.POSITIVE_INFINITY);
}

/**
 * Igual que `maxBuildable` pero cada componente toma de donde diga `sources`:
 * 'store' solo Exhibición, 'bodega' solo Bodega, 'auto' (o sin entrada) ambas.
 */
export function maxBuildableWithSources(
  lines: readonly BundleLine[],
  stockExh: StockByProduct,
  stockBod: StockByProduct,
  sources: ReadonlyMap<number, BundleSource>,
): number {
  const effective = new Map<number, number>();
  for (const line of lines) {
    const exh = stockExh.get(line.productId) ?? 0;
    const bod = stockBod.get(line.productId) ?? 0;
    const source = sources.get(line.productId) ?? "auto";
    const available = source === "store" ? exh : source === "bodega" ? bod : exh + bod;
    effective.set(line.productId, available);
  }
  return maxBuildable(lines, effective);
}

/** Ids de los componentes que son cuello de botella (su tope = el máximo global). */
export function limitingComponents(lines: readonly BundleLine[], stock: StockByProduct): number[] {
  if (lines.length === 0) return [];
  const max = maxBuildable(lines, stock);
  return lines
    .filter((line) => lineBuildable(line, stock) === max)
    .map((line) => line.productId);
}

export interface ComponentUsage {
  productId: number;
  quantity: number;
  /** Piezas que consume armar `buildQty` paquetes. */
  needed: number;
  available: number;
  enough: boolean;
}

/** Cuánto consume cada componente al armar `buildQty` paquetes y si alcanza. */
export function componentUsage(
  lines: readonly BundleLine[],
  stock: StockByProduct,
  buildQty: number,
): ComponentUsage[] {
  const qty = Math.max(buildQty, 0);
  return lines.map((line) => {
    const needed = line.quantity * qty;
    const available = stock.get(line.productId) ?? 0;
    return { productId: line.productId, quantity: line.quantity, needed, available, enough: available >= needed };
  });
}

/** Suma de precio × piezas de los componentes (2 decimales). Sin precio = $0. */
export function priceSum(lines: readonly BundleLine[], priceByProduct: ReadonlyMap<number, number>): number {
  const total = lines.reduce((acc, line) => acc + (priceByProduct.get(line.productId) ?? 0) * line.quantity, 0);
  return Math.round(total * 100) / 100;
}

/**
 * Porcentaje de ahorro del paquete frente a comprar las piezas sueltas.
 * null si no hay suma de referencia; negativo si el paquete cuesta MÁS.
 */
export function savingsPct(bundlePrice: number, sum: number): number | null {
  if (sum <= 0) return null;
  return Math.round((1 - bundlePrice / sum) * 100);
}

/** Semáforo de disponibilidad: 0 → rojo; 1..LOW_BUILDABLE → ámbar; más → verde. */
export function availabilityTone(max: number): AvailabilityTone {
  if (max <= 0) return "red";
  if (max <= LOW_BUILDABLE) return "amber";
  return "green";
}

/** Disponibilidad de UNA tienda (null = tienda no elegida o sin inventario ahí). */
export function availabilityFor(
  bundle: Pick<Bundle, "availability">,
  storeId: number | null,
): BundleStoreAvailability | null {
  if (storeId == null) return null;
  return bundle.availability.find((entry) => entry.store_id === storeId) ?? null;
}

/** "Macro: puedes armar 3 · Centro: 1" — resumen de una línea para la tarjeta. */
export function buildableSummary(availability: readonly BundleStoreAvailability[]): string {
  if (availability.length === 0) return "Sin tiendas con inventario";
  return availability
    .map((entry, i) => (i === 0
      ? `${entry.store_name}: puedes armar ${entry.max_buildable}`
      : `${entry.store_name}: ${entry.max_buildable}`))
    .join(" · ");
}

/** Piezas totales por paquete (las cantidades ≤ 0 no cuentan). */
export function totalPieces(lines: readonly BundleLine[]): number {
  return lines.reduce((acc, line) => acc + Math.max(line.quantity, 0), 0);
}
