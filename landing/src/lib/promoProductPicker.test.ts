import { describe, expect, it } from "vitest";
import {
  addMany, bucketSelectionState, buildCategoryBuckets, filterProductsByText, findScannedProduct,
  productCategoryKeys, removeMany, resolveEnterPick, selectedProducts, selectionSummary,
  toggleBucket, toggleProduct, type PickerProduct,
} from "./promoProductPicker";

const CATS = [
  { id: 1, name: "Mangas" },
  { id: 2, name: "Figuras" },
  { id: 3, name: "Accesorios" },
];

function prod(id: number, name: string, over: Partial<PickerProduct> = {}): PickerProduct {
  return { id, name, sku: `SKU-${id}`, barcode: null, category_id: null, ...over };
}

const PRODUCTS: PickerProduct[] = [
  prod(1, "Manga Chainsaw Man Tomo 1", { category_ids: [1], category_id: 1 }),
  prod(2, "Manga One Piece Tomo 100", { category_ids: [1], category_id: 1 }),
  prod(3, "Figura Goku", { category_ids: [2], category_id: 2 }),
  prod(4, "Llavero Pokémon", { category_ids: [3, 2], category_id: 3 }),
  prod(5, "Póster sin categoría"),
  prod(6, "Cable viejo", { category_id: 3 }), // API vieja: sin category_ids
];

describe("productCategoryKeys", () => {
  it("usa category_ids, cae a category_id y al final a 'none'", () => {
    expect(productCategoryKeys(PRODUCTS[3]!)).toEqual([3, 2]);
    expect(productCategoryKeys(PRODUCTS[5]!)).toEqual([3]);
    expect(productCategoryKeys(PRODUCTS[4]!)).toEqual(["none"]);
  });
});

describe("buildCategoryBuckets", () => {
  it("agrupa por categoría, A-Z, con 'Sin categoría' al final", () => {
    const buckets = buildCategoryBuckets(PRODUCTS, CATS);
    expect(buckets.map(b => b.name)).toEqual(["Accesorios", "Figuras", "Mangas", "Sin categoría"]);
  });

  it("un producto con dos categorías aparece en las dos", () => {
    const buckets = buildCategoryBuckets(PRODUCTS, CATS);
    expect(buckets.find(b => b.name === "Accesorios")?.productIds).toEqual([6, 4]);
    expect(buckets.find(b => b.name === "Figuras")?.productIds).toEqual([3, 4]);
  });

  it("con primaryOnly cada producto cae en una sola categoría", () => {
    const buckets = buildCategoryBuckets(PRODUCTS, CATS, { primaryOnly: true });
    expect(buckets.find(b => b.name === "Figuras")?.productIds).toEqual([3]);
    expect(buckets.reduce((n, b) => n + b.productIds.length, 0)).toBe(PRODUCTS.length);
  });

  it("una categoría que ya no existe cae en 'Sin categoría'", () => {
    const buckets = buildCategoryBuckets([prod(9, "Huérfano", { category_ids: [77] })], CATS);
    expect(buckets.map(b => b.name)).toEqual(["Sin categoría"]);
  });
});

describe("filterProductsByText", () => {
  it("sin texto devuelve todos", () => {
    expect(filterProductsByText(PRODUCTS, "  ")).toHaveLength(PRODUCTS.length);
  });

  it("ignora acentos y mayúsculas", () => {
    expect(filterProductsByText(PRODUCTS, "POKEMON").map(p => p.id)).toEqual([4]);
  });

  it("varias palabras deben aparecer todas, en cualquier orden", () => {
    expect(filterProductsByText(PRODUCTS, "tomo manga 100").map(p => p.id)).toEqual([2]);
  });

  it("busca por SKU y código de barras", () => {
    expect(filterProductsByText(PRODUCTS, "sku-3").map(p => p.id)).toEqual([3]);
    const conBarras = [prod(7, "Taza", { barcode: "7501234500172" })];
    expect(filterProductsByText(conBarras, "500172").map(p => p.id)).toEqual([7]);
  });
});

describe("selección", () => {
  const mangas = buildCategoryBuckets(PRODUCTS, CATS).find(b => b.name === "Mangas")!;
  const NADA: ReadonlySet<number> = new Set();

  it("toggleBucket elige toda la categoría y la segunda vez la quita", () => {
    const elegidos = toggleBucket(NADA, mangas, NADA);
    expect([...elegidos]).toEqual([1, 2]);
    expect(bucketSelectionState(mangas, elegidos, NADA)).toBe("all");
    expect([...toggleBucket(elegidos, mangas, NADA)]).toEqual([]);
  });

  it("con parte de la categoría elegida el estado es parcial y el toggle la completa", () => {
    const parcial = new Set([1]);
    expect(bucketSelectionState(mangas, parcial, NADA)).toBe("some");
    expect([...toggleBucket(parcial, mangas, NADA)].sort()).toEqual([1, 2]);
  });

  it("los que ya están en la promo (locked) nunca se tocan", () => {
    const locked = new Set([1]);
    const elegidos = toggleBucket(NADA, mangas, locked);
    expect([...elegidos]).toEqual([2]);
    expect(bucketSelectionState(mangas, elegidos, locked)).toBe("all");
    expect([...addMany(NADA, [1, 2, 3], locked)]).toEqual([2, 3]);
  });

  it("no muta el Set original", () => {
    const original = new Set([1]);
    toggleProduct(original, 2);
    toggleBucket(original, mangas, NADA);
    removeMany(original, [1]);
    expect([...original]).toEqual([1]);
  });

  it("toggleProduct agrega y quita", () => {
    expect([...toggleProduct(NADA, 5)]).toEqual([5]);
    expect([...toggleProduct(new Set([5]), 5)]).toEqual([]);
  });
});

