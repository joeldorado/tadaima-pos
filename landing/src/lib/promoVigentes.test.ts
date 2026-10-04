import { describe, expect, it } from "vitest";
import { localOverrideFor, vigentesPorProducto, type LightPromo, type VigentesProduct } from "./promoVigentes";

const lightPromo = (over: Partial<LightPromo>): LightPromo => ({
  id: 1, name: "2x1 global", type: "nxm", buy_n: 2, pay_m: 1, priority: 0, store_id: null, ...over,
});

const GLOBAL = lightPromo({ id: 1 });
const LOCAL_T2 = lightPromo({ id: 2, name: "3x2 tienda 2", buy_n: 3, pay_m: 2, store_id: 2 });
const LOCAL_T9 = lightPromo({ id: 3, name: "2x1 tienda 9", store_id: 9 });
const PRIORITARIA = lightPromo({ id: 4, name: "Prioritaria", priority: 5 });

const product = (id: number, name: string, promos: LightPromo[], active = true): VigentesProduct =>
  ({ id, name, active, active_promotions: promos });

const ADMIN = { isAdmin: true, storeId: 1 };
const TIENDA_2 = { isAdmin: false, storeId: 2 };

describe("vigentesPorProducto", () => {
  it("omite productos inactivos o sin promos y ordena por nombre", () => {
    const items = vigentesPorProducto([
      product(1, "Zeta", [GLOBAL]),
      product(2, "Alfa", [GLOBAL]),
      product(3, "Inactivo", [GLOBAL], false),
      product(4, "Sin promo", []),
    ], ADMIN);
    expect(items.map(i => i.product.name)).toEqual(["Alfa", "Zeta"]);
  });

  it("quien no es admin no ve promos de otra tienda", () => {
    expect(vigentesPorProducto([product(1, "Llavero", [LOCAL_T9])], TIENDA_2)).toEqual([]);
  });

  it("en su tienda la promo local le gana a la general", () => {
    const [item] = vigentesPorProducto([product(1, "Llavero", [GLOBAL, LOCAL_T2])], TIENDA_2);
    expect(item?.promo.id).toBe(2);
  });

  it("el admin ve la de mayor prioridad", () => {
    const [item] = vigentesPorProducto([product(1, "Llavero", [GLOBAL, PRIORITARIA, LOCAL_T2])], ADMIN);
    expect(item?.promo.id).toBe(4);
  });
});

describe("localOverrideFor", () => {
  const llavero = product(1, "Llavero", [GLOBAL, LOCAL_T2]);

  it("avisa cuando en la tienda del usuario aplica otra promo en vez de la general", () => {
    expect(localOverrideFor(llavero, { id: 1, store_id: null }, TIENDA_2)?.name).toBe("3x2 tienda 2");
  });

  it("la propia promo local no se marca a sí misma", () => {
    expect(localOverrideFor(llavero, { id: 2, store_id: 2 }, TIENDA_2)).toBeNull();
  });

  it("el admin no tiene tienda de referencia", () => {
    expect(localOverrideFor(llavero, { id: 1, store_id: null }, ADMIN)).toBeNull();
  });

  it("sin promo local no hay marca", () => {
    expect(localOverrideFor(product(1, "X", [GLOBAL, LOCAL_T9]), { id: 1, store_id: null }, TIENDA_2)).toBeNull();
  });
});
