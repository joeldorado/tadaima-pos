import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Search, Unlink, X } from "lucide-react";
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
const MAX_RESULTS = 80;

type Filtro = "todos" | "asignados" | "sin";

interface Props {
  promo: Promotion;
  onClose: () => void;
  /** Aviso al padre tras cada attach/detach exitoso (para invalidar queries). */
  onChanged: (fresh: Promotion) => void;
}

/**
 * Asignar productos a una promo general — TABLA de un click (pedido Joel
 * 2026-07-24: "asignar ahí mismo de forma fácil, buscando, algo simple").
 * Antes era checkbox + botón batch (dos pasos); ahora cada fila trae SU botón
 * Asignar/Quitar que pega al server al instante. El buscador + filtro
 * Todos/Asignados/Sin asignar cubren catálogos grandes.
 */
export function AssignProductsModal({ promo, onClose, onChanged }: Props) {
  // La promo "viva": cada attach/detach devuelve la versión fresca del server.
  const [current, setCurrent] = useState<Promotion>(promo);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  /** Id del producto cuya fila está guardando (spinner puntual, no global). */
  const [busyId, setBusyId] = useState<number | null>(null);

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

  const assignedIds = useMemo(
    () => new Set((current.products ?? []).map(p => p.id)),
    [current.products],
  );
  const assignedCount = current.products?.length ?? 0;

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter(p => p.active)
      .filter(p => filtro === "todos"
        || (filtro === "asignados" ? assignedIds.has(p.id) : !assignedIds.has(p.id)))
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q))
      // Asignados primero: lo que ya tiene la promo se ve de un vistazo.
      .sort((a, b) => Number(assignedIds.has(b.id)) - Number(assignedIds.has(a.id))
        || a.name.localeCompare(b.name, "es"));
  }, [products, assignedIds, search, filtro]);

  const attachOne = async (p: ProductLight) => {
    setBusyId(p.id);
    try {
      const fresh = await attachPromotionProducts(current.id, [p.id]);
      setCurrent(fresh);
      toast.success(`"${p.name}" asignado a la promo`);
      onChanged(fresh);
    } catch (err: unknown) {
      // El 422 del server detalla el conflicto (duplicado/tope/tipo/pago).
      const e = err as { message?: string; errors?: Record<string, string[]> };
      const detail = e.errors ? Object.values(e.errors).flat().join(" · ") : "";
      toast.error(detail || e.message || "No se pudo asignar la promoción");
    } finally {
      setBusyId(null);
    }
  };

  const detachOne = async (p: ProductLight) => {
    setBusyId(p.id);
    try {
      const fresh = await detachPromotionProduct(current.id, p.id);
      setCurrent(fresh);
      toast.success(`"${p.name}" quitado de la promo (la promo sigue existiendo)`);
      onChanged(fresh);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo quitar el producto");
    } finally {
      setBusyId(null);
    }
  };

  const filtros: Array<[Filtro, string]> = [
    ["todos", "Todos"],
    ["asignados", `Asignados (${assignedCount})`],
    ["sin", "Sin asignar"],
  ];

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl p-5"
        style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}
        data-testid="assign-products-modal">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-[15px] font-black" style={{ color: THI }}>Asignar productos</h3>
            <p className="text-[10px] font-bold mt-0.5" style={{ color: TLO }}>
              {promoShortLabel(current)} · {current.name}
              {assignedCount === 0 && " — sin productos la promo no aplica en Caja"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Cerrar">
            <X size={16} style={{ color: TLO }} />
          </button>
        </div>

        {/* Buscador + filtros */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} style={{ position: "absolute", left: 11, top: 12, color: TLO }} />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto por nombre o SKU…"
              style={inputStyle}
              data-testid="assign-search-input"
            />
          </div>
          <div className="flex gap-1.5">
            {filtros.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFiltro(key)}
                className="rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider"
                style={filtro === key
                  ? { background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.45)", color: "#34d399" }
                  : { background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", color: TLO, cursor: "pointer" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla de productos — un click asigna/quita */}
        {productsQuery.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin" style={{ color: TLO }} /></div>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-[11px] font-bold" style={{ color: TLO }}>
            {search.trim() ? "Sin resultados para esa búsqueda." : "No hay productos en este filtro."}
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto rounded-2xl" style={{ border: "1px solid var(--td-card-border)", minHeight: 200 }}>
            {results.slice(0, MAX_RESULTS).map((p, i) => {
              const asignado = assignedIds.has(p.id);
              const busy = busyId === p.id;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2"
                  style={{
                    ...(i > 0 ? { borderTop: "1px solid var(--td-card-border)" } : {}),
                    background: asignado ? "rgba(16,185,129,0.06)" : "transparent",
                  }}
                  data-testid={`assign-row-${p.id}`}
                >
                  {/* Miniatura */}
                  <div className="shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
                    style={{ width: 34, height: 34, background: "var(--td-surface-soft)" }}>
                    {p.image
                      ? <img src={p.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 8, fontWeight: 900, color: "rgba(255,255,255,0.18)" }}>TDM</span>}
                  </div>

                  {/* Nombre + SKU */}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-black" style={{ color: THI }}>{p.name}</span>
                    <span className="block text-[9px] font-bold" style={{ color: TLO }}>
                      {p.sku ? `SKU ${p.sku}` : ""}
                      {asignado && <span className="ml-1.5 text-emerald-400">· EN ESTA PROMO</span>}
                    </span>
                  </span>

                  {/* Acción de UN click */}
                  {asignado ? (
                    <button
                      onClick={() => void detachOne(p)}
                      disabled={busy}
                      className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
                      style={{ background: "rgba(224,34,26,0.10)", border: "1px solid rgba(224,34,26,0.4)", color: "var(--td-red)", cursor: "pointer" }}
                      title="Quitar de la promoción (la promo sigue existiendo)"
                    >
                      {busy ? <Loader2 size={11} className="animate-spin" /> : <Unlink size={11} />} Quitar
                    </button>
                  ) : (
                    <button
                      onClick={() => void attachOne(p)}
                      disabled={busy}
                      className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
                      style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.45)", color: "#34d399", cursor: "pointer" }}
                      data-testid={`assign-btn-${p.id}`}
                    >
                      {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Asignar
                    </button>
                  )}
                </div>
              );
            })}
            {results.length > MAX_RESULTS && (
              <p className="py-2 text-center text-[9px] font-bold" style={{ color: TLO, borderTop: "1px solid var(--td-card-border)" }}>
                {results.length - MAX_RESULTS} resultado(s) más — afina la búsqueda para verlos.
              </p>
            )}
          </div>
        )}

        {/* Cierre */}
        <button onClick={onClose} className="mt-4 rounded-xl px-4 py-2.5 text-[11px] font-black uppercase"
          style={{ border: "1px solid var(--td-input-border)", color: TMD, background: "transparent", cursor: "pointer" }}>
          Listo
        </button>
      </div>
    </div>
  );
}
