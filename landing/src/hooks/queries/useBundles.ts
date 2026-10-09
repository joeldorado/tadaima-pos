import { useCallback, useMemo } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getBundle, getBundles, getProductsLight, previewBundle,
  type Bundle, type BundleComponentInput, type BundleDetail, type BundlesPage, type ProductLight,
} from '@tadaima/api'
import { useAuth } from '@tadaima/auth'
import { queryKeys } from '@/lib/queryKeys'
import { isAdmin as isAdminRole } from '@/lib/permisos'
import { componentsSignature } from '@/lib/bundleDraft'

/** La lista de Paquetes carga todo de un golpe (son decenas, no miles). */
const BUNDLES_PER_PAGE = 200
const LIST_STALE_MS = 30_000
const DETAIL_STALE_MS = 15_000
const PREVIEW_STALE_MS = 15_000
const PREVIEW_GC_MS = 60_000

/** Quién mira la pantalla de Paquetes: el admin ve todas las tiendas; gerente/cajero la suya. */
export interface BundleViewer {
  isAdmin: boolean
  storeId: number | null
  storeName: string | null
}

export function useBundleViewer(): BundleViewer {
  const { user } = useAuth()
  const isAdmin = isAdminRole(user?.roles)
  const storeId = user?.store_id ?? null
  const storeName = user?.store?.name ?? null
  return useMemo(() => ({ isAdmin, storeId, storeName }), [isAdmin, storeId, storeName])
}

/**
 * Lista de paquetes con disponibilidad. `storeId` null = vista global (admin
 * sin tienda elegida). Sin refetch al volver a la ventana: las pantallas de
 * datos recargan con el botón "Actualizar" (regla 2026-10-02).
 */
export function useBundlesQuery(params: { storeId: number | null }, options?: { enabled?: boolean }) {
  const { storeId } = params
  return useQuery({
    queryKey: queryKeys.bundles.list({ store_id: storeId ?? null }),
    queryFn: () => getBundles(storeId != null
      ? { store_id: storeId, per_page: BUNDLES_PER_PAGE }
      : { per_page: BUNDLES_PER_PAGE }),
    enabled: options?.enabled ?? true,
    staleTime: LIST_STALE_MS,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  })
}

/** Detalle + historial de armados. Apagado mientras no haya paquete elegido. */
export function useBundleQuery(id: number | null, storeId?: number | null) {
  return useQuery({
    queryKey: queryKeys.bundles.detail(id ?? 0, storeId ?? null),
    queryFn: () => getBundle(id as number, storeId ?? null),
    enabled: id != null,
    staleTime: DETAIL_STALE_MS,
  })
}

/**
 * Vista previa del asistente: cuántos se podrían armar por tienda con esa
 * lista. La key es la firma de componentes + tienda, así cambiar una cantidad
 * pide de nuevo y volver atrás reutiliza lo cacheado.
 */
export function useBundlePreviewQuery(
  lines: readonly BundleComponentInput[],
  storeId: number | null,
  options?: { enabled?: boolean },
) {
  const signature = `${componentsSignature(lines)}|${storeId ?? 'all'}`
  const hasValidLines = lines.length > 0 && lines.every(line => line.quantity > 0)
  return useQuery({
    queryKey: queryKeys.bundles.preview(signature),
    queryFn: () => previewBundle([...lines], storeId),
    enabled: hasValidLines && (options?.enabled ?? true),
    staleTime: PREVIEW_STALE_MS,
    gcTime: PREVIEW_GC_MS,
    placeholderData: keepPreviousData,
  })
}

/**
 * Refresco tras mutar paquetes. Armar/desarmar mueve piezas de Exhibición y
 * Bodega, así que también se invalidan productos, inventario y tomos — Caja y
 * Productos leen el stock de ahí. Llamar UNA vez por operación.
 */
export function useBundleCache() {
  const queryClient = useQueryClient()

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bundles.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.mangas.all })
  }, [queryClient])

  /** Pinta de inmediato el paquete que devolvió el server (lista y detalle), sin esperar el refetch. */
  const applyFresh = useCallback((fresh: Bundle) => {
    queryClient.setQueriesData<BundlesPage>(
      { queryKey: [...queryKeys.bundles.all, 'list'] },
      old => (old
        ? { ...old, data: old.data.map(bundle => (bundle.id === fresh.id ? { ...bundle, ...fresh } : bundle)) }
        : old),
    )
    queryClient.setQueriesData<BundleDetail>(
      { queryKey: [...queryKeys.bundles.all, 'detail', fresh.id] },
      old => (old ? { ...old, ...fresh, assemblies: old.assemblies } : old),
    )
  }, [queryClient])

  return { invalidate, applyFresh }
}

const POOL_STALE_MS = 30_000

/**
 * Pool de productos para la tabla del asistente (paso 1). Con tienda trae el
 * stock de esa tienda (Exhibición/Bodega) y, por default, solo lo que SÍ tiene
 * stock (~1.4k filas); con `inStockOnly: false` baja el catálogo completo.
 * Cuelga de `products.all` para que las invalidaciones de productos lo refresquen.
 */
export function useBundlePickerPoolQuery(storeId: number | null, options: { inStockOnly: boolean; enabled?: boolean }) {
  const { inStockOnly } = options
  return useQuery({
    queryKey: [...queryKeys.products.all, 'light', 'bundle-pool', storeId ?? 'all', inStockOnly],
    queryFn: async (): Promise<ProductLight[]> => {
      const page = await getProductsLight({
        active: true,
        ...(inStockOnly ? { in_stock: true } : {}),
        ...(storeId != null ? { store_id: storeId, include_unassigned: true } : {}),
      })
      return page.data
    },
    enabled: options.enabled ?? true,
    staleTime: POOL_STALE_MS,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  })
}

