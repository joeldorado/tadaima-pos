import { useQuery } from '@tanstack/react-query'
import {
  getProductStockByStore,
  getProductStockHistory,
  getProductsStock,
  type ProductsStockParams,
  type StockHistoryMovement,
  type WarehouseCurrentStock,
} from '@tadaima/api'

/**
 * Existencias cross-tienda de UN producto. Usado por StoreStockBreakdown
 * cuando el usuario selecciona un producto en la pantalla "Existencias por Tienda".
 * Sin filtro de tienda, sin costos. Cache 30s.
 */
export function useProductInventoryQuery(productId: number | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['inventory', 'by-product', productId ?? null],
    queryFn: () => getProductStockByStore(productId as number),
    enabled: enabled && !!productId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

/**
 * Lista paginada de productos con sus existencias por tienda embebidas.
 * Alimenta la vista de lista de la pantalla "Existencias por Tienda".
 * Sin filtro de tienda, sin costos. Cache 60s.
 */
export function useProductsStockQuery(params: ProductsStockParams) {
  return useQuery({
    queryKey: ['inventory', 'products-stock', params],
    queryFn: () => getProductsStock(params),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  })
}

/** Renglones por página del Historial (tope del servidor: 500). */
const HISTORY_PAGE_SIZE = 500
/** Máximo de páginas: 10 × 500 = 5,000 movimientos por consulta. */
const HISTORY_MAX_PAGES = 10

export interface StockHistoryParams {
  productId: number
  /** YYYY-MM-DD (día de negocio). Se piden TODOS los movimientos desde aquí hasta hoy. */
  from: string
  storeId?: number
  warehouseId?: number
}

export interface StockHistoryData {
  movements: StockHistoryMovement[]
  currentStock: WarehouseCurrentStock[]
  /** Hubo más movimientos de los que se bajaron (los más viejos quedaron fuera). */
  truncated: boolean
}

/**
 * Historial de stock de un producto (modal «Historial»). Pide desde `from`
 * hasta HOY a propósito, aunque la pantalla filtre un «hasta»: el saldo se
 * reconstruye hacia atrás desde el stock actual y necesita los movimientos más
 * nuevos. Las páginas llegan del más nuevo al más viejo, así que si se corta,
 * lo que falta son los más viejos y el saldo de lo cargado sigue bien.
 * Sin polling (regla de pantallas de datos): carga al abrir y con «Actualizar».
 */
export function useStockHistoryQuery(params: StockHistoryParams | null) {
  return useQuery({
    queryKey: ['inventory', 'stock-history', params],
    queryFn: async (): Promise<StockHistoryData> => {
      const p = params as StockHistoryParams
      let movements: StockHistoryMovement[] = []
      let currentStock: WarehouseCurrentStock[] = []
      let lastPage = 1
      let page = 1
      for (; page <= Math.min(lastPage, HISTORY_MAX_PAGES); page++) {
        const res = await getProductStockHistory(p.productId, {
          from: p.from,
          per_page: HISTORY_PAGE_SIZE,
          page,
          ...(p.storeId !== undefined ? { store_id: p.storeId } : {}),
          ...(p.warehouseId !== undefined ? { warehouse_id: p.warehouseId } : {}),
        })
        if (page === 1) currentStock = res.current_stock ?? []
        // Una venta durante la descarga recorre las páginas: sin repetidos.
        const seen = new Set(movements.map(m => m.id))
        movements = [...movements, ...res.data.filter(m => !seen.has(m.id))]
        lastPage = res.pagination.last_page
      }
      return { movements, currentStock, truncated: lastPage > HISTORY_MAX_PAGES }
    },
    enabled: params !== null,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}
