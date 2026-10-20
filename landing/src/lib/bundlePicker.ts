import type { ProductLight } from "@tadaima/api";
import { filterProductsByText } from "@/lib/promoProductPicker";

/**
 * Filtro de la tabla de productos del asistente de Paquetes (paso 1): texto,
 * categoría y orden. Puro, sin React: el pool ya viene cargado del server.
 */

export type PickerCategoryFilter = number | "none" | null;

export interface PickerFilter {
  query: string;
  /** null = todas; "none" = sin categoría. */
  categoryId: PickerCategoryFilter;
  /** Con tienda elegida el stock que se ve es el de esa tienda (Exh + Bod). */
  hasStore: boolean;
}

export interface VisibleStock {
  exh: number;
  bod: number;
  total: number;
  /** false = el producto no tiene inventario en esta tienda ("No asignado"). */
  assigned: boolean;
}

/** Stock que se muestra en la tabla: con tienda Exh/Bod de esa tienda; sin tienda, el global. */
export function visibleStock(p: Pick<ProductLight, "stock_total" | "stock_bodega" | "is_assigned">, hasStore: boolean): VisibleStock {
  const exh = Math.max(0, p.stock_total ?? 0);
  const bod = hasStore ? Math.max(0, p.stock_bodega ?? 0) : 0;
  return { exh, bod, total: exh + bod, assigned: p.is_assigned !== false };
}

function inCategory(p: Pick<ProductLight, "category_id" | "category_ids">, categoryId: PickerCategoryFilter): boolean {
  if (categoryId === null) return true;
  const ids = p.category_ids && p.category_ids.length > 0 ? p.category_ids : p.category_id != null ? [p.category_id] : [];
  if (categoryId === "none") return ids.length === 0;
  return ids.includes(categoryId);
}

/** Lo que se puede meter a un paquete: productos y tomos activos (nunca otro paquete). */
export function isPickable(p: Pick<ProductLight, "product_type" | "active">): boolean {
  return p.active && p.product_type !== "bundle";
}

/**
 * Filtra y ordena el pool para la tabla: texto (nombre/código, sin acentos),
 * categoría; A-Z con los que no tienen stock al final.
 */
export function filterPickerPool(pool: readonly ProductLight[], filter: PickerFilter): ProductLight[] {
  const byText = filterProductsByText(pool.filter(isPickable), filter.query);
  return byText
    .filter(p => inCategory(p, filter.categoryId))
    .sort((a, b) => {
      const sa = visibleStock(a, filter.hasStore).total > 0 ? 0 : 1;
      const sb = visibleStock(b, filter.hasStore).total > 0 ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name, "es");
    });
}

/** "Figura Goku Vol. 3" como se ve en Caja (los tomos llevan su número). */
export function pickerDisplayName(p: Pick<ProductLight, "name" | "volume_number">): string {
  return p.volume_number != null ? `${p.name} Vol. ${p.volume_number}` : p.name;
}
