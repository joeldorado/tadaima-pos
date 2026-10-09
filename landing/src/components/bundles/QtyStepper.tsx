import { useState, type KeyboardEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { CARD_BORDER, INPUT_BG, INPUT_BORDER, TEXT_HI, TEXT_MD } from "@/components/promos/promoTokens";

interface QtyStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** Ancho del campo numérico (px). */
  inputWidth?: number;
  /** Muestra "/ máx" junto al campo (armar/desarmar); en el picker sobra. */
  showMax?: boolean;
  testId?: string;
}

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/**
 * [−] [ 2 ] [+] con botones de 44 px (dedo) y teclado (↑/↓ ±1). El valor
 * escrito se limita al salir del campo o al presionar Enter; mientras se
 * escribe se permite vacío para no pelear con el usuario.
 */
export function QtyStepper({
  value, min = 1, max = Number.POSITIVE_INFINITY, onChange, ariaLabel, disabled = false, inputWidth = 64, showMax = true, testId,
}: QtyStepperProps) {
  const [text, setText] = useState(String(value));
  // Si el padre cambia el valor (p. ej. baja el máximo), el campo lo refleja
  // (patrón "ajustar estado durante el render", sin effect).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    const next = Number.isFinite(parsed) ? clamp(parsed, min, Number.isFinite(max) ? max : parsed) : min;
    setText(String(next));
    if (next !== value) onChange(next);
  };
  const step = (delta: number) => {
    const next = clamp(value + delta, min, Number.isFinite(max) ? max : value + delta);
    if (next !== value) onChange(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp") { event.preventDefault(); step(1); }
    else if (event.key === "ArrowDown") { event.preventDefault(); step(-1); }
    else if (event.key === "Enter") { event.preventDefault(); commit(event.currentTarget.value); }
  };

  const atMin = disabled || value <= min;
  const atMax = disabled || value >= max;
  const btn = (reached: boolean): React.CSSProperties => ({
    width: 44, height: 44, borderRadius: 12, border: CARD_BORDER, background: "transparent",
    color: TEXT_HI, cursor: reached ? "not-allowed" : "pointer", opacity: reached ? 0.4 : 1,
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  });

  return (
    <div className="inline-flex items-center gap-1" role="group">
      <button type="button" onClick={() => step(-1)} disabled={atMin} aria-label="Quitar uno" style={btn(atMin)}>
        <Minus size={18} aria-hidden />
      </button>
      <input
        value={text}
        role="spinbutton"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={ariaLabel}
        aria-valuemin={min}
        {...(Number.isFinite(max) ? { "aria-valuemax": max } : {})}
        aria-valuenow={value}
        disabled={disabled}
        onChange={event => setText(event.target.value.replace(/[^\d]/g, ""))}
        onBlur={event => commit(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={event => event.target.select()}
        className="text-center tabular-nums"
        style={{
          width: inputWidth, minHeight: 44, borderRadius: 12, border: INPUT_BORDER, background: INPUT_BG,
          color: TEXT_HI, fontSize: 18, fontWeight: 900, outline: "none",
        }}
        {...(testId ? { "data-testid": testId } : {})}
      />
      <button type="button" onClick={() => step(1)} disabled={atMax} aria-label="Agregar uno" style={btn(atMax)}>
        <Plus size={18} aria-hidden />
      </button>
      {showMax && Number.isFinite(max) && (
        <span className="ml-1 text-[13px] font-bold" style={{ color: TEXT_MD }}>/ {max.toLocaleString("es-MX")}</span>
      )}
    </div>
  );
}
