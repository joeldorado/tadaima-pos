import { Store as StoreIcon } from "lucide-react";
import type { Store } from "@tadaima/api";
import { GREEN, TEXT_HI, inputStyle, tint } from "@/components/promos/promoTokens";

interface StoreSelectProps {
  stores: readonly Store[];
  value: number | null;
  onChange: (storeId: number | null) => void;
  /** Texto de la opción "sin tienda" (null). Si se omite, no hay opción nula. */
  allLabel?: string;
  /** Texto extra por tienda (p. ej. "— puedes armar 3"). */
  optionSuffix?: (store: Store) => string;
  ariaLabel: string;
  disabled?: boolean;
}

/** Select de tienda para el admin (`inputStyle` de Promos, 48 px de alto). */
export function StoreSelect({ stores, value, onChange, allLabel, optionSuffix, ariaLabel, disabled = false }: StoreSelectProps) {
  return (
    <select
      value={value ?? ""}
      onChange={event => onChange(event.target.value === "" ? null : Number(event.target.value))}
      aria-label={ariaLabel}
      disabled={disabled}
      style={{ ...inputStyle, width: "auto", minWidth: 200, paddingRight: 36, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      {allLabel !== undefined
        ? <option value="">{allLabel}</option>
        : value == null && <option value="" disabled>Elige una tienda</option>}
      {stores.map(store => (
        <option key={store.id} value={store.id}>
          {store.name}{optionSuffix ? ` ${optionSuffix(store)}` : ""}
        </option>
      ))}
    </select>
  );
}

/** Pill fija "Tienda: X" para gerente/cajero (no eligen tienda). */
export function StorePill({ name }: { name: string }) {
  return (
    <span className="inline-flex min-h-12 items-center gap-2 rounded-2xl px-4 text-[15px] font-extrabold" style={{ ...tint(GREEN), color: TEXT_HI }}>
      <StoreIcon size={18} aria-hidden style={{ color: GREEN }} /> Tienda: {name}
    </span>
  );
}
