import { useMemo, useState } from "react";
import { LayoutGrid, Loader2, Search } from "lucide-react";
import type { ProductLight } from "@tadaima/api";
import type { PickableCategory } from "@/lib/categoryPicker";
import {
  addMany, bucketSelectionState, buildCategoryBuckets, filterProductsByText,
  toggleBucket, toggleProduct, type CategoryKey,
} from "@/lib/promoProductPicker";
import { PickerCategoryRow, PickerProductRow } from "./ProductPickerRows";
import { PromoButton } from "./PromoButton";
import { CARD_BG, CARD_BORDER, GREEN, POPUP_BG, TEXT_HI, TEXT_LO, TEXT_MD, inputStyle, tint } from "./promoTokens";

type Mode = "categoria" | "buscar";

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
  { key: "categoria", label: "Por categoría", icon: LayoutGrid },
  { key: "buscar", label: "Buscar producto", icon: Search },
];

/**
 * Selector de productos de una promo (paso 2 del asistente y "Agregar
 * productos"). Dos caminos: elegir una categoría completa de un toque, o
 * buscar productos sueltos. Controlado: la selección vive en el padre.
 */
export function ProductPicker({ products, categories, selected, locked, onChange, loading = false }: ProductPickerProps) {
  const [mode, setMode] = useState<Mode>("categoria");
  const [openKey, setOpenKey] = useState<CategoryKey | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const productsById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const buckets = useMemo(() => buildCategoryBuckets(products, categories), [products, categories]);
  const matches = useMemo(
    () => filterProductsByText(products, query).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [products, query],
  );
  const selectableMatches = useMemo(() => matches.filter(product => !locked.has(product.id)), [matches, locked]);

  const switchMode = (next: Mode) => { setMode(next); setLimit(PAGE_SIZE); };
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
      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Cómo elegir los productos">
        {MODES.map(({ key, label, icon: Icon }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchMode(key)}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-[15px] font-extrabold"
              style={active ? tint(GREEN) : { background: CARD_BG, border: CARD_BORDER, color: TEXT_MD, cursor: "pointer" }}
              data-testid={`picker-mode-${key}`}
            >
              <Icon size={18} aria-hidden /> {label}
            </button>
          );
        })}
      </div>

      {mode === "categoria" ? (
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
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search size={18} aria-hidden style={{ position: "absolute", left: 14, top: 15, color: TEXT_LO }} />
            <input
              autoFocus
              value={query}
              onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }}
              placeholder="Escribe el nombre o el código del producto"
              aria-label="Buscar producto por nombre o código"
              style={{ ...inputStyle, paddingLeft: 42 }}
              data-testid="assign-search-input"
            />
          </div>
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
            <div className="overflow-hidden rounded-2xl" style={{ border: CARD_BORDER }}>
              <div style={{ marginTop: -1 }}>{productRows(matches.map(product => product.id))}</div>
            </div>
          )}
        </div>
      )}

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
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="min-h-11 rounded-xl px-3 text-[14px] font-bold underline"
            style={{ color: TEXT_MD, cursor: "pointer" }}
          >
            Quitar todos
          </button>
        )}
      </div>
    </div>
  );
}
