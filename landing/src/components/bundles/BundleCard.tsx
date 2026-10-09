import { useState } from "react";
import { ChevronDown, PackageMinus, PackagePlus, Tag } from "lucide-react";
import type { Bundle } from "@tadaima/api";
import { availabilityFor, savingsPct } from "@/lib/bundleMath";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PromoButton } from "@/components/promos/PromoButton";
import { ProductThumb } from "@/components/promos/ProductPickerRows";
import { AMBER, CARD_BG, CARD_BORDER, GRAY, GREEN, TEXT_HI, TEXT_MD, fmtMoney, tint } from "@/components/promos/promoTokens";
import { BuildablePill, BundleStoreTable } from "./BundleAvailability";
import { BundleCardMenu } from "./BundleCardMenu";
import { pluralize } from "./bundleTokens";
import type { BundleViewer } from "@/hooks/queries/useBundles";

interface BundleCardProps {
  bundle: Bundle;
  viewer: BundleViewer;
  /** Tienda elegida en la página (null = admin viendo todas). */
  storeId: number | null;
  toggling: boolean;
  onAssemble: (bundle: Bundle) => void;
  onDisassemble: (bundle: Bundle) => void;
  onLabel: (bundle: Bundle) => void;
  onDetail: (bundle: Bundle) => void;
  onEdit: (bundle: Bundle) => void;
  onToggleActive: (bundle: Bundle) => void;
  onDelete: (bundle: Bundle) => void;
}

const totalPieces = (bundle: Bundle): number => bundle.components.reduce((acc, c) => acc + c.quantity, 0);

/**
 * Tarjeta de un paquete: qué es, cuánto cuesta, cuántos hay y cuántos se pueden
 * armar en la tienda elegida; sus productos desplegables y las acciones con texto.
 */
