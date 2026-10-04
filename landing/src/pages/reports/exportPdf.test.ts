import { describe, expect, it } from "vitest";
import { buildReportPdf } from "./exportPdf";
import type { GroupedProduct, ReportExportParams } from "./reportTypes";

// El PDF lleva el mismo formato del Excel de ventas (2026-10-03): tablas por
// método, renglón Manga Nacional y detalle por ticket. Usa las mismas tablas
// del Excel (excelTopTables), así que aquí solo se revisa que se pinten.
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
      discount_entries: [{
        kind: "manual", bucket: "cash", sale_id: 30, date: "2026-09-28T19:00:00Z", cashier: "Diana",
        reason: "danado", note: "Abierto", quantity: 1, amount: 50,
      }],
      surcharge_entries: [{
        bucket: "transfer", sale_id: 286, date: "2026-10-01T19:00:00Z", cashier: "Diana",
        reason: "precio_especial", note: "SET", quantity: 1, amount: 20, catalog_price: 100,
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
  it("trae las tres tablas por método, el renglón de tomos y el detalle por ticket", () => {
    const text = pdfText(params());

    expect(text).toContain("1. VENTAS EN EFECTIVO");
    expect(text).toContain("2. DESGLOSE DE COBROS CON TARJETA");
    expect(text).toContain("3. TRANSFERENCIAS");
    expect(text).toContain("TOTAL EFECTIVO");
    expect(text).toContain("TOTAL TRANSFERENCIAS");
    expect(text).toContain("MANGA NACIONAL");
    expect(text).toContain("Manga Nacional: $159");
    expect(text).toContain("1.1 EFECTIVO");
    expect(text).toContain("#30");
    expect(text).toContain("3.2 TRANSFERENCIAS");
    expect(text).toContain("#286");
  });

  it("ya no agrupa por categoría ni pinta renglones de beneficio bajo cada producto", () => {
    const text = pdfText(params());
    expect(text).not.toContain("Subtotal ");
    expect(text).not.toContain("Descuento \\(");
  });

  it("un método sin movimientos no pinta su tabla ni su detalle", () => {
    const text = pdfText(params({ groupedProducts: [prod({})] }));
    expect(text).toContain("1. VENTAS EN EFECTIVO");
    expect(text).not.toContain("2. DESGLOSE DE COBROS CON TARJETA");
    expect(text).not.toContain("3. TRANSFERENCIAS");
    expect(text).not.toContain("1.1 EFECTIVO");
    expect(text).not.toContain("MANGA NACIONAL");
  });

  it("una preventa no entra a las tablas por método (va en su propia tabla)", () => {
    const text = pdfText(params({
      groupedProducts: [prod({ id: 100_000_009, name: "ETB Mega (Apartada)", pre_sale_apartado: 200 })],
      presaleRows: [{ productId: 9, name: "ETB Mega (Apartada)", entregado: false, qty: 1, apartado: 200, deuda: 300, pactado: 500, costoReal: 0, costoNeto: 200, utilidad: 0 }],
    }));
    expect(text).not.toContain("1. VENTAS EN EFECTIVO");
    expect(text).toContain("4. APARTADOS Y PREVENTAS");
  });

  it("sin permiso de costos no hay columnas de costo ni utilidad", () => {
    const text = pdfText(params({ canViewCost: false }));
    expect(text).not.toContain("Utilidad");
    expect(text).not.toContain("Costo");
  });

  it("el corte de caja lleva su propio título", () => {
    expect(pdfText(params({ title: "TADAIMA - CORTE DE CAJA" }))).toContain("TADAIMA - CORTE DE CAJA");
    expect(pdfText(params())).toContain("TADAIMA - REPORTE DE AUDITOR");
  });
});
