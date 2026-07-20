/**
 * Modelo de producto que consume la Caja.
 *
 * Vive fuera de SellPage porque el adaptador (`lib/productAdapter.ts`) y el
 * sincronizador del carrito (`lib/cartSync.ts`) lo necesitan sin arrastrar
 * todo el árbol de React.
 */
import type { ProductLight } from "@tadaima/api";

/**
 * Una promo vigente tal como viaja en el payload de productos.
 *
 * Se DERIVA del contrato del API a propósito: antes este literal estaba
 * duplicado en SellPage y en packages/api, y cualquier campo nuevo del backend
 * tenía que agregarse dos veces (así fue como `min_qty`/`discount_per_unit`
 * llegaron tarde a la Caja).
 */
export type PromoSnapshot = NonNullable<ProductLight["active_promotions"]>[number];

export type PriceLevel = "a" | "b" | "c" | "d" | "e";

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  image?: string;
  price_a: number;
  price_b?: number;
  price_c?: number;
  price_d?: number;
  price_e?: number;
  stock?: number;
  stock_damaged?: number;
  stock_details?: {
    tienda: number;
    bodega: number;
    preventa: number;
    dañado: number;
  };
  allow_cash?: boolean;
  allow_card?: boolean;
  active?: boolean;
  product_type?: string;
  volume_number?: number | null;
  // false = sin inventario en la tienda activa ("No asignado" → el cajero le
  // agrega stock; no se puede cobrar hasta que tenga stock). Default true.
  is_assigned?: boolean;
  /** Promos VIGENTES (Descuentos v2) — el motor elige la mejor por línea. */
  active_promotions?: PromoSnapshot[];
}
