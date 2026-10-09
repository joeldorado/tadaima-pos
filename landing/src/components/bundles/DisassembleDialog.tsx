import { useState } from "react";
import { PackageMinus } from "lucide-react";
import { toast } from "sonner";
import { disassembleBundle, type Bundle, type Store } from "@tadaima/api";
import { useBundleCache, type BundleViewer } from "@/hooks/queries/useBundles";
import { assembleErrorText } from "@/lib/bundleDraft";
import { availabilityFor } from "@/lib/bundleMath";
import { PromoButton } from "@/components/promos/PromoButton";
import { PromoDialog } from "@/components/promos/PromoDialog";
import { CARD_BG, CARD_BORDER, GREEN, RED_SOFT, TEXT_HI, TEXT_MD, inputStyle, tint } from "@/components/promos/promoTokens";
import { ComponentUsageRow } from "./ComponentUsageRow";
import { QtyStepper } from "./QtyStepper";
import { StorePill } from "./StoreSelect";
import { bundlesLabel } from "./bundleTokens";

type Destination = "store" | "bodega";

interface DisassembleDialogProps {
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

const DESTINATIONS: ReadonlyArray<{ key: Destination; title: string; hint: string }> = [
  { key: "store", title: "Exhibición", hint: "Quedan listos para venderse sueltos." },
  { key: "bodega", title: "Bodega", hint: "Se guardan atrás; muévelos a Exhibición para venderlos." },
];

const n = (value: number): string => value.toLocaleString("es-MX");

/**
 * Desarmar N paquetes de una tienda: resta paquetes de Exhibición y regresa
 * las piezas al almacén elegido. Solo se listan tiendas con paquetes armados.
 */
export function DisassembleDialog({ bundle, stores, viewer, defaultStoreId, onClose, onDone }: DisassembleDialogProps) {
  const { applyFresh, invalidate } = useBundleCache();
  const rows = bundle.availability.filter(row => row.stock_exhibicion > 0);
  const [storeId, setStoreId] = useState<number | null>(() => {
    if (!viewer.isAdmin) return viewer.storeId;
    if (defaultStoreId != null && rows.some(r => r.store_id === defaultStoreId)) return defaultStoreId;
    return rows[0]?.store_id ?? null;
  });
  const [qty, setQty] = useState(1);
  const [destination, setDestination] = useState<Destination>("store");
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const av = availabilityFor(bundle, storeId);
  const assembled = av?.stock_exhibicion ?? 0;
  const storeName = av?.store_name ?? stores.find(s => s.id === storeId)?.name ?? viewer.storeName ?? "la tienda";
  const hasBodega = av?.has_bodega ?? false;
  const nothingAnywhere = rows.length === 0;
  const canSubmit = storeId != null && assembled > 0 && !saving;

  const changeStore = (next: number | null) => {
    setStoreId(next); setQty(1); setDestination("store"); setError(null);
  };

  const submit = async () => {
    if (storeId == null || assembled <= 0) return;
    setSaving(true);
    setError(null);
    const note = notes.trim();
    try {
      const result = await disassembleBundle(bundle.id, {
        store_id: storeId,
        quantity: qty,
        destination,
        ...(note ? { notes: note } : {}),
      });
      const base = qty === 1 ? `Se desarmó 1 paquete en ${storeName}` : `Se desarmaron ${n(qty)} paquetes en ${storeName}`;
      toast.success(destination === "bodega" ? `${base} · piezas a Bodega` : base);
      applyFresh(result.bundle);
      invalidate();
      onDone(result.bundle);
    } catch (err) {
      setError(assembleErrorText(err, "No se pudo desarmar. Intenta de nuevo."));
      invalidate();
    } finally {
      setSaving(false);
    }
  };

  return (
    <PromoDialog
      title={`Desarmar ${bundle.name}`}
      subtitle="Regresa las piezas de los paquetes al inventario de la tienda."
      size="md"
      busy={saving}
      onClose={onClose}
      testId="disassemble-dialog"
      footer={(
        <>
          <PromoButton onClick={onClose} disabled={saving}>Cancelar</PromoButton>
          <PromoButton
            variant="primary"
            icon={<PackageMinus size={18} aria-hidden />}
            onClick={() => { void submit(); }}
            loading={saving}
            disabled={!canSubmit}
            data-testid="confirm-disassemble"
          >
            {saving ? "Desarmando…" : `Desarmar ${n(qty)}`}
          </PromoButton>
        </>
      )}
    >
      <div className="space-y-5">
        {nothingAnywhere ? (
          <p className="text-[15px] font-semibold" style={{ color: TEXT_MD }}>No hay paquetes armados en ninguna tienda.</p>
        ) : (
          <>
            <section>
              <span className={LABEL} style={{ color: TEXT_HI }}>Tienda</span>
              {viewer.isAdmin ? (
                <select
                  value={storeId ?? ""}
                  onChange={event => changeStore(event.target.value === "" ? null : Number(event.target.value))}
                  aria-label="Tienda donde desarmar"
                  disabled={saving}
                  style={{ ...inputStyle, cursor: "pointer" }}
                  data-testid="disassemble-store"
                >
                  {rows.map(row => (
                    <option key={row.store_id} value={row.store_id}>
                      {row.store_name} — {bundlesLabel(row.stock_exhibicion)} armados
                    </option>
                  ))}
                </select>
              ) : storeId != null ? (
                <StorePill name={storeName} />
              ) : (
                <p className="text-[14px] font-semibold" style={{ color: RED_SOFT }}>Tu usuario no tiene tienda asignada.</p>
              )}
            </section>

            <section>
              <span className={LABEL} style={{ color: TEXT_HI }}>¿Cuántos desarmar?</span>
              <QtyStepper value={qty} min={1} max={assembled} onChange={setQty} ariaLabel="Paquetes a desarmar" disabled={assembled <= 0 || saving} testId="disassemble-qty" />
              <span className={HINT} style={{ color: assembled > 0 ? TEXT_MD : RED_SOFT }}>
                {assembled > 0 ? `Hay ${n(assembled)} armados en ${storeName}.` : `No hay paquetes armados en ${storeName}.`}
              </span>
            </section>

            <fieldset>
              <legend className={LABEL} style={{ color: TEXT_HI }}>Regresar los productos a:</legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Destino de las piezas">
                {DESTINATIONS.map(option => {
                  const active = destination === option.key;
                  const disabled = option.key === "bodega" && !hasBodega;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={active}
                      disabled={disabled || saving}
                      title={disabled ? "Esta tienda no tiene bodega" : undefined}
                      onClick={() => { setDestination(option.key); setError(null); }}
                      className="min-h-16 rounded-2xl px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-40"
                      style={active ? { ...tint(GREEN), cursor: "pointer" } : { background: CARD_BG, border: CARD_BORDER, cursor: disabled ? "not-allowed" : "pointer" }}
                      data-testid={`disassemble-dest-${option.key}`}
                    >
                      <span className="block text-[16px] font-extrabold" style={{ color: active ? GREEN : TEXT_HI }}>{option.title}</span>
                      <span className="block text-[14px] font-semibold" style={{ color: TEXT_MD }}>{option.hint}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {av && av.components.length > 0 && (
              <section>
                <span className={LABEL} style={{ color: TEXT_HI }}>Qué regresa al inventario</span>
                <ul>
                  {av.components.map(c => (
                    <ComponentUsageRow
                      key={c.product_id}
                      component={c}
                      buildQty={qty}
                      mode="desarmar"
                      source="auto"
                      hasBodega={hasBodega}
                      limiting={false}
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
                    placeholder="Por ejemplo: se vendieron sueltos"
                    disabled={saving}
                    style={inputStyle}
                    data-testid="disassemble-notes"
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
          </>
        )}

        {error && (
          <p role="alert" className="rounded-xl px-4 py-3 text-[15px] font-bold" style={{ background: "rgba(224,34,26,0.12)", color: RED_SOFT }}>
            {error}
          </p>
        )}
      </div>
    </PromoDialog>
  );
}
