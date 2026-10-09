import { Trash2 } from "lucide-react";
import type { BundleStoreAvailability } from "@tadaima/api";
import { MAX_QTY, type BundleDraftComponent } from "@/lib/bundleDraft";
import { ProductThumb } from "@/components/promos/ProductPickerRows";
import { AMBER, CARD_BORDER, RED_SOFT, TEXT_HI, TEXT_MD, fmtMoney } from "@/components/promos/promoTokens";
import { QtyStepper } from "./QtyStepper";

interface BundleChosenListProps {
  components: readonly BundleDraftComponent[];
  /** Disponibilidad de la tienda elegida (del server) para avisar qué limita. */
  availability: BundleStoreAvailability | null;
  storeName: string | null;
  onQuantity: (productId: number, qty: number) => void;
  onRemove: (productId: number) => void;
}

/** "Cada paquete lleva": PIEZAS por paquete de cada producto y aviso si no alcanza en la tienda. */
export function BundleChosenList({ components, availability, storeName, onQuantity, onRemove }: BundleChosenListProps) {
  if (components.length === 0) {
    return (
      <p className="rounded-2xl px-4 py-5 text-center text-[15px] font-semibold" style={{ border: CARD_BORDER, color: TEXT_MD }}>
        Marca productos en la tabla de arriba o escanéalos con el lector.
      </p>
    );
  }
  return (
    <ul className="overflow-hidden rounded-2xl" style={{ border: CARD_BORDER }} data-testid="bundle-chosen-list">
      {components.map((c, index) => {
        const row = availability?.components.find(x => x.product_id === c.productId);
        const exh = row ? row.stock_exhibicion : c.stockExh;
        const bod = row ? row.stock_bodega : c.stockBod;
        const hasStockInfo = exh != null && bod != null;
        const combined = (exh ?? 0) + (bod ?? 0);
        const canBuild = hasStockInfo ? Math.floor(combined / c.quantity) : null;
        const limiting = row?.limiting && availability != null && availability.max_buildable <= 2;
        return (
          <li key={c.productId} className="flex flex-wrap items-center gap-3 px-3 py-3" style={{ borderTop: index === 0 ? "none" : CARD_BORDER }}>
            <ProductThumb image={c.image} />
            <span className="min-w-[160px] flex-1">
              <span className="block truncate text-[15px] font-bold" style={{ color: TEXT_HI }}>{c.name}</span>
              <span className="block text-[13px] font-semibold tabular-nums" style={{ color: TEXT_MD }}>
                Código {c.sku} · {fmtMoney(c.unitPrice)} c/u
              </span>
              {hasStockInfo && (
                <span className="block text-[13px] font-semibold tabular-nums" style={{ color: TEXT_MD }}>
                  Hay en tienda: Exh {exh.toLocaleString("es-MX")} · Bod {bod.toLocaleString("es-MX")}
                  {canBuild != null && canBuild > 0 && !limiting ? ` · alcanza para ${canBuild.toLocaleString("es-MX")}` : ""}
                </span>
              )}
              {hasStockInfo && canBuild != null && canBuild === 0 && (
                <span className="block text-[13px] font-bold" style={{ color: RED_SOFT }}>
                  {storeName ? `En ${storeName} no alcanza ni para un paquete.` : "No alcanza ni para un paquete."}
                </span>
              )}
              {hasStockInfo && canBuild != null && canBuild > 0 && limiting && (
                <span className="block text-[13px] font-bold" style={{ color: AMBER }}>
                  Es el que limita: alcanza para {canBuild.toLocaleString("es-MX")}.
                </span>
              )}
            </span>
            <span className="flex flex-col items-center gap-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: TEXT_MD }}>Piezas por paquete</span>
              <QtyStepper
                value={c.quantity}
                min={1}
                max={MAX_QTY}
                showMax={false}
                onChange={qty => onQuantity(c.productId, qty)}
                ariaLabel={`Piezas de ${c.name} por paquete`}
                testId={`qty-input-${c.productId}`}
              />
            </span>
            <button
              type="button"
              onClick={() => onRemove(c.productId)}
              aria-label={`Quitar ${c.name}`}
              className="flex h-11 items-center gap-1 rounded-xl px-2 text-[13px] font-bold hover:bg-white/10"
              style={{ color: TEXT_MD, cursor: "pointer" }}
            >
              <Trash2 size={18} aria-hidden /> <span className="hidden sm:inline">Quitar</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
