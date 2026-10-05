import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { createPromotion, type ProductLight } from "@tadaima/api";
import type { PickableCategory } from "@/lib/categoryPicker";
import { getTodayLocal } from "@/lib/date";
import { usePromoCache, usePromoViewer } from "@/hooks/queries/usePromotions";
import { summarizeAttachOutcome } from "@/lib/promoAttach";
import {
  draftLabel, draftNamePrefix, draftToInput, emptyDraft, validateDetails, validateWhat, type PromoDraft,
} from "@/lib/promoDraft";
import { formatVigenciaYmd, promoScopeLabel, promoSummarySentence, suggestPromoName } from "@/lib/promoPlain";
import { buildCategoryBuckets, selectionSummary } from "@/lib/promoProductPicker";
import { AttachProgress, AttachResult } from "./AttachResult";
import { ProductPicker } from "./ProductPicker";
import { PromoButton } from "./PromoButton";
import { PromoDialog } from "./PromoDialog";
import { PromoWhatFields } from "./PromoWhatFields";
import { PromoWhenFields } from "./PromoWhenFields";
import { useAttachRun } from "./useAttachRun";
import { AMBER, CARD_BORDER, GREEN, GREEN_SOLID, RED_SOFT, SOFT_BG, TEXT_HI, TEXT_MD, tint } from "./promoTokens";

type Step = 1 | 2 | 3;
type Phase = "form" | "saving" | "result";

interface PromoWizardProps {
  /** Productos activos que se pueden elegir. */
  products: readonly ProductLight[];
  categories: readonly PickableCategory[];
  loadingProducts?: boolean;
  storeNames: ReadonlyMap<number, string>;
  onClose: () => void;
}

/** En una promo nueva no hay productos "ya asignados" que bloquear. */
const NO_LOCKED: ReadonlySet<number> = new Set();

const STEPS: ReadonlyArray<{ step: Step; title: string }> = [
  { step: 1, title: "¿Qué promo?" },
  { step: 2, title: "¿Qué productos entran?" },
  { step: 3, title: "¿Cuándo?" },
];

