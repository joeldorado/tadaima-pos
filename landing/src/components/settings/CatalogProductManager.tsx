import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Package, Plus, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  getCatalogProducts,
  addCatalogProduct,
  updateCatalogProduct,
  removeCatalogProduct,
  getProducts,
  storageUrl,
} from "@tadaima/api";
import type { Product, CatalogProductsResponse } from "@tadaima/api";

type CatalogRow = CatalogProductsResponse["data"][number];

const GLASS: React.CSSProperties = {
  background: "var(--td-panel-bg)",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  border: "1px solid var(--td-panel-border)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)",
};

interface CatalogProductManagerProps {
  storeId: number;
  canEdit: boolean;
}

/**
 * Gestor de productos del catálogo de una tienda. Reutiliza los endpoints
 * existentes (getCatalogProducts/add/update/remove) y, para agregar, el patrón
 * de picker inline de TabPermisos (getProducts + búsqueda client-side + slice).
 */
export function CatalogProductManager({ storeId, canEdit }: CatalogProductManagerProps) {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([getCatalogProducts(storeId, { per_page: 200 }), getProducts()])
      .then(([cat, prods]) => {
        setRows(cat.data);
        setAllProducts(Array.isArray(prods) ? prods : (prods as { data: Product[] }).data ?? []);
      })
      .catch(() => toast.error("Error al cargar productos del catálogo"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const includedIds = useMemo(() => new Set(rows.map((r) => r.product.id)), [rows]);

  const pickable = useMemo(() => {
    const q = search.toLowerCase();
    return allProducts
      .filter((p) => !includedIds.has(p.id))
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 120);
  }, [allProducts, includedIds, search]);

  const handleAdd = async (p: Product) => {
    setBusyId(p.id);
    try {
      await addCatalogProduct(storeId, { product_id: p.id, visible: true });
      load();
      toast.success(`${p.name} agregado`);
    } catch {
      toast.error("Error al agregar producto");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggle = async (row: CatalogRow) => {
    setBusyId(row.product.id);
    try {
      await updateCatalogProduct(storeId, row.product.id, { visible: !row.visible });
      setRows((prev) =>
        prev.map((r) => (r.product.id === row.product.id ? { ...r, visible: !r.visible } : r))
      );
    } catch {
      toast.error("Error al actualizar visibilidad");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (row: CatalogRow) => {
    setBusyId(row.product.id);
    try {
      await removeCatalogProduct(storeId, row.product.id);
      setRows((prev) => prev.filter((r) => r.product.id !== row.product.id));
      toast.success("Producto quitado del catálogo");
    } catch {
      toast.error("Error al quitar producto");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-8 rounded-[32px]" style={GLASS}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#E0221A]">
            <ShoppingBag size={20} />
          </div>
          <div>
            <h2 className="text-base font-black text-white uppercase tracking-[0.1em]">Productos del Catálogo</h2>
            <p className="text-[9px] font-black uppercase text-white/20 tracking-widest mt-0.5">
              {rows.length} producto{rows.length !== 1 ? "s" : ""} en la tienda online
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowPicker((v) => !v)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all border ${
              showPicker
                ? "bg-white/10 border-white/15 text-white"
                : "bg-[#E0221A]/15 border-[#E0221A]/30 text-[#ff6a5e] hover:bg-[#E0221A]/25"
            }`}
          >
            {showPicker ? <X size={14} /> : <Plus size={14} />}
            {showPicker ? "Cerrar" : "Agregar productos"}
          </button>
        )}
      </div>

      {/* Picker inline */}
      {showPicker && canEdit && (
        <div className="mb-6 p-4 rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto por nombre o SKU…"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] pl-11 pr-4 py-3 text-sm font-bold text-white placeholder:text-white/25 outline-none focus:border-white/20"
            />
          </div>
          <p className="text-[9px] font-bold text-white/25 mb-2 ml-1">
            {pickable.length} disponible{pickable.length !== 1 ? "s" : ""}
            {allProducts.length - includedIds.size > pickable.length ? " · refina la búsqueda" : ""}
          </p>
          <div className="max-h-72 overflow-y-auto flex flex-col gap-1">
            {pickable.length === 0 ? (
              <p className="text-center text-white/30 text-xs py-6">Sin productos para agregar</p>
            ) : (
              pickable.map((p) => (
                <button
                  key={p.id}
                  disabled={busyId === p.id}
                  onClick={() => handleAdd(p)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.04] transition-colors text-left disabled:opacity-50"
                >
                  <div className="w-6 h-6 rounded-md bg-[#E0221A]/15 border border-[#E0221A]/30 flex items-center justify-center shrink-0 text-[#ff6a5e]">
                    {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white/80 truncate">{p.name}</p>
                    <p className="text-[9px] text-white/30">{p.sku}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Lista de publicados */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={22} className="animate-spin text-white/20" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-white/25">
          <Package size={30} className="mx-auto mb-3" />
          <p className="text-xs font-black uppercase tracking-widest">El catálogo está vacío</p>
          <p className="text-[10px] font-bold text-white/20 mt-1">Agrega productos para publicarlos en la tienda online</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {rows.map((row) => {
            const img = row.product.images?.[0]?.path ? storageUrl(row.product.images[0].path) : "";
            const busy = busyId === row.product.id;
            return (
              <div
                key={row.catalog_product_id}
                className={`flex items-center gap-3 p-3 rounded-2xl border bg-white/[0.02] ${
                  row.visible ? "border-white/8" : "border-white/5 opacity-60"
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                  {img ? (
                    <img src={img} alt={row.product.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <Package size={16} className="text-white/25" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-white truncate">{row.product.name}</p>
                  <p className="text-[9px] text-white/30">{row.product.sku}</p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      disabled={busy}
                      onClick={() => handleToggle(row)}
                      title={row.visible ? "Visible — clic para ocultar" : "Oculto — clic para mostrar"}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50 ${
                        row.visible
                          ? "text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20"
                          : "text-white/30 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : row.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => handleRemove(row)}
                      title="Quitar del catálogo"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 bg-white/5 hover:bg-red-500/15 hover:text-red-300 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
