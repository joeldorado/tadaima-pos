import { useEffect, useState } from "react";
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
  const [closeUsdAmount, setCloseUsdAmount] = useState("");
  const [closingCashLoading, setClosingCashLoading] = useState(false);

  // "Debe haber" en vivo (Joel 2026-07-30): el cajero ve el objetivo de cada
  // moneda ANTES de contar — mismo /reports/cash del resumen, pero sobre la
  // sesión aún abierta. Solo lectura; si el fetch falla, el corte sigue igual.
  const [preview, setPreview] = useState<CashSessionReport | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const today = getTodayLocal();
        const r = await getCashReport({ register_id: session.register_id, from: today, to: today });
        if (alive) setPreview(r.sessions.find(x => x.id === session.id) ?? null);
      } catch {
        // Sin preview no se bloquea el corte — el resumen final lo dirá igual.
      } finally {
        if (alive) setPreviewLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [session.id, session.register_id]);

  const fmt = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;
  const pv = preview;
  // Parte en PESOS de lo cobrado (lo demás entró como billetes americanos).
  const pesosCobrados = pv ? Math.round((Number(pv.cash_collected ?? 0) - Number(pv.usd_mxn_equiv ?? 0)) * 100) / 100 : 0;
  const debeMxn = pv ? Number(pv.expected_cash_mxn ?? pv.expected_cash ?? 0) : 0;
  const debeUsd = pv ? Number(pv.expected_usd ?? 0) : 0;
  const entradas = pv ? Number(pv.total_entradas ?? 0) : 0;
  const salidas = pv ? Number(pv.total_salidas ?? 0) : 0;
  const ajustes = pv ? Number(pv.total_ajustes ?? 0) : 0;
  const insumos = pv ? Number(pv.total_supplies ?? 0) : 0;

  const handleCloseCash = async () => {
    const amount = parseFloat(closeCashAmount) || 0;
    // Dólares contados: el campo vacío también cuenta como capturado (0) —
    // el cajero ya vio el campo; si de verdad no hay billetes americanos,
    // el corte debe decir "esperabas US$X y contaste US$0".
    const usdAmount = parseFloat(closeUsdAmount) || 0;
    setClosingCashLoading(true);
    try {
      // Manda el día local del corte — el timestamp UTC del backend ya cae
      // en "mañana" después de las 11pm Tijuana (el corte se iba al día 12).
      const closedSession = await closeSession(amount, getTodayLocal(), usdAmount);
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

        {/* DEBE HABER — objetivo por moneda antes de contar (Joel 2026-07-30).
            Solo texto: el detalle completo ya vive en el resumen del corte. */}
        <div
          data-testid="close-cash-expected"
          style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.28)", borderRadius: 14, padding: "12px 16px", marginBottom: 20 }}
        >
          <p style={{ margin: 0, fontSize: 9, fontWeight: 900, color: "#34d399", textTransform: "uppercase", letterSpacing: "0.15em" }}>
            Debe haber en el cajón
          </p>
          {previewLoading ? (
            <p style={{ margin: "8px 0 0", fontSize: 11, fontWeight: 700, color: "var(--td-text-ghost)" }}>Calculando…</p>
          ) : !pv ? (
            <p style={{ margin: "8px 0 0", fontSize: 11, fontWeight: 700, color: "var(--td-text-ghost)" }}>
              No se pudo calcular ahorita — al confirmar, el corte te dirá el esperado igual.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, margin: "8px 0 10px" }}>
                {[
                  { label: "Efectivo inicial", value: `+ ${fmt(Number(pv.opening_cash ?? 0))}`, show: true },
                  { label: "Ventas en efectivo (pesos)", value: `+ ${fmt(pesosCobrados)}`, show: true },
                  { label: "Entradas de caja", value: `+ ${fmt(entradas)}`, show: entradas > 0 },
                  { label: insumos > 0 ? `Salidas (incluye insumos ${fmt(insumos)})` : "Salidas de caja", value: `− ${fmt(salidas)}`, show: salidas > 0 },
                  { label: "Ajustes", value: `${ajustes >= 0 ? "+" : "−"} ${fmt(Math.abs(ajustes))}`, show: ajustes !== 0 },
                ].filter(r => r.show).map(r => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--td-text-lo)" }}>{r.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 900, color: "var(--td-text-hi)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{r.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: "1px dashed rgba(16,185,129,0.35)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: "var(--td-text-hi)" }}>Pesos</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: "var(--td-text-hi)", fontVariantNumeric: "tabular-nums" }}>{fmt(debeMxn)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#34d399" }}>Dólares (billetes)</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: "#34d399", fontVariantNumeric: "tabular-nums" }}>US${debeUsd.toLocaleString("es-MX", { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Closing cash inputs: pesos y dólares POR SEPARADO (2026-07-30) */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--td-text-ghost)", marginBottom: 8 }}>
            Pesos contados en el cajón ($MXN)
          </label>
          <input
            type="number" min={0} step={1} value={closeCashAmount}
            onChange={e => setCloseCashAmount(e.target.value)}
            placeholder="0" autoFocus
            data-testid="close-cash-input"
            style={{ width: "100%", background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 14, color: "var(--td-input-text)", padding: "12px 16px", fontSize: 22, fontWeight: 900, outline: "none", boxSizing: "border-box" as const }}
          />
          <label style={{ display: "block", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#34d399", margin: "14px 0 8px" }}>
            Dólares contados (US$) — billetes americanos
          </label>
          <input
            type="number" min={0} step={1} value={closeUsdAmount}
            onChange={e => setCloseUsdAmount(e.target.value)}
            placeholder="0"
            data-testid="close-cash-usd-input"
            style={{ width: "100%", background: "var(--td-input-bg)", border: "1px solid rgba(16,185,129,0.45)", borderRadius: 14, color: "var(--td-input-text)", padding: "12px 16px", fontSize: 22, fontWeight: 900, outline: "none", boxSizing: "border-box" as const }}
          />
          <p style={{ margin: "8px 0 0", fontSize: 10, color: "var(--td-text-ghost)", fontWeight: 600 }}>
            Cuenta los PESOS en su campo y los DÓLARES en el suyo (sin convertir). El corte
            te dirá cuánto debía haber de cada moneda. Tarjetas y transferencias salen en
            reportes, pero no entran al esperado ni al faltante/sobrante.
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
