import { useEffect, useState, type MouseEvent } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useRefreshScreen } from "@/hooks/useScreenRefresh";
import { updatedAgoLabel } from "@/lib/screenRefresh";

/**
 * Botón global "Actualizar" del Layout: trae los datos nuevos de la pantalla
 * actual sin recargar (ver `lib/screenRefresh.ts`). Sale para todos los roles.
 *
 * - `rail`: sidebar colapsado (cuadro + etiqueta chica, como los links).
 * - `wide`: sidebar ancho (renglón con texto).
 * - `floating`: Caja con el sidebar oculto, encima del botón del menú.
 * - `inline`: pastilla en la barra de filtros de una pantalla (Ventas,
 *   Reportes — 2026-10-02: ya no se recargan solas y el botón del menú no se
 *   encontraba). Con `updatedAt` dice hace cuánto se trajeron los datos.
 */
type Variant = "rail" | "wide" | "floating" | "inline";


const TOAST_ID = "screen-refresh";
const TITLE = "Traer datos nuevos de esta pantalla";

export function RefreshDataButton({ variant, updatedAt }: { variant: Variant; updatedAt?: number | undefined }) {
  const { refresh, refreshing } = useRefreshScreen();
  // Reloj de 30 s solo para la etiqueta "hace X min" (no pide datos).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (variant !== "inline" || !updatedAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [variant, updatedAt]);

  const onClick = async () => {
    const res = await refresh();
    if (res.ok) toast.success("Datos actualizados", { id: TOAST_ID, duration: 1800 });
    else toast.error("No se pudo actualizar. Revisa tu conexión.", { id: TOAST_ID });
  };

  const label = refreshing ? "Actualizando…" : "Actualizar";
  const icon = (size: number) => (
    <RefreshCw
      size={size}
      strokeWidth={2}
      className={refreshing ? "animate-spin" : ""}
      style={{ color: "var(--td-icon-inactive)", flexShrink: 0 }}
    />
  );
  const common = {
    type: "button" as const,
    onClick: () => { void onClick(); },
    // No robar el foco: en Caja el cursor debe seguir en el campo de código.
    onMouseDown: (e: MouseEvent) => e.preventDefault(),
    disabled: refreshing,
    title: TITLE,
    "aria-label": label,
    "aria-busy": refreshing,
    "data-testid": `refresh-data-${variant}`,
  };

  if (variant === "floating") {
    return (
      <button
        {...common}
        className="fixed left-3 z-40 flex items-center justify-center bottom-[68px] max-[767px]:bottom-[148px] rounded-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-70"
        style={{ width: 44, height: 44, background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", boxShadow: "0 6px 16px rgba(0,0,0,0.3)" }}
      >
        {icon(18)}
      </button>
    );
  }

  if (variant === "inline") {
    return (
      <button
        {...common}
        className="h-[34px] px-3.5 rounded-full flex items-center gap-2 transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-70"
        style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}
      >
        {icon(14)}
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-md)", whiteSpace: "nowrap" }}>
          {label}
        </span>
        {updatedAt ? (
          <span className="text-[10px] font-bold" style={{ color: "var(--td-text-lo)", whiteSpace: "nowrap" }}>
            · {updatedAgoLabel(updatedAt, now)}
          </span>
        ) : null}
      </button>
    );
  }

  if (variant === "rail") {
    return (
      <button {...common} className="flex flex-col items-center gap-1 shrink-0 disabled:opacity-70">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-[var(--td-hover-bg)]"
          style={{ border: "1px solid var(--td-panel-border)" }}
        >
          {icon(17)}
        </span>
        <span style={{ fontSize: "9px", fontWeight: 600, color: "var(--td-text-lo)" }}>{label}</span>
      </button>
    );
  }

  return (
    <button
      {...common}
      className="flex items-center gap-3 w-full rounded-xl shrink-0 transition-all hover:bg-[var(--td-hover-bg)] disabled:opacity-70"
      style={{ padding: "9px 12px", border: "1px solid var(--td-panel-border)" }}
    >
      {icon(17)}
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--td-text-md)", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
}
