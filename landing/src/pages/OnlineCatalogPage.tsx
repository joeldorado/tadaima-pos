import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, MessageCircle, Package, Search } from "lucide-react";
import { getPublicCatalog, storageUrl } from "@tadaima/api";
import type { CatalogProductItem } from "@tadaima/api";

type PublicCatalogData = {
  store: { id: number; name: string };
  catalog: { show_price: boolean; show_stock: boolean };
  data: CatalogProductItem[];
};

type OnlineCatalogEvent =
  | { name: "catalog_view"; catalogUrl: string; storeId: number; storeName: string; totalItems: number }
  | { name: "product_click"; catalogUrl: string; productId: number; productName: string }
  | { name: "whatsapp_click"; catalogUrl: string; productId: number; productName: string }
  | { name: "search_used"; catalogUrl: string; query: string }
  | { name: "filter_used"; catalogUrl: string; categoryId: string };

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0);

export function OnlineCatalogPage() {
  const { catalogUrl } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [payload, setPayload] = useState<PublicCatalogData | null>(null);

  const trackEvent = (event: OnlineCatalogEvent) => {
    const payloadWithTs = { ...event, ts: new Date().toISOString() };

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tadaima:catalog-event", { detail: payloadWithTs }));
      try {
        const key = "tadaima_catalog_events";
        const current = JSON.parse(sessionStorage.getItem(key) ?? "[]") as Array<Record<string, unknown>>;
        current.push(payloadWithTs);
        sessionStorage.setItem(key, JSON.stringify(current.slice(-200)));
      } catch {
        // non-blocking
      }
      if (import.meta.env.DEV) {
        // Useful while MVP has no analytics provider connected.
        console.info("[catalog-event]", payloadWithTs);
      }
    }
  };

  useEffect(() => {
    if (!catalogUrl) return;

    setLoading(true);
    setError(null);
    getPublicCatalog(catalogUrl)
      .then(setPayload)
      .catch(() => setError("No pudimos cargar este catalogo. Verifica el enlace."))
      .finally(() => setLoading(false));
  }, [catalogUrl]);

  useEffect(() => {
    if (!payload || !catalogUrl) return;
    trackEvent({
      name: "catalog_view",
      catalogUrl,
      storeId: payload.store.id,
      storeName: payload.store.name,
      totalItems: payload.data.length,
    });
  }, [payload, catalogUrl]);

  const filtered = useMemo(() => {
    if (!payload) return [];
    const q = search.trim().toLowerCase();
    return payload.data.filter((p) => {
      const categoryOk =
        selectedCategory === "all" ||
        String(p.category?.id ?? "") === selectedCategory;
      if (!categoryOk) return false;
      if (!q) return true;
      const name = p.name?.toLowerCase() ?? "";
      const desc = p.description?.toLowerCase() ?? "";
      const cat = p.category?.name?.toLowerCase() ?? "";
      return name.includes(q) || desc.includes(q) || cat.includes(q);
    });
  }, [payload, search, selectedCategory]);

  const categories = useMemo(() => {
    if (!payload) return [];
    const map = new Map<number, string>();
    payload.data.forEach((item) => {
      if (item.category?.id && item.category?.name) {
        map.set(item.category.id, item.category.name);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [payload]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f0f11", color: "white" }}>
        <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.2em] text-white/70">
          <Loader2 size={18} className="animate-spin" />
          Cargando catalogo
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0f0f11", color: "white" }}>
        <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-white/70">Catalogo no disponible</p>
          <p className="text-sm text-white/50 mt-3">{error ?? "No se encontro informacion para este enlace."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0f0f11", color: "white" }}>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <header className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-300/80">Tienda Online</p>
          <h1 className="text-2xl font-black mt-1">{payload.store.name}</h1>
          <p className="text-xs text-white/45 mt-1">Productos disponibles por tienda</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-2 mt-4">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(e) => {
                const next = e.target.value;
                setSearch(next);
                if (catalogUrl && next.trim().length >= 2) {
                  trackEvent({ name: "search_used", catalogUrl, query: next.trim() });
                }
              }}
              placeholder="Buscar producto..."
              className="w-full rounded-2xl border border-white/10 bg-white/[0.03] pl-11 pr-4 py-3 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:border-white/20"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => {
              const next = e.target.value;
              setSelectedCategory(next);
              if (catalogUrl) {
                trackEvent({ name: "filter_used", catalogUrl, categoryId: next });
              }
            }}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-white outline-none focus:border-white/20"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat.id} value={String(cat.id)}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-white/60">Sin resultados</p>
            <p className="text-xs text-white/40 mt-2">No hay productos para tu busqueda.</p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((item) => {
              const img = item.images?.[0]?.path ? storageUrl(item.images[0].path) : "";
              const stock = item.stock ?? 0;
              const agotado = payload.catalog.show_stock && stock <= 0;
              const waText = encodeURIComponent(
                `Hola, me interesa este producto de ${payload.store.name}:\n` +
                  `• ${item.name}\n` +
                  `${payload.catalog.show_price && typeof item.price === "number" ? `• Precio: ${fmt(item.price)}\n` : ""}` +
                  `${payload.catalog.show_stock ? `• Estado: ${agotado ? "Agotado" : "Disponible"}\n` : ""}` +
                  `${catalogUrl ? `• Catálogo: /catalogo/${catalogUrl}` : ""}`
              );
              return (
                <article
                  key={item.id}
                  onClick={() => {
                    if (!catalogUrl) return;
                    trackEvent({
                      name: "product_click",
                      catalogUrl,
                      productId: item.id,
                      productName: item.name,
                    });
                  }}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-3 cursor-pointer"
                >
                  <div className="aspect-square rounded-2xl bg-black/50 border border-white/10 overflow-hidden flex items-center justify-center">
                    {img ? (
                      <img src={img} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <Package size={24} className="text-white/30" />
                    )}
                  </div>
                  <p className="text-sm font-black mt-3 leading-tight">{item.name}</p>
                  {item.category?.name && <p className="text-[10px] text-white/40 mt-1 uppercase tracking-widest">{item.category.name}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      {payload.catalog.show_price && typeof item.price === "number" ? (
                        <p className="text-base font-black text-amber-300">{fmt(item.price)}</p>
                      ) : (
                        <p className="text-xs font-bold text-white/35">Precio por mensaje</p>
                      )}
                    </div>
                    {payload.catalog.show_stock && (
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${agotado ? "text-red-300 border-red-400/30 bg-red-500/10" : "text-emerald-300 border-emerald-400/30 bg-emerald-500/10"}`}>
                        {agotado ? "Agotado" : "Disponible"}
                      </span>
                    )}
                  </div>
                  <a
                    href={`https://wa.me/?text=${waText}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      if (!catalogUrl) return;
                      trackEvent({
                        name: "whatsapp_click",
                        catalogUrl,
                        productId: item.id,
                        productName: item.name,
                      });
                    }}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/15 transition-colors"
                  >
                    <MessageCircle size={14} />
                    Pedir por WhatsApp
                  </a>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
