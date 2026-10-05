import type { ProductLight } from "@tadaima/api";
import { normalizeCategoryText, type PickableCategory } from "@/lib/categoryPicker";

/**
 * Lógica pura del selector de productos de una promo: agrupar por categoría,
 * buscar sin acentos y llevar la selección. "Por categoría" es un ATAJO —
 * marca los productos que la categoría tiene hoy; la promo guarda productos,
 * no categorías.
 *
 * La selección es un Set inmutable: cada cambio devuelve uno NUEVO.
 */

export type PickerProduct = Pick<ProductLight, "id" | "name" | "sku" | "barcode" | "category_id" | "category_ids">;

export type CategoryKey = number | "none";

export interface CategoryBucket {
  key: CategoryKey;
  name: string;
  /** Ids de sus productos, ordenados por nombre. */
  productIds: number[];
}

export type BucketSelectionState = "all" | "some" | "none";

export interface SelectionSummary {
  total: number;
  /** Categorías con TODOS sus productos elegidos. */
  fullCategories: string[];
  /** Elegidos que no pertenecen a ninguna categoría completa. */
  looseCount: number;
  looseIds: number[];
}

const NO_CATEGORY_NAME = "Sin categoría";

/** Categorías del producto: `category_ids`, o `category_id` (API vieja), o "none". */
export function productCategoryKeys(product: Pick<PickerProduct, "category_id" | "category_ids">): CategoryKey[] {
  if (product.category_ids && product.category_ids.length > 0) return [...product.category_ids];
  if (product.category_id != null) return [product.category_id];
  return ["none"];
}

/**
 * Un bucket por categoría con al menos un producto, A-Z y "Sin categoría" al
 * final. Un producto con varias categorías aparece en todas, salvo con
 * `primaryOnly` (cada producto solo en su primera — para listas sin repetidos).
 */
export function buildCategoryBuckets(
  products: readonly PickerProduct[],
  categories: readonly PickableCategory[],
  options: { primaryOnly?: boolean } = {},
): CategoryBucket[] {
  const names = new Map(categories.map(category => [category.id, category.name]));
  const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const idsByKey = new Map<CategoryKey, number[]>();

  for (const product of sorted) {
    const keys = productCategoryKeys(product);
    // Una categoría que ya no existe no debe esconder el producto.
    const known = keys.filter(key => key !== "none" && names.has(key));
    const resolved: CategoryKey[] = known.length > 0 ? known : ["none"];
    for (const key of options.primaryOnly ? resolved.slice(0, 1) : resolved) {
      idsByKey.set(key, [...(idsByKey.get(key) ?? []), product.id]);
    }
  }

  return [...idsByKey.entries()]
    .map(([key, productIds]): CategoryBucket => ({
      key,
      name: key === "none" ? NO_CATEGORY_NAME : names.get(key) ?? NO_CATEGORY_NAME,
      productIds,
    }))
    .sort((a, b) => Number(a.key === "none") - Number(b.key === "none") || a.name.localeCompare(b.name, "es"));
}

/** Busca por nombre, SKU o código de barras; todas las palabras, en cualquier orden. */
export function filterProductsByText<T extends Pick<PickerProduct, "name" | "sku" | "barcode">>(
  products: readonly T[],
  query: string,
): T[] {
  const tokens = normalizeCategoryText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...products];
  return products.filter(product => {
    const haystack = normalizeCategoryText(`${product.name} ${product.sku ?? ""} ${product.barcode ?? ""}`);
    return tokens.every(token => haystack.includes(token));
  });
}

/** Los que ya están en la promo (`locked`) no cuentan: no se pueden elegir ni quitar aquí. */
export function bucketSelectionState(
  bucket: CategoryBucket,
  selected: ReadonlySet<number>,
  locked: ReadonlySet<number>,
): BucketSelectionState {
  const selectable = bucket.productIds.filter(id => !locked.has(id));
  const chosen = selectable.filter(id => selected.has(id)).length;
  if (chosen === selectable.length) return "all";
  return chosen === 0 ? "none" : "some";
}

export function addMany(
  selected: ReadonlySet<number>,
  ids: readonly number[],
  locked: ReadonlySet<number>,
): Set<number> {
  return new Set([...selected, ...ids.filter(id => !locked.has(id))]);
}

export function removeMany(selected: ReadonlySet<number>, ids: readonly number[]): Set<number> {
  const removed = new Set(ids);
  return new Set([...selected].filter(id => !removed.has(id)));
}

