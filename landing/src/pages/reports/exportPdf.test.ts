import { describe, expect, it } from "vitest";
import { buildReportPdf } from "./exportPdf";
import type { GroupedProduct, ReportExportParams } from "./reportTypes";

const prod = (over: Partial<GroupedProduct>): GroupedProduct => ({
  id: 1, name: "Figura", sku: "F-1", sales_count: 1, total_quantity: 1, total_revenue: 100,
  payment_breakdown: { Efectivo: { qty: 1, revenue: 100 } }, price_breakdown: {},
  total_cost: 60, total_profit: 40, product_type: "product", ...over,
});

const params = (over: Partial<ReportExportParams> = {}): ReportExportParams => {
  const groupedProducts = [
    prod({
      id: 1, name: "Carta", total_quantity: 4, total_revenue: 400, total_cost: 240, commission_amount: 2.5,
      payment_breakdown: { Efectivo: { qty: 2, revenue: 200 }, Tarjeta: { qty: 1, revenue: 100 }, Transferencia: { qty: 1, revenue: 100 } },
      adjustment_entries: [{
        kind: "discount", sale_id: 30, date: "2026-09-28T19:00:00Z", cashier: "Diana", reason: "danado", note: "Abierto",
        quantity: 1, amount: 50, shares: { cash: 1, card: 0, transfer: 0 },
      }],
    }),
    prod({ id: 2, name: "Tomo 1 Naruto", product_type: "manga", total_revenue: 159, total_cost: 111.3, payment_breakdown: { Efectivo: { qty: 1, revenue: 159 } } }),
  ];
  return {
    presaleRows: [], groupedProducts, regularProducts: [], tomoProducts: [],
    paymentBreakdown: { total: 559, cash: 359, card: 100, deposits: 100, usd: 0, transactionCount: 3 },
    invReport: null, topReport: null, custReport: null,
    from: "2026-09-28", to: "2026-10-02", today: "2026-10-03", activeTab: "ventas",
    canViewCost: true, ivaRate: 0.16, effectiveStoreId: null, selectedUserId: null,
    stores: [], users: [], supplyMovements: [],
    ...over,
  };
};

/** Texto crudo del PDF (jsPDF no comprime por defecto). */
const pdfText = (p: ReportExportParams): string => buildReportPdf(p).output();

describe("PDF de ventas — mismo formato que el Excel", () => {
  it("trae los tres bloques por método, el subtotal de tomos y el detalle por ticket", () => {
    const text = pdfText(params());

    expect(text).toContain("1. VENTAS EN EFECTIVO");
    expect(text).toContain("2. DESGLOSE DE COBROS CON TARJETA");
    expect(text).toContain("3. TRANSFERENCIAS");
    expect(text).toContain("TOTAL EFECTIVO");
    expect(text).toContain("MANGA NACIONAL");
    expect(text).toContain("1.1 EFECTIVO");
    expect(text).toContain("#30");
    expect(text).toContain("Manga Nacional: $159");
  });

  it("ya no agrupa por categoría ni mete la transferencia en tarjeta", () => {
    const text = pdfText(params());
    expect(text).not.toContain("Subtotal ");
    expect(text).toContain("TOTAL TRANSFERENCIAS");
  });

  it("sin movimientos en un método no pinta su sección ni su detalle", () => {
    const text = pdfText(params({ groupedProducts: [prod({})] }));
    expect(text).toContain("1. VENTAS EN EFECTIVO");
    expect(text).not.toContain("2. DESGLOSE DE COBROS CON TARJETA");
    expect(text).not.toContain("3. TRANSFERENCIAS");
    expect(text).not.toContain("1.1 EFECTIVO");
    expect(text).not.toContain("MANGA NACIONAL");
  });

  it("sin permiso de costos no hay columnas de costo ni utilidad", () => {
    const text = pdfText(params({ canViewCost: false }));
    expect(text).not.toContain("Utilidad");
    expect(text).not.toContain("Costo");
  });
});
