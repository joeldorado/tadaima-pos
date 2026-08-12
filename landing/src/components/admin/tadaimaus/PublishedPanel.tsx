import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, Ban, DollarSign, Eye, EyeOff, Loader2, Package, PackagePlus,
  RefreshCw, Search as SearchIcon, Trash2, X,
} from "lucide-react";
import {
  createUsListing, deleteUsListing, getProductsLight, listUsListings, updateUsListing,
} from "@tadaima/api";
import type {
  CreateUsListingInput, ProductLight, UpdateUsListingInput, UsCategory, UsListing, UsListingListResponse,
} from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";
import { errMsg } from "./usFormat";
import { CustomListingModal } from "./CustomListingModal";

const inputStyle: CSSProperties = {
  background: "var(--td-input-bg)",
  border: "1px solid var(--td-input-border)",
  borderRadius: 10,
  color: "var(--td-input-text)",
  outline: "none",
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 700,
  width: "100%",
  boxSizing: "border-box",
};

const cardStyle: CSSProperties = {
  background: "var(--td-card-bg)",
  border: "1px solid var(--td-card-border)",
  borderRadius: 16,
  padding: 16,
};

/** Máximo de resultados del buscador mostrados a la vez (la búsqueda es server-side). */
const MAX_SEARCH_RESULTS = 20;

/** Opciones de categoría de la tienda US (labels en español, values del backend). */
const US_CATEGORY_OPTIONS: { value: UsCategory; label: string }[] = [
  { value: "figures", label: "Figuras" },
  { value: "manga", label: "Manga" },
  { value: "tcg", label: "TCG" },
  { value: "other", label: "Otro" },
];

/**
 * Sugerencia de categoría US solo cuando es trivial deducirla del producto del
 * POS (product_type manga o keywords obvias en el nombre); si no, 'other'.
 */
function suggestUsCategory(product: ProductLight): UsCategory {
  if (product.product_type === "manga") return "manga";
  const name = product.name.toLowerCase();
  if (/\b(tcg|booster|sobres?|deck|cartas?)\b/.test(name)) return "tcg";
  if (/\b(figuras?|figure|figuarts|nendoroid|figma|funko|banpresto|pop up parade|escala|scale)\b/.test(name)) return "figures";
  return "other";
}

/**
 * TadaimaUS · Publicados — (a) buscador de productos del POS para publicarlos
 * en la tienda US con precio manual en dólares y categoría (Figures/Manga/TCG);
 * (b) tabla de publicados con precio y categoría editables inline (optimista +
 * rollback), toggle de visibilidad, indicador de stock y quitar con confirmación.
 */
