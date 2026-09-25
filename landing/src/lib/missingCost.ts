import type { GetProductsParams, MissingCostStockFilter } from "@tadaima/api";

/**
 * Params del modal "Productos sin Costo" (Joel 2026-09-25): chips de stock,
 * más piezas primero y tienda. Puro para poder probarlo sin montar el modal.
 */
export const MISSING_COST_PAGE_SIZE = 50;

export interface MissingCostQuery {
  storeId: number | null;
  stockFilter: MissingCostStockFilter;
  term: string;
  page: number;
}

export function buildMissingCostParams({ storeId, stockFilter, term, page }: MissingCostQuery): GetProductsParams {
  return {
    no_cost: true,
    type: "product",
    with_meta: true,
    per_page: MISSING_COST_PAGE_SIZE,
    page,
    sort: "stock_desc",
    // con_stock es el default del backend: no se manda (URL igual que antes).
    ...(stockFilter !== "con_stock" ? { no_cost_stock: stockFilter } : {}),
    ...(term ? { search: term } : {}),
    ...(storeId ? { store_id: storeId, include_unassigned: true } : {}),
  };
}

export const MISSING_COST_CHIPS: { key: MissingCostStockFilter; label: string; color: string; hint: string }[] = [
  { key: "con_stock", label: "Con stock", color: "#EF4444", hint: "Con piezas en exhibición o bodega" },
  { key: "exhibicion", label: "En exhibición", color: "#10b981", hint: "Con piezas en exhibición (vendible en Caja)" },
  { key: "bodega", label: "En bodega", color: "#F59E0B", hint: "Con piezas en bodega" },
  { key: "todos", label: "Incluir agotados", color: "#94A3B8", hint: "Todos los sin costo, aunque tengan stock 0" },
];
