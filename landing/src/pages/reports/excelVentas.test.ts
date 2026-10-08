import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { SaleDetail } from "@tadaima/api";
import { buildGroupedProducts, buildPaymentBreakdown } from "./buildReportData";
import { addVentasSheets } from "./excelVentas";
import type { PresaleRow, ReportExportParams } from "./reportTypes";

// Excel de Ventas en pestañas (2026-10-05): una tabla por pestaña, los tomos
// (Manga Nacional) en pestañas propias y los totales como fórmulas.
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
  sale("card", { ...tomo, quantity: 1, total: 150 }),
  sale("transfer", { ...tomo, quantity: 1, total: 150 }),
  sale("transfer", etb({ discount_amount: 50, benefit_type: "discount", discount_reason: "cortesia", discount_note: "cliente frecuente", total: 100 })),
];

const PRESALE: PresaleRow = {
  productId: 9, name: "Preventa X (Apartada)", entregado: false, qty: 2,
  apartado: 300, deuda: 700, pactado: 1000, costoReal: 800, costoNeto: 300, utilidad: 0,
};

function buildBook(canViewCost = false): ExcelJS.Workbook {
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
  addVentasSheets(wb, params);
  return wb;
}
const sheet = (wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet => wb.getWorksheet(name)!;

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

describe("Excel de Ventas en pestañas", () => {
  it("arma 5 pestañas: Resumen · Efectivo · Tarjeta · Transferencias · Preventas", () => {
    const wb = buildBook();
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Resumen", "Efectivo", "Tarjeta", "Transferencias", "Preventas",
    ]);
    for (const ws of wb.worksheets) {
      expect(ws.getCell(1, 1).value).toBe("TADAIMA - CORTE DE CAJA");
      expect(text(ws, 2, 1)).toContain("Periodo:");
    }
  });

  it("Efectivo: regulares arriba, Manga abajo con su propio encabezado, TOTAL FINAL al pie", () => {
    const wb = buildBook();
    const ef = sheet(wb, "Efectivo");
    // Sub-tabla de regulares: solo Sticker ($90)
    const totalReg = find(ef, "TOTAL EFECTIVO");
    expect(result(ef, totalReg.row, totalReg.col + 2)).toBe(90);
    expect(formula(ef, totalReg.row, totalReg.col + 2)).toMatch(/^SUM\(/);
    // Sub-tabla de manga con su propio encabezado
    expect(() => find(ef, "1. EFECTIVO — MANGA NACIONAL")).not.toThrow();
    expect(() => find(ef, "Tomo 21")).not.toThrow();
    // Renglón TOTAL FINAL EFECTIVO combina ambas sub-tablas ($90 + $300 = $390)
    const fin = find(ef, "TOTAL FINAL EFECTIVO");
    expect(result(ef, fin.row, fin.col + 2)).toBe(390);
    expect(formula(ef, fin.row, fin.col + 2)).toMatch(/\+/); // suma de ambos totales
    // Devoluciones a la derecha, misma fila que el encabezado de regulares
    const dev = find(ef, " 5. DEVOLUCIONES Y CANCELACIONES");
    expect(dev.row).toBe(find(ef, " 1. VENTAS EN EFECTIVO").row);
    // No existen pestañas separadas de Manga
    expect(wb.getWorksheet("Efectivo Manga")).toBeUndefined();
  });

  it("Tarjeta: regulares arriba, Manga abajo, TOTAL FINAL al pie; IVA como fórmula", () => {
    const wb = buildBook();
    const ta = sheet(wb, "Tarjeta");
    // ETB es regular; Tomo 21 va en la sub-tabla de manga
    expect(() => find(ta, "ETB")).not.toThrow();
    expect(() => find(ta, "Tomo 21")).not.toThrow();
    expect(() => find(ta, "2. TARJETA — MANGA NACIONAL")).not.toThrow();
    // IVA = comisión × 0.16 en la sub-tabla de regulares
    const neto = find(ta, "Neto Tarjeta");
    const dataRow = neto.row + 1;
    expect(formula(ta, dataRow, neto.col - 1)).toMatch(/\*0\.16$/);
    // Sub-tabla regulares: solo ETB $100
    const totalReg = find(ta, "TOTAL TARJETA");
    expect(result(ta, totalReg.row, totalReg.col + 2)).toBe(100);
    // TOTAL FINAL TARJETA combina ETB ($100) + Tomo ($150) = $250
    const fin = find(ta, "TOTAL FINAL TARJETA");
    expect(result(ta, fin.row, fin.col + 2)).toBe(250);
    expect(wb.getWorksheet("Tarjeta Manga")).toBeUndefined();
  });

  it("Transferencias: regulares arriba, Manga abajo, TOTAL FINAL al pie", () => {
    const wb = buildBook();
    const tr = sheet(wb, "Transferencias");
    expect(() => find(tr, "Tomo 21")).not.toThrow();
    expect(() => find(tr, "3. TRANSFERENCIAS — MANGA NACIONAL")).not.toThrow();
    // Sub-tabla regulares: solo ETB ($50 neto con descuento)
    expect(result(tr, find(tr, "TOTAL TRANSFERENCIAS").row, 3)).toBe(50);
    // TOTAL FINAL TRANSFERENCIAS = ETB ($50) + Tomo ($150) = $200
    expect(result(tr, find(tr, "TOTAL FINAL TRANSFERENCIAS").row, 3)).toBe(200);
    expect(wb.getWorksheet("Transferencias Manga")).toBeUndefined();
  });

  it("Preventas es la última pestaña y Pactado = Abonado + Pendiente", () => {
    const pre = sheet(buildBook(), "Preventas");
    const row = find(pre, "Preventa X (Apartada)");
    expect(formula(pre, row.row, row.col + 4)).toBe(`${pre.getCell(row.row, row.col + 2).address}+${pre.getCell(row.row, row.col + 3).address}`);
    expect(result(pre, row.row, row.col + 4)).toBe(1000);
  });

  it("Resumen muestra desglose regular+manga por método con totales y TOTALES FINALES (sin costos)", () => {
    const res = sheet(buildBook(), "Resumen");
    // Encabezados de bloque por método
    expect(() => find(res, "EFECTIVO")).not.toThrow();
    expect(() => find(res, "TARJETA")).not.toThrow();
    expect(() => find(res, "TRANSFERENCIAS")).not.toThrow();
    // Filas de regular y manga desglosadas
    expect(() => find(res, "Efectivo:")).not.toThrow();
    expect(() => find(res, "Efectivo Manga:")).not.toThrow();
    expect(() => find(res, "Tarjeta:")).not.toThrow();
    expect(() => find(res, "Tarjeta Manga:")).not.toThrow();
    // Egresos y Total efectivo bajo el bloque de Efectivo
    expect(() => find(res, "Egresos")).not.toThrow();
    expect(() => find(res, "Total efectivo")).not.toThrow();
    // TOTALES FINALES al pie
    expect(() => find(res, "TOTALES FINALES:")).not.toThrow();
    // Sin costos: col 3 (C) es Venta, cols Costo/Utilidad no aparecen
    const ef = find(res, "Efectivo:");
    expect(result(res, ef.row, 3)).toBe(90); // regulares efectivo (manga va en su propia fila)
  });

  it("Resumen trae descuentos y aumentos por método y Egresos", () => {
    const res = sheet(buildBook(), "Resumen");
    const t31 = find(res, "3.1 TRANSFERENCIAS — DESCUENTOS Y OFERTAS");
    expect(text(res, t31.row + 2, t31.col)).toContain("ETB ×1");
    expect(text(res, t31.row + 2, t31.col + 1)).toContain("cortesía · cliente frecuente");
    expect(find(res, "1.1 EFECTIVO — DESCUENTOS Y OFERTAS").col).toBe(1);
    expect(find(res, "2.1 TARJETA — DESCUENTOS Y OFERTAS").col).toBeGreaterThan(1);
    expect(() => find(res, "6. EGRESOS — INSUMOS DE OPERACIÓN")).not.toThrow();
  });

  it("sin permiso de costos no aparece costo ni utilidad en ninguna pestaña", () => {
    const wb = buildBook(false);
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((cell) => {
      if (typeof cell.value === "string") expect(cell.value).not.toMatch(/costo|utilidad/i);
    })));
  });

  it("con costos: Resumen muestra Costo/Venta/Utilidad por método con desglose regular+manga", () => {
    const wb = buildBook(true);
    // Cada pestaña tiene columna Utilidad con fórmula en sub-tabla de regulares
    const ef = sheet(wb, "Efectivo");
    const utilHeader = find(ef, "Utilidad Efectivo");
    expect(formula(ef, find(ef, "TOTAL EFECTIVO").row, utilHeader.col)).toMatch(/^SUM\(/);
    expect(formula(ef, utilHeader.row + 1, utilHeader.col)).toMatch(/^[A-Z]+\d+-[A-Z]+\d+$/);
    // TOTAL FINAL EFECTIVO existe (combina regulares + manga)
    expect(() => find(ef, "TOTAL FINAL EFECTIVO")).not.toThrow();
    // Resumen: filas desglosadas por método (regular + manga) y totales finales
    const res = sheet(wb, "Resumen");
    // Encabezados de bloque presentes
    expect(() => find(res, "EFECTIVO")).not.toThrow();
    expect(() => find(res, "TARJETA")).not.toThrow();
    expect(() => find(res, "TRANSFERENCIAS")).not.toThrow();
    // Filas de método regular y manga presentes
    expect(() => find(res, "Efectivo:")).not.toThrow();
    expect(() => find(res, "Efectivo Manga:")).not.toThrow();
    // Egresos y Total efectivo presentes
    expect(() => find(res, "Egresos")).not.toThrow();
    expect(() => find(res, "Total efectivo")).not.toThrow();
    // TOTALES FINALES al pie
    expect(() => find(res, "TOTALES FINALES:")).not.toThrow();
    // Utilidad Total efectivo tiene fórmula que resta el total de egresos
    const totalEf = find(res, "Total efectivo");
    expect(formula(res, totalEf.row, 5)).toMatch(/E\d+-[A-Z]\d+/);
  });
});

describe("buildGroupedProducts — detalle de descuentos por ticket", () => {
  it("guarda el ticket, el método principal y el motivo", () => {
    const rows = buildGroupedProducts(SALES, [], ["all"], "2026-10-03", "2026-10-03", false);
    const entry = rows.find(r => r.name === "ETB")!.discount_entries?.[0];
    expect(entry).toEqual(expect.objectContaining({ bucket: "transfer", kind: "manual", reason: "cortesia", amount: 50, cashier: "Ana" }));
  });
});
