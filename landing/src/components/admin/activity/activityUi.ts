import type { CSSProperties } from "react";

/** Estilos compartidos de la pestaña Actividad (mismo look dark de Administración). */
export const inputStyle: CSSProperties = {
  background: "var(--td-input-bg)",
  border: "1px solid var(--td-input-border)",
  borderRadius: 8,
  color: "var(--td-input-text)",
  outline: "none",
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 700,
};

export const cardStyle: CSSProperties = {
  background: "var(--td-card-bg)",
  border: "1px solid var(--td-card-border)",
  borderRadius: 16,
};

export const labelClass = "text-[9px] font-black uppercase tracking-widest";

export const ACCENT = "#FF4422";
