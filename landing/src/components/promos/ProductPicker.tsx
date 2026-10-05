import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { CheckSquare, LayoutGrid, Loader2, Search } from "lucide-react";
import type { ProductLight } from "@tadaima/api";
import type { PickableCategory } from "@/lib/categoryPicker";
import {
  bucketSelectionState, buildCategoryBuckets, selectedProducts, toggleBucket, toggleProduct, type CategoryKey,
} from "@/lib/promoProductPicker";
import { PickerChosenPane } from "./PickerChosenPane";
import { PickerSearchPane } from "./PickerSearchPane";
import { PickerCategoryRow, PickerProductRow } from "./ProductPickerRows";
import { PromoButton } from "./PromoButton";
import { CARD_BG, CARD_BORDER, GREEN, POPUP_BG, TEXT_HI, TEXT_MD, tint } from "./promoTokens";

type Mode = "buscar" | "categoria" | "elegidos";

interface ProductPickerProps {
  /** Productos activos que se pueden elegir. */
  products: readonly ProductLight[];
  categories: readonly PickableCategory[];
  selected: ReadonlySet<number>;
  /** Ya están en la promo: se ven marcados y no se tocan. */
  locked: ReadonlySet<number>;
  onChange: (next: Set<number>) => void;
  loading?: boolean;
}

/** Filas que se pintan de golpe; el resto entra con "Mostrar más". */
const PAGE_SIZE = 60;

const MODES: ReadonlyArray<{ key: Mode; label: string; icon: typeof Search }> = [
  { key: "buscar", label: "Elegir productos", icon: Search },
  { key: "categoria", label: "Categoría completa", icon: LayoutGrid },
  { key: "elegidos", label: "Elegidos", icon: CheckSquare },
];

/**
 * Selector de productos de una promo (paso 2 del asistente y "Agregar
 * productos"). Tres pestañas: elegir productos sueltos (buscar o escanear),
 * tomar una categoría completa de un toque, y revisar los elegidos.
 * Controlado: la selección vive en el padre.
 */
export function ProductPicker({ products, categories, selected, locked, onChange, loading = false }: ProductPickerProps) {
  const [mode, setMode] = useState<Mode>("buscar");
  const [openKey, setOpenKey] = useState<CategoryKey | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [query, setQuery] = useState("");
  // Foto de los elegidos al abrir la pestaña: destildar no esconde la fila,
  // así el usuario puede volver a marcarla si se equivocó.
  const [chosenIds, setChosenIds] = useState<readonly number[]>([]);

  const idPrefix = useId();
  const tabId = (key: Mode) => `${idPrefix}-tab-${key}`;
  const panelId = `${idPrefix}-panel`;

  // Flechas izquierda/derecha entre pestañas (patrón ARIA de tabs).
  const onTabsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = MODES.findIndex(item => item.key === mode);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = MODES[(index + step + MODES.length) % MODES.length]!.key;
    switchMode(next);
    document.getElementById(tabId(next))?.focus();
  };

  const productsById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const buckets = useMemo(() => buildCategoryBuckets(products, categories), [products, categories]);

  const switchMode = (next: Mode) => {
    if (next === "elegidos") setChosenIds(selectedProducts(productsById, selected).map(product => product.id));
    setMode(next);
    setLimit(PAGE_SIZE);
  };
  const toggleOpen = (key: CategoryKey) => { setOpenKey(current => (current === key ? null : key)); setLimit(PAGE_SIZE); };

  const showMore = (remaining: number) => (
    <div className="p-3 text-center" style={{ borderTop: CARD_BORDER }}>
      <PromoButton onClick={() => setLimit(current => current + PAGE_SIZE)}>
        Mostrar {Math.min(PAGE_SIZE, remaining)} más (quedan {remaining.toLocaleString("es-MX")})
      </PromoButton>
    </div>
  );

  const productRows = (ids: readonly number[]) => (
    <>
      {ids.slice(0, limit).map(id => {
        const product = productsById.get(id);
        return product ? (
          <PickerProductRow
            key={id}
            product={product}
            checked={selected.has(id)}
            locked={locked.has(id)}
            onToggle={() => onChange(toggleProduct(selected, id))}
          />
        ) : null;
      })}
      {ids.length > limit && showMore(ids.length - limit)}
    </>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-[15px] font-semibold" style={{ color: TEXT_MD }}>
        <Loader2 size={20} className="animate-spin" aria-hidden /> Cargando productos…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Cómo elegir los productos" onKeyDown={onTabsKeyDown}>
        {MODES.map(({ key, label, icon: Icon }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={tabId(key)}
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => switchMode(key)}
              className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-center text-[14px] font-extrabold leading-tight sm:flex-row sm:gap-2 sm:text-[15px]"
              style={active ? tint(GREEN) : { background: CARD_BG, border: CARD_BORDER, color: TEXT_MD, cursor: "pointer" }}
              data-testid={`picker-mode-${key}`}
            >
              <Icon size={18} aria-hidden />
              <span>{key === "elegidos" ? `${label} (${selected.size.toLocaleString("es-MX")})` : label}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(mode)}>
        {mode === "buscar" && (
          <PickerSearchPane
            products={products}
            selected={selected}
            locked={locked}
            onChange={onChange}
            renderRows={productRows}
            query={query}
            onQueryChange={next => { setQuery(next); setLimit(PAGE_SIZE); }}
          />
        )}

        {mode === "categoria" && (
          <div className="space-y-2">
            <p className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>
              Marca la casilla para elegir <b>todos</b> los productos de la categoría. Con "Ver productos" puedes quitar los que no entran.
            </p>
            {buckets.length === 0 && (
              <p className="py-8 text-center text-[15px] font-semibold" style={{ color: TEXT_MD }}>No hay productos para elegir.</p>
            )}
            {buckets.map(bucket => {
              const selectable = bucket.productIds.filter(id => !locked.has(id));
              return (
                <PickerCategoryRow
                  key={bucket.key}
                  name={bucket.name}
                  total={bucket.productIds.length}
                  chosen={selectable.filter(id => selected.has(id)).length}
                  state={bucketSelectionState(bucket, selected, locked)}
                  allLocked={selectable.length === 0}
                  open={openKey === bucket.key}
                  onToggleAll={() => onChange(toggleBucket(selected, bucket, locked))}
                  onToggleOpen={() => toggleOpen(bucket.key)}
                >
                  {productRows(bucket.productIds)}
                </PickerCategoryRow>
              );
            })}
          </div>
        )}

        {mode === "elegidos" && <PickerChosenPane ids={chosenIds} renderRows={productRows} />}
      </div>

      <div
        className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3"
        style={{ background: POPUP_BG, border: CARD_BORDER, boxShadow: "0 -10px 18px -8px rgba(0,0,0,0.45)" }}
        aria-live="polite"
      >
        <p className="text-[16px] font-extrabold" style={{ color: selected.size > 0 ? GREEN : TEXT_HI }} data-testid="picker-selected-count">
          {selected.size === 0
            ? "Ningún producto elegido"
            : `${selected.size.toLocaleString("es-MX")} producto${selected.size === 1 ? "" : "s"} elegido${selected.size === 1 ? "" : "s"}`}
        </p>
        {selected.size > 0 && (
          <div className="flex items-center gap-1">
            {mode !== "elegidos" && (
              <PromoButton onClick={() => switchMode("elegidos")} data-testid="picker-view-chosen">
                Ver elegidos
              </PromoButton>
            )}
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="min-h-11 rounded-xl px-3 text-[14px] font-bold underline"
              style={{ color: TEXT_MD, cursor: "pointer" }}
            >
              Quitar todos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
