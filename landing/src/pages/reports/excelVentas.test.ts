import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { SaleDetail } from "@tadaima/api";
import { buildGroupedProducts, buildPaymentBreakdown } from "./buildReportData";
import { addVentasSheet } from "./excelVentas";
import type { PresaleRow, ReportExportParams } from "./reportTypes";

// Excel de Ventas = réplica del de la app (2026-10-03): una tabla por método
// (efectivo / tarjeta / transferencia), descuentos por ticket debajo de su
// método y totales como fórmulas.
const METHODS: Record<string, { id: number; name: string }> = {
  cash: { id: 1, name: "Efectivo" },
  card: { id: 2, name: "Tarjeta Débito" },
  transfer: { id: 4, name: "Transferencia" },
};

let nextId = 1;
const sale = (method: keyof typeof METHODS, item: Record<string, unknown>, over: Partial<SaleDetail> = {}): SaleDetail => {
  const id = nextId++;
  const total = Number(item.total) - Number(item.discount_amount ?? 0);
  return {
    id, store_id: 1, user_id: 1, customer_id: null, draft_id: null,
    subtotal: Number(item.total), discount: Number(item.discount_amount ?? 0), surcharge: 0, total,
    commission_amount: method === "card" ? 5 : 0,
    status: "completed", cancellation_status: "none",
    customer: null, user: { id: 1, name: "Ana" },
    items: [{ id: id * 10, created_at: "2026-10-03T18:00:00Z", ...item }],
    payments: [{ id, payment_method_id: METHODS[method]!.id, terminal_id: null, amount: total, commission_amount: 0, payment_method: METHODS[method], created_at: "2026-10-03T18:00:00Z" }],
    sold_at: "2026-10-03T18:00:00Z", created_at: "2026-10-03T18:00:00Z",
    ...over,
  } as SaleDetail;
};

const sticker = { product_id: 1, product_name: "Sticker", quantity: 3, price: 30, total: 90, product: { id: 1, name: "Sticker", sku: "S", categories: ["Accesorios"] } };
const tomo = { product_id: 2, product_name: "Tomo 21", quantity: 2, price: 150, total: 300, product: { id: 2, name: "Tomo 21", sku: "T", product_type: "manga", categories: ["Manga"] } };
const etb = (over: Record<string, unknown> = {}) => ({ product_id: 3, product_name: "ETB", quantity: 1, price: 100, total: 100, product: { id: 3, name: "ETB", sku: "E", categories: ["TCG"] }, ...over });

const SALES: SaleDetail[] = [
  sale("cash", sticker),
  sale("cash", tomo),
  sale("card", etb()),
  sale("transfer", etb({ discount_amount: 50, benefit_type: "discount", discount_reason: "cortesia", discount_note: "cliente frecuente", total: 100 })),
];

const PRESALE: PresaleRow = {
  productId: 9, name: "Preventa X (Apartada)", entregado: false, qty: 2,
  apartado: 300, deuda: 700, pactado: 1000, costoReal: 800, costoNeto: 300, utilidad: 0,
};

function buildSheet(canViewCost = false): ExcelJS.Worksheet {
  const groupedProducts = buildGroupedProducts(SALES, [], ["all"], "2026-10-03", "2026-10-03", canViewCost);
  const params: ReportExportParams = {
    presaleRows: [PRESALE],
    groupedProducts,
    regularProducts: groupedProducts,
    tomoProducts: [],
    paymentBreakdown: buildPaymentBreakdown(SALES, [], ["all"], "2026-10-03", "2026-10-03"),
    invReport: null, topReport: null, custReport: null,
    from: "2026-10-03", to: "2026-10-03", today: "2026-10-03",
    activeTab: "ventas", canViewCost, ivaRate: 0.16,
    effectiveStoreId: null, selectedUserId: null, stores: [], users: [],
    supplyMovements: [],
    title: "TADAIMA - CORTE DE CAJA",
  };
  const wb = new ExcelJS.Workbook();
  addVentasSheet(wb, params);
  return wb.getWorksheet("Ventas")!;
}

/** Fila y columna de la primera celda con ese texto. */
function find(ws: ExcelJS.Worksheet, text: string): { row: number; col: number } {
  let hit: { row: number; col: number } | null = null;
  ws.eachRow((row, r) => row.eachCell((cell, c) => {
    if (!hit && typeof cell.value === "string" && cell.value.includes(text)) hit = { row: r, col: c };
  }));
  if (!hit) throw new Error(`No se encontró "${text}"`);
  return hit;
}

const result = (ws: ExcelJS.Worksheet, r: number, c: number): unknown => {
  const v = ws.getCell(r, c).value;
  return v && typeof v === "object" && "result" in v ? v.result : v;
};
const text = (ws: ExcelJS.Worksheet, r: number, c: number): string => {
  const v = ws.getCell(r, c).value;
  return typeof v === "string" ? v : "";
};
const formula = (ws: ExcelJS.Worksheet, r: number, c: number): string | undefined => {
  const v = ws.getCell(r, c).value;
  return v && typeof v === "object" && "formula" in v ? v.formula : undefined;
};

