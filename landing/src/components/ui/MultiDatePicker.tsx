import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const pad = (n: number) => String(n).padStart(2, "0");
const toYmd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const WEEKDAYS = ["D", "L", "M", "M", "J", "V", "S"];

function fmtLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

interface Props {
  /** Fechas elegidas, "YYYY-MM-DD", en cualquier orden. */
  selected: string[];
  onChange: (dates: string[]) => void;
  /** Fecha mínima seleccionable ("YYYY-MM-DD"). */
  minValue?: string;
  /** Fecha máxima seleccionable ("YYYY-MM-DD"), p.ej. hoy. */
  maxValue?: string;
  ariaLabel?: string;
  minWidth?: number;
}

/**
 * Selector de fechas SUELTAS (no consecutivas) — a diferencia de
 * DateRangePicker (rango continuo con RangeCalendar de react-aria), aquí
 * cada click agrega/quita un día de la lista. react-aria no trae multi-select
 * en su Calendar, así que esta es una cuadrícula propia con Date nativo —
 * mismo look (chip + popover) que DateRangePicker para no desentonar.
 */
export function MultiDatePicker({
  selected,
  onChange,
  minValue,
  maxValue,
  ariaLabel = "Fechas sueltas",
  minWidth = 230,
}: Props) {
  const initial = selected[0] ? new Date(`${selected[0]}T00:00:00`) : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const min = minValue ? new Date(`${minValue}T00:00:00`) : null;
  const max = maxValue ? new Date(`${maxValue}T00:00:00`) : null;

  const days = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ day: number; outside: boolean } | null> = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, outside: false });
    return cells;
  }, [viewYear, viewMonth]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });

  const toggleDay = (day: number) => {
    const ymd = toYmd(viewYear, viewMonth, day);
    const date = new Date(`${ymd}T00:00:00`);
    if (min && date < min) return;
    if (max && date > max) return;
    onChange(
      selectedSet.has(ymd) ? selected.filter((d) => d !== ymd) : [...selected, ymd].sort(),
    );
  };

  const label = selected.length === 0
    ? "Elegir días"
    : selected.length <= 3
      ? [...selected].sort().map(fmtLabel).join(", ")
      : `${selected.length} días`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
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
            {label}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={8}
        className="rounded-[24px] p-5 outline-none z-[600] w-[320px]"
        style={{
          background: "var(--td-popup-bg)",
          border: "1px solid var(--td-panel-border)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-4">
          <button
            type="button"
            onClick={() => setViewMonth((m) => { if (m === 0) { setViewYear((y) => y - 1); return 11; } return m - 1; })}
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white/60 transition-colors hover:border-white/20 hover:text-white"
          >
            <ChevronLeft size={15} />
          </button>
          <span
            className="flex-1 text-center text-[11px] font-black uppercase tracking-[0.18em] capitalize"
            style={{ color: "var(--td-text-hi)" }}
          >
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setViewMonth((m) => { if (m === 11) { setViewYear((y) => y + 1); return 0; } return m + 1; })}
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white/60 transition-colors hover:border-white/20 hover:text-white"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {WEEKDAYS.map((w, i) => (
            <div
              key={i}
              className="text-center text-[10px] font-black uppercase tracking-widest"
              style={{ color: "var(--td-text-lo)" }}
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {days.map((cell, i) => {
            if (!cell) return <div key={i} />;
            const ymd = toYmd(viewYear, viewMonth, cell.day);
            const date = new Date(`${ymd}T00:00:00`);
            const isSelected = selectedSet.has(ymd);
            const isDisabled = (min && date < min) || (max && date > max);
            return (
              <button
                key={i}
                type="button"
                disabled={!!isDisabled}
                onClick={() => toggleDay(cell.day)}
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold transition-all outline-none mx-auto",
                  isDisabled ? "opacity-25 cursor-not-allowed" : "cursor-pointer hover:bg-white/8",
                  isSelected ? "text-white bg-[var(--td-red)]" : "bg-black/10 text-white/80",
                ].join(" ")}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-4 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/50 hover:text-white/80"
          >
            <X size={11} /> Limpiar selección
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
