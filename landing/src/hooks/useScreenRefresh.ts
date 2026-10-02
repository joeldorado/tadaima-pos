import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  isScreenRefreshing,
  refreshScreen,
  registerScreenRefresh,
  subscribeScreenRefresh,
  type ScreenRefreshHandler,
} from "@/lib/screenRefresh";

/**
 * Para pantallas que cargan SIN React Query: registra su `load` para que el
 * botón global "Actualizar" también la vuelva a correr. Si la carga falla,
 * debe lanzar el error (el botón avisa "No se pudo actualizar").
 */
export function useScreenRefresh(fn: ScreenRefreshHandler, enabled = true): void {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  useEffect(() => {
    if (!enabled) return undefined;
    return registerScreenRefresh(() => fnRef.current());
  }, [enabled]);
}

/** Estado y acción del botón global "Actualizar". */
export function useRefreshScreen() {
  const queryClient = useQueryClient();
  const refreshing = useSyncExternalStore(subscribeScreenRefresh, isScreenRefreshing);
  const refresh = useCallback(() => refreshScreen(queryClient), [queryClient]);
  return { refresh, refreshing };
}