describe("Excel de Ventas (réplica de la app)", () => {
  it("usa el título del corte y el resumen suma con fórmula", () => {
    const ws = buildSheet();
    expect(ws.getCell(1, 1).value).toBe("TADAIMA - CORTE DE CAJA");
    expect(formula(ws, 5, 2)).toBe("D5+F5+H5");
    expect(result(ws, 5, 2)).toBe(90 + 300 + 100 + 50);
  });

  it("efectivo, tarjeta y transferencia van en tablas separadas con TOTAL en fórmula", () => {
    const ws = buildSheet();
    const cashTotal = find(ws, "TOTAL EFECTIVO");
    expect(result(ws, cashTotal.row, cashTotal.col + 2)).toBe(390);
    expect(formula(ws, cashTotal.row, cashTotal.col + 2)).toMatch(/^SUM\(/);

    const cardTotal = find(ws, "TOTAL TARJETA");
    expect(result(ws, cardTotal.row, cardTotal.col + 2)).toBe(100); // bruto
    const transferTotal = find(ws, "TOTAL TRANSFERENCIAS");
    expect(result(ws, transferTotal.row, transferTotal.col + 2)).toBe(50); // neto con descuento
    expect(cardTotal.col).toBeGreaterThan(cashTotal.col);
    expect(transferTotal.col).toBeGreaterThan(cardTotal.col);
  });

  it("tarjeta calcula IVA y neto con fórmulas por renglón", () => {
    const ws = buildSheet();
    const etbRow = find(ws, "Neto Tarjeta");
    const dataRow = etbRow.row + 1; // primer renglón de la tabla
    expect(ws.getCell(dataRow, etbRow.col - 5).value).toBe("ETB");
    expect(formula(ws, dataRow, etbRow.col - 1)).toMatch(/\*0\.16$/);
    expect(result(ws, dataRow, etbRow.col)).toBeCloseTo(100 - 5 - 0.8);
  });

  it("lista ordenada por categoría sin encabezados ni subtotales, y marca la Manga Nacional", () => {
    const ws = buildSheet();
    expect(() => find(ws, "Subtotal")).toThrow();
    const header = find(ws, "Venta Efectivo");
    expect(ws.getCell(header.row + 1, 1).value).toBe("Sticker"); // Accesorios
    expect(ws.getCell(header.row + 2, 1).value).toBe("Tomo 21"); // Manga
    const cashTotal = find(ws, "TOTAL EFECTIVO");
    expect(text(ws, cashTotal.row + 1, cashTotal.col)).toContain("MANGA NACIONAL (incluido)");
    expect(result(ws, cashTotal.row + 1, cashTotal.col + 2)).toBe(300);
    expect(result(ws, 5, 10)).toBe(300); // cuadro del resumen
  });

  it("la preventa va solo en su tabla y Pactado = Abonado + Pendiente", () => {
    const ws = buildSheet();
    const pre = find(ws, "Preventa X (Apartada)");
    expect(formula(ws, pre.row, pre.col + 4)).toBe(`${ws.getCell(pre.row, pre.col + 2).address}+${ws.getCell(pre.row, pre.col + 3).address}`);
    expect(result(ws, pre.row, pre.col + 4)).toBe(1000);
  });

  it("el descuento cae en la tabla de su método con ticket y motivo", () => {
    const ws = buildSheet();
    const t31 = find(ws, "3.1 TRANSFERENCIAS — DESCUENTOS Y OFERTAS");
    expect(text(ws, t31.row + 2, t31.col)).toContain("ETB ×1");
    expect(text(ws, t31.row + 2, t31.col + 1)).toContain("cortesía · cliente frecuente");
    const t11 = find(ws, "1.1 EFECTIVO — DESCUENTOS Y OFERTAS");
    expect(ws.getCell(t11.row + 2, t11.col).value).toBe("Sin movimientos en el periodo");
  });

  it("con costos agrega utilidad como fórmula Venta − Costo", () => {
    const ws = buildSheet(true);
    const header = find(ws, "Utilidad Efectivo");
    const total = find(ws, "TOTAL EFECTIVO");
    expect(formula(ws, total.row, header.col)).toMatch(/^SUM\(/);
    const firstData = header.row + 1;
    expect(formula(ws, firstData, header.col)).toMatch(/^[A-Z]+\d+-[A-Z]+\d+$/);
  });
});

describe("buildGroupedProducts — detalle de descuentos por ticket", () => {
  it("guarda el ticket, el método principal y el motivo", () => {
    const rows = buildGroupedProducts(SALES, [], ["all"], "2026-10-03", "2026-10-03", false);
    const entry = rows.find(r => r.name === "ETB")!.discount_entries?.[0];
    expect(entry).toEqual(expect.objectContaining({ bucket: "transfer", kind: "manual", reason: "cortesia", amount: 50, cashier: "Ana" }));
  });
});
