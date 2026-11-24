import { describe, expect, it } from "vitest";
import { mapWithConcurrency, transferStockSnapshot, type InventoryRowLike } from "./transferStock";

const row = (warehouseId: number, storeId: number | null, quantity: number): InventoryRowLike => ({
  warehouse_id: warehouseId,
  quantity,
  warehouse: { store: storeId == null ? null : { id: storeId } },
});

// Centro (tienda 1): Exhibición 1, Bodega 3. Macro (tienda 2): Exhibición 2, Bodega 4.
const rows = [row(1, 1, 5), row(3, 1, 2), row(2, 2, 7), row(4, 2, 1)];

describe("transferStockSnapshot", () => {
  it("origen = Exhibición + Bodega de la tienda origen; destino = su almacén", () => {
    expect(transferStockSnapshot(rows, 1, 2)).toEqual({ fromAvailable: 7, toAvailable: 7 });
  });

  it("al admin ya no le suma todas las tiendas", () => {
    expect(transferStockSnapshot(rows, 2, 1).fromAvailable).toBe(8);
  });

  it("sin tienda origen suma todo (comportamiento anterior)", () => {
    expect(transferStockSnapshot(rows, null, 2).fromAvailable).toBe(15);
  });

  it("gerente: solo llegan filas de su tienda, el destino de otra tienda da 0", () => {
    expect(transferStockSnapshot([row(1, 1, 5), row(3, 1, 2)], 1, 2)).toEqual({ fromAvailable: 7, toAvailable: 0 });
  });

  it("sin destino o sin filas da 0", () => {
    expect(transferStockSnapshot(rows, 1, null).toAvailable).toBe(0);
    expect(transferStockSnapshot([], 1, 2)).toEqual({ fromAvailable: 0, toAvailable: 0 });
  });

  it("ignora filas sin almacén cuando hay tienda origen", () => {
    expect(transferStockSnapshot([{ warehouse_id: 9, quantity: 4, warehouse: null }, row(1, 1, 1)], 1, 9))
      .toEqual({ fromAvailable: 1, toAvailable: 4 });
  });
});

describe("mapWithConcurrency", () => {
  it("nunca corre más de `limit` a la vez y conserva el orden", async () => {
    let running = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 5));
      running -= 1;
      return n * 10;
    });
    expect(peak).toBe(3);
    expect(result.map(r => (r.status === "fulfilled" ? r.value : null))).toEqual([10, 20, 30, 40, 50, 60, 70]);
  });

  it("un error no detiene a los demás", async () => {
    const result = await mapWithConcurrency([1, 2, 3], 2, (n: number) =>
      n === 2 ? Promise.reject(new Error("429")) : Promise.resolve(n));
    expect(result.map(r => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });

  it("lista vacía no llama nada", async () => {
    let calls = 0;
    const result = await mapWithConcurrency<number, number>([], 3, (n) => { calls += 1; return Promise.resolve(n); });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });
});
