import { useQuery } from '@tanstack/react-query';
import { getIncomeMovements, type IncomeType } from '@tadaima/api';
import { queryKeys } from '@/lib/queryKeys';

export interface IncomeFilters {
  from?: string;
  to?: string;
  type?: IncomeType;
  store_id?: number;
  user_id?: number;
  dates?: string;
  whole_store?: boolean;
}

export function useIncomeMovementsQuery(filters?: IncomeFilters, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.income.movements(filters || {}),
    queryFn: () => getIncomeMovements(filters),
    staleTime: 1000 * 30, // 30s
    gcTime: 1000 * 60 * 5, // 5m (formerly cacheTime)
    enabled,
  });
}
