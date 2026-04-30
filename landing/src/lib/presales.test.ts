import { describe, it, expect } from "vitest";
import {
  calculatePoints,
  canLiquidate,
  isExpired,
  getPreSaleStatusLabel,
  isCardCode,
  PRE_SALE_STATUS_LABELS,
} from "./presales";

// ─── calculatePoints ──────────────────────────────────────────────────────────
describe("calculatePoints", () => {
  it("MXN $1,000 × 0.001 = 1 punto", () => {
    expect(calculatePoints(1000, 0.001)).toBe(1);
  });

  it("MXN $5,000 × 0.001 = 5 puntos", () => {
    expect(calculatePoints(5000, 0.001)).toBe(5);
  });

  it("MXN $1,999 × 0.001 = 1 punto (floor, no redondeo)", () => {
    expect(calculatePoints(1999, 0.001)).toBe(1);
  });

  it("MXN $0 → 0 puntos", () => {
    expect(calculatePoints(0, 0.001)).toBe(0);
  });

  it("total negativo → 0 puntos (guard)", () => {
    expect(calculatePoints(-500, 0.001)).toBe(0);
  });

  it("multiplier personalizado: 1 punto por cada 10 MXN (0.1)", () => {
    expect(calculatePoints(250, 0.1)).toBe(25);
  });

  it("multiplier cero → 0 puntos", () => {
    expect(calculatePoints(10000, 0)).toBe(0);
  });

  it("totales con decimales → floor aplica", () => {
    expect(calculatePoints(1500.75, 0.001)).toBe(1);
  });
});

// ─── canLiquidate ─────────────────────────────────────────────────────────────
describe("canLiquidate", () => {
  it("status=ready y balance > 0 → puede liquidar", () => {
    expect(canLiquidate({ status: "ready", balance: 250 })).toBe(true);
  });

  it("status=live y balance > 0 → puede liquidar", () => {
    expect(canLiquidate({ status: "live", balance: 100 })).toBe(true);
  });

  it("balance = 0 → no puede liquidar (ya está pagado)", () => {
    expect(canLiquidate({ status: "ready", balance: 0 })).toBe(false);
  });

  it("balance null → no puede liquidar", () => {
    expect(canLiquidate({ status: "ready", balance: null })).toBe(false);
  });

  it("status=completed → no puede liquidar (ya entregada)", () => {
    expect(canLiquidate({ status: "completed", balance: 500 })).toBe(false);
  });

  it("status=cancelled → no puede liquidar", () => {
    expect(canLiquidate({ status: "cancelled", balance: 500 })).toBe(false);
  });

  it("status=expired → no puede liquidar", () => {
    expect(canLiquidate({ status: "expired", balance: 500 })).toBe(false);
  });
});

// ─── isExpired ────────────────────────────────────────────────────────────────
describe("isExpired", () => {
  const TODAY = new Date("2026-04-21T12:00:00Z");

  it("pickup_deadline de ayer + status=ready → vencida", () => {
    expect(isExpired({ status: "ready", pickup_deadline: "2026-04-20" }, TODAY)).toBe(true);
  });

  it("pickup_deadline mañana + status=ready → NO vencida", () => {
    expect(isExpired({ status: "ready", pickup_deadline: "2026-04-22" }, TODAY)).toBe(false);
  });

  it("pickup_deadline hoy + status=ready → NO vencida (mismo día cuenta)", () => {
    expect(isExpired({ status: "ready", pickup_deadline: "2026-04-21" }, TODAY)).toBe(false);
  });

  it("status=live + deadline pasado → NO vencida (aún no está lista)", () => {
    expect(isExpired({ status: "live", pickup_deadline: "2026-04-20" }, TODAY)).toBe(false);
  });

  it("status=completed + deadline pasado → NO vencida (ya entregada)", () => {
    expect(isExpired({ status: "completed", pickup_deadline: "2026-04-20" }, TODAY)).toBe(false);
  });

  it("pickup_deadline null → NO vencida", () => {
    expect(isExpired({ status: "ready", pickup_deadline: null }, TODAY)).toBe(false);
  });
});

