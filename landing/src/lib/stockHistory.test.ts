import { describe, expect, it } from "vitest";
import type { InventoryMovement, WarehouseCurrentStock } from "@tadaima/api";
import {
  buildStockHistory,
  isInLocalRange,
  movementLabel,
  parseAdjustmentNote,
  summarizeStockHistory,
} from "./stockHistory";

let nextId = 1;
function mov(p: Partial<InventoryMovement> & { created_at: string; stock_delta: number }): InventoryMovement {
  return {
    id: nextId++,
    product_id: 1,
    warehouse_id: 10,
    type: "venta",
    quantity: Math.abs(p.stock_delta),
    reference: null,
    notes: null,
    user_id: 1,
    ...p,
  };
}

function stock(warehouse_id: number, quantity: number): WarehouseCurrentStock {
  return { warehouse_id, quantity, warehouse_name: null, warehouse_type: null, store_id: null, store_name: null };
}

describe("buildStockHistory", () => {
  it("reconstruye el saldo hacia atrás desde el stock actual", () => {
    // Entraron 10, se vendieron 2 y se apartó 1 → hoy hay 7.
    const rows = buildStockHistory(
      [
        mov({ type: "entrada", stock_delta: 10, created_at: "2026-11-01T18:00:00Z" }),
        mov({ type: "venta", stock_delta: -2, created_at: "2026-11-02T18:00:00Z" }),
        mov({ type: "apartado", stock_delta: -1, created_at: "2026-11-03T18:00:00Z" }),
      ],
      [stock(10, 7)],
    );

    expect(rows.map(r => r.movement.type)).toEqual(["apartado", "venta", "entrada"]);
    expect(rows.map(r => r.balanceAfter)).toEqual([7, 8, 10]);
    expect(rows.every(r => r.computedAfter === null)).toBe(true);
  });

  it("lleva un saldo por almacén", () => {
    // Pasaron 3 de Bodega (20) a Exhibición (10) a la misma hora.
    const at = "2026-11-05T20:00:00Z";
    const rows = buildStockHistory(
      [
        mov({ id: 100, warehouse_id: 20, type: "transferencia", stock_delta: -3, reference: "MOV-20->10", created_at: at }),
        mov({ id: 101, warehouse_id: 10, type: "transferencia", stock_delta: 3, reference: "MOV-20->10", created_at: at }),
      ],
      [stock(10, 5), stock(20, 4)],
    );

    expect(rows.map(r => [r.movement.warehouse_id, r.balanceAfter])).toEqual([[10, 5], [20, 4]]);
    expect(rows.map(r => r.label)).toEqual(["Llegó de otro almacén", "Pasó a otro almacén"]);
  });

  it("un almacén sin fila de inventario arranca en 0", () => {
    const rows = buildStockHistory(
      [mov({ warehouse_id: 30, type: "venta", stock_delta: -1, created_at: "2026-11-05T20:00:00Z" })],
      [],
    );
    expect(rows[0]?.balanceAfter).toBe(0);
  });

  it("sin almacén no hay saldo", () => {
    const rows = buildStockHistory(
      [mov({ warehouse_id: null, type: "devolucion", stock_delta: 1, created_at: "2026-11-05T20:00:00Z" })],
      [stock(10, 4)],
    );
    expect(rows[0]?.balanceAfter).toBeNull();
  });

  it("marca el ajuste que no cuadra y sigue la cuenta desde lo que dice su nota", () => {
    // El ajuste dejó 8 (de 10), pero hoy hay 3 tras una venta de 1: falta
    // registrar un cambio de 4 piezas en algún punto después del ajuste.
    const rows = buildStockHistory(
      [
        mov({ type: "entrada", stock_delta: 10, created_at: "2026-11-01T18:00:00Z" }),
        mov({ type: "ajuste", stock_delta: -2, notes: "Ajuste manual: 10 → 8", created_at: "2026-11-02T18:00:00Z" }),
        mov({ type: "venta", stock_delta: -1, created_at: "2026-11-03T18:00:00Z" }),
      ],
      [stock(10, 3)],
    );

    const [venta, ajuste, entrada] = rows;
    expect(venta?.balanceAfter).toBe(3);
    expect(ajuste?.balanceAfter).toBe(8);
    expect(ajuste?.computedAfter).toBe(4);
    expect(entrada?.balanceAfter).toBe(10);
    expect(entrada?.computedAfter).toBeNull();
  });

  it("un ajuste que sí cuadra no se marca", () => {
    const rows = buildStockHistory(
      [mov({ type: "ajuste", stock_delta: 5, notes: "Ajuste manual: 2 → 7", created_at: "2026-11-02T18:00:00Z" })],
      [stock(10, 7)],
    );
    expect(rows[0]).toMatchObject({ balanceAfter: 7, computedAfter: null });
  });

  it("no cambia el arreglo que recibe", () => {
    const list = [
      mov({ stock_delta: -1, created_at: "2026-11-01T18:00:00Z" }),
      mov({ stock_delta: -1, created_at: "2026-11-02T18:00:00Z" }),
    ];
    const ids = list.map(m => m.id);
    buildStockHistory(list, [stock(10, 0)]);
    expect(list.map(m => m.id)).toEqual(ids);
  });
});

