import { describe, expect, it } from "vitest";
import type { Bundle, ProductLight } from "@tadaima/api";
import {
  addComponent,
  assembleErrorText,
  componentsSentence,
  componentsSignature,
  draftFromBundle,
  draftLines,
  draftToInput,
  emptyDraft,
  isEmptyBundleDraft,
  MAX_QTY,
  nextSku,
  parseMoney,
  removeComponent,
  setQuantity,
  suggestBundleName,
  toDraftComponent,
  toggleComponent,
  totalPieces,
  validateArmado,
  validateComponentes,
  validateDatos,
} from "./bundleDraft";
import type { BundleDraft, BundleDraftComponent } from "./bundleDraft";

/** Producto como lo manda una API vieja: SIN `stock_bodega`. */
const BASE_PRODUCT: ProductLight = {
  id: 1, name: "Goku", sku: "FIG-001", barcode: null, active: true, category_id: null,
  prices: { price_1: 250, price_2: 230, price_3: null, price_4: null, price_5: null },
  image: null, allow_cash: true, allow_card: true, stock_total: 10,
};

const product = (over: Partial<ProductLight> = {}): ProductLight => ({ ...BASE_PRODUCT, stock_bodega: 4, ...over });

const comp = (over: Partial<BundleDraftComponent> = {}): BundleDraftComponent => ({
  productId: 1, name: "Goku", sku: "FIG-001", image: null, quantity: 1, unitPrice: 250,
  stockExh: 10, stockBod: 4, ...over,
});

const GOKU = comp();
const VEGETA = comp({ productId: 2, name: "Vegeta", sku: "FIG-002", unitPrice: 300 });

/** Borrador válido en el paso de datos (2 productos, nombre, precio y SKU). */
const validDraft = (over: Partial<BundleDraft> = {}): BundleDraft => ({
  ...emptyDraft(), components: [GOKU, VEGETA], name: "Paquete Saiyajin", price1: "450", sku: "PAQ-0001", ...over,
});

describe("emptyDraft", () => {
  it("arranca sin componentes, sin armar y con 1 paquete a armar por default", () => {
    const d = emptyDraft();
    expect(d.components).toEqual([]);
    expect([d.name, d.sku, d.barcode, d.price1]).toEqual(["", "", "", ""]);
    expect([d.nameTouched, d.skuTouched, d.buildNow]).toEqual([false, false, false]);
    expect(d.buildQty).toBe("1");
    expect(d.buildStoreId).toBeNull();
  });
});

describe("toDraftComponent", () => {
  it("toma precio normal, foto y stock de la tienda", () => {
    expect(toDraftComponent(product(), true)).toEqual(GOKU);
  });

  it("los tomos llevan su número de volumen en el nombre", () => {
    expect(toDraftComponent(product({ name: "Naruto", volume_number: 3 }), true).name).toBe("Naruto Vol. 3");
  });

  it("sin tienda el stock queda en null; sin precio queda $0; sin bodega 0", () => {
    const c = toDraftComponent(product({ prices: { price_1: null, price_2: null, price_3: null, price_4: null, price_5: null } }), false);
    expect([c.stockExh, c.stockBod, c.unitPrice]).toEqual([null, null, 0]);
    const d = toDraftComponent(BASE_PRODUCT, true);
    expect(d.stockBod).toBe(0);
  });
});

describe("addComponent / removeComponent / setQuantity", () => {
  it("agrega al final y, si ya está, suma una pieza sin mutar", () => {
    const one = addComponent([], product(), true);
    expect(one).toHaveLength(1);
    const twice = addComponent(one, product(), true);
    expect(twice[0]?.quantity).toBe(2);
    expect(one[0]?.quantity).toBe(1);
    const withVegeta = addComponent(twice, product({ id: 2, name: "Vegeta" }), true);
    expect(withVegeta.map((c) => c.productId)).toEqual([1, 2]);
  });

  it("sumar piezas respeta el tope", () => {
    const maxed = addComponent([comp({ quantity: MAX_QTY })], product(), true);
    expect(maxed[0]?.quantity).toBe(MAX_QTY);
  });

  it("quita por id", () => {
    expect(removeComponent([GOKU, VEGETA], 1)).toEqual([VEGETA]);
    expect(removeComponent([GOKU], 99)).toEqual([GOKU]);
  });

  it("setQuantity acota a 1..MAX_QTY, trunca decimales y NaN cae a 1", () => {
    const get = (qty: number) => setQuantity([GOKU, VEGETA], 1, qty)[0]?.quantity;
    expect(get(5)).toBe(5);
    expect(get(0)).toBe(1);
    expect(get(-3)).toBe(1);
    expect(get(2.9)).toBe(2);
    expect(get(MAX_QTY + 50)).toBe(MAX_QTY);
    expect(get(Number.NaN)).toBe(1);
    expect(setQuantity([GOKU, VEGETA], 1, 5)[1]).toEqual(VEGETA);
  });

  it("totalPieces suma cantidades", () => {
    expect(totalPieces([comp({ quantity: 2 }), VEGETA])).toBe(3);
    expect(totalPieces([])).toBe(0);
  });
});

