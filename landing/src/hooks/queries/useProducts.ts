import { useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getProducts, getProductsLight, type GetProductsParams, type ProductLight, type PaginatedResponse } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

const ONE_DAY_MS = 24 * 60 * 60_000

const TOP_PAGE_SIZE = 200
const BACKGROUND_PAGES = 5 // 200 × 5 = 1000 productos extra en background

/**
 * Catálogo de productos completo. Para admin (ProductsPage) que necesita
 * todos los campos para editar. Cache 24h.
 */
export function useProductsQuery(storeId?: number | null) {
  const params = storeId ? { store_id: storeId } : undefined
  return useQuery({
    queryKey: queryKeys.products.list(params),
    queryFn: () => getProducts(params),
    staleTime: ONE_DAY_MS,
    gcTime: ONE_DAY_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  })
}

/**
 * Top N productos más vendidos (default 200, ordenados por count de ventas
 * de los últimos 30 días) para uso instantáneo en Caja. El cajero abre Caja
 * → ve los productos que más usa sin esperar fetch (vienen del cache de
 * IndexedDB o del prefetch post-login). Para búsquedas más amplias usa
 * useProductsSearchQuery, que va al servidor con debounce.
 */
export function useProductsLightQuery(storeId?: number | null) {
  const params: GetProductsParams = { active: true, sort: 'top', ...(storeId ? { store_id: storeId } : {}) }
  return useQuery({
    queryKey: [...queryKeys.products.all, 'light', 'top', params],
    queryFn: () => getProductsLight({ ...params, per_page: TOP_PAGE_SIZE, page: 1 } as Parameters<typeof getProductsLight>[0]),
    staleTime: ONE_DAY_MS,
    gcTime: ONE_DAY_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  })
}

/**
 * Búsqueda server-side de productos. Devuelve hasta 20 matches del backend
 * usando el scope `search()` de Laravel (busca en name + sku + barcode).
 *
 * Solo se activa cuando hay un search term >= 2 chars. Para cadenas cortas
 * o vacías el componente debería usar el cache local de useProductsLightQuery.
 */
export function useProductsSearchQuery(search: string, options?: { enabled?: boolean }) {
  const trimmed = search.trim()
  const isLong = trimmed.length >= 2
  return useQuery({
    queryKey: [...queryKeys.products.all, 'light', 'search', trimmed],
    queryFn: () => getProductsLight({ search: trimmed, per_page: 20, active: true } as Parameters<typeof getProductsLight>[0]),
    enabled: isLong && (options?.enabled ?? true),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

/**
 * Infinite scroll query — para el modal de catálogo completo. Useful cuando
 * el cajero quiere ver más productos sin escribir búsqueda. Cada página
 * trae 120 productos. fetchNextPage se llama cuando el scroll llega al
 * final.
 */
export function useProductsInfiniteQuery(storeId?: number | null, options?: { enabled?: boolean }) {
  const params: GetProductsParams = { active: true, ...(storeId ? { store_id: storeId } : {}) }
  return useInfiniteQuery<PaginatedResponse<ProductLight>, Error>({
    queryKey: [...queryKeys.products.all, 'light', 'infinite', params],
    queryFn: ({ pageParam = 1 }) =>
      getProductsLight({ ...params, per_page: 120, page: pageParam as number } as Parameters<typeof getProductsLight>[0]),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const next = (lastPage.current_page ?? 1) + 1
      return next <= (lastPage.last_page ?? 1) ? next : undefined
    },
    staleTime: ONE_DAY_MS,
    gcTime: ONE_DAY_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    enabled: options?.enabled ?? true,
  })
}

/**
 * Hook util que dispara prefetch progresivo de páginas 2..N en background.
 * Usar dentro de SellPage después de que useProductsLightQuery termine la
 * primera carga. Cada página se programa con setTimeout escalonado para no
 * saturar el backend ni la UI, y dentro usa requestIdleCallback para
 * arrancar solo cuando el browser está idle.
 */
export function useBackgroundProductsPrefetch(enabled: boolean) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    const timeouts: ReturnType<typeof setTimeout>[] = []
    const idleHandles: number[] = []

    const schedulePage = (page: number, delayMs: number) => {
      const t = setTimeout(() => {
        const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
        const run = () => {
          void queryClient.prefetchQuery({
            queryKey: [...queryKeys.products.all, 'light', 'bg', page],
            queryFn: () => getProductsLight({ active: true, sort: 'top', per_page: TOP_PAGE_SIZE, page } as Parameters<typeof getProductsLight>[0]),
            staleTime: ONE_DAY_MS,
            gcTime: ONE_DAY_MS,
          })
        }
        if (typeof idle === 'function') {
          idleHandles.push(idle(run))
        } else {
          run()
        }
      }, delayMs)
      timeouts.push(t)
    }

    for (let p = 2; p <= BACKGROUND_PAGES + 1; p++) {
      schedulePage(p, (p - 1) * 1500)
    }

    return () => {
      timeouts.forEach(clearTimeout)
      const cancelIdle = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
      if (typeof cancelIdle === 'function') idleHandles.forEach(cancelIdle)
    }
  }, [enabled, queryClient])
}
