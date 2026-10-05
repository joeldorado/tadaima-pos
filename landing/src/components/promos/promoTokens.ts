/**
 * Tokens visuales de la pantalla de Promos (tema glass de la app). Pantalla
 * pensada para leerse fácil: el texto de lectura usa `TEXT_MD` como mínimo
 * (el `TEXT_LO` queda solo para datos secundarios) y nada baja de 14 px.
 */
export const PANEL_BG = "var(--td-panel-bg)";
export const PANEL_BORDER = "1px solid var(--td-panel-border)";
export const POPUP_BG = "var(--td-popup-bg)";
export const POPUP_BORDER = "1px solid var(--td-popup-border)";
export const CARD_BG = "var(--td-card-bg)";
export const CARD_BORDER = "1px solid var(--td-card-border)";
export const SOFT_BG = "var(--td-surface-soft)";
export const INPUT_BG = "var(--td-input-bg)";
export const INPUT_BORDER = "1px solid var(--td-input-border)";
export const TEXT_HI = "var(--td-text-hi)";
export const TEXT_MD = "var(--td-text-md)";
export const TEXT_LO = "var(--td-text-lo)";

export const GREEN = "#34d399";
export const GREEN_SOLID = "#10b981";
export const AMBER = "#F59E0B";
export const BLUE = "#60A5FA";
export const GRAY = "#9CA3AF";
export const RED = "var(--td-red, #E0221A)";
export const RED_SOFT = "#FF8A80";

/** Fondo y borde suaves a partir de un color hex (píldoras de estado, avisos). */
export const tint = (hex: string): { background: string; border: string; color: string } => ({
  background: `${hex}1F`,
  border: `1px solid ${hex}66`,
  color: hex,
});

export const fmtMoney = (amount: number): string =>
  new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(amount || 0);

/** Campo de texto grande (16 px evita el zoom automático de iOS). */
export const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "10px 14px",
  borderRadius: 14,
  border: INPUT_BORDER,
  background: INPUT_BG,
  color: TEXT_HI,
  fontSize: 16,
  fontWeight: 700,
  outline: "none",
  boxSizing: "border-box",
};
