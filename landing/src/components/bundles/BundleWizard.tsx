import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Tag } from "lucide-react";
import { toast } from "sonner";
import { assembleBundle, createBundle, uploadProductImage, type Bundle, type Store } from "@tadaima/api";
import { useAuth } from "@tadaima/auth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { draftKeyFor, useFormDraft } from "@/hooks/useFormDraft";
import { useBundleCache, useBundlePreviewQuery, type BundleViewer } from "@/hooks/queries/useBundles";
import { generateEan13 } from "@/lib/barcode";
import {
  assembleErrorText, draftLines, draftToInput, emptyDraft, isEmptyBundleDraft, nextSku, suggestBundleName,
  validateArmado, validateComponentes, validateDatos, type BundleDraft,
} from "@/lib/bundleDraft";
import { maxBuildable, priceSum } from "@/lib/bundleMath";
import { PromoButton } from "@/components/promos/PromoButton";
import { PromoDialog } from "@/components/promos/PromoDialog";
import { AMBER, GREEN, RED_SOFT, TEXT_HI, TEXT_MD, tint } from "@/components/promos/promoTokens";
import { BundleComponentPicker, type ComponentsUpdater } from "./BundleComponentPicker";
import { BundleDatosFields } from "./BundleDatosFields";
import { BundleReviewStep } from "./BundleReviewStep";
import { BundleStepHeader } from "./BundleStepHeader";
import { bundlesLabel } from "./bundleTokens";

type Step = 1 | 2 | 3;
type Phase = "form" | "saving" | "result";

interface BundleWizardProps {
  /** Tienda elegida en la página (admin) o la del usuario. null = admin viendo todas. */
  defaultStoreId: number | null;
  stores: readonly Store[];
  viewer: BundleViewer;
  existingSkus: readonly string[];
  onClose: () => void;
  onPrintLabel: (bundle: Bundle) => void;
}

const STEPS = [
  { step: 1 as Step, title: "¿Qué productos lleva?" },
  { step: 2 as Step, title: "¿Cómo se llama y cuánto cuesta?" },
  { step: 3 as Step, title: "¿Cuántos armar?" },
] as const;

const DRAFT_BASE = "tadaima-bundle-draft";
const PREVIEW_DEBOUNCE_MS = 400;

/**
 * Asistente "Nuevo paquete" en 3 pasos: primero los productos (con "puedes
 * armar N" en vivo), luego nombre/precio/foto/códigos, y al final revisar y,
 * si se quiere, armar de una vez. El borrador sobrevive a cerrar la ventana.
 */
