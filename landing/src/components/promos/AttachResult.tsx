import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { AttachSummary } from "@/lib/promoAttach";
import type { AttachProgressState } from "./useAttachRun";
import { PromoButton } from "./PromoButton";
import { AMBER, CARD_BORDER, GREEN, GREEN_SOLID, SOFT_BG, TEXT_HI, TEXT_MD, tint } from "./promoTokens";

/** Avance mientras se agregan productos por lotes ("Agregando… 300 de 2,800"). */
export function AttachProgress({ progress }: { progress: AttachProgressState | null }) {
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
  const ratio = total > 0 ? done / total : 0;
  return (
    <div className="py-10 text-center" role="status" aria-live="polite">
      <Loader2 size={30} className="mx-auto animate-spin" style={{ color: GREEN }} aria-hidden />
      <p className="mt-4 text-[18px] font-extrabold" style={{ color: TEXT_HI }}>
        Agregando productos… {done.toLocaleString("es-MX")} de {total.toLocaleString("es-MX")}
      </p>
      <p className="mt-1 text-[14px] font-semibold" style={{ color: TEXT_MD }}>No cierres esta ventana.</p>
      <div className="mx-auto mt-5 h-3 max-w-sm overflow-hidden rounded-full" style={{ background: SOFT_BG }}>
        <div
          className="h-full origin-left rounded-full transition-transform duration-300"
          style={{ background: GREEN_SOLID, transform: `scaleX(${ratio})` }}
        />
      </div>
    </div>
  );
}

interface AttachResultProps {
  summary: AttachSummary;
  retrying?: boolean;
  onRetry?: () => void;
}

/** Resultado en palabras: cuántos entraron y, uno por uno, cuáles no y por qué. */
export function AttachResult({ summary, retrying = false, onRetry }: AttachResultProps) {
  const allGood = summary.rejected.length === 0 && summary.pendingCount === 0;
  return (
    <div className="space-y-4" data-testid="attach-result">
      <div className="flex items-start gap-3 rounded-2xl p-4" style={tint(allGood ? GREEN : AMBER)}>
        {allGood
          ? <CheckCircle2 size={24} className="mt-0.5 shrink-0" aria-hidden />
          : <AlertTriangle size={24} className="mt-0.5 shrink-0" aria-hidden />}
        <p className="text-[17px] font-extrabold leading-snug" style={{ color: TEXT_HI }}>{summary.headline}</p>
      </div>

      {summary.rejected.length > 0 && (
        <div>
          <p className="mb-2 text-[15px] font-bold" style={{ color: TEXT_HI }}>Estos no entraron a la promo:</p>
          <ul className="max-h-64 overflow-y-auto rounded-2xl" style={{ border: CARD_BORDER }}>
            {summary.rejected.map((item, index) => (
              <li key={item.productId} className="px-4 py-3" style={index > 0 ? { borderTop: CARD_BORDER } : undefined}>
                <p className="text-[15px] font-bold" style={{ color: TEXT_HI }}>{item.name}</p>
                <p className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>{item.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.pendingCount > 0 && (
        <div className="rounded-2xl p-4" style={{ border: CARD_BORDER }}>
          <p className="text-[15px] font-bold" style={{ color: TEXT_HI }}>
            Faltaron {summary.pendingCount.toLocaleString("es-MX")} por agregar.
          </p>
          <p className="mt-1 text-[14px] font-semibold" style={{ color: TEXT_MD }}>
            {summary.fatalMessage ?? "Hubo un problema de conexión."}
          </p>
          {onRetry && (
            <PromoButton variant="primary" className="mt-3" onClick={onRetry} loading={retrying}>
              Intentar de nuevo con los que faltan
            </PromoButton>
          )}
        </div>
      )}
    </div>
  );
}
