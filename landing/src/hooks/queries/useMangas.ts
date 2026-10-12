import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getMangasPage, type GetMangasParams } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'
import type { ProductsCatalogFilter } from './useProducts'

const ONE_DAY_MS = 24 * 60 * 60_000
// 5min: un tomo creado por el gerente en OTRA máquina no aparecía para el
// cajero hasta 24h o refresh manual — cross-máquina no hay invalidación
// (QA 2026-06-11). El render sigue instantáneo (gcTime 24h + IndexedDB).
const CATALOG_STALE_MS = 5 * 60_000

/** Búsquedas de 2+ caracteres viajan al server; menos = la página sin buscar. */
const SERVER_SEARCH_MIN_CHARS = 2

/**
 * El término que REALMENTE viaja al servidor: '' si aún no llega al mínimo.
 * La pantalla lo usa para saber si hay una búsqueda activa (mensaje de vacío,
 * regreso a la página 1) sin duplicar la regla de los 2 caracteres.
 */
export function effectiveMangaSearch(term: string | undefined): string {
  const search = term?.trim() ?? ''
  return search.length >= SERVER_SEARCH_MIN_CHARS ? search : ''
}
/** Tamaño de página inicial del tab Tomos (igual que el tab Productos). */
export const MANGAS_DEFAULT_PAGE_SIZE = 20

export interface MangasListParamsInput {
  storeId?: number | null | undefined
  search?: string | undefined
  /** Chip activo de la página Productos. `promos` y `top` no existen en Tomos. */
  filter?: ProductsCatalogFilter | undefined
  threshold?: number | undefined
  page?: number | undefined
  perPage?: number | undefined
}

/**
 * ÚNICA fuente de los params (y del queryKey) de la lista de tomos. Pura y
 * exportada para fijarla con vitest.
 *
 * Todo viaja al servidor (2026-10-12): tienda + búsqueda + chip + página.
 * Antes solo iba la búsqueda; el resto se resolvía en el navegador sobre la
 * primera página (50 de ~2.8k) y la tienda veía "50 tomos" con el badge de
 * Agotados en 2,206.
 */
export function buildMangasListParams(
  input: MangasListParamsInput,
): GetMangasParams & Record<string, unknown> {
  const search = effectiveMangaSearch(input.search)
  const storeId = input.storeId

  return {
    // include_unassigned: trae también tomos sin inventario en la tienda
    // ("No asignado") para que la sucursal les agregue stock.
    ...(storeId ? { store_id: storeId, include_unassigned: true } : {}),
    ...(search ? { search } : {}),
    ...(input.filter === 'low_stock'
      ? { low_stock: true, ...(input.threshold ? { threshold: input.threshold } : {}) }
      : {}),
    ...(input.filter === 'out_of_stock' ? { out_of_stock: true } : {}),
    ...(input.filter === 'no_category' ? { no_category: true } : {}),
    page: input.page ?? 1,
    per_page: input.perPage ?? MANGAS_DEFAULT_PAGE_SIZE,
  }
}

/**
 * Catálogo de tomos/librería, paginado en el servidor. Devuelve
 * `{ data, total, last_page, … }` — mismo patrón que useProductsQuery en modo
 * admin (`withMeta`):
 *  - Fresh 5min, persistido 24h en IndexedDB → render instantáneo al navegar.
 *  - `keepPreviousData` → al cambiar de página/chip/tienda la tabla conserva
 *    lo anterior mientras llega lo nuevo (no parpadea a "Cargando").
 *  - `refetchOnMount: true` (default) → si una mutación invalidó el cache
 *    (alta/edición/borrado de tomo) al volver a esta vista refetch en bg.
 *
 * La key cuelga de la raíz ['mangas']: las invalidaciones de ProductsPage
 * (`invalidateMangas`), Caja, paquetes y stock rápido la alcanzan igual, y
 * decrementProductStockInCaches recorre `data` para el stock optimista.
 */
export function useMangasQuery(
  storeId?: number | null,
  options?: {
    enabled?: boolean
    refetchIntervalMs?: number | false
    search?: string
    filter?: ProductsCatalogFilter
    threshold?: number
    page?: number
    perPage?: number
  }
) {
  const params = buildMangasListParams({
    storeId,
    search: options?.search,
    filter: options?.filter,
    threshold: options?.threshold,
    page: options?.page,
    perPage: options?.perPage,
  })
  return useQuery({
    queryKey: queryKeys.mangas.page(params),
    queryFn: () => getMangasPage(params),
    enabled: options?.enabled ?? true,
    staleTime: CATALOG_STALE_MS,
    gcTime: ONE_DAY_MS,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false, // Sin auto-recarga (Joel 2026-10-02): carga al entrar y con «Actualizar».
    refetchOnReconnect: false,
    // Polling casi-live opcional (Joel 2026-06-12) — solo montada + tab enfocada.
    refetchInterval: options?.refetchIntervalMs || false,
  })
}
