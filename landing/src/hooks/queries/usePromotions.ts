import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPromotions, type Promotion } from '@tadaima/api'
import { useAuth } from '@tadaima/auth'
import { queryKeys } from '@/lib/queryKeys'
import { isAdmin as isAdminRole, isManager as isManagerRole } from '@/lib/permisos'
import type { PromoViewer } from '@/lib/promoList'

/** Todas las promos con sus productos. Listar es libre para cualquier rol. */
export function usePromotionsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.promotions.admin(),
    queryFn: getPromotions,
    enabled: options?.enabled ?? true,
  })
}

/**
 * Quién está viendo la pantalla de Promos. `canManage` = admin, o gerente con
 * el permiso "Gestionar Promociones" (default TRUE: `!== false`, undefined
 * cuenta como permitido). El server valida lo mismo en cada mutación.
 */
export function usePromoViewer(): PromoViewer {
  const { user } = useAuth()
  const isAdmin = isAdminRole(user?.roles)
  const isManager = isManagerRole(user?.roles)
  const canManage = isAdmin || (isManager && user?.can_manage_promos !== false)
  const storeId = user?.store_id ?? null
  return useMemo(() => ({ isAdmin, canManage, storeId }), [isAdmin, canManage, storeId])
}

/**
 * Refresco tras mutar promos. Las promos vigentes viajan embebidas en los
 * productos (`active_promotions`), así que también se invalida ese namespace
 * para que Caja se entere. Llamar UNA vez por operación, no por lote.
 */
export function usePromoCache() {
  const queryClient = useQueryClient()

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.promotions.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
  }, [queryClient])

  /** Pinta de inmediato la versión que devolvió el server (sin esperar el refetch). */
  const applyFresh = useCallback((fresh: Promotion) => {
    queryClient.setQueryData<Promotion[]>(queryKeys.promotions.admin(), current =>
      current?.map(promo => (promo.id === fresh.id ? { ...promo, ...fresh } : promo)))
  }, [queryClient])

  return { invalidate, applyFresh }
}
