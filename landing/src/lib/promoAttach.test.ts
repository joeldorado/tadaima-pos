import { describe, expect, it, vi } from "vitest";
import type { Promotion } from "@tadaima/api";
import {
  attachInChunks, chunkIds, detachInChunks, mergeAttachOutcomes, parseAttachError, summarizeAttachOutcome,
} from "./promoAttach";

type AttachFn = (promoId: number, ids: number[]) => Promise<Promotion>;

const promoWith = (ids: number[]): Promotion => ({
  id: 7, name: "2x1", type: "nxm", buy_n: 2, pay_m: 1, starts_at: null, ends_at: null,
  status: "active", priority: 0, products: ids.map(id => ({ id, name: `P${id}` })), products_count: ids.length,
});

describe("chunkIds", () => {
  it("parte en lotes y deja el residuo al final", () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkIds([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
    expect(chunkIds([], 2)).toEqual([]);
  });
});

describe("parseAttachError", () => {
  it("errores con el id del producto como llave", () => {
    const parsed = parseAttachError({ message: "x", errors: { "5": ["Ya tiene 2 promos"] } }, [4, 5, 6]);
    expect(parsed).toEqual({ kind: "per-product", rejections: [{ productId: 5, message: "Ya tiene 2 promos" }] });
  });

  it("errores de validación product_ids.N se mapean por posición", () => {
    const parsed = parseAttachError({ errors: { "product_ids.2": ["Uno de los productos no existe."] } }, [4, 5, 6]);
    expect(parsed).toEqual({ kind: "per-product", rejections: [{ productId: 6, message: "Uno de los productos no existe." }] });
  });

  it("tolera que el mensaje llegue como texto suelto en vez de arreglo", () => {
    const parsed = parseAttachError({ errors: { "5": "Ya tiene 2 promos" } }, [5]);
    expect(parsed).toEqual({ kind: "per-product", rejections: [{ productId: 5, message: "Ya tiene 2 promos" }] });
  });

  it("sin detalle por producto es un error general", () => {
    expect(parseAttachError({ message: "Sin conexión" }, [1])).toEqual({ kind: "fatal", message: "Sin conexión" });
    expect(parseAttachError({ message: "Tope", errors: { product_ids: ["Asigna máximo 500"] } }, [1]))
      .toEqual({ kind: "fatal", message: "Asigna máximo 500" });
    expect(parseAttachError(new Error("boom"), [1])).toEqual({ kind: "fatal", message: "boom" });
  });
});

describe("attachInChunks", () => {
  it("sin productos no llama al server", async () => {
    const attach = vi.fn<AttachFn>();
    const outcome = await attachInChunks({ promoId: 7, productIds: [], attach });
    expect(attach).not.toHaveBeenCalled();
    expect(outcome).toEqual({ attachedIds: [], rejections: [], pendingIds: [], fatalMessage: null, promo: null });
  });

  it("manda por lotes y reporta el avance", async () => {
    const attach = vi.fn<AttachFn>((_id, ids) => Promise.resolve(promoWith(ids)));
    const progress: Array<[number, number]> = [];
    const outcome = await attachInChunks({
      promoId: 7, productIds: [1, 2, 3, 4, 5], attach, chunkSize: 2,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(attach.mock.calls.map(c => c[1])).toEqual([[1, 2], [3, 4], [5]]);
    expect(progress).toEqual([[2, 5], [4, 5], [5, 5]]);
    expect(outcome.attachedIds).toEqual([1, 2, 3, 4, 5]);
    expect(outcome.promo?.products_count).toBe(1);
  });

  it("si el lote trae rechazados, reintenta UNA vez sin ellos", async () => {
    const attach = vi.fn<AttachFn>()
      .mockRejectedValueOnce({ message: "No se pudo", errors: { "2": ["Ya tiene mayoreo"] } })
      .mockResolvedValueOnce(promoWith([1, 3]));
    const outcome = await attachInChunks({ promoId: 7, productIds: [1, 2, 3], attach });
    expect(attach.mock.calls.map(c => c[1])).toEqual([[1, 2, 3], [1, 3]]);
    expect(outcome.attachedIds).toEqual([1, 3]);
    expect(outcome.rejections).toEqual([{ productId: 2, message: "Ya tiene mayoreo" }]);
    expect(outcome.pendingIds).toEqual([]);
  });

  it("si TODO el lote fue rechazado no reintenta", async () => {
    const attach = vi.fn<AttachFn>().mockRejectedValueOnce({ errors: { "1": ["a"], "2": ["b"] } });
    const outcome = await attachInChunks({ promoId: 7, productIds: [1, 2], attach });
    expect(attach).toHaveBeenCalledTimes(1);
    expect(outcome.attachedIds).toEqual([]);
    expect(outcome.rejections).toHaveLength(2);
  });

  it("si el reintento también trae rechazados, guarda el motivo y deja el resto pendiente", async () => {
    const attach = vi.fn<AttachFn>()
      .mockRejectedValueOnce({ errors: { "2": ["Ya tiene mayoreo"] } })
      .mockRejectedValueOnce({ errors: { "3": ["Tope de promos"] } });
    const outcome = await attachInChunks({ promoId: 7, productIds: [1, 2, 3], attach });
    expect(attach).toHaveBeenCalledTimes(2);
    expect(outcome.attachedIds).toEqual([]);
    expect(outcome.rejections).toEqual([
      { productId: 2, message: "Ya tiene mayoreo" },
      { productId: 3, message: "Tope de promos" },
    ]);
    expect(outcome.pendingIds).toEqual([1]);
    expect(outcome.fatalMessage).not.toBeNull();
  });

  it("un error general a media corrida conserva lo agregado y deja pendientes exactos", async () => {
    const attach = vi.fn<AttachFn>()
      .mockResolvedValueOnce(promoWith([1, 2]))
      .mockRejectedValueOnce({ message: "Sin conexión" });
    const outcome = await attachInChunks({ promoId: 7, productIds: [1, 2, 3, 4, 5], attach, chunkSize: 2 });
    expect(outcome.attachedIds).toEqual([1, 2]);
    expect(outcome.pendingIds).toEqual([3, 4, 5]);
    expect(outcome.fatalMessage).toBe("Sin conexión");
  });
});

describe("mergeAttachOutcomes", () => {
  it("suma lo logrado y se queda con los pendientes del reintento", () => {
    const previous = {
      attachedIds: [1, 2], rejections: [{ productId: 9, message: "x" }],
      pendingIds: [3, 4], fatalMessage: "Sin conexión", promo: promoWith([1, 2]),
    };
    const retry = { attachedIds: [3, 4], rejections: [], pendingIds: [], fatalMessage: null, promo: promoWith([1, 2, 3, 4]) };
    expect(mergeAttachOutcomes(previous, retry)).toEqual({
      attachedIds: [1, 2, 3, 4], rejections: [{ productId: 9, message: "x" }],
      pendingIds: [], fatalMessage: null, promo: promoWith([1, 2, 3, 4]),
    });
  });

  it("si el reintento no logró nada conserva la promo anterior", () => {
    const previous = { attachedIds: [1], rejections: [], pendingIds: [2], fatalMessage: "x", promo: promoWith([1]) };
    const retry = { attachedIds: [], rejections: [], pendingIds: [2], fatalMessage: "y", promo: null };
    expect(mergeAttachOutcomes(previous, retry).promo).toEqual(promoWith([1]));
  });
});

describe("detachInChunks", () => {
  it("quita por lotes y devuelve la última versión de la promo", async () => {
    const detach = vi.fn<AttachFn>((_id, ids) => Promise.resolve(promoWith(ids)));
    const promo = await detachInChunks({ promoId: 7, productIds: [1, 2, 3], detach, chunkSize: 2 });
    expect(detach.mock.calls.map(c => c[1])).toEqual([[1, 2], [3]]);
    expect(promo?.products?.map(p => p.id)).toEqual([3]);
  });
});

describe("summarizeAttachOutcome", () => {
  const names = new Map([[2, "Cable USB-C"]]);
  const base = { attachedIds: [], rejections: [], pendingIds: [], fatalMessage: null, promo: null };

  it("todo bien", () => {
    expect(summarizeAttachOutcome({ ...base, attachedIds: [1, 3] }, names).headline)
      .toBe("Se agregaron 2 productos.");
    expect(summarizeAttachOutcome({ ...base, attachedIds: [1] }, names).headline)
      .toBe("Se agregó 1 producto.");
  });

  it("con rechazados lista nombre y motivo", () => {
    const resumen = summarizeAttachOutcome(
      { ...base, attachedIds: [1, 3], rejections: [{ productId: 2, message: "Ya tiene mayoreo" }] }, names,
    );
    expect(resumen.headline).toBe("Se agregaron 2 productos. 1 no se pudo agregar.");
    expect(resumen.rejected).toEqual([{ productId: 2, name: "Cable USB-C", message: "Ya tiene mayoreo" }]);
  });

  it("nada entró", () => {
    const resumen = summarizeAttachOutcome(
      { ...base, rejections: [{ productId: 2, message: "x" }, { productId: 9, message: "y" }] }, names,
    );
    expect(resumen.headline).toBe("No se agregó ningún producto. 2 no se pudieron agregar.");
    expect(resumen.rejected[1]?.name).toBe("Producto #9");
  });

  it("con pendientes por un error general", () => {
    const resumen = summarizeAttachOutcome(
      { ...base, attachedIds: [1], pendingIds: [4, 5], fatalMessage: "Sin conexión" }, names,
    );
    expect(resumen.headline).toBe("Se agregó 1 producto.");
    expect(resumen.pendingCount).toBe(2);
    expect(resumen.fatalMessage).toBe("Sin conexión");
  });
});
