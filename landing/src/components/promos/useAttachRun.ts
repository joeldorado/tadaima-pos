import { useCallback, useState } from "react";
import { attachPromotionProducts } from "@tadaima/api";
import { usePromoCache } from "@/hooks/queries/usePromotions";
import { attachInChunks, mergeAttachOutcomes, type AttachOutcome } from "@/lib/promoAttach";

const EMPTY_OUTCOME: AttachOutcome = {
  attachedIds: [], rejections: [], pendingIds: [], fatalMessage: null, promo: null,
};

export interface AttachProgressState {
  done: number;
  total: number;
}

/**
 * Corre el "agregar productos por lotes" con su avance y su resultado. Lo
 * comparten el asistente de promo nueva y "Agregar productos". Refresca el
 * caché UNA vez al terminar (no por lote).
 */
export function useAttachRun() {
  const { applyFresh, invalidate } = usePromoCache();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<AttachProgressState | null>(null);
  const [outcome, setOutcome] = useState<AttachOutcome | null>(null);

  const run = useCallback(async (
    promoId: number,
    productIds: readonly number[],
    previous: AttachOutcome | null = null,
  ): Promise<AttachOutcome> => {
    setRunning(true);
    setProgress({ done: 0, total: productIds.length });
    try {
      const result = await attachInChunks({
        promoId,
        productIds,
        attach: attachPromotionProducts,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const merged = previous ? mergeAttachOutcomes(previous, result) : result;
      setOutcome(merged);
      if (merged.promo) applyFresh(merged.promo);
      return merged;
    } catch {
      // `attachInChunks` ya atrapa los errores del server; si algo más truena,
      // se reporta como pendiente en vez de dejar el modal sin respuesta.
      const failed: AttachOutcome = {
        ...(previous ?? EMPTY_OUTCOME),
        pendingIds: [...productIds],
        fatalMessage: "No se pudieron agregar los productos. Intenta de nuevo.",
      };
      setOutcome(failed);
      return failed;
    } finally {
      // Pase lo que pase el modal debe poder cerrarse y la lista refrescarse.
      invalidate();
      setRunning(false);
    }
  }, [applyFresh, invalidate]);

  /** Vuelve a mandar SOLO los que quedaron pendientes por un error general. */
  const retryPending = useCallback((promoId: number) => {
    if (!outcome || outcome.pendingIds.length === 0) return;
    void run(promoId, outcome.pendingIds, outcome);
  }, [outcome, run]);

  return { running, progress, outcome, run, retryPending };
}