export function PublishedPanel() {
  const qc = useQueryClient();
  const listingsKey = queryKeys.usStore.listings();

  // ── Buscador de productos del POS (server-side, debounce 300ms) ────────────
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ light: 1, usPicker: search }),
    queryFn: () => getProductsLight({ search }),
    enabled: search.length >= 2,
    staleTime: 60_000,
    retry: 1,
  });

  // ── Publicados ─────────────────────────────────────────────────────────────
  const listingsQuery = useQuery({
    queryKey: listingsKey,
    queryFn: () => listUsListings(),
    retry: 1,
  });
  const listings = listingsQuery.data?.data ?? [];
  const publishedIds = useMemo(() => new Set(listings.map((l) => l.product_id)), [listings]);

  // ── Modales ────────────────────────────────────────────────────────────────
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [publishTarget, setPublishTarget] = useState<ProductLight | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [descEn, setDescEn] = useState("");
  const [category, setCategory] = useState<UsCategory>("other");

  const openPublish = (product: ProductLight) => {
    setPublishTarget(product);
    setPriceInput("");
    setNameEn("");
    setDescEn("");
    setCategory(suggestUsCategory(product));
  };

  const publishMutation = useMutation({
    mutationFn: (input: CreateUsListingInput) => createUsListing(input),
    onSuccess: () => {
      toast.success("Producto publicado en la tienda US");
      setPublishTarget(null);
      void qc.invalidateQueries({ queryKey: queryKeys.usStore.all });
    },
    onError: (e) => toast.error(errMsg(e, "No se pudo publicar el producto")),
  });

  const submitPublish = () => {
    if (!publishTarget || publishMutation.isPending) return;
    const price = Number(priceInput);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Captura el precio en dólares (mayor a 0)");
      return;
    }
    publishMutation.mutate({
      product_id: publishTarget.id,
      price_usd: Math.round(price * 100) / 100,
      category,
      ...(nameEn.trim() ? { name_en: nameEn.trim() } : {}),
      ...(descEn.trim() ? { description_en: descEn.trim() } : {}),
    });
  };

  // ── Editar listing (precio / visible) — optimista con rollback ─────────────
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateUsListingInput }) =>
      updateUsListing(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: listingsKey });
      const prev = qc.getQueryData<UsListingListResponse>(listingsKey);
      qc.setQueryData<UsListingListResponse>(listingsKey, (old) =>
        old
          ? { ...old, data: old.data.map((l) => (l.id === id ? ({ ...l, ...patch } as UsListing) : l)) }
          : old
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(listingsKey, ctx.prev);
      toast.error(errMsg(e, "No se pudo guardar el cambio"));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: listingsKey });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => deleteUsListing(id),
    onSuccess: () => {
      toast.success("Producto quitado de la tienda US");
      void qc.invalidateQueries({ queryKey: queryKeys.usStore.all });
    },
    onError: (e) => toast.error(errMsg(e, "No se pudo quitar el producto")),
  });

  const removeListing = (listing: UsListing) => {
    if (removeMutation.isPending) return;
    const name = listing.name_en || listing.product_name;
    if (!window.confirm(`¿Quitar "${name}" de la tienda US?\nEl producto del POS no se toca.`)) return;
    removeMutation.mutate(listing.id);
  };

  const searchResults = (productsQuery.data?.data ?? []).slice(0, MAX_SEARCH_RESULTS);

  return (
    <div className="space-y-4">
      {/* (a) Publicar producto del POS */}
      <div style={cardStyle}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <PackagePlus size={15} color="#38BDF8" />
            <p className="text-[10px] font-black uppercase tracking-widest m-0" style={{ color: "var(--td-text-md)" }}>
              Publicar producto del POS
            </p>
          </div>
          <button
            onClick={() => setShowCustomModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest cursor-pointer shrink-0"
            style={{ background: "rgba(0,136,203,0.15)", border: "1px solid rgba(0,136,203,0.4)", color: "#38BDF8" }}
            title="Producto que solo existe en la tienda US (sin producto POS)"
          >
            <PackagePlus size={11} />
            Crear producto dummy
          </button>
        </div>
        <div className="relative">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--td-text-lo)" }} />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nombre o SKU… (mínimo 2 letras)"
            style={{ ...inputStyle, paddingLeft: 32 }}
          />
        </div>

        {search.length >= 2 && (
          <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {productsQuery.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={16} className="animate-spin" style={{ color: "var(--td-text-lo)" }} />
              </div>
            ) : productsQuery.isError ? (
              <p className="text-[11px] font-bold py-4 text-center m-0" style={{ color: "var(--td-text-lo)" }}>
                No se pudieron cargar los productos. Intenta de nuevo.
              </p>
            ) : searchResults.length === 0 ? (
              <p className="text-[11px] font-bold py-4 text-center m-0" style={{ color: "var(--td-text-lo)" }}>
                Sin resultados para “{search}”.
              </p>
            ) : (
              searchResults.map((p) => {
                const alreadyPublished = publishedIds.has(p.id);
                return (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shrink-0" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      {p.image ? (
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <Package size={13} style={{ color: "var(--td-text-lo)" }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate m-0" style={{ color: "var(--td-text-hi)" }}>{p.name}</p>
                      <p className="text-[9px] font-bold truncate m-0" style={{ color: "var(--td-text-lo)" }}>
                        {p.sku} · Stock: {p.stock_total}
                      </p>
                    </div>
                    {alreadyPublished ? (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg shrink-0" style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#34D399" }}>
                        Ya publicado
                      </span>
                    ) : (
                      <button
                        onClick={() => openPublish(p)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest cursor-pointer shrink-0 transition-all"
                        style={{ background: "rgba(0,136,203,0.15)", border: "1px solid rgba(0,136,203,0.4)", color: "#38BDF8" }}
                      >
                        <DollarSign size={11} />
                        Publicar a US
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* (b) Tabla de publicados */}
      <div style={cardStyle}>
        <div className="flex items-center gap-2 mb-3">
          <Package size={15} color="#34D399" />
          <p className="text-[10px] font-black uppercase tracking-widest m-0" style={{ color: "var(--td-text-md)" }}>
            Publicados en la tienda US · {listings.length}
          </p>
        </div>

        {listingsQuery.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin" style={{ color: "var(--td-text-lo)" }} />
          </div>
        ) : listingsQuery.isError ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <AlertTriangle size={24} color="#fbbf24" />
            <p className="text-xs font-bold text-center m-0" style={{ color: "var(--td-text-md)" }}>
              No se pudo cargar la tienda US.
            </p>
            <button
              onClick={() => void listingsQuery.refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest cursor-pointer"
              style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-text-md)" }}
            >
              <RefreshCw size={11} />
              Reintentar
            </button>
          </div>
        ) : listings.length === 0 ? (
          <p className="text-xs font-bold text-center py-10 m-0" style={{ color: "var(--td-text-lo)" }}>
            Aún no has publicado productos. Busca uno arriba y captura su precio en dólares.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                  <th className="text-left py-2 px-2">Producto</th>
                  <th className="text-left py-2 px-2">Nombre EN</th>
                  <th className="text-left py-2 px-2">Categoría</th>
                  <th className="text-right py-2 px-2">Precio USD</th>
                  <th className="text-left py-2 px-2">Stock</th>
                  <th className="text-center py-2 px-2">Visible</th>
                  <th className="text-center py-2 px-2">Agotado</th>
                  <th className="text-right py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.id} className="border-t" style={{ borderColor: "var(--td-divider)", opacity: listing.visible ? 1 : 0.55 }}>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shrink-0" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          {listing.image_url ? (
                            <img src={listing.image_url} alt={listing.product_name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <Package size={13} style={{ color: "var(--td-text-lo)" }} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black truncate m-0" style={{ color: "var(--td-text-hi)" }}>{listing.product_name}</p>
                          <p className="text-[9px] font-bold truncate m-0" style={{ color: "var(--td-text-lo)" }}>
                            {listing.is_custom ? (
                              <span className="inline-block px-1.5 rounded" style={{ background: "rgba(0,136,203,0.15)", border: "1px solid rgba(0,136,203,0.35)", color: "#38BDF8" }}>
                                Custom
                              </span>
                            ) : (
                              listing.sku
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2" style={{ color: "var(--td-text-md)" }}>
                      {listing.name_en || <span style={{ color: "var(--td-text-lo)" }}>— usa el del POS</span>}
                    </td>
                    <td className="py-2 px-2">
                      <select
                        value={listing.category}
                        onChange={(e) => updateMutation.mutate({ id: listing.id, patch: { category: e.target.value as UsCategory } })}
                        aria-label={`Categoría US de ${listing.product_name}`}
                        style={{ ...inputStyle, width: 96, padding: "6px 8px", cursor: "pointer" }}
                      >
                        {US_CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <PriceCell
                        listing={listing}
                        onCommit={(value) => updateMutation.mutate({ id: listing.id, patch: { price_usd: value } })}
                      />
                    </td>
                    <td className="py-2 px-2">
                      {listing.is_custom ? (
                        <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: "var(--td-text-lo)" }}>
                          — sin stock POS
                        </span>
                      ) : listing.in_stock ? (
                        <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider" style={{ color: "#34D399" }}>
                          <span style={{ width: 7, height: 7, borderRadius: 99, background: "#34D399", display: "inline-block" }} />
                          En stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider" style={{ color: "#FF8A80" }}>
                          <span style={{ width: 7, height: 7, borderRadius: 99, background: "#FF8A80", display: "inline-block" }} />
                          Sin stock — oculto en la tienda
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        onClick={() => updateMutation.mutate({ id: listing.id, patch: { visible: !listing.visible } })}
                        title={listing.visible ? "Ocultar de la tienda US" : "Mostrar en la tienda US"}
                        className="w-8 h-8 rounded-lg inline-flex items-center justify-center cursor-pointer transition-all"
                        style={listing.visible
                          ? { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.35)", color: "#34D399" }
                          : { background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.35)", color: "#FF8A80" }}
                      >
                        {listing.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    </td>
                    <td className="py-2 px-2 text-center">
                      {/* Agotado MANUAL: a diferencia de ocultar (visible), el
                          producto SE VE en la tienda con badge "Sold Out" y no
                          se puede comprar. Independiente del stock POS. */}
                      <button
                        onClick={() => updateMutation.mutate({ id: listing.id, patch: { sold_out: !listing.sold_out } })}
                        title={listing.sold_out
                          ? "Quitar Agotado (se puede volver a comprar)"
                          : "Marcar Agotado — se muestra \"Sold Out\" en la tienda y no se puede comprar"}
                        className="w-8 h-8 rounded-lg inline-flex items-center justify-center cursor-pointer transition-all"
                        style={listing.sold_out
                          ? { background: "rgba(224,34,26,0.15)", border: "1px solid rgba(224,34,26,0.45)", color: "#FF8A80" }
                          : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--td-text-lo)" }}
                      >
                        <Ban size={14} />
                      </button>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <button
                        onClick={() => removeListing(listing)}
                        title="Quitar de la tienda US"
                        className="w-8 h-8 rounded-lg inline-flex items-center justify-center cursor-pointer transition-all"
                        style={{ background: "rgba(224,34,26,0.10)", border: "1px solid rgba(224,34,26,0.30)", color: "#FF8A80" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de alta dummy (solo-US) */}
      {showCustomModal && <CustomListingModal onClose={() => setShowCustomModal(false)} />}

      {/* Modal de publicación */}
      {publishTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-md rounded-2xl p-5" style={{ background: "var(--td-panel-bg, #16161c)", border: "1px solid var(--td-panel-border, rgba(255,255,255,0.1))" }}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest m-0" style={{ color: "#38BDF8" }}>Publicar a US</p>
                <h3 className="text-sm font-black m-0 mt-1 truncate" style={{ color: "var(--td-text-hi)" }}>{publishTarget.name}</h3>
                <p className="text-[9px] font-bold m-0" style={{ color: "var(--td-text-lo)" }}>
                  {publishTarget.sku} · Stock: {publishTarget.stock_total}
                </p>
              </div>
              <button
                onClick={() => setPublishTarget(null)}
                className="w-7 h-7 rounded-lg inline-flex items-center justify-center cursor-pointer shrink-0"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--td-text-md)" }}
              >
                <X size={13} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-[9px] font-black uppercase tracking-widest block mb-1" style={{ color: "var(--td-text-lo)" }}>
                  Precio en dólares (obligatorio)
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitPublish(); }}
                  placeholder="25.00"
                  autoFocus
                  style={inputStyle}
                />
              </label>
              <label className="block">
                <span className="text-[9px] font-black uppercase tracking-widest block mb-1" style={{ color: "var(--td-text-lo)" }}>
                  Categoría US
                </span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as UsCategory)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  {US_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <span className="text-[9px] font-bold block mt-1" style={{ color: "var(--td-text-lo)" }}>
                  Define en qué página de la tienda US aparece (Figures / Manga / TCG).
                </span>
              </label>
              <label className="block">
                <span className="text-[9px] font-black uppercase tracking-widest block mb-1" style={{ color: "var(--td-text-lo)" }}>
                  Nombre en inglés (opcional)
                </span>
                <input
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="Se usa el nombre del producto si lo dejas vacío"
                  style={inputStyle}
                />
              </label>
              <label className="block">
                <span className="text-[9px] font-black uppercase tracking-widest block mb-1" style={{ color: "var(--td-text-lo)" }}>
                  Descripción en inglés (opcional)
                </span>
                <textarea
                  value={descEn}
                  onChange={(e) => setDescEn(e.target.value)}
                  placeholder="Se usa el nombre del producto si lo dejas vacío"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setPublishTarget(null)}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--td-text-md)" }}
              >
                Cancelar
              </button>
              <button
                onClick={submitPublish}
                disabled={publishMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #0369A1 0%, #0088CB 100%)", color: "#fff" }}
              >
                {publishMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <DollarSign size={12} />}
                Publicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Precio USD editable inline — guarda al blur/Enter solo si cambió y es válido;
 * Escape restaura el valor del server. El guardado optimista (con rollback)
 * vive en la mutación del padre.
 */
function PriceCell({ listing, onCommit }: { listing: UsListing; onCommit: (value: number) => void }) {
  const serverValue = Number(listing.price_usd) || 0;
  const [draft, setDraft] = useState(serverValue > 0 ? String(serverValue) : "");

  // Si el server cambia el precio (rollback / refetch), el draft se realinea.
  useEffect(() => {
    setDraft(serverValue > 0 ? String(serverValue) : "");
  }, [serverValue]);

  const commit = () => {
    const value = Number(draft);
    if (!Number.isFinite(value) || value <= 0) {
      setDraft(serverValue > 0 ? String(serverValue) : "");
      return;
    }
    const rounded = Math.round(value * 100) / 100;
    if (rounded === serverValue) return;
    onCommit(rounded);
  };

  return (
    <div className="inline-flex items-center gap-1 justify-end">
      <input
        type="number"
        min="0.01"
        step="0.01"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(serverValue > 0 ? String(serverValue) : "");
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label={`Precio USD de ${listing.product_name}`}
        style={{ ...inputStyle, width: 90, textAlign: "right", padding: "6px 8px" }}
      />
      <span className="text-[9px] font-black" style={{ color: "var(--td-text-lo)" }}>USD</span>
    </div>
  );
}
