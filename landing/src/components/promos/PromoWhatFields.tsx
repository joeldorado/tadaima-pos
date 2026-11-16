import { useState } from "react";
import type { PromoDraft } from "@/lib/promoDraft";
import { CARD_BG, CARD_BORDER, GREEN, SOFT_BG, TEXT_HI, TEXT_MD, fmtMoney, inputStyle, tint } from "./promoTokens";

type Choice = "2x1" | "3x2" | "4x3" | "otra" | "mayoreo" | "especial";

interface PromoWhatFieldsProps {
  draft: PromoDraft;
  onChange: (patch: Partial<PromoDraft>) => void;
}

interface ChoiceOption {
  key: Choice;
  title: string;
  description: string;
  patch: Partial<PromoDraft>;
}

const OPTIONS: readonly ChoiceOption[] = [
  { key: "2x1", title: "2x1", description: "Se lleva 2, paga 1", patch: { kind: "nxm", buyN: "2", payM: "1" } },
  { key: "3x2", title: "3x2", description: "Se lleva 3, paga 2", patch: { kind: "nxm", buyN: "3", payM: "2" } },
  { key: "4x3", title: "4x3", description: "Se lleva 4, paga 3", patch: { kind: "nxm", buyN: "4", payM: "3" } },
  { key: "otra", title: "Otra", description: "Tú dices cuántas se lleva y cuántas paga", patch: { kind: "nxm" } },
  { key: "mayoreo", title: "Descuento por cantidad", description: "Llevando varias, cada pieza baja de precio", patch: { kind: "qty_discount" } },
  { key: "especial", title: "Precio especial", description: "Desde 1 pieza: cuesta $X o baja un %", patch: { kind: "special_price" } },
];

/** Las tarjetas de texto largo van más chicas y a todo lo ancho en celular. */
const WIDE_CHOICES: ReadonlySet<Choice> = new Set<Choice>(["mayoreo", "especial"]);

function initialChoice(draft: PromoDraft): Choice {
  if (draft.kind === "qty_discount") return "mayoreo";
  if (draft.kind === "special_price") return "especial";
  const preset = OPTIONS.find(option => option.patch.buyN === draft.buyN && option.patch.payM === draft.payM);
  return preset?.key ?? "otra";
}

/** Ejemplo con la cuenta hecha, para que se entienda antes de guardar. */
function nxmExample(draft: PromoDraft): string {
  const buy = parseInt(draft.buyN, 10) || 0;
  const pay = parseInt(draft.payM, 10) || 0;
  if (buy < 2 || pay < 1 || pay >= buy) return "Lo que paga debe ser menos de lo que se lleva. Por ejemplo: se lleva 5 y paga 4.";
  const free = buy - pay;
  return `El cliente se lleva ${buy} y paga ${pay}: ${free} gratis por cada ${buy}.`;
}

function mayoreoExample(draft: PromoDraft): string {
  const minQty = parseInt(draft.minQty, 10) || 0;
  const perUnit = parseFloat(draft.perUnit) || 0;
  if (minQty < 2 || perUnit <= 0) return "Por ejemplo: desde 5 piezas, cada una baja $20.";
  return `Llevando ${minQty} piezas ahorra ${fmtMoney(minQty * perUnit)}; llevando ${minQty + 2} ahorra ${fmtMoney((minQty + 2) * perUnit)}. Con ${minQty - 1} o menos paga precio normal.`;
}

function specialExample(draft: PromoDraft): string {
  const value = parseFloat(draft.specialValue) || 0;
  if (draft.priceMode === "percent") {
    if (value < 1 || value > 99) return "Por ejemplo: 45% menos en cada pieza (Buen Fin).";
    return `${value}% menos en cada pieza, desde 1. Una pieza de $1,000 queda en ${fmtMoney(1000 * (1 - value / 100))}.`;
  }
  if (value <= 0) return "Por ejemplo: cada pieza se cobra a $350.";
  return `Cada pieza se cobra a ${fmtMoney(value)}, desde 1. Si el producto ya cuesta eso o menos, se cobra su precio normal.`;
}

const PRICE_MODES: readonly { key: PromoDraft["priceMode"]; label: string; hint: string }[] = [
  { key: "fixed", label: "$ Precio fijo", hint: "La pieza cuesta $X" },
  { key: "percent", label: "% Porcentaje", hint: "La pieza baja un %" },
];

