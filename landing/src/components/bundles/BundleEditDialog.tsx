import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Camera, ChevronDown, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  removeProductImage, updateBundle, uploadProductImage,
  type ApiError, type Bundle, type BundleInput,
} from "@tadaima/api";
import { useBundleCache, type BundleViewer } from "@/hooks/queries/useBundles";
import { generateEan13 } from "@/lib/barcode";
import {
  MAX_DESCRIPTION, MAX_NAME, assembleErrorText, draftFromBundle, draftToInput, parseMoney, validateDatos, type BundleDraft } from "@/lib/bundleDraft";
import { savingsPct } from "@/lib/bundleMath";
import { PRICE_FORM_LABELS } from "@/lib/priceLevels";
import { PromoButton } from "@/components/promos/PromoButton";
import { PromoDialog } from "@/components/promos/PromoDialog";
import { ProductThumb } from "@/components/promos/ProductPickerRows";
import { AMBER, CARD_BORDER, GREEN, RED_SOFT, TEXT_HI, TEXT_MD, fmtMoney, inputStyle, tint } from "@/components/promos/promoTokens";
import { bundlesLabel } from "./bundleTokens";

interface BundleEditDialogProps {
  bundle: Bundle;
  viewer: BundleViewer;
  onClose: () => void;
  onSaved: (fresh: Bundle) => void;
}

const LABEL = "mb-1.5 block text-[15px] font-bold";
const HINT = "mt-1.5 block text-[14px] font-semibold";
const H3 = "mb-3 text-[17px] font-black";
const MAX_SKU = 100;
const MAX_PHOTO_MB = 8;
const MAX_PHOTO_BYTES = MAX_PHOTO_MB * 1024 * 1024;
const MORE_PRICES = [
  { key: "price2", label: PRICE_FORM_LABELS[1] },
  { key: "price3", label: PRICE_FORM_LABELS[2] },
  { key: "price4", label: PRICE_FORM_LABELS[3] },
  { key: "price5", label: PRICE_FORM_LABELS[4] },
] as const;

/** Body del PUT: todo lo del borrador MENOS los componentes (en v1 la composición no se edita aquí). */
const toUpdateInput = (draft: BundleDraft): Partial<BundleInput> => {
  const full = draftToInput(draft);
  return {
    name: full.name,
    description: full.description,
    prices: full.prices,
    ...(full.sku !== undefined ? { sku: full.sku } : {}),
    ...(full.barcode !== undefined ? { barcode: full.barcode } : {}),
  };
};

const skuErrorOf = (err: unknown): string | null => {
  const errors = (err as Partial<ApiError> | null)?.errors;
  const first = errors?.["sku"]?.[0];
  return typeof first === "string" && first.trim() ? first : null;
};

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className={LABEL} style={{ color: TEXT_HI }}>{label}</span>
      {children}
      {hint && <span className={HINT} style={{ color: TEXT_MD }}>{hint}</span>}
    </label>
  );
}

function PriceInput({ value, onChange, testId }: { value: string; onChange: (value: string) => void; testId?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] font-bold" style={{ color: TEXT_MD }}>$</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value.replace(/[^\d.]/g, ""))}
        inputMode="decimal"
        placeholder="0"
        style={{ ...inputStyle, paddingLeft: 30 }}
        {...(testId ? { "data-testid": testId } : {})}
      />
    </div>
  );
}

/**
 * Editar nombre, descripción, precios, SKU, código de barras y foto de un
 * paquete. La composición (qué lleva) se muestra solo de lectura en v1.
 */
