import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

// Los dos botones del cierre de caja (turno y toda la tienda) arman el MISMO
// Excel que Reportes (2026-10-03): solo cambia el alcance de los datos.
const fetchAllSales = vi.fn<(params: unknown) => Promise<{ data: unknown[] }>>();
vi.mock("@/lib/fetchAllPages", () => ({ fetchAllSales: (params: unknown) => fetchAllSales(params) }));
vi.mock("@tadaima/api", () => ({
  getPreSaleOrders: vi.fn(() => Promise.resolve({ data: [] })),
  getSupplyMovements: vi.fn(() => Promise.resolve([])),
}));

const { buildCashCloseReportParams } = await import("./buildCashCloseReport");
const { addVentasSheets } = await import("./excelVentas");

const SALE = {
  id: 1, store_id: 1, user_id: 7, subtotal: 100, discount: 0, surcharge: 0, total: 100, commission_amount: 0,
  status: "completed", cancellation_status: "none", customer: null, user: { id: 7, name: "Ana" },
  items: [{ id: 10, product_id: 3, product_name: "ETB", quantity: 1, price: 100, total: 100, product: { id: 3, name: "ETB", sku: "E", categories: ["TCG"] }, created_at: "2026-10-03T18:00:00Z" }],
  payments: [{ id: 1, amount: 100, payment_method: { id: 4, name: "Transferencia" } }],
  sold_at: "2026-10-03T18:00:00Z", created_at: "2026-10-03T18:00:00Z",
};

async function bookFor(userId: number | null): Promise<ExcelJS.Workbook> {
  fetchAllSales.mockResolvedValueOnce({ data: [SALE] });
  const params = await buildCashCloseReportParams({
    day: "2026-10-03", storeId: 1, userId, userName: "Ana", storeName: "Centro", canViewCost: false, ivaRate: 0.16,
  });
  const wb = new ExcelJS.Workbook();
  addVentasSheets(wb, params);
  return wb;
}

/** Todo el texto de todas las pestañas. */
const allText = (wb: ExcelJS.Workbook): string[] => {
  const out: string[] = [];
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((cell) => { if (typeof cell.value === "string") out.push(cell.value); })));
  return out;
};

describe("Excel del cierre de caja", () => {
  it.each([
    ["turno (cajero)", 7, "Usuario: Ana", { user_id: 7 }],
    ["toda la tienda", null, "Usuario: Todos", { whole_store: true }],
  ] as const)("%s usa el formato nuevo", async (_label, userId, userLine, scope) => {
    const wb = await bookFor(userId);
    const text = allText(wb);
    expect(wb.worksheets[0]!.getCell(1, 1).value).toBe("TADAIMA - CORTE DE CAJA");
    expect(text.some((t) => t.includes(userLine) && t.includes("Tienda: Centro"))).toBe(true);
    expect(wb.worksheets.map((w) => w.name)).toContain("Resumen");
    for (const title of [
      "RESUMEN DE VENTAS", " 1. VENTAS EN EFECTIVO", " 2. DESGLOSE DE COBROS CON TARJETA", " 3. TRANSFERENCIAS / DEPÓSITOS",
      " 1. EFECTIVO — APARTADOS Y PREVENTAS", " 2. TARJETA — APARTADOS Y PREVENTAS", " 3. TRANSFERENCIAS — APARTADOS Y PREVENTAS",
      " 5. DEVOLUCIONES Y CANCELACIONES",
    ]) {
      expect(text).toContain(title);
    }
    expect(text).toContain("TOTAL TRANSFERENCIAS");
    expect(fetchAllSales).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-10-03", to: "2026-10-03", store_id: 1, ...scope }));
  });
});
