import { useState } from "react";
import type { ProductPromotionInput, Promotion } from "@tadaima/api";
import { usePromoViewer } from "@/hooks/queries/usePromotions";
import {
  draftFromPromo, draftToInput, emptyDraft, validateDetails, validateWhat, type PromoDraft,
} from "@/lib/promoDraft";
import { PromoButton } from "./PromoButton";
import { PromoDialog } from "./PromoDialog";
import { PromoWhatFields } from "./PromoWhatFields";
import { PromoWhenFields } from "./PromoWhenFields";
import { RED_SOFT, TEXT_HI } from "./promoTokens";

interface PromoEditDialogProps {
  title: string;
  subtitle?: string;
  /** Promo con la que prellenar (editar o clonar). Omitido = en blanco. */
  initial?: Promotion;
  saving?: boolean;
  submitLabel?: string;
  onSubmit: (input: ProductPromotionInput) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Editar una promo (o clonarla como local desde el editor de producto): los
 * mismos campos del asistente en una sola pantalla. Entrega el body COMPLETO
 * en `onSubmit`; quien lo usa decide si crea o actualiza.
 */
export function PromoEditDialog({
  title, subtitle, initial, saving = false, submitLabel = "Guardar cambios", onSubmit, onCancel,
}: PromoEditDialogProps) {
  const viewer = usePromoViewer();
  const [draft, setDraft] = useState<PromoDraft>(() => (initial ? draftFromPromo(initial) : emptyDraft()));
  const [error, setError] = useState<string | null>(null);

  const patch = (changes: Partial<PromoDraft>) => {
    setDraft(current => ({ ...current, ...changes }));
    setError(null);
  };

  const submit = () => {
    const problem = validateWhat(draft) ?? validateDetails(draft);
    if (problem) { setError(problem); return; }
    void onSubmit(draftToInput(draft, viewer));
  };

  return (
    <PromoDialog
      title={title}
      {...(subtitle ? { subtitle } : {})}
      size="lg"
      busy={saving}
      onClose={onCancel}
      testId="promo-form-modal"
      footer={(
        <>
          <PromoButton onClick={onCancel} disabled={saving}>Cancelar</PromoButton>
          <PromoButton variant="primary" onClick={submit} loading={saving} data-testid="promo-form-submit">
            {saving ? "Guardando…" : submitLabel}
          </PromoButton>
        </>
      )}
    >
      <div className="space-y-6">
        <section>
          <h3 className="mb-3 text-[17px] font-extrabold" style={{ color: TEXT_HI }}>¿Qué promo es?</h3>
          <PromoWhatFields draft={draft} onChange={patch} />
        </section>
        <section>
          <h3 className="mb-3 text-[17px] font-extrabold" style={{ color: TEXT_HI }}>Nombre y fechas</h3>
          <PromoWhenFields draft={draft} onChange={patch} viewer={viewer} />
        </section>
        {error && (
          <p role="alert" className="rounded-xl px-4 py-3 text-[15px] font-bold" style={{ background: "rgba(224,34,26,0.12)", color: RED_SOFT }}>
            {error}
          </p>
        )}
      </div>
    </PromoDialog>
  );
}
