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
 * Antes: staleTime 24h + sin focus refetch — el cajero veía el TC viejo si
 * el admin lo cambiaba durante el turno. Ahora:
 *  - staleTime 5min → el query se considera fresco 5min, no spamea
 *  - refetchOnWindowFocus + refetchOnMount: al volver al tab/abrir página
 *    refetcha si está stale (=cambió hace >5min, raro pero garantiza fresh)
 * Cualquier mutación en SettingsPage invalida esta key → propagación instantánea.
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
    staleTime: 5 * 60_000,
    gcTime: ONE_DAY_MS,
    refetchOnWindowFocus: true,
    enabled: options?.enabled ?? true,
  })
}
