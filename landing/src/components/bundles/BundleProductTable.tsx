import { useState } from "react";
import { Loader2 } from "lucide-react";
import { getLightPrice, type ProductLight } from "@tadaima/api";
import { pickerDisplayName, visibleStock } from "@/lib/bundlePicker";
import { PromoButton } from "@/components/promos/PromoButton";
import { ProductThumb } from "@/components/promos/ProductPickerRows";
import { AMBER, CARD_BORDER, GREEN, GREEN_SOLID, POPUP_BG, TEXT_HI, TEXT_MD, fmtMoney } from "@/components/promos/promoTokens";

interface BundleProductTableProps {
  /** Filas ya filtradas y ordenadas (ver lib/bundlePicker). */
  rows: readonly ProductLight[];
  chosenIds: ReadonlySet<number>;
  hasStore: boolean;
  loading: boolean;
  error: boolean;
  /** Texto del buscador, para el mensaje de "sin resultados". */
  query: string;
  /** Con el filtro "Solo con stock" puesto se sugiere quitarlo cuando no hay filas. */
  inStockOnly: boolean;
  onToggle: (product: ProductLight) => void;
}

const PAGE_SIZE = 60;
const CHECKBOX_STYLE: React.CSSProperties = { width: 22, height: 22, accentColor: GREEN_SOLID, flexShrink: 0, cursor: "pointer" };
const TH: React.CSSProperties = { position: "sticky", top: 0, zIndex: 1, background: POPUP_BG, padding: "10px 12px", fontSize: 13, fontWeight: 800, color: TEXT_MD, textAlign: "left", whiteSpace: "nowrap" };

/**
 * Tabla de productos del paso 1: marca con el check (o tocando la fila) los
 * productos que lleva el paquete. Encabezado fijo, scroll propio, paginado
 * cliente de 60 en 60.
 */
export function BundleProductTable({ rows, chosenIds, hasStore, loading, error, query, inStockOnly, onToggle }: BundleProductTableProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  // Al cambiar el filtro se vuelve a la primera página (ajuste durante el render, sin effect).
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setLimit(PAGE_SIZE);
  }

  if (loading && rows.length === 0) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-2xl py-10 text-[15px] font-semibold" style={{ border: CARD_BORDER, color: TEXT_MD }}>
        <Loader2 size={18} className="animate-spin" aria-hidden /> Cargando productos…
      </p>
    );
  }
  if (error && rows.length === 0) {
    return <p className="rounded-2xl py-8 text-center text-[15px] font-bold" style={{ border: CARD_BORDER, color: AMBER }}>No se pudieron cargar los productos. Revisa tu conexión.</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl py-8 text-center text-[15px] font-semibold" style={{ border: CARD_BORDER, color: TEXT_MD }}>
        {query.trim() ? `No encontramos productos con "${query.trim()}".` : "No hay productos con ese filtro."}
        {inStockOnly && <span className="mt-1 block text-[13px]">Prueba quitando «Solo con stock» (los que solo tienen piezas en Bodega no se muestran con ese filtro).</span>}
      </p>
    );
  }

  const visible = rows.slice(0, limit);
  const remaining = rows.length - visible.length;

  return (
    <div className="rounded-2xl" style={{ border: CARD_BORDER }}>
      <div className="overflow-auto" style={{ maxHeight: "40vh" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 44 }}><span className="sr-only">Elegir</span></th>
              <th style={TH}>Producto</th>
              <th style={{ ...TH, textAlign: "right" }}>Precio</th>
              {hasStore ? (
                <>
                  <th style={{ ...TH, textAlign: "right" }} title="En Exhibición">Exh</th>
                  <th style={{ ...TH, textAlign: "right" }} title="En Bodega">Bod</th>
                </>
              ) : (
                <th style={{ ...TH, textAlign: "right" }}>Stock</th>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map(p => {
              const checked = chosenIds.has(p.id);
              const stock = visibleStock(p, hasStore);
              const none = stock.total <= 0;
              return (
                <tr
                  key={p.id}
                  onClick={() => onToggle(p)}
                  className="hover:bg-white/5"
                  style={{ borderTop: CARD_BORDER, background: checked ? `${GREEN}14` : "transparent", cursor: "pointer", opacity: none ? 0.7 : 1 }}
                  data-testid={`bundle-pick-${p.id}`}
                  aria-selected={checked}
                >
                  <td style={{ padding: "6px 12px" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(p)}
                      onClick={event => event.stopPropagation()}
                      aria-label={`Elegir ${pickerDisplayName(p)}`}
                      style={CHECKBOX_STYLE}
                    />
                  </td>
                  <td style={{ padding: "6px 12px" }}>
                    <span className="flex min-h-11 items-center gap-3">
                      <ProductThumb image={p.image} size={40} />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-bold" style={{ color: TEXT_HI }}>{pickerDisplayName(p)}</span>
                        <span className="block text-[13px] font-semibold" style={{ color: TEXT_MD }}>
                          Código {p.sku}{hasStore && !stock.assigned ? " · No asignado en esta tienda" : ""}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="tabular-nums" style={{ padding: "6px 12px", textAlign: "right", fontWeight: 700, color: TEXT_MD, whiteSpace: "nowrap" }}>
                    {fmtMoney(getLightPrice(p, 1))}
                  </td>
                  {hasStore ? (
                    <>
                      <td className="tabular-nums" style={{ padding: "6px 12px", textAlign: "right", fontWeight: 800, color: stock.exh > 0 ? TEXT_HI : AMBER }}>{stock.exh.toLocaleString("es-MX")}</td>
                      <td className="tabular-nums" style={{ padding: "6px 12px", textAlign: "right", fontWeight: 700, color: TEXT_MD }}>{stock.bod.toLocaleString("es-MX")}</td>
                    </>
                  ) : (
                    <td className="tabular-nums" style={{ padding: "6px 12px", textAlign: "right", fontWeight: 800, color: stock.total > 0 ? TEXT_HI : AMBER }}>{stock.total.toLocaleString("es-MX")}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {remaining > 0 && (
        <div className="p-3 text-center" style={{ borderTop: CARD_BORDER }}>
          <PromoButton onClick={() => setLimit(current => current + PAGE_SIZE)}>
            Mostrar {Math.min(PAGE_SIZE, remaining)} más (quedan {remaining.toLocaleString("es-MX")})
          </PromoButton>
        </div>
      )}
    </div>
  );
}
