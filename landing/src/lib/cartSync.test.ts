import { describe, it, expect } from "vitest";
import {
  buildPolicyIndex,
  promoSignature,
  syncCartWithCatalog,
  type CartLineLike,
  type MesaLike,
  type PolicySource,
  type ProductPolicy,
} from "./cartSync";
import type { PromoSnapshot } from "@/types/pos";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** La promo 2x1 que Joel borró (el bug reportado). */
const promo2x1 = (over: Partial<PromoSnapshot> = {}): PromoSnapshot => ({
  id: 7,
  name: "Verano 2026",
  type: "nxm",
  buy_n: 2,
  pay_m: 1,
  priority: 0,
  ...over,
});

/** El mayoreo que la reemplazó: desde 2 pzas, −$100 a cada una. */
const promoMayoreo = (over: Partial<PromoSnapshot> = {}): PromoSnapshot => ({
  id: 9,
  name: "Buen Fin 2026",
  type: "qty_discount",
  buy_n: null,
  pay_m: null,
  min_qty: 2,
  discount_per_unit: 100,
  priority: 0,
  ...over,
});

interface TestLine extends CartLineLike {
  quantity: number;
}
interface TestMesa extends MesaLike<TestLine> {
  id: string;
}

const line = (over: Partial<TestLine> = {}): TestLine => ({
  lineId: over.lineId ?? "L1",
  quantity: 1,
  ...over,
  product: {
    id: "1",
    name: "Testt#1",
    price_a: 1500,
    allow_cash: true,
    allow_card: true,
    active_promotions: [],
    ...over.product,
  },
});

const mesa = (items: TestLine[], id = "M1"): TestMesa => ({ id, items });

const policy = (over: Partial<ProductPolicy> = {}): ProductPolicy => ({
  active_promotions: [],
  allow_cash: true,
  allow_card: true,
  price_a: 1500,
  ...over,
});

const index = (entries: Record<string, ProductPolicy>): Map<string, ProductPolicy> =>
  new Map(Object.entries(entries));

// ─── promoSignature ──────────────────────────────────────────────────────────

describe("promoSignature — compara la matemática, no los ids", () => {
  it("mismo set en distinto orden → misma firma", () => {
    const a = promoSignature([promo2x1(), promoMayoreo()]);
    const b = promoSignature([promoMayoreo(), promo2x1()]);
    expect(a).toBe(b);
  });

  it("promo EDITADA conservando su id → firma distinta", () => {
    // Este es el caso que un set de ids dejaría pasar en silencio: el dueño
    // baja el mayoreo de −$100 a −$50 y el total del carrito cambiaría sin
    // que nadie lo notara.
    const antes = promoSignature([promoMayoreo({ discount_per_unit: 100 })]);
    const despues = promoSignature([promoMayoreo({ discount_per_unit: 50 })]);
    expect(antes).not.toBe(despues);
  });

  it("cambio en la restricción de pago de la promo → firma distinta", () => {
    const antes = promoSignature([promoMayoreo()]);
    const despues = promoSignature([promoMayoreo({ allow_card: false })]);
    expect(antes).not.toBe(despues);
  });

  it("cambio de ámbito global → local → firma distinta", () => {
    const global = promoSignature([promoMayoreo({ store_id: null })]);
    const local = promoSignature([promoMayoreo({ store_id: 3 })]);
    expect(global).not.toBe(local);
  });

  it("sin promos y lista vacía dan la misma firma", () => {
    expect(promoSignature(undefined)).toBe(promoSignature([]));
  });
});

// ─── Identidad de referencias (la guarda anti-bucle) ─────────────────────────