function NumberField({ label, value, onChange, prefix, suffix, max }: {
  label: string; value: string; onChange: (value: string) => void; prefix?: string; suffix?: string; max?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-bold" style={{ color: TEXT_HI }}>{label}</span>
      <span className="relative block">
        {prefix && (
          <span className="absolute left-4 top-3 text-[16px] font-bold" style={{ color: TEXT_MD }} aria-hidden>{prefix}</span>
        )}
        <input
          type="number"
          inputMode="decimal"
          min={1}
          {...(max != null ? { max } : {})}
          value={value}
          onChange={event => onChange(event.target.value)}
          style={{ ...inputStyle, ...(prefix ? { paddingLeft: 30 } : {}), ...(suffix ? { paddingRight: 34 } : {}) }}
        />
        {suffix && (
          <span className="absolute right-4 top-3 text-[16px] font-bold" style={{ color: TEXT_MD }} aria-hidden>{suffix}</span>
        )}
      </span>
    </label>
  );
}

/** Paso "¿Qué promo?": se elige con tarjetas grandes; sin "NxM" ni jerga. */
export function PromoWhatFields({ draft, onChange }: PromoWhatFieldsProps) {
  const [choice, setChoice] = useState<Choice>(() => initialChoice(draft));

  const choose = (option: ChoiceOption) => {
    setChoice(option.key);
    onChange(option.patch);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Tipo de promoción">
        {OPTIONS.map(option => {
          const active = choice === option.key;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => choose(option)}
              className={`min-h-24 rounded-2xl px-4 py-3 text-left ${WIDE_CHOICES.has(option.key) ? "col-span-2 sm:col-span-1" : ""}`}
              style={active
                ? { ...tint(GREEN), cursor: "pointer" }
                : { background: CARD_BG, border: CARD_BORDER, cursor: "pointer" }}
              data-testid={`promo-kind-${option.key}`}
            >
              <span
                className={`block font-black leading-tight ${WIDE_CHOICES.has(option.key) ? "text-[18px]" : "text-[26px]"}`}
                style={{ color: active ? GREEN : TEXT_HI }}
              >
                {option.title}
              </span>
              <span className="mt-1 block text-[14px] font-semibold" style={{ color: TEXT_MD }}>{option.description}</span>
            </button>
          );
        })}
      </div>

      {choice === "otra" && (
        <div className="space-y-3 rounded-2xl p-4" style={{ background: SOFT_BG, border: CARD_BORDER }}>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="¿Cuántas se lleva?" value={draft.buyN} onChange={buyN => onChange({ buyN })} />
            <NumberField label="¿Cuántas paga?" value={draft.payM} onChange={payM => onChange({ payM })} />
          </div>
          <p className="text-[15px] font-semibold" style={{ color: TEXT_MD }}>{nxmExample(draft)}</p>
        </div>
      )}

      {choice === "mayoreo" && (
        <div className="space-y-3 rounded-2xl p-4" style={{ background: SOFT_BG, border: CARD_BORDER }}>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="¿Desde cuántas piezas?" value={draft.minQty} onChange={minQty => onChange({ minQty })} />
            <NumberField label="¿Cuánto baja cada pieza?" prefix="$" value={draft.perUnit} onChange={perUnit => onChange({ perUnit })} />
          </div>
          <p className="text-[15px] font-semibold" style={{ color: TEXT_MD }}>{mayoreoExample(draft)}</p>
        </div>
      )}

      {choice === "especial" && (
        <div className="space-y-3 rounded-2xl p-4" style={{ background: SOFT_BG, border: CARD_BORDER }}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="¿Precio fijo o porcentaje?">
            {PRICE_MODES.map(mode => {
              const active = draft.priceMode === mode.key;
              return (
                <button
                  key={mode.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  // Cambiar de $ a % limpia el valor: $350 no es un porcentaje.
                  onClick={() => onChange(active ? {} : { priceMode: mode.key, specialValue: "" })}
                  className="rounded-xl px-3 py-2 text-left"
                  style={active
                    ? { ...tint(GREEN), cursor: "pointer" }
                    : { background: CARD_BG, border: CARD_BORDER, cursor: "pointer" }}
                  data-testid={`promo-price-mode-${mode.key}`}
                >
                  <span className="block text-[16px] font-black" style={{ color: active ? GREEN : TEXT_HI }}>{mode.label}</span>
                  <span className="block text-[13px] font-semibold" style={{ color: TEXT_MD }}>{mode.hint}</span>
                </button>
              );
            })}
          </div>
          {draft.priceMode === "percent" ? (
            <NumberField key="percent" label="¿Cuánto % baja cada pieza?" suffix="%" max={99} value={draft.specialValue} onChange={specialValue => onChange({ specialValue })} />
          ) : (
            <NumberField key="fixed" label="¿A cuánto se cobra cada pieza?" prefix="$" value={draft.specialValue} onChange={specialValue => onChange({ specialValue })} />
          )}
          <p className="text-[15px] font-semibold" style={{ color: TEXT_MD }}>{specialExample(draft)}</p>
        </div>
      )}
    </div>
  );
}
