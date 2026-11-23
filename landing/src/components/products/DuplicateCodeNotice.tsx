import { AlertTriangle, BookOpen, Boxes, Package, Pencil, type LucideIcon } from "lucide-react";
import { motion as Motion } from "motion/react";
import { getPrice, type Product } from "@tadaima/api";
import {
  duplicateNoticeActions,
  duplicateNoticeTitle,
  isMangaMatch,
  showAskManagerHint,
  type DuplicateAction,
  type DuplicateNoticeMode,
} from "@/lib/duplicateCodeActions";

const AMBER = "#F59E0B";

const defaultFmt = (n: number): string =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n);

interface Props {
  /** Productos/tomos que ya tienen el código (GET /products/lookup, SKU primero). */
  matches: Product[];
  /** Código capturado en el campo SKU / Código / ISBN. */
  code: string;
  /** "create": ofrece abrir el existente. "edit": solo avisa (no se pierde lo editado). */
  mode: DuplicateNoticeMode;
  /** Admin/gerente — el cajero ve cuál es, pero no puede editarlo. */
  canEdit: boolean;
  /** Producto normal → "Editar ese producto". */
  onEditProduct?: (p: Product) => void;
  /** Tomo → "Editar tomo" (su propio modal, no el de producto). */
  onEditManga?: (p: Product) => void;
  /** Tomo → "Cambiar existencia". */
  onOpenStock?: (p: Product) => void;
  fmt?: (n: number) => string;
}

interface ActionView {
  label: string;
  icon: LucideIcon;
  testId: string;
}

const ACTION_VIEW: Record<DuplicateAction, ActionView> = {
  "edit-product": { label: "Editar ese producto", icon: Pencil, testId: "duplicate-code-edit" },
  "edit-manga": { label: "Editar tomo", icon: Pencil, testId: "duplicate-code-edit" },
  "stock-manga": { label: "Cambiar existencia", icon: Boxes, testId: "duplicate-code-stock" },
};

/**
 * Aviso compacto bajo el campo de código cuando el código ya existe
 * (Joel 2026-09-25). Equivalente al "Ya existe artículo con código X,
 * ¿desea modificarlo?" del sistema viejo, pero diciendo CUÁL es (foto,
 * nombre, precio, stock) y con botones para editarlo — sin tapar el
 * formulario de alta. Desde 2026-11-23 también en el alta de tomos: si lo que
 * ya tiene el código es un tomo, lo dice y ofrece "Editar tomo" y
 * "Cambiar existencia".
 */
export function DuplicateCodeNotice({
  matches, code, mode, canEdit, onEditProduct, onEditManga, onOpenStock, fmt = defaultFmt,
}: Props) {
  const main = matches[0];
  if (!main) return null;
  const image = main.images?.[0]?.url ?? "";
  const stock = Number(main.stock_total ?? 0) || 0;
  const title = duplicateNoticeTitle(main, code, mode);
  const actions = duplicateNoticeActions(main, {
    mode,
    canEdit,
    handlers: { editProduct: !!onEditProduct, editManga: !!onEditManga, stock: !!onOpenStock },
  });
  const handlerFor: Record<DuplicateAction, ((p: Product) => void) | undefined> = {
    "edit-product": onEditProduct,
    "edit-manga": onEditManga,
    "stock-manga": onOpenStock,
  };
  const FallbackIcon = isMangaMatch(main) ? BookOpen : Package;

  return (
    <Motion.div
      data-testid="duplicate-code-notice"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 flex-wrap"
      style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)" }}
    >
      <div
        className="shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
        style={{ width: 40, height: 40, background: "var(--td-input-bg)", border: "1px solid rgba(245,158,11,0.3)" }}
      >
        {image
          ? <img src={image} alt={main.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <FallbackIcon size={18} color={AMBER} />}
      </div>

      {/* Ancho mínimo: con dos botones en una columna angosta, los botones bajan
          a otro renglón en vez de aplastar el texto. */}
      <div className="min-w-[11rem] flex-1">
        <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: AMBER, margin: 0 }}>
          <AlertTriangle size={12} /> {title}
        </p>
        <p className="text-[13px] font-extrabold line-clamp-2 break-words" style={{ color: "var(--td-text-hi)", margin: 0 }} title={main.name}>
          {main.name}
          {!main.active && <span className="ml-1.5 text-[10px] font-bold" style={{ color: "var(--td-text-lo)" }}>(desactivado)</span>}
        </p>
        <p className="text-[11px] font-bold break-words" style={{ color: "var(--td-text-lo)", margin: 0 }}>
          SKU {main.sku}
          {main.barcode && main.barcode !== main.sku ? ` · CB ${main.barcode}` : ""}
          {` · ${fmt(getPrice(main, 1))}`}
          {` · ${stock > 0 ? `${stock.toLocaleString("es-MX")} en stock` : "sin stock"}`}
          {matches.length > 1 ? ` · +${matches.length - 1} más con este código` : ""}
        </p>
      </div>

      {actions.length > 0 && (
        <div className="ml-auto shrink-0 flex flex-wrap justify-end gap-1.5">
          {actions.map(action => {
            const view = ACTION_VIEW[action];
            const Icon = view.icon;
            const handler = handlerFor[action];
            return (
              <button
                key={action}
                type="button"
                data-testid={view.testId}
                onClick={() => handler?.(main)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.5)", color: AMBER, outlineColor: AMBER }}
              >
                <Icon size={12} /> {view.label}
              </button>
            );
          })}
        </div>
      )}
      {showAskManagerHint(main, code, { mode, canEdit }) && (
        <span className="shrink-0 text-[10px] font-bold" style={{ color: "var(--td-text-lo)" }}>
          Pide a un gerente que lo edite.
        </span>
      )}
    </Motion.div>
  );
}
