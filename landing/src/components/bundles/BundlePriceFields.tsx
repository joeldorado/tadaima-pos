import type { ReactNode } from "react";
import { socioPriceWarning, type BundleDraft } from "@/lib/bundleDraft";
import { PRICE_FORM_LABELS, PRICE_LEVEL_COLORS } from "@/lib/priceLevels";
import { AMBER, TEXT_HI, TEXT_MD, inputStyle } from "@/components/promos/promoTokens";

type PriceKey = "price1" | "price2" | "price3" | "price4" | "price5";

interface BundlePriceFieldsProps {
  draft: Pick<BundleDraft, PriceKey>;
  onChange: (patch: Partial<Pick<BundleDraft, PriceKey>>) => void;
  /** Va justo debajo de la primera fila: suma de sueltos y atajos del precio normal. */
  normalExtra?: ReactNode;
  /** data-testid del precio normal (el asistente y el editar usan ids distintos). */
  normalTestId: string;
}

interface PriceBoxProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  /** Color del nivel (Normal = principal, Socio = ámbar como en Caja). */
  accent?: string;
  big?: boolean;
  placeholder: string;
  testId: string;
}

function PriceBox({ label, hint, value, onChange, accent, big = false, placeholder, testId }: PriceBoxProps) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-[14px] font-bold" style={{ color: accent ?? TEXT_MD }}>
        {accent && <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: accent }} />}
        {label}
      </span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-black" style={{ color: TEXT_MD, fontSize: big ? 18 : 16 }} aria-hidden>$</span>
        <input
          value={value}
          inputMode="decimal"
          onChange={event => onChange(event.target.value.replace(/[^\d.]/g, ""))}
          placeholder={placeholder}
          style={{
            ...inputStyle,
            paddingLeft: 30,
            ...(big ? { fontSize: 20, fontWeight: 900 } : {}),
            ...(accent ? { borderColor: `${accent}66` } : {}),
          }}
          data-testid={testId}
        />
      </span>
      {hint && <span className="block text-[13px] font-semibold" style={{ color: TEXT_MD }}>{hint}</span>}
    </label>
  );
}

/**
 * Los 5 niveles de precio del paquete, a la vista y a mano como en el alta de
 * Productos (Joel 2026-10-19: el cliente no encontraba el precio Socio porque
 * vivía en un desplegable). Socio = nivel b / `price_2`, el mismo de Productos
 * y Mangas: Caja lo cobra sola a un socio activo que no paga con tarjeta.
 */
export function BundlePriceFields({ draft, onChange, normalExtra, normalTestId }: BundlePriceFieldsProps) {
  const warning = socioPriceWarning(draft.price1, draft.price2);
  const optional = "Opcional";

  return (
    <div className="space-y-4" data-testid="bundle-price-fields">
      <div className="grid gap-4 sm:grid-cols-3">
        <PriceBox
          label={PRICE_FORM_LABELS[0]}
          value={draft.price1}
          onChange={price1 => onChange({ price1 })}
          big
          placeholder="0"
          testId={normalTestId}
        />
        <PriceBox
          label={PRICE_FORM_LABELS[1]}
          hint="Cliente con tarjeta Tadaima."
          value={draft.price2}
          onChange={price2 => onChange({ price2 })}
          accent={PRICE_LEVEL_COLORS.b}
          big
          placeholder={optional}
          testId="bundle-price2-input"
        />
        <PriceBox
          label={PRICE_FORM_LABELS[2]}
          value={draft.price3}
          onChange={price3 => onChange({ price3 })}
          placeholder={optional}
          testId="bundle-price3-input"
        />
      </div>

      {warning && (
        <p role="status" className="text-[14px] font-bold" style={{ color: AMBER }}>{warning}</p>
      )}
      {normalExtra}

      <div className="grid gap-4 sm:grid-cols-2">
        <PriceBox
          label={PRICE_FORM_LABELS[3]}
          value={draft.price4}
          onChange={price4 => onChange({ price4 })}
          placeholder={optional}
          testId="bundle-price4-input"
        />
        <PriceBox
          label={PRICE_FORM_LABELS[4]}
          value={draft.price5}
          onChange={price5 => onChange({ price5 })}
          placeholder={optional}
          testId="bundle-price5-input"
        />
      </div>

      <p className="text-[13px] font-semibold" style={{ color: TEXT_MD }}>
        Solo el <b style={{ color: TEXT_HI }}>precio normal</b> es obligatorio; si dejas los demás vacíos, Caja cobra el normal.
        El precio socio lo pone Caja sola cuando el cliente es socio activo y no paga con tarjeta.
      </p>
    </div>
  );
}
