import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, Package, Search as SearchIcon, Star } from "lucide-react";
import { toast } from "sonner";
import { getCatalogProductFlags, updateProductFlags } from "@tadaima/api";
import type { ProductFlagRow } from "@tadaima/api";
import { PanelCard, PanelLoader } from "./shared";

const PER_PAGE = 100;

type Filter = "all" | "featured" | "hidden";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "featured", label: "Destacados" },
  { key: "hidden", label: "Ocultos" },
];

const fmt = (n: number | null): string =>
  n == null
    ? "—"
    : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

interface Props {
  canEdit: boolean;
}

/**
 * Lista COMPLETA de productos con sus flags del catálogo global:
 * ★ destacado (sale primero con orden "Destacados") y 👁 visible (ocultar del
 * catálogo público sin darlo de baja del POS). Guardado instantáneo por
 * toggle (optimista con rollback).
 */
export function ProductFlagsPanel({ canEdit }: Props) {
  const [rows, setRows] = useState<ProductFlagRow[]>([]);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const savingIds = useRef<Set<number>>(new Set());

  // Debounce del buscador (300ms) — la búsqueda es server-side.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const load = useCallback((targetPage: number, append: boolean) => {
    const params: Parameters<typeof getCatalogProductFlags>[0] = {
      per_page: PER_PAGE,
      page: targetPage,
      filter,
      ...(search ? { search } : {}),
    };
    return getCatalogProductFlags(params)
      .then((resp) => {
        setRows((prev) => (append ? [...prev, ...resp.data] : resp.data));
        setTotal(resp.pagination.total);
        setLastPage(resp.pagination.last_page);
        setPage(targetPage);
      })
      .catch(() => toast.error("Error al cargar productos"));
  }, [filter, search]);

  useEffect(() => {
    setLoading(true);
    void load(1, false).finally(() => setLoading(false));
  }, [load]);

  const loadMore = () => {
    if (loadingMore || page >= lastPage) return;
    setLoadingMore(true);
    void load(page + 1, true).finally(() => setLoadingMore(false));
  };

  /** Guardado instantáneo optimista con rollback si el server rechaza. */
  const toggle = (row: ProductFlagRow, field: "featured" | "catalog_visible") => {
    if (!canEdit || savingIds.current.has(row.id)) return;
    savingIds.current.add(row.id);
    const nextValue = !row[field];
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: nextValue } : r)));

    updateProductFlags(row.id, { [field]: nextValue })
      .then((resp) => {
        toast.success(
          field === "featured"
            ? resp.featured ? `★ "${resp.name}" destacado` : `"${resp.name}" ya no está destacado`
            : resp.catalog_visible ? `"${resp.name}" visible en el catálogo` : `"${resp.name}" oculto del catálogo`
        );
      })
      .catch(() => {
        // Rollback
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: !nextValue } : r)));
        toast.error("No se pudo guardar el cambio");
      })
      .finally(() => savingIds.current.delete(row.id));
  };

  return (
    <PanelCard
      icon={<Package size={20} />}
      iconColor="#FF8A80"
      title="Productos del Catálogo"
      subtitle="Destaca (★) o esconde (👁) productos del catálogo público"
    >
      <div className="space-y-4">
        {/* Búsqueda + filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nombre o SKU…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl outline-none border border-white/5 bg-white/[0.03] font-bold text-sm text-white placeholder:text-white/15 focus:border-white/20 transition-all"
            />
          </div>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                style={active
                  ? { background: "var(--td-red-dim)", border: "1px solid var(--td-red-brd)", color: "#FF8A80" }
                  : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <PanelLoader />
        ) : rows.length === 0 ? (
          <p className="text-xs font-bold text-white/25 text-center py-10">
            {search ? "Sin resultados para tu búsqueda." : filter === "featured" ? "Aún no has destacado productos." : filter === "hidden" ? "No hay productos ocultos." : "Sin productos."}
          </p>
        ) : (
          <>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/20">
              {rows.length} de {total} producto(s)
            </p>
            <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.02] border border-white/5"
                  style={{ opacity: row.catalog_visible ? 1 : 0.55 }}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                    {row.image ? (
                      <img src={row.image} alt={row.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <Package size={14} className="text-white/20" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-white truncate">
                      {row.name}
                      {!row.active && <span className="ml-2 text-[8px] font-black uppercase text-amber-400/80">Inactivo</span>}
                    </p>
                    <p className="text-[9px] font-bold text-white/30 truncate">
                      {row.sku} · {fmt(row.price_1)}{row.category ? ` · ${row.category.name}` : ""}
                    </p>
                  </div>

                  {/* ★ Destacado */}
                  <button
                    disabled={!canEdit}
                    onClick={() => toggle(row, "featured")}
                    title={row.featured ? "Quitar destacado" : "Destacar en el catálogo"}
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 cursor-pointer"
                    style={row.featured
                      ? { background: "rgba(255,176,32,0.15)", border: "1px solid rgba(255,176,32,0.4)", color: "#FFB020" }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.25)" }}
                  >
                    <Star size={15} fill={row.featured ? "currentColor" : "none"} />
                  </button>

                  {/* 👁 Visible en catálogo */}
                  <button
                    disabled={!canEdit}
                    onClick={() => toggle(row, "catalog_visible")}
                    title={row.catalog_visible ? "Ocultar del catálogo público" : "Mostrar en el catálogo público"}
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 cursor-pointer"
                    style={row.catalog_visible
                      ? { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.35)", color: "#34D399" }
                      : { background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.35)", color: "#FF8A80" }}
                  >
                    {row.catalog_visible ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                </div>
              ))}
            </div>

            {page < lastPage && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 border border-white/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loadingMore ? <Loader2 size={13} className="animate-spin inline" /> : `Cargar más (${total - rows.length} restantes)`}
              </button>
            )}
          </>
        )}
      </div>
    </PanelCard>
  );
}
