import type { ReactNode } from "react";
import { CARD_BORDER, TEXT_MD } from "./promoTokens";

interface PickerChosenPaneProps {
  /** Ids de los elegidos, ya en orden A-Z. */
  ids: readonly number[];
  renderRows: (ids: readonly number[]) => ReactNode;
}

/** Pestaña "Elegidos": revisar lo que va a entrar a la promo; destildar = quitar. */
export function PickerChosenPane({ ids, renderRows }: PickerChosenPaneProps) {
  if (ids.length === 0) {
    return (
      <p className="py-10 text-center text-[15px] font-semibold" style={{ color: TEXT_MD }} data-testid="picker-chosen-empty">
        Todavía no eliges productos. Búscalos en "Elegir productos" o toma una categoría completa.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>
        Estos son los productos que van a entrar a la promo. Quita la palomita a los que no van.
      </p>
      <div className="overflow-hidden rounded-2xl" style={{ border: CARD_BORDER }} data-testid="picker-chosen-list">
        <div style={{ marginTop: -1 }}>{renderRows(ids)}</div>
      </div>
    </div>
  );
}
