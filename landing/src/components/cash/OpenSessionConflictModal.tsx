import { X, AlertTriangle, RefreshCw, ShieldAlert, Loader2 } from "lucide-react";
import type { OpenSessionConflict } from "@tadaima/api";

interface Props {
  conflict: OpenSessionConflict;
  /** ID del user actual — para distinguir "es mi propia sesión" vs "es de otro". */
  currentUserId: number | null | undefined;
  /** Solo admin ve el botón de forzar cierre cuando la sesión es de otro user. */
  isAdmin: boolean;
  /** Loading state para deshabilitar botones durante request. */
  busy: boolean;
  onClose: () => void;
  /** Continuar la sesión existente del propio usuario (no crea nueva). */
  onResume: () => void;
  /** Cierra la sesión existente (propia o ajena, según conflict.kind) y abre una nueva. */
  onForceClose: () => void;
}

/**
 * Modal mostrado cuando POST /cash/open responde 409 con conflicto. Distingue
 * 3 escenarios según `conflict.kind` + `existing_session`:
 *
 *  - Propia + misma caja → "Continuar tu sesión de hace Xh" (Resume).
 *  - Propia + otra caja → "Tienes una sesión abierta en [caja X]. Ciérrala
 *    para abrir esta otra".
 *  - Ajena → muestra quién + cuándo + (si admin) botón "Forzar cierre".
 */
const fmt = (n: number): string =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function timeSince(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1)  return "hace menos de un minuto";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `hace ${d}d ${h % 24}h`;
}

export function OpenSessionConflictModal({
  conflict, currentUserId, isAdmin, busy, onClose, onResume, onForceClose,
}: Props) {
  const { kind, existing_session: existing } = conflict;
  const isMine = existing.user?.id === currentUserId;
  const canResume = kind === "own" && existing.same_register;
  // "Forzar cierre" disponible cuando: dueño propio (cualquier kind own en otra
  // caja) o admin con sesión ajena. Cajero/gerente que choca con sesión ajena
  // no puede forzar.
  const canForceClose = isMine || isAdmin;

  const title = canResume
    ? "Tienes una sesión activa en esta caja"
    : kind === "own"
      ? "Ya tienes una sesión abierta"
      : "Caja ocupada";

  const subtitle = canResume
    ? "Puedes continuar donde la dejaste."
    : kind === "own"
      ? `Tu sesión está en otra caja (${existing.register?.name ?? "—"}). Ciérrala primero para abrir esta.`
      : `Está abierta por ${existing.user?.name ?? "otro usuario"}.`;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={busy ? undefined : onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)" }} />

      <div style={{
        position: "relative",
        background: "var(--td-popup-bg)",
        border: `1px solid ${canResume ? "rgba(16,185,129,0.35)" : "rgba(245,158,11,0.4)"}`,
        borderRadius: 22, padding: 24, width: "100%", maxWidth: 460,
      }}>
        <button onClick={busy ? undefined : onClose}
          disabled={busy}
          style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: busy ? "not-allowed" : "pointer", color: "var(--td-text-ghost)", padding: 4 }}>
          <X size={16} />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3" style={{ marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: canResume ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
            border: `1px solid ${canResume ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {canResume
              ? <RefreshCw size={20} color="#10b981" />
              : <AlertTriangle size={20} color="#f59e0b" />}
          </div>
          <div className="flex-1">
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "var(--td-text-hi)" }}>{title}</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--td-text-md)" }}>{subtitle}</p>
          </div>
        </div>

        {/* Detalle de la sesión existente */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid var(--td-panel-border)",
          borderRadius: 14, padding: 14, marginBottom: 18,
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
        }}>
          <Field label="Caja"        value={existing.register?.name ?? "—"} />
          <Field label="Tienda"      value={existing.store?.name ?? "—"} />
          <Field label="Cajero"      value={existing.user?.name ?? "—"} highlight={!isMine} />
          <Field label="Apertura"    value={existing.opened_at ? timeSince(existing.opened_at) : "—"} />
          <Field label="Efectivo inicial" value={fmt(existing.opening_cash)} />
          <Field label="Sesión #"    value={`#${existing.id}`} />
        </div>

        {/* Acciones */}
        <div className="flex gap-2 flex-wrap" style={{ justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={busy}
            style={{ padding: "10px 16px", borderRadius: 12, background: "transparent", border: "1px solid var(--td-panel-border)", color: "var(--td-text-md)", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", cursor: busy ? "default" : "pointer" }}>
            Cancelar
          </button>

          {canResume && (
            <button onClick={onResume} disabled={busy}
              style={{ padding: "10px 18px", borderRadius: 12, background: "#10b981", border: "none", color: "#fff", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", cursor: busy ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8, opacity: busy ? 0.6 : 1 }}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Continuar sesión
            </button>
          )}

          {canForceClose && !canResume && (
            <button onClick={onForceClose} disabled={busy}
              style={{
                padding: "10px 18px", borderRadius: 12,
                background: "linear-gradient(135deg, #DC2626, #EF4444)", border: "none",
                color: "#fff", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em",
                cursor: busy ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8, opacity: busy ? 0.6 : 1,
              }}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldAlert size={13} />}
              {isMine ? "Cerrar y abrir nueva" : "Forzar cierre"}
            </button>
          )}
        </div>

        {/* Footnote para roles sin permiso */}
        {!canForceClose && (
          <p style={{ marginTop: 14, fontSize: 11, color: "var(--td-text-ghost)", lineHeight: 1.4 }}>
            Solo el administrador o el dueño de la sesión pueden cerrarla. Contacta a {existing.user?.name ?? "el cajero"} o al admin para liberar la caja.
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--td-text-ghost)" }}>
        {label}
      </p>
      <p style={{ margin: "3px 0 0", fontSize: 12, fontWeight: 800, color: highlight ? "#f59e0b" : "var(--td-text-hi)" }}>
        {value}
      </p>
    </div>
  );
}
