import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProductsStock, type PaginatedResponse } from "@tadaima/api";
import { fetchAllPages, fetchAllProductsStock, PRODUCTS_STOCK_PAGE_SIZE } from "./fetchAllPages";

vi.mock("@tadaima/api", () => ({ getSales: vi.fn(), getProductsStock: vi.fn() }));

describe("fetchAllProductsStock", () => {
  const item = (id: number) => ({ id, name: `P${id}`, sku: null, image: null, stock: [] });

  beforeEach(() => {
    vi.mocked(getProductsStock).mockReset();
  });

  it("quita repetidos y conserva el total del API para detectar faltantes", async () => {
    // Una venta movió el producto 2 de página: sale dos veces y el 3 ya no llegó.
    const pages: Record<number, number[]> = { 1: [1, 2], 2: [2] };
    vi.mocked(getProductsStock).mockImplementation(async params => ({
      data: (pages[params?.page ?? 1] ?? []).map(item),
      pagination: { total: 3, per_page: PRODUCTS_STOCK_PAGE_SIZE, current_page: params?.page ?? 1, last_page: 2 },
    }));

    const res = await fetchAllProductsStock({});

    expect(res.data.map(p => p.id)).toEqual([1, 2]);
    expect(res.total).toBe(3);
  });

  it("recorre todas las páginas de 1000 conservando los filtros", async () => {
    vi.mocked(getProductsStock).mockImplementation(async params => ({
      data: [item(params?.page ?? 0)],
      pagination: { total: 2, per_page: PRODUCTS_STOCK_PAGE_SIZE, current_page: params?.page ?? 1, last_page: 2 },
    }));

    const res = await fetchAllProductsStock({ page: 7, per_page: 50, search: "goku" });

    expect(PRODUCTS_STOCK_PAGE_SIZE).toBe(1000);
    expect(vi.mocked(getProductsStock).mock.calls.map(c => c[0])).toEqual([
      { page: 1, per_page: 1000, search: "goku" },
      { page: 2, per_page: 1000, search: "goku" },
    ]);
    expect(res.data.map(p => p.id)).toEqual([1, 2]);
    expect(res.total).toBe(2);
  });
});

function page(n: number, lastPage: number, items: number[]): PaginatedResponse<number> {
  return { data: items, current_page: n, last_page: lastPage, per_page: 100, total: 0 };
}

describe("fetchAllPages", () => {
  it("una sola página: una llamada y los mismos datos", async () => {
    const fetchPage = vi.fn(async (n: number) => page(n, 1, [1, 2]));

    const res = await fetchAllPages(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(res.data).toEqual([1, 2]);
    expect(res).toMatchObject({ current_page: 1, last_page: 1, total: 2 });
  });

  it("varias páginas: las recorre todas en orden", async () => {
    const pages: Record<number, number[]> = { 1: [1, 2], 2: [3, 4], 3: [5] };
    const fetchPage = vi.fn(async (n: number) => page(n, 3, pages[n] ?? []));

    const res = await fetchAllPages(fetchPage);

    expect(fetchPage.mock.calls.map(c => c[0])).toEqual([1, 2, 3]);
    expect(res.data).toEqual([1, 2, 3, 4, 5]);
    expect(res.total).toBe(5);
  });

  it("lee la paginación anidada de /sales (pagination.last_page)", async () => {
    const pages: Record<number, number[]> = { 1: [1, 2], 2: [3] };
    const fetchPage = vi.fn(async (n: number) => ({
      data: pages[n] ?? [],
      pagination: { total: 3, per_page: 100, current_page: n, last_page: 2 },
    }));

    const res = await fetchAllPages(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(res.data).toEqual([1, 2, 3]);
  });

  it("respeta el tope de páginas", async () => {
    const fetchPage = vi.fn(async (n: number) => page(n, 99, [n]));

    const res = await fetchAllPages(fetchPage, 2);

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(res.data).toEqual([1, 2]);
  });
});