describe("syncCartWithCatalog — identidad de referencias", () => {
  it("índice vacío → devuelve LA MISMA referencia de entrada", () => {
    const mesas = [mesa([line()])];
    const out = syncCartWithCatalog(mesas, new Map());
    expect(out.mesas).toBe(mesas);
    expect(out.changed).toBe(false);
  });

  it("datos idénticos a los del snapshot → misma referencia, sin cambios", () => {
    const mesas = [mesa([line({ product: { id: "1", name: "Testt#1", price_a: 1500, allow_cash: true, allow_card: true, active_promotions: [promoMayoreo()] } })])];
    const out = syncCartWithCatalog(mesas, index({ "1": policy({ active_promotions: [promoMayoreo()] }) }));
    expect(out.mesas).toBe(mesas);
    expect(out.changed).toBe(false);
    expect(out.changes).toEqual([]);
  });

  it("solo la mesa afectada se reconstruye; las demás conservan su referencia", () => {
    const mesa1 = mesa([line({ lineId: "L1", product: { id: "1", name: "A", price_a: 100 } })], "M1");
    const mesa2 = mesa([line({ lineId: "L2", product: { id: "2", name: "B", price_a: 200 } })], "M2");
    const out = syncCartWithCatalog([mesa1, mesa2], index({ "2": policy({ price_a: 250 }) }));

    expect(out.changed).toBe(true);
    expect(out.mesas[0]).toBe(mesa1);
    expect(out.mesas[1]).not.toBe(mesa2);
  });

  it("dentro de una mesa, las líneas no afectadas conservan su referencia", () => {
    const intacta = line({ lineId: "L1", product: { id: "1", name: "A", price_a: 100 } });
    const afectada = line({ lineId: "L2", product: { id: "2", name: "B", price_a: 200 } });
    const out = syncCartWithCatalog([mesa([intacta, afectada])], index({ "2": policy({ price_a: 250 }) }));

    expect(out.mesas[0]!.items[0]).toBe(intacta);
    expect(out.mesas[0]!.items[1]).not.toBe(afectada);
  });

  it("NO muta la entrada", () => {
    const mesas = [mesa([line({ product: { id: "1", name: "A", price_a: 100, active_promotions: [promo2x1()] } })])];
    const antes = structuredClone(mesas);
    syncCartWithCatalog(mesas, index({ "1": policy({ price_a: 999, active_promotions: [promoMayoreo()] }) }));
    expect(mesas).toEqual(antes);
  });
});

// ─── El bug reportado ────────────────────────────────────────────────────────

describe("syncCartWithCatalog — reemplazo de promos (el bug de Joel)", () => {
  it("la promo borrada se va y entra la nueva", () => {
    const mesas = [mesa([line({ product: { id: "1", name: "Testt#1", price_a: 1500, active_promotions: [promo2x1()] } })])];
    const out = syncCartWithCatalog(mesas, index({ "1": policy({ active_promotions: [promoMayoreo()] }) }));

    const promos = out.mesas[0]!.items[0]!.product.active_promotions!;
    expect(promos).toHaveLength(1);
    expect(promos[0]!.name).toBe("Buen Fin 2026");
    expect(out.changes[0]!.promosChanged).toBe(true);
  });

  it("promo borrada sin reemplazo → la línea queda sin promos", () => {
    const mesas = [mesa([line({ product: { id: "1", name: "Testt#1", price_a: 1500, active_promotions: [promo2x1()] } })])];
    const out = syncCartWithCatalog(mesas, index({ "1": policy({ active_promotions: [] }) }));

    expect(out.mesas[0]!.items[0]!.product.active_promotions).toEqual([]);
    expect(out.changed).toBe(true);
  });

  it("producto AUSENTE del índice → línea intacta (no se vacían promos)", () => {
    // Pasa de verdad: el pool encoge cuando el cajero borra la búsqueda.
    const mesas = [mesa([line({ product: { id: "1", name: "Testt#1", price_a: 1500, active_promotions: [promo2x1()] } })])];
    const out = syncCartWithCatalog(mesas, index({ "999": policy() }));

    expect(out.mesas).toBe(mesas);
    expect(out.changed).toBe(false);
  });
});

// ─── Exclusiones ─────────────────────────────────────────────────────────────

