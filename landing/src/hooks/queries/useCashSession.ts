import { useQuery } from '@tanstack/react-query'
import { getActiveSession, getCashRegisters, getCashRegistersWithSession, getActiveSessions } from '@tadaima/api'

/**
 * Sesión activa del usuario (o de la tienda con fallback). Poll moderado
 * para detectar cuando otro turno cierra la caja compartida o admin la
 * cierra desde el panel.
 */
export function useActiveSessionQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['cash', 'activeSession'],
    queryFn: () => getActiveSession(),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useCashRegistersQuery(storeId?: number | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['cash', 'registers', storeId ?? null],
    queryFn: () => getCashRegisters(storeId ?? undefined),
    enabled: options?.enabled ?? true,
  })
}

/**
 * Variante de `useCashRegistersQuery` que trae `active_session` embebida por
 * caja. Usar en el selector de "Abrir caja" para marcar "Ocupada"/"Reanudar".
 * Misma queryKey base que la otra para compartir cache cuando solo se necesita
 * el shape básico.
 */
export function useCashRegistersWithSessionQuery(storeId?: number | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['cash', 'registers-with-session', storeId ?? null],
    queryFn: () => getCashRegistersWithSession(storeId ?? undefined),
    enabled: options?.enabled ?? true,
    // refetch cuando se abre el modal de abrir caja para mostrar estado fresco.
    staleTime: 10_000,
  })
}

/** Sesiones abiertas en una tienda (admin las usa para ver quién está activo). */
export function useActiveSessionsQuery(storeId?: number | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['cash', 'activeSessions', storeId ?? null],
    queryFn: () => getActiveSessions(storeId ?? undefined),
    enabled: options?.enabled ?? true,
    refetchInterval: 30_000, // poll cada 30s para reflejar nuevas aperturas/cierres
  })
}
