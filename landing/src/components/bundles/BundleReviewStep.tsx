import { Loader2 } from "lucide-react";
import type { BundleStoreAvailability, Store } from "@tadaima/api";
import type { BundleViewer } from "@/hooks/queries/useBundles";
import { parseMoney, totalPieces, type BundleDraft } from "@/lib/bundleDraft";
import { ProductThumb } from "@/components/promos/ProductPickerRows";
import { AMBER, CARD_BORDER, GREEN, RED_SOFT, SOFT_BG, TEXT_HI, TEXT_MD, fmtMoney, tint } from "@/components/promos/promoTokens";
import { BundleStoreTable } from "./BundleAvailability";
import { QtyStepper } from "./QtyStepper";
import { StoreSelect } from "./StoreSelect";
import { pluralize } from "./bundleTokens";

interface BundleReviewStepProps {
  draft: BundleDraft;
  photoUrl: string | null;
  availability: readonly BundleStoreAvailability[];
  previewLoading: boolean;
  previewError: boolean;
  clientMax: number | null;
  viewer: BundleViewer;
  stores: readonly Store[];
  onChange: (patch: Partial<BundleDraft>) => void;
}

/** Paso 3: resumen, cuántos se pueden armar por tienda y "¿armar ahora?". */
export function BundleReviewStep({ draft, photoUrl, availability, previewLoading, previewError, clientMax, viewer, stores, onChange }: BundleReviewStepProps) {
  const price = parseMoney(draft.price1) || 0;
  const storeRow = draft.buildStoreId != null ? availability.find(r => r.store_id === draft.buildStoreId) ?? null : null;
  const max = storeRow ? storeRow.max_buildable : clientMax;
  const qty = Number.parseInt(draft.buildQty, 10) || 1;
  const storeName = storeRow?.store_name ?? stores.find(s => s.id === draft.buildStoreId)?.name ?? viewer.storeName ?? "la tienda";
  const storeOptions = viewer.isAdmin ? stores : [];
  const fallbackStoreId = viewer.storeId ?? availability.find(r => r.max_buildable > 0)?.store_id ?? availability[0]?.store_id ?? null;

  const option = (key: "create" | "build", title: string, text: string) => {
    const active = draft.buildNow === (key === "build");
    return (
      <button
        type="button"
        onClick={() => onChange({
          buildNow: key === "build",
          ...(key === "build" && draft.buildStoreId == null ? { buildStoreId: fallbackStoreId } : {}),
        })}
        aria-pressed={active}
        className="flex-1 rounded-2xl px-4 py-3 text-left"
        style={active ? tint(GREEN) : { background: SOFT_BG, border: CARD_BORDER, color: TEXT_MD, cursor: "pointer" }}
      >
        <span className="block text-[15px] font-black" style={{ color: active ? TEXT_HI : TEXT_HI }}>{title}</span>
        <span className="block text-[13px] font-semibold" style={{ color: active ? TEXT_HI : TEXT_MD }}>{text}</span>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-2xl p-4" style={{ background: SOFT_BG, border: CARD_BORDER }} data-testid="wizard-summary">
        <ProductThumb image={photoUrl} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-black leading-tight" style={{ color: TEXT_HI }}>{draft.name.trim() || "Paquete sin nombre"}</p>
          <p className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>
            {fmtMoney(price)} · {pluralize(draft.components.length, "producto", "productos")} · {pluralize(totalPieces(draft.components), "pieza", "piezas")}
            {draft.sku ? ` · SKU ${draft.sku}` : ""}
          </p>
          <p className="mt-1 truncate text-[13px] font-semibold" style={{ color: TEXT_MD }}>
            {draft.components.map(c => `${c.quantity} × ${c.name}`).join(" · ")}
          </p>
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-[16px] font-black" style={{ color: TEXT_HI }}>¿Cuántos paquetes armar ahora?</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          {option("create", "Solo crear", "Lo armas después desde la lista.")}
          {option("build", "Crear y armar ahora", "Toma las piezas de la tienda hoy mismo (Exhibición primero, Bodega si falta).")}
        </div>
        {draft.buildNow && (
          <div className="mt-3 space-y-3 rounded-2xl p-4" style={{ border: CARD_BORDER }}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[14px] font-bold" style={{ color: TEXT_MD }}>Tienda:</span>
              {viewer.isAdmin ? (
                <StoreSelect
                  stores={storeOptions}
                  value={draft.buildStoreId}
                  onChange={id => onChange({ buildStoreId: id, buildQty: "1" })}
                  ariaLabel="Tienda donde armar"
                  optionSuffix={store => {
                    const row = availability.find(r => r.store_id === store.id);
                    return row ? `— puedes armar ${row.max_buildable}` : "";
                  }}
                />
              ) : (
                <span className="text-[15px] font-extrabold" style={{ color: TEXT_HI }}>{storeName}</span>
              )}
            </div>
            {max != null && max > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[14px] font-bold" style={{ color: TEXT_MD }}>Paquetes a armar ahora:</span>
                <QtyStepper value={Math.min(qty, max)} min={1} max={max} onChange={n => onChange({ buildQty: String(n) })} ariaLabel="Paquetes a armar ahora" testId="wizard-build-qty" />
                <span className="text-[13px] font-semibold" style={{ color: TEXT_MD }}>En {storeName} puedes armar hasta {max.toLocaleString("es-MX")}.</span>
              </div>
            ) : (
              <p className="text-[14px] font-bold" style={{ color: max === 0 ? RED_SOFT : TEXT_MD }}>
                {draft.buildStoreId == null
                  ? "Elige la tienda donde se arma."
                  : max === 0
                    ? `En ${storeName} no hay piezas suficientes todavía. Crea el paquete y ármalo cuando llegue mercancía.`
                    : "Calculando cuántos puedes armar…"}
              </p>
            )}
          </div>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-[16px] font-black" style={{ color: TEXT_HI }}>Cuántos puedes armar por tienda</h3>
        {availability.length > 0 ? (
          <BundleStoreTable rows={availability} highlightStoreId={viewer.storeId} showComponents />
        ) : previewLoading ? (
          <p className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: TEXT_MD }}><Loader2 size={16} className="animate-spin" aria-hidden /> Calculando…</p>
        ) : (
          <p className="text-[14px] font-semibold" style={{ color: previewError ? AMBER : TEXT_MD }}>
            {previewError
              ? `No se pudo consultar el servidor.${clientMax != null ? ` Estimado con el stock del buscador: ${clientMax}.` : ""}`
              : "Sin tiendas con inventario para consultar."}
          </p>
        )}
      </section>

    </div>
  );
}
