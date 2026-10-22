import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Search, Package, BookOpen, X, ChevronDown, ChevronUp, ArrowUp, Trash2, Check } from "lucide-react";
import { getTopProductsReport, getCategories, type TopProductsReportItem } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { useScreenRefresh } from "@/hooks/useScreenRefresh";
import { getTodayLocal } from "@/lib/date";

// Día de negocio (Tijuana), no UTC: después de las 5 pm la fecha UTC ya es mañana.
const today        = getTodayLocal();
const firstOfMonth = `${today.slice(0, 7)}-01`;

const fmtMXN     = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fmtCompact = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0, notation: "compact" });

function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Clave de producto (agrupa todos los precios/costos del mismo producto)
function productKey(item: TopProductsReportItem) {
  return `${item.type}:${item.id}`;
}
// Clave única de renglón (producto + precio + costo)
function rowKey(item: TopProductsReportItem) {
  return `${item.type}:${item.id}:${item.unit_price}:${item.unit_cost ?? 0}`;
}

type ItemType = "all" | "product" | "manga";
type SortCol = "name" | "unit_price" | "total_quantity" | "total_revenue" | "utilidad" | "unit_cost";
type SortDir = "asc" | "desc";

export function EstadisticaPage() {
  const [from, setFrom]             = useState(firstOfMonth);
  const [to, setTo]                 = useState(today);
  const [search, setSearch]         = useState("");
  const [itemType, setItemType]     = useState<ItemType>("all");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [sortCol, setSortCol]       = useState<SortCol>("total_revenue");
  const [sortDir, setSortDir]       = useState<SortDir>("desc");
  // Set de rowKeys apagados (excluidos del resumen)
  const [excluded, setExcluded]     = useState<Set<string>>(new Set());
  // Set de rowKeys ocultos (quitados de la tabla)
  const [hidden, setHidden]         = useState<Set<string>>(new Set());
  // Set de productKeys fijados desde el buscador
  const [pinned, setPinned]         = useState<Set<string>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showTop, setShowTop]       = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounced(search);

  // Scroll listener — el scroll vive en el <main> del Layout, no en este div
  useEffect(() => {
    const el = mainRef.current?.closest("main") ?? mainRef.current;
    if (!el) return;
    const onScroll = () => setShowTop(el.scrollTop > 300);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const handleSort = (col: SortCol) => {
    if (col === sortCol) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortCol(col);
      setSortDir(col === "name" ? "asc" : "desc");
    }
  };

  const params = useMemo(() => ({
    from,
    to,
    limit: 500,
    item_type: itemType,
    sort_by: sortCol,
    sort_dir: sortDir,
    ...(categoryId ? { category_id: categoryId } : {}),
  }), [from, to, itemType, categoryId, sortCol, sortDir]);

  const query = useQuery({
    queryKey: queryKeys.reports.topProducts(params),
    queryFn: () => getTopProductsReport(params),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", { active: true }],
    queryFn: () => getCategories({ active: true }),
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });

  useScreenRefresh(() => { void query.refetch(); });

  // Cierra dropdown al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        searchRef.current && !searchRef.current.contains(e.target as Node)
      ) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Al cambiar filtros de datos, reinicia apagados y ocultos (no pinned — el usuario los eligió)
  useEffect(() => { setExcluded(new Set()); setHidden(new Set()); }, [from, to, itemType, categoryId]);

  const allItems = query.data?.data ?? [];

  // Sugerencias del dropdown — deduplicadas por producto, filtradas por texto
  const suggestions = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const seen = new Set<string>();
    const source = q
      ? allItems.filter((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
      : allItems;
    return source.filter((i) => {
      const k = productKey(i);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 12);
  }, [allItems, debouncedSearch]);

  // Renglones visibles: si hay pinned → solo esos; si no → todos; siempre sin hidden
  const displayItems = useMemo(() => {
    const base = pinned.size > 0
      ? allItems.filter((i) => pinned.has(productKey(i)))
      : allItems;
    return base.filter((i) => !hidden.has(rowKey(i)));
  }, [allItems, pinned, hidden]);

  // Solo los visibles y no-apagados alimentan las tarjetas
  const activeItems = useMemo(
    () => displayItems.filter((i) => !excluded.has(rowKey(i))),
    [displayItems, excluded],
  );

  const toggleRow = (item: TopProductsReportItem) => {
    const k = rowKey(item);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const hideRow = (item: TopProductsReportItem) => {
    const k = rowKey(item);
    setHidden((prev) => new Set([...prev, k]));
    setExcluded((prev) => { const next = new Set(prev); next.delete(k); return next; });
  };

  const togglePinned = (item: TopProductsReportItem) => {
    const k = productKey(item);
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const clearExcluded = () => setExcluded(new Set());
  const clearHidden   = () => setHidden(new Set());
  const clearPinned   = () => setPinned(new Set());

  const totalIngresos = activeItems.reduce((a, i) => a + i.total_revenue, 0);
  const totalCosto    = activeItems.reduce((a, i) => a + (i.unit_cost ?? 0) * i.total_quantity, 0);
  const totalUtilidad = totalIngresos - totalCosto;
  const margen        = totalIngresos > 0 ? (totalUtilidad / totalIngresos) * 100 : 0;

  return (
    <div ref={mainRef} className="flex flex-col gap-4 p-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0"
          style={{ background: "var(--td-red)", boxShadow: "0 4px 16px rgba(220,38,38,0.35)" }}
        >
          <TrendingUp size={17} strokeWidth={2.2} color="#fff" />
        </div>
        <div>
          <h1 className="text-[18px] font-black tracking-tight leading-none" style={{ color: "var(--td-text-hi)" }}>
            Estadística
          </h1>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--td-text-lo)" }}>
            Desempeño de productos por período — solo admin
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Búsqueda con dropdown multi-select */}
        <div className="relative">
          <div
            className="flex items-center gap-2 rounded-full h-[34px] px-3"
            style={{
              width: 300,
              background: "var(--td-input-bg, rgba(255,255,255,0.04))",
              border: `1px solid ${dropdownOpen || pinned.size > 0 ? "rgba(220,38,38,0.5)" : "var(--td-panel-border)"}`,
              transition: "border-color 0.15s",
            }}
          >
            <Search size={11} style={{ color: "var(--td-text-lo)", flexShrink: 0 }} />
            <input
              ref={searchRef}
              type="text"
              placeholder={pinned.size > 0 ? `${pinned.size} seleccionado${pinned.size > 1 ? "s" : ""}…` : "Buscar por nombre o SKU…"}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              className="flex-1 bg-transparent outline-none text-[11px] font-semibold"
              style={{ color: "var(--td-text-hi)" }}
            />
            {(search || pinned.size > 0) && (
              <button type="button" onClick={() => { setSearch(""); clearPinned(); searchRef.current?.focus(); }} className="opacity-40 hover:opacity-80">
                <X size={10} />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {dropdownOpen && allItems.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 top-full mt-1 z-50 rounded-2xl overflow-hidden py-1"
              style={{
                width: 320,
                background: "var(--td-popup-bg)",
                border: "1px solid var(--td-panel-border)",
                boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {suggestions.length === 0 ? (
                <p className="px-4 py-3 text-[11px]" style={{ color: "var(--td-text-lo)" }}>Sin resultados</p>
              ) : (
                suggestions.map((item) => {
                  const isPinned = pinned.has(productKey(item));
                  return (
                    <button
                      key={productKey(item)}
                      type="button"
                      onClick={() => { togglePinned(item); setSearch(""); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/5"
                    >
                      <div className="w-7 h-7 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ background: "rgba(0,0,0,0.2)" }}>
                        {item.image_url
                          ? <img src={item.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                          : item.type === "manga"
                            ? <BookOpen size={12} style={{ color: "var(--td-text-lo)", opacity: 0.4 }} strokeWidth={1.5} />
                            : <Package size={12} style={{ color: "var(--td-text-lo)", opacity: 0.4 }} strokeWidth={1.5} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold truncate" style={{ color: "var(--td-text-hi)" }}>{item.name}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--td-text-lo)" }}>
                          {item.sku} · {item.total_quantity} uds
                        </p>
                      </div>
                      <span
                        className="flex items-center justify-center w-4 h-4 rounded flex-shrink-0"
                        style={{
                          background: isPinned ? "var(--td-red)" : "rgba(255,255,255,0.06)",
                          border: `1px solid ${isPinned ? "var(--td-red)" : "var(--td-panel-border)"}`,
                        }}
                      >
                        {isPinned && <Check size={9} strokeWidth={3} color="#fff" />}
                      </span>
                    </button>
                  );
                })
              )}
              {!debouncedSearch && allItems.length > 12 && (
                <p className="px-4 py-1.5 text-[9px] font-semibold uppercase tracking-widest" style={{ color: "var(--td-text-lo)", borderTop: "1px solid var(--td-panel-border)" }}>
                  Escribe para filtrar entre {allItems.length} productos
                </p>
              )}
            </div>
          )}
        </div>

        {/* Tipo: Todos / Productos / Mangas */}
        <div
          className="flex items-center rounded-full h-[34px] p-0.5 gap-0.5"
          style={{ background: "var(--td-input-bg, rgba(255,255,255,0.04))", border: "1px solid var(--td-panel-border)" }}
        >
          {(["all", "product", "manga"] as ItemType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setItemType(t)}
              className="h-full px-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
              style={itemType === t
                ? { background: "var(--td-red)", color: "#fff" }
                : { background: "transparent", color: "var(--td-text-lo)" }
              }
            >
              {t === "all" ? "Todos" : t === "product" ? "Productos" : "Mangas"}
            </button>
          ))}
        </div>

        {/* Categoría */}
        <div className="relative">
          <select
            value={categoryId ?? ""}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
            className="appearance-none rounded-full h-[34px] pl-4 pr-8 text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer"
            style={{
              background: categoryId ? "rgba(220,38,38,0.15)" : "var(--td-input-bg, rgba(255,255,255,0.04))",
              border: `1px solid ${categoryId ? "rgba(220,38,38,0.5)" : "var(--td-panel-border)"}`,
              color: categoryId ? "var(--td-text-hi)" : "var(--td-text-lo)",
            }}
          >
            <option value="">Todas las categorías</option>
            {(categoriesQuery.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown size={11} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--td-text-lo)" }} />
        </div>

        {/* DateRangePicker — derecha */}
        <div className="ml-auto">
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} maxValue={today} />
        </div>
      </div>

      {/* Chips de productos fijados */}
      {pinned.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Mostrando:</span>
          {[...pinned].map((k) => {
            const item = allItems.find((i) => productKey(i) === k);
            if (!item) return null;
            return (
              <span
                key={k}
                className="flex items-center gap-1.5 rounded-full h-[26px] pl-3 pr-2 text-[10px] font-bold"
                style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.35)", color: "var(--td-text-hi)" }}
              >
                {item.name.length > 28 ? item.name.slice(0, 28) + "…" : item.name}
                <button type="button" onClick={() => togglePinned(item)} className="opacity-60 hover:opacity-100"><X size={10} /></button>
              </span>
            );
          })}
          <button type="button" onClick={clearPinned} className="text-[9px] font-bold uppercase tracking-widest opacity-50 hover:opacity-90 ml-1" style={{ color: "var(--td-text-lo)" }}>
            Limpiar
          </button>
        </div>
      )}

      {/* Avisos de filas apagadas / ocultas */}
      {(excluded.size > 0 || hidden.size > 0) && (
        <div className="flex items-center gap-4">
          {excluded.size > 0 && (
            <span className="flex items-center gap-1.5 text-[9px]">
              <span className="font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                {excluded.size} {excluded.size === 1 ? "apagada" : "apagadas"} del resumen
              </span>
              <button type="button" onClick={clearExcluded} className="font-bold uppercase tracking-widest" style={{ color: "var(--td-red)" }}>
                Encender todo
              </button>
            </span>
          )}
          {hidden.size > 0 && (
            <span className="flex items-center gap-1.5 text-[9px]">
              <span className="font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                {hidden.size} {hidden.size === 1 ? "oculta" : "ocultas"} de la lista
              </span>
              <button type="button" onClick={clearHidden} className="font-bold uppercase tracking-widest" style={{ color: "var(--td-red)" }}>
                Mostrar todo
              </button>
            </span>
          )}
        </div>
      )}

      {/* Botón volver arriba */}
      {showTop && (
        <button
          type="button"
          onClick={() => (mainRef.current?.closest("main") ?? mainRef.current)?.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full w-10 h-10 shadow-xl transition-all"
          style={{ background: "var(--td-red)", color: "#fff" }}
          title="Volver arriba"
        >
          <ArrowUp size={16} strokeWidth={2.5} />
        </button>
      )}

      {/* Métricas resumen */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Ingresos",   value: fmtMXN.format(totalIngresos) },
          { label: "Utilidad",   value: `${fmtMXN.format(totalUtilidad)} (${margen.toFixed(0)}%)` },
          { label: "Productos",  value: activeItems.length.toLocaleString("es-MX") },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-2xl px-4 py-3"
            style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}
          >
            <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: "var(--td-text-lo)" }}>
              {label}
              {excluded.size > 0 && <span style={{ color: "var(--td-red)" }}> · activos</span>}
            </p>
            <p className="text-[16px] font-black leading-none" style={{ color: "var(--td-text-hi)" }}>
              {query.isLoading ? "—" : value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabla compacta */}
      {query.isLoading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl h-12 animate-pulse" style={{ background: "var(--td-panel-bg)" }} />
          ))}
        </div>
      ) : displayItems.length === 0 ? (
        <div
          className="rounded-2xl p-12 flex flex-col items-center gap-3"
          style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}
        >
          <TrendingUp size={32} style={{ color: "var(--td-text-lo)", opacity: 0.25 }} strokeWidth={1.5} />
          <p className="text-[12px] font-semibold" style={{ color: "var(--td-text-lo)" }}>
            Sin ventas en el período seleccionado.
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}
        >
          {/* Encabezado */}
          <div
            className="grid items-center px-3 py-2 text-[9px] font-black uppercase tracking-widest"
            style={{
              gridTemplateColumns: "28px 36px 1fr 80px 60px 90px 90px 80px 28px",
              color: "var(--td-text-lo)",
              borderBottom: "1px solid var(--td-panel-border)",
            }}
          >
            <span>#</span>
            <span />
            <SortHeader label="Producto"  col="name"          active={sortCol} dir={sortDir} onSort={handleSort} align="left" />
            <SortHeader label="P. Venta"  col="unit_price"    active={sortCol} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Uds"       col="total_quantity" active={sortCol} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Total"     col="total_revenue" active={sortCol} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Utilidad"  col="utilidad"      active={sortCol} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Costo"     col="unit_cost"     active={sortCol} dir={sortDir} onSort={handleSort} />
            <span />
          </div>

          {/* Filas */}
          <div className="divide-y" style={{ "--tw-divide-opacity": 1, borderColor: "var(--td-panel-border)" } as React.CSSProperties}>
            {displayItems.map((item, idx) => (
              <ProductRow
                key={rowKey(item)}
                item={item}
                rank={idx + 1}
                isOff={excluded.has(rowKey(item))}
                onToggle={() => toggleRow(item)}
                onHide={() => hideRow(item)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sort Header ──────────────────────────────────────────────────────────────

function SortHeader({
  label, col, active, dir, onSort, align = "right",
}: {
  label: string;
  col: SortCol;
  active: SortCol;
  dir: SortDir;
  onSort: (col: SortCol) => void;
  align?: "left" | "right";
}) {
  const isActive = active === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={`flex items-center gap-0.5 w-full text-[9px] font-black uppercase tracking-widest select-none ${align === "right" ? "justify-end" : "justify-start"}`}
      style={{ color: isActive ? "var(--td-text-hi)" : "var(--td-text-lo)" }}
    >
      {label}
      <span className="flex flex-col ml-0.5" style={{ opacity: isActive ? 1 : 0.3 }}>
        <ChevronUp  size={7} strokeWidth={3} style={{ color: isActive && dir === "asc"  ? "var(--td-red)" : undefined }} />
        <ChevronDown size={7} strokeWidth={3} style={{ color: isActive && dir === "desc" ? "var(--td-red)" : undefined }} />
      </span>
    </button>
  );
}

// ─── Fila de producto ─────────────────────────────────────────────────────────

function ProductRow({
  item, rank, isOff, onToggle, onHide,
}: {
  item: TopProductsReportItem;
  rank: number;
  isOff: boolean;
  onToggle: () => void;
  onHide: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered]   = useState(false);
  const hasImage = item.image_url && !imgError;
  const utilidad = item.total_revenue - (item.unit_cost ?? 0) * item.total_quantity;
  const margen   = item.total_revenue > 0 ? (utilidad / item.total_revenue) * 100 : 0;
  const margenColor = margen >= 30 ? "#22c55e" : margen >= 15 ? "#eab308" : "var(--td-text-lo)";

  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="grid items-center px-3 py-1.5 transition-all cursor-pointer"
      style={{
        gridTemplateColumns: "28px 36px 1fr 80px 60px 90px 90px 80px 28px",
        opacity: isOff ? 0.3 : 1,
        background: isOff ? "rgba(0,0,0,0.1)" : hovered ? "rgba(255,255,255,0.02)" : "transparent",
      }}
    >
      {/* Rank */}
      <span className="text-[10px] font-black" style={{ color: rank <= 3 ? "var(--td-red)" : "var(--td-text-lo)" }}>
        {rank}
      </span>

      {/* Imagen */}
      <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center" style={{ background: "rgba(0,0,0,0.15)" }}>
        {hasImage ? (
          <img src={item.image_url} alt="" loading="lazy" onError={() => setImgError(true)} className="w-full h-full object-cover" />
        ) : item.type === "manga" ? (
          <BookOpen size={14} style={{ color: "var(--td-text-lo)", opacity: 0.35 }} strokeWidth={1.5} />
        ) : (
          <Package size={14} style={{ color: "var(--td-text-lo)", opacity: 0.35 }} strokeWidth={1.5} />
        )}
      </div>

      {/* Nombre + SKU */}
      <div className="px-2 min-w-0">
        <p className="text-[12px] font-semibold truncate leading-tight" style={{ color: "var(--td-text-hi)" }} title={item.name}>
          {item.name}
        </p>
        <p className="text-[9px] font-semibold uppercase tracking-wider leading-none mt-0.5" style={{ color: "var(--td-text-lo)" }}>
          {item.sku}
        </p>
      </div>

      {/* Precio de venta */}
      <span className="text-right text-[11px] font-semibold tabular-nums" style={{ color: "var(--td-text-hi)" }}>
        {fmtCompact.format(item.unit_price)}
      </span>

      {/* Unidades vendidas */}
      <span className="text-right text-[11px] font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>
        {item.total_quantity.toLocaleString("es-MX")}
      </span>

      {/* Total vendido */}
      <span className="text-right text-[11px] font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>
        {fmtCompact.format(item.total_revenue)}
      </span>

      {/* Utilidad */}
      <div className="text-right">
        <span className="text-[11px] font-black tabular-nums block" style={{ color: margenColor }}>
          {fmtCompact.format(utilidad)}
        </span>
        {(item.unit_cost ?? 0) > 0 && (
          <span className="text-[9px] font-semibold" style={{ color: margenColor, opacity: 0.7 }}>
            {margen.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Costo */}
      <span className="text-right text-[11px] font-semibold tabular-nums" style={{ color: "var(--td-text-lo)" }}>
        {(item.unit_cost ?? 0) > 0 ? fmtCompact.format(item.unit_cost ?? 0) : "—"}
      </span>

      {/* Quitar de lista */}
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onHide(); }}
          className="flex items-center justify-center w-6 h-6 rounded-lg transition-all"
          style={{
            opacity: hovered ? 0.6 : 0,
            background: "transparent",
            color: "var(--td-text-lo)",
          }}
          title="Quitar de la lista"
        >
          <Trash2 size={11} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
