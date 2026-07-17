import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ShoppingBag, X } from "lucide-react";
import { getGlobalCatalog } from "@tadaima/api";
import type { GlobalCatalogItem, GlobalCatalogResponse } from "@tadaima/api";
import { useCart } from "@/hooks/useCart";
import { ProductCard } from "@/components/catalog/ProductCard";
import { CartDrawer } from "@/components/catalog/CartDrawer";
import { ShaderBackground } from "@/components/catalog/ShaderBackground";

const CART_KEY = "global";
const DISPLAY = "'Space Grotesk', system-ui, sans-serif";
const BODY = "'Inter', system-ui, -apple-system, sans-serif";
const PAGE_SIZE = 100;

type TypeFilter = "all" | "product" | "manga";
type SortMode = "new" | "price_asc" | "price_desc" | "name";

/** Animaciones locales de la tienda (fade-up de cards + bump del carrito). */
const PAGE_CSS = `
@keyframes tdFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes tdBump { 0% { transform: scale(1); } 40% { transform: scale(1.12); } 100% { transform: scale(1); } }
@keyframes tdShimmer { 0% { opacity: 0.55; } 50% { opacity: 1; } 100% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) {
  .td-fadeup, .td-bump, .td-shimmer { animation: none !important; }
}
.td-chiprow { scrollbar-width: none; }
.td-chiprow::-webkit-scrollbar { display: none; }
`;

/** Skeleton de card (misma silueta que ProductCard) para la carga inicial. */
function CardSkeleton() {
  return (
    <div
      className="rounded-3xl p-2.5 td-shimmer"
      style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", animation: "tdShimmer 1.4s ease-in-out infinite" }}
    >
      <div className="rounded-2xl" style={{ aspectRatio: "1 / 1", background: "var(--td-surface-strong)" }} />
      <div className="mt-2.5 h-3.5 rounded-md" style={{ background: "var(--td-surface-muted)", width: "85%" }} />
      <div className="mt-2 h-4 rounded-md" style={{ background: "var(--td-surface-muted)", width: "45%" }} />
      <div className="mt-3 h-10 rounded-xl" style={{ background: "var(--td-surface-muted)" }} />
    </div>
  );
}