export function BundleCard({
  bundle, viewer, storeId, toggling,
  onAssemble, onDisassemble, onLabel, onDetail, onEdit, onToggleActive, onDelete,
}: BundleCardProps) {
  const [open, setOpen] = useState(false);
  const price = bundle.prices.price_1 ?? 0;
  const savings = savingsPct(price, bundle.suggested_price_sum);
  const store = availabilityFor(bundle, storeId);
  const anyBuildable = bundle.availability.some(row => row.max_buildable > 0);
  const anyAssembled = bundle.availability.some(row => row.stock_exhibicion > 0);
  const canAssemble = bundle.active && (store ? store.max_buildable > 0 : anyBuildable);
  const canDisassemble = store ? store.stock_exhibicion > 0 : anyAssembled;
  const canOperate = viewer.isAdmin || viewer.storeId != null;

  return (
    <article
      className="rounded-3xl"
      style={{ background: CARD_BG, border: CARD_BORDER, opacity: bundle.active ? 1 : 0.72 }}
      data-testid={`bundle-row-${bundle.id}`}
    >
      <div className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
        <button type="button" onClick={() => onDetail(bundle)} aria-label={`Ver detalle de ${bundle.name}`} className="shrink-0 rounded-2xl" style={{ cursor: "pointer" }}>
          <ProductThumb image={bundle.image} size={72} />
        </button>

        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[19px] font-black leading-tight" style={{ color: TEXT_HI }}>
              <button type="button" onClick={() => onDetail(bundle)} className="text-left hover:underline" style={{ color: TEXT_HI, cursor: "pointer" }}>
                {bundle.name}
              </button>
            </h3>
            {!bundle.active && (
              <span className="rounded-full px-2.5 py-0.5 text-[12px] font-extrabold" style={tint(GRAY)}>Desactivado</span>
            )}
          </div>
          <p className="mt-0.5 text-[14px] font-semibold tabular-nums" style={{ color: TEXT_MD }}>
            SKU {bundle.sku}{bundle.barcode ? ` · ${bundle.barcode}` : ""} · {pluralize(bundle.components_count, "producto", "productos")} · {pluralize(totalPieces(bundle), "pieza", "piezas")}
          </p>
          <p className="mt-1 text-[17px] font-black" style={{ color: TEXT_HI }}>
            {fmtMoney(price)}
            {bundle.suggested_price_sum > 0 && (
              <span className="ml-2 text-[14px] font-semibold" style={{ color: savings != null && savings > 0 ? GREEN : savings != null && savings < 0 ? AMBER : TEXT_MD }}>
                sueltos {fmtMoney(bundle.suggested_price_sum)}
                {savings != null && savings > 0 ? ` · ahorras ${savings}%` : savings != null && savings < 0 ? ` · ${Math.abs(savings)}% más caro` : ""}
              </span>
            )}
          </p>
          {store && (
            <p className="mt-1 text-[14px] font-semibold" style={{ color: TEXT_MD }}>
              En {store.store_name}: <b style={{ color: TEXT_HI }}>{store.stock_exhibicion.toLocaleString("es-MX")} armados</b>
              {store.stock_bodega > 0 ? ` · ${store.stock_bodega.toLocaleString("es-MX")} en bodega` : ""}
            </p>
          )}
        </div>

        {store
          ? <BuildablePill max={store.max_buildable} storeName={store.store_name} />
          : viewer.isAdmin && bundle.availability.length > 0
            ? <div className="w-full sm:w-auto sm:min-w-[300px]"><BundleStoreTable rows={bundle.availability} /></div>
            : null}
      </div>

      <Collapsible open={open && bundle.components.length > 0} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-5">
          <CollapsibleTrigger asChild>
            <PromoButton
              className="mr-auto"
              icon={<ChevronDown size={18} aria-hidden style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />}
              data-testid={`toggle-components-${bundle.id}`}
            >
              {open ? "Ocultar productos" : `Ver los ${bundle.components_count} productos`}
            </PromoButton>
          </CollapsibleTrigger>
          {canOperate && (
            <>
              <PromoButton
                variant={canAssemble ? "primary" : "secondary"}
                icon={<PackagePlus size={18} aria-hidden />}
                disabled={!canAssemble}
                title={canAssemble ? undefined : bundle.active ? "No hay piezas suficientes para armar" : "Activa el paquete para armarlo"}
                onClick={() => onAssemble(bundle)}
                data-testid={`assemble-${bundle.id}`}
              >
                Armar
              </PromoButton>
              <PromoButton
                icon={<PackageMinus size={18} aria-hidden />}
                disabled={!canDisassemble}
                title={canDisassemble ? undefined : "No hay paquetes armados"}
                onClick={() => onDisassemble(bundle)}
                data-testid={`disassemble-${bundle.id}`}
              >
                Desarmar
              </PromoButton>
            </>
          )}
          <PromoButton icon={<Tag size={18} aria-hidden />} onClick={() => onLabel(bundle)} data-testid={`label-${bundle.id}`}>
            Etiqueta
          </PromoButton>
          <BundleCardMenu
            ariaLabel={`Más acciones de ${bundle.name}`}
            testId={`bundle-menu-${bundle.id}`}
            items={[
              { key: "detail", label: "Ver detalle", onSelect: () => onDetail(bundle) },
              { key: "edit", label: "Editar", onSelect: () => onEdit(bundle) },
              { key: "toggle", label: bundle.active ? "Desactivar" : "Activar", onSelect: () => onToggleActive(bundle), disabled: toggling },
              { key: "delete", label: "Borrar", onSelect: () => onDelete(bundle), danger: true },
            ]}
          />
        </div>
        <CollapsibleContent>
          <ul className="px-4 pb-4 sm:px-5" style={{ borderTop: CARD_BORDER }}>
            {bundle.components.map(c => (
              <li key={c.product_id} className="flex items-center gap-3 py-2" style={{ borderBottom: CARD_BORDER }}>
                <ProductThumb image={c.image} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold" style={{ color: TEXT_HI }}>
                    <span style={{ color: GREEN }}>{c.quantity} ×</span> {c.name}
                  </span>
                  <span className="block text-[13px] font-semibold" style={{ color: TEXT_MD }}>Código {c.sku}{c.price_1 != null ? ` · ${fmtMoney(c.price_1)} c/u` : ""}</span>
                </span>
                {store && (() => {
                  const row = store.components.find(x => x.product_id === c.product_id);
                  return row ? (
                    <span className="shrink-0 text-right text-[13px] font-semibold tabular-nums" style={{ color: row.limiting && store.max_buildable <= 2 ? AMBER : TEXT_MD }}>
                      Exh {row.stock_exhibicion.toLocaleString("es-MX")} · Bod {row.stock_bodega.toLocaleString("es-MX")}
                    </span>
                  ) : null;
                })()}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </article>
  );
}
