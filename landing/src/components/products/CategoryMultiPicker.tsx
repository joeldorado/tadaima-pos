import { useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Search, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { createCategory } from "@tadaima/api";
import { useCategoriesQuery } from "@/hooks/queries/useCategories";
import { queryKeys } from "@/lib/queryKeys";
import { pickCategoryMatches } from "@/lib/categoryPicker";

/**
 * Selector de categorías MÚLTIPLES (Joel 2026-08-17): chips con las
 * elegidas + buscador con lista de las existentes + "crear «x»" inline.
 * Todas las categorías son iguales (sin principal); el orden de los chips es
 * el orden en que se eligieron (position en el pivote). Se usa en el modal
 * de Productos, en MangaEditModal y en el alta masiva de tomos.
 */
export interface CategoryMultiPickerProps {
  value: number[];
  onChange: (ids: number[]) => void;
  /** Deshabilita edición (p.ej. mientras guarda). */
  disabled?: boolean;
  /** Placeholder del buscador. */
  placeholder?: string;
  /** Permite crear categorías nuevas desde el buscador (default true). */
  allowCreate?: boolean;
  /** Compacto (para alta masiva). */
  dense?: boolean;
}

const INPUT: CSSProperties = {
  background: "var(--td-input-bg)",
  border: "1px solid var(--td-input-border)",
  color: "var(--td-input-text)",
};
const CHIP: CSSProperties = {
  background: "linear-gradient(135deg, #CC2200, #FF4422)",
  border: "1px solid rgba(255,120,90,0.4)",
  color: "#fff",
};
// Fondo OPACO (--td-popup-bg): el panel vive en un portal sobre cualquier
// cosa (footer del modal incluido); --td-panel-bg es casi transparente y se
// veía el botón "Guardar" a través.
const PANEL: CSSProperties = {
  background: "var(--td-popup-bg, var(--td-panel-bg))",
  border: "1px solid var(--td-panel-border)",
  boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
};
/** Alto máximo del panel (lista max-h-56 = 224px + pie) para decidir si abre hacia arriba. */
const PANEL_MAX_PX = 260;

export function CategoryMultiPicker({
  value, onChange, disabled = false, placeholder = "Buscar o crear categoría…", allowCreate = true, dense = false,
}: CategoryMultiPickerProps) {
  const queryClient = useQueryClient();
  const categoriesQuery = useCategoriesQuery();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // El picker vive dentro del cuerpo scrolleable del modal (Productos/Tomos):
  // un panel `absolute` se recortaba contra el footer y solo se veían ~3
  // opciones (QA 2026-08-18 "al editar no se ve"). El panel se renderiza en un
  // portal con posición FIJA anclada a la caja de chips (y se voltea hacia
  // arriba si abajo no cabe), así escapa del overflow del modal. Se recalcula
  // al hacer scroll/resize y cuando cambian los chips (la caja crece).
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  useEffect(() => {
    if (!open) { setPanelPos(null); return; }
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      const spaceBelow = window.innerHeight - r.bottom;
      const up = spaceBelow < PANEL_MAX_PX && r.top > spaceBelow;
      setPanelPos({ top: up ? r.top - 4 : r.bottom + 4, left: r.left, width: r.width, up });
    };
    place();
    window.addEventListener("resize", place);
    // capture: también los scrolls de contenedores internos (cuerpo del modal).
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, value.length]);

  const all = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const byId = useMemo(() => new Map(all.map(c => [c.id, c])), [all]);
  const selected = value.map(id => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
  const { matches, exact } = useMemo(() => pickCategoryMatches(all, query, value), [all, query, value]);
  const canCreate = allowCreate && query.trim().length > 0 && !exact;

  const add = (id: number) => {
    if (value.includes(id)) return;
    onChange([...value, id]);
    setQuery("");
    inputRef.current?.focus();
  };
  const remove = (id: number) => onChange(value.filter(v => v !== id));

  const create = async () => {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const cat = await createCategory({ name });
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
      onChange([...value, cat.id]);
      setQuery("");
      toast.success(`Categoría «${cat.name}» creada`);
    } catch (e: unknown) {
      const msg = (e as { message?: string } | null)?.message;
      toast.error(msg && msg !== "Error desconocido" ? msg : "No se pudo crear la categoría");
    } finally {
      setCreating(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches[0]) add(matches[0].id);
      else if (canCreate) void create();
    } else if (e.key === "Backspace" && query === "" && value.length > 0) {
      remove(value[value.length - 1]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // El panel va en portal (fuera del árbol del picker): el blur cierra solo si
  // el foco no se fue ni a la caja ni al panel. Las opciones hacen
  // preventDefault en mousedown, así el input no pierde el foco al elegir.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (e.currentTarget.contains(next) || panelRef.current?.contains(next)) return;
    setOpen(false);
  };

  return (
    <div className="relative" onBlur={onBlur}>
      {/* Chips + input en la misma "caja" */}
      <div
        ref={boxRef}
        className={`flex flex-wrap items-center gap-1.5 rounded-2xl ${dense ? "px-2 py-1.5" : "px-3 py-2"} ${disabled ? "opacity-60" : ""}`}
        style={INPUT}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {selected.length === 0 && (
          <Tag size={14} style={{ color: "var(--td-text-lo)" }} className="shrink-0 ml-1" />
        )}
        {selected.map(c => (
          <span
            key={c.id}
            className={`inline-flex items-center gap-1 rounded-full font-bold ${dense ? "text-[10px] px-2 py-0.5" : "text-[11px] px-2.5 py-1"}`}
            style={CHIP}
            data-testid="category-chip"
          >
            {c.name}
            {!disabled && (
              <button
                type="button"
                aria-label={`Quitar ${c.name}`}
                onClick={e => { e.stopPropagation(); remove(c.id); }}
                className="rounded-full hover:bg-white/20 transition-colors"
              >
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selected.length === 0 ? placeholder : "Agregar otra…"}
          className={`flex-1 min-w-[120px] bg-transparent outline-none ${dense ? "text-xs py-0.5" : "text-sm py-1"}`}
          style={{ color: "var(--td-input-text)" }}
          aria-label="Buscar categoría"
        />
      </div>

      {open && !disabled && panelPos && createPortal(
        <div
          ref={panelRef}
          className="rounded-2xl overflow-hidden"
          style={{
            ...PANEL,
            position: "fixed",
            zIndex: 1000,
            left: panelPos.left,
            width: panelPos.width,
            ...(panelPos.up
              ? { bottom: window.innerHeight - panelPos.top }
              : { top: panelPos.top }),
          }}
          role="listbox"
          tabIndex={-1}
          data-testid="category-picker-panel"
        >
          <div className="max-h-56 overflow-y-auto py-1">
            {categoriesQuery.isLoading && (
              <p className="px-4 py-2 text-xs" style={{ color: "var(--td-text-lo)" }}>Cargando categorías…</p>
            )}
            {matches.slice(0, 40).map(c => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={e => e.preventDefault()}
                onClick={() => add(c.id)}
                className="w-full text-left px-4 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-white/5 transition-colors"
                style={{ color: "var(--td-text-hi)" }}
              >
                <Search size={12} style={{ color: "var(--td-text-lo)" }} />
                {c.name}
                {!c.active && <span className="text-[10px] uppercase tracking-wider ml-auto" style={{ color: "var(--td-text-lo)" }}>inactiva</span>}
              </button>
            ))}
            {!categoriesQuery.isLoading && matches.length === 0 && !canCreate && (
              <p className="px-4 py-2 text-xs" style={{ color: "var(--td-text-lo)" }}>
                {query.trim() ? "Ya está seleccionada o no existe" : "Escribe para buscar"}
              </p>
            )}
            {canCreate && (
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => void create()}
                disabled={creating}
                className="w-full text-left px-4 py-2 text-sm font-black flex items-center gap-2 hover:bg-white/5 transition-colors disabled:opacity-50"
                style={{ color: "#FF4422", borderTop: "1px solid var(--td-panel-border)" }}
              >
                <Plus size={13} /> Crear «{query.trim()}»
              </button>
            )}
          </div>
          {selected.length > 0 && (
            <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest flex items-center gap-1" style={{ color: "var(--td-text-lo)", borderTop: "1px solid var(--td-panel-border)" }}>
              <Check size={10} /> {selected.length} seleccionada{selected.length === 1 ? "" : "s"} · Enter agrega la primera
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