describe("validateComponentes", () => {
  it("pide al menos 2 productos distintos", () => {
    expect(validateComponentes(emptyDraft())).toMatch(/al menos 2/);
    expect(validateComponentes({ ...emptyDraft(), components: [comp({ quantity: 5 })] })).toMatch(/al menos 2/);
  });

  it("cada producto con cantidad ≥ 1", () => {
    expect(validateComponentes({ ...emptyDraft(), components: [GOKU, comp({ productId: 2, quantity: 0 })] })).toMatch(/cantidad/);
    expect(validateComponentes({ ...emptyDraft(), components: [GOKU, VEGETA] })).toBeNull();
  });
});

describe("validateDatos", () => {
  it("acepta un borrador completo", () => {
    expect(validateDatos(validDraft())).toBeNull();
    expect(validateDatos(validDraft({ barcode: "4006381333931", price2: "400", description: "Combo" }))).toBeNull();
  });

  it("pide nombre", () => {
    expect(validateDatos(validDraft({ name: "  " }))).toMatch(/nombre/i);
    expect(validateDatos(validDraft({ name: "x".repeat(151) }))).toMatch(/largo/i);
  });

  it("pide precio normal mayor a $0", () => {
    expect(validateDatos(validDraft({ price1: "" }))).toMatch(/precio normal/i);
    expect(validateDatos(validDraft({ price1: "0" }))).toMatch(/precio normal/i);
    expect(validateDatos(validDraft({ price1: "abc" }))).toMatch(/precio normal/i);
  });

  it("el SKU no puede ir vacío ni pasar de 100 caracteres", () => {
    expect(validateDatos(validDraft({ sku: " " }))).toMatch(/SKU no puede ir vacío/);
    expect(validateDatos(validDraft({ sku: "A".repeat(101) }))).toMatch(/SKU es muy largo/);
    expect(validateDatos(validDraft({ sku: "A".repeat(100) }))).toBeNull();
  });

  it("el código de barras, si viene, debe ser EAN-13 válido", () => {
    expect(validateDatos(validDraft({ barcode: "123" }))).toMatch(/13 dígitos/);
    expect(validateDatos(validDraft({ barcode: "4006381333932" }))).toMatch(/13 dígitos/);
    expect(validateDatos(validDraft({ barcode: "" }))).toBeNull();
  });

  it("los demás precios son > $0 o vacíos", () => {
    expect(validateDatos(validDraft({ price3: "0" }))).toMatch(/demás precios/);
    expect(validateDatos(validDraft({ price5: "abc" }))).toMatch(/demás precios/);
    expect(validateDatos(validDraft({ price4: "-5" }))).toMatch(/demás precios/);
    expect(validateDatos(validDraft({ price2: "  " }))).toBeNull();
  });

  it("la descripción tiene tope", () => {
    expect(validateDatos(validDraft({ description: "d".repeat(501) }))).toMatch(/descripción/i);
  });
});

describe("validateArmado", () => {
  it("sin 'armar ahora' no valida nada", () => {
    expect(validateArmado(validDraft({ buildNow: false, buildQty: "" }), 0)).toBeNull();
  });

  it("pide tienda, cantidad ≥ 1 y respeta el tope del server", () => {
    expect(validateArmado(validDraft({ buildNow: true }), 5)).toMatch(/elige una tienda/);
    expect(validateArmado(validDraft({ buildNow: true, buildStoreId: 1, buildQty: "0" }), 5)).toMatch(/1 o más/);
    expect(validateArmado(validDraft({ buildNow: true, buildStoreId: 1, buildQty: "abc" }), 5)).toMatch(/1 o más/);
    expect(validateArmado(validDraft({ buildNow: true, buildStoreId: 1, buildQty: "6" }), 5)).toBe("En esa tienda solo puedes armar 5.");
    expect(validateArmado(validDraft({ buildNow: true, buildStoreId: 1, buildQty: "5" }), 5)).toBeNull();
  });

  it("sin tope conocido (null) deja pasar cualquier cantidad válida", () => {
    expect(validateArmado(validDraft({ buildNow: true, buildStoreId: 1, buildQty: "50" }), null)).toBeNull();
  });
});