export function BundleEditDialog({ bundle, viewer, onClose, onSaved }: BundleEditDialogProps) {
  const { applyFresh, invalidate } = useBundleCache();
  const [draft, setDraft] = useState<BundleDraft>(() => draftFromBundle(bundle));
  const [morePrices, setMorePrices] = useState(() => [bundle.prices.price_2, bundle.prices.price_3, bundle.prices.price_4, bundle.prices.price_5].some(p => p != null));
  const [barcodeChanged, setBarcodeChanged] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skuError, setSkuError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const patch = (changes: Partial<BundleDraft>) => {
    setDraft(current => ({ ...current, ...changes }));
    setError(null);
  };

  const currentImage = bundle.images[0] ?? null;
  const shownImage = photoPreview ?? (removePhoto ? null : bundle.image);
  const price1 = parseMoney(draft.price1);
  const savings = Number.isFinite(price1) && price1 > 0 ? savingsPct(price1, bundle.suggested_price_sum) : null;

  const onPickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Elige una imagen (JPG, PNG o WebP)."); return; }
    if (file.size > MAX_PHOTO_BYTES) { toast.error(`La foto pesa más de ${MAX_PHOTO_MB} MB. Elige una más ligera.`); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setRemovePhoto(false);
  };

  const clearPhoto = () => {
    if (photoFile) { setPhotoFile(null); setPhotoPreview(null); return; }
    if (currentImage) setRemovePhoto(true);
  };

  const regenerateBarcode = () => {
    patch({ barcode: generateEan13() });
    setBarcodeChanged(true);
  };

  /** Sube / quita la foto y devuelve el paquete con la imagen ya reflejada (el refetch trae la verdad). */
  const syncPhoto = async (fresh: Bundle): Promise<Bundle> => {
    if (photoFile) {
      // Primero sube la nueva y luego quita la vieja: si la subida falla el
      // paquete no se queda sin foto. Un 404 al quitar (ya no existía) no importa.
      const uploaded = await uploadProductImage(bundle.id, photoFile);
      if (currentImage) await removeProductImage(bundle.id, currentImage.id).catch(() => undefined);
      const rest = fresh.images.filter(img => img.id !== currentImage?.id);
      return { ...fresh, image: uploaded.url, images: [{ ...uploaded, sort_order: 0 }, ...rest] };
    }
    if (removePhoto && currentImage) {
      await removeProductImage(bundle.id, currentImage.id);
      const rest = fresh.images.filter(img => img.id !== currentImage.id);
      return { ...fresh, image: rest[0]?.url ?? null, images: rest };
    }
    return fresh;
  };

  const save = async () => {
    const problem = validateDatos(draft);
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    setSkuError(null);
    try {
      let fresh: Bundle;
      try {
        fresh = await updateBundle(bundle.id, toUpdateInput(draft));
      } catch (err) {
        const skuMessage = skuErrorOf(err);
        const text = assembleErrorText(err, "No se pudieron guardar los cambios.");
        setSkuError(skuMessage);
        setError(skuMessage === text ? null : text);
        return;
      }
      applyFresh(fresh); // los datos ya están guardados aunque falle la foto
      try {
        fresh = await syncPhoto(fresh);
      } catch {
        invalidate();
        setError("Se guardaron los datos, pero la foto no se pudo actualizar. Intenta de nuevo.");
        return;
      }
      toast.success("Cambios guardados");
      applyFresh(fresh);
      invalidate();
      onSaved(fresh);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PromoDialog
      title="Editar paquete"
      subtitle={bundle.name}
      size="lg"
      busy={saving}
      onClose={onClose}
      testId="bundle-edit-dialog"
      footer={(
        <>
          <PromoButton onClick={onClose} disabled={saving}>Cancelar</PromoButton>
          <PromoButton variant="primary" onClick={() => { void save(); }} loading={saving} data-testid="bundle-edit-submit">
            {saving ? "Guardando…" : "Guardar cambios"}
          </PromoButton>
        </>
      )}
    >
      <div className="space-y-6">
        <section className="flex flex-wrap items-center gap-4">
          <ProductThumb image={shownImage} size={120} />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" aria-label="Elegir foto" data-testid="bundle-photo-input" />
            <PromoButton icon={<Camera size={18} aria-hidden />} onClick={() => fileRef.current?.click()} disabled={saving}>
              {shownImage ? "Cambiar foto" : "Agregar foto"}
            </PromoButton>
            {shownImage && (
              <PromoButton variant="danger" icon={<Trash2 size={18} aria-hidden />} onClick={clearPhoto} disabled={saving}>Quitar foto</PromoButton>
            )}
          </div>
        </section>

        <section className="space-y-5">
          <Field label="Nombre del paquete">
            <input value={draft.name} onChange={event => patch({ name: event.target.value })} maxLength={MAX_NAME} style={inputStyle} data-testid="bundle-name-input" />
          </Field>
          <Field label="Descripción (opcional)">
            <textarea
              value={draft.description}
              onChange={event => patch({ description: event.target.value })}
              maxLength={MAX_DESCRIPTION}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              data-testid="bundle-description-input"
            />
          </Field>
          <div>
            <Field label="Precio normal">
              <PriceInput value={draft.price1} onChange={price1 => patch({ price1 })} testId="bundle-price1-input" />
            </Field>
            <span className={HINT} style={{ color: savings != null && savings < 0 ? AMBER : TEXT_MD }}>
              Suma de precios individuales: {fmtMoney(bundle.suggested_price_sum)}
              {savings != null && savings >= 0 ? ` · Ahorro: ${savings}%` : ""}
              {savings != null && savings < 0 ? " · El paquete cuesta más que los productos sueltos." : ""}
            </span>
          </div>
          <div>
            <button
              type="button"
              onClick={() => setMorePrices(open => !open)}
              aria-expanded={morePrices}
              className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-bold"
              style={{ color: TEXT_MD, cursor: "pointer" }}
            >
              Más precios (Socio, Mayorista…)
              <ChevronDown size={16} aria-hidden style={{ transform: morePrices ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
            </button>
            {morePrices && (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {MORE_PRICES.map(({ key, label }) => (
                  <Field key={key} label={label}>
                    <PriceInput value={draft[key]} onChange={value => patch({ [key]: value })} />
                  </Field>
                ))}
              </div>
            )}
          </div>
          <div>
            <Field label="SKU" hint="Código corto para teclearlo en Caja.">
              <input
                value={draft.sku}
                onChange={event => { patch({ sku: event.target.value.toUpperCase() }); setSkuError(null); }}
                maxLength={MAX_SKU}
                style={{ ...inputStyle, textTransform: "uppercase", ...(skuError ? { borderColor: RED_SOFT } : {}) }}
                aria-invalid={skuError != null}
                data-testid="bundle-sku-input"
              />
            </Field>
            {skuError && <span role="alert" className={HINT} style={{ color: RED_SOFT }}>{skuError}</span>}
          </div>
          <div>
            <span className={LABEL} style={{ color: TEXT_HI }}>Código de barras</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={draft.barcode}
                placeholder="Sin código de barras"
                aria-label="Código de barras"
                className="tabular-nums"
                style={{ ...inputStyle, width: "auto", flex: 1, minWidth: 200, letterSpacing: "0.08em" }}
                data-testid="bundle-barcode-input"
              />
              <PromoButton icon={<RefreshCw size={16} aria-hidden />} onClick={regenerateBarcode} disabled={saving} data-testid="bundle-barcode-generate">
                {draft.barcode ? "Generar otro" : "Generar"}
              </PromoButton>
            </div>
            {barcodeChanged && bundle.barcode && (
              <span className={HINT} style={{ color: AMBER }}>Si ya imprimiste etiquetas con el código anterior, reimprímelas.</span>
            )}
          </div>
        </section>

        <section>
          <h3 className={H3} style={{ color: TEXT_HI }}>Qué lleva</h3>
          <ul className="overflow-hidden rounded-2xl" style={{ border: CARD_BORDER }}>
            {draft.components.map((c, index) => (
              <li key={c.productId} className="flex items-center gap-3 px-3 py-2" style={index > 0 ? { borderTop: CARD_BORDER } : {}}>
                <ProductThumb image={c.image} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold" style={{ color: TEXT_HI }}>
                    <span style={{ color: GREEN }}>{c.quantity} ×</span> {c.name}
                  </span>
                  <span className="block text-[13px] font-semibold" style={{ color: TEXT_MD }}>Código {c.sku}</span>
                </span>
              </li>
            ))}
          </ul>
          {bundle.composition_locked ? (
            <p className="mt-3 rounded-xl px-4 py-3 text-[14px] font-bold" style={tint(AMBER)}>
              Hay {bundlesLabel(bundle.stock_total)} armados{!viewer.isAdmin && viewer.storeName ? ` en ${viewer.storeName}` : ""}.
              Para cambiar qué lleva, primero desármalos (así los productos regresan al inventario).
            </p>
          ) : (
            <p className="mt-3 text-[14px] font-semibold" style={{ color: TEXT_MD }}>
              Para cambiar los productos del paquete, desármalo si tiene armados y edítalo; en esta versión la composición se cambia creando un paquete nuevo.
            </p>
          )}
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