describe("movementLabel", () => {
  it("nombra cada tipo", () => {
    expect(movementLabel("apartado", "APARTADO-5", -1)).toBe("Apartado");
    expect(movementLabel("apartado_cancelado", "APARTADO-CANCELADO-5", 1)).toBe("Apartado cancelado");
    expect(movementLabel("transferencia", "PAQ-3", -2)).toBe("Paquete: sale");
    expect(movementLabel("transferencia", "TRASLADO-9", 2)).toBe("Traslado recibido");
    expect(movementLabel("devolucion", "BORRADO-CORTE-4", 1)).toBe("Corte borrado (regresa)");
    expect(movementLabel("algo_nuevo", null, 0)).toBe("algo_nuevo");
  });
});

describe("parseAdjustmentNote", () => {
  it("lee antes y después", () => {
    expect(parseAdjustmentNote("Ajuste manual: 10 → 8")).toEqual({ before: 10, after: 8 });
    expect(parseAdjustmentNote("conteo 1,5 -> 0")).toEqual({ before: 1.5, after: 0 });
    expect(parseAdjustmentNote("Re-import: existencia 0 en el origen")).toBeNull();
    expect(parseAdjustmentNote(null)).toBeNull();
  });
});

describe("isInLocalRange", () => {
  it("usa el día de Tijuana", () => {
    // 2026-11-19 05:00 UTC = 2026-11-18 21:00 en Tijuana.
    expect(isInLocalRange("2026-11-19T05:00:00Z", "2026-11-18", "2026-11-18")).toBe(true);
    expect(isInLocalRange("2026-11-19T05:00:00Z", "2026-11-19")).toBe(false);
    expect(isInLocalRange("2026-11-19T05:00:00Z")).toBe(true);
  });
});

describe("summarizeStockHistory", () => {
  it("suma entradas y salidas", () => {
    const rows = buildStockHistory(
      [
        mov({ type: "entrada", stock_delta: 10, created_at: "2026-11-01T18:00:00Z" }),
        mov({ type: "venta", stock_delta: -2, created_at: "2026-11-02T18:00:00Z" }),
        mov({ type: "apartado", stock_delta: -1, created_at: "2026-11-03T18:00:00Z" }),
      ],
      [stock(10, 7)],
    );
    expect(summarizeStockHistory(rows)).toEqual({ entradas: 10, salidas: 3, neto: 7 });
  });

  it("con todos los almacenes, el paso Exhibición ↔ Bodega no cuenta", () => {
    const at = "2026-11-05T20:00:00Z";
    const rows = buildStockHistory(
      [
        mov({ warehouse_id: 20, type: "transferencia", stock_delta: -3, reference: "MOV-20->10", created_at: at }),
        mov({ warehouse_id: 10, type: "transferencia", stock_delta: 3, reference: "MOV-20->10", created_at: at }),
        mov({ warehouse_id: 20, type: "transferencia", stock_delta: -2, reference: "TRASLADO-4", created_at: at }),
      ],
      [stock(10, 3), stock(20, 0)],
    );
    expect(summarizeStockHistory(rows, { skipInternalMoves: true })).toEqual({ entradas: 0, salidas: 2, neto: -2 });
    expect(summarizeStockHistory(rows)).toEqual({ entradas: 3, salidas: 5, neto: -2 });
  });
});
