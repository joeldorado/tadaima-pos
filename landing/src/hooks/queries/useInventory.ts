import { useQuery } from '@tanstack/react-query'
import { getInventory } from '@tadaima/api'

/**
 * Inventario de UN producto desglosado por bodega/tienda. Lo usan:
 *  - El modal de detalle de producto/tomo (stock por sucursal).
 *  - La página "Buscar en Tiendas" (existencias cross-sucursal + contacto).
 *
 * Cache corto (30s): el stock cambia con cada venta, así que conviene fresh.
 */
export function useProductInventoryQuery(productId: number | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['inventory', 'by-product', productId ?? null],
    queryFn: () => getInventory({ product_id: productId as number }),
    enabled: enabled && !!productId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    // Ventas/cancelaciones hechas en OTRA máquina no disparan invalidación
    // local — sin polling, el desglose quedaba congelado mientras la página
    // siguiera abierta (QA 2026-06-11: vendió 2 y Existencias seguía en 20).
    // Solo corre mientras el desglose está montado y la pestaña enfocada.
    refetchInterval: 30_000,
  })
}
