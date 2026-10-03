import { describe, expect, it } from "vitest";
import { cellAddress, cellMap, formulaRefs, formulaText, isFormula, resolveResults, type SheetModel } from "./excelSheetModel";
import { buildVentasSheetModel, type VentasSheetInput } from "./excelVentasModel";
import type { AdjustmentRow, MethodRow } from "./ventasReportRows";

const row = (name: string, over: Partial<MethodRow> = {}): MethodRow =>
  ({ name, isManga: false, qty: 1, revenue: 100, cost: 60, commission: 0, ...over });

const adj = (over: Partial<AdjustmentRow> = {}): AdjustmentRow =>
  ({ kind: "discount", product: "Figura ×1", label: "Dañado · Abierto", ticket: "#30", cashier: "Diana", date: "28 sep 2026", amount: 50, ...over });

const input = (over: Partial<VentasSheetInput> = {}): VentasSheetInput => ({
  subtitle: "Periodo: 28 sep 2026 al 02 oct 2026  |  Tienda: Tadaima CENTRO  |  Usuario: Todos",
  rows: {
    blocks: {
      cash: [row("Carta"), row("Figura"), row("Zapato"), row("Tomo 1 Naruto", { isManga: true }), row("Tomo 2 Naruto", { isManga: true })],
      card: [row("Carta", { commission: 2.5 })],
      transfer: [row("Figura")],
    },
    discounts: { cash: [adj(), adj({ kind: "promo", label: "Promo: Card Holders", ticket: "#63", amount: 400 })], card: [], transfer: [] },
    surcharges: { cash: [], card: [], transfer: [adj({ kind: "surcharge", label: "Precio especial · SET", ticket: "#286", amount: 1 })] },
    returns: [{ name: "Carta", qty: 2, amount: 300 }],
  },
  presaleRows: [],
  paymentBreakdown: { cash: 500, card: 100, deposits: 100 },
  supplies: [{ name: "Compra de Cambio", note: "Compra de cambio", origin: "Caja", user: "Diana", store: "Tadaima CENTRO", amount: 12 }],
  canViewCost: true,
  ivaRate: 0.16,
  ...over,
});

const text = (model: SheetModel, addr: string): string | number | undefined => {
  const value = cellMap(model).get(addr)?.value;
  return value === undefined ? undefined : isFormula(value) ? formulaText(value) : value;
};
const hasMerge = (model: SheetModel, range: string): boolean =>
  model.merges.some(m => `${cellAddress({ row: m.r1, col: m.c1 })}:${cellAddress({ row: m.r2, col: m.c2 })}` === range);
const allTexts = (model: SheetModel): string[] =>
  model.cells.map(c => c.value).filter((v): v is string => typeof v === "string");
const rowOf = (model: SheetModel, label: string): number => {
  const cell = model.cells.find(c => c.value === label);
  if (!cell) throw new Error(`no existe la celda "${label}"`);
  return cell.row;
};

