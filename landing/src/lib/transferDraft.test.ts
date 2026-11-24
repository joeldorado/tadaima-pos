import { describe, expect, it } from "vitest";
import {
  isEmptyTransferDraft,
  sanitizeTransferDraft,
  transferDraftButtonLabel,
  type TransferDraft,
} from "./transferDraft";

const item = (id: number, qty = 1) => ({
  product_id: id, name: `Producto ${id}`, sku: `SKU-${id}`, quantity: qty, quantityInput: String(qty),
});

const base: TransferDraft = { fromWhId: "1", toWhId: "2", notes: "", items: [item(10)], currentStep: 1 };

describe("isEmptyTransferDraft", () => {
  it("sin artículos ni notas está vacío aunque tenga origen y destino", () => {
    expect(isEmptyTransferDraft({ ...base, items: [] })).toBe(true);
  });

  it("con notas no está vacío", () => {
    expect(isEmptyTransferDraft({ ...base, items: [], notes: "urgente" })).toBe(false);
  });

  it("con artículos no está vacío", () => {
    expect(isEmptyTransferDraft(base)).toBe(false);
  });
});

describe("sanitizeTransferDraft", () => {
  it("regresa el borrador tal cual cuando es válido", () => {
    expect(sanitizeTransferDraft(base, new Set(["1", "2"]))).toEqual(base);
  });

  it("descarta basura que no es objeto", () => {
    expect(sanitizeTransferDraft(null)).toBeNull();
    expect(sanitizeTransferDraft("x")).toBeNull();
    expect(sanitizeTransferDraft([item(1)])).toBeNull();
  });

  it("quita artículos con cantidad inválida, sin id o repetidos", () => {
    const result = sanitizeTransferDraft({
      ...base,
      items: [item(10, 2), item(10, 5), { ...item(11), quantity: 0 }, { ...item(12), product_id: "x" }, item(13, 3)],
    });
    expect(result?.items.map(i => [i.product_id, i.quantity])).toEqual([[10, 2], [13, 3]]);
  });

  it("rehace quantityInput desde la cantidad", () => {
    const result = sanitizeTransferDraft({ ...base, items: [{ ...item(10, 4), quantityInput: "" }] });
    expect(result?.items[0]?.quantityInput).toBe("4");
  });

  it("borra almacenes que ya no existen y conserva los que sí", () => {
    const result = sanitizeTransferDraft(base, new Set(["2"]));
    expect(result?.fromWhId).toBe("");
    expect(result?.toWhId).toBe("2");
  });

  it("sin la lista de almacenes deja pasar los ids", () => {
    expect(sanitizeTransferDraft(base)?.fromWhId).toBe("1");
  });

  it("regresa al paso 1 si quedó en Revisión sin artículos", () => {
    const result = sanitizeTransferDraft({ ...base, items: [], notes: "x", currentStep: 2 });
    expect(result?.currentStep).toBe(1);
  });

  it("conserva el paso 2 con artículos", () => {
    expect(sanitizeTransferDraft({ ...base, currentStep: 2 })?.currentStep).toBe(2);
  });

  it("null si después de limpiar no queda nada", () => {
    expect(sanitizeTransferDraft({ ...base, items: [{ ...item(1), quantity: -1 }] })).toBeNull();
  });
});

describe("transferDraftButtonLabel", () => {
  it("dice Continuar con el número de artículos", () => {
    expect(transferDraftButtonLabel(3)).toBe("Continuar traslado (3)");
  });

  it("sin artículos dice Nueva Transferencia", () => {
    expect(transferDraftButtonLabel(0)).toBe("Nueva Transferencia");
  });
});
