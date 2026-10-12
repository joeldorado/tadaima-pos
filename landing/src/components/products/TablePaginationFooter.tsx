import type { CSSProperties } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from "lucide-react";

/**
 * Pie de paginación SERVER-SIDE de las tablas de la página Productos
 * (Productos en tabla/cuadrícula y Tomos). Solo pinta: quien lo usa manda la
 * página, el total de páginas del servidor y el texto de la izquierda.
 *
 * Antes eran dos copias; la de Tomos paginaba en el navegador sobre lo cargado
 * y por eso nunca pasaba de la primera página del servidor (2026-10-12).
 */
interface TablePaginationFooterProps {
  /** Texto de la izquierda, ya armado (ver lib/paginationLabel.ts). */
  label: string;
  /** Spinner chico junto al texto mientras llega la página nueva. */
  isFetching?: boolean;
  /** Página actual, base 0. */
  pageIndex: number;
  /** Total de páginas según el servidor. */
  pageCount: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  onPageChange: (pageIndex: number) => void;
  /** Quien lo recibe debe regresar a la página 1: el índice viejo puede quedar fuera de rango. */
  onPageSizeChange: (pageSize: number) => void;
}

const DEFAULT_PAGE_SIZES = [10, 20, 50, 100] as const;
/** Cuántos números de página se muestran a cada lado de la actual. */
const PAGE_WINDOW = 2;

const TEXT_MUTED = "var(--td-text-lo)";
const ACTIVE_PAGE = "#FF4422";

const NAV_BUTTON: CSSProperties = {
  color: "var(--td-text-md)",
  background: "var(--td-surface-muted)",
  border: "1px solid var(--td-card-border)",
};

const SIZE_SELECT: CSSProperties = {
  background: "var(--td-input-bg)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid var(--td-input-border)",
  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.08)",
  color: "var(--td-input-text)",
};

export function TablePaginationFooter({
  label,
  isFetching = false,
  pageIndex,
  pageCount,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  onPageChange,
  onPageSizeChange,
}: TablePaginationFooterProps) {
  const lastIndex = Math.max(0, pageCount - 1);
  const canPrevious = pageIndex > 0;
  const canNext = pageIndex < lastIndex;

  const visiblePages: number[] = [];
  for (let i = Math.max(0, pageIndex - PAGE_WINDOW); i <= Math.min(lastIndex, pageIndex + PAGE_WINDOW); i++) {
    visiblePages.push(i);
  }

  return (
    <div
      className="flex items-center justify-between px-6 py-4 gap-4 flex-wrap"
      style={{ borderTop: "1px solid var(--td-card-border)", background: "var(--td-table-foot-bg)" }}
    >
      <span
        className="text-[11px] font-semibold inline-flex items-center gap-2"
        style={{ color: TEXT_MUTED }}
        aria-live="polite"
      >
        {label}
        {isFetching && <Loader2 size={11} className="animate-spin" />}
      </span>
      <nav className="flex items-center gap-1" aria-label="Paginación">
        <button
          onClick={() => onPageChange(0)}
          disabled={!canPrevious}
          className="p-2 rounded-xl transition-all disabled:opacity-30"
          style={NAV_BUTTON}
          title="Primera página"
          aria-label="Primera página"
        >
          <ChevronsLeft size={15} />
        </button>
        <button
          onClick={() => onPageChange(pageIndex - 1)}
          disabled={!canPrevious}
          className="p-2 rounded-xl transition-all disabled:opacity-30"
          style={NAV_BUTTON}
          title="Página anterior"
          aria-label="Página anterior"
        >
          <ChevronLeft size={15} />
        </button>

        {visiblePages.map(i => (
          <button
            key={i}
            onClick={() => onPageChange(i)}
            className="min-w-8 h-8 px-1 rounded-xl text-xs font-bold transition-all"
            style={
              i === pageIndex
                ? { background: ACTIVE_PAGE, color: "#fff" }
                : { color: TEXT_MUTED, background: "transparent" }
            }
            aria-label={`Página ${i + 1}`}
            aria-current={i === pageIndex ? "page" : undefined}
          >
            {i + 1}
          </button>
        ))}

        <button
          onClick={() => onPageChange(pageIndex + 1)}
          disabled={!canNext}
          className="p-2 rounded-xl transition-all disabled:opacity-30"
          style={NAV_BUTTON}
          title="Página siguiente"
          aria-label="Página siguiente"
        >
          <ChevronRight size={15} />
        </button>
        <button
          onClick={() => onPageChange(lastIndex)}
          disabled={!canNext}
          className="p-2 rounded-xl transition-all disabled:opacity-30"
          style={NAV_BUTTON}
          title="Última página"
          aria-label="Última página"
        >
          <ChevronsRight size={15} />
        </button>

        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="ml-2 px-2 py-1 rounded-xl text-xs font-bold outline-none"
          style={SIZE_SELECT}
          aria-label="Filas por página"
        >
          {pageSizeOptions.map(s => (
            <option key={s} value={s}>{s} / página</option>
          ))}
        </select>
      </nav>
    </div>
  );
}
