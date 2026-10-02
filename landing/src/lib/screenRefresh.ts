import { onlineManager, type QueryClient } from "@tanstack/react-query";

/**
 * Botón global "Actualizar" (pedido Joel 2026-10-01): trae otra vez los datos
 * de la pantalla actual sin recargar la página.
 *
 * - Lo que carga con React Query se refresca solo: se vuelven a pedir las
 *   queries montadas y las demás quedan marcadas como viejas (al abrir otra
 *   pantalla también llegan frescas).
 * - Las pantallas que cargan "a mano" (useEffect + setState) registran su
 *   `load` con `useScreenRefresh` para que el botón también las alcance.
 */

export type ScreenRefreshHandler = () => unknown;

export interface ScreenRefreshResult {
  ok: boolean;
  /** Queries que quedaron con error + handlers manuales que tronaron. */
  failed: number;
}

/** Tope para liberar el botón si la red se queda colgada (axios no tiene timeout). */
const REFRESH_TIMEOUT_MS = 25_000;

const handlers = new Set<ScreenRefreshHandler>();
const listeners = new Set<() => void>();
let inFlight: Promise<ScreenRefreshResult> | null = null;

function setInFlight(next: Promise<ScreenRefreshResult> | null): void {
  inFlight = next;
  listeners.forEach(l => l());
}

/** Registra la carga manual de una pantalla. Regresa la función para quitarla. */
export function registerScreenRefresh(fn: ScreenRefreshHandler): () => void {
  handlers.add(fn);
  return () => { handlers.delete(fn); };
}

export function isScreenRefreshing(): boolean {
  return inFlight !== null;
}

/** Para `useSyncExternalStore`: avisa cuando empieza o termina un refresh. */
export function subscribeScreenRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Clics repetidos mientras actualiza regresan el mismo refresh en curso. */
export function refreshScreen(
  queryClient: QueryClient,
  { timeoutMs = REFRESH_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<ScreenRefreshResult> {
  if (inFlight) return inFlight;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ScreenRefreshResult>(resolve => {
    timer = setTimeout(() => resolve({ ok: false, failed: 1 }), timeoutMs);
  });
  const run = Promise.race([runRefresh(queryClient), timeout]).finally(() => {
    clearTimeout(timer);
    setInFlight(null);
  });
  setInFlight(run);
  return run;
}

async function runRefresh(queryClient: QueryClient): Promise<ScreenRefreshResult> {
  // Sin internet React Query pausa las queries y el refetch "termina" sin traer
  // nada: no decir "Datos actualizados" en falso.
  if (!onlineManager.isOnline()) return { ok: false, failed: 1 };
  const startedAt = Date.now();
  await queryClient.invalidateQueries({ refetchType: "none" });
  const results = await Promise.allSettled([
    queryClient.refetchQueries({ type: "active" }),
    ...[...handlers].map(fn => Promise.resolve().then(fn)),
  ]);
  const failedHandlers = results.filter(r => r.status === "rejected").length;
  const failedQueries = queryClient
    .getQueryCache()
    .findAll({ type: "active" })
    .filter(q =>
      q.state.fetchStatus === "paused" ||
      (q.state.status === "error" && q.state.errorUpdatedAt >= startedAt),
    ).length;
  const failed = failedHandlers + failedQueries;
  return { ok: failed === 0, failed };
}

/**
 * Etiqueta "hace X" del botón Actualizar en línea (2026-10-02): las pantallas
 * ya no se recargan solas, así que se dice qué tan fresco está el dato.
 */
export function updatedAgoLabel(updatedAt: number, now: number): string {
  const min = Math.floor(Math.max(0, now - updatedAt) / 60_000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}
