import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateAfterSale } from "./optimisticSale";
import { queryKeys } from "./queryKeys";

/**
 * Tras vender/cancelar, el corte cambia (cobros efectivo + salidas de la
 * sesión). Este test fija que la invalidación centralizada alcanza a las
 * queries del corte: Cortes (`reports.cash(params)`) y el Reporte del Día en
 * Caja (`['daily-report','cash', from, to, storeId]`) — bug QA Mario 2026-08-17.
 */
describe("invalidateAfterSale", () => {
  const seed = (qc: QueryClient) => {
    qc.setQueryData(queryKeys.reports.cash({ from: "2026-08-17", to: "2026-08-17", store_id: 3 }), { sessions: [] });
    qc.setQueryData(["daily-report", "cash", "2026-08-17", "2026-08-17", 3], { sessions: [] });
    qc.setQueryData(queryKeys.reports.sales({ from: "2026-08-17" }), { summary: {} });
  };

  it("invalida el corte (reports.cash con cualquier params) y el Reporte del Día", () => {
    const qc = new QueryClient();
    seed(qc);

    invalidateAfterSale(qc);

    const cache = qc.getQueryCache();
    const cash = cache.find({ queryKey: queryKeys.reports.cash({ from: "2026-08-17", to: "2026-08-17", store_id: 3 }) });
    const daily = cache.find({ queryKey: ["daily-report", "cash", "2026-08-17", "2026-08-17", 3] });
    expect(cash?.state.isInvalidated).toBe(true);
    expect(daily?.state.isInvalidated).toBe(true);
  });

  it("no toca reportes ajenos al corte", () => {
    const qc = new QueryClient();
    seed(qc);

    invalidateAfterSale(qc);

    const sales = qc.getQueryCache().find({ queryKey: queryKeys.reports.sales({ from: "2026-08-17" }) });
    expect(sales?.state.isInvalidated).toBe(false);
  });
});
