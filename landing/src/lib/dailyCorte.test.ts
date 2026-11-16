import { describe, expect, it } from "vitest";
import { accSaleItems, type CorteSale, type CorteSaleItem } from "./dailyCorte";

const fechaOf = (s: CorteSale): string => (s.sold_at ?? s.created_at).slice(0, 10);

function item(over: Partial<CorteSaleItem> & { name: string; price: number; quantity: number }): CorteSaleItem {
  const { name, ...rest } = over;
  return { product_id: 1, product_name: name, total: over.price * over.quantity, ...rest };
}

function sale(items: CorteSaleItem[], over: Partial<CorteSale> = {}): CorteSale {
  const subtotal = items.reduce((a, i) => a + i.total, 0);
  const discount = items.reduce((a, i) => a + Number(i.discount_amount ?? 0), 0);
  const surcharge = items.reduce((a, i) => a + Number(i.surcharge_amount ?? 0), 0);
  return {
    created_at: "2026-11-15T18:00:00Z",
    subtotal, discount, total: subtotal - discount + surcharge,
    commission_amount: 0,
    items,
    ...over,
  };
}

const sum = (xs: number[]): number => Math.round(xs.reduce((a, n) => a + n, 0) * 100) / 100;

describe("accSaleItems — venta = lo cobrado por línea", () => {
  it("2x1: cobra 1 de 2 piezas; P. Unit neto y precio de lista", () => {
    const rows = accSaleItems([
      sale([item({ name: "Funko", price: 500, quantity: 2, discount_amount: 500 })]),
    ], { fechaOf });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Funko", cantidad: 2, venta: 500, precioUnit: 250, precioLista: 500 });
    expect(rows[0]!.cantidad * rows[0]!.precioUnit).toBe(rows[0]!.venta);
  });

  it("precio especial ($350 fijo y −45%): $1,899 bruto → $1,255 cobrado", () => {
    const s = sale([
      item({ name: "Manga deluxe", price: 499, quantity: 1, discount_amount: 149 }),
      item({ name: "Consola", price: 1100, quantity: 1, discount_amount: 495 }),
      item({ name: "Llavero", price: 300, quantity: 1 }),
    ]);
    expect(s.subtotal).toBe(1899);
    const rows = accSaleItems([s], { fechaOf });
    expect(sum(rows.map(r => r.venta))).toBe(1255);
    expect(rows.find(r => r.name === "Manga deluxe")).toMatchObject({ venta: 350, precioUnit: 350, precioLista: 499 });
    expect(rows.find(r => r.name === "Consola")).toMatchObject({ venta: 605, precioUnit: 605 });
    expect(rows.find(r => r.name === "Llavero")).toMatchObject({ venta: 300, precioUnit: 300, precioLista: 300 });
  });

  it("descuento manual y aumento por línea", () => {
    const rows = accSaleItems([
      sale([
        item({ name: "Cable", price: 200, quantity: 2, discount_amount: 80 }),
        item({ name: "Figura", price: 1000, quantity: 1, surcharge_amount: 150 }),
      ]),
    ], { fechaOf });
    expect(rows.find(r => r.name === "Cable")).toMatchObject({ venta: 320, precioUnit: 160, precioLista: 200 });
    expect(rows.find(r => r.name === "Figura")).toMatchObject({ venta: 1150, precioUnit: 1150 });
  });

  it("venta legacy con descuento global: prorrateo total/subtotal", () => {
    const legacy: CorteSale = {
      created_at: "2026-05-01T18:00:00Z",
      subtotal: 1000, discount: 100, total: 900,
      items: [item({ name: "A", price: 600, quantity: 1 }), item({ name: "B", price: 400, quantity: 1 })],
    };
    const rows = accSaleItems([legacy], { fechaOf });
    expect(rows.find(r => r.name === "A")!.venta).toBe(540);
    expect(rows.find(r => r.name === "B")!.venta).toBe(360);
  });

  it("regalo: $0 de venta, renglón aparte y no se lleva comisión", () => {
    const rows = accSaleItems([
      sale(
        [
          item({ name: "Tomo", price: 0, quantity: 1, cost: 0, is_gift: true }),
          item({ name: "Tomo", price: 180, quantity: 1, cost: 126 }),
        ],
        { commission_amount: 9 },
      ),
    ], { fechaOf, withComision: true });
    const gift = rows.find(r => r.name === "Tomo (Regalo)")!;
    expect(gift).toMatchObject({ venta: 0, comision: 0, isGift: true, tieneCosto: true, costo: 0 });
    expect(rows.find(r => r.name === "Tomo")).toMatchObject({ venta: 180, comision: 9, costo: 126 });
  });
});

describe("accSaleItems — agrupación y comisión", () => {
  it("mismo producto a precio lleno y con promo: renglones separados; mismo neto se suma", () => {
    const rows = accSaleItems([
      sale([item({ name: "Funko", price: 500, quantity: 1 })]),
      sale([item({ name: "Funko", price: 500, quantity: 2, discount_amount: 500 })]),
      sale([item({ name: "Funko", price: 500, quantity: 1 })]),
    ], { fechaOf });
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.precioUnit === 500)).toMatchObject({ cantidad: 2, venta: 1000 });
    expect(rows.find(r => r.precioUnit === 250)).toMatchObject({ cantidad: 2, venta: 500 });
  });

  it("la comisión se reparte por lo cobrado, no por el bruto; suma = comisión de la venta", () => {
    const rows = accSaleItems([
      sale(
        [
          item({ name: "Funko", price: 500, quantity: 2, discount_amount: 500 }), // cobra 500
          item({ name: "Llavero", price: 500, quantity: 1 }),                     // cobra 500
        ],
        { commission_amount: 30 },
      ),
    ], { fechaOf, withComision: true });
    expect(rows.find(r => r.name === "Funko")!.comision).toBeCloseTo(15, 6);
    expect(rows.find(r => r.name === "Llavero")!.comision).toBeCloseTo(15, 6);
  });

  it("sin withComision no reparte comisión; costo = costo × cantidad", () => {
    const rows = accSaleItems([
      sale([item({ name: "Cable", price: 200, quantity: 3, cost: 50 })], { commission_amount: 12 }),
    ], { fechaOf });
    expect(rows[0]).toMatchObject({ comision: 0, costo: 150, tieneCosto: true, venta: 600 });
  });
});
