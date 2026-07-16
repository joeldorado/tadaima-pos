import { useMemo, useState } from "react";
import { X, Loader2, Check, DollarSign, Search, PackageCheck } from "lucide-react";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { updateProduct } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";

const TP = "var(--td-text-hi)";
const TS = "var(--td-text-md)";
const TM = "var(--td-text-lo)";

/** Producto sin costo, como lo necesita esta tabla (subset del view-model). */
export interface MissingCostProduct {
  id: number;
  nombre: string;
  sku: string;
  categoria: string;
  imagen: string;
  precioA: number;
}

interface Props {
  /** Lista completa de productos sin costo (se congela al abrir el modal). */
  products: MissingCostProduct[];
  /** Solo admin/gerente puede guardar (el backend gatea igual). */
  canEdit: boolean;
  fmt: (n: number) => string;
  onClose: () => void;
}

type RowStatus = "idle" | "saving" | "saved" | "error";

interface Row extends MissingCostProduct {
  draft: string;
  status: RowStatus;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 12,
  border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)",
  color: TP, fontSize: 15, fontWeight: 900, outline: "none", boxSizing: "border-box",
  textAlign: "right",
};

/**
 * Atajo dedicado para que el dueño/admin NOTE qué productos no tienen capturado
 * el costo real y lo llene rápido, sin abrir el editor completo del producto.
 *
 * La lista se congela al abrir (snapshot); cada fila guarda solo `{ cost }` con
 * un PUT /products/{id}. Al guardar la fila se marca verde y baja el contador
 * "faltan X"; se invalida el cache de productos para que el grid y el botón de
 * afuera se actualicen solos. El editor normal (pestaña Precios) no se toca.
 */
