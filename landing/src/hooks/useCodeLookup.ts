import { useEffect, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { lookupProductByCode, type Product } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";
import { isSkuMatch, normalizeCode, shouldLookupCode } from "@/lib/productCode";

/** Espera tras la última tecla antes de consultar (el lector escribe en ráfaga). */
export const CODE_LOOKUP_DEBOUNCE_MS = 400;
const CODE_LOOKUP_STALE_MS = 30_000;

/** Misma llave para el hook y para la verificación al guardar (comparten caché). */
export function codeLookupQueryKey(code: string, excludeId?: number | null) {
  return [...queryKeys.products.all, "lookup", normalizeCode(code), excludeId ?? null] as const;
}

/**
 * Consulta definitiva al guardar: usa la caché si está fresca y si no, pregunta.
 * Códigos que no vale la pena consultar regresan [] sin tocar la red.
 */
export async function fetchCodeLookup(
  queryClient: QueryClient,
  code: string,
  excludeId?: number | null,
): Promise<Product[]> {
  const normalized = normalizeCode(code);
  if (!shouldLookupCode(normalized)) return [];
  return queryClient.fetchQuery({
    queryKey: codeLookupQueryKey(normalized, excludeId),
    queryFn: () => lookupProductByCode(normalized, excludeId ?? undefined),
    staleTime: CODE_LOOKUP_STALE_MS,
  });
}

export interface CodeLookupResult {
  /** Productos/tomos que YA usan el código que HOY está en el campo (SKU primero). */
  duplicates: Product[];
  /** Consultando (o esperando el debounce) el código actual. */
  isChecking: boolean;
  /** El código ya es SKU de otro: el backend rechazaría el alta. */
  skuTaken: boolean;
}

/**
 * ¿El código ya existe? (Joel 2026-09-25; hook desde 2026-11-23 para usarlo
 * también en el alta de tomos). Consulta GET /products/lookup con debounce
 * mientras escriben o escanean. Solo regresa coincidencias del código ACTUAL:
 * un resultado de un código anterior nunca se muestra.
 */
export function useCodeLookup(
  code: string | null | undefined,
  opts: { excludeId?: number | null; enabled?: boolean } = {},
): CodeLookupResult {
  const { excludeId = null, enabled = true } = opts;
  const current = normalizeCode(code);
  const [lookupCode, setLookupCode] = useState(current);
  useEffect(() => {
    const t = window.setTimeout(() => setLookupCode(current), CODE_LOOKUP_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [current]);

  const active = enabled && shouldLookupCode(lookupCode);
  const query = useQuery({
    queryKey: codeLookupQueryKey(lookupCode, excludeId),
    queryFn: () => lookupProductByCode(lookupCode, excludeId ?? undefined),
    enabled: active,
    staleTime: CODE_LOOKUP_STALE_MS,
  });

  const isCurrent = active && lookupCode === current;
  const duplicates = isCurrent ? (query.data ?? []) : [];
  return {
    duplicates,
    isChecking: enabled && shouldLookupCode(current) && (!isCurrent || query.isFetching),
    skuTaken: duplicates.some(d => isSkuMatch(d, current)),
  };
}
