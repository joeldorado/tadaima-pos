import { X, LogOut, Wallet, TriangleAlert } from "lucide-react";
import type { CashSession } from "@tadaima/api";

interface LogoutCashReminderProps {
  session: CashSession;
  /** La caja es de un día-negocio anterior: el backend no deja vender con ella. */
  isStale: boolean;
  onCorte: () => void;
  onExitWithoutCorte: () => void;
  onCancel: () => void;
}

/**
 * Recordatorio al cerrar sesión con la caja abierta (Joel 2026-09-26). El corte
 * es opcional: salir sin corte deja la caja abierta (cada persona tiene la suya,
 * ADR-017) para poder cambiar de usuario; al volver a entrar sigue igual.
 */
export function LogoutCashReminder({ session, isStale, onCorte, onExitWithoutCorte, onCancel }: LogoutCashReminderProps) {
  const openedAt = session.opened_at
    ? new Date(session.opened_at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
    : "—";

  return (
    <div data-testid="logout-cash-reminder" style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)" }} onClick={onCancel} />
      <div style={{ position: "relative", background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", borderRadius: 28, padding: 32, maxWidth: 440, width: "100%" }}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ color: "var(--td-text-hi)", fontSize: 17, fontWeight: 900, margin: 0 }}>Tu caja sigue abierta</h3>
            <p style={{ color: "var(--td-text-ghost)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", margin: "4px 0 0" }}>
              {session.register?.name ?? "Caja"} · Abierta {openedAt}
            </p>
          </div>
          <button onClick={onCancel} aria-label="Cancelar" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--td-text-ghost)", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 600, lineHeight: 1.5, color: "var(--td-text-md)" }}>
          Puedes hacer el corte ahora o salir y dejarla abierta, por ejemplo para cambiar de usuario.
          Cuando vuelvas a entrar, tu caja sigue donde la dejaste.
        </p>

        {isStale && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.30)", borderRadius: 14, padding: "10px 14px", marginBottom: 16 }}>
            <TriangleAlert size={14} style={{ color: "#F59E0B", flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#F59E0B" }}>
              Es de un día anterior: no podrás vender con ella hasta hacer su corte.
            </p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            data-testid="logout-reminder-corte"
            onClick={onCorte}
            style={{ background: "linear-gradient(135deg, #7A3800, #F59E0B)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 14, color: "#fff", padding: "12px", fontSize: 12, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <Wallet size={14} /> Hacer corte y salir
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onCancel} style={{ flex: 1, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 14, color: "var(--td-text-lo)", padding: "12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Cancelar
            </button>
            <button
              data-testid="logout-reminder-exit"
              onClick={onExitWithoutCorte}
              style={{ flex: 1, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 14, color: "var(--td-text-hi)", padding: "12px", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <LogOut size={14} /> Salir sin corte
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
