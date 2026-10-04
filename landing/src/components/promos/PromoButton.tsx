import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { BLUE, GREEN, GREEN_SOLID, INPUT_BORDER, RED, TEXT_HI } from "./promoTokens";

type Variant = "primary" | "secondary" | "accent" | "danger" | "dangerSolid";

interface PromoButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ReactNode;
  loading?: boolean;
  /** Ocupa todo el ancho disponible (pies de modal en pantallas chicas). */
  block?: boolean;
}

const VARIANT_STYLE: Record<Variant, React.CSSProperties> = {
  primary: { background: GREEN_SOLID, color: "#04120c", border: "1px solid transparent" },
  secondary: { background: "transparent", color: TEXT_HI, border: INPUT_BORDER },
  accent: { background: `${BLUE}1F`, color: BLUE, border: `1px solid ${BLUE}66` },
  danger: { background: "rgba(224,34,26,0.10)", color: RED, border: "1px solid rgba(224,34,26,0.4)" },
  dangerSolid: { background: RED, color: "#fff", border: "1px solid transparent" },
};

/**
 * Botón de la pantalla de Promos: SIEMPRE con texto (el ícono solo acompaña),
 * mínimo 44 px de alto y foco visible con teclado.
 */
export function PromoButton({
  variant = "secondary", icon, loading = false, block = false, disabled, children, className = "", style, ...rest
}: PromoButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-[14px] font-extrabold leading-tight transition-[filter,opacity] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 ${block ? "w-full" : ""} ${className}`}
      style={{ ...VARIANT_STYLE[variant], outlineColor: GREEN, cursor: disabled || loading ? "not-allowed" : "pointer", ...style }}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
