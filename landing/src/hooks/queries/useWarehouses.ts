import { useQuery } from '@tanstack/react-query'
import { getWarehouses } from '@tadaima/api'

export function useWarehousesQuery(options?: { active?: boolean }) {
  const params = options?.active !== undefined ? { active: options.active } : undefined
  return useQuery({
    queryKey: ['warehouses', 'list', params ?? {}],
    queryFn: () => getWarehouses(params),
  })
}
