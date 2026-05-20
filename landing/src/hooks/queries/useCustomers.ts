import { useQuery } from '@tanstack/react-query'
import { getCustomers } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

export function useCustomersQuery(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.customers.list(params),
    queryFn: () => getCustomers(params),
  })
}

/**
 * Trae los primeros N clientes locales y los mantiene en cache durante 1h.
 * Pensado como "tabla precargada" para búsqueda client-side instantánea en los
 * popups y modales de Caja. Si una tienda supera el límite, los matches que
 * estén fuera de los primeros N se buscarán en Supabase (la red de socios) —
 * comportamiento aceptable porque ahí están los clientes históricos reales.
 *
 * Invalidar con `queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })`
 * después de crear/editar un cliente para que aparezca en el próximo render.
 */
export function useCustomersAllQuery(maxPerPage = 500) {
  return useQuery({
    queryKey: [...queryKeys.customers.all, 'all', maxPerPage] as const,
    queryFn: async () => {
      const res = await getCustomers({ per_page: maxPerPage }) as { data?: unknown[] } | unknown[]
      const items = Array.isArray(res) ? res : (res?.data ?? [])
      return items as Array<{
        id: number | string
        name: string
        phone?: string | null
        email?: string | null
        external_member_id?: string | null
        points?: number
      }>
    },
    staleTime: 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
    // refetchOnMount default (true): después de crear/editar un cliente e
    // invalidar el cache, al volver a Caja se hace refetch automático y el
    // cliente nuevo aparece sin recargar.
  })
}