describe("syncCartWithCatalog — líneas que NO se tocan", () => {
  it("línea de apartado (sellingCatalogId) queda intacta", () => {
    const mesas = [mesa([line({ sellingCatalogId: 4, product: { id: "1", name: "A", price_a: 500, active_promotions: [promo2x1()] } })])];
    const out = syncCartWithCatalog(mesas, index({ "1": policy({ price_a: 900, active_promotions: [promoMayoreo()] }) }));
    expect(out.mesas).toBe(mesas);
  });

  it("liquidación de preventa conserva su precio prorrateado", () => {
    const mesas = [mesa([line({ isFromPreSale: true, product: { id: "1", name: "A", price_a: 83.33 } })])];
    const out = syncCartWithCatalog(mesas, index({ "1": policy({ price_a: 250 }) }));
    expect(out.mesas[0]!.items[0]!.product.price_a).toBe(83.33);
  });

  it("item de preventa ya ENTREGADO sigue en $0", () => {
    const mesas = [mesa([line({ isFromPreSale: true, product: { id: "1", name: "A", price_a: 0 } })])];
    const out = syncCartWithCatalog(mesas, index({ "1": policy({ price_a: 250 }) }));
    expect(out.mesas[0]!.items[0]!.product.price_a).toBe(0);
  });

  it("línea dañada: promos SÍ se actualizan, el precio NO", () => {
    const mesas = [mesa([line({ isDamaged: true, product: { id: "1", name: "A", price_a: 100, active_promotions: [promo2x1()] } })])];
    const out = syncCartWithCatalog(mesas, index({ "1": policy({ price_a: 250, active_promotions: [promoMayoreo()] }) }));

    const p = out.mesas[0]!.items[0]!.product;
    expect(p.price_a).toBe(100);
    expect(p.active_promotions![0]!.name).toBe("Buen Fin 2026");
  });

  it("split: las DOS líneas del mismo producto se actualizan igual", () => {
    const padre = line({ lineId: "L1", product: { id: "1", name: "A", price_a: 100, active_promotions: [promo2x1()] } });
    const hija = { ...line({ lineId: "L2", product: { id: "1", name: "A", price_a: 100, active_promotions: [promo2x1()] } }), parentLineId: "L1" };
    const out = syncCartWithCatalog([mesa([padre, hija])], index({ "1": policy({ active_promotions: [promoMayoreo()] }) }));

    const [a, b] = out.mesas[0]!.items;
    expect(promoSignature(a!.product.active_promotions)).toBe(promoSignature(b!.product.active_promotions));
    expect(a!.product.active_promotions![0]!.name).toBe("Buen Fin 2026");
  });
});

// ─── Flags de pago ───────────────────────────────────────────────────────────

describe("syncCartWithCatalog — restricción de pago del producto", () => {
  it("allow_card true → false se propaga y se reporta", () => {
    const mesas = [mesa([line({ product: { id: "1", name: "A", price_a: 100, allow_card: true } })])];
    const out = syncCartWithCatalog(mesas, index({ "1": policy({ price_a: 100, allow_card: false }) }));

    expect(out.mesas[0]!.items[0]!.product.allow_card).toBe(false);
    expect(out.changes[0]!.flagsChanged).toBe(true);
  });

  it("snapshot viejo sin flags → default true, sin cambio espurio", () => {
    const mesas = [mesa([line({ product: { id: "1", name: "A", price_a: 100 } })])];
    // El objeto de arriba ya trae allow_cash/allow_card true por el fixture;
    // aquí se prueba el caso del payload sin flags declarados.
    const sinFlags = [mesa([{ ...line(), product: { id: "1", name: "A", price_a: 100 } }])];
    expect(syncCartWithCatalog(mesas, index({ "1": policy({ price_a: 100 }) })).changed).toBe(false);
    expect(syncCartWithCatalog(sinFlags, index({ "1": policy({ price_a: 100 }) })).changed).toBe(false);
  });
});

// ─── Precios ─────────────────────────────────────────────────────────────────