describe("draftToInput", () => {
  it("manda la forma exacta: descripción null, precios opcionales null, sin sku/barcode vacíos", () => {
    const input = draftToInput(validDraft({ name: " Paquete Saiyajin ", sku: "", price1: "450.50" }));
    expect(input).toEqual({
      name: "Paquete Saiyajin",
      description: null,
      prices: { price_1: 450.5, price_2: null, price_3: null, price_4: null, price_5: null },
      components: [{ product_id: 1, quantity: 1 }, { product_id: 2, quantity: 1 }],
    });
    expect(input).not.toHaveProperty("sku");
    expect(input).not.toHaveProperty("barcode");
  });

  it("con sku, código y descripción los manda recortados; respeta el orden de los componentes", () => {
    const input = draftToInput(validDraft({
      sku: " PAQ-0007 ", barcode: " 4006381333931 ", description: " Combo ", price2: "400",
      components: [comp({ productId: 9, quantity: 3 }), GOKU],
    }));
    expect(input).toMatchObject({
      sku: "PAQ-0007", barcode: "4006381333931", description: "Combo",
      prices: { price_1: 450, price_2: 400 },
      components: [{ product_id: 9, quantity: 3 }, { product_id: 1, quantity: 1 }],
    });
  });
});

describe("draftFromBundle", () => {
  const bundle: Bundle = {
    id: 7, product_type: "bundle", name: "Paquete Saiyajin", sku: "PAQ-0007", barcode: "4006381333931",
    description: "Combo", active: true, catalog_visible: false,
    prices: { price_1: 450, price_2: 400, price_3: null, price_4: null, price_5: null },
    image: null, images: [], components_count: 2, suggested_price_sum: 550,
    components: [
      { product_id: 2, name: "Vegeta", sku: "FIG-002", quantity: 1, position: 2, image: null, price_1: 300 },
      { product_id: 1, name: "Goku", sku: "FIG-001", quantity: 2, position: 1, image: "g.png", price_1: null },
    ],
    stock_total: 3, composition_locked: true, availability: [], created_at: "", updated_at: "",
  };

  it("marca nombre y SKU como tocados, ordena por posición y deja el stock en null", () => {
    const d = draftFromBundle(bundle);
    expect([d.nameTouched, d.skuTouched]).toEqual([true, true]);
    expect([d.name, d.sku, d.barcode, d.description]).toEqual(["Paquete Saiyajin", "PAQ-0007", "4006381333931", "Combo"]);
    expect([d.price1, d.price2, d.price3]).toEqual(["450", "400", ""]);
    expect(d.components.map((c) => c.productId)).toEqual([1, 2]);
    expect(d.components[0]).toEqual({
      productId: 1, name: "Goku", sku: "FIG-001", image: "g.png", quantity: 2, unitPrice: 0, stockExh: null, stockBod: null,
    });
    expect(d.buildNow).toBe(false);
  });

  it("descripción y código null quedan como cadena vacía", () => {
    const d = draftFromBundle({ ...bundle, description: null, barcode: null });
    expect([d.description, d.barcode]).toEqual(["", ""]);
  });
});

describe("suggestBundleName", () => {
  const names = (n: number) => Array.from({ length: n }, (_, i) => comp({ productId: i + 1, name: `P${i + 1}` }));

  it("0 → vacío; 1 → 'Paquete A'; 2 → 'Paquete A + B'; 3+ → 'Paquete A + B + N más'", () => {
    expect(suggestBundleName(names(0))).toBe("");
    expect(suggestBundleName(names(1))).toBe("Paquete P1");
    expect(suggestBundleName(names(2))).toBe("Paquete P1 + P2");
    expect(suggestBundleName(names(3))).toBe("Paquete P1 + P2 + 1 más");
    expect(suggestBundleName(names(5))).toBe("Paquete P1 + P2 + 3 más");
  });
});

describe("nextSku", () => {
  it("arranca en PAQ-0001 y sigue al más alto", () => {
    expect(nextSku([])).toBe("PAQ-0001");
    expect(nextSku(["PAQ-0001", "PAQ-0003", "PAQ-0002"])).toBe("PAQ-0004");
  });

  it("ignora mayúsculas, otros prefijos y sufijos no numéricos", () => {
    expect(nextSku(["paq-0007", "FIG-0100", "PAQ-X", "PAQ-", "PAQ0009"])).toBe("PAQ-0008");
  });

  it("no trunca números de más de 4 dígitos y respeta un prefijo distinto", () => {
    expect(nextSku(["PAQ-12345"])).toBe("PAQ-12346");
    expect(nextSku(["KIT-0002", "PAQ-0009"], "KIT")).toBe("KIT-0003");
  });
});

