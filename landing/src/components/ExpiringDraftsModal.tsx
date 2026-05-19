import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { extendDraft, cancelDraft, type ExpiringDraft } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";
import { useExpiringDraftsQuery } from "@/hooks/queries/useDrafts";
import { AlertTriangle, Clock, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

/**
 * Modal top-priority que aparece cuando el cajero tiene drafts marcados como
 * "por vencer" por el job `drafts:warn-expiring`. Da 60s de grace (configurado
 * en backend con `SalesDraft::WARNING_GRACE_MINUTES = 1`) para que decida:
 *
 *  - Mantener carrito → POST /sales-drafts/{id}/extend (resetea expires_at +5min)
 *  - Cancelar venta   → DELETE /sales-drafts/{id}
 *  - Sin acción       → el job `drafts:expire-warned` lo cancela al pasar el grace
 *
 * Vive en Layout.tsx para que sea visible desde cualquier página (Caja, Reportes,
 * Productos, etc.). No se cierra con Escape ni clickeando fuera.
 */
export function ExpiringDraftsModal() {
  const expiringQuery = useExpiringDraftsQuery();
  const queryClient = useQueryClient();
  const drafts = expiringQuery.data ?? [];
  const [actingOn, setActingOn] = useState<Set<number>>(new Set());
  const [tick, setTick] = useState(0);

  // Re-render cada segundo para que el countdown se actualice.
  useEffect(() => {
    if (drafts.length === 0) return;
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [drafts.length]);

  if (drafts.length === 0) return null;

  const markActing = (id: number, on: boolean) => {
    setActingOn(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleKeep = async (d: ExpiringDraft) => {
    markActing(d.id, true);
    try {
      await extendDraft(d.id);
      toast.success(`Carrito mantenido (${d.store_name ?? 'Caja'})`, {
        icon: <ShoppingCart className="text-emerald-500" size={16} />,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.salesDrafts.all });
    } catch {
      toast.error("No se pudo mantener el carrito. Reintenta.");
    } finally {
      markActing(d.id, false);
    }
  };

  const handleCancel = async (d: ExpiringDraft) => {
    markActing(d.id, true);
    try {
      await cancelDraft(d.id);
      toast.info(`Venta cancelada · stock liberado`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.salesDrafts.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    } catch {
      toast.error("No se pudo cancelar la venta. Reintenta.");
    } finally {
      markActing(d.id, false);
    }
  };

  // Countdown derivado: del `cancels_at` del backend menos now() local
  const computeRemaining = (cancelsAtIso: string): number => {
    const cancelsAt = new Date(cancelsAtIso).getTime();
    return Math.max(0, Math.floor((cancelsAt - Date.now()) / 1000));
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="expiring-title"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        style={{
          width: "min(620px, 100%)",
          background: "linear-gradient(180deg, rgba(45,10,0,0.95), rgba(20,5,0,0.95))",
          border: "1px solid rgba(224,34,26,0.55)",
          borderRadius: 18,
          padding: 24,
          color: "#fff",
          boxShadow: "0 30px 80px rgba(224,34,26,0.25), 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: "rgba(224,34,26,0.18)",
            border: "1px solid rgba(224,34,26,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <AlertTriangle size={24} color="#fca5a5" />
          </div>
          <div>
            <h2 id="expiring-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 0.2 }}>
              Venta por vencer
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#fecaca" }}>
              Confirma si sigues atendiendo. Sin respuesta el carrito se cancela y se libera el stock.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          {drafts.map(d => {
            const remaining = computeRemaining(d.cancels_at);
            const busy = actingOn.has(d.id);
            return (
              <div
                key={d.id}
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {d.store_name ?? `Tienda ${d.store_id}`}
                    </div>
                    <div style={{ fontSize: 13, color: "#cbd5e1", marginTop: 2 }}>
                      {d.item_count} producto{d.item_count === 1 ? "" : "s"}
                      {d.customer_name ? ` · Cliente: ${d.customer_name}` : ""}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 6 }}>
                      ${d.subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: 13, color: remaining <= 15 ? "#fca5a5" : "#fbbf24",
                    fontWeight: 700, whiteSpace: "nowrap",
                  }}>
                    <Clock size={14} />
                    {remaining}s
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => void handleKeep(d)}
                    disabled={busy}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(16,185,129,0.45)",
                      background: busy ? "rgba(16,185,129,0.2)" : "rgba(16,185,129,0.85)",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: busy ? "default" : "pointer",
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    {busy ? "..." : "Mantener carrito"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCancel(d)}
                    disabled={busy}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(224,34,26,0.45)",
                      background: "transparent",
                      color: "#fecaca",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: busy ? "default" : "pointer",
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    Cancelar venta
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tick anti-stale del countdown — fuerza re-render */}
        <span aria-hidden="true" style={{ display: "none" }}>{tick}</span>
      </div>
    </div>
  );
}
