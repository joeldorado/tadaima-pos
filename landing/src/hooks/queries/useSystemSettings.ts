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
 * Exchange rate USD→MXN.
 *
 * Decisión 2026-05-28 (Joel): SIN refetch en background. Cache 24h, refetch
 * solo cuando:
 *   1. handleOpenCash invalida → fetch fresco al abrir caja del día.
 *   2. SettingsPage admin cambia el TC → invalida → propaga vía BroadcastChannel.
 *   3. Primera carga si no hay cache hidratado.
 *
 * Acota llamados (antes spameaba en cada focus de tab del cajero).
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
    refetchOnReconnect: false,
    enabled: options?.enabled ?? true,
  })
}
