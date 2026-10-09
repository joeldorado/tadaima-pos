import { useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { lookupProductByCode } from "@tadaima/api";
import { generateEan13 } from "@/lib/barcode";
import { MAX_DESCRIPTION, MAX_NAME, parseMoney, type BundleDraft } from "@/lib/bundleDraft";
import { savingsPct } from "@/lib/bundleMath";
import { PRICE_FORM_LABELS } from "@/lib/priceLevels";
import { PromoButton } from "@/components/promos/PromoButton";
import { AMBER, GREEN, TEXT_HI, TEXT_MD, fmtMoney, inputStyle } from "@/components/promos/promoTokens";
import { BundlePhotoField } from "./BundlePhotoField";

interface BundleDatosFieldsProps {
  draft: BundleDraft;
  onChange: (patch: Partial<BundleDraft>) => void;
  photoUrl: string | null;
  onPhoto: (file: File | null) => void;
  /** Suma de precios sueltos (del preview o local). null = sin datos. */
  priceSum: number | null;
  /** Al editar: el propio paquete no cuenta como duplicado de SKU. */
  excludeProductId?: number;
}

const QUICK_DISCOUNTS = [5, 10, 15] as const;
const SKU_LOOKUP_MIN = 3;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[14px] font-bold" style={{ color: TEXT_MD }}>{label}</span>
      {children}
      {hint && <span className="block text-[13px] font-semibold" style={{ color: TEXT_MD }}>{hint}</span>}
    </label>
  );
}

const roundPeso = (n: number): string => String(Math.round(n));

