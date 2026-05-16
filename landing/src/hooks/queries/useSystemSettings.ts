import { useQuery } from '@tanstack/react-query'
import { getSystemSettings } from '@tadaima/api'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Whole settings map. Use for SettingsPage editor and rare general reads.
 * staleTime longer because settings change rarely.
 */
export function useSystemSettingsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.systemSettings.map(),
    queryFn: getSystemSettings,
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  })
}

const ONE_DAY_MS = 24 * 60 * 60_000

/**
 * Exchange rate USD→MXN. Fetched once per cashier session: admin sets the rate
 * at night, cashier opens caja in the morning and the value is fetched fresh.
 * No background polling, no refetch-on-focus — to minimize API calls. When the
 * cashier opens a new cash session the parent invalidates this query so the
 * morning fetch is guaranteed. Stale time is 24h as an upper bound.
 */
export function useExchangeRateQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.systemSettings.exchangeRate(),
    queryFn: async (): Promise<number | null> => {
      const map = await getSystemSettings()
      const raw = map['exchange_rate']
      if (raw == null) return null
      const n = Number.parseFloat(raw)
      return Number.isFinite(n) && n > 0 ? n : null
    },
    staleTime: ONE_DAY_MS,
    gcTime: ONE_DAY_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    enabled: options?.enabled ?? true,
  })
}
