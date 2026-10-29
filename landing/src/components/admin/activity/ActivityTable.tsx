import { Fragment, useState } from "react";
import { ChevronRight, History, Loader2 } from "lucide-react";
import type { ActivityEvent, ActivityPagination } from "@tadaima/api";
import { TablePaginationFooter } from "@/components/products/TablePaginationFooter";
import { paginationRangeLabel } from "@/lib/paginationLabel";
import { describeEvent, formatChanges, formatEventTime, groupStyle, productTypeLabel } from "@/lib/activityFormat";
import { ACTIVITY_PAGE_SIZES } from "@/lib/activityParams";

interface Props {
  events: ActivityEvent[];
  pagination: ActivityPagination | undefined;
  isLoading: boolean;
  /** Texto del velo mientras consulta ("Filtrando…" / "Actualizando nuevos registros…"); null = quieto. */
  loadingMessage: string | null;
  error: string | null;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onPickProduct: (productId: number) => void;
  onPickUser: (userId: number) => void;
}

/** Tabla del feed: una fila por evento, clic = detalle (cambios o meta crudo). */
export function ActivityTable({ events, pagination, isLoading, loadingMessage, error, pageSize, onPageChange, onPageSizeChange, onPickProduct, onPickUser }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const pageIndex = Math.max(0, (pagination?.current_page ?? 1) - 1);
  const pageCount = Math.max(1, pagination?.last_page ?? 1);

  const isFetching = loadingMessage !== null;

  return (
    <div className="rounded-2xl overflow-hidden relative" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
      {isFetching && !isLoading && (
        <div
          className="absolute inset-0 z-10 flex items-start justify-center pt-16"
          style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(1px)" }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 rounded-2xl px-5 py-3 shadow-2xl" style={{ background: "var(--td-card-bg)", border: "1px solid rgba(255,68,34,0.45)" }}>
            <Loader2 size={18} className="animate-spin" style={{ color: "#FF6B4A" }} />
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--td-text-hi)" }}>{loadingMessage}</span>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 gap-3">
            <Loader2 size={20} className="animate-spin" style={{ color: "#FF6B4A" }} />
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--td-text-md)" }}>{loadingMessage ?? "Cargando…"}</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 px-6 text-center">
            <p className="text-xs font-black uppercase tracking-widest" style={{ color: "#f87171" }}>No se pudo cargar la actividad</p>
            <p className="text-[11px]" style={{ color: "var(--td-text-md)" }}>{error}</p>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 opacity-40 gap-2">
            <History size={28} />
            <p className="text-xs font-bold uppercase tracking-widest">Sin actividad con estos filtros</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead style={{ background: "rgba(0,0,0,0.2)", position: "sticky", top: 0, zIndex: 1 }}>
              <tr className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                <th className="text-left py-2 px-3 w-8"></th>
                <th className="text-left py-2 px-3 whitespace-nowrap">Cuándo</th>
                <th className="text-left py-2 px-3">Quién</th>
                <th className="text-left py-2 px-3">Qué</th>
                <th className="text-left py-2 px-3">Producto</th>
                <th className="text-left py-2 px-3">Dónde</th>
                <th className="text-left py-2 px-3">Detalle</th>
              </tr>
            </thead>
            <tbody style={{ opacity: isFetching ? 0.6 : 1, transition: "opacity .15s" }}>
              {events.map((e) => {
                const isOpen = expanded === e.id;
                const g = groupStyle(e.group);
                const changes = e.source === "log" ? formatChanges(e.meta) : [];
                const detail = describeEvent(e);
                return (
                  <Fragment key={e.id}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : e.id)}
                      className="border-t cursor-pointer hover:bg-white/[0.02] align-top"
                      style={{ borderColor: "var(--td-divider)" }}
                    >
                      <td className="py-2 px-3">
                        <ChevronRight size={12} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", color: isOpen ? "#FF6B4A" : "var(--td-text-lo)" }} />
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap tabular-nums" style={{ color: "var(--td-text-md)" }} title={e.at}>
                        {formatEventTime(e.at)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {e.user ? (
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); onPickUser(e.user!.id); }}
                            className="font-black hover:underline"
                            style={{ color: "var(--td-text-hi)" }}
                            title="Ver solo lo de esta persona"
                          >
                            {e.user.name}
                          </button>
                        ) : (
                          <span className="italic" style={{ color: "var(--td-text-lo)" }}>Sistema</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[9px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 whitespace-nowrap"
                            style={{ background: `rgba(${g.rgb},0.14)`, color: g.color, border: `1px solid ${g.color}44` }}
                          >
                            {g.label}
                          </span>
                          <span className="font-bold" style={{ color: "var(--td-text-hi)" }}>{e.title}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 max-w-[260px]">
                        {e.product ? (
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); onPickProduct(e.product!.id); }}
                            className="text-left hover:underline min-w-0"
                            title="Ver todo el historial de este producto"
                          >
                            <span className="block truncate font-bold" style={{ color: e.product.deleted ? "var(--td-text-lo)" : "var(--td-text-hi)" }}>
                              {e.product.name}
                              {e.product.deleted && <span className="ml-1 text-[9px] font-black uppercase" style={{ color: "#f87171" }}>borrado</span>}
                            </span>
                            <span className="block truncate font-mono text-[10px]" style={{ color: "var(--td-text-lo)" }}>
                              {e.product.sku ?? "—"}{productTypeLabel(e.product.type) ? ` · ${productTypeLabel(e.product.type)}` : ""}
                            </span>
                          </button>
                        ) : (
                          <span style={{ color: "var(--td-text-lo)" }}>—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap" style={{ color: "var(--td-text-md)" }}>
                        {e.store?.name ?? "—"}
                        {e.warehouse && e.warehouse.type === "bodega" && (
                          <span className="ml-1 text-[9px] font-black uppercase tracking-wider" style={{ color: "#FBBF24" }}>bodega</span>
                        )}
                      </td>
                      <td className="py-2 px-3 max-w-[420px]" style={{ color: "var(--td-text-md)" }}>
                        {e.source === "mov" && e.qty_delta !== null && (
                          <span className="font-black tabular-nums mr-2" style={{ color: e.qty_delta > 0 ? "#34D399" : e.qty_delta < 0 ? "#f87171" : "var(--td-text-lo)" }}>
                            {e.qty_delta > 0 ? "+" : e.qty_delta < 0 ? "−" : ""}{Math.abs(e.qty_delta).toLocaleString("es-MX")}
                          </span>
                        )}
                        <span className={isOpen ? "" : "line-clamp-2"}>{detail || <span style={{ color: "var(--td-text-lo)" }}>—</span>}</span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: "rgba(0,0,0,0.18)" }}>
                        <td colSpan={7} className="px-6 py-3">
                          {changes.length > 0 && (
                            <div className="rounded-xl overflow-hidden mb-3" style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-divider)" }}>
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr style={{ color: "var(--td-text-lo)" }}>
                                    <th className="text-left py-1.5 px-3 text-[9px] font-black uppercase tracking-widest">Campo</th>
                                    <th className="text-left py-1.5 px-3 text-[9px] font-black uppercase tracking-widest">Antes</th>
                                    <th className="text-left py-1.5 px-3 text-[9px] font-black uppercase tracking-widest">Después</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {changes.map((c) => (
                                    <tr key={c.field} className="border-t" style={{ borderColor: "var(--td-divider)" }}>
                                      <td className="py-1.5 px-3 font-black" style={{ color: "var(--td-text-hi)" }}>{c.label}</td>
                                      <td className="py-1.5 px-3" style={{ color: "#f87171" }}>{c.from}</td>
                                      <td className="py-1.5 px-3" style={{ color: "#34D399" }}>{c.to}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <div className="grid gap-x-6 gap-y-1 text-[11px]" style={{ gridTemplateColumns: "auto 1fr", color: "var(--td-text-md)" }}>
                            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Id</span>
                            <span className="font-mono">{e.id}{e.entity ? ` · ${e.entity.type}#${e.entity.id ?? "—"}` : ""}</span>
                            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Acción</span>
                            <span className="font-mono">{e.action}</span>
                            {e.warehouse && (<>
                              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Almacén</span>
                              <span>{e.warehouse.name}{e.store ? ` (${e.store.name})` : ""}</span>
                            </>)}
                            {e.reference && (<>
                              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Referencia</span>
                              <span className="font-mono">{e.reference}</span>
                            </>)}
                            {e.description && (<>
                              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Descripción</span>
                              <span>{e.description}</span>
                            </>)}
                            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Hora exacta</span>
                            <span className="font-mono">{formatEventTime(e.at, true)} (Tijuana)</span>
                          </div>
                          {e.meta && Object.keys(e.meta).length > 0 && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Datos técnicos</summary>
                              <pre className="mt-1 rounded-lg p-2 text-[10px] overflow-auto max-h-60" style={{ background: "var(--td-input-bg)", color: "var(--td-text-md)" }}>
                                {JSON.stringify(e.meta, null, 2)}
                              </pre>
                            </details>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {pagination && (
        <TablePaginationFooter
          label={paginationRangeLabel({ pageIndex, pageSize, rowsOnPage: events.length, total: pagination.total, pageCount })}
          isFetching={isFetching}
          pageIndex={pageIndex}
          pageCount={pageCount}
          pageSize={pageSize}
          pageSizeOptions={ACTIVITY_PAGE_SIZES}
          onPageChange={(idx) => onPageChange(idx + 1)}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}
