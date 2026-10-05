import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { getLightPrice, type ProductLight } from "@tadaima/api";
import type { BucketSelectionState } from "@/lib/promoProductPicker";
import { CARD_BORDER, GREEN, GREEN_SOLID, SOFT_BG, TEXT_HI, TEXT_LO, TEXT_MD, fmtMoney } from "./promoTokens";

const CHECKBOX_STYLE: React.CSSProperties = { width: 22, height: 22, accentColor: GREEN_SOLID, flexShrink: 0 };

/** Miniatura cuadrada del producto (o las siglas si no tiene foto). */
export function ProductThumb({ image, size = 44 }: { image: string | null | undefined; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg"
      style={{ width: size, height: size, background: SOFT_BG }}
      aria-hidden
    >
      {image
        ? <img src={image} alt="" loading="lazy" width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: 10, fontWeight: 900, color: TEXT_LO }}>TDM</span>}
    </div>
  );
}

interface PickerProductRowProps {
  product: ProductLight;
  checked: boolean;
  /** Ya está en la promo: se muestra marcado y no se puede cambiar aquí. */
  locked: boolean;
  onToggle: () => void;
}

/** Fila de producto: TODA la fila es la casilla (blanco grande para el dedo). */
export function PickerProductRow({ product, checked, locked, onToggle }: PickerProductRowProps) {
  return (
    <label
      className="flex min-h-14 items-center gap-3 px-3 py-2"
      style={{
        borderTop: CARD_BORDER,
        background: checked && !locked ? `${GREEN}14` : "transparent",
        cursor: locked ? "default" : "pointer",
        opacity: locked ? 0.6 : 1,
      }}
      data-testid={`assign-row-${product.id}`}
    >
      <input
        type="checkbox"
        checked={checked || locked}
        disabled={locked}
        onChange={onToggle}
        style={CHECKBOX_STYLE}
      />
      <ProductThumb image={product.image} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold" style={{ color: TEXT_HI }}>{product.name}</span>
        <span className="block text-[14px] font-semibold" style={{ color: TEXT_MD }}>
          {locked ? "Ya está en la promo" : product.sku ? `Código ${product.sku}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-[15px] font-bold tabular-nums" style={{ color: TEXT_MD }}>
        {fmtMoney(getLightPrice(product, 1))}
      </span>
    </label>
  );
}

interface PickerCategoryRowProps {
  name: string;
  total: number;
  chosen: number;
  state: BucketSelectionState;
  /** Todos sus productos ya están en la promo: nada que elegir. */
  allLocked: boolean;
  open: boolean;
  onToggleAll: () => void;
  onToggleOpen: () => void;
  children?: ReactNode;
}

/** Categoría: la casilla elige TODOS sus productos; "Ver productos" la abre para afinar. */
export function PickerCategoryRow({
  name, total, chosen, state, allLocked, open, onToggleAll, onToggleOpen, children,
}: PickerCategoryRowProps) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = state === "some";
  }, [state]);

  const detail = allLocked
    ? "Ya están todos en la promo"
    : `${total.toLocaleString("es-MX")} producto${total === 1 ? "" : "s"}${chosen > 0 ? ` · ${chosen.toLocaleString("es-MX")} elegido${chosen === 1 ? "" : "s"}` : ""}`;

  return (
    <div className="overflow-hidden rounded-2xl" style={{ border: CARD_BORDER, background: chosen > 0 ? `${GREEN}0F` : "transparent" }}>
      <div className="flex items-center gap-2 pr-2">
        <label className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-3 py-2" style={{ cursor: allLocked ? "default" : "pointer" }}>
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={!allLocked && state === "all"}
            disabled={allLocked}
            onChange={onToggleAll}
            style={CHECKBOX_STYLE}
            aria-label={`Elegir toda la categoría ${name}`}
          />
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-extrabold" style={{ color: TEXT_HI }}>{name}</span>
            <span className="block text-[14px] font-semibold" style={{ color: chosen > 0 ? GREEN : TEXT_MD }}>{detail}</span>
          </span>
        </label>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[14px] font-bold hover:bg-white/10"
          style={{ color: TEXT_MD, cursor: "pointer" }}
        >
          {open ? "Ocultar" : "Ver productos"}
          <ChevronDown size={16} aria-hidden style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
        </button>
      </div>
      {open && children}
    </div>
  );
}
