import type { ReactNode } from "react";
import { Download, Filter, Loader2, Search, SlidersHorizontal } from "lucide-react";
import type { ActivityGroup } from "@tadaima/api";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { useStoresQuery } from "@/hooks/queries/useStores";
import { useUsersQuery } from "@/hooks/queries/useUsers";
import { daysAgoLocal, getTodayLocal } from "@/lib/date";
import { GROUP_ORDER, GROUP_STYLES } from "@/lib/activityFormat";
import { effectiveGroups, type ActivityFilterState } from "@/lib/activityParams";
import { ActivityProductSearch } from "./ActivityProductSearch";
import { inputStyle, labelClass } from "./activityUi";

interface Props {
  /** Borrador: lo que el admin va armando. Se consulta al servidor con «Filtrar». */
  state: ActivityFilterState;
  onChange: (patch: Partial<ActivityFilterState>) => void;
  onApply: () => void;
  /** El borrador difiere de lo aplicado: el botón Filtrar se enciende. */
  isDirty: boolean;
  isFetching: boolean;
  onReset: () => void;
  onExport: () => void;
  isExporting: boolean;
  /** Cuántas filas se ocultaron por ruido (del resumen), para el toggle. */
  noiseHidden: number | null;
}

const QUICK_RANGES: Array<{ label: string; days: number }> = [
  { label: "Hoy", days: 0 },
  { label: "7 días", days: 6 },
  { label: "30 días", days: 29 },
  { label: "90 días", days: 89 },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass} style={{ color: "var(--td-text-lo)" }}>{label}</span>
      {children}
    </label>
  );
}

/**
 * Barra de filtros de Actividad: rango, producto, usuario, tienda, grupos,
 * ruido, búsqueda. Edita un BORRADOR; nada viaja al servidor hasta «Filtrar»
 * (o Enter en Buscar).
 */
export function ActivityFilterBar({ state, onChange, onApply, isDirty, isFetching, onReset, onExport, isExporting, noiseHidden }: Props) {
  const storesQuery = useStoresQuery({ active: true });
  const usersQuery = useUsersQuery();
  const today = getTodayLocal();
  const activeGroups = effectiveGroups(state.groups) ?? [...GROUP_ORDER];

  const toggleGroup = (g: ActivityGroup) => {
    const current = new Set(activeGroups);
    if (current.has(g)) current.delete(g); else current.add(g);
    // Si quedó igual al default, guardamos vacío (URL corta).
    const next = GROUP_ORDER.filter((x) => current.has(x));
    const isDefault = next.length === GROUP_ORDER.length - 1 && !next.includes("impresion");
    onChange({ groups: isDefault ? [] : next, page: 1 });
  };

  const quickActive = (days: number) => state.from === daysAgoLocal(days) && state.to === today;

  return (
    <div className="rounded-2xl p-3 mb-3 flex flex-col gap-3" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className={labelClass} style={{ color: "var(--td-text-lo)" }}>Rango</span>
          <div className="flex items-center gap-1.5">
            <DateRangePicker
              from={state.from}
              to={state.to}
              onChange={(f, t) => onChange({ from: f, to: t, page: 1 })}
              maxValue={today}
              ariaLabel="Rango de actividad"
            />
            {QUICK_RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => onChange({ from: daysAgoLocal(r.days), to: today, page: 1 })}
                className="rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-wider"
                style={{
                  background: quickActive(r.days) ? "rgba(255,68,34,0.14)" : "var(--td-input-bg)",
                  border: `1px solid ${quickActive(r.days) ? "rgba(255,68,34,0.45)" : "var(--td-input-border)"}`,
                  color: quickActive(r.days) ? "#FF6B4A" : "var(--td-text-md)",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <ActivityProductSearch selectedIds={state.productIds} onChange={(ids) => onChange({ productIds: ids, page: 1 })} />

        <Field label="Usuario">
          <select
            value={state.userId ?? ""}
            onChange={(e) => onChange({ userId: e.target.value ? Number(e.target.value) : null, page: 1 })}
            style={{ ...inputStyle, minWidth: 150 }}
          >
            <option value="">Todos</option>
            {(usersQuery.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>

        <Field label="Tienda">
          <select
            value={state.storeId ?? ""}
            onChange={(e) => onChange({ storeId: e.target.value ? Number(e.target.value) : null, page: 1 })}
            style={{ ...inputStyle, minWidth: 140 }}
          >
            <option value="">Todas</option>
            {(storesQuery.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>

        <Field label="Buscar">
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--td-text-lo)", pointerEvents: "none" }} />
            <input
              type="text"
              value={state.search}
              onChange={(e) => onChange({ search: e.target.value, page: 1 })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onApply(); } }}
              placeholder="Folio, nota, descripción…"
              style={{ ...inputStyle, paddingLeft: 24, minWidth: 180 }}
            />
          </div>
        </Field>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onApply}
            disabled={isFetching}
            className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest disabled:opacity-60 transition-colors"
            style={isDirty
              ? { background: "#FF4422", border: "1px solid #FF4422", color: "#fff", boxShadow: "0 0 0 3px rgba(255,68,34,0.18)" }
              : { background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-text-md)" }}
            title={isDirty ? "Hay filtros sin aplicar" : "Consultar con estos filtros"}
          >
            {isFetching ? <Loader2 size={12} className="inline mr-1 animate-spin" /> : <SlidersHorizontal size={12} className="inline mr-1" />}
            {isDirty ? "Filtrar · sin aplicar" : "Filtrar"}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest"
            style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-text-lo)" }}
          >
            <Filter size={12} className="inline mr-1" /> Reset
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={isExporting}
            className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.35)", color: "#34D399" }}
          >
            {isExporting ? <Loader2 size={12} className="inline mr-1 animate-spin" /> : <Download size={12} className="inline mr-1" />}
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={labelClass} style={{ color: "var(--td-text-lo)", marginRight: 4 }}>Tipo</span>
        {GROUP_ORDER.map((g) => {
          const on = activeGroups.includes(g);
          const s = GROUP_STYLES[g];
          return (
            <button
              key={g}
              type="button"
              onClick={() => toggleGroup(g)}
              aria-pressed={on}
              className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors"
              style={{
                background: on ? `rgba(${s.rgb},0.16)` : "transparent",
                border: `1px solid ${on ? s.color + "66" : "var(--td-input-border)"}`,
                color: on ? s.color : "var(--td-text-lo)",
              }}
            >
              {s.label}
            </button>
          );
        })}
        <label className="ml-auto inline-flex items-center gap-2 text-[10px] font-bold cursor-pointer" style={{ color: "var(--td-text-md)" }}>
          <input
            type="checkbox"
            checked={state.includeNoise}
            onChange={(e) => onChange({ includeNoise: e.target.checked, page: 1 })}
            className="accent-[#FF4422]"
          />
          Mostrar sin cambio (0 → 0) y duplicados
          {noiseHidden !== null && noiseHidden > 0 && !state.includeNoise && (
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-black" style={{ background: "var(--td-input-bg)", color: "var(--td-text-lo)" }}>
              {noiseHidden.toLocaleString("es-MX")} ocultos
            </span>
          )}
        </label>
      </div>
    </div>
  );
}
