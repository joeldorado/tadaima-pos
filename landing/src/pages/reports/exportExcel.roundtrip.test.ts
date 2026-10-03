import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildReportWorkbook } from "./exportExcel";
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
    presaleRows: [], groupedProducts,
    regularProducts: groupedProducts.filter(p => p.product_type !== "manga"),
    tomoProducts: groupedProducts.filter(p => p.product_type === "manga"),
    paymentBreakdown: { total: 559, cash: 359, card: 100, deposits: 100, usd: 0, transactionCount: 3 },
    invReport: null, topReport: null, custReport: null,
    from: "2026-09-28", to: "2026-10-02", today: "2026-10-03", activeTab: "ventas",
    canViewCost: true, ivaRate: 0.16, effectiveStoreId: null, selectedUserId: null,
    stores: [], users: [], supplyMovements: [],
    ...over,
  };
};

/** Escribe el libro a bytes y lo vuelve a leer, como lo haría Excel. */
async function roundtrip(p: ReportExportParams): Promise<ExcelJS.Workbook> {
  const buffer = await buildReportWorkbook(ExcelJS, p).xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  return loaded;
}

/** Mini evaluador: SUM(rango), referencias, + − y × constante. */
function evaluate(sheet: ExcelJS.Worksheet, formula: string): number {
  const num = (addr: string): number => {
    const v = sheet.getCell(addr).value;
    if (typeof v === "number") return v;
    if (v && typeof v === "object" && "result" in v) return Number(v.result ?? 0);
    return 0;
  };
  const sum = /^SUM\(([A-Z]+)(\d+)(?::[A-Z]+(\d+))?\)$/.exec(formula);
  if (sum) {
    let total = 0;
    for (let r = Number(sum[2]); r <= Number(sum[3] ?? sum[2]); r++) total += num(`${sum[1]}${r}`);
    return total;
  }
  const mul = /^([A-Z]+\d+)\*([\d.]+)$/.exec(formula);
  if (mul) return num(mul[1]!) * Number(mul[2]);
  return formula.split(/(?=[+-])/).reduce((acc, term) => {
    const sign = term.startsWith("-") ? -1 : 1;
    return acc + sign * num(term.replace(/^[+-]/, ""));
  }, 0);
}

describe("Excel de ventas — generado y leído de vuelta", () => {
  it("trae los cinco bloques, el subtotal de tomos y el detalle por ticket", async () => {
    const sheet = (await roundtrip(params())).getWorksheet("Ventas")!;

    expect(sheet.getCell("A1").value).toBe("TADAIMA - REPORTE DE AUDITORÍA Y VENTAS");
    expect(sheet.getCell("A2").value).toContain("Periodo: 28 sep 2026 al 02 oct 2026");
    expect(sheet.getCell("V8").value).toBe(" 3. TRANSFERENCIAS / DEPÓSITOS");
    expect(sheet.getCell("A10").value).toBe("Carta");
    expect(sheet.getCell("A11").value).toBe("Tomo 1 Naruto");
    expect(sheet.getCell("A12").value).toBe("TOTAL EFECTIVO");
    expect(sheet.getCell("A13").value).toBe("📘 MANGA NACIONAL (incluido)");
    expect(sheet.getCell("A16").value).toBe(" 1.1 EFECTIVO — DESCUENTOS Y OFERTAS");
    expect(sheet.getCell("B18").value).toBe("🏷️ Dañado · Abierto");
    expect(sheet.getCell("B17").isMerged).toBe(true);
    expect(sheet.getCell("I5").value).toBe("📘 Manga Nacional:");
  });

  it("cada fórmula trae su valor guardado y coincide al recalcularla", async () => {
    for (const canViewCost of [true, false]) {
      const sheet = (await roundtrip(params({ canViewCost }))).getWorksheet("Ventas")!;
      let formulas = 0;
      sheet.eachRow(row => row.eachCell(cell => {
        const v = cell.value;
        if (!v || typeof v !== "object" || !("formula" in v)) return;
        formulas++;
        expect(v.formula.startsWith("="), cell.address).toBe(false);
        expect(Number.isFinite(v.result), `${cell.address} sin valor guardado`).toBe(true);
        expect(evaluate(sheet, v.formula), `${cell.address} = ${v.formula}`).toBeCloseTo(Number(v.result), 2);
      }));
      expect(formulas).toBeGreaterThan(10);
    }
  });

  it("los valores cuadran con el resumen de pagos", async () => {
    const sheet = (await roundtrip(params())).getWorksheet("Ventas")!;
    const result = (addr: string) => Number((sheet.getCell(addr).value as ExcelJS.CellFormulaValue).result);

    expect(result("B5")).toBe(559);          // total bruto = efectivo + tarjetas + depósitos
    expect(result("D12")).toBe(359);         // TOTAL EFECTIVO = "Efectivo:" del resumen
    expect(result("D13")).toBe(159);         // subtotal de tomos
    expect(result("J5")).toBe(159);          // Manga Nacional del resumen
    expect(result("E10")).toBe(80);          // utilidad = 200 − 120
    expect(result("P10")).toBeCloseTo(97.1); // neto = 100 − 2.5 − 0.4
  });

  it("sin ventas no truena", async () => {
    const sheet = (await roundtrip(params({
      groupedProducts: [], regularProducts: [], tomoProducts: [],
      paymentBreakdown: { total: 0, cash: 0, card: 0, deposits: 0, usd: 0, transactionCount: 0 },
    }))).getWorksheet("Ventas")!;
    expect(sheet.getCell("A8").value).toBe(" 1. VENTAS EN EFECTIVO");
    expect(sheet.getCell("J5").value).toBe(0);
  });

  it("la pestaña Inventario no cambió", async () => {
    const book = await roundtrip(params({
      activeTab: "inventario",
      invReport: { data: [{ product: { name: "Figura" }, warehouse: { name: "Exhibición", store: "Centro" }, quantity: 3 }] } as never,
    }));
    const sheet = book.getWorksheet("Inventario")!;
    expect(sheet.getCell("A1").value).toBe("TADAIMA - REPORTE DE INVENTARIO");
    expect(sheet.getCell("A5").value).toBe("Figura");
    expect(book.getWorksheet("Ventas")).toBeUndefined();
  });
});
