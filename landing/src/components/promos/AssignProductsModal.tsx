import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Search, Unlink, X } from "lucide-react";
import {
  attachPromotionProducts, detachPromotionProduct, getProductsLight,
  type ProductLight, type Promotion,
} from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";
import { promoShortLabel } from "@/lib/promoLabel";

const THI = "var(--td-text-hi)";
const TMD = "var(--td-text-md)";
const TLO = "var(--td-text-lo)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px 10px 34px", borderRadius: 12,
  border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)",
  color: THI, fontSize: 13, fontWeight: 700, outline: "none", boxSizing: "border-box",
};

/** Tope de filas visibles — con miles de productos el modal no debe pintar todo. */
const MAX_RESULTS = 60;

interface Props {
  promo: Promotion;
  onClose: () => void;
  /** Aviso al padre tras cada attach/detach exitoso (para invalidar queries). */
  onChanged: (fresh: Promotion) => void;
}

/**
 * Modal "Asignar productos" de una promo general: buscador con checkboxes
 * (asignación batch TODO-o-NADA) + lista de asignados con quitar. Si el 422
 * detalla conflictos por producto, se muestran aquí mismo (accionable).
 */
export function AssignProductsModal({ promo, onClose, onChanged }: Props) {
  // La promo "viva": cada attach/detach devuelve la versión fresca del server.
  const [current, setCurrent] = useState<Promotion>(promo);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  // Errores del 422 batch: { "<productId>": ["mensaje"] } — ninguno se asignó.
  const [rowErrors, setRowErrors] = useState<Record<string, string[]>>({});

  // MISMA key que el grid de PromosPage: comparte cache (todos los productos
  // light, sin store_id) en vez de refetchear por cada modal.
  const productsQuery = useQuery({
    queryKey: [...queryKeys.products.all, 'light', 'promos', 'global'],
    queryFn: () => getProductsLight(),
    staleTime: 30_000,
  });
  const products: ProductLight[] = useMemo(
    () => productsQuery.data?.data ?? [],
    [productsQuery.data],
  );
  const productName = (id: number): string =>
    products.find(p => p.id === id)?.name ?? `Producto #${id}`;

  const assignedIds = useMemo(
    () => new Set((current.products ?? []).map(p => p.id)),
    [current.products],
  );

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter(p => p.active && !assignedIds.has(p.id))
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q));
  }, [products, assignedIds, search]);

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const attach = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    setRowErrors({});
    try {
      const fresh = await attachPromotionProducts(current.id, [...selected]);
      setCurrent(fresh);
      setSelected(new Set());
      toast.success(`Promoción asignada a ${fresh.products_count ?? fresh.products?.length ?? 0} producto(s)`);
      onChanged(fresh);
    } catch (err: unknown) {
      const e = err as { message?: string; errors?: Record<string, string[]> };
      if (e.errors && Object.keys(e.errors).length > 0) {
        setRowErrors(e.errors);
        toast.error(e.message ?? "Algunos productos chocan con otra promo — ninguno fue asignado.");
      } else {
        toast.error(e.message ?? "No se pudo asignar la promoción");
      }
    } finally {
      setSaving(false);
    }
  };

  const detach = async (productId: number) => {
    try {
      const fresh = await detachPromotionProduct(current.id, productId);
      setCurrent(fresh);
      toast.success("Producto quitado de la promoción");
      onChanged(fresh);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo quitar el producto");
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl p-5"
        style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}
        data-testid="assign-products-modal">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-[15px] font-black" style={{ color: THI }}>Asignar productos</h3>
            <p className="text-[10px] font-bold mt-0.5" style={{ color: TLO }}>
              {promoShortLabel(current)} · {current.name}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Cerrar">
            <X size={16} style={{ color: TLO }} />
          </button>
        </div>

        {/* Asignados actuales */}
        <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: TLO }}>
          Asignados ({current.products?.length ?? 0})
        </p>
        {(current.products?.length ?? 0) === 0 ? (
          <p className="text-[11px] font-bold mb-3" style={{ color: TLO }}>
            Sin productos — la promo existe pero no aplica en Caja hasta asignarle al menos uno.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(current.products ?? []).map(p => (
              <span key={p.id} className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold"
                style={{ background: "var(--td-surface-soft)", border: "1px solid var(--td-card-border)", color: THI }}>
                {p.name}
                <button onClick={() => void detach(p.id)} className="rounded p-0.5 hover:bg-white/10"
                  title="Quitar de la promoción (la promo sigue existiendo)">
                  <Unlink size={11} style={{ color: "var(--td-red)" }} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Errores del batch (422): qué producto choca y por qué */}
        {Object.keys(rowErrors).length > 0 && (
          <div className="rounded-2xl p-3 mb-3 space-y-1" style={{ background: "rgba(224,34,26,0.08)", border: "1px solid rgba(224,34,26,0.35)" }}>
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider" style={{ color: "#FF8A80" }}>
              <AlertTriangle size={11} /> Ningún producto fue asignado
            </p>
            {Object.entries(rowErrors).map(([id, msgs]) => (
              <p key={id} className="text-[10px] font-bold" style={{ color: "#FF8A80" }}>
                <b>{productName(Number(id))}</b>: {msgs.join(" · ")}
              </p>
            ))}
          </div>
        )}

        {/* Buscador */}
        <div className="relative mb-2">
          <Search size={14} style={{ position: "absolute", left: 11, top: 12, color: TLO }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto por nombre o SKU…"
            style={inputStyle}
            data-testid="assign-search-input"
          />
        </div>

        {/* Resultados con checkbox */}
        {productsQuery.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin" style={{ color: TLO }} /></div>
        ) : results.length === 0 ? (
          <p className="py-5 text-center text-[11px] font-bold" style={{ color: TLO }}>
            {search.trim() ? "Sin resultados para esa búsqueda." : "No hay productos disponibles para asignar."}
          </p>
        ) : (
          <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
            {results.slice(0, MAX_RESULTS).map(p => (
              <label key={p.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2 cursor-pointer hover:bg-white/5"
                style={{ border: "1px solid var(--td-card-border)", background: selected.has(p.id) ? "rgba(16,185,129,0.08)" : "transparent" }}>
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  style={{ width: 15, height: 15, accentColor: "#34d399", cursor: "pointer" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-black" style={{ color: THI }}>{p.name}</span>
                  {p.sku && <span className="block text-[9px] font-bold" style={{ color: TLO }}>SKU {p.sku}</span>}
                </span>
              </label>
            ))}
            {results.length > MAX_RESULTS && (
              <p className="py-1.5 text-center text-[9px] font-bold" style={{ color: TLO }}>
                {results.length - MAX_RESULTS} resultado(s) más — afina la búsqueda para verlos.
              </p>
            )}
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 rounded-xl px-4 py-2 text-[11px] font-black uppercase"
            style={{ border: "1px solid var(--td-input-border)", color: TMD, background: "transparent" }}>
            Cerrar
          </button>
          <button onClick={() => void attach()} disabled={saving || selected.size === 0}
            className="flex-1 rounded-xl px-4 py-2 text-[11px] font-black uppercase disabled:opacity-40"
            style={{ background: "#10b981", color: "#04120c", border: "none" }}
            data-testid="assign-submit-btn">
            {saving ? "Asignando…" : `Asignar ${selected.size || ""}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
