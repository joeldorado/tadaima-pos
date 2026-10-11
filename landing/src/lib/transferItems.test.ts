import { describe, it, expect } from "vitest";
import type { TransferItem } from "@tadaima/api";
import { filterTransferItems, summarizeTransferItems, transferItemsLabel } from "./transferItems";

const item = (id: number, name: string | null, sku: string, quantity: number): TransferItem => ({
  id,
  transfer_id: 5,
  product_id: id,
  quantity,
  product: name === null ? null : { id, name, sku, image_url: null },
  created_at: "2026-10-09T12:00:00Z",
});

const ITEMS: TransferItem[] = [
  item(1, "Pop reg Light Yagami", "FUN-001", 2),
  item(2, "Manga Frieren Tomo 1", "MNG-FRI-01", 5),
  item(3, "Figura Pokémon Pikachu", "POK-PIKA", 1),
];

describe("summarizeTransferItems", () => {
  it("cuenta productos distintos y piezas totales", () => {
    expect(summarizeTransferItems(ITEMS)).toEqual({ skus: 3, pieces: 8 });
  });

  it("tolera items null o vacíos", () => {
    expect(summarizeTransferItems(null)).toEqual({ skus: 0, pieces: 0 });
    expect(summarizeTransferItems([])).toEqual({ skus: 0, pieces: 0 });
  });
});

describe("filterTransferItems", () => {
  it("sin búsqueda regresa todos", () => {
    expect(filterTransferItems(ITEMS, "")).toEqual(ITEMS);
    expect(filterTransferItems(ITEMS, "   ")).toEqual(ITEMS);
  });

  it("busca por nombre sin acentos ni mayúsculas", () => {
    expect(filterTransferItems(ITEMS, "pokemon").map(i => i.id)).toEqual([3]);
    expect(filterTransferItems(ITEMS, "FRIEREN").map(i => i.id)).toEqual([2]);
  });

  it("busca por SKU", () => {
    expect(filterTransferItems(ITEMS, "fun-001").map(i => i.id)).toEqual([1]);
  });

  it("todas las palabras deben aparecer (nombre + SKU juntos)", () => {
    expect(filterTransferItems(ITEMS, "manga mng").map(i => i.id)).toEqual([2]);
    expect(filterTransferItems(ITEMS, "manga pika")).toEqual([]);
  });

  it("un renglón sin producto (borrado) no truena y no coincide", () => {
    const conBorrado = [...ITEMS, item(9, null, "", 4)];
    expect(filterTransferItems(conBorrado, "pop").map(i => i.id)).toEqual([1]);
  });

  it("tolera items null", () => {
    expect(filterTransferItems(null, "pop")).toEqual([]);
  });
});

describe("transferItemsLabel", () => {
  it("singular y plural", () => {
    expect(transferItemsLabel(1)).toBe("Ver producto");
    expect(transferItemsLabel(13)).toBe("Ver 13 productos");
  });
});
