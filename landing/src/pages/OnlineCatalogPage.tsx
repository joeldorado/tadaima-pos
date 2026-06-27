import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2, Search, ShoppingBag } from "lucide-react";
import { getGlobalCatalog } from "@tadaima/api";
import type { GlobalCatalogItem, GlobalCatalogResponse } from "@tadaima/api";
import { useCart } from "@/hooks/useCart";
import { ProductCard } from "@/components/catalog/ProductCard";
import { CategoryRow } from "@/components/catalog/CategoryRow";
import { CartDrawer } from "@/components/catalog/CartDrawer";

const CART_KEY = "global";
const DISPLAY = "'Space Grotesk', system-ui, sans-serif";
const BODY = "'Inter', system-ui, -apple-system, sans-serif";

type TypeFilter = "all" | "product" | "manga";

interface Section {
  key: string;
  name: string;
  items: GlobalCatalogItem[];
}

export function OnlineCatalogPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [payload, setPayload] = useState<GlobalCatalogResponse | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const cart = useCart(CART_KEY);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getGlobalCatalog({ per_page: 100 })
      .then(setPayload)
      .catch(() => setError("No pudimos cargar el catálogo. Intenta más tarde."))
      .finally(() => setLoading(false));
  }, []);

  const data = payload?.data ?? [];

  const hasManga = useMemo(() => data.some((p) => p.product_type === "manga"), [data]);
  const hasProduct = useMemo(() => data.some((p) => p.product_type !== "manga"), [data]);

  const byType = useMemo(
    () => data.filter((p) => typeFilter === "all" || (typeFilter === "manga" ? p.product_type === "manga" : p.product_type !== "manga")),
    [data, typeFilter]
  );

  const sections = useMemo<Section[]>(() => {
    const map = new Map<string, Section>();
    byType.forEach((p) => {
      const key = p.category ? `c${p.category.id}` : "otros";
      const name = p.category?.name ?? "Otros";
      const g = map.get(key);
      if (g) g.items.push(p);
      else map.set(key, { key, name, items: [p] });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [byType]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return byType.filter((p) => {
      const name = p.name?.toLowerCase() ?? "";
      const desc = p.description?.toLowerCase() ?? "";
      const cat = p.category?.name?.toLowerCase() ?? "";
      return name.includes(q) || desc.includes(q) || cat.includes(q);
    });
  }, [byType, search]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: "var(--td-page-bg)", color: "white", fontFamily: BODY }}>
        <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: "var(--td-text-md)" }}>
          <Loader2 size={18} className="animate-spin" />
          Cargando catálogo
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4" style={{ background: "var(--td-page-bg)", color: "white", fontFamily: BODY }}>
        <div className="max-w-md w-full rounded-3xl p-6 text-center" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
          <p className="text-sm font-black uppercase tracking-[0.2em]" style={{ color: "var(--td-text-md)" }}>Catálogo no disponible</p>
          <p className="text-sm mt-3" style={{ color: "var(--td-text-lo)" }}>{error ?? "Intenta de nuevo en un momento."}</p>
        </div>
      </div>
    );
  }

  const catalog = payload.catalog;
  const cartEnabled = catalog.cart_enabled;
  const showSearch = catalog.show_search;

  const handleAdd = (item: GlobalCatalogItem) => {
    cart.add({
      productId: item.id,
      name: item.name,
      price: item.price,
      image: item.images?.[0]?.path ?? undefined,
      stores: item.stores,
    });
    setCartOpen(true);
  };

  const cardProps = {
    showPrice: catalog.show_price,
    showStock: catalog.show_stock,
    showDescription: catalog.show_description,
    cartEnabled,
    onAdd: handleAdd,
  };

  const tabs: { key: TypeFilter; label: string }[] = [
    { key: "all", label: "Todo" },
    ...(hasProduct ? [{ key: "product" as const, label: "Productos" }] : []),
    ...(hasManga ? [{ key: "manga" as const, label: "Mangas" }] : []),
  ];

  const searching = search.trim().length > 0;
  const gridItems = searching
    ? searchResults
    : activeCategory
      ? byType.filter((p) => (p.category?.name ?? "Otros") === activeCategory)
      : [];
  const showGrid = searching || activeCategory !== null;

  return (
    <div className="min-h-dvh pb-28" style={{ background: "var(--td-page-bg)", color: "white", fontFamily: BODY }}>
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header con logo */}
        <header className="flex items-center gap-3">
          <div
            className="shrink-0"
            style={{ background: "#fff", borderRadius: 14, padding: "7px 11px", border: "1px solid rgba(204,34,0,0.15)", boxShadow: "0 0 20px rgba(204,34,0,0.35)" }}
          >
            <img src="/tadaima-logo.jpeg" alt="Tadaima" style={{ height: 32, display: "block", borderRadius: 4 }} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: "#FF8A80" }}>Tienda en Línea</p>
            <h1 className="text-xl font-black leading-tight" style={{ fontFamily: DISPLAY, color: "var(--td-text-hi)" }}>Catálogo</h1>
          </div>
        </header>

        {/* Buscador */}
        {showSearch && (
          <div className="relative mt-5">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--td-text-ghost)" }} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setActiveCategory(null); }}
              placeholder="Buscar producto, manga, categoría..."
              className="w-full rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold outline-none transition-colors"
              style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-input-text)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
            />
          </div>
        )}

        {/* Tabs por tipo */}
        {!searching && tabs.length > 1 && (
          <div className="flex items-center gap-2 mt-4">
            {tabs.map((t) => {
              const active = typeFilter === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { setTypeFilter(t.key); setActiveCategory(null); }}
                  className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest cursor-pointer transition-all"
                  style={active
                    ? { background: "var(--td-red-g)", border: "1px solid var(--td-red-brd)", color: "#fff", boxShadow: "0 0 18px rgba(224,34,26,0.3)" }
                    : { background: "var(--td-surface-muted)", border: "1px solid var(--td-divider)", color: "var(--td-text-md)" }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Contenido */}
        {byType.length === 0 ? (
          <div className="mt-8 rounded-3xl p-8 text-center" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
            <ShoppingBag size={28} className="mx-auto mb-3" style={{ color: "var(--td-text-ghost)" }} />
            <p className="text-sm font-black uppercase tracking-[0.2em]" style={{ color: "var(--td-text-md)" }}>Sin productos</p>
          </div>
        ) : showGrid ? (
          <div className="mt-5">
            <button
              onClick={() => { setActiveCategory(null); setSearch(""); }}
              className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest mb-4 cursor-pointer"
              style={{ color: "var(--td-text-md)" }}
            >
              <ChevronLeft size={14} /> Volver
            </button>
            <h2 className="text-sm font-black uppercase tracking-widest mb-3" style={{ fontFamily: DISPLAY, color: "var(--td-text-hi)" }}>
              {searching ? `Resultados (${gridItems.length})` : activeCategory}
            </h2>
            {gridItems.length === 0 ? (
              <p className="text-xs mt-2" style={{ color: "var(--td-text-lo)" }}>No hay productos para tu búsqueda.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {gridItems.map((item) => (
                  <ProductCard key={item.id} item={item} {...cardProps} />
                ))}
              </div>
            )}
          </div>
        ) : (
          sections.map((section) => (
            <CategoryRow
              key={section.key}
              title={section.name}
              items={section.items}
              {...cardProps}
              onSeeAll={() => setActiveCategory(section.name)}
            />
          ))
        )}
      </div>

      {/* Carrito flotante + drawer */}
      {cartEnabled && cart.count > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-2xl px-5 py-3.5 text-xs font-black uppercase tracking-widest cursor-pointer transition-colors"
          style={{ background: "var(--td-red-g)", border: "1px solid var(--td-red-brd)", color: "#fff", boxShadow: "0 8px 28px rgba(224,34,26,0.4)", fontFamily: DISPLAY }}
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
