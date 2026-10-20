import type { BundleStoreAvailability } from "@tadaima/api";
import { availabilityTone } from "@/lib/bundleMath";
import { CARD_BORDER, GREEN, TEXT_HI, TEXT_MD, tint } from "@/components/promos/promoTokens";
import { TONE_COLOR } from "./bundleTokens";

interface BuildablePillProps {
  max: number;
  storeName?: string;
  size?: "md" | "sm";
}

/** Semáforo "Puedes armar: N" (verde / ámbar quedan pocos / rojo faltan piezas). */
export function BuildablePill({ max, storeName, size = "md" }: BuildablePillProps) {
  const color = TONE_COLOR[availabilityTone(max)];
  const text = max <= 0 ? "No puedes armar: faltan piezas" : `Puedes armar: ${max.toLocaleString("es-MX")}`;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 rounded-full font-extrabold ${size === "sm" ? "min-h-7 px-2.5 text-[13px]" : "min-h-8 px-3 text-[14px]"}`}
      style={tint(color)}
      aria-label={storeName ? `${text} en ${storeName}` : text}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
      {text}
    </span>
  );
}

interface BundleStoreTableProps {
  rows: readonly BundleStoreAvailability[];
  highlightStoreId?: number | null;
  /** Con detalle: abre el desglose por componente de cada tienda. */
  showComponents?: boolean;
}

const armadosText = (row: BundleStoreAvailability): string => {
  const exh = row.stock_exhibicion;
  const bod = row.stock_bodega;
  if (exh <= 0 && bod <= 0) return "0 armados";
  return bod > 0 ? `${exh.toLocaleString("es-MX")} armados · ${bod.toLocaleString("es-MX")} en bodega` : `${exh.toLocaleString("es-MX")} armados`;
};

/** Tabla "Tienda · Armados · Puedes armar" (admin en "Todas", paso 3 del asistente, detalle). */
export function BundleStoreTable({ rows, highlightStoreId = null, showComponents = false }: BundleStoreTableProps) {
  if (rows.length === 0) {
    return <p className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>Sin tiendas con inventario.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl" style={{ border: CARD_BORDER }}>
      <table className="w-full min-w-[320px] text-left text-[14px]">
        <thead>
          <tr style={{ color: TEXT_MD }}>
            <th className="px-3 py-2 font-bold">Tienda</th>
            <th className="px-3 py-2 font-bold">Armados</th>
            <th className="px-3 py-2 text-right font-bold">Puedes armar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const mine = row.store_id === highlightStoreId;
            const color = TONE_COLOR[availabilityTone(row.max_buildable)];
            return (
              <FragmentRow key={row.store_id} row={row} mine={mine} color={color} showComponents={showComponents} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ row, mine, color, showComponents }: { row: BundleStoreAvailability; mine: boolean; color: string; showComponents: boolean }) {
  return (
    <>
      <tr style={{ borderTop: CARD_BORDER, background: mine ? `${GREEN}14` : "transparent" }}>
        <td className="px-3 py-2 font-extrabold" style={{ color: TEXT_HI }}>
          {row.store_name}
          {mine && <span className="ml-2 rounded-full px-2 py-0.5 text-[12px] font-bold" style={tint(GREEN)}>Tu tienda</span>}
          {row.warning && <span className="ml-2 text-[12px] font-semibold" style={{ color: TEXT_MD }}>{row.warning}</span>}
        </td>
        <td className="px-3 py-2 font-semibold tabular-nums" style={{ color: TEXT_MD }}>{armadosText(row)}</td>
        <td className="px-3 py-2 text-right text-[16px] font-black tabular-nums" style={{ color }}>
          {row.max_buildable.toLocaleString("es-MX")}
        </td>
      </tr>
      {showComponents && row.components.length > 0 && (
        <tr style={{ background: mine ? `${GREEN}0A` : "transparent" }}>
          <td colSpan={3} className="px-3 pb-3 pt-0">
            <ul className="space-y-1">
              {row.components.map(c => (
                <li key={c.product_id} className="flex flex-wrap items-center justify-between gap-x-3 text-[13px] font-semibold" style={{ color: c.limiting && row.max_buildable <= 2 ? TONE_COLOR.amber : TEXT_MD }}>
                  <span>{c.name} × {c.quantity}</span>
                  <span className="tabular-nums">
                    Exh {c.stock_exhibicion.toLocaleString("es-MX")} · Bod {c.stock_bodega.toLocaleString("es-MX")}
                    {c.limiting && row.max_buildable <= 2 ? " · es el que limita" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
