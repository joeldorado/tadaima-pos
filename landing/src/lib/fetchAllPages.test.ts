import { describe, expect, it, vi } from "vitest";
import type { PaginatedResponse } from "@tadaima/api";
import { fetchAllPages } from "./fetchAllPages";

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