/** Paso 2 del asistente (y edición): foto, nombre, descripción, precios, SKU y código. */
export function BundleDatosFields({ draft, onChange, photoUrl, onPhoto, priceSum, excludeProductId }: BundleDatosFieldsProps) {
  const [morePrices, setMorePrices] = useState(() => [draft.price2, draft.price3, draft.price4, draft.price5].some(v => v.trim() !== ""));
  const [skuDuplicate, setSkuDuplicate] = useState<string | null>(null);

  const price = parseMoney(draft.price1);
  const savings = Number.isFinite(price) && priceSum != null ? savingsPct(price, priceSum) : null;

  // Aviso de SKU repetido al dejar el campo (mismo endpoint que el alta de producto).
  const checkSku = async (value: string) => {
    const code = value.trim();
    if (code.length < SKU_LOOKUP_MIN) { setSkuDuplicate(null); return; }
    try {
      const hits = await lookupProductByCode(code, excludeProductId);
      const other = hits.find(p => p.id !== excludeProductId);
      setSkuDuplicate(other ? `Ya existe un producto con este código: ${other.name}.` : null);
    } catch {
      setSkuDuplicate(null);
    }
  };

  const priceHelper = (() => {
    if (priceSum == null || priceSum <= 0) return null;
    const base = `Suma de precios individuales: ${fmtMoney(priceSum)}`;
    if (savings == null) return <span style={{ color: TEXT_MD }}>{base}</span>;
    if (savings > 0) return <span style={{ color: GREEN }}>{base} · Ahorro: {savings}%</span>;
    if (savings < 0) return <span style={{ color: AMBER }}>{base} · El paquete cuesta más que los productos sueltos.</span>;
    return <span style={{ color: TEXT_MD }}>{base} · Mismo precio que por separado.</span>;
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-5 sm:flex-row">
        <BundlePhotoField photoUrl={photoUrl} onPhoto={onPhoto} />
        <div className="flex-1 space-y-4">
          <Field label="Nombre del paquete" hint="Así se ve en Caja, en el ticket y en la etiqueta.">
            <input
              value={draft.name}
              maxLength={MAX_NAME}
              onChange={event => onChange({ name: event.target.value, nameTouched: true })}
              placeholder="Por ejemplo: Paquete Goku + Vegeta"
              style={inputStyle}
              data-testid="bundle-name-input"
            />
          </Field>
          <Field label="Descripción (opcional)" hint="Qué incluye o para qué ocasión. Para el equipo.">
            <textarea
              value={draft.description}
              maxLength={MAX_DESCRIPTION}
              rows={2}
              onChange={event => onChange({ description: event.target.value })}
              placeholder="Dos figuras de la saga Z…"
              style={{ ...inputStyle, minHeight: 72, resize: "vertical", fontWeight: 600 }}
            />
          </Field>
        </div>
      </div>

      <Field label="Precio normal del paquete">
        <div className="relative">
          <span className="absolute left-4 top-3 text-[18px] font-black" style={{ color: TEXT_MD }} aria-hidden>$</span>
          <input
            value={draft.price1}
            inputMode="decimal"
            onChange={event => onChange({ price1: event.target.value.replace(/[^\d.]/g, "") })}
            placeholder="0"
            aria-label="Precio normal del paquete en pesos"
            style={{ ...inputStyle, paddingLeft: 32, fontSize: 20, fontWeight: 900 }}
            data-testid="bundle-price-input"
          />
        </div>
        {priceHelper && <span className="block text-[14px] font-bold" aria-live="polite">{priceHelper}</span>}
        {priceSum != null && priceSum > 0 && (
          <span className="mt-1 flex flex-wrap gap-2">
            <PromoButton variant="accent" onClick={() => onChange({ price1: roundPeso(priceSum) })}>Usar la suma</PromoButton>
            {QUICK_DISCOUNTS.map(pct => (
              <PromoButton key={pct} onClick={() => onChange({ price1: roundPeso(priceSum * (1 - pct / 100)) })}>−{pct}%</PromoButton>
            ))}
          </span>
        )}
      </Field>

      <div>
        <button
          type="button"
          onClick={() => setMorePrices(current => !current)}
          aria-expanded={morePrices}
          className="inline-flex items-center gap-1 text-[14px] font-bold"
          style={{ color: TEXT_HI, cursor: "pointer", background: "transparent", border: "none", padding: 0 }}
        >
          <ChevronDown size={16} aria-hidden style={{ transform: morePrices ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
          Más precios (Socio, Mayorista…)
        </button>
        {morePrices && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([["price2", 1], ["price3", 2], ["price4", 3], ["price5", 4]] as const).map(([key, index]) => (
              <Field key={key} label={PRICE_FORM_LABELS[index]}>
                <input
                  value={draft[key]}
                  inputMode="decimal"
                  onChange={event => onChange({ [key]: event.target.value.replace(/[^\d.]/g, "") })}
                  placeholder="Vacío = usa el normal"
                  style={inputStyle}
                />
              </Field>
            ))}
            <p className="text-[13px] font-semibold sm:col-span-2" style={{ color: TEXT_MD }}>Si los dejas vacíos, Caja usa el precio normal.</p>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SKU (clave corta)" hint="Es lo que tecleas en Caja para encontrarlo. Puedes cambiarlo.">
          <input
            value={draft.sku}
            maxLength={100}
            onChange={event => { setSkuDuplicate(null); onChange({ sku: event.target.value.toUpperCase(), skuTouched: true }); }}
            onBlur={event => { void checkSku(event.target.value); }}
            placeholder="PAQ-0001"
            style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", letterSpacing: 0.5 }}
            data-testid="bundle-sku-input"
          />
          {skuDuplicate && <span className="block text-[13px] font-bold" style={{ color: AMBER }}>{skuDuplicate}</span>}
        </Field>
        <Field label="Código de barras (EAN-13)" hint="Va en la etiqueta; el lector lo reconoce en Caja.">
          <div className="flex items-center gap-2">
            <input
              value={draft.barcode}
              readOnly
              aria-label="Código de barras generado"
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", letterSpacing: 1, opacity: 0.85 }}
              data-testid="bundle-barcode-input"
            />
            <PromoButton icon={<RefreshCw size={16} aria-hidden />} onClick={() => onChange({ barcode: generateEan13() })} title="Generar otro código">
              Otro
            </PromoButton>
          </div>
        </Field>
      </div>
    </div>
  );
}
