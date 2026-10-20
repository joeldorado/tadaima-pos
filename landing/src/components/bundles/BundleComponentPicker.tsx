import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ScanBarcode, Search } from "lucide-react";
import { getProductsLight, type BundleStoreAvailability, type ProductLight } from "@tadaima/api";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useCategoriesQuery } from "@/hooks/queries/useCategories";
import { useBundlePickerPoolQuery } from "@/hooks/queries/useBundles";
import { queryKeys } from "@/lib/queryKeys";
import {
  MAX_QTY, addComponent, componentsSentence, removeComponent, setQuantity, toggleComponent, type BundleDraftComponent,
} from "@/lib/bundleDraft";
import { buildableSummary } from "@/lib/bundleMath";
import { filterPickerPool, isPickable, pickerDisplayName, type PickerCategoryFilter } from "@/lib/bundlePicker";
import { findScannedProduct } from "@/lib/promoProductPicker";
import { looksLikeProductCode } from "@/lib/scanGuards";
import { AMBER, CARD_BG, CARD_BORDER, GREEN, POPUP_BG, TEXT_HI, TEXT_LO, TEXT_MD, fmtMoney, inputStyle, tint } from "@/components/promos/promoTokens";
import { BuildablePill } from "./BundleAvailability";
import { BundleChosenList } from "./BundleChosenList";
import { BundleProductTable } from "./BundleProductTable";
import { pluralize } from "./bundleTokens";

export type ComponentsUpdater = (prev: readonly BundleDraftComponent[]) => BundleDraftComponent[];

interface BundleComponentPickerProps {
  components: readonly BundleDraftComponent[];
  /** Recibe un updater (no el arreglo): dos escaneos seguidos no se pisan. */
  onChange: (updater: ComponentsUpdater) => void;
  storeId: number | null;
  storeName: string | null;
  /** Disponibilidad del server para la tienda elegida (o todas, admin). */
  availability: readonly BundleStoreAvailability[];
  previewLoading: boolean;
  previewError: boolean;
  /** Estimación local (stock de la tabla) mientras no hay preview. */
  clientMax: number | null;
  scannerEnabled: boolean;
}

interface Feedback { kind: "added" | "more" | "removed" | "ambiguous" | "not_found"; text: string }

const SEARCH_PER_PAGE = 20;

/**
 * Paso 1 del asistente, en dos zonas: arriba la TABLA para elegir productos
 * (buscar, filtrar por categoría, marcar con el check o escanear) y abajo
 * "Cada paquete lleva", donde se dice cuántas PIEZAS de cada uno lleva un
 * paquete. Cuántos paquetes armar se decide en el paso 3.
 */
