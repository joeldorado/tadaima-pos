/**
 * Corte del gerente — tablas «Ventas normales» / «Ventas con tarjeta» del
 * Reporte del Día (Ventas → Historial → Reporte), agrupadas por producto.
 *
 * Venta de cada renglón = lo que de verdad se COBRÓ por la línea (2026-11-15):
 * neto `total − discount_amount + surcharge_amount` (promo NxM, mayoreo,
 * precio especial, descuento manual y aumento), o prorrateo `total/subtotal`
 * en ventas legacy con descuento global. Antes sumaba `price × quantity` (el
 * bruto): una venta de $1,899 bruto / $1,255 cobrado salía como $1,899 y la
 * utilidad inflada. Misma regla que Reportes (`saleItemRevenue`).
 *
 * Agrupación: PRODUCTO + FECHA + PRECIO DE LISTA + PRECIO UNITARIO NETO.
 * `precioUnit` es el NETO por pieza (venta ÷ cantidad), así en pantalla sigue
 * valiendo «cant × P. Unit = venta» (Joel 2026-06-12) aunque la línea lleve
 * promo; `precioLista` es el de catálogo cobrado (`sale_items.price`), para
 * que se vea cuánto se rebajó. El mismo producto a precio lleno y con promo
 * sale en renglones separados.
 */
import { saleItemRevenue, type SaleAmounts, type SaleItemAmounts } from "./saleItemNet";

export interface CorteSaleItem extends SaleItemAmounts {
  product_id: number | null;
  product_name?: string | null;
  product?: { name?: string | null; cost?: number | null } | null;
  price: number;
  quantity: number;
  /** Snapshot del costo al cobrar (solo con permiso de ver costos). */
  cost?: number | null;
  is_gift?: boolean;
}

export interface CorteSale extends SaleAmounts {
  sold_at?: string | null;
  created_at: string;
  commission_amount?: number | null;
  items?: readonly CorteSaleItem[] | null;
}

/** Fila de producto en el corte del gerente (tablas 1, 2, 4 y 5). */
export interface CorteProdRow {
  key: string;
  name: string;
  /** YYYY-MM-DD en la zona del negocio. */
  fecha: string;
  /** Precio unitario NETO (venta ÷ cantidad): cant × P. Unit = venta. */
  precioUnit: number;
  /** Precio de lista por pieza (`sale_items.price`). Solo ventas regulares. */
  precioLista?: number;
  cantidad: number;
  venta: number;
  costo: number;
  tieneCosto: boolean;
  /** Regalo (2026-10-31): $0 de venta y costo a propósito — no es «sin costo». */
  isGift?: boolean;
  /** Comisión de terminal repartida a la fila (solo tabla Tarjeta). */
  comision: number;
}

export interface AccSaleItemsOptions {
  /** Reparte `commission_amount` de cada venta entre sus renglones (tabla Tarjeta). */
  withComision?: boolean;
  /** Fecha de negocio (YYYY-MM-DD) de la venta. */
  fechaOf: (sale: CorteSale) => string;
}

const cents = (n: number): number => Math.round(n * 100);

export function sortCorteRows(rows: readonly CorteProdRow[]): CorteProdRow[] {
  return [...rows].sort(
    (a, b) => b.fecha.localeCompare(a.fecha) || a.name.localeCompare(b.name) || b.venta - a.venta,
  );
}

/**
 * Acumula los renglones de ventas regulares por producto. La comisión de cada
 * venta (snapshot por terminal) se reparte proporcional a lo COBRADO por línea;
 * si la venta cobró $0, va completa al primer renglón.
 */
export function accSaleItems(sales: readonly CorteSale[], opts: AccSaleItemsOptions): CorteProdRow[] {
  const map = new Map<string, CorteProdRow>();
  sales.forEach(sale => {
    const fecha = opts.fechaOf(sale);
    const items = sale.items ?? [];
    const netos = items.map(it => (it.is_gift ? 0 : saleItemRevenue(sale, it)));
    const saleVenta = netos.reduce((a, n) => a + n, 0);
    const saleComision = opts.withComision ? Number(sale.commission_amount ?? 0) : 0;
    items.forEach((it, idx) => {
      const isGift = Boolean(it.is_gift);
      const baseName = it.product?.name ?? it.product_name ?? `#${it.product_id}`;
      const name = isGift ? `${baseName} (Regalo)` : baseName;
      const qty = Number(it.quantity ?? 0);
      const venta = netos[idx] ?? 0;
      const precioLista = Number(it.price ?? 0);
      const precioUnit = qty > 0 ? cents(venta / qty) / 100 : 0;
      const key = `${fecha}|${name}|${cents(precioLista)}|${cents(precioUnit)}`;
      const prev = map.get(key) ?? {
        key, name, fecha, precioUnit, precioLista,
        cantidad: 0, venta: 0, costo: 0, tieneCosto: false, comision: 0,
        ...(isGift ? { isGift: true } : {}),
      };
      // cost: snapshot histórico (item.cost) → fallback product.cost actual.
      const unitCost = it.cost ?? it.product?.cost;
      const comision = saleVenta > 0
        ? saleComision * (venta / saleVenta)
        : (idx === 0 ? saleComision : 0);
      map.set(key, {
        ...prev,
        cantidad: prev.cantidad + qty,
        venta: prev.venta + venta,
        comision: prev.comision + comision,
        ...(unitCost != null ? { costo: prev.costo + unitCost * qty, tieneCosto: true } : {}),
      });
    });
  });
  return sortCorteRows(Array.from(map.values()));
}