export function BundleWizard({ defaultStoreId, stores, viewer, existingSkus, onClose, onPrintLabel }: BundleWizardProps) {
  const { user } = useAuth();
  const { invalidate } = useBundleCache();
  const { draft: savedDraft, saveDraft, clearDraft } = useFormDraft<BundleDraft>({
    key: draftKeyFor(DRAFT_BASE, user?.id),
    emptyValue: emptyDraft(),
    isEmpty: isEmptyBundleDraft,
  });

  const [step, setStep] = useState<Step>(1);
  const [phase, setPhase] = useState<Phase>("form");
  const [savingStatus, setSavingStatus] = useState("Creando el paquete…");
  const [draft, setDraft] = useState<BundleDraft>(() => {
    const restored = savedDraft && !isEmptyBundleDraft(savedDraft) ? { ...emptyDraft(), ...savedDraft } : emptyDraft();
    return { ...restored, buildStoreId: restored.buildStoreId ?? defaultStoreId ?? viewer.storeId };
  });
  const [restored] = useState(() => Boolean(savedDraft && !isEmptyBundleDraft(savedDraft)));
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [created, setCreated] = useState<Bundle | null>(null);
  const [assembled, setAssembled] = useState<{ qty: number; storeName: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  // "Empezar de cero" remonta el selector (limpia su buscador y su aviso).
  const [pickerKey, setPickerKey] = useState(0);
  const creating = useRef(false);

  useEffect(() => {
    if (restored) toast.info("Se restauró lo que tenías capturado. Usa \"Empezar de cero\" para limpiar.", { id: "bundle-draft-restored" });
  }, [restored]);
  useEffect(() => { if (phase === "form") saveDraft(draft); }, [draft, phase, saveDraft]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const patch = (changes: Partial<BundleDraft>) => { setDraft(current => ({ ...current, ...changes })); setError(null); };
  const patchComponents = (updater: ComponentsUpdater) => {
    setDraft(current => ({ ...current, components: updater(current.components) }));
    setError(null);
  };
  const onPhoto = (file: File | null) => {
    setPhoto(file);
    // Fuera del updater: StrictMode los invoca dos veces y filtraría un blob URL.
    setPhotoUrl(file ? URL.createObjectURL(file) : null);
  };

  // Vista previa: cuántos se pueden armar por tienda con lo elegido.
  const storeId = viewer.isAdmin ? defaultStoreId : viewer.storeId;
  const storeName = viewer.isAdmin ? (stores.find(s => s.id === storeId)?.name ?? null) : viewer.storeName;
  const lines = useMemo(() => draftLines({ components: draft.components }), [draft.components]);
  const mathLines = useMemo(() => draft.components.map(c => ({ productId: c.productId, quantity: c.quantity })), [draft.components]);
  const debouncedLines = useDebouncedValue(lines, PREVIEW_DEBOUNCE_MS);
  const preview = useBundlePreviewQuery(debouncedLines, storeId, { enabled: phase === "form" });
  const availability = preview.data?.availability ?? [];
  const clientMax = useMemo(() => {
    if (storeId == null || draft.components.length === 0) return null;
    const stock = new Map(draft.components.map(c => [c.productId, (c.stockExh ?? 0) + (c.stockBod ?? 0)]));
    return maxBuildable(mathLines, stock);
  }, [draft.components, mathLines, storeId]);
  const localSum = priceSum(mathLines, new Map(draft.components.map(c => [c.productId, c.unitPrice])));
  // Con keepPreviousData el preview puede ir 400 ms atrás: mientras sea placeholder manda la suma local.
  const sum = !preview.isPlaceholderData && preview.data ? preview.data.suggested_price_sum : localSum;

  const goToDatos = () => {
    const problem = validateComponentes(draft);
    if (problem) { setError(problem); return; }
    setDraft(current => ({
      ...current,
      name: current.nameTouched ? current.name : suggestBundleName(current.components),
      sku: current.skuTouched || current.sku ? current.sku : nextSku(existingSkus),
      barcode: current.barcode || generateEan13(),
    }));
    setStep(2);
  };
  // Tienda por default para "armar ahora": la elegida en la página; si el admin
  // ve todas, la primera donde sí alcanza (o la primera de la lista).
  const defaultBuildStore = storeId ?? viewer.storeId
    ?? availability.find(r => r.max_buildable > 0)?.store_id ?? availability[0]?.store_id ?? null;
  const goToReview = () => {
    const problem = validateDatos(draft);
    if (problem) { setError(problem); return; }
    setDraft(current => ({ ...current, buildStoreId: current.buildStoreId ?? defaultBuildStore }));
    setStep(3);
  };

  const maxForBuildStore = draft.buildStoreId != null
    ? (availability.find(r => r.store_id === draft.buildStoreId)?.max_buildable ?? clientMax)
    : null;

  const create = async () => {
    if (creating.current) return;
    const problem = validateComponentes(draft) ?? validateDatos(draft) ?? validateArmado(draft, maxForBuildStore);
    if (problem) { setError(problem); return; }
    creating.current = true;
    setPhase("saving");
    setSavingStatus("Creando el paquete…");

    let bundle: Bundle;
    try {
      bundle = await createBundle(draftToInput(draft));
    } catch (err: unknown) {
      const errors = typeof err === "object" && err !== null ? (err as { errors?: Record<string, unknown> }).errors : undefined;
      if (errors?.sku) { setError("Ese SKU ya existe. Cambia la clave en el paso 2."); setStep(2); }
      else if (errors?.barcode) { setError("Ese código de barras ya existía; se generó otro. Vuelve a intentar."); setDraft(c => ({ ...c, barcode: generateEan13() })); setStep(2); }
      else setError(assembleErrorText(err, "No se pudo crear el paquete. Intenta de nuevo."));
      setPhase("form");
      creating.current = false;
      return;
    }

    // El paquete YA existe: de aquí no se regresa al formulario (reintentar duplicaría).
    clearDraft();
    const notes: string[] = [];
    if (photo) {
      setSavingStatus("Subiendo la foto…");
      try { await uploadProductImage(bundle.id, photo); } catch { notes.push("La foto no se pudo subir. Agrégala desde Editar."); }
    }
    if (draft.buildNow && draft.buildStoreId != null) {
      const qty = buildQty;
      const name = availability.find(r => r.store_id === draft.buildStoreId)?.store_name ?? storeName ?? "la tienda";
      setSavingStatus(`Armando ${qty} en ${name}…`);
      try {
        const res = await assembleBundle(bundle.id, { store_id: draft.buildStoreId, quantity: qty });
        bundle = res.bundle;
        setAssembled({ qty, storeName: name });
      } catch (err: unknown) {
        notes.push(`El paquete se creó pero no se armó: ${assembleErrorText(err, "inténtalo desde la lista")}.`);
      }
    }
    invalidate();
    setWarnings(notes);
    setCreated(bundle);
    setPhase("result");
  };

  const next = () => { if (step === 1) goToDatos(); else if (step === 2) goToReview(); else void create(); };
  const back = () => { setError(null); setStep(current => (current === 3 ? 2 : 1)); };
  const dirty = step > 1 || draft.components.length > 0 || draft.nameTouched;
  const requestClose = () => { if (phase === "form" && dirty) setConfirmExit(true); else onClose(); };
  const startOver = () => {
    clearDraft();
    setDraft({ ...emptyDraft(), buildStoreId: defaultStoreId ?? viewer.storeId });
    onPhoto(null);
    setStep(1);
    setError(null);
    setPickerKey(current => current + 1);
  };

  const buildQty = Math.max(1, Math.min(Number.parseInt(draft.buildQty, 10) || 1, maxForBuildStore ?? Number.POSITIVE_INFINITY));
  const footer = phase === "saving" ? null : phase === "result" ? (
    <>
      {created && (
        <PromoButton icon={<Tag size={16} aria-hidden />} onClick={() => onPrintLabel(created)} data-testid="wizard-print-label">
          Imprimir etiqueta
        </PromoButton>
      )}
      <PromoButton variant="primary" onClick={onClose} data-testid="wizard-done">Listo</PromoButton>
    </>
  ) : confirmExit ? (
    <>
      <p className="mr-auto text-[15px] font-bold" style={{ color: TEXT_HI }}>¿Salir sin crear el paquete? Lo capturado se guarda como borrador.</p>
      <PromoButton onClick={() => setConfirmExit(false)}>Seguir aquí</PromoButton>
      <PromoButton variant="danger" onClick={onClose}>Salir</PromoButton>
    </>
  ) : (
    <>
      {step === 1
        ? <PromoButton className="mr-auto" onClick={requestClose}>Cancelar</PromoButton>
        : <PromoButton className="mr-auto" icon={<ArrowLeft size={16} aria-hidden />} onClick={back}>Atrás</PromoButton>}
      {step === 1 && (restored || draft.components.length > 0) && (
        <button type="button" onClick={startOver} className="text-[14px] font-bold underline" style={{ color: TEXT_MD, cursor: "pointer", background: "transparent", border: "none" }}>
          Empezar de cero
        </button>
      )}
      <PromoButton variant="primary" onClick={next} data-testid={step === 3 ? "wizard-create" : "wizard-next"}>
        {step === 3 ? (draft.buildNow ? `Crear y armar ${buildQty}` : "Crear paquete") : "Siguiente"}
        {step !== 3 && <ArrowRight size={16} aria-hidden />}
      </PromoButton>
    </>
  );

  return (
    <PromoDialog title="Nuevo paquete" size="lg" busy={phase === "saving"} onClose={requestClose} testId="bundle-wizard" footer={footer}>
      {phase === "saving" && (
        <p className="py-12 text-center text-[17px] font-bold" role="status" style={{ color: TEXT_HI }}>{savingStatus}</p>
      )}

      {phase === "result" && created && (
        <div className="space-y-4" data-testid="wizard-result">
          <p className="text-[19px] font-black" style={{ color: GREEN }}>Paquete creado: {created.name}</p>
          <p className="text-[15px] font-semibold tabular-nums" style={{ color: TEXT_MD }}>SKU <b style={{ color: TEXT_HI }}>{created.sku}</b> · Código <b style={{ color: TEXT_HI }}>{created.barcode ?? "—"}</b></p>
          {assembled ? (
            <p className="rounded-2xl p-4 text-[15px] font-bold" style={{ ...tint(GREEN), color: TEXT_HI }}>
              Se armaron {bundlesLabel(assembled.qty)} en {assembled.storeName}. Ya se puede escanear y cobrar en Caja.
            </p>
          ) : (
            <p className="rounded-2xl p-4 text-[15px] font-semibold" style={{ ...tint(AMBER), color: TEXT_HI }}>
              Todavía no hay paquetes armados: en Caja aparecerá sin stock hasta que lo armes con el botón "Armar".
            </p>
          )}
          {warnings.map(w => (
            <p key={w} className="rounded-2xl p-3 text-[14px] font-semibold" style={{ ...tint(AMBER), color: TEXT_HI }}>{w}</p>
          ))}
        </div>
      )}

      {phase === "form" && (
        <>
          <BundleStepHeader steps={STEPS} current={step} onGoTo={target => { setError(null); setStep(target); }} />
          {step === 1 && (
            <BundleComponentPicker
              key={pickerKey}
              components={draft.components}
              onChange={patchComponents}
              storeId={storeId}
              storeName={storeName}
              availability={availability}
              previewLoading={preview.isFetching && !preview.data}
              previewError={preview.isError}
              clientMax={clientMax}
              scannerEnabled={!confirmExit}
            />
          )}
          {step === 2 && (
            <BundleDatosFields draft={draft} onChange={patch} photoUrl={photoUrl} onPhoto={onPhoto} priceSum={sum > 0 ? sum : null} />
          )}
          {step === 3 && (
            <BundleReviewStep
              draft={draft}
              photoUrl={photoUrl}
              availability={availability}
              previewLoading={preview.isFetching && !preview.data}
              previewError={preview.isError}
              clientMax={clientMax}
              viewer={viewer}
              stores={stores}
              onChange={patch}
            />
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