// ─── getPreSaleStatusLabel ────────────────────────────────────────────────────
describe("getPreSaleStatusLabel — etiquetas en español", () => {
  it("live → 'Abierta'", () => {
    expect(getPreSaleStatusLabel("live")).toBe("Abierta");
  });

  it("ready → 'Lista para recoger'", () => {
    expect(getPreSaleStatusLabel("ready")).toBe("Lista para recoger");
  });

  it("completed → 'Entregada'", () => {
    expect(getPreSaleStatusLabel("completed")).toBe("Entregada");
  });

  it("cancelled → 'Cancelada'", () => {
    expect(getPreSaleStatusLabel("cancelled")).toBe("Cancelada");
  });

  it("expired → 'Vencida'", () => {
    expect(getPreSaleStatusLabel("expired")).toBe("Vencida");
  });

  it("constante exporta los 5 statuses", () => {
    expect(Object.keys(PRE_SALE_STATUS_LABELS).sort()).toEqual(
      ["cancelled", "completed", "expired", "live", "ready"]
    );
  });
});

// ─── isCardCode ───────────────────────────────────────────────────────────────
describe("isCardCode — validación de formato de tarjeta", () => {
  it("código válido de 8 caracteres alfanuméricos", () => {
    expect(isCardCode("ABC12345")).toBe(true);
  });

  it("código válido de 16 caracteres alfanuméricos", () => {
    expect(isCardCode("TADAIMA123456789")).toBe(true);
  });

  it("código válido de 12 caracteres mixtos", () => {
    expect(isCardCode("TDM000123456")).toBe(true);
  });

  it("muy corto (7 caracteres) → inválido", () => {
    expect(isCardCode("ABC1234")).toBe(false);
  });

  it("muy largo (17 caracteres) → inválido", () => {
    expect(isCardCode("ABCDEFGHIJ1234567")).toBe(false);
  });

  it("contiene guiones → inválido", () => {
    expect(isCardCode("ABC-12345")).toBe(false);
  });

  it("contiene espacios → inválido", () => {
    expect(isCardCode("ABC 12345")).toBe(false);
  });

  it("string vacío → inválido", () => {
    expect(isCardCode("")).toBe(false);
  });

  it("email completo → inválido (no es código de tarjeta)", () => {
    expect(isCardCode("test@example.com")).toBe(false);
  });
});

// ─── Flujos end-to-end de lógica pura (casos de uso reales) ──────────────────
describe("Casos de uso — flujo completo de preventa", () => {
  it("Cajera escanea tarjeta válida → código reconocido, preventa liquidable antes del cobro", () => {
    const cardCode = "TDM00012345";
    const preSale = { status: "ready" as const, balance: 1000 };

    expect(isCardCode(cardCode)).toBe(true);
    expect(canLiquidate(preSale)).toBe(true);
  });

  it("Venta $1,000 → 1 punto otorgado al cliente (cajero o gerente)", () => {
    expect(calculatePoints(1000, 0.001)).toBe(1);
  });

  it("Venta $5,000 → 5 puntos otorgados", () => {
    expect(calculatePoints(5000, 0.001)).toBe(5);
  });

  it("Preventa vencida no se puede liquidar aunque tenga balance", () => {
    const preSale = { status: "expired" as const, balance: 500 };
    expect(canLiquidate(preSale)).toBe(false);
  });

  it("Admin marca producto como listo → estado 'ready' tiene etiqueta correcta para cajero", () => {
    expect(getPreSaleStatusLabel("ready")).toBe("Lista para recoger");
  });

  it("Admin mueve preventa vencida a inventario → estado 'expired' tiene etiqueta correcta", () => {
    expect(getPreSaleStatusLabel("expired")).toBe("Vencida");
  });

  it("Preventa de fecha límite vigente → no aparece como vencida en el sistema", () => {
    const today = new Date("2026-04-21T12:00:00Z");
    const preSale = { status: "ready" as const, pickup_deadline: "2026-04-30" };
    expect(isExpired(preSale, today)).toBe(false);
  });

  it("Preventa de fecha límite vencida → aparece como vencida, admin puede moverla", () => {
    const today = new Date("2026-04-21T12:00:00Z");
    const preSale = { status: "ready" as const, pickup_deadline: "2026-04-10" };
    expect(isExpired(preSale, today)).toBe(true);
  });
});