export function BundleComponentPicker({
  components, onChange, storeId, storeName, availability, previewLoading, previewError, clientMax, scannerEnabled,
}: BundleComponentPickerProps) {
  const queryClient = useQueryClient();
  const hasStore = storeId != null;
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<PickerCategoryFilter>(null);
  const [inStockOnly, setInStockOnly] = useState(hasStore);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const componentsRef = useRef(components);
  useEffect(() => { componentsRef.current = components; }, [components]);
  const queryRef = useRef(query);
  useEffect(() => { queryRef.current = query; }, [query]);

  const poolQuery = useBundlePickerPoolQuery(storeId, { inStockOnly: hasStore && inStockOnly });
  const categoriesQuery = useCategoriesQuery();
  const pool = useMemo(() => (poolQuery.data ?? []).filter(isPickable), [poolQuery.data]);
  const categories = useMemo(
    () => (categoriesQuery.data ?? []).filter(c => c.active !== false).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [categoriesQuery.data],
  );
  const rows = useMemo(() => filterPickerPool(pool, { query, categoryId, hasStore }), [pool, query, categoryId, hasStore]);
  const chosenIds = useMemo(() => new Set(components.map(c => c.productId)), [components]);

  const toggle = (product: ProductLight) => {
    const name = pickerDisplayName(product);
    const was = componentsRef.current.some(c => c.productId === product.id);
    onChange(prev => toggleComponent(prev, product, hasStore));
    setFeedback(was ? { kind: "removed", text: `Quitado: ${name}` } : { kind: "added", text: `Agregado: ${name} (1 pieza por paquete)` });
  };
  const addScanned = (product: ProductLight) => {
    const name = pickerDisplayName(product);
    const existing = componentsRef.current.find(c => c.productId === product.id);
    onChange(prev => addComponent(prev, product, hasStore));
    setFeedback(existing
      ? { kind: "more", text: `+1 pieza a ${name}: ahora lleva ×${Math.min(MAX_QTY, existing.quantity + 1)} por paquete` }
      : { kind: "added", text: `Agregado: ${name} (1 pieza por paquete)` });
  };

  /**
   * Enter / lector: primero busca el código en la tabla (instantáneo); si no está
   * (p. ej. sin stock con el filtro puesto) pregunta al server. El campo se limpia
   * ANTES de esperar para que el siguiente escaneo no se pegue.
   */
  const resolveCode = async (typed: string) => {
    const term = typed.trim();
    if (term.length < 2) return;
    setQuery("");
    const local = findScannedProduct(pool, term);
    if (local) { addScanned(local); return; }
    const byName = !looksLikeProductCode(term) ? filterPickerPool(pool, { query: term, categoryId: null, hasStore }) : [];
    if (byName.length === 1 && byName[0]) { addScanned(byName[0]); return; }
    if (byName.length > 1) {
      setFeedback({ kind: "ambiguous", text: `Hay ${byName.length.toLocaleString("es-MX")} productos con "${term}". Marca el que quieres en la tabla.` });
      if (queryRef.current === "") setQuery(term);
      return;
    }
    try {
      const page = await queryClient.fetchQuery({
        queryKey: [...queryKeys.products.all, "light", "search", term, storeId ?? null],
        queryFn: () => getProductsLight({
          search: term, per_page: SEARCH_PER_PAGE, active: true,
          ...(storeId ? { store_id: storeId, include_unassigned: true } : {}),
        } as Parameters<typeof getProductsLight>[0]),
        staleTime: 60_000,
      });
      const found = (page.data ?? []).filter(isPickable);
      const exact = findScannedProduct(found, term) ?? (!looksLikeProductCode(term) && found.length === 1 ? found[0] : undefined);
      if (exact) { addScanned(exact); return; }
      setFeedback({ kind: "not_found", text: `No encontramos "${term}". Revisa el código o escribe más del nombre.` });
      if (queryRef.current === "") { setQuery(term); inputRef.current?.select(); }
    } catch {
      setFeedback({ kind: "not_found", text: "No se pudo buscar. Revisa tu conexión." });
    }
  };

  useBarcodeScanner({ onScan: code => { void resolveCode(code); }, enabled: scannerEnabled });
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void resolveCode(event.currentTarget.value);
  };

  const pieces = components.reduce((acc, c) => acc + c.quantity, 0);
  const sum = components.reduce((acc, c) => acc + c.unitPrice * c.quantity, 0);
  const storeRow = storeId != null ? availability.find(r => r.store_id === storeId) ?? null : null;
  const feedbackColor = feedback?.kind === "added" || feedback?.kind === "more" ? GREEN : feedback?.kind === "not_found" ? AMBER : TEXT_MD;

  const buildable = (() => {
    if (components.length === 0) return null;
    if (storeId == null) {
      if (availability.length > 0) return <span className="text-[14px] font-bold" style={{ color: TEXT_HI }}>Con el stock de hoy: {buildableSummary(availability)}</span>;
      if (previewLoading) return <span className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>Calculando cuántos puedes armar…</span>;
      return <span className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>Elige una tienda para ver cuántos puedes armar.</span>;
    }
    const max = storeRow ? storeRow.max_buildable : clientMax;
    if (max == null) return <span className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>Calculando cuántos puedes armar…</span>;
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-bold" style={{ color: TEXT_HI }}>Con el stock de hoy:</span>
        <BuildablePill max={max} {...(storeName ? { storeName } : {})} />
        {!storeRow && <span className="text-[12px] font-semibold" style={{ color: TEXT_MD }}>{previewError ? "(estimado, sin servidor)" : "(estimado)"}</span>}
      </span>
    );
  })();

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-[16px] font-black" style={{ color: TEXT_HI }}>1. Elige los productos</h3>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={18} aria-hidden style={{ position: "absolute", left: 14, top: 15, color: TEXT_LO }} />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={event => { setFeedback(null); setQuery(event.target.value); }}
              onKeyDown={onKeyDown}
              placeholder="Buscar por nombre o código. Escanea para agregar."
              aria-label="Buscar producto por nombre o código, o escanear su código"
              enterKeyHint="done"
              data-scan-target="product"
              style={{ ...inputStyle, paddingLeft: 42 }}
              data-testid="bundle-search-input"
            />
          </div>
          <select
            value={categoryId === null ? "" : String(categoryId)}
            onChange={event => setCategoryId(event.target.value === "" ? null : event.target.value === "none" ? "none" : Number(event.target.value))}
            aria-label="Filtrar por categoría"
            style={{ ...inputStyle, width: "auto", minWidth: 180, paddingRight: 36, cursor: "pointer" }}
          >
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="none">Sin categoría</option>
          </select>
          {hasStore && (
            <button
              type="button"
              onClick={() => setInStockOnly(current => !current)}
              aria-pressed={inStockOnly}
              className="inline-flex min-h-12 items-center gap-2 rounded-2xl px-4 text-[14px] font-extrabold"
              style={inStockOnly ? tint(GREEN) : { background: CARD_BG, border: CARD_BORDER, color: TEXT_MD, cursor: "pointer" }}
              data-testid="bundle-pool-stock-toggle"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: inStockOnly ? GREEN : TEXT_LO }} aria-hidden />
              Solo con stock{storeName ? ` en ${storeName}` : ""}
            </button>
          )}
        </div>
        <p className="flex min-h-6 flex-wrap items-center gap-2 text-[14px] font-bold" style={{ color: feedback ? feedbackColor : TEXT_MD }} aria-live="polite" data-testid="bundle-scan-feedback">
          {feedback ? feedback.text : (<><ScanBarcode size={16} aria-hidden /> Marca el check de cada producto que lleva el paquete, o escanea con el lector.</>)}
          <span className="ml-auto text-[13px] font-semibold" style={{ color: TEXT_MD }}>
            {poolQuery.isFetching && pool.length > 0 ? "Actualizando… · " : ""}
            {rows.length.toLocaleString("es-MX")} {rows.length === 1 ? "producto" : "productos"} · Elegidos: {components.length.toLocaleString("es-MX")}
          </span>
        </p>
        <BundleProductTable
          rows={rows}
          chosenIds={chosenIds}
          hasStore={hasStore}
          loading={poolQuery.isLoading}
          error={poolQuery.isError}
          query={query}
          inStockOnly={hasStore && inStockOnly}
          onToggle={toggle}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-[16px] font-black" style={{ color: TEXT_HI }}>2. Cada paquete lleva ({components.length.toLocaleString("es-MX")})</h3>
        <p className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>Indica cuántas piezas de cada producto lleva UN paquete.</p>
        <BundleChosenList
          components={components}
          availability={storeRow}
          storeName={storeName}
          onQuantity={(id, qty) => onChange(prev => setQuantity(prev, id, qty))}
          onRemove={id => onChange(prev => removeComponent(prev, id))}
        />
      </section>

      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3"
        style={{ background: POPUP_BG, border: CARD_BORDER }}
        aria-live="polite"
        data-testid="bundle-picker-footer"
      >
        <div className="min-w-0">
          <p className="text-[15px] font-extrabold" style={{ color: components.length > 0 ? TEXT_HI : TEXT_MD }}>
            {components.length === 0 ? "Ningún producto elegido" : `Cada paquete: ${componentsSentence(components)}`}
          </p>
          {components.length > 0 && (
            <p className="text-[13px] font-semibold" style={{ color: TEXT_MD }}>
              {pluralize(components.length, "producto", "productos")} · {pluralize(pieces, "pieza", "piezas")} · Suma: {fmtMoney(sum)} · Cuántos armar lo eliges en el paso 3.
            </p>
          )}
        </div>
        {buildable}
      </div>
    </div>
  );
}