function StepHeader({ current, onGoTo }: { current: Step; onGoTo: (step: Step) => void }) {
  return (
    <ol className="mb-5 grid grid-cols-3 gap-2">
      {STEPS.map(({ step, title }) => {
        const done = step < current;
        const active = step === current;
        return (
          <li key={step}>
            <button
              type="button"
              disabled={!done}
              onClick={() => onGoTo(step)}
              aria-current={active ? "step" : undefined}
              className="flex w-full flex-col items-start gap-1.5 rounded-xl px-2 py-2 text-left sm:flex-row sm:items-center sm:gap-2.5"
              style={{ cursor: done ? "pointer" : "default", background: active ? SOFT_BG : "transparent" }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] font-black"
                style={done || active
                  ? { background: GREEN_SOLID, color: "#04120c" }
                  : { border: CARD_BORDER, color: TEXT_MD }}
              >
                {done ? <Check size={16} aria-hidden /> : step}
              </span>
              <span className="text-[14px] font-bold leading-tight" style={{ color: active ? TEXT_HI : TEXT_MD }}>{title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Asistente "Nueva promoción": una pregunta por pantalla y la promo se crea YA
 * con sus productos (antes eran dos modales en dos momentos).
 */
export function PromoWizard({ products, categories, loadingProducts = false, storeNames, onClose }: PromoWizardProps) {
  const viewer = usePromoViewer();
  const { invalidate } = usePromoCache();
  const attach = useAttachRun();

  const [step, setStep] = useState<Step>(1);
  const [phase, setPhase] = useState<Phase>("form");
  const [draft, setDraft] = useState<PromoDraft>(emptyDraft);
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const creating = useRef(false);

  const buckets = useMemo(() => buildCategoryBuckets(products, categories), [products, categories]);
  const summary = useMemo(() => selectionSummary(selected, buckets), [selected, buckets]);
  const names = useMemo(() => new Map(products.map(product => [product.id, product.name])), [products]);
  const looseNames = useMemo(
    () => summary.looseIds.flatMap(id => names.get(id) ?? []).sort((a, b) => a.localeCompare(b, "es")),
    [summary.looseIds, names],
  );

  const patch = (changes: Partial<PromoDraft>) => {
    if ("name" in changes) setNameTouched(true);
    setDraft(current => ({ ...current, ...changes }));
    setError(null);
  };

  const sentence = promoSummarySentence({
    label: draftLabel(draft),
    productCount: summary.total,
    fullCategories: summary.fullCategories,
    looseCount: summary.looseCount,
    looseNames,
    vigencia: formatVigenciaYmd(draft.startsAt, draft.endsAt, getTodayLocal()),
    scope: promoScopeLabel(viewer.isAdmin ? draft.storeId : viewer.storeId, viewer, storeNames),
  });

  const goToDetails = () => {
    // El nombre se sugiere solo mientras el usuario no haya escrito uno.
    if (!nameTouched) {
      const singleName = summary.total === 1 ? looseNames[0] : undefined;
      setDraft(current => ({ ...current, name: suggestPromoName(draftNamePrefix(current), summary.fullCategories, singleName) }));
    }
    setStep(3);
  };

  const create = async () => {
    // Guard síncrono: un doble toque en "Crear promoción" no debe crear dos promos.
    if (creating.current) return;
    const problem = validateWhat(draft) ?? validateDetails(draft);
    if (problem) { setError(problem); return; }
    creating.current = true;
    setPhase("saving");

    let promoId: number;
    try {
      promoId = (await createPromotion(draftToInput(draft, viewer))).id;
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? "No se pudo crear la promoción. Intenta de nuevo.");
      setPhase("form");
      creating.current = false;
      return;
    }

    // La promo YA existe: de aquí en adelante nunca se regresa al formulario
    // (reintentar crearía un duplicado). Lo que falte se resuelve en el resultado.
    setCreatedId(promoId);
    if (selected.size > 0) await attach.run(promoId, [...selected]);
    else invalidate();
    setPhase("result");
  };

  const next = () => {
    if (step === 1) {
      const problem = validateWhat(draft);
      if (problem) { setError(problem); return; }
      setStep(2);
    } else if (step === 2) {
      goToDetails();
    } else {
      void create();
    }
  };

  const back = () => { setError(null); setStep(current => (current === 3 ? 2 : 1)); };

  const dirty = step > 1 || selected.size > 0 || nameTouched;
  const requestClose = () => {
    if (phase === "form" && dirty) setConfirmExit(true);
    else onClose();
  };

  const footer = phase === "saving" ? null : phase === "result" ? (
    <PromoButton variant="primary" onClick={onClose} data-testid="wizard-done">Listo</PromoButton>
  ) : confirmExit ? (
    <>
      <p className="mr-auto text-[15px] font-bold" style={{ color: TEXT_HI }}>¿Salir sin guardar la promo?</p>
      <PromoButton onClick={() => setConfirmExit(false)}>Seguir aquí</PromoButton>
      <PromoButton variant="danger" onClick={onClose}>Salir sin guardar</PromoButton>
    </>
  ) : (
    <>
      {step === 1
        ? <PromoButton className="mr-auto" onClick={requestClose}>Cancelar</PromoButton>
        : <PromoButton className="mr-auto" icon={<ArrowLeft size={16} aria-hidden />} onClick={back}>Atrás</PromoButton>}
      <PromoButton variant="primary" onClick={next} data-testid={step === 3 ? "wizard-create" : "wizard-next"}>
        {step === 3 ? "Crear promoción" : "Siguiente"}
        {step !== 3 && <ArrowRight size={16} aria-hidden />}
      </PromoButton>
    </>
  );

  return (
    <PromoDialog
      title="Nueva promoción"
      size="lg"
      busy={phase === "saving" || attach.running}
      onClose={requestClose}
      testId="promo-wizard"
      footer={footer}
    >
      {phase === "saving" && (
        selected.size > 0 && attach.running
          ? <AttachProgress progress={attach.progress} />
          : <p className="py-12 text-center text-[17px] font-bold" role="status" style={{ color: TEXT_HI }}>Creando la promoción…</p>
      )}

      {phase === "result" && (
        <div className="space-y-4">
          <p className="text-[19px] font-black" style={{ color: GREEN }}>Promoción creada: {draft.name.trim()}</p>
          {attach.outcome ? (
            <AttachResult
              summary={summarizeAttachOutcome(attach.outcome, names)}
              retrying={attach.running}
              {...(createdId != null ? { onRetry: () => attach.retryPending(createdId) } : {})}
            />
          ) : (
            <p className="rounded-2xl p-4 text-[15px] font-semibold" style={{ ...tint(AMBER), color: TEXT_HI }}>
              Quedó sin productos, así que todavía no aplica en Caja. Agrégale productos desde la lista con el botón "Agregar productos".
            </p>
          )}
        </div>
      )}

      {phase === "form" && (
        <>
          <StepHeader current={step} onGoTo={target => { setError(null); setStep(target); }} />
          {step === 1 && <PromoWhatFields draft={draft} onChange={patch} />}
          {step === 2 && (
            <ProductPicker
              products={products}
              categories={categories}
              selected={selected}
              locked={NO_LOCKED}
              onChange={setSelected}
              loading={loadingProducts}
            />
          )}
          {step === 3 && (
            <div className="space-y-5">
              <PromoWhenFields draft={draft} onChange={patch} viewer={viewer} />
              <div className="rounded-2xl p-4" style={{ background: SOFT_BG, border: CARD_BORDER }} data-testid="wizard-summary">
                <p className="text-[14px] font-bold" style={{ color: TEXT_MD }}>Así va a quedar:</p>
                <p className="mt-1 text-[17px] font-extrabold leading-snug" style={{ color: TEXT_HI }}>{sentence}</p>
                {summary.total === 0 && (
                  <p className="mt-2 text-[14px] font-semibold" style={{ color: AMBER }}>
                    Sin productos la promo no aplica en Caja. Puedes agregarlos después.
                  </p>
                )}
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-xl px-4 py-3 text-[15px] font-bold" style={{ background: "rgba(224,34,26,0.12)", color: RED_SOFT }}>
              {error}
            </p>
          )}
        </>
      )}
    </PromoDialog>
  );
}
