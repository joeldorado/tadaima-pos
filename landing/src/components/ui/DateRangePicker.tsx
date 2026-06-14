import { useMemo } from "react";
import {
  Button as AriaButton,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarHeading,
  Dialog,
  DialogTrigger,
  Popover,
  RangeCalendar,
} from "react-aria-components";
import { parseDate, type DateValue } from "@internationalized/date";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");

/** DateValue → "YYYY-MM-DD" sin pasar por UTC. */
function toYmd(d: DateValue): string {
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** "YYYY-MM-DD" (o ISO con hora) → DateValue; null si vacío/inválido. */
function safeParse(ymd?: string | null): DateValue | null {
  if (!ymd) return null;
  try {
    return parseDate(ymd.split("T")[0]!);
  } catch {
    return null;
  }
}

function fmtLabel(ymd: string): string {
  if (!ymd) return "—";
  return new Date(`${ymd.split("T")[0]}T00:00:00`).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

const CELL =
  "flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold transition-all outline-none mx-auto";

interface Props {
  /** Inicio del rango en "YYYY-MM-DD". */
  from: string;
  /** Fin del rango en "YYYY-MM-DD". */
  to: string;
  onChange: (from: string, to: string) => void;
  /** Fecha máxima seleccionable ("YYYY-MM-DD"), p.ej. hoy. */
  maxValue?: string;
  ariaLabel?: string;
  /** Ancho mínimo del chip trigger. */
  minWidth?: number;
}

/**
 * Selector de RANGO de fechas con el RangeCalendar de react-aria
 * (https://react-aria.adobe.com/Calendar) — dos meses visibles. Reemplaza los
 * `<input type="date">` nativos para un rango consistente con el de Ventas.
 * El Popover portea a <body>, así que funciona dentro de modales sin recortes.
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  maxValue,
  ariaLabel = "Rango de fechas",
  minWidth = 230,
}: Props) {
  const value = useMemo(() => {
    const start = safeParse(from);
    const end = safeParse(to) ?? start;
    return start && end ? { start, end } : null;
  }, [from, to]);

  const max = useMemo(() => safeParse(maxValue) ?? undefined, [maxValue]);

  return (
    <DialogTrigger>
      {/* Button de react-aria (no <button> nativo): DialogTrigger pasa el press
          por PressResponder y un botón nativo nunca lo recibe (popover muerto). */}
      <AriaButton
        aria-label={ariaLabel}
        className="flex items-center gap-2 rounded-full h-[34px] px-4 transition-all outline-none"
        style={{
          background: "var(--td-input-bg, rgba(255,255,255,0.04))",
          border: "1px solid var(--td-panel-border)",
          color: "var(--td-text-hi)",
          minWidth,
        }}
      >
        <CalendarDays size={12} style={{ color: "var(--td-text-lo)", flexShrink: 0 }} />
        <span className="text-[10px] font-bold tracking-widest uppercase text-left whitespace-nowrap">
          {fmtLabel(from)} – {fmtLabel(to)}
        </span>
      </AriaButton>

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
          <div className="w-[640px] max-w-[calc(100vw-32px)] p-5">
            <RangeCalendar
              aria-label={ariaLabel}
              value={value}
              maxValue={max}
              onChange={(range) => {
                if (!range?.start || !range?.end) return;
                onChange(toYmd(range.start), toYmd(range.end));
              }}
              visibleDuration={{ months: 2 }}
              pageBehavior="single"
              className="w-full"
            >
              <div className="flex items-center gap-3">
                <AriaButton
                  slot="previous"
                  className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white/60 transition-colors hover:border-white/20 hover:text-white"
                >
                  <ChevronLeft size={15} />
                </AriaButton>
                <div className="grid flex-1 grid-cols-2 gap-4">
                  <CalendarHeading
                    className="text-center text-[11px] font-black uppercase tracking-[0.18em]"
                    style={{ color: "var(--td-text-hi)" }}
                  />
                  <CalendarHeading
                    offset={{ months: 1 }}
                    className="text-center text-[11px] font-black uppercase tracking-[0.18em]"
                    style={{ color: "var(--td-text-hi)" }}
                  />
                </div>
                <AriaButton
                  slot="next"
                  className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white/60 transition-colors hover:border-white/20 hover:text-white"
                >
                  <ChevronRight size={15} />
                </AriaButton>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                {[0, 1].map((monthOffset) => (
                  <CalendarGrid
                    key={monthOffset}
                    {...(monthOffset === 1 ? { offset: { months: 1 } } : {})}
                    weekdayStyle="short"
                    className="w-full border-separate border-spacing-y-1.5"
                  >
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
                          className={({
                            isSelected,
                            isSelectionStart,
                            isSelectionEnd,
                            isFocusVisible,
                            isOutsideMonth,
                            isDisabled,
                          }) =>
                            [
                              CELL,
                              "data-[hovered]:bg-white/8",
                              isOutsideMonth ? "text-white/20" : "text-white/80",
                              isDisabled ? "opacity-25 cursor-not-allowed" : "cursor-pointer",
                              isSelected ? "text-white bg-[var(--td-red)]" : "bg-black/10",
                              isSelectionStart || isSelectionEnd ? "ring-2 ring-[#FF7A59]" : "",
                              isFocusVisible ? "ring-2 ring-white/70" : "",
                            ].join(" ")
                          }
                        />
                      )}
                    </CalendarGridBody>
                  </CalendarGrid>
                ))}
              </div>
            </RangeCalendar>
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
