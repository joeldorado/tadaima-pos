import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getActivity, getActivitySummary } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";
import { buildActivityParams, buildActivitySummaryParams, type ActivityFilterState } from "@/lib/activityParams";

const STALE_MS = 60_000;

/**
 * Feed de Actividad (Administración → Actividad), paginado en el servidor.
 * `keepPreviousData`: al cambiar de página o filtro la tabla conserva lo
 * anterior mientras llega lo nuevo. Sin polling ni refetch al enfocar (Joel
 * 2026-10-02): carga al entrar y con «Actualizar», que invalida las activas.
 */
export function useActivityQuery(state: ActivityFilterState, options?: { enabled?: boolean }) {
  const params = buildActivityParams(state);
  return useQuery({
    queryKey: queryKeys.activity.list(params as Record<string, unknown>),
    queryFn: () => getActivity(params),
    enabled: options?.enabled ?? true,
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

/** Resumen (KPIs, por usuario, por día, productos más tocados) con los mismos filtros. */
export function useActivitySummaryQuery(state: ActivityFilterState, options?: { enabled?: boolean }) {
  const params = buildActivitySummaryParams(state);
  return useQuery({
    queryKey: queryKeys.activity.summary(params as Record<string, unknown>),
    queryFn: () => getActivitySummary(params),
    enabled: options?.enabled ?? true,
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