describe("selectionSummary", () => {
  const buckets = buildCategoryBuckets(PRODUCTS, CATS);

  it("distingue categorías completas de productos sueltos", () => {
    const resumen = selectionSummary(new Set([1, 2, 3]), buckets);
    expect(resumen).toEqual({ total: 3, fullCategories: ["Mangas"], looseCount: 1, looseIds: [3] });
  });

  it("un producto de dos categorías no cuenta como suelto si una está completa", () => {
    // Figuras completa = 3 y 4; el 4 también es de Accesorios (incompleta).
    const resumen = selectionSummary(new Set([3, 4]), buckets);
    expect(resumen).toEqual({ total: 2, fullCategories: ["Figuras"], looseCount: 0, looseIds: [] });
  });

  it("sin selección", () => {
    expect(selectionSummary(new Set(), buckets)).toEqual({ total: 0, fullCategories: [], looseCount: 0, looseIds: [] });
  });
});

describe("findScannedProduct", () => {
  const scanned = [
    prod(10, "Funko Goku", { sku: "FUN-010", barcode: "7501234567890" }),
    prod(11, "Funko Vegeta", { sku: "fun-011", barcode: null }),
  ];

  it("encuentra por código de barras o SKU exacto, sin mayúsculas ni espacios", () => {
    expect(findScannedProduct(scanned, "7501234567890")?.id).toBe(10);
    expect(findScannedProduct(scanned, " FUN-011 ")?.id).toBe(11);
    expect(findScannedProduct(scanned, "fun-010")?.id).toBe(10);
  });

  it("no adivina con un código parcial", () => {
    expect(findScannedProduct(scanned, "750123")).toBeNull();
    expect(findScannedProduct(scanned, "")).toBeNull();
  });
});

describe("resolveEnterPick", () => {
  const none = new Set<number>();

  it("agrega el producto del código exacto sin tocar la selección original", () => {
    const selected = new Set([1]);
    const result = resolveEnterPick(PRODUCTS, "SKU-3", selected, none);
    expect(result?.kind).toBe("added");
    expect(result?.product?.id).toBe(3);
    expect([...result!.selected].sort()).toEqual([1, 3]);
    expect([...selected]).toEqual([1]);
  });

  it("si la búsqueda deja uno solo, lo agrega", () => {
    expect(resolveEnterPick(PRODUCTS, "goku", none, none)?.product?.id).toBe(3);
  });

  it("escanear dos veces no lo quita", () => {
    const result = resolveEnterPick(PRODUCTS, "SKU-3", new Set([3]), none);
    expect(result?.kind).toBe("already");
    expect([...result!.selected]).toEqual([3]);
  });

  it("avisa cuando ya está en la promo", () => {
    const result = resolveEnterPick(PRODUCTS, "SKU-3", none, new Set([3]));
    expect(result?.kind).toBe("locked");
    expect(result?.selected.size).toBe(0);
  });

  it("con varias coincidencias no elige: avisa cuántas son", () => {
    const result = resolveEnterPick(PRODUCTS, "manga", none, none);
    expect(result?.kind).toBe("ambiguous");
    expect(result?.matchCount).toBe(2);
    expect(result?.selected.size).toBe(0);
  });

  it("un código a medias nunca agrega por coincidencia", () => {
    const withBarcode = [...PRODUCTS, prod(7, "Funko Goku", { barcode: "7501234567890" })];
    expect(resolveEnterPick(withBarcode, "7501", none, none)?.kind).toBe("not_found");
  });

  it("no encuentra nada; nada con texto vacío", () => {
    expect(resolveEnterPick(PRODUCTS, "zzz", none, none)?.kind).toBe("not_found");
    expect(resolveEnterPick(PRODUCTS, "   ", none, none)).toBeNull();
  });
});

describe("selectedProducts", () => {
  it("devuelve los elegidos A-Z y omite los que ya no están en caché", () => {
    const byId = new Map(PRODUCTS.map(p => [p.id, p]));
    expect(selectedProducts(byId, new Set([4, 1, 99])).map(p => p.id)).toEqual([4, 1]);
  });
});
