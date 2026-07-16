import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Check, Loader2 } from "lucide-react";
import { closeSession, getCashReport, type CashSession, type CashSessionReport } from "@tadaima/api";
import { getTodayLocal } from "@/lib/date";

interface CloseCashModalProps {
  session: CashSession;
  /** Título opcional arriba del modal (default "Corte de Caja"). */
  title?: string;
  /** Mensaje contextual opcional (p.ej. por qué se está pidiendo el corte). */
  reason?: string;
  /** Se llama tras cerrar con éxito, con el corte detallado (o null si el fetch del reporte falló). */
  onClosed: (report: CashSessionReport | null) => void;
  onCancel: () => void;
}

/**
 * Modal compartido de "Cerrar Caja / Corte": captura el efectivo contado y
 * cierra la sesión activa. Extraído de SellPage para poder invocarlo también
 * desde el guard de logout (Layout) y el bloqueo de venta con caja de días
 * anteriores. Solo cierra — el resumen/print (CashCloseSummaryModal) lo decide
 * el consumidor con el report que recibe en onClosed.
 */
export function CloseCashModal({ session, title, reason, onClosed, onCancel }: CloseCashModalProps) {
  const queryClient = useQueryClient();
  const [closeCashAmount, setCloseCashAmount] = useState("");
  const [closingCashLoading, setClosingCashLoading] = useState(false);

  const handleCloseCash = async () => {
    const amount = parseFloat(closeCashAmount) || 0;
    setClosingCashLoading(true);
    try {
      // Manda el día local del corte — el timestamp UTC del backend ya cae
      // en "mañana" después de las 11pm Tijuana (el corte se iba al día 12).
      const closedSession = await closeSession(amount, getTodayLocal());
      // Limpiar la caché de sesión activa SINCRÓNICAMENTE antes de cualquier
      // setState. El efecto de auto-asignación de SellPage lee `cashSession`
      // de la caché — si dejamos la versión vieja "open" y solo invalidamos,
      // el re-render entre setActiveStore(null) y el refetch reasigna la tienda
      // y el admin nunca ve el selector (síntoma: solo Tienda 1 sin hard reload).
      queryClient.setQueryData(["cash", "activeSession"], null);
      void queryClient.invalidateQueries({ queryKey: ["cash"] });
      toast.success("Caja cerrada — corte registrado");

      // Trae el corte detallado del endpoint /reports/cash para que el
      // consumidor pueda abrir el resumen con opción de imprimir.
      let report: CashSessionReport | null = null;
      try {
        const today = new Date();
        const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const r = await getCashReport({
          register_id: closedSession.register_id,
          from: localDate,
          to: localDate,
        });
        report = r.sessions.find(x => x.id === closedSession.id) ?? null;
      } catch {
        // Si el fetch falla, no rompemos el flujo de cierre — solo no habrá resumen
      }
      onClosed(report);
    } catch {
      toast.error("Error al cerrar la caja");
    } finally {
      setClosingCashLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)" }} onClick={onCancel} />
      <div style={{ position: "relative", background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", borderRadius: 28, padding: 32, minWidth: 380, maxWidth: 460, width: "100%" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: reason ? 12 : 24 }}>
          <div>
            <h3 style={{ color: "var(--td-text-hi)", fontSize: 17, fontWeight: 900, margin: 0 }}>{title ?? "Corte de Caja"}</h3>
            <p style={{ color: "var(--td-text-ghost)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", margin: "4px 0 0" }}>
              {session.register?.name ?? "Caja"} · Apertura {session.opened_at ? new Date(session.opened_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—"}
            </p>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--td-text-ghost)", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Contexto (p.ej. "cierra tu caja para salir") */}
        {reason && (
          <div style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)", borderRadius: 14, padding: "10px 14px", marginBottom: 20 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#F59E0B" }}>{reason}</p>
          </div>
        )}

        {/* Session info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Cajero",           value: session.user?.name ?? "—" },
            { label: "Efectivo inicial", value: `$${(session.opening_cash ?? 0).toLocaleString("es-MX")}` },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 14, padding: "12px 16px" }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</p>
              <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 900, color: "var(--td-text-hi)" }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Closing cash input */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--td-text-ghost)", marginBottom: 8 }}>
            Efectivo en Caja al Cierre ($MXN)
          </label>
          <input
            type="number" min={0} step={1} value={closeCashAmount}
            onChange={e => setCloseCashAmount(e.target.value)}
            placeholder="0" autoFocus
            data-testid="close-cash-input"
            style={{ width: "100%", background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 14, color: "var(--td-input-text)", padding: "12px 16px", fontSize: 22, fontWeight: 900, outline: "none", boxSizing: "border-box" as const }}
          />
          <p style={{ margin: "8px 0 0", fontSize: 10, color: "var(--td-text-ghost)", fontWeight: 600 }}>
            Este valor se compara contra el dinero físico esperado en caja. Las ventas con tarjeta sí salen en reportes y tickets, pero no cuentan para el faltante o sobrante del cajón.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 14, color: "var(--td-text-lo)", padding: "12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Cancelar
          </button>
          <button
            onClick={() => { void handleCloseCash(); }}
            disabled={closingCashLoading}
            data-testid="close-cash-confirm"
            style={{ flex: 2, background: "linear-gradient(135deg, #7A3800, #F59E0B)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 14, color: "#fff", padding: "12px", fontSize: 12, fontWeight: 900, cursor: closingCashLoading ? "not-allowed" : "pointer", opacity: closingCashLoading ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {closingCashLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {closingCashLoading ? "Cerrando..." : "Confirmar Corte"}
          </button>
        </div>
      </div>
    </div>
  );
}
