import { describe, expect, it } from "vitest";
import {
  formatVigencia, formatVigenciaYmd, paymentRestrictionLabel, promoScopeLabel,
  promoSummarySentence, suggestPromoName,
} from "./promoPlain";

const HOY = "2026-10-03";

describe("formatVigenciaYmd", () => {
  it("sin fechas aplica siempre", () => {
    expect(formatVigenciaYmd("", "", HOY)).toBe("Sin fecha de fin");
  });

  it("mismo mes junta el rango", () => {
    expect(formatVigenciaYmd("2026-10-03", "2026-10-15", HOY)).toBe("Del 3 al 15 de octubre");
  });

  it("cruce de mes nombra los dos", () => {
    expect(formatVigenciaYmd("2026-10-28", "2026-11-05", HOY)).toBe("Del 28 de octubre al 5 de noviembre");
  });

  it("otro año lo dice", () => {
    expect(formatVigenciaYmd("2026-12-20", "2027-01-06", HOY)).toBe("Del 20 de diciembre al 6 de enero de 2027");
  });

  it("solo fin: hasta o terminó según la fecha", () => {
    expect(formatVigenciaYmd("", "2026-10-15", HOY)).toBe("Hasta el 15 de octubre");
    expect(formatVigenciaYmd("", "2026-09-13", HOY)).toBe("Terminó el 13 de septiembre");
  });

  it("solo inicio: empieza o desde según la fecha", () => {
    expect(formatVigenciaYmd("2026-10-13", "", HOY)).toBe("Empieza el 13 de octubre, sin fecha de fin");
    expect(formatVigenciaYmd("2026-09-01", "", HOY)).toBe("Desde el 1 de septiembre, sin fecha de fin");
  });

  it("un solo día", () => {
    expect(formatVigenciaYmd("2026-10-15", "2026-10-15", HOY)).toBe("Solo el 15 de octubre");
  });
});

describe("formatVigencia (ISO del server)", () => {
  it("lee el día en la zona del negocio, no en UTC", () => {
    // 15 de octubre 23:59 en Tijuana = 16 de octubre 06:59Z.
    const now = new Date("2026-10-03T20:00:00Z");
    expect(formatVigencia(null, "2026-10-16T06:59:59Z", now)).toBe("Hasta el 15 de octubre");
  });
});

describe("promoScopeLabel", () => {
  const nombres = new Map([[1, "Tadaima Centro"]]);

  it("sin tienda aplica en todas", () => {
    expect(promoScopeLabel(null, { isAdmin: true, canManage: true, storeId: 1 }, nombres)).toBe("Todas las tiendas");
  });

  it("el admin ve el nombre de la tienda", () => {
    expect(promoScopeLabel(1, { isAdmin: true, canManage: true, storeId: 5 }, nombres)).toBe("Solo Tadaima Centro");
  });

  it("los demás ven 'tu tienda'", () => {
    expect(promoScopeLabel(1, { isAdmin: false, canManage: true, storeId: 1 }, nombres)).toBe("Solo tu tienda");
  });
});

describe("paymentRestrictionLabel", () => {
  it("sin restricción no dice nada", () => {
    expect(paymentRestrictionLabel({ allow_cash: true, allow_card: true })).toBeNull();
    expect(paymentRestrictionLabel({})).toBeNull();
  });

  it("avisa cuando solo aplica con un método", () => {
    expect(paymentRestrictionLabel({ allow_card: false })).toBe("Solo pagando en efectivo");
    expect(paymentRestrictionLabel({ allow_cash: false })).toBe("Solo pagando con tarjeta");
  });
});

describe("suggestPromoName", () => {
  it("usa la categoría cuando se eligió completa", () => {
    expect(suggestPromoName("2x1", ["Mangas"])).toBe("2x1 en Mangas");
    expect(suggestPromoName("3x2", ["Mangas", "Figuras"])).toBe("3x2 en Mangas y Figuras");
  });

  it("sin categoría completa (o con muchas) deja solo la promo", () => {
    expect(suggestPromoName("2x1", [])).toBe("2x1");
    expect(suggestPromoName("2x1", ["A", "B", "C"])).toBe("2x1");
  });

  it("con un solo producto suelto usa su nombre", () => {
    expect(suggestPromoName("2x1", [], "Funko Goku")).toBe("2x1 en Funko Goku");
    expect(suggestPromoName("2x1", ["Mangas"], "Funko Goku")).toBe("2x1 en Mangas");
  });
});

describe("promoSummarySentence", () => {
  it("resume categorías completas y sueltos", () => {
    expect(promoSummarySentence({
      label: "2x1", productCount: 119, fullCategories: ["Mangas"], looseCount: 3,
      vigencia: "Sin fecha de fin", scope: "Todas las tiendas",
    })).toBe("2x1 en 119 productos (toda la categoría Mangas + 3 sueltos). Sin fecha de fin. Todas las tiendas.");
  });

  it("singular y sin detalle cuando no hay categoría completa", () => {
    expect(promoSummarySentence({
      label: "3x2", productCount: 1, fullCategories: [], looseCount: 1,
      vigencia: "Del 3 al 15 de octubre", scope: "Solo tu tienda",
    })).toBe("3x2 en 1 producto. Del 3 al 15 de octubre. Solo tu tienda.");
  });

  it("nombra los productos sueltos cuando son pocos", () => {
    expect(promoSummarySentence({
      label: "2x1", productCount: 3, fullCategories: [], looseCount: 3,
      looseNames: ["Funko Goku", "Funko Vegeta", "Funko Gohan"],
      vigencia: "Sin fecha de fin", scope: "Todas las tiendas",
    })).toBe("2x1 en 3 productos (Funko Goku, Funko Vegeta, Funko Gohan). Sin fecha de fin. Todas las tiendas.");
  });

  it("con más de 3 sueltos nombra 3 y cuenta el resto", () => {
    expect(promoSummarySentence({
      label: "2x1", productCount: 5, fullCategories: [], looseCount: 5,
      looseNames: ["A", "B", "C", "D", "E"],
      vigencia: "Sin fecha de fin", scope: "Todas las tiendas",
    })).toBe("2x1 en 5 productos (A, B, C + 2 más). Sin fecha de fin. Todas las tiendas.");
  });

  it("avisa si todavía no hay productos", () => {
    expect(promoSummarySentence({
      label: "2x1", productCount: 0, fullCategories: [], looseCount: 0,
      vigencia: "Sin fecha de fin", scope: "Todas las tiendas",
    })).toBe("2x1 sin productos todavía. Sin fecha de fin. Todas las tiendas.");
  });
});
