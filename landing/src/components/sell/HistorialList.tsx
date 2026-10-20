import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUp, ChevronDown, Loader2, Receipt } from "lucide-react";
import type { HistorialEntry } from "@/hooks/queries/useHistorial";
import { HISTORIAL_PAGE_SIZE, countItems, groupByHour, sliceGroups } from "@/lib/historialGroups";

interface HistorialListProps {
  /** Tickets ya filtrados (pestaña, método y búsqueda), de lo más nuevo a lo más viejo. */
  entries: readonly HistorialEntry[];
  renderEntry: (entry: HistorialEntry) => ReactNode;
  loading: boolean;
  emptyText: string;
  /** Cambia con la pestaña, el método o la búsqueda: regresa a la primera tanda y arriba. */
  resetKey: string;
  /** Ref de useViewportMaxHeight: el alto real disponible en la pantalla. */
  listRef: (node: HTMLElement | null) => void;
  maxHeight: number | undefined;
}

/** A partir de este scroll aparece el botón "Arriba". */
const SHOW_TOP_AFTER_PX = 600;

const entryDate = (entry: HistorialEntry): string | null | undefined =>
  entry.type === "sale" ? (entry.data.sold_at || entry.data.created_at) : entry.data.created_at;

const entryKey = (entry: HistorialEntry): string => `${entry.type}-${entry.data.id}`;

const ticketsLabel = (n: number): string => `${n.toLocaleString("es-MX")} ${n === 1 ? "ticket" : "tickets"}`;

/**
 * Lista del Historial del Día (2026-10-19). Antes era una columna flex con
 * tarjetas `overflow: hidden`: con muchos tickets se ENCOGÍAN y se aplastaban en
 * vez de dar scroll. Ahora cada hora es un bloque normal (las tarjetas conservan
 * su alto), con encabezado fijo "3 p. m. · 14 tickets", y se pintan por tandas
 * de 50 para que un día movido abra rápido.
 */
export function HistorialList({ entries, renderEntry, loading, emptyText, resetKey, listRef, maxHeight }: HistorialListProps) {
  // La tanda vale solo para el filtro con que se pidió: otra pestaña, método
  // o búsqueda vuelve a la primera (ajuste durante el render, patrón de React
  // para "estado que depende de un prop").
  const [paging, setPaging] = useState({ key: resetKey, limit: HISTORIAL_PAGE_SIZE });
  if (paging.key !== resetKey) setPaging({ key: resetKey, limit: HISTORIAL_PAGE_SIZE });
  const limit = paging.key === resetKey ? paging.limit : HISTORIAL_PAGE_SIZE;
  const [showTop, setShowTop] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Otro filtro: la lista regresa arriba (el evento scroll apaga el botón "Arriba").
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [resetKey]);

  const groups = useMemo(() => groupByHour(entries, entryDate), [entries]);
  const visible = useMemo(() => sliceGroups(groups, limit), [groups, limit]);
  const shown = countItems(visible);
  const remaining = entries.length - shown;

  // Estable: un ref nuevo en cada render volvería a medir el alto cada vez.
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    listRef(node);
  }, [listRef]);

  const scrollTop = () => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    scrollRef.current?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div
        ref={setRefs}
        className="td-scroll-visible"
        onScroll={event => setShowTop(event.currentTarget.scrollTop > SHOW_TOP_AFTER_PX)}
        style={{ flex: 1, minHeight: 0, maxHeight, overflowY: "auto", paddingRight: 4 }}
        data-testid="historial-list"
      >
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
            <Loader2 size={24} style={{ color: "#E0221A" }} className="animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, opacity: 0.3 }}>
            <Receipt size={36} style={{ marginBottom: 8 }} />
            <p style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em" }}>{emptyText}</p>
          </div>
        ) : (
          <>
            {visible.map(group => (
              <section key={group.key}>
                {/* Encabezado fijo arriba mientras se recorre su hora. */}
                <h4
                  style={{
                    position: "sticky", top: 0, zIndex: 2, margin: 0,
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 4px 6px",
                    background: "var(--td-popup-bg)",
                    fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.14em",
                    color: "var(--td-text-md)",
                  }}
                >
                  <span style={{ color: "var(--td-text-hi)" }}>{group.label}</span>
                  <span aria-hidden style={{ flex: 1, height: 1, background: "var(--td-divider)" }} />
                  <span style={{ color: "var(--td-text-ghost)", letterSpacing: "0.1em" }}>{ticketsLabel(group.total)}</span>
                </h4>
                {/* Grid, no flex: las filas de un grid no se encogen. minmax(0, 1fr):
                    un nombre largo no ensancha la columna (se corta con "…"). */}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6, paddingBottom: 6 }}>
                  {group.items.map(entry => (
                    <div key={entryKey(entry)}>{renderEntry(entry)}</div>
                  ))}
                </div>
              </section>
            ))}

            {remaining > 0 ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 16px" }}>
                <button
                  type="button"
                  onClick={() => setPaging({ key: resetKey, limit: limit + HISTORIAL_PAGE_SIZE })}
                  data-testid="historial-show-more"
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)",
                    borderRadius: 12, padding: "10px 18px", cursor: "pointer",
                    fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em",
                    color: "var(--td-text-hi)",
                  }}
                >
                  <ChevronDown size={14} aria-hidden />
                  Mostrar {Math.min(HISTORIAL_PAGE_SIZE, remaining)} más
                  <span style={{ color: "var(--td-text-ghost)" }}>· quedan {remaining.toLocaleString("es-MX")}</span>
                </button>
              </div>
            ) : entries.length > HISTORIAL_PAGE_SIZE ? (
              <p style={{ textAlign: "center", padding: "10px 0 16px", margin: 0, fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--td-text-ghost)" }}>
                Son todos · {ticketsLabel(entries.length)}
              </p>
            ) : null}
          </>
        )}
      </div>

      {showTop && (
        <button
          type="button"
          onClick={scrollTop}
          title="Volver arriba"
          aria-label="Volver arriba"
          style={{
            position: "absolute", right: 18, bottom: 14, zIndex: 3,
            width: 42, height: 42, borderRadius: 999, padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "#E0221A", color: "#fff", border: "none", cursor: "pointer",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          <ArrowUp size={18} aria-hidden />
        </button>
      )}
    </div>
  );
}
