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

  it("Efectivo incluye regulares Y manga en la misma pestaña; Devoluciones a la derecha", () => {
    const wb = buildBook();
    const ef = sheet(wb, "Efectivo");
    // El total de efectivo = Sticker ($90) + Tomo 21 ($300)
    const total = find(ef, "TOTAL EFECTIVO");
    expect(result(ef, total.row, total.col + 2)).toBe(390);
    expect(formula(ef, total.row, total.col + 2)).toMatch(/^SUM\(/);
    // Tomo 21 aparece en la misma pestaña
    expect(() => find(ef, "Tomo 21")).not.toThrow();
    // El renglón azul de Manga resume los tomos
    const manga = find(ef, "📘 MANGA NACIONAL (incluido)");
    expect(result(ef, manga.row, manga.col + 2)).toBe(300);
    // Devoluciones a la derecha, misma fila que el encabezado
    const dev = find(ef, " 5. DEVOLUCIONES Y CANCELACIONES");
    expect(dev.row).toBe(find(ef, " 1. VENTAS EN EFECTIVO").row);
    // No existen pestañas separadas de Manga
    expect(wb.getWorksheet("Efectivo Manga")).toBeUndefined();
  });

  it("Tarjeta incluye regulares Y manga; IVA y neto como fórmulas", () => {
    const wb = buildBook();
    const ta = sheet(wb, "Tarjeta");
    // Ambos productos (ETB y Tomo 21) en Tarjeta
    expect(() => find(ta, "ETB")).not.toThrow();
    expect(() => find(ta, "Tomo 21")).not.toThrow();
    // IVA = comisión × 0.16
    const neto = find(ta, "Neto Tarjeta");
    const dataRow = neto.row + 1; // primera fila de datos (ETB o Tomo, orden A-Z)
    expect(formula(ta, dataRow, neto.col - 1)).toMatch(/\*0\.16$/);
    // Bruto total = ETB $100 + Tomo $150
    const totalTarjeta = find(ta, "TOTAL TARJETA");
    expect(result(ta, totalTarjeta.row, totalTarjeta.col + 2)).toBe(250);
    expect(wb.getWorksheet("Tarjeta Manga")).toBeUndefined();
  });

  it("Transferencias incluye regulares Y manga en la misma pestaña", () => {
    const wb = buildBook();
    const tr = sheet(wb, "Transferencias");
    // Total = ETB ($50 neto con descuento) + Tomo ($150)
    expect(result(tr, find(tr, "TOTAL TRANSFERENCIAS").row, 3)).toBe(200);
    expect(() => find(tr, "Tomo 21")).not.toThrow();
    expect(wb.getWorksheet("Transferencias Manga")).toBeUndefined();
  });

  it("Preventas es la última pestaña y Pactado = Abonado + Pendiente", () => {
    const pre = sheet(buildBook(), "Preventas");
    const row = find(pre, "Preventa X (Apartada)");
    expect(formula(pre, row.row, row.col + 4)).toBe(`${pre.getCell(row.row, row.col + 2).address}+${pre.getCell(row.row, row.col + 3).address}`);
    expect(result(pre, row.row, row.col + 4)).toBe(1000);
  });

  it("Resumen liga los 3 métodos y calcula Total Bruto (sin costos: col C)", () => {
    const res = sheet(buildBook(), "Resumen");
    // Sin canViewCost: venta en col 3 (C)
    const ef = find(res, "Efectivo:");
    expect(formula(res, ef.row, 3)).toMatch(/^'Efectivo'!C\d+$/);
    expect(result(res, ef.row, 3)).toBe(390); // Sticker + Tomo 21
    expect(result(res, find(res, "Tarjeta:").row, 3)).toBe(250); // bruto tarjeta
    expect(result(res, find(res, "Transferencias:").row, 3)).toBe(200);
    const bruto = find(res, "Total Bruto:");
    expect(result(res, bruto.row, 3)).toBe(390 + 250 + 200);
    // Total Final = bruto − egresos (col C)
    const fin = find(res, "TOTAL FINAL:");
    expect(formula(res, fin.row, 3)).toMatch(/C\d+-C\d+/);
    // No hay fila "Efectivo Manga:" ni "Tarjeta Manga:"
    expect(() => find(res, "Efectivo Manga:")).toThrow();
    expect(() => find(res, "Tarjeta Manga:")).toThrow();
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

  it("con costos: Resumen muestra Costo/Venta/Utilidad por método (cols C/D/E)", () => {
    const wb = buildBook(true);
    // Cada pestaña tiene columna Utilidad con fórmula
    const ef = sheet(wb, "Efectivo");
    const utilHeader = find(ef, "Utilidad Efectivo");
    expect(formula(ef, find(ef, "TOTAL EFECTIVO").row, utilHeader.col)).toMatch(/^SUM\(/);
    expect(formula(ef, utilHeader.row + 1, utilHeader.col)).toMatch(/^[A-Z]+\d+-[A-Z]+\d+$/);
    // Resumen: C=Costo, D=Venta, E=Utilidad
    const res = sheet(wb, "Resumen");
    const ef2 = find(res, "Efectivo:");
    expect(formula(res, ef2.row, 3)).toMatch(/^'Efectivo'!.*$/); // costo en col C
    expect(formula(res, ef2.row, 4)).toMatch(/^'Efectivo'!.*$/); // venta en col D
    expect(formula(res, ef2.row, 5)).toMatch(/^'Efectivo'!.*$/); // util en col E
    // Total Final = utilidades − egresos en col E
    const fin = find(res, "TOTAL FINAL:");
    expect(formula(res, fin.row, 5)).toMatch(/E\d+.*-.*\d+/);
  });
});

describe("buildGroupedProducts — detalle de descuentos por ticket", () => {
  it("guarda el ticket, el método principal y el motivo", () => {
    const rows = buildGroupedProducts(SALES, [], ["all"], "2026-10-03", "2026-10-03", false);
    const entry = rows.find(r => r.name === "ETB")!.discount_entries?.[0];
    expect(entry).toEqual(expect.objectContaining({ bucket: "transfer", kind: "manual", reason: "cortesia", amount: 50, cashier: "Ana" }));
  });
});