describe("buildVentasSheetModel — bloques como la muestra del equipo", () => {
  const model = buildVentasSheetModel(input());

  it("cinco bloques en las columnas A, J, V, AE y AP con sus títulos", () => {
    expect(text(model, "A8")).toBe(" 1. VENTAS EN EFECTIVO");
    expect(text(model, "J8")).toBe(" 2. DESGLOSE DE COBROS CON TARJETA");
    expect(text(model, "V8")).toBe(" 3. TRANSFERENCIAS / DEPÓSITOS");
    expect(text(model, "AE8")).toBe(" 4. APARTADOS Y PREVENTAS");
    expect(text(model, "AP8")).toBe(" 5. DEVOLUCIONES Y CANCELACIONES");
    for (const range of ["A8:E8", "J8:Q8", "V8:Z8", "AE8:AK8", "AP8:AR8"]) expect(hasMerge(model, range)).toBe(true);
  });

  it("encabezados de columna de cada bloque", () => {
    expect(["A9", "B9", "C9", "D9", "E9"].map(a => text(model, a)))
      .toEqual(["Producto", "Cant. Efectivo", "Costo Producto", "Venta Efectivo", "Utilidad Efectivo"]);
    expect(["J9", "K9", "L9", "M9", "N9", "O9", "P9", "Q9"].map(a => text(model, a)))
      .toEqual(["Producto", "Cant. Tarjeta", "Bruto Tarjeta", "Costo Producto", "Comisión TPV", "IVA (16%)", "Neto Tarjeta", "Utilidad Tarjeta"]);
    expect(["V9", "W9", "X9", "Y9", "Z9"].map(a => text(model, a)))
      .toEqual(["Producto", "Cant. Transferencia", "Costo Producto", "Venta Transferencia", "Utilidad Transferencia"]);
  });

  it("los cálculos de cada renglón son fórmulas", () => {
    expect(text(model, "E10")).toBe("D10-C10");
    expect(text(model, "O10")).toBe("N10*0.16");
    expect(text(model, "P10")).toBe("L10-N10-O10");
    expect(text(model, "Q10")).toBe("P10-M10");
    expect(text(model, "Z10")).toBe("Y10-X10");
  });

  it("TOTAL con SUM y, después, el subtotal de los tomos", () => {
    expect(text(model, "A15")).toBe("TOTAL EFECTIVO");
    expect(text(model, "B15")).toBe("SUM(B10:B14)");
    expect(text(model, "D15")).toBe("SUM(D10:D14)");
    expect(text(model, "A16")).toBe("📘 MANGA NACIONAL (incluido)");
    expect(text(model, "B16")).toBe("SUM(B13:B14)");
    expect(text(model, "E16")).toBe("SUM(E13:E14)");
  });

  it("los tomos van en negrita azul", () => {
    expect(cellMap(model).get("A13")?.style?.font).toEqual(expect.objectContaining({ bold: true, color: "FF1D4ED8" }));
    expect(cellMap(model).get("A10")?.style?.font?.bold).toBeUndefined();
  });

  it("un bloque sin tomos no lleva fila de Manga Nacional", () => {
    expect(text(model, "J11")).toBe("TOTAL TARJETA");
    expect(text(model, "J12")).toBeUndefined();
  });

  it("fila de resumen: valores numéricos, total con fórmula y Manga Nacional", () => {
    expect(["A5", "C5", "E5", "G5", "I5"].map(a => text(model, a)))
      .toEqual(["Total Bruto:", "Efectivo:", "Tarjetas:", "Depósitos:", "📘 Manga Nacional:"]);
    expect(text(model, "B5")).toBe("D5+F5+H5");
    expect([text(model, "D5"), text(model, "F5"), text(model, "H5")]).toEqual([500, 100, 100]);
    expect(text(model, "J5")).toBe("D16");
    const results = resolveResults(model);
    expect(results.get("B5")).toBe(700);
    expect(results.get("J5")).toBe(200);
  });

  it("devoluciones con su total", () => {
    expect([text(model, "AP10"), text(model, "AQ10"), text(model, "AR10")]).toEqual(["Carta", 2, 300]);
    expect(text(model, "AP11")).toBe("TOTAL DEVOLUCIONES");
    expect(text(model, "AR11")).toBe("SUM(AR10)");
  });
});

describe("buildVentasSheetModel — detalle por ticket y egresos", () => {
  const model = buildVentasSheetModel(input());
  // El bloque más largo (efectivo) termina en la fila 16 → dos filas en blanco.
  const head = 19;

  it("las tres tablas x.1 arrancan en la misma fila, combinadas a lo ancho de su bloque", () => {
    expect(text(model, `A${head}`)).toBe(" 1.1 EFECTIVO — DESCUENTOS Y OFERTAS");
    expect(text(model, `J${head}`)).toBe(" 2.1 TARJETA — DESCUENTOS Y OFERTAS");
    expect(text(model, `V${head}`)).toBe(" 3.1 TRANSFERENCIAS — DESCUENTOS Y OFERTAS");
    for (const range of [`A${head}:H${head}`, `J${head}:T${head}`, `V${head}:AC${head}`]) expect(hasMerge(model, range)).toBe(true);
  });

  it("columnas: producto, motivo combinado, ticket, quién cobró, fecha y monto", () => {
    expect(["A", "B", "E", "F", "G", "H"].map(c => text(model, `${c}${head + 1}`)))
      .toEqual(["Producto", "Motivo / nota", "Ticket", "Cobró", "Fecha", "Descuento"]);
    expect(hasMerge(model, `B${head + 1}:D${head + 1}`)).toBe(true);
    expect(hasMerge(model, `K${head + 1}:P${head + 1}`)).toBe(true);
    expect(["A", "B", "E", "F", "G", "H"].map(c => text(model, `${c}${head + 2}`)))
      .toEqual(["Figura ×1", "🏷️ Dañado · Abierto", "#30", "Diana", "28 sep 2026", 50]);
    expect(text(model, `B${head + 3}`)).toBe("🎁 Promo: Card Holders");
  });

  it("total de descuentos con SUM y, tres filas después, los aumentos", () => {
    expect(text(model, `A${head + 4}`)).toBe("TOTAL DESCUENTOS EFECTIVO");
    expect(text(model, `H${head + 4}`)).toBe(`SUM(H${head + 2}:H${head + 3})`);
    expect(text(model, `A${head + 7}`)).toBe(" 1.2 EFECTIVO — AUMENTOS DE PRECIO");
    expect(text(model, `H${head + 8}`)).toBe("Aumento");
  });

  it("sin movimientos se avisa y no hay total", () => {
    expect(text(model, `J${head + 2}`)).toBe("Sin movimientos en el periodo");
    expect(allTexts(model)).not.toContain("TOTAL DESCUENTOS TARJETA");
  });

  it("aumentos de transferencias con su etiqueta", () => {
    const r = rowOf(model, " 3.2 TRANSFERENCIAS — AUMENTOS DE PRECIO");
    expect(text(model, `W${r + 2}`)).toBe("📈 Precio especial · SET");
    expect(text(model, `V${r + 3}`)).toBe("TOTAL AUMENTOS TRANSFERENCIAS");
  });

  it("egresos al final, numerados como 6", () => {
    const r = rowOf(model, " 6. EGRESOS — INSUMOS DE OPERACIÓN");
    expect(r).toBeGreaterThan(rowOf(model, " 1.2 EFECTIVO — AUMENTOS DE PRECIO"));
    expect(["A", "B", "E", "F", "G", "H"].map(c => text(model, `${c}${r + 1}`)))
      .toEqual(["Insumo", "Descripción", "Origen", "Registró", "Tienda", "Monto"]);
    expect(text(model, `A${r + 2}`)).toBe("Compra de Cambio");
    expect(text(model, `H${r + 3}`)).toBe(`SUM(H${r + 2})`);
  });
});