describe("syncCartWithCatalog — precios de catálogo", () => {
  it("precio cambiado se actualiza y se reporta con antes/después", () => {
    const mesas = [mesa([line({ product: { id: "1", name: "Camiseta", price_a: 100 } })])];
    const out = syncCartWithCatalog(mesas, index({ "1": policy({ price_a: 120 }) }));

    expect(out.mesas[0]!.items[0]!.product.price_a).toBe(120);
    expect(out.changes[0]!.priceChanged).toEqual({ from: 100, to: 120 });
  });

  it("un nivel de precio RETIRADO del catálogo no se queda pegado", () => {
    const mesas = [mesa([line({ product: { id: "1", name: "A", price_a: 100, price_b: 80 } })])];
    const out = syncCartWithCatalog(mesas, index({ "1": policy({ price_a: 100, active_promotions: [promoMayoreo()] }) }));
    expect(out.mesas[0]!.items[0]!.product.price_b).toBeUndefined();
  });

  it("el descuento manual de la línea sobrevive al cambio de precio", () => {
    const conDescuento = { ...line({ product: { id: "1", name: "A", price_a: 100 } }), discount: { kind: "percent", basis: "line", value: 10 } };
    const out = syncCartWithCatalog([mesa([conDescuento])], index({ "1": policy({ price_a: 120 }) }));

    const item = out.mesas[0]!.items[0]! as typeof conDescuento;
    expect(item.product.price_a).toBe(120);
    expect(item.discount).toEqual({ kind: "percent", basis: "line", value: 10 });
  });

  it("el flag skipPromo se conserva (no se limpia porque la promo cambió)", () => {
    const renunciada = { ...line({ product: { id: "1", name: "A", price_a: 100, active_promotions: [promo2x1()] } }), skipPromo: true };
    const out = syncCartWithCatalog([mesa([renunciada])], index({ "1": policy({ price_a: 100, active_promotions: [promoMayoreo()] }) }));

    const item = out.mesas[0]!.items[0]! as typeof renunciada;
    expect(item.skipPromo).toBe(true);
    expect(item.product.active_promotions![0]!.name).toBe("Buen Fin 2026");
  });
});

// ─── buildPolicyIndex ────────────────────────────────────────────────────────

describe("buildPolicyIndex", () => {
  const source = (over: Partial<PolicySource> = {}): PolicySource => ({
    id: 1,
    allow_cash: true,
    allow_card: true,
    prices: { price_1: 100, price_2: 80 },
    active_promotions: [],
    ...over,
  });

  it("mapea precios y flags del payload del API", () => {
    const idx = buildPolicyIndex([[source()]]);
    const p = idx.get("1")!;
    expect(p.price_a).toBe(100);
    expect(p.price_b).toBe(80);
    expect(p.allow_cash).toBe(true);
  });

  it("niveles de precio en 0 o null se omiten", () => {
    const idx = buildPolicyIndex([[source({ prices: { price_1: 100, price_2: 0, price_3: null } })]]);
    const p = idx.get("1")!;
    expect(p.price_b).toBeUndefined();
    expect(p.price_c).toBeUndefined();
  });

  it("flags ausentes en el payload → default true", () => {
    const idx = buildPolicyIndex([[{ id: 1, prices: { price_1: 10 } }]]);
    expect(idx.get("1")!.allow_cash).toBe(true);
    expect(idx.get("1")!.allow_card).toBe(true);
  });

  it("fuentes posteriores GANAN sobre las anteriores", () => {
    // La Caja pasa [pool top, búsqueda, productos del carrito]: el consultado
    // por id es el más específico y debe mandar.
    const idx = buildPolicyIndex([
      [source({ prices: { price_1: 100 } })],
      [source({ prices: { price_1: 175 } })],
    ]);
    expect(idx.get("1")!.price_a).toBe(175);
  });

  it("fuentes vacías → índice vacío", () => {
    expect(buildPolicyIndex([[], []]).size).toBe(0);
  });
});