describe("componentsSignature / draftLines", () => {
  it("firma ordenada por product_id, independiente del orden de captura", () => {
    expect(componentsSignature([{ product_id: 45, quantity: 1 }, { product_id: 12, quantity: 2 }])).toBe("12x2,45x1");
    expect(componentsSignature([])).toBe("");
  });

  it("draftLines conserva el orden del borrador", () => {
    expect(draftLines({ components: [VEGETA, comp({ quantity: 2 })] })).toEqual([
      { product_id: 2, quantity: 1 }, { product_id: 1, quantity: 2 },
    ]);
  });
});

describe("isEmptyBundleDraft", () => {
  it("vacío = igual a emptyDraft, sin contar el código de barras", () => {
    expect(isEmptyBundleDraft(emptyDraft())).toBe(true);
    expect(isEmptyBundleDraft({ ...emptyDraft(), barcode: "4006381333931" })).toBe(true);
  });

  it("cualquier otra captura lo hace no-vacío", () => {
    expect(isEmptyBundleDraft({ ...emptyDraft(), name: "x" })).toBe(false);
    expect(isEmptyBundleDraft({ ...emptyDraft(), components: [GOKU] })).toBe(false);
    expect(isEmptyBundleDraft({ ...emptyDraft(), buildNow: true })).toBe(false);
    // La tienda y la cantidad las pre-llena el asistente: no cuentan como captura.
    expect(isEmptyBundleDraft({ ...emptyDraft(), buildStoreId: 3 })).toBe(true);
    expect(isEmptyBundleDraft({ ...emptyDraft(), buildQty: "3" })).toBe(true);
  });
});

describe("assembleErrorText", () => {
  it("usa el message del error", () => {
    expect(assembleErrorText({ message: "No hay stock" }, "Falló")).toBe("No hay stock");
    expect(assembleErrorText(new Error("Sin red"), "Falló")).toBe("Sin red");
  });

  it("con errors de validación gana el primer mensaje de campo", () => {
    const err = { message: "Datos inválidos", errors: { quantity: ["Solo puedes armar 3."], store_id: ["Elige tienda"] } };
    expect(assembleErrorText(err, "Falló")).toBe("Solo puedes armar 3.");
  });

  it("vacío, null o sin forma conocida → fallback", () => {
    expect(assembleErrorText({ message: "" }, "Falló")).toBe("Falló");
    expect(assembleErrorText({ message: "", errors: {} }, "Falló")).toBe("Falló");
    expect(assembleErrorText(null, "Falló")).toBe("Falló");
    expect(assembleErrorText("texto", "Falló")).toBe("Falló");
  });
});

describe("parseMoney", () => {
  it("acepta montos con $, espacios y comas de miles", () => {
    expect(parseMoney("450")).toBe(450);
    expect(parseMoney(" $ 1,200.50 ")).toBe(1200.5);
    expect(parseMoney("0.99")).toBe(0.99);
  });

  it("rechaza lo que parseFloat dejaba pasar", () => {
    expect(parseMoney("1.2.3")).toBeNaN();
    expect(parseMoney("12abc")).toBeNaN();
    expect(parseMoney("")).toBeNaN();
    expect(parseMoney("1.234")).toBeNaN();
  });
});

describe("toggleComponent", () => {
  it("entra con 1 pieza si no está y sale si ya estaba", () => {
    const added = toggleComponent([], BASE_PRODUCT, true);
    expect(added).toHaveLength(1);
    expect(added[0]?.quantity).toBe(1);
    expect(toggleComponent(added, BASE_PRODUCT, true)).toEqual([]);
  });
  it("no toca la cantidad de los demás", () => {
    const list = [{ ...GOKU, productId: 999, quantity: 4 }];
    const next = toggleComponent(list, BASE_PRODUCT, true);
    expect(next).toHaveLength(2);
    expect(next[0]?.quantity).toBe(4);
  });
});

describe("componentsSentence", () => {
  it("arma la frase con cantidades", () => {
    expect(componentsSentence([])).toBe("");
    expect(componentsSentence([{ ...GOKU, quantity: 1 }])).toBe(`1 × ${GOKU.name}`);
    expect(componentsSentence([{ ...GOKU, quantity: 1 }, { ...GOKU, productId: 2, name: "Llavero", quantity: 4 }])).toBe(`1 × ${GOKU.name} + 4 × Llavero`);
  });
  it("corta en 3 nombres y dice cuántos faltan", () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({ ...GOKU, productId: n, name: `P${n}`, quantity: n }));
    expect(componentsSentence(five)).toBe("1 × P1 + 2 × P2 + 3 × P3 y 2 más");
  });
});
