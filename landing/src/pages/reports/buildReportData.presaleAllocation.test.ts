import { describe, expect, it } from "vitest";
import type { PreSaleOrder, PreSaleOrderItem } from "@tadaima/api";
import { buildPresaleFolioRows, buildPresaleRows, buildPresaleRowsByMethod } from "./buildReportData";
import { isCashLike } from "./excelTopTables";

// Caso real de Delta Reign (2026-11-01): la tienda aparta a $200 por pieza, y
// el reporte decía que la Booster Box de Macro (10 apartadas) llevaba $3,360.59
// abonados en vez de $2,000, porque repartía el anticipo del folio según el
// precio de cada línea. Folios de Macro con Booster Box, tal como están en prod
// (sin datos del cliente).
const CATALOGS = {
  3: { name: "Preventa ETB Delta Reign", price: 1100, cost: 657 },
  4: { name: "Preventa Booster Bundle Delta", price: 550, cost: 355 },
  5: { name: "Preventa Booster Box Delta", price: 2800, cost: 2151 },
} as const;
type CatalogId = keyof typeof CATALOGS;

/** [folio, created_at, [[catálogo, piezas]…], anticipo en efectivo] */
const FOLIOS: [number, string, [CatalogId, number][], number][] = [
  [40, "2026-10-30T00:13:10Z", [[5, 1], [4, 1], [3, 1]], 600],
  [41, "2026-10-30T00:16:24Z", [[5, 1], [4, 1], [3, 1]], 600],
  [51, "2026-10-30T01:59:09Z", [[5, 1]], 200],
  [54, "2026-10-30T02:42:06Z", [[5, 1], [4, 2], [3, 1]], 800],
  [72, "2026-10-30T21:41:41Z", [[5, 1]], 200],
  [75, "2026-10-30T22:15:12Z", [[3, 1], [5, 1]], 400],
  [83, "2026-10-30T23:38:02Z", [[5, 1], [4, 2], [3, 1]], 800],
  [84, "2026-10-30T23:48:27Z", [[5, 1], [4, 2], [3, 1]], 800],
  [86, "2026-10-31T00:54:07Z", [[3, 1], [5, 1]], 400],
  [87, "2026-10-31T01:40:52Z", [[5, 1], [3, 1]], 400],
];

let nextItemId = 1;
const item = (catalogId: CatalogId, quantity: number, created_at: string): PreSaleOrderItem => ({
  id: nextItemId++, pre_sale_catalog_id: catalogId, product_id: null, quantity, price_level: 2,
  unit_price: CATALOGS[catalogId].price, subtotal: CATALOGS[catalogId].price * quantity, cost: CATALOGS[catalogId].cost,
  status: "pending", delivered_at: null, created_at,
  catalog: { id: catalogId, product_name: CATALOGS[catalogId].name, image_path: null, status: null, pickup_deadline: null },
});

const ORDERS: PreSaleOrder[] = FOLIOS.map(([id, created_at, lines, paid]) => {
  const items = lines.map(([cat, qty]) => item(cat, qty, created_at));
  const total = items.reduce((a, i) => a + i.subtotal, 0);
  return {
    id, code: `PREV-${String(id).padStart(5, "0")}`, status: "pending",
    linked_sale_id: null, pickup_deadline: null, notes: null, created_at, updated_at: created_at,
    store: { id: 3, name: "Tadaima MACRO" }, user: null, customer: null,
    items,
    payments: [{ id, amount: paid, notes: "Anticipo inicial", created_at, payment_method: { id: 1, name: "Efectivo" }, cashier: null }],
    total, paid_amount: paid, balance: total - paid,
  };
});

const OCTUBRE = ["2026-10-01", "2026-10-31"] as const;
const byName = <R extends { name: string }>(rows: R[], name: string): R | undefined => rows.find((r) => r.name.startsWith(name));

describe("Preventas — abono repartido parejo por pieza (caso Delta Reign)", () => {
  it("la Booster Box de Macro lleva $2,000 abonados (10 piezas × $200), no $3,360.59", () => {
    const rows = buildPresaleRows(ORDERS, ...OCTUBRE);
    const box = byName(rows, CATALOGS[5].name)!;

    expect(box.qty).toBe(10);
    expect(box.apartado).toBeCloseTo(2000);
    expect(box.deuda).toBeCloseTo(10 * 2800 - 2000);
    expect(box.pactado).toBeCloseTo(10 * 2800);
  });

  it("el ETB y el Bundle reciben lo suyo y el total abonado sigue siendo lo cobrado", () => {
    const rows = buildPresaleRows(ORDERS, ...OCTUBRE);
    const etb = byName(rows, CATALOGS[3].name)!;
    const bundle = byName(rows, CATALOGS[4].name)!;

    expect(etb.qty).toBe(8);
    expect(etb.apartado).toBeCloseTo(1600);
    expect(bundle.qty).toBe(8);
    expect(bundle.apartado).toBeCloseTo(1600);

    const cobrado = FOLIOS.reduce((a, f) => a + f[3], 0);
    expect(rows.reduce((a, r) => a + r.apartado, 0)).toBeCloseTo(cobrado); // 5,200
    expect(rows.reduce((a, r) => a + r.deuda, 0)).toBeCloseTo(ORDERS.reduce((a, o) => a + (o.balance ?? 0), 0));
  });

  it("apartadas: costo = abono y utilidad $0 por producto (modelo del dueño)", () => {
    for (const row of buildPresaleRows(ORDERS, ...OCTUBRE)) {
      expect(row.entregado).toBe(false);
      expect(row.costoNeto).toBeCloseTo(row.apartado);
      expect(row.utilidad).toBeCloseTo(0);
    }
  });

  it("la pestaña Efectivo da lo mismo que la tabla general (todo fue en efectivo)", () => {
    const general = buildPresaleRows(ORDERS, ...OCTUBRE);
    const efectivo = buildPresaleRowsByMethod(ORDERS, ...OCTUBRE, isCashLike);

    for (const row of general) {
      expect(byName(efectivo, row.name)!.apartado).toBeCloseTo(row.apartado);
    }
  });

  it("detalle por folio: PREV-00040 muestra $200 de anticipo en cada una de sus 3 piezas", () => {
    const rows = buildPresaleFolioRows(ORDERS, ...OCTUBRE).filter((r) => r.folio === "PREV-00040");

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.anticipo).toBeCloseTo(200);
      expect(row.pendiente).toBeCloseTo(row.total - 200);
    }
  });

  it("detalle por folio: PREV-00054 reparte $400 a la línea de 2 Bundles y $200 a las demás", () => {
    const rows = buildPresaleFolioRows(ORDERS, ...OCTUBRE).filter((r) => r.folio === "PREV-00054");
    const bundle = byName(rows.map((r) => ({ ...r, name: r.productName })), CATALOGS[4].name)!;

    expect(bundle.anticipo).toBeCloseTo(400);
    expect(rows.filter((r) => r.productName !== CATALOGS[4].name).every((r) => Math.abs(r.anticipo - 200) < 1e-6)).toBe(true);
  });
});
