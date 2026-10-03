// Reportes por categoría (pedido Joel 2026-10-03): la tabla, el Excel/PDF y el
// Excel del corte agrupan los productos por categoría A-Z con un subtotal por
// grupo. Son las mismas categorías de Productos; un producto con varias se
// agrupa por la PRIMERA (orden del pivote) para no contar su venta dos veces,
// pero se muestran todas.
import type { GroupedProduct } from "./reportTypes";

export const UNCATEGORIZED = "Sin categoría";
export const PRESALE_CATEGORY = "Preventas";

/** Nombre del grupo de un renglón (sin categoría → "Sin categoría"). */
export function categoryOf(p: Pick<GroupedProduct, "category">): string {
  return p.category || UNCATEGORIZED;
}

/** A-Z sin importar acentos ni mayúsculas; "Sin categoría" y "Preventas" al final. */
export function compareCategories(a: string, b: string): number {
  const rank = (c: string) => (c === PRESALE_CATEGORY ? 2 : c === UNCATEGORIZED ? 1 : 0);
  // Desempate exacto: dos nombres distintos nunca quedan "iguales" (si no, sus
  // renglones se intercalarían y el Excel repetiría encabezados).
  return rank(a) - rank(b)
    || a.localeCompare(b, "es", { sensitivity: "base" })
    || (a < b ? -1 : a > b ? 1 : 0);
}

/** Llave de agrupación: "MANGA", "Manga" y " manga " son la misma categoría. */
const groupKey = (name: string): string =>
  name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Pone `categories` (todas) y `category` (la del grupo) a cada renglón, a
 * partir de las categorías de cada producto vendido. Las preventas van juntas
 * en "Preventas"; productos borrados o sin categoría, en "Sin categoría".
 */
export function assignCategories(
  rows: GroupedProduct[],
  categoriesByProduct: ReadonlyMap<number, readonly string[]>,
): void {
  // Categorías escritas distinto (mayúsculas/acentos) se juntan bajo el primer nombre visto.
  const canonical = new Map<string, string>();
  const groupName = (name: string): string => {
    const key = groupKey(name);
    const seen = canonical.get(key);
    if (seen) return seen;
    const clean = name.trim();
    canonical.set(key, clean);
    return clean;
  };
  for (const row of rows) {
    if (row.pre_sale_apartado !== undefined) {
      row.categories = [];
      row.category = PRESALE_CATEGORY;
      continue;
    }
    const cats = typeof row.base_product_id === "number" ? categoriesByProduct.get(row.base_product_id) ?? [] : [];
    row.categories = [...cats];
    row.category = cats[0] ? groupName(cats[0]) : UNCATEGORIZED;
  }
}

export interface CategoryGroup {
  category: string;
  products: GroupedProduct[];
}

/** Agrupa en el orden A-Z de categorías, respetando el orden de los productos dentro de cada una. */
export function groupProductsByCategory(products: readonly GroupedProduct[]): CategoryGroup[] {
  const byCategory = new Map<string, GroupedProduct[]>();
  for (const p of products) {
    const cat = categoryOf(p);
    const list = byCategory.get(cat);
    if (list) list.push(p);
    else byCategory.set(cat, [p]);
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => compareCategories(a, b))
    .map(([category, list]) => ({ category, products: list }));
}