export function OnlineCatalogPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // searchInput = lo tecleado; search = aplicado con debounce (250ms).
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  // v2.2: la categoría es un FILTRO arriba (chip), ya no una vista aparte.
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [payload, setPayload] = useState<GlobalCatalogResponse | null>(null);
  const [extraItems, setExtraItems] = useState<GlobalCatalogItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("new");
  const [promoOnly, setPromoOnly] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const cart = useCart(CART_KEY);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getGlobalCatalog({ per_page: PAGE_SIZE })
      .then(setPayload)
      .catch(() => setError("No pudimos cargar el catálogo. Intenta más tarde."))
      .finally(() => setLoading(false));
  }, []);

  // Debounce del buscador: filtra 250ms después de dejar de teclear.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // El backend ya manda lo más NUEVO primero (id desc) — el orden natural
  // de `data` ES "Más nuevos".
  const data = useMemo(
    () => [...(payload?.data ?? []), ...extraItems],
    [payload, extraItems],
  );

  const productCount = useMemo(() => data.filter((p) => p.product_type !== "manga").length, [data]);
  const mangaCount = useMemo(() => data.filter((p) => p.product_type === "manga").length, [data]);

  const byType = useMemo(
    () => data.filter((p) => typeFilter === "all" || (typeFilter === "manga" ? p.product_type === "manga" : p.product_type !== "manga")),
    [data, typeFilter]
  );

  // Items del CONTEXTO actual (tipo + búsqueda + Con promo) SIN el filtro de
  // categoría — es la base de los chips: un chip con 0 aquí no se pinta.
  const contextItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = byType;
    if (q) {
      list = list.filter((p) => {
        const name = p.name?.toLowerCase() ?? "";
        const desc = p.description?.toLowerCase() ?? "";
        const cat = p.category?.name?.toLowerCase() ?? "";
        return name.includes(q) || desc.includes(q) || cat.includes(q);
      });
    }
    if (promoOnly) list = list.filter((p) => (p.active_promotions?.length ?? 0) > 0);
    return list;
  }, [byType, search, promoOnly]);

  // Chips de categoría: "Todas" + una por categoría con contador del CONTEXTO
  // actual (tipo + búsqueda + Con promo) — sin productos = sin chip (v2.3).
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    contextItems.forEach((p) => {
      const name = p.category?.name ?? "Otros";
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [contextItems]);

  // Si la categoría activa se quedó sin productos en este contexto, soltarla.
  useEffect(() => {
    if (categoryFilter && !categories.some((c) => c.name === categoryFilter)) {
      setCategoryFilter(null);
    }
  }, [categories, categoryFilter]);

  const searching = search.trim().length > 0;

  const gridItems = useMemo(() => {
    const list = categoryFilter
      ? contextItems.filter((p) => (p.category?.name ?? "Otros") === categoryFilter)
      : contextItems;
    if (sortMode === "new") return list; // orden natural = más nuevos primero
    const sorted = [...list];
    if (sortMode === "name") sorted.sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (sortMode === "price_asc") sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    if (sortMode === "price_desc") sorted.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    return sorted;
  }, [contextItems, categoryFilter, sortMode]);

  const hasAnyPromo = useMemo(() => data.some((p) => (p.active_promotions?.length ?? 0) > 0), [data]);

  const catalog = payload?.catalog;
  const cartEnabled = !!catalog?.cart_enabled;
  const showSearch = !!catalog?.show_search;

  const handleAdd = (item: GlobalCatalogItem) => {
    cart.add({
      productId: item.id,
      name: item.name,
      price: item.price,
      image: item.images?.[0]?.url ?? item.images?.[0]?.path ?? undefined,
      stores: item.stores,
    });
    // v2.0: NO abrir el drawer en cada add (interrumpía el browsing) —
    // toast breve + bump del botón flotante; el drawer se abre desde ahí.
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text: item.name });
    toastTimer.current = window.setTimeout(() => setToast(null), 1600);
  };

  const loadMore = () => {
    if (!payload || loadingMore) return;
    setLoadingMore(true);
    getGlobalCatalog({ per_page: PAGE_SIZE, page: pagesLoaded + 1 })
      .then((next) => {
        setExtraItems((prev) => [...prev, ...next.data]);
        setPagesLoaded((p) => p + 1);
      })
      .catch(() => { /* silencioso: el botón sigue disponible para reintentar */ })
      .finally(() => setLoadingMore(false));
  };

  const hasMorePages = !!payload && pagesLoaded < payload.pagination.last_page;

  const cardProps = {
    showPrice: !!catalog?.show_price,
    showStock: !!catalog?.show_stock,
    showDescription: !!catalog?.show_description,
    cartEnabled,
    onAdd: handleAdd,
  };

  const tabs: { key: TypeFilter; label: string; count: number }[] = [
    { key: "all", label: "Todo", count: data.length },
    ...(productCount > 0 ? [{ key: "product" as const, label: "Productos", count: productCount }] : []),
    ...(mangaCount > 0 ? [{ key: "manga" as const, label: "Mangas", count: mangaCount }] : []),
  ];

  const sortChips: { key: SortMode; label: string }[] = [
    { key: "new", label: "Más nuevos" },
    { key: "price_asc", label: "Precio ↑" },
    { key: "price_desc", label: "Precio ↓" },
    { key: "name", label: "A-Z" },
  ];

  const chipStyle = (active: boolean, accent?: "green"): React.CSSProperties =>
    active
      ? accent === "green"
        ? { background: "rgba(16,185,129,0.16)", border: "1px solid rgba(16,185,129,0.4)", color: "#34D399" }
        : { background: "var(--td-red-dim)", border: "1px solid var(--td-red-brd)", color: "#FF8A80" }
      : { background: "var(--td-surface-muted)", border: "1px solid var(--td-divider)", color: "var(--td-text-lo)" };

  // La tienda es OSCURA por diseño (identidad glass/Netflix): fijar el scope
  // de tokens a dark para que el tema claro del POS no la rompa.
  const rootProps = {
    "data-theme": "dark",
    className: "min-h-dvh pb-28",
    style: { background: "var(--td-page-bg)", color: "var(--td-text-hi)", fontFamily: BODY } as React.CSSProperties,
  };

  if (loading) {
    return (
      <div {...rootProps}>
        <style>{PAGE_CSS}</style>
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="h-14 w-60 rounded-2xl td-shimmer" style={{ background: "var(--td-card-bg)", animation: "tdShimmer 1.4s ease-in-out infinite" }} />
          <div className="h-12 mt-5 rounded-2xl td-shimmer" style={{ background: "var(--td-card-bg)", animation: "tdShimmer 1.4s ease-in-out infinite" }} />
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <div key={i} className={i >= 8 ? "hidden lg:block" : i >= 6 ? "hidden md:block" : i >= 4 ? "hidden sm:block" : ""}>
                <CardSkeleton />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !payload || !catalog) {
    return (
      <div {...rootProps}>
        <div className="min-h-dvh flex items-center justify-center px-4">
          <div className="max-w-md w-full rounded-3xl p-6 text-center" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
            <p className="text-sm font-black uppercase tracking-[0.2em]" style={{ color: "var(--td-text-md)" }}>Catálogo no disponible</p>
            <p className="text-sm mt-3" style={{ color: "var(--td-text-lo)" }}>{error ?? "Intenta de nuevo en un momento."}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div {...rootProps}>
      <style>{PAGE_CSS}</style>

      {/* Fondo animado (v2.2): nebulosa WebGL detrás de todo el contenido */}
      <ShaderBackground />

      {/* ── Header + buscador + FILTROS GLOBALES sticky (v2.2) ── */}
      <div
        className="sticky top-0 z-30"
        style={{ background: "rgba(11,8,13,0.82)", backdropFilter: "blur(18px) saturate(150%)", WebkitBackdropFilter: "blur(18px) saturate(150%)", borderBottom: "1px solid var(--td-panel-border)" }}
      >
        <div className="max-w-5xl mx-auto px-4 py-3.5">
          {/* Fila 1: logo + título; el buscador baja a su PROPIA fila en móvil
              (v2.3 — estaban amontonados) y se queda inline en pantalla ancha. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div
              className="shrink-0"
              style={{ background: "#fff", borderRadius: 14, padding: "6px 11px", border: "1px solid rgba(204,34,0,0.18)", boxShadow: "0 0 26px rgba(204,34,0,0.45), 0 4px 14px rgba(0,0,0,0.35)" }}
            >
              <img src="/tadaima-logo.jpeg" alt="Tadaima" style={{ height: 42, display: "block", borderRadius: 6 }} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: "#FF8A80" }}>Tienda en Línea</p>
              <h1 className="text-xl font-black leading-tight" style={{ fontFamily: DISPLAY, color: "var(--td-text-hi)", letterSpacing: "-0.01em" }}>Catálogo</h1>
            </div>

            {showSearch && (
              <div className="relative basis-full md:basis-auto md:flex-1 md:ml-3">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--td-text-ghost)" }} />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar producto, manga, categoría..."
                  className="w-full rounded-2xl pl-10 pr-9 py-2.5 text-sm font-bold outline-none transition-colors"
                  style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-input-text)" }}
                />
                {searchInput && (
                  <button
                    aria-label="Limpiar búsqueda"
                    onClick={() => { setSearchInput(""); setSearch(""); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg cursor-pointer hover:brightness-150 transition"
                    style={{ color: "var(--td-text-lo)" }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Fila 2: tabs de tipo + separador + categorías, UNA fila scrolleable
              (v2.3 — antes eran 2 filas y se sentía apretado). Los chips de
              categoría con 0 productos en el contexto actual NO se pintan. */}
          <div className="td-chiprow flex items-center gap-2 mt-3.5 overflow-x-auto -mx-4 px-4">
            {tabs.length > 1 && tabs.map((t) => {
              const active = typeFilter === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { setTypeFilter(t.key); setCategoryFilter(null); }}
                  className="shrink-0 px-3.5 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest cursor-pointer transition-all"
                  style={active
                    ? { background: "var(--td-red-g)", border: "1px solid var(--td-red-brd)", color: "#fff", boxShadow: "0 0 18px rgba(224,34,26,0.3)" }
                    : { background: "var(--td-surface-muted)", border: "1px solid var(--td-divider)", color: "var(--td-text-md)" }}
                >
                  {t.label} <span style={{ opacity: 0.65 }}>· {t.count}</span>
                </button>
              );
            })}

            {tabs.length > 1 && categories.length > 1 && (
              <span aria-hidden className="shrink-0 w-px h-5 mx-1" style={{ background: "var(--td-divider)" }} />
            )}

            {categories.length > 1 && (
              <>
                <button
                  onClick={() => setCategoryFilter(null)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all"
                  style={chipStyle(categoryFilter === null)}
                >
                  Todas
                </button>
                {categories.map((c) => {
                  const active = categoryFilter === c.name;
                  return (
                    <button
                      key={c.name}
                      onClick={() => setCategoryFilter(active ? null : c.name)}
                      className="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all"
                      style={chipStyle(active)}
                    >
                      {c.name} <span style={{ opacity: 0.6 }}>· {c.count}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>

          {/* Fila 3: orden + Con promo */}
          <div className="td-chiprow flex items-center gap-1.5 mt-2.5 overflow-x-auto -mx-4 px-4 pb-0.5">
            {sortChips.map((c) => {
              const active = sortMode === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setSortMode(c.key)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all"
                  style={chipStyle(active)}
                >
                  {c.label}
                </button>
              );
            })}
            {hasAnyPromo && (
              <button
                onClick={() => setPromoOnly((v) => !v)}
                className="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all"
                style={chipStyle(promoOnly, "green")}
              >
                Con promo
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 pt-4">
        {/* Encabezado del grid: qué estoy viendo */}
        <h2 className="text-sm font-black uppercase tracking-widest mb-3" style={{ fontFamily: DISPLAY, color: "var(--td-text-hi)" }}>
          {searching
            ? `Resultados · ${gridItems.length}`
            : categoryFilter
              ? `${categoryFilter} · ${gridItems.length}`
              : `Lo más nuevo · ${gridItems.length}`}
        </h2>

        {gridItems.length === 0 ? (
          <div className="mt-4 rounded-3xl p-8 text-center" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
            <ShoppingBag size={28} className="mx-auto mb-3" style={{ color: "var(--td-text-ghost)" }} />
            <p className="text-sm font-black uppercase tracking-[0.2em]" style={{ color: "var(--td-text-md)" }}>
              {promoOnly ? "Sin productos con promo aquí" : searching ? "Nada para tu búsqueda" : "Sin productos"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {gridItems.map((item, i) => (
              <div
                key={item.id}
                className="td-fadeup"
                style={{ animation: "tdFadeUp 0.35s ease-out both", animationDelay: `${Math.min(i, 12) * 30}ms` }}
              >
                <ProductCard item={item} {...cardProps} />
              </div>
            ))}
          </div>
        )}

        {/* Cargar más (v2.0): antes había tope silencioso de 100 productos */}
        {hasMorePages && gridItems.length > 0 && (
          <div className="mt-8 text-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest cursor-pointer transition-all hover:brightness-125 disabled:opacity-50"
              style={{ background: "var(--td-surface-muted)", border: "1px solid var(--td-divider)", color: "var(--td-text-md)" }}
            >
              {loadingMore ? "Cargando…" : `Cargar más productos (${payload.pagination.total - data.length} restantes)`}
            </button>
          </div>
        )}
      </div>

      {/* Toast "agregado" (v2.0) */}
      {toast && (
        <div
          key={toast.id}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 td-fadeup"
          style={{ animation: "tdFadeUp 0.25s ease-out both" }}
        >
          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold"
            style={{ background: "var(--td-popup-bg)", border: "1px solid rgba(16,185,129,0.4)", color: "var(--td-text-hi)", boxShadow: "0 10px 30px rgba(0,0,0,0.45)" }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#34D399" }} />
            Agregado · <span className="font-black" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toast.text}</span>
          </div>
        </div>
      )}

      {/* Carrito flotante + drawer */}
      {cartEnabled && cart.count > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          key={`cart-${cart.count}`}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-2xl px-5 py-3.5 text-xs font-black uppercase tracking-widest cursor-pointer transition-colors td-bump"
          style={{ background: "var(--td-red-g)", border: "1px solid var(--td-red-brd)", color: "#fff", boxShadow: "0 8px 28px rgba(224,34,26,0.4)", fontFamily: DISPLAY, animation: "tdBump 0.3s ease-out" }}
        >
          <ShoppingBag size={16} />
          Ver pedido
          <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black" style={{ background: "#fff", color: "var(--td-red)" }}>
            {cart.count}
          </span>
        </button>
      )}

      {cartEnabled && (
        <CartDrawer
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          items={cart.items}
          showPrice={catalog.show_price}
          onSetQty={cart.setQty}
          onSetStore={cart.setStore}
          onRemove={cart.remove}
          onClear={cart.clear}
        />
      )}
    </div>
  );
}
