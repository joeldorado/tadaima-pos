import { describe, expect, it } from "vitest";
import type { BundleStoreAvailability } from "@tadaima/api";
import {
  LOW_BUILDABLE, availabilityFor, availabilityTone, buildableSummary, componentUsage, limitingComponents,
  maxBuildable, maxBuildableWithSources, priceSum, savingsPct, totalPieces,
} from "./bundleMath";

// Paquete de ejemplo: 2 Goku + 1 Vegeta.
const LINES = [
  { productId: 1, quantity: 2 },
  { productId: 2, quantity: 1 },
];

const stock = (entries: Array<[number, number]>) => new Map<number, number>(entries);

const store = (over: Partial<BundleStoreAvailability>): BundleStoreAvailability => ({
  store_id: 1, store_name: "Macro", has_bodega: true, stock_exhibicion: 0, stock_bodega: 0,
  max_buildable: 0, components: [], ...over,
});

describe("maxBuildable", () => {
  it("es el mínimo de floor(stock / piezas) entre componentes", () => {
    // 10 Goku → 5 paquetes; 3 Vegeta → 3 paquetes → gana el 3.
    expect(maxBuildable(LINES, stock([[1, 10], [2, 3]]))).toBe(3);
    expect(maxBuildable(LINES, stock([[1, 5], [2, 9]]))).toBe(2);
  });

  it("0 sin componentes, sin stock o con cantidad inválida", () => {
    expect(maxBuildable([], stock([[1, 10]]))).toBe(0);
    expect(maxBuildable(LINES, stock([]))).toBe(0);
    expect(maxBuildable(LINES, stock([[1, 10]]))).toBe(0);
    expect(maxBuildable([{ productId: 1, quantity: 0 }], stock([[1, 10]]))).toBe(0);
    expect(maxBuildable([{ productId: 1, quantity: -1 }], stock([[1, 10]]))).toBe(0);
  });

  it("el stock negativo cuenta como 0", () => {
    expect(maxBuildable(LINES, stock([[1, -4], [2, 3]]))).toBe(0);
  });
});

describe("maxBuildableWithSources", () => {
  const exh = stock([[1, 4], [2, 1]]);
  const bod = stock([[1, 6], [2, 2]]);

  it("'auto' o sin entrada suma Exhibición + Bodega", () => {
    expect(maxBuildableWithSources(LINES, exh, bod, new Map())).toBe(3);
    expect(maxBuildableWithSources(LINES, exh, bod, new Map([[1, "auto"], [2, "auto"]]))).toBe(3);
  });

  it("'store' solo Exhibición y 'bodega' solo Bodega, por componente", () => {
    expect(maxBuildableWithSources(LINES, exh, bod, new Map([[1, "store"]]))).toBe(2);
    expect(maxBuildableWithSources(LINES, exh, bod, new Map([[2, "bodega"]]))).toBe(2);
    expect(maxBuildableWithSources(LINES, exh, bod, new Map([[1, "store"], [2, "store"]]))).toBe(1);
  });
});

describe("limitingComponents", () => {
  it("devuelve los que topan el máximo (puede ser más de uno)", () => {
    expect(limitingComponents(LINES, stock([[1, 10], [2, 3]]))).toEqual([2]);
    expect(limitingComponents(LINES, stock([[1, 6], [2, 3]]))).toEqual([1, 2]);
  });

  it("sin stock todos limitan; sin componentes nadie", () => {
    expect(limitingComponents(LINES, stock([]))).toEqual([1, 2]);
    expect(limitingComponents([], stock([]))).toEqual([]);
  });
});

describe("componentUsage", () => {
  it("calcula piezas necesarias y si alcanza", () => {
    expect(componentUsage(LINES, stock([[1, 10], [2, 3]]), 4)).toEqual([
      { productId: 1, quantity: 2, needed: 8, available: 10, enough: true },
      { productId: 2, quantity: 1, needed: 4, available: 3, enough: false },
    ]);
  });

  it("armar 0 no necesita nada; producto sin stock = 0 disponible", () => {
    expect(componentUsage(LINES, stock([]), 0)).toEqual([
      { productId: 1, quantity: 2, needed: 0, available: 0, enough: true },
      { productId: 2, quantity: 1, needed: 0, available: 0, enough: true },
    ]);
  });
});

describe("priceSum y savingsPct", () => {
  it("suma precio × piezas, 2 decimales; sin precio cuenta $0", () => {
    expect(priceSum(LINES, new Map([[1, 250], [2, 300]]))).toBe(800);
    expect(priceSum(LINES, new Map([[1, 10.005]]))).toBe(20.01);
    expect(priceSum([], new Map())).toBe(0);
  });

  it("ahorro redondeado; null sin referencia; negativo si el paquete sale más caro", () => {
    expect(savingsPct(450, 500)).toBe(10);
    expect(savingsPct(333, 500)).toBe(33);
    expect(savingsPct(450, 0)).toBeNull();
    expect(savingsPct(600, 500)).toBe(-20);
  });
});

describe("availabilityTone", () => {
  it("rojo en 0, ámbar hasta LOW_BUILDABLE, verde después", () => {
    expect(availabilityTone(0)).toBe("red");
    expect(availabilityTone(-1)).toBe("red");
    expect(availabilityTone(1)).toBe("amber");
    expect(availabilityTone(LOW_BUILDABLE)).toBe("amber");
    expect(availabilityTone(LOW_BUILDABLE + 1)).toBe("green");
  });
});

describe("availabilityFor", () => {
  const bundle = { availability: [store({ store_id: 1, max_buildable: 3 }), store({ store_id: 4, store_name: "Centro", max_buildable: 1 })] };

  it("encuentra la tienda por id", () => {
    expect(availabilityFor(bundle, 4)?.max_buildable).toBe(1);
  });

  it("null sin tienda elegida o si la tienda no tiene inventario del paquete", () => {
    expect(availabilityFor(bundle, null)).toBeNull();
    expect(availabilityFor(bundle, 99)).toBeNull();
  });
});

describe("buildableSummary", () => {
  it("una línea con la primera tienda explicada y las demás cortas", () => {
    const summary = buildableSummary([
      store({ store_name: "Macro", max_buildable: 3 }),
      store({ store_id: 4, store_name: "Centro", max_buildable: 1 }),
    ]);
    expect(summary).toBe("Macro: puedes armar 3 · Centro: 1");
  });

  it("texto fijo sin tiendas", () => {
    expect(buildableSummary([])).toBe("Sin tiendas con inventario");
  });
});

describe("totalPieces", () => {
  it("suma las piezas por paquete ignorando cantidades inválidas", () => {
    expect(totalPieces(LINES)).toBe(3);
    expect(totalPieces([{ productId: 1, quantity: -2 }, { productId: 2, quantity: 1 }])).toBe(1);
    expect(totalPieces([])).toBe(0);
  });
});
