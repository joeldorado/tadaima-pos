import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ScanBarcode, Search } from "lucide-react";
import type { ProductLight } from "@tadaima/api";
import { addMany, filterProductsByText, resolveEnterPick, type EnterPickKind } from "@/lib/promoProductPicker";
import { PromoButton } from "./PromoButton";
import { AMBER, CARD_BORDER, GREEN, TEXT_LO, TEXT_MD, inputStyle } from "./promoTokens";

interface PickerSearchPaneProps {
  products: readonly ProductLight[];
  selected: ReadonlySet<number>;
  locked: ReadonlySet<number>;
  onChange: (next: Set<number>) => void;
  /** Pinta las filas de producto (paginadas por el padre). */
  renderRows: (ids: readonly number[]) => ReactNode;
  /** La búsqueda vive en el padre para no perderla al cambiar de pestaña. */
  query: string;
  onQueryChange: (next: string) => void;
}

interface ScanFeedback {
  kind: EnterPickKind;
  text: string;
}

function feedbackText(kind: EnterPickKind, query: string, name: string | undefined, matchCount: number): string {
  switch (kind) {
    case "ambiguous": return `Hay ${matchCount.toLocaleString("es-MX")} productos con "${query.trim()}". Marca los que quieres o escribe más.`;
    case "added": return `Agregado: ${name}`;
    case "already": return `Ya estaba elegido: ${name}`;
    case "locked": return `Ya está en la promo: ${name}`;
    case "not_found": return `No encontramos "${query.trim()}". Revisa el código o escribe más del nombre.`;
  }
}

/**
 * Pestaña "Elegir productos": buscar y marcar productos sueltos. Enter (o el
 * lector de código, que manda Enter al final) agrega el producto de ese código
 * y limpia el buscador para escanear el siguiente.
 */
export function PickerSearchPane({ products, selected, locked, onChange, renderRows, query, onQueryChange }: PickerSearchPaneProps) {
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPointer = useRef<string>("mouse");

  const matches = useMemo(
    () => filterProductsByText(products, query).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [products, query],
  );
  const selectableMatches = useMemo(() => matches.filter(product => !locked.has(product.id)), [matches, locked]);


  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    // El Enter del lector no debe enviar ningún formulario de alrededor.
    event.preventDefault();
    // Se lee del input y no del estado: el lector teclea más rápido que un render.
    const typed = event.currentTarget.value;
    const result = resolveEnterPick(products, typed, selected, locked);
    if (!result) return;
    setFeedback({ kind: result.kind, text: feedbackText(result.kind, typed, result.product?.name, result.matchCount) });
    if (result.kind === "ambiguous") return;
    if (result.kind === "not_found") {
      // Queda seleccionado: el siguiente escaneo lo reemplaza en vez de pegarse.
      event.currentTarget.select();
      return;
    }
    if (result.kind === "added") onChange(new Set(result.selected));
    onQueryChange("");
  };

  const feedbackColor = feedback?.kind === "added" ? GREEN : feedback?.kind === "not_found" ? AMBER : TEXT_MD;


  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={18} aria-hidden style={{ position: "absolute", left: 14, top: 15, color: TEXT_LO }} />
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={event => { setFeedback(null); onQueryChange(event.target.value); }}
          onKeyDown={onKeyDown}
          placeholder="Nombre o código del producto"
          aria-label="Buscar producto por nombre o código, o escanear su código"
          enterKeyHint="done"
          style={{ ...inputStyle, paddingLeft: 42 }}
          data-testid="assign-search-input"
        />
      </div>
      <p
        className="flex min-h-6 items-center gap-2 text-[14px] font-bold"
        style={{ color: feedback ? feedbackColor : TEXT_MD }}
        aria-live="polite"
        data-testid="picker-scan-feedback"
      >
        {feedback ? feedback.text : (
          <>
            <ScanBarcode size={16} aria-hidden /> Marca los productos que entran. Con el lector se agregan solos.
          </>
        )}
      </p>
      {query.trim() !== "" && selectableMatches.length > 1 && (
        <PromoButton
          variant="accent"
          onClick={() => onChange(addMany(selected, selectableMatches.map(product => product.id), locked))}
        >
          Elegir los {selectableMatches.length.toLocaleString("es-MX")} que coinciden
        </PromoButton>
      )}
      {matches.length === 0 ? (
        <p className="py-8 text-center text-[15px] font-semibold" style={{ color: TEXT_MD }}>
          No encontramos productos con "{query.trim()}".
        </p>
      ) : (
        // Con mouse (caja con lector), tras marcar una fila el foco regresa al
        // buscador para no perder el siguiente escaneo. En touch no: abriría el
        // teclado en cada toque. Va después del frame porque el clic en la
        // etiqueta enfoca la casilla al final.
        <div
          className="overflow-hidden rounded-2xl"
          style={{ border: CARD_BORDER }}
          onPointerDown={event => { lastPointer.current = event.pointerType; }}
          onClick={() => {
            if (lastPointer.current === "touch") return;
            requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
          }}
        >
          <div style={{ marginTop: -1 }}>{renderRows(matches.map(product => product.id))}</div>
        </div>
      )}
    </div>
  );
}
