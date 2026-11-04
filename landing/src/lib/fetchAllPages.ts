import {
  getProductsStock,
  getSales,
  type GetSalesParams,
  type PaginatedResponse,
  type ProductStockItem,
  type ProductsStockParams,
  type SaleDetail,
} from "@tadaima/api";

/** Tope de páginas a recorrer: 50 × 100 = 5,000 registros por consulta. */
export const MAX_PAGES = 50;

/** Máximo que acepta GET /sales por página. */
export const SALES_PAGE_SIZE = 100;

/**
 * Máximo que acepta GET /inventory/products-stock por página. Páginas grandes
 * para no gastar el límite de 120 peticiones por minuto con ~14k productos.
 */
export const PRODUCTS_STOCK_PAGE_SIZE = 1000;

/**
 * Una página del API. Hay dos formatos: `last_page` plano (p.ej. productos con
 * with_meta) o anidado en `pagination` (GET /sales) — el tipo PaginatedResponse
 * solo describe el plano.
 */
type PageLike<T> = { data: T[]; last_page?: number; pagination?: { last_page?: number } };

/**
 * Recorre TODAS las páginas de un endpoint paginado y las junta en una sola
 * respuesta de una página (misma forma que la original, para no romper a quien
 * parchea esos cachés). GET /sales topa en 100 por página: los reportes que
 * pedían solo la primera se cortaban sin avisar al pasar de 100 ventas.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<PageLike<T>>,
  maxPages: number = MAX_PAGES,
): Promise<PaginatedResponse<T>> {
  let data: T[] = [];
  let lastPage = 1;
  for (let page = 1; page <= Math.min(lastPage, maxPages); page++) {
    const res = await fetchPage(page);
    data = [...data, ...res.data];
    lastPage = res.last_page ?? res.pagination?.last_page ?? page;
  }
  return { data, current_page: 1, last_page: 1, per_page: data.length, total: data.length };
}

/** Todas las ventas que cumplen el filtro (todas las páginas de /sales). */
export function fetchAllSales(params: GetSalesParams): Promise<PaginatedResponse<SaleDetail>> {
  return fetchAllPages(page => getSales({ ...params, per_page: SALES_PAGE_SIZE, page }));
}

/**
 * Todos los productos con existencias que cumplen el filtro (Excel de Existencias
 * por Tienda). Con orden por stock, una venta durante la descarga puede mover un
 * producto de página: se quitan repetidos y `total` conserva lo que dijo el API,
 * para que quien llama detecte si `data` no cuadra.
 */
export async function fetchAllProductsStock(params: ProductsStockParams): Promise<PaginatedResponse<ProductStockItem>> {
  let apiTotal: number | undefined;
  const res = await fetchAllPages(async page => {
    const pageRes = await getProductsStock({ ...params, per_page: PRODUCTS_STOCK_PAGE_SIZE, page });
    apiTotal ??= pageRes.pagination.total;
    return pageRes;
  });
  const data = [...new Map(res.data.map(item => [item.id, item])).values()];
  return { ...res, data, per_page: data.length, total: apiTotal ?? data.length };
}
