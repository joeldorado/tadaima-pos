import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Store } from "@tadaima/api";
import { getTodayLocal } from "@/lib/date";
import { useStoresQuery } from "@/hooks/queries/useStores";
import type { PromoDraft } from "@/lib/promoDraft";
import type { PromoViewer } from "@/lib/promoList";
import { SingleDatePicker } from "@/components/ui/SingleDatePicker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AMBER, CARD_BG, CARD_BORDER, GREEN, GREEN_SOLID, TEXT_HI, TEXT_MD, inputStyle, tint } from "./promoTokens";

interface PromoWhenFieldsProps {
  draft: PromoDraft;
  onChange: (patch: Partial<PromoDraft>) => void;
  viewer: PromoViewer;
}

const LABEL = "mb-1.5 block text-[15px] font-bold";
const HINT = "text-[14px] font-semibold";
const CHECKBOX_STYLE: React.CSSProperties = { width: 22, height: 22, accentColor: GREEN_SOLID };

const hasAdvancedValues = (draft: PromoDraft): boolean =>
  draft.storeId != null || !draft.allowCash || !draft.allowCard || draft.priority !== "0";

/**
 * Nombre, vigencia y lo avanzado de la promo. Lo de todos los días queda a la
 * vista; tienda, forma de pago y prioridad van en "Más opciones".
 */
export function PromoWhenFields({ draft, onChange, viewer }: PromoWhenFieldsProps) {
  const [withDates, setWithDates] = useState(() => Boolean(draft.startsAt || draft.endsAt));
  const [advancedOpen, setAdvancedOpen] = useState(() => hasAdvancedValues(draft));
  const storesQuery = useStoresQuery({ enabled: viewer.isAdmin });
  const stores: Store[] = storesQuery.data ?? [];

  const chooseAlways = () => { setWithDates(false); onChange({ startsAt: "", endsAt: "" }); };
  const blockedMethod = !draft.allowCash ? "efectivo" : !draft.allowCard ? "tarjeta" : null;

  return (
    <div className="space-y-5">
      <label className="block">
        <span className={LABEL} style={{ color: TEXT_HI }}>Nombre de la promo</span>
        <input
          value={draft.name}
          onChange={event => onChange({ name: event.target.value })}
          maxLength={100}
          placeholder="Por ejemplo: 2x1 en Mangas"
          style={inputStyle}
          data-testid="promo-name-input"
        />
        <span className={`${HINT} mt-1.5 block`} style={{ color: TEXT_MD }}>Solo sirve para reconocerla en la lista.</span>
      </label>

      <fieldset>
        <legend className={LABEL} style={{ color: TEXT_HI }}>¿Cuándo aplica?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { key: false, title: "Desde hoy, sin fecha de fin", description: "Dura hasta que la pauses o la borres", onPick: chooseAlways },
            { key: true, title: "Elegir fechas", description: "Tú dices cuándo empieza y cuándo termina", onPick: () => setWithDates(true) },
          ]).map(option => {
            const active = withDates === option.key;
            return (
              <button
                key={String(option.key)}
                type="button"
                aria-pressed={active}
                onClick={option.onPick}
                className="min-h-16 rounded-2xl px-4 py-3 text-left"
                style={active ? { ...tint(GREEN), cursor: "pointer" } : { background: CARD_BG, border: CARD_BORDER, cursor: "pointer" }}
              >
                <span className="block text-[16px] font-extrabold" style={{ color: active ? GREEN : TEXT_HI }}>{option.title}</span>
                <span className={`${HINT} block`} style={{ color: TEXT_MD }}>{option.description}</span>
              </button>
            );
          })}
        </div>
        {withDates && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <span className={LABEL} style={{ color: TEXT_HI }}>Empieza</span>
              <SingleDatePicker
                value={draft.startsAt}
                onChange={startsAt => onChange(draft.endsAt && startsAt > draft.endsAt ? { startsAt, endsAt: "" } : { startsAt })}
                onClear={() => onChange({ startsAt: "" })}
                minValue={getTodayLocal()}
                placeholder="Hoy mismo"
                ariaLabel="Fecha en que empieza la promoción"
              />
            </div>
            <div>
              <span className={LABEL} style={{ color: TEXT_HI }}>Termina</span>
              <SingleDatePicker
                value={draft.endsAt}
                onChange={endsAt => onChange({ endsAt })}
                onClear={() => onChange({ endsAt: "" })}
                minValue={draft.startsAt || getTodayLocal()}
                placeholder="Sin fecha de fin"
                ariaLabel="Fecha en que termina la promoción"
              />
            </div>
          </div>
        )}
      </fieldset>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-4 text-left text-[15px] font-bold"
          style={{ background: CARD_BG, border: CARD_BORDER, color: TEXT_HI, cursor: "pointer" }}
        >
          <span>Más opciones <span className="font-semibold" style={{ color: TEXT_MD }}>(tienda, forma de pago)</span></span>
          <ChevronDown size={18} aria-hidden style={{ transform: advancedOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-5 px-1 pt-4">
          <div>
            <span className={LABEL} style={{ color: TEXT_HI }}>¿En qué tienda aplica?</span>
            {viewer.isAdmin ? (
              <select
                value={draft.storeId ?? ""}
                onChange={event => onChange({ storeId: event.target.value ? Number(event.target.value) : null })}
                style={inputStyle}
                aria-label="Tienda donde aplica la promoción"
                data-testid="promo-store-select"
              >
                <option value="">Todas las tiendas</option>
                {stores.map(store => <option key={store.id} value={store.id}>Solo {store.name}</option>)}
              </select>
            ) : (
              <p className={HINT} style={{ color: TEXT_MD }}>Solo en tu tienda.</p>
            )}
          </div>

          <fieldset>
            <legend className={LABEL} style={{ color: TEXT_HI }}>¿Con qué se puede pagar?</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {([
                { label: "Efectivo", checked: draft.allowCash, patch: (allowCash: boolean) => ({ allowCash }) },
                { label: "Tarjeta", checked: draft.allowCard, patch: (allowCard: boolean) => ({ allowCard }) },
              ]).map(option => (
                <label key={option.label} className="flex min-h-11 cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={option.checked}
                    onChange={event => onChange(option.patch(event.target.checked))}
                    style={CHECKBOX_STYLE}
                  />
                  <span className="text-[16px] font-bold" style={{ color: TEXT_HI }}>{option.label}</span>
                </label>
              ))}
            </div>
            {blockedMethod && draft.allowCash !== draft.allowCard && (
              <p className={`${HINT} mt-2 rounded-xl px-3 py-2`} style={{ ...tint(AMBER), color: TEXT_HI }}>
                Con esta promo la venta no se podrá cobrar con {blockedMethod}. El cajero podrá cobrar sin la promo.
              </p>
            )}
          </fieldset>

          <label className="block">
            <span className={LABEL} style={{ color: TEXT_HI }}>Prioridad</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.priority}
              onChange={event => onChange({ priority: event.target.value })}
              style={{ ...inputStyle, maxWidth: 140 }}
            />
            <span className={`${HINT} mt-1.5 block`} style={{ color: TEXT_MD }}>
              Casi siempre se queda en 0. Solo sirve si un producto tiene dos promos a la vez y las dos ahorran lo mismo: gana el número más alto.
            </span>
          </label>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
