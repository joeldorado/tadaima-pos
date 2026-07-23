import { Fragment } from "react";
import { Reorder } from "motion/react";
import { GripVertical, Package } from "lucide-react";
import type { ProductFlagRow } from "@tadaima/api";

/**
 * Lista arrastrable del "top" manual del Catálogo Online (Catálogo v5).
 *
 * El orden que queda aquí es LITERALMENTE el que ve el cliente al entrar a la
 * tienda: la posición de cada fila se guarda en `products.catalog_position`.
 *
 * Solo lista destacados (★) — quitar la estrella saca del top, así hay un solo
 * concepto en juego. En este modo se ocultan los toggles ★/👁 y arrastra la
 * fila completa: es más simple que un asa dedicada y evita que los botones
 * peleen con el arrastre en pantallas táctiles.
 */

/** Cuántos productos considera Joel "el top" — solo marca dónde va la línea. */
const TOP_SIZE = 20;

/**
 * Índice de la fila DESPUÉS de la cual va la línea del top, contando solo las
 * que de verdad se ven en la tienda. -1 si la lista no llega a 20 públicas.
 */
function topCutIndex(rows: ProductFlagRow[]): number {
  let seen = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]?.in_public_catalog) seen++;
    if (seen === TOP_SIZE) return i;
  }
  return -1;
}

const fmt = (n: number | null): string =>
  n == null
    ? "—"
    : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

interface Props {
  rows: ProductFlagRow[];
  /** Durante el arrastre. Dispara MUCHAS veces: aquí no se guarda nada. */
  onReorder: (rows: ProductFlagRow[]) => void;
  /** Al soltar. Aquí sí se persiste. */
  onCommit: () => void;
  canEdit: boolean;
}

export function FeaturedOrderList({ rows, onReorder, onCommit, canEdit }: Props) {
  const cut = topCutIndex(rows);

  // El número que se muestra es el puesto REAL en la tienda, así que solo
  // avanza con las filas que sí salen publicadas.
  let publicRank = 0;

  return (
    <Reorder.Group
      as="div"
      axis="y"
      values={rows}
      onReorder={onReorder}
      // El grupo DEBE ser el elemento que scrollea (con layoutScroll), o el
      // arrastre calcula mal las posiciones al estar la lista recortada.
      layoutScroll
      className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1"
    >
      {rows.map((row, i) => {
        const rank = row.in_public_catalog ? ++publicRank : null;

        return (
          // Fragment (no un div) para que el Item quede como hijo DIRECTO del
          // Group: motion mide la posición de sus hijos para animar el reacomodo.
          <Fragment key={row.id}>
            <Reorder.Item
              as="div"
              value={row}
              dragListener={canEdit}
              onDragEnd={onCommit}
              whileDrag={{ scale: 1.02, boxShadow: "0 12px 32px rgba(0,0,0,0.45)", zIndex: 10 }}
              className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.02] border border-white/5 select-none"
              style={{
                position: "relative", // para que el zIndex de whileDrag aplique
                cursor: canEdit ? "grab" : "default",
                opacity: row.in_public_catalog ? 1 : 0.5,
              }}
            >
              <GripVertical size={15} className="text-white/20 shrink-0" />

              <span
                className="w-7 shrink-0 text-center text-[11px] font-black tabular-nums"
                style={{ color: rank && rank <= TOP_SIZE ? "#FFB020" : "rgba(255,255,255,0.2)" }}
              >
                {rank ?? "—"}
              </span>

              <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                {row.image ? (
                  <img src={row.image} alt={row.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <Package size={14} className="text-white/20" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-white truncate">{row.name}</p>
                <p className="text-[9px] font-bold text-white/30 truncate">
                  {row.sku} · {fmt(row.price_1)}
                  {row.category ? ` · ${row.category.name}` : ""}
                </p>
              </div>

              {!row.in_public_catalog && (
                <span
                  className="shrink-0 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest"
                  style={{ background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.3)", color: "#FF8A80" }}
                  title="Sin stock, inactivo u oculto: no aparece en la tienda y no ocupa lugar en el top."
                >
                  No se ve
                </span>
              )}
            </Reorder.Item>

            {i === cut && i < rows.length - 1 && (
              <div className="flex items-center gap-3 py-2.5 px-1" aria-hidden>
                <div className="h-px flex-1" style={{ background: "rgba(255,176,32,0.3)" }} />
                <span className="text-[8px] font-black uppercase tracking-widest text-amber-400/60">
                  Hasta aquí llega el top {TOP_SIZE}
                </span>
                <div className="h-px flex-1" style={{ background: "rgba(255,176,32,0.3)" }} />
              </div>
            )}
          </Fragment>
        );
      })}
    </Reorder.Group>
  );
}
