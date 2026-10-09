import { useState } from "react";
import { PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { assembleBundle, type Bundle, type BundleComponentAvailability, type BundleSource, type Store } from "@tadaima/api";
import { useBundleCache, type BundleViewer } from "@/hooks/queries/useBundles";
import { assembleErrorText } from "@/lib/bundleDraft";
import { availabilityFor, maxBuildableWithSources, type BundleLine } from "@/lib/bundleMath";
import { PromoButton } from "@/components/promos/PromoButton";
import { PromoDialog } from "@/components/promos/PromoDialog";
import { AMBER, RED_SOFT, TEXT_HI, TEXT_MD, inputStyle } from "@/components/promos/promoTokens";
import { ComponentUsageRow } from "./ComponentUsageRow";
import { QtyStepper } from "./QtyStepper";
import { StorePill } from "./StoreSelect";
import { bundlesLabel } from "./bundleTokens";

interface AssembleDialogProps {
  bundle: Bundle;
  stores: readonly Store[];
  viewer: BundleViewer;
  /** Tienda elegida en la página (admin); null = que el modal proponga una. */
  defaultStoreId: number | null;
  onClose: () => void;
  onDone: (fresh: Bundle) => void;
}

const LABEL = "mb-1.5 block text-[15px] font-bold";
const HINT = "mt-1.5 block text-[14px] font-semibold";
const MAX_NOTE = 200;
const STOCK_CHANGED_MARK = "Stock insuficiente";

const n = (value: number): string => value.toLocaleString("es-MX");

/** Stock que cuenta para un componente según de dónde se tome. */
const availableFor = (c: BundleComponentAvailability, source: BundleSource): number =>
  source === "store" ? c.stock_exhibicion : source === "bodega" ? c.stock_bodega : c.stock_exhibicion + c.stock_bodega;

const toLines = (components: readonly BundleComponentAvailability[]): BundleLine[] =>
  components.map(c => ({ productId: c.product_id, quantity: c.quantity }));

const stockMap = (components: readonly BundleComponentAvailability[], pick: (c: BundleComponentAvailability) => number) =>
  new Map(components.map(c => [c.product_id, pick(c)] as const));

/**
 * Armar N paquetes en una tienda. El máximo se calcula aquí con la
 * disponibilidad que mandó el server (y la fuente elegida por componente);
 * el server lo vuelve a validar y responde con el paquete actualizado.
 */
export function AssembleDialog({ bundle, stores, viewer, defaultStoreId, onClose, onDone }: AssembleDialogProps) {
  const { applyFresh, invalidate } = useBundleCache();
  const [storeId, setStoreId] = useState<number | null>(() => {
    if (!viewer.isAdmin) return viewer.storeId;
    const rows = bundle.availability;
    if (defaultStoreId != null && rows.some(r => r.store_id === defaultStoreId)) return defaultStoreId;
    return rows.find(r => r.max_buildable > 0)?.store_id ?? rows[0]?.store_id ?? null;
  });
  const [qty, setQty] = useState(1);
  const [sources, setSources] = useState<ReadonlyMap<number, BundleSource>>(() => new Map());
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [adjusted, setAdjusted] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const av = availabilityFor(bundle, storeId);
  const components = av?.components ?? [];
  const lines = toLines(components);
  const exhMap = stockMap(components, c => c.stock_exhibicion);
  const bodMap = stockMap(components, c => c.stock_bodega);
  const max = maxBuildableWithSources(lines, exhMap, bodMap, sources);
  const storeName = av?.store_name ?? stores.find(s => s.id === storeId)?.name ?? viewer.storeName ?? "la tienda";
  const sourceOf = (c: BundleComponentAvailability): BundleSource => sources.get(c.product_id) ?? "auto";
  const limitingIds = new Set(
    components.filter(c => Math.floor(availableFor(c, sourceOf(c)) / c.quantity) === max).map(c => c.product_id),
  );
  const atMax = max <= 0 || qty >= max;
  const canSubmit = storeId != null && max > 0 && !saving;

  const changeStore = (next: number | null) => {
    setStoreId(next); setSources(new Map()); setQty(1); setAdjusted(null); setError(null);
  };

  const changeSource = (productId: number, source: BundleSource) => {
    const next = new Map(sources);
    if (source === "auto") next.delete(productId); else next.set(productId, source);
    const nextMax = maxBuildableWithSources(lines, exhMap, bodMap, next);
    setSources(next);
    setError(null);
    if (qty > nextMax) {
      setQty(Math.max(nextMax, 1));
      setAdjusted(nextMax >= 1 ? `Se ajustó a ${n(nextMax)}.` : null);
    } else {
      setAdjusted(null);
    }
  };

  const submit = async () => {
    if (storeId == null || max <= 0) return;
    setSaving(true);
    setError(null);
    const note = notes.trim();
    const explicit = components
      .filter(c => sourceOf(c) !== "auto")
      .map(c => ({ product_id: c.product_id, source: sourceOf(c) }));
    try {
      const result = await assembleBundle(bundle.id, {
        store_id: storeId,
        quantity: qty,
        ...(note ? { notes: note } : {}),
        ...(explicit.length > 0 ? { sources: explicit } : {}),
      });
      toast.success(qty === 1 ? `Se armó 1 paquete en ${storeName}` : `Se armaron ${n(qty)} paquetes en ${storeName}`);
      applyFresh(result.bundle);
      invalidate();
      onDone(result.bundle);
    } catch (err) {
      const text = assembleErrorText(err, "No se pudo armar. Intenta de nuevo.");
      if (text.includes(STOCK_CHANGED_MARK)) {
        setError(`Las existencias cambiaron: ${text}`);
        invalidate();
      } else {
        setError(text);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <PromoDialog
      title={`Armar ${bundle.name}`}
      subtitle="Toma las piezas de la tienda y las convierte en paquetes listos para vender."
      size="md"
      busy={saving}
      onClose={onClose}
      testId="assemble-dialog"
      footer={(
        <>
          <PromoButton onClick={onClose} disabled={saving}>Cancelar</PromoButton>
          <PromoButton
            variant="primary"
            icon={<PackagePlus size={18} aria-hidden />}
            onClick={() => { void submit(); }}
            loading={saving}
            disabled={!canSubmit}
            data-testid="confirm-assemble"
          >
            {saving ? "Armando…" : `Armar ${bundlesLabel(qty)}`}
          </PromoButton>
        </>
      )}
    >
      <div className="space-y-5">
        <section>
          <span className={LABEL} style={{ color: TEXT_HI }}>Tienda</span>
          {viewer.isAdmin ? (
            bundle.availability.length === 0
              ? <p className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>Sin tiendas con inventario.</p>
              : (
                <select
                  value={storeId ?? ""}
                  onChange={event => changeStore(event.target.value === "" ? null : Number(event.target.value))}
                  aria-label="Tienda donde armar"
                  disabled={saving}
                  style={{ ...inputStyle, cursor: "pointer" }}
                  data-testid="assemble-store"
                >
                  {bundle.availability.map(row => (
                    <option key={row.store_id} value={row.store_id}>
                      {row.store_name} — puedes armar {n(row.max_buildable)}
                    </option>
                  ))}
                </select>
              )
          ) : storeId != null ? (
            <StorePill name={storeName} />
          ) : (
            <p className="text-[14px] font-semibold" style={{ color: RED_SOFT }}>Tu usuario no tiene tienda asignada.</p>
          )}
        </section>

        <section>
          <span className={LABEL} style={{ color: TEXT_HI }}>¿Cuántos paquetes armar?</span>
          <QtyStepper value={qty} min={1} max={max} onChange={setQty} ariaLabel="Paquetes a armar" disabled={max <= 0 || saving} testId="assemble-qty" />
          {max > 0 ? (
            <span className={HINT} style={{ color: TEXT_MD }}>
              Máximo {n(max)} con el stock de {storeName}.
              {adjusted ? <span style={{ color: AMBER }}> {adjusted}</span> : null}
            </span>
          ) : (
            <span className={HINT} style={{ color: RED_SOFT }}>
              No alcanza para armar ni uno.
              {limitingIds.size > 0 && (
                <> Falta: {components.filter(c => limitingIds.has(c.product_id)).map(c => c.name).join(", ")}.</>
              )}
            </span>
          )}
        </section>

        {components.length > 0 && (
          <section>
            <span className={LABEL} style={{ color: TEXT_HI }}>De dónde se toman los productos</span>
            <p className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>
              Automático toma primero de Exhibición y lo que falte de Bodega. Los paquetes armados quedan en Exhibición.
            </p>
            <ul className="mt-2">
              {components.map(c => (
                <ComponentUsageRow
                  key={c.product_id}
                  component={c}
                  buildQty={qty}
                  mode="armar"
                  source={sourceOf(c)}
                  onSourceChange={source => changeSource(c.product_id, source)}
                  hasBodega={av?.has_bodega ?? false}
                  limiting={atMax && limitingIds.has(c.product_id)}
                />
              ))}
            </ul>
          </section>
        )}

        <section>
          {notesOpen || notes ? (
            <label className="block">
              <span className={LABEL} style={{ color: TEXT_HI }}>Nota (opcional)</span>
              <input
                value={notes}
                onChange={event => setNotes(event.target.value)}
                maxLength={MAX_NOTE}
                placeholder="Por ejemplo: para la vitrina"
                disabled={saving}
                style={inputStyle}
                data-testid="assemble-notes"
              />
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className="text-[14px] font-bold underline-offset-2 hover:underline"
              style={{ color: TEXT_MD, cursor: "pointer" }}
            >
              + Agregar nota
            </button>
          )}
        </section>

        {error && (
          <p role="alert" className="rounded-xl px-4 py-3 text-[15px] font-bold" style={{ background: "rgba(224,34,26,0.12)", color: RED_SOFT }}>
            {error}
          </p>
        )}
      </div>
    </PromoDialog>
  );
}
