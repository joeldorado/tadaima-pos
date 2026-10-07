import { useQuery } from '@tanstack/react-query'
import { getProductStockByStore, getProductsStock, type ProductsStockParams } from '@tadaima/api'

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