export function MissingCostModal({ products, canEdit, fmt, onClose }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  // Snapshot inmutable al montar: no queremos que la tabla se reordene sola
  // mientras el usuario captura (el refetch de afuera no debe moverla).
  const [rows, setRows] = useState<Row[]>(() =>
    products.map(p => ({ ...p, draft: "", status: "idle" as RowStatus })),
  );

  const pending = rows.filter(r => r.status !== "saved").length;
  const done = rows.length - pending;

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.nombre.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const patchRow = (id: number, patch: Partial<Row>) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const saveRow = async (row: Row) => {
    if (!canEdit || row.status === "saving") return;
    const value = parseFloat(row.draft);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error(`Captura un costo válido para "${row.nombre}"`);
      return;
    }
    patchRow(row.id, { status: "saving" });
    try {
      await updateProduct(row.id, { cost: value });
      patchRow(row.id, { status: "saved" });
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    } catch (err: unknown) {
      patchRow(row.id, { status: "error" });
      const msg = (err as { message?: string })?.message ?? "No se pudo guardar el costo";
      toast.error(msg);
    }
  };

  const allDone = rows.length > 0 && pending === 0;

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <Motion.div
        data-testid="missing-cost-modal"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="relative w-full sm:max-w-[820px] max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", borderBottom: "1px solid var(--td-card-border)" }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DollarSign size={22} color="#EF4444" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: TP }}>Productos sin Costo</p>
            <p style={{ margin: 0, fontSize: 11, color: TM, fontWeight: 700 }}>
              {rows.length === 0
                ? "Todo tu catálogo tiene costo real"
                : `Captura el costo real · faltan ${pending}${done > 0 ? ` · ${done} listo${done === 1 ? "" : "s"}` : ""}`}
            </p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: TM }}>
            <X size={14} />
          </button>
        </div>

        {/* Progreso */}
        {rows.length > 0 && (
          <div style={{ padding: "10px 22px 0" }}>
            <div style={{ height: 6, borderRadius: 999, background: "var(--td-input-bg)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((done / rows.length) * 100)}%`, background: allDone ? "#10b981" : "#EF4444", borderRadius: 999, transition: "width 240ms ease" }} />
            </div>
          </div>
        )}

        {/* Buscador */}
        {rows.length > 4 && (
          <div style={{ padding: "12px 22px 0" }}>
            <div style={{ position: "relative" }}>
              <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: TM }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre o SKU"
                style={{ ...inputStyle, textAlign: "left", paddingLeft: 34, fontSize: 13, fontWeight: 700 }}
              />
            </div>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 22px 18px" }}>
          {rows.length === 0 || allDone ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "48px 16px", textAlign: "center" }}>
              <div style={{ width: 60, height: 60, borderRadius: 18, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <PackageCheck size={30} color="#10b981" />
              </div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: TP }}>
                {rows.length === 0 ? "No hay productos sin costo 🎉" : "¡Listo! Todos con costo 🎉"}
              </p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: TM, maxWidth: 320 }}>
                Un producto sin costo real queda bloqueado para venta. Aquí aparecen en cuanto detectemos alguno.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Encabezado tabla (desktop) */}
              <div className="hidden sm:grid" style={{ gridTemplateColumns: "1fr 120px 150px", gap: 12, padding: "0 4px 4px", fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM }}>
                <span>Producto</span>
                <span style={{ textAlign: "right" }}>Precio venta</span>
                <span style={{ textAlign: "right" }}>Costo real</span>
              </div>

              {visibleRows.map(row => {
                const saved = row.status === "saved";
                const saving = row.status === "saving";
                const accent = saved ? "#10b981" : "#EF4444";
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_120px_150px] items-center"
                    style={{
                      gap: 12, padding: "10px 12px", borderRadius: 14,
                      background: saved ? "rgba(16,185,129,0.06)" : "var(--td-card-bg)",
                      border: `1px solid ${saved ? "rgba(16,185,129,0.28)" : "var(--td-card-border)"}`,
                      opacity: saved ? 0.85 : 1, transition: "background 200ms ease, opacity 200ms ease",
                    }}
                  >
                    {/* Producto */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "var(--td-input-bg)", border: "1px solid var(--td-card-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {row.imagen
                          ? <img src={row.imagen} alt={row.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <DollarSign size={16} color={TM} />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: TP, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.nombre}</p>
                        <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: TM }}>
                          {row.sku}{row.categoria ? ` · ${row.categoria}` : ""}
                        </p>
                      </div>
                    </div>

                    {/* Precio venta (referencia) */}
                    <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: TS }}>
                      <span className="sm:hidden" style={{ fontSize: 10, fontWeight: 800, color: TM, marginRight: 6, textTransform: "uppercase" as const }}>Precio</span>
                      {fmt(row.precioA)}
                    </div>

                    {/* Costo real */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {saved ? (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, fontSize: 14, fontWeight: 900, color: accent }}>
                          <Check size={15} /> {fmt(parseFloat(row.draft) || 0)}
                        </div>
                      ) : (
                        <>
                          <input
                            data-testid={`mc-cost-${row.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={row.draft}
                            disabled={!canEdit || saving}
                            onChange={e => patchRow(row.id, { draft: e.target.value, status: "idle" })}
                            onKeyDown={e => { if (e.key === "Enter") void saveRow(row); }}
                            placeholder="0.00"
                            style={{ ...inputStyle, borderColor: row.status === "error" ? "rgba(239,68,68,0.6)" : "var(--td-input-border)" }}
                          />
                          {canEdit && (
                            <button
                              data-testid={`mc-save-${row.id}`}
                              onClick={() => void saveRow(row)}
                              disabled={saving || row.draft.trim() === ""}
                              style={{
                                width: 38, height: 38, flexShrink: 0, borderRadius: 11, border: "none",
                                background: row.draft.trim() === "" ? "var(--td-input-bg)" : "#10b981",
                                color: row.draft.trim() === "" ? TM : "#fff",
                                cursor: saving || row.draft.trim() === "" ? "default" : "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}
                              title="Guardar costo"
                            >
                              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {!canEdit && (
                <p style={{ margin: "8px 4px 0", fontSize: 11, fontWeight: 700, color: TM }}>
                  Solo un administrador o gerente puede capturar el costo. Aquí puedes ver cuáles faltan.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--td-card-border)", display: "flex", flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "12px 14px", borderRadius: 12, background: allDone ? "#10b981" : "var(--td-card-bg)", border: allDone ? "none" : "1px solid var(--td-card-border)", color: allDone ? "#fff" : TS, fontSize: 12, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.06em", cursor: "pointer" }}
          >
            {allDone ? "Cerrar · todo con costo" : "Cerrar"}
          </button>
        </div>
      </Motion.div>
    </div>
  );
}