/** Categoría completa → la quita; si no, la completa. */
export function toggleBucket(
  selected: ReadonlySet<number>,
  bucket: CategoryBucket,
  locked: ReadonlySet<number>,
): Set<number> {
  return bucketSelectionState(bucket, selected, locked) === "all"
    ? removeMany(selected, bucket.productIds)
    : addMany(selected, bucket.productIds, locked);
}

export function toggleProduct(selected: ReadonlySet<number>, id: number): Set<number> {
  return selected.has(id) ? removeMany(selected, [id]) : new Set([...selected, id]);
}

export function selectionSummary(selected: ReadonlySet<number>, buckets: readonly CategoryBucket[]): SelectionSummary {
  const fullBuckets = buckets.filter(bucket =>
    bucket.key !== "none" && bucket.productIds.every(id => selected.has(id)));
  const covered = new Set(fullBuckets.flatMap(bucket => bucket.productIds));
  const looseIds = [...selected].filter(id => !covered.has(id));
  return {
    total: selected.size,
    fullCategories: fullBuckets.map(bucket => bucket.name),
    looseCount: looseIds.length,
    looseIds,
  };
}

/** Código tal como lo manda el lector o lo teclean: sin espacios ni mayúsculas. */
function normalizeCode(code: string): string {
  return normalizeCategoryText(code).replace(/\s+/g, "");
}

/** Producto cuyo código de barras o SKU es EXACTAMENTE el escaneado. */
export function findScannedProduct<T extends Pick<PickerProduct, "sku" | "barcode">>(
  products: readonly T[],
  code: string,
): T | null {
  const wanted = normalizeCode(code);
  if (wanted === "") return null;
  return products.find(product =>
    (product.barcode != null && normalizeCode(product.barcode) === wanted)
    || (product.sku != null && normalizeCode(product.sku) === wanted)) ?? null;
}

export type EnterPickKind = "added" | "already" | "locked" | "ambiguous" | "not_found";

export interface EnterPickResult<T> {
  kind: EnterPickKind;
  product: T | null;
  /** Con `ambiguous`: cuántos productos coinciden con el texto. */
  matchCount: number;
  /** Selección resultante (nueva si se agregó; la misma si no cambió). */
  selected: ReadonlySet<number>;
}

/** Busca solo en el NOMBRE: un código a medias no debe elegir nada solo. */
function filterByName<T extends Pick<PickerProduct, "name">>(products: readonly T[], query: string): T[] {
  const tokens = normalizeCategoryText(query).split(/\s+/).filter(Boolean);
  return products.filter(product => {
    const name = normalizeCategoryText(product.name);
    return tokens.every(token => name.includes(token));
  });
}

/**
 * Enter en el buscador (o el lector de código): agrega el producto del código
 * EXACTO o, si no, el ÚNICO cuyo nombre coincide. Un código parcial (lector que
 * leyó mal) nunca agrega por coincidencia. Nunca quita: escanear dos veces el
 * mismo no lo desmarca. `null` con el buscador vacío.
 */
export function resolveEnterPick<T extends PickerProduct>(
  products: readonly T[],
  query: string,
  selected: ReadonlySet<number>,
  locked: ReadonlySet<number>,
): EnterPickResult<T> | null {
  if (query.trim() === "") return null;
  const scanned = findScannedProduct(products, query);
  const byName = scanned ? [] : filterByName(products, query);
  const product = scanned ?? (byName.length === 1 ? byName[0]! : null);
  if (!product) {
    const matchCount = filterProductsByText(products, query).length;
    return { kind: matchCount > 1 ? "ambiguous" : "not_found", product: null, matchCount, selected };
  }
  const base = { product, matchCount: 1 };
  if (locked.has(product.id)) return { ...base, kind: "locked", selected };
  if (selected.has(product.id)) return { ...base, kind: "already", selected };
  return { ...base, kind: "added", selected: addMany(selected, [product.id], locked) };
}

/** Los elegidos, A-Z. Los que ya no están en la lista de productos se omiten. */
export function selectedProducts<T extends Pick<PickerProduct, "id" | "name">>(
  productsById: ReadonlyMap<number, T>,
  selected: ReadonlySet<number>,
): T[] {
  return [...selected]
    .flatMap(id => {
      const product = productsById.get(id);
      return product ? [product] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
