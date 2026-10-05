import type { ProductLight } from "@tadaima/api";

/**
 * Qué promo le toca HOY a cada producto, vista desde la tienda de quien mira.
 * Alimenta el Modo TV, el banner de compartir y la marca "en tu tienda aplica
 * otra promo". Mismo criterio que Caja: si la tienda tiene una promo local
 * para el producto, esa reemplaza a la general.
 */

export type LightPromo = NonNullable<ProductLight["active_promotions"]>[number];

export type VigentesProduct = Pick<ProductLight, "id" | "name" | "active" | "active_promotions">;

export interface VigentesViewer {
  isAdmin: boolean;
  storeId: number | null;
}

export interface VigenteItem<T extends VigentesProduct> {
  product: T;
  promo: LightPromo;
}

const byPriority = (a: LightPromo, b: LightPromo): number => b.priority - a.priority || a.id - b.id;

/** Promos del producto que le aplican a quien mira (admin: todas, con su tienda). */
function visiblePromos(product: VigentesProduct, viewer: VigentesViewer): LightPromo[] {
  return (product.active_promotions ?? []).filter(promo =>
    viewer.isAdmin || promo.store_id == null || promo.store_id === viewer.storeId);
}

/** Un renglón por producto activo con promo vigente, ordenado por nombre. */
export function vigentesPorProducto<T extends VigentesProduct>(
  products: readonly T[],
  viewer: VigentesViewer,
): VigenteItem<T>[] {
  return products
    .flatMap((product): VigenteItem<T>[] => {
      if (!product.active) return [];
      const visible = visiblePromos(product, viewer);
      const locals = visible.filter(promo => promo.store_id != null);
      // Fuera de admin, la promo local de la tienda apaga a la general.
      const pool = !viewer.isAdmin && locals.length > 0 ? locals : visible;
      const promo = [...pool].sort(byPriority)[0];
      return promo ? [{ product, promo }] : [];
    })
    .sort((a, b) => a.product.name.localeCompare(b.product.name, "es"));
}

/**
 * Para una promo GENERAL: la promo local que la reemplaza en la tienda de quien
 * mira, o null. El admin no tiene tienda de referencia.
 */
export function localOverrideFor(
  product: VigentesProduct,
  promo: { id: number; store_id?: number | null },
  viewer: VigentesViewer,
): LightPromo | null {
  if (viewer.isAdmin || viewer.storeId == null || promo.store_id != null) return null;
  const locals = (product.active_promotions ?? []).filter(candidate =>
    candidate.store_id === viewer.storeId && candidate.id !== promo.id);
  return [...locals].sort(byPriority)[0] ?? null;
}
