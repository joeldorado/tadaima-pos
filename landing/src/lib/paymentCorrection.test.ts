import { describe, expect, it } from "vitest";
import {
  PAYMENT_METHOD_IDS,
  buildCorrectionPayload,
  canCorrectPayment,
  cashAfter,
  cashPortion,
  classifyMethodName,
  currentCorrectionMethod,
  type CorrectionDraft,
} from "./paymentCorrection";

type Pay = { id: number; payment_method_id: number; terminal_id: number | null; amount: number; commission_amount: number; payment_method: { id: number; name: string } | null; created_at: string };

const pay = (name: string, amount: number, id: number = PAYMENT_METHOD_IDS.efectivo, terminal: number | null = null): Pay => ({
  id: Math.random(), payment_method_id: id, terminal_id: terminal, amount, commission_amount: 0,
  payment_method: { id, name }, created_at: "2026-09-30T12:00:00Z",
});

const efectivo500 = { payments: [pay("Efectivo", 500)] };

const sale = (over: Record<string, unknown> = {}) => ({
  status: "completed", cancellation_status: "none" as const, payments: efectivo500.payments,
  register_session_id: 7, register_session_status: "open" as const, ...over,
});

describe("classifyMethodName", () => {
  it("clasifica igual que el backend", () => {
    expect(classifyMethodName("Tarjeta Débito")).toBe("tarjeta");
    expect(classifyMethodName("Dólares")).toBe("dolares");
    expect(classifyMethodName("Efectivo")).toBe("efectivo");
    expect(classifyMethodName("Transferencia")).toBe("transferencia");
    expect(classifyMethodName("Mercado Pago")).toBe("otro");
  });
});

describe("cashPortion / currentCorrectionMethod", () => {
  it("cuenta efectivo y dólares como cajón", () => {
    expect(cashPortion({ payments: [pay("Efectivo", 300), pay("Transferencia", 200, 4)] })).toBe(300);
    expect(cashPortion({ payments: [pay("Dólares", 500)] })).toBe(500);
  });

  it("reconoce el método actual", () => {
    expect(currentCorrectionMethod(efectivo500)).toBe("efectivo");
    expect(currentCorrectionMethod({ payments: [pay("Transferencia", 200, 4), pay("Efectivo", 300)] })).toBe("mixto");
    expect(currentCorrectionMethod({ payments: [pay("Dólares", 500)] })).toBeNull();
  });
});

describe("canCorrectPayment", () => {
  it("cualquier rol con la caja abierta", () => {
    expect(canCorrectPayment({ sale: sale(), isAdmin: false }).allowed).toBe(true);
  });

  it("con el corte cerrado solo el admin", () => {
    const closed = sale({ register_session_status: "closed" });
    expect(canCorrectPayment({ sale: closed, isAdmin: false })).toMatchObject({ allowed: false });
    expect(canCorrectPayment({ sale: closed, isAdmin: true }).allowed).toBe(true);
  });

  it("venta recién cobrada en mi caja abierta (sin estado aún)", () => {
    const optimistic = sale({ register_session_status: undefined });
    expect(canCorrectPayment({ sale: optimistic, isAdmin: false, activeSessionId: 7 }).allowed).toBe(true);
  });

  it("no con cancelaciones ni canceladas ni sin pagos", () => {
    expect(canCorrectPayment({ sale: sale({ cancellation_status: "partial" }), isAdmin: true }).allowed).toBe(false);
    expect(canCorrectPayment({ sale: sale({ status: "returned" }), isAdmin: true }).allowed).toBe(false);
    expect(canCorrectPayment({ sale: sale({ payments: [] }), isAdmin: true }).allowed).toBe(false);
  });
});

describe("buildCorrectionPayload", () => {
  const draft = (over: Partial<CorrectionDraft>): CorrectionDraft => ({
    method: "tarjeta", total: 500, terminalId: 3, transferStr: "", hasUsd: false, current: efectivo500, ...over,
  });

  it("tarjeta pide terminal", () => {
    expect(buildCorrectionPayload(draft({ terminalId: null }))).toMatchObject({ ok: false });
    expect(buildCorrectionPayload(draft({}))).toEqual({
      ok: true, payments: [{ payment_method_id: PAYMENT_METHOD_IDS.tarjeta, amount: 500, terminal_id: 3 }],
    });
  });

  it("mixto suma exacto el total", () => {
    const r = buildCorrectionPayload(draft({ method: "mixto", transferStr: "200.10" }));
    expect(r).toEqual({
      ok: true,
      payments: [
        { payment_method_id: PAYMENT_METHOD_IDS.efectivo, amount: 299.9 },
        { payment_method_id: PAYMENT_METHOD_IDS.transferencia, amount: 200.1 },
      ],
    });
    expect(buildCorrectionPayload(draft({ method: "mixto", transferStr: "500" }))).toMatchObject({ ok: false });
  });

  it("dólares solo a tarjeta o transferencia", () => {
    expect(buildCorrectionPayload(draft({ method: "efectivo", hasUsd: true, current: { payments: [pay("Transferencia", 500, 4)] } }))).toMatchObject({ ok: false });
    expect(buildCorrectionPayload(draft({ method: "transferencia", hasUsd: true })).ok).toBe(true);
  });

  it("tarjeta → tarjeta conserva el tipo (solo cambia la terminal)", () => {
    const credito = { payments: [pay("Tarjeta Crédito", 500, 3, 1)] };
    expect(buildCorrectionPayload(draft({ terminalId: 2, current: credito }))).toEqual({
      ok: true, payments: [{ payment_method_id: 3, amount: 500, terminal_id: 2 }],
    });
  });

  it("sin cambios no se manda", () => {
    const r = buildCorrectionPayload(draft({ method: "efectivo" }));
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toContain("No hay cambios");
  });

  it("efectivo que queda en el cajón", () => {
    expect(cashAfter([{ payment_method_id: PAYMENT_METHOD_IDS.efectivo, amount: 299.9 }, { payment_method_id: PAYMENT_METHOD_IDS.transferencia, amount: 200.1 }])).toBe(299.9);
  });
});
