import { AlertTriangle, Package, Pencil } from "lucide-react";
import { motion as Motion } from "motion/react";
import { getPrice, type Product } from "@tadaima/api";
import { isSkuMatch } from "@/lib/productCode";

const AMBER = "#F59E0B";

interface Props {
  /** Productos que ya tienen el código (GET /products/lookup, SKU primero). */
  matches: Product[];
  /** Código capturado en el campo SKU / Código. */
  code: string;
  /** "create": ofrece abrir el existente. "edit": solo avisa (no se pierde lo editado). */
  mode: "create" | "edit";
  /** Admin/gerente — el cajero ve cuál es, pero no puede editarlo. */
  canEdit: boolean;
  onEdit: (p: Product) => void;
  fmt: (n: number) => string;
}

/**
 * Aviso compacto bajo el campo SKU / Código cuando el código ya existe
 * (Joel 2026-09-25). Equivalente al "Ya existe artículo con código X,
 * ¿desea modificarlo?" del sistema viejo, pero diciendo CUÁL es (foto,
 * nombre, precio, stock) y con un botón para editarlo — sin tapar el
 * formulario de alta.
 */
export function DuplicateCodeNotice({ matches, code, mode, canEdit, onEdit, fmt }: Props) {
  const main = matches[0];
  if (!main) return null;
  const bySku = isSkuMatch(main, code);
  const image = main.images?.[0]?.url ?? "";
  const stock = Number(main.stock_total ?? 0) || 0;
  const title = mode === "edit"
    ? "Otro producto ya usa este código"
    : bySku ? "Este código ya existe" : "Este código ya es el código de barras de otro producto";

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
          : <Package size={18} color={AMBER} />}
      </div>

      <div className="min-w-0 flex-1">
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

      {mode === "create" && canEdit && (
        <button
          type="button"
          data-testid="duplicate-code-edit"
          onClick={() => onEdit(main)}
          className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider"
          style={{ background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.5)", color: AMBER }}
        >
          <Pencil size={12} /> Editar ese producto
        </button>
      )}
      {mode === "create" && !canEdit && bySku && (
        <span className="shrink-0 text-[10px] font-bold" style={{ color: "var(--td-text-lo)" }}>
          Pide a un gerente que lo edite.
        </span>
      )}
    </Motion.div>
  );
}