describe("buildVentasSheetModel — casos límite", () => {
  it("sin permiso de costos no existe ninguna columna de costo ni utilidad", () => {
    const model = buildVentasSheetModel(input({ canViewCost: false }));
    expect(allTexts(model).filter(t => /costo|utilidad/i.test(t) && !/·/.test(t))).toEqual([]);
    expect(["A9", "B9", "C9"].map(a => text(model, a))).toEqual(["Producto", "Cant. Efectivo", "Venta Efectivo"]);
    expect(text(model, "D9")).toBeUndefined();
    // Tarjeta sigue en J; IVA y neto apuntan a sus columnas recorridas.
    expect(text(model, "J8")).toBe(" 2. DESGLOSE DE COBROS CON TARJETA");
    expect(text(model, "N10")).toBe("M10*0.16");
    expect(text(model, "O10")).toBe("L10-M10-N10");
    expect(text(model, "J5")).toBe("C16");
  });

  it("sin ventas: solo encabezados, avisos y Manga Nacional en 0", () => {
    const model = buildVentasSheetModel(input({
      rows: {
        blocks: { cash: [], card: [], transfer: [] },
        discounts: { cash: [], card: [], transfer: [] },
        surcharges: { cash: [], card: [], transfer: [] },
        returns: [],
      },
      supplies: [],
    }));
    expect(text(model, "A8")).toBe(" 1. VENTAS EN EFECTIVO");
    expect(allTexts(model).filter(t => t.startsWith("TOTAL "))).toEqual([]);
    expect(allTexts(model).filter(t => t === "Sin movimientos en el periodo")).toHaveLength(6);
    expect(allTexts(model)).toContain("Sin egresos de insumos en el periodo");
    expect(text(model, "J5")).toBe(0);
  });

  it("ninguna fórmula apunta a una celda que no existe", () => {
    for (const canViewCost of [true, false]) {
      const model = buildVentasSheetModel(input({ canViewCost }));
      const cells = cellMap(model);
      for (const cell of model.cells) {
        if (!isFormula(cell.value)) continue;
        for (const ref of formulaRefs(cell.value)) {
          const target = cells.get(cellAddress(ref))?.value;
          expect(typeof target === "number" || (target !== undefined && isFormula(target)),
            `${cellAddress(cell)} → ${cellAddress(ref)}`).toBe(true);
        }
      }
    }
  });

  it("preventas: renglones y total con SUM", () => {
    const model = buildVentasSheetModel(input({
      presaleRows: [{ productId: 1, name: "ETB (Apartada)", entregado: false, qty: 2, apartado: 200, deuda: 300, pactado: 500, costoReal: 0, costoNeto: 200, utilidad: 0 }],
    }));
    expect(["AE10", "AF10", "AG10", "AH10", "AI10", "AJ10", "AK10"].map(a => text(model, a)))
      .toEqual(["ETB (Apartada)", 2, 200, 300, 500, 200, 0]);
    expect(text(model, "AE11")).toBe("TOTAL PREVENTAS");
    expect(text(model, "AG11")).toBe("SUM(AG10)");
  });
});
