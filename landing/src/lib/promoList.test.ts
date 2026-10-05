import { describe, expect, it } from "vitest";
import type { Promotion } from "@tadaima/api";
import {
  canMutatePromo, countByChip, filterPromos, getPromoDisplayStatus,
  sortPromosForList, visiblePromosFor, type PromoViewer,
} from "./promoList";

const NOW = new Date("2026-10-03T20:00:00Z");

function promo(over: Partial<Promotion> = {}): Promotion {
  return {
    id: 1, name: "2x1 Figuras", type: "nxm", buy_n: 2, pay_m: 1,
    starts_at: null, ends_at: null, status: "active", priority: 0, store_id: null,
    products: [{ id: 10, name: "Figura Goku" }], products_count: 1,
    ...over,
  };
}

const ADMIN: PromoViewer = { isAdmin: true, canManage: true, storeId: 1 };
const GERENTE: PromoViewer = { isAdmin: false, canManage: true, storeId: 2 };
const CAJERO: PromoViewer = { isAdmin: false, canManage: false, storeId: 2 };

describe("getPromoDisplayStatus", () => {
  it("activa sin fechas está vigente", () => {
    expect(getPromoDisplayStatus(promo(), NOW)).toBe("vigente");
  });

  it("activa con inicio futuro está programada", () => {
    expect(getPromoDisplayStatus(promo({ starts_at: "2026-10-13T07:00:00Z" }), NOW)).toBe("programada");
  });

  it("activa con fin pasado ya venció aunque el server no la haya marcado", () => {
    expect(getPromoDisplayStatus(promo({ ends_at: "2026-09-01T06:59:59Z" }), NOW)).toBe("vencida");
  });

  it("respeta pausada y vencida del server", () => {
    expect(getPromoDisplayStatus(promo({ status: "paused" }), NOW)).toBe("pausada");
    expect(getPromoDisplayStatus(promo({ status: "expired" }), NOW)).toBe("vencida");
  });

  it("mayoreo sin números queda sin configurar", () => {
    const sinNumeros = promo({ type: "qty_discount", buy_n: null, pay_m: null, min_qty: null, discount_per_unit: null });
    expect(getPromoDisplayStatus(sinNumeros, NOW)).toBe("sin_configurar");
  });
});

describe("visiblePromosFor", () => {
  const global = promo({ id: 1 });
  const deMiTienda = promo({ id: 2, store_id: 2 });
  const deOtraTienda = promo({ id: 3, store_id: 9 });
  const pausada = promo({ id: 4, status: "paused" });
  const sinProductos = promo({ id: 5, products: [], products_count: 0 });
  const todas = [global, deMiTienda, deOtraTienda, pausada, sinProductos];

  it("el admin ve todas", () => {
    expect(visiblePromosFor(todas, ADMIN, NOW).map(p => p.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("el gerente ve las generales y las de su tienda, en cualquier estado", () => {
    expect(visiblePromosFor(todas, GERENTE, NOW).map(p => p.id)).toEqual([1, 2, 4, 5]);
  });

  it("el cajero solo ve las que aplican o van a aplicar, y con productos", () => {
    expect(visiblePromosFor(todas, CAJERO, NOW).map(p => p.id)).toEqual([1, 2]);
  });
});

describe("canMutatePromo", () => {
  it("el admin modifica cualquiera", () => {
    expect(canMutatePromo(promo({ store_id: 9 }), ADMIN)).toBe(true);
  });

  it("el gerente solo modifica las de su tienda", () => {
    expect(canMutatePromo(promo({ store_id: 2 }), GERENTE)).toBe(true);
    expect(canMutatePromo(promo({ store_id: null }), GERENTE)).toBe(false);
    expect(canMutatePromo(promo({ store_id: 9 }), GERENTE)).toBe(false);
  });

  it("sin permiso de promos nadie modifica", () => {
    expect(canMutatePromo(promo({ store_id: 2 }), CAJERO)).toBe(false);
  });
});

describe("filterPromos", () => {
  const lista = [
    promo({ id: 1, name: "2x1 Figuras" }),
    promo({ id: 2, name: "Buen Fin", status: "paused", products: [{ id: 11, name: "Llavero Pokémon" }] }),
    promo({ id: 3, name: "Verano", status: "expired" }),
  ];

  it("filtra por chip de estado", () => {
    expect(filterPromos(lista, { query: "", chip: "activas", now: NOW }).map(p => p.id)).toEqual([1]);
    expect(filterPromos(lista, { query: "", chip: "pausadas", now: NOW }).map(p => p.id)).toEqual([2]);
    expect(filterPromos(lista, { query: "", chip: "vencidas", now: NOW }).map(p => p.id)).toEqual([3]);
    expect(filterPromos(lista, { query: "", chip: "todas", now: NOW })).toHaveLength(3);
  });

  it("busca por nombre de la promo sin acentos ni mayúsculas", () => {
    expect(filterPromos(lista, { query: "FIGURAS", chip: "todas", now: NOW }).map(p => p.id)).toEqual([1]);
  });

  it("busca por el nombre de un producto que está en la promo", () => {
    expect(filterPromos(lista, { query: "pokemon", chip: "todas", now: NOW }).map(p => p.id)).toEqual([2]);
  });

  it("busca por la etiqueta de la promo (2x1)", () => {
    expect(filterPromos(lista, { query: "2x1", chip: "vencidas", now: NOW }).map(p => p.id)).toEqual([3]);
  });
});

describe("sortPromosForList y countByChip", () => {
  const lista = [
    promo({ id: 1, name: "Zeta", status: "expired" }),
    promo({ id: 2, name: "Beta", status: "paused" }),
    promo({ id: 3, name: "Gama", starts_at: "2026-11-01T07:00:00Z" }),
    promo({ id: 4, name: "Alfa" }),
  ];

  it("ordena vigentes, programadas, pausadas y al final vencidas", () => {
    expect(sortPromosForList(lista, NOW).map(p => p.id)).toEqual([4, 3, 2, 1]);
  });

  it("no muta la lista original", () => {
    const copia = [...lista];
    sortPromosForList(lista, NOW);
    expect(lista).toEqual(copia);
  });

  it("cuenta por chip", () => {
    expect(countByChip(lista, NOW)).toEqual({ todas: 4, activas: 2, pausadas: 1, vencidas: 1 });
  });
});
