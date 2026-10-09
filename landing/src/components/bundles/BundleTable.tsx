import { PackageMinus, PackagePlus, Tag } from "lucide-react";
import type { Bundle } from "@tadaima/api";
import type { BundleViewer } from "@/hooks/queries/useBundles";
import { availabilityFor, availabilityTone, savingsPct } from "@/lib/bundleMath";
import { PromoButton } from "@/components/promos/PromoButton";
import { ProductThumb } from "@/components/promos/ProductPickerRows";
import { AMBER, CARD_BG, CARD_BORDER, GRAY, GREEN, POPUP_BG, TEXT_HI, TEXT_MD, fmtMoney, tint } from "@/components/promos/promoTokens";
import { BuildablePill } from "./BundleAvailability";
import { BundleCardMenu } from "./BundleCardMenu";
import type { BundleListActions } from "./BundleList";
import { TONE_COLOR } from "./bundleTokens";

interface BundleTableProps extends BundleListActions {
  bundles: readonly Bundle[];
  viewer: BundleViewer;
  storeId: number | null;
  togglingId: number | null;
}

const TH: React.CSSProperties = { position: "sticky", top: 0, zIndex: 1, background: POPUP_BG, padding: "10px 12px", fontSize: 13, fontWeight: 800, color: TEXT_MD, textAlign: "left", whiteSpace: "nowrap" };
const TD: React.CSSProperties = { padding: "8px 12px", verticalAlign: "middle" };
const totalPieces = (bundle: Bundle): number => bundle.components.reduce((acc, c) => acc + c.quantity, 0);

/**
 * Vista de tabla de Paquetes (para cuando son muchos): una fila por paquete con
 * encabezado fijo; las mismas acciones que la tarjeta.
 */
export function BundleTable({
  bundles, viewer, storeId, togglingId,
  onAssemble, onDisassemble, onLabel, onDetail, onEdit, onToggleActive, onDelete,
}: BundleTableProps) {
  const canOperate = viewer.isAdmin || viewer.storeId != null;
  return (
    <div className="overflow-auto rounded-3xl" style={{ background: CARD_BG, border: CARD_BORDER, maxHeight: "calc(100vh - 260px)" }} data-testid="bundle-table">
      <table className="w-full border-collapse text-left" style={{ minWidth: 760 }}>
        <thead>
          <tr>
            <th style={TH}>Paquete</th>
            <th style={{ ...TH, textAlign: "right" }}>Precio</th>
            <th style={{ ...TH, textAlign: "right" }}>Lleva</th>
            <th style={{ ...TH, textAlign: "right" }}>{storeId != null ? "Armados" : "Armados por tienda"}</th>
            <th style={TH}>Puedes armar</th>
            <th style={{ ...TH, textAlign: "right" }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {bundles.map(bundle => {
            const price = bundle.prices.price_1 ?? 0;
            const savings = savingsPct(price, bundle.suggested_price_sum);
            const store = availabilityFor(bundle, storeId);
            const anyBuildable = bundle.availability.some(row => row.max_buildable > 0);
            const anyAssembled = bundle.availability.some(row => row.stock_exhibicion > 0);
            const canAssemble = bundle.active && (store ? store.max_buildable > 0 : anyBuildable);
            const canDisassemble = store ? store.stock_exhibicion > 0 : anyAssembled;
            return (
              <tr key={bundle.id} style={{ borderTop: CARD_BORDER, opacity: bundle.active ? 1 : 0.65 }} data-testid={`bundle-row-${bundle.id}`}>
                <td style={{ ...TD, minWidth: 280 }}>
                  <button type="button" onClick={() => onDetail(bundle)} className="flex items-center gap-3 text-left" style={{ cursor: "pointer", background: "transparent", border: "none", padding: 0 }}>
                    <ProductThumb image={bundle.image} size={44} />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-black leading-tight hover:underline" style={{ color: TEXT_HI }}>
                        {bundle.name}
                        {!bundle.active && <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={tint(GRAY)}>Desactivado</span>}
                      </span>
                      <span className="block text-[13px] font-semibold tabular-nums" style={{ color: TEXT_MD }}>SKU {bundle.sku}{bundle.barcode ? ` · ${bundle.barcode}` : ""}</span>
                    </span>
                  </button>
                </td>
                <td className="tabular-nums" style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>
                  <span className="block text-[15px] font-black" style={{ color: TEXT_HI }}>{fmtMoney(price)}</span>
                  {savings != null && savings !== 0 && (
                    <span className="block text-[12px] font-semibold" style={{ color: savings > 0 ? GREEN : AMBER }}>
                      {savings > 0 ? `ahorras ${savings}%` : `${Math.abs(savings)}% más caro`}
                    </span>
                  )}
                </td>
                <td className="tabular-nums" style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", color: TEXT_MD, fontWeight: 600 }}>
                  {bundle.components_count} prod. · {totalPieces(bundle)} pzas
                </td>
                <td className="tabular-nums" style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800, color: TEXT_HI }}>
                  {store
                    ? store.stock_exhibicion.toLocaleString("es-MX")
                    : bundle.availability.length === 0 ? "—" : bundle.availability.map(row => (
                      <span key={row.store_id} className="block text-[13px]">
                        <span style={{ color: TEXT_MD, fontWeight: 600 }}>{row.store_name}:</span> {row.stock_exhibicion.toLocaleString("es-MX")}
                      </span>
                    ))}
                </td>
                <td style={{ ...TD, whiteSpace: "nowrap" }}>
                  {store ? (
                    <BuildablePill max={store.max_buildable} storeName={store.store_name} size="sm" />
                  ) : (
                    bundle.availability.map(row => (
                      <span key={row.store_id} className="block text-[13px] font-bold tabular-nums" style={{ color: TONE_COLOR[availabilityTone(row.max_buildable)] }}>
                        {row.store_name}: {row.max_buildable.toLocaleString("es-MX")}
                      </span>
                    ))
                  )}
                </td>
                <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>
                  <span className="inline-flex items-center justify-end gap-1">
                    {canOperate && (
                      <>
                        <PromoButton variant={canAssemble ? "primary" : "secondary"} icon={<PackagePlus size={16} aria-hidden />} disabled={!canAssemble} onClick={() => onAssemble(bundle)} className="px-3" data-testid={`assemble-${bundle.id}`}>Armar</PromoButton>
                        <PromoButton icon={<PackageMinus size={16} aria-hidden />} disabled={!canDisassemble} onClick={() => onDisassemble(bundle)} className="px-3" data-testid={`disassemble-${bundle.id}`}>Desarmar</PromoButton>
                      </>
                    )}
                    <PromoButton icon={<Tag size={16} aria-hidden />} onClick={() => onLabel(bundle)} className="px-3" aria-label={`Etiqueta de ${bundle.name}`} data-testid={`label-${bundle.id}`}>
                      <span className="sr-only sm:not-sr-only">Etiqueta</span>
                    </PromoButton>
                    <BundleCardMenu
                      ariaLabel={`Más acciones de ${bundle.name}`}
                      testId={`bundle-menu-${bundle.id}`}
                      items={[
                        { key: "detail", label: "Ver detalle", onSelect: () => onDetail(bundle) },
                        { key: "edit", label: "Editar", onSelect: () => onEdit(bundle) },
                        { key: "toggle", label: bundle.active ? "Desactivar" : "Activar", onSelect: () => onToggleActive(bundle), disabled: togglingId === bundle.id },
                        { key: "delete", label: "Borrar", onSelect: () => onDelete(bundle), danger: true },
                      ]}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
