import { useMemo } from "react";
import {
  Button as AriaButton,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarHeading,
  Dialog,
  DialogTrigger,
  Popover,
} from "react-aria-components";
import { parseDate, type DateValue } from "@internationalized/date";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");

/** DateValue → "YYYY-MM-DD" sin pasar por UTC. */
function toYmd(d: DateValue): string {
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** "YYYY-MM-DD" (o ISO con hora) → DateValue; null si vacío/ inválido. */
function safeParse(ymd?: string | null): DateValue | null {
  if (!ymd) return null;
  const datePart = ymd.split("T")[0]!;
  try {
    return parseDate(datePart);
  } catch {
    return null;
  }
}

interface Props {
  /** Fecha seleccionada en "YYYY-MM-DD" (cadena vacía = sin elegir). */
  value: string;
  onChange: (ymd: string) => void;
  /** Fecha mínima seleccionable ("YYYY-MM-DD"): los días anteriores se
   *  deshabilitan. Úsalo para que el "límite de retiro" no pueda ser anterior
   *  a la "fecha de llegada". */
  minValue?: string;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  /** Si viene, la fecha es OPCIONAL: aparece un × para limpiarla (llama esto). */
  onClear?: () => void;
}

/**
 * Selector de UNA fecha (sin rango) con el Calendar de react-aria
 * (https://react-aria.adobe.com/Calendar). Mismo lenguaje visual que el rango
 * de Ventas: trigger con chip + popover de fondo sólido. Soporta `minValue`
 * para encadenar fechas (la de retiro arranca desde la de llegada).
 */
export function SingleDatePicker({
  value,
  onChange,
  minValue,
  placeholder = "Elegir fecha",
  ariaLabel,
  disabled,
  onClear,
}: Props) {
  const selected = useMemo(() => safeParse(value), [value]);
  const min = useMemo(() => safeParse(minValue) ?? undefined, [minValue]);

  const label = value
    ? new Date(`${value.split("T")[0]}T00:00:00`).toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : placeholder;

  const showClear = !!onClear && !!value && !disabled;

  /* Button de react-aria (no <button> nativo): DialogTrigger pasa el press
     por PressResponder y un botón nativo nunca lo recibe (popover muerto). */
  const trigger = (
    <AriaButton
      isDisabled={disabled}
      aria-label={ariaLabel}
      className="flex w-full items-center gap-2 rounded-2xl px-3.5 py-[11px] outline-none transition-all"
      style={{
        background: "var(--td-input-bg)",
        border: "1px solid var(--td-input-border)",
        color: value ? "var(--td-text-hi)" : "var(--td-text-lo)",
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        boxSizing: "border-box",
        ...(showClear ? { paddingRight: 34 } : {}),
      }}
    >
      <CalendarDays size={14} style={{ color: "var(--td-text-lo)", flexShrink: 0 }} />
      <span className="text-left whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
    </AriaButton>
  );

  return (
    <DialogTrigger>
      {/* Con onClear el trigger se envuelve en un div relativo y el × va como
          HERMANO del AriaButton (botón dentro de botón es HTML inválido y
          react-aria se come el press). El PressResponder de DialogTrigger llega
          por contexto, así que el div intermedio no lo corta. Sin onClear, el
          trigger queda EXACTAMENTE como siempre (Preventas/Cortes intactos). */}
      {onClear ? (
        <div style={{ position: "relative", width: "100%" }}>
          {trigger}
          {showClear && (
            <button
              type="button"
              aria-label="Limpiar fecha"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors hover:bg-white/10"
              style={{ color: "var(--td-text-lo)", border: "none", background: "transparent", cursor: "pointer" }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      ) : (
        trigger
      )}

      <Popover
        placement="bottom start"
        offset={8}
        className="rounded-[24px] p-0 outline-none z-[600]"
        style={{
          background: "var(--td-popup-bg)",
          border: "1px solid var(--td-panel-border)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <Dialog className="outline-none">
          <div className="w-[300px] p-4">
            <Calendar
              aria-label={ariaLabel}
              value={selected}
              minValue={min}
              onChange={(d) => d && onChange(toYmd(d))}
              className="w-full"
            >
              <div className="flex items-center gap-3">
                <AriaButton
                  slot="previous"
                  className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white/60 transition-colors hover:border-white/20 hover:text-white"
                >
                  <ChevronLeft size={15} />
                </AriaButton>
                <CalendarHeading
                  className="flex-1 text-center text-[11px] font-black uppercase tracking-[0.18em]"
                  style={{ color: "var(--td-text-hi)" }}
                />
                <AriaButton
                  slot="next"
                  className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white/60 transition-colors hover:border-white/20 hover:text-white"
                >
                  <ChevronRight size={15} />
                </AriaButton>
              </div>

              <CalendarGrid weekdayStyle="short" className="mt-4 w-full border-separate border-spacing-y-1.5">
                <CalendarGridHeader>
                  {(day) => (
                    <CalendarHeaderCell
                      className="pb-2 text-center text-[10px] font-black uppercase tracking-widest"
                      style={{ color: "var(--td-text-lo)" }}
                    >
                      {day}
                    </CalendarHeaderCell>
                  )}
                </CalendarGridHeader>
                <CalendarGridBody>
                  {(date) => (
                    <CalendarCell
                      date={date}
                      className={({ isSelected, isFocusVisible, isOutsideMonth, isDisabled }) =>
                        [
                          "flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold transition-all outline-none mx-auto",
                          "data-[hovered]:bg-white/8",
                          isOutsideMonth ? "text-white/20" : "text-white/80",
                          isDisabled ? "opacity-25 cursor-not-allowed" : "cursor-pointer",
                          isSelected ? "text-white bg-[var(--td-red)]" : "bg-black/10",
                          isFocusVisible ? "ring-2 ring-white/70" : "",
                        ].join(" ")
                      }
                    />
                  )}
                </CalendarGridBody>
              </CalendarGrid>
            </Calendar>
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
