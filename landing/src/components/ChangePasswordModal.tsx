import { useState } from "react";
import { X, KeyRound, Eye, EyeOff, Loader2, Check } from "lucide-react";
import { changePassword } from "@tadaima/api";
import { toast } from "sonner";

interface Props {
  onClose: () => void;
}

interface ApiErrorShape {
  message?: string;
  errors?: Record<string, string[]>;
}

const MIN_LEN = 8;

/**
 * Cambio de contraseña self-service para CUALQUIER rol (cajero/gerente/admin).
 * Vive en el menú del avatar (la única superficie que todos los roles alcanzan).
 * El backend (POST /auth/password) re-valida la contraseña actual — esto es
 * solo la primera línea de UX.
 */
export function ChangePasswordModal({ onClose }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Validación inline (sin disparar en cada tecla: se evalúa para gatear el botón).
  const tooShort = next.length > 0 && next.length < MIN_LEN;
  const sameAsCurrent = next.length > 0 && next === current;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit =
    current.length > 0 &&
    next.length >= MIN_LEN &&
    !sameAsCurrent &&
    confirm === next &&
    !busy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setFieldError(null);
    try {
      await changePassword(current, next);
      toast.success("Contraseña actualizada");
      onClose();
    } catch (err) {
      const api = err as ApiErrorShape;
      const msg =
        api.errors?.current_password?.[0] ??
        api.errors?.password?.[0] ??
        api.message ??
        "No se pudo cambiar la contraseña";
      setFieldError(msg);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--td-input-bg, rgba(0,0,0,0.04))",
    border: "1px solid var(--td-panel-border)",
    borderRadius: 12,
    padding: "11px 40px 11px 13px",
    fontSize: 14,
    color: "var(--td-text-hi)",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    color: "var(--td-text-md)",
    marginBottom: 5,
    display: "block",
    letterSpacing: "0.01em",
  };

  const eyeBtn = (key: keyof typeof show) => (
    <button
      type="button"
      onClick={() => setShow(s => ({ ...s, [key]: !s[key] }))}
      tabIndex={-1}
      aria-label={show[key] ? "Ocultar contraseña" : "Mostrar contraseña"}
      style={{
        position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
        background: "none", border: "none", cursor: "pointer", padding: 4,
        color: "var(--td-text-ghost)",
      }}
    >
      {show[key] ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div
        onClick={busy ? undefined : onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)" }}
      />

      <form
        onSubmit={handleSubmit}
        style={{
          position: "relative",
          background: "var(--td-popup-bg)",
          border: "1px solid var(--td-panel-border)",
          borderRadius: 22,
          padding: 24,
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
        }}
      >
        <button
          type="button"
          onClick={busy ? undefined : onClose}
          disabled={busy}
          style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: busy ? "not-allowed" : "pointer", color: "var(--td-text-ghost)", padding: 4 }}
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.3)",
          }}>
            <KeyRound size={19} style={{ color: "var(--td-red)" }} />
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--td-text-hi)", margin: 0 }}>
              Cambiar contraseña
            </h2>
            <p style={{ fontSize: 11.5, color: "var(--td-text-ghost)", margin: "2px 0 0" }}>
              Necesitas tu contraseña actual.
            </p>
          </div>
        </div>

        {/* Contraseña actual */}
        <div style={{ marginBottom: 13 }}>
          <label htmlFor="cp-current" style={labelStyle}>Contraseña actual</label>
          <div style={{ position: "relative" }}>
            <input
              id="cp-current"
              type={show.current ? "text" : "password"}
              value={current}
              onChange={e => { setCurrent(e.target.value); setFieldError(null); }}
              autoComplete="current-password"
              style={inputStyle}
              disabled={busy}
            />
            {eyeBtn("current")}
          </div>
        </div>

        {/* Nueva contraseña */}
        <div style={{ marginBottom: 13 }}>
          <label htmlFor="cp-next" style={labelStyle}>Nueva contraseña</label>
          <div style={{ position: "relative" }}>
            <input
              id="cp-next"
              type={show.next ? "text" : "password"}
              value={next}
              onChange={e => setNext(e.target.value)}
              autoComplete="new-password"
              style={{
                ...inputStyle,
                borderColor: tooShort || sameAsCurrent ? "var(--td-red)" : "var(--td-panel-border)",
              }}
              disabled={busy}
            />
            {eyeBtn("next")}
          </div>
          {tooShort && (
            <p style={{ fontSize: 10.5, color: "var(--td-red)", margin: "4px 0 0" }}>
              Mínimo {MIN_LEN} caracteres.
            </p>
          )}
          {sameAsCurrent && !tooShort && (
            <p style={{ fontSize: 10.5, color: "var(--td-red)", margin: "4px 0 0" }}>
              Debe ser distinta de la actual.
            </p>
          )}
          {!tooShort && !sameAsCurrent && (
            <p style={{ fontSize: 10.5, color: "var(--td-text-ghost)", margin: "4px 0 0" }}>
              Mínimo {MIN_LEN} caracteres.
            </p>
          )}
        </div>

        {/* Confirmar */}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="cp-confirm" style={labelStyle}>Confirmar nueva contraseña</label>
          <div style={{ position: "relative" }}>
            <input
              id="cp-confirm"
              type={show.confirm ? "text" : "password"}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              style={{
                ...inputStyle,
                borderColor: mismatch ? "var(--td-red)" : "var(--td-panel-border)",
              }}
              disabled={busy}
            />
            {eyeBtn("confirm")}
          </div>
          {mismatch && (
            <p style={{ fontSize: 10.5, color: "var(--td-red)", margin: "4px 0 0" }}>
              No coincide con la nueva contraseña.
            </p>
          )}
        </div>

        {/* Error del servidor */}
        {fieldError && (
          <div role="alert" style={{
            background: "rgba(224,34,26,0.10)", border: "1px solid rgba(224,34,26,0.3)",
            borderRadius: 10, padding: "8px 11px", marginBottom: 14,
            fontSize: 11.5, color: "var(--td-red)", fontWeight: 600,
          }}>
            {fieldError}
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={busy ? undefined : onClose}
            disabled={busy}
            style={{
              flex: 1, padding: "11px", borderRadius: 12,
              background: "transparent", border: "1px solid var(--td-panel-border)",
              color: "var(--td-text-md)", fontWeight: 700, fontSize: 13,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              flex: 1, padding: "11px", borderRadius: 12,
              background: canSubmit ? "var(--td-red)" : "var(--td-panel-border)",
              border: "1px solid transparent",
              color: canSubmit ? "#fff" : "var(--td-text-ghost)",
              fontWeight: 800, fontSize: 13,
              cursor: canSubmit ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
