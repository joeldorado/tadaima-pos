// @ts-nocheck
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { X, Search, Package, ChevronLeft, ChevronRight, LayoutGrid, Zap, RefreshCw, TicketPercent } from "lucide-react";
import { ImageWithFallback } from "@/components/figma/ImageWithFallback";
import { PRICE_LEVEL_LABELS, PRICE_LEVEL_COLORS, PRICE_LEVEL_RGB } from "@/lib/priceLevels";
import { promoDetailLabel, promoShortLabel } from "@/lib/promoLabel";
import { BUSINESS_TZ } from "@/lib/date";

// ─── Types ────────────────────────────────────────────────────────────────────
interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  image?: string;
  price_a: number;
  price_b?: number;
  price_c?: number;
  price_d?: number;
  price_e?: number;
  stock?: number;
  stock_details?: { tienda: number; bodega: number; preventa: number; dañado: number };
  payment_restriction?: string;
  product_type?: string;
  volume_number?: number | null;
  /** false = sin inventario en esta tienda ("No asignado"). Default tratado como true. */
  is_assigned?: boolean;
  /** Promos vigentes (embed del backend, ya filtradas por tienda). */
  active_promotions?: Array<{ id: number; name: string; type?: string; buy_n: number | null; pay_m: number | null; min_qty?: number | null; discount_per_unit?: number | null; priority: number; store_id?: number | null; ends_at?: string | null }>;
}

type Level = "a" | "b" | "c" | "d" | "e";
type CatalogKind = "productos" | "tomos";

interface Props {
  products: CatalogProduct[];
  onSelect: (product: CatalogProduct, level: Level, quantity?: number) => void;
  onClose: () => void;
  title?: string;
  preventaMode?: boolean;
  /**
   * Stock real disponible para la caja actual (stock total − reservado en otras cajas).
   * Si está presente, sobrescribe el badge de stock por producto.
   */
  availableStock?: Record<string, number>;
  /**
   * Mapa productId → lista de "N elegidos en Caja X" de OTRAS cajas.
   * Permite al cajero ver qué está reservado en otra caja antes de elegir.
   */
  reservedByMesa?: Record<string, Array<{ mesaName: string; qty: number }>>;
  /** Callback para refrescar productos desde el backend (botón "Actualizar"). */
  onRefresh?: () => void;
  /** True cuando hay un refetch en vuelo — anima el icono y deshabilita el botón. */
  isRefreshing?: boolean;
  /** Producto "No asignado" → el cajero le agrega stock (abre QuickStockModal). */
  onAddStock?: (product: CatalogProduct) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 120;

const PRICE_META: { key: keyof CatalogProduct; level: Level; label: string; color: string; hoverBg: string; hoverBorder: string }[] = [
  { key: "price_a", level: "a", label: PRICE_LEVEL_LABELS.a, color: PRICE_LEVEL_COLORS.a, hoverBg: "rgba(16,185,129,0.10)",  hoverBorder: "rgba(16,185,129,0.30)" },
  { key: "price_b", level: "b", label: PRICE_LEVEL_LABELS.b, color: PRICE_LEVEL_COLORS.b, hoverBg: "rgba(245,158,11,0.10)", hoverBorder: "rgba(245,158,11,0.30)" },
  { key: "price_c", level: "c", label: PRICE_LEVEL_LABELS.c, color: PRICE_LEVEL_COLORS.c, hoverBg: "rgba(59,130,246,0.10)", hoverBorder: "rgba(59,130,246,0.30)" },
  { key: "price_d", level: "d", label: PRICE_LEVEL_LABELS.d, color: PRICE_LEVEL_COLORS.d, hoverBg: "rgba(139,92,246,0.10)", hoverBorder: "rgba(139,92,246,0.30)" },
  { key: "price_e", level: "e", label: PRICE_LEVEL_LABELS.e, color: PRICE_LEVEL_COLORS.e, hoverBg: "rgba(236,72,153,0.10)", hoverBorder: "rgba(236,72,153,0.30)" },
];

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n || 0);

function stockBadge(stock: number | undefined): { label: string; color: string; bg: string } {
  // Colores sólidos con texto blanco — visibles en cualquier tema (claro u oscuro).
  if (stock === undefined) return { label: "—",       color: "#FFFFFF", bg: "rgba(0,0,0,0.55)" };
  if (stock === 0)         return { label: "Agotado", color: "#FFFFFF", bg: "#DC2626" };
  if (stock <= 3)          return { label: `×${stock}`, color: "#FFFFFF", bg: "#F59E0B" };
  return                          { label: `×${stock}`, color: "#FFFFFF", bg: "#16A34A" };
}

// ─── Card media ───────────────────────────────────────────────────────────────
// Con imagen: cuadro 1:1 con badges flotantes. Sin imagen: para tomos/libros
// mostramos un bloque centrado con VOL + número; para el resto conservamos la
// franja compacta (QA Joel 2026-06-11).
function CardMedia({ image, badge, isCashOnly, volume }: {
  image?: string;
  badge: { label: string; color: string; bg: string };
  isCashOnly: boolean;
  volume?: number | null;
}) {
  const hasVolume = volume != null;

  if (!image) {
    if (hasVolume) {
      return (
        <div style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 92,
          padding: "12px 10px",
          background: "linear-gradient(180deg, rgba(38,27,32,0.96) 0%, rgba(27,20,24,0.94) 100%)",
          borderBottom: "1px solid var(--td-card-border)",
        }}>
          {isCashOnly && (
            <span style={{
              position: "absolute",
              top: 8,
              left: 8,
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "2px 6px", borderRadius: 6,
              fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em",
              color: "#FBBF24", background: "rgba(251,191,36,0.15)",
              border: "1px solid rgba(251,191,36,0.3)",
            }}>
              <Zap size={8} />
              Efectivo
            </span>
          )}
          <span style={{
            position: "absolute",
            top: 8,
            right: 8,
            padding: "3px 8px", borderRadius: 8,
            fontSize: 11, fontWeight: 900, letterSpacing: "0.04em",
            color: badge.color, background: badge.bg,
          }}>
            {badge.label}
          </span>

          <div style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: "linear-gradient(135deg,#990000,#CC2200)",
            border: "1px solid rgba(255,120,90,0.22)",
            boxShadow: "0 10px 24px rgba(153,0,0,0.26), inset 0 1px 0 rgba(255,200,180,0.16)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
          }}>
            <span style={{ fontSize: 11, fontWeight: 900, lineHeight: 1, letterSpacing: "0.08em", opacity: 0.88 }}>
              VOL
            </span>
            <span style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.05 }}>
              {volume}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 10px",
        background: "var(--td-panel-bg)",
        borderBottom: "1px solid var(--td-card-border)",
      }}>
        <Package size={14} color="var(--td-text-ghost)" />
        {isCashOnly && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "2px 6px", borderRadius: 6,
            fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em",
            color: "#FBBF24", background: "rgba(251,191,36,0.15)",
            border: "1px solid rgba(251,191,36,0.3)",
          }}>
            <Zap size={8} />
            Efectivo
          </span>
        )}
        <span style={{
          marginLeft: "auto",
          padding: "3px 8px", borderRadius: 8,
          fontSize: 11, fontWeight: 900, letterSpacing: "0.04em",
          color: badge.color, background: badge.bg,
        }}>
          {badge.label}
        </span>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", paddingTop: "100%", background: "var(--td-panel-bg)", overflow: "hidden" }}>
      <ImageWithFallback
        src={image}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: "block", padding: 6 }}
      />
      {/* Stock badge */}
      <div style={{
        position: "absolute", top: 6, right: 6,
        padding: "3px 8px", borderRadius: 8,
        fontSize: 11, fontWeight: 900, letterSpacing: "0.04em",
        color: badge.color, background: badge.bg,
        boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
      }}>
        {badge.label}
      </div>
      {isCashOnly && (
        <div style={{
          position: "absolute", top: 5, left: 5,
          padding: "2px 6px", borderRadius: 6,
          fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em",
          color: "#FBBF24", background: "rgba(251,191,36,0.15)",
          backdropFilter: "blur(4px)",
          border: "1px solid rgba(251,191,36,0.3)",
          display: "flex", alignItems: "center", gap: 3,
        }}>
          <Zap size={8} />
          Efectivo
        </div>
      )}
      {hasVolume && (
        <div style={{
          position: "absolute",
          left: 8,
          bottom: 8,
          padding: "4px 8px",
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#FF7A59",
          background: "rgba(204,34,0,0.18)",
          border: "1px solid rgba(204,34,0,0.34)",
          backdropFilter: "blur(6px)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.28)",
        }}>
          Vol. {volume}
        </div>
      )}
    </div>
  );
}

// Pills de promo NxM en la card (QA Joel 2026-07-18): máximo 2 visibles (las de
// mayor prioridad, mismo desempate que el motor) + "+N" si hubiera más.
function PromoPills({ promos }: { promos?: CatalogProduct["active_promotions"] }) {
  if (!promos || promos.length === 0) return null;
  // Override local (2026-07-20): el embed ya viene filtrado a global+tu
  // tienda; si hay LOCAL, la global no aplica aquí y no se pinta.
  const pool = promos.some(pr => pr.store_id != null) ? promos.filter(pr => pr.store_id != null) : promos;
  const sorted = [...pool].sort((a, b) => (b.priority - a.priority) || (a.id - b.id));
  const shown = sorted.slice(0, 2);
  const extra = sorted.length - shown.length;
  const fmtEnds = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", timeZone: BUSINESS_TZ }) : null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
      {shown.map(pr => {
        const ends = fmtEnds(pr.ends_at);
        return (
          <span
            key={pr.id}
            title={`${pr.name} · ${promoDetailLabel(pr)}${ends ? ` · hasta ${ends}` : " · sin vencimiento"}`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "2px 7px", borderRadius: 7, flexShrink: 0,
              fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em",
              color: "#34d399", background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.35)",
            }}
          >
            <TicketPercent size={9} />
            {promoShortLabel(pr)}{ends ? ` · hasta ${ends}` : ""}
          </span>
        );
      })}
      {extra > 0 && (
        <span
          title={`${extra} promo${extra !== 1 ? "s" : ""} más activa${extra !== 1 ? "s" : ""}`}
          style={{
            display: "inline-flex", alignItems: "center",
            padding: "2px 6px", borderRadius: 7, flexShrink: 0,
            fontSize: 9, fontWeight: 900,
            color: "var(--td-text-lo)", background: "var(--td-card-bg)",
            border: "1px solid var(--td-card-border)",
          }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

// Pill "Tomo N" — distingue tomos de la misma serie en librería (QA 2026-06-11).
function VolumePill({ volume }: { volume: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 7px", borderRadius: 7, flexShrink: 0,
      fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em",
      color: "#FF7A59", background: "rgba(204,34,0,0.15)",
      border: "1px solid rgba(204,34,0,0.3)",
    }}>
      Vol. {volume}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ProductCatalogModal({ products, onSelect, onClose, title = "Catálogo de Productos", preventaMode = false, availableStock, reservedByMesa, onRefresh, isRefreshing, onAddStock }: Props) {
  const [query, setQuery]       = useState("");
  const [kind, setKind]         = useState<CatalogKind>("productos");
  const [category, setCategory] = useState("Todos");
  const [page, setPage]         = useState(1);
  const searchRef               = useRef<HTMLInputElement>(null);

  // Preventa-mode per-card state: quantities and selected levels keyed by product id
  const [quantities, setQuantities]       = useState<Record<string, number>>({});
  const [selectedLevels, setSelectedLevels] = useState<Record<string, Level>>({});

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const isTomo = useCallback((p: CatalogProduct) =>
    p.product_type === "manga" || p.volume_number != null,
  []);

  const kindFiltered = useMemo(() => (
    products.filter(p => kind === "tomos" ? isTomo(p) : !isTomo(p))
  ), [products, kind, isTomo]);

  useEffect(() => { setPage(1); }, [query, category, kind]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(kindFiltered.map(p => p.category).filter(Boolean))).sort();
    return ["Todos", ...cats];
  }, [kindFiltered]);

  useEffect(() => {
    if (category !== "Todos" && !categories.includes(category)) {
      setCategory("Todos");
    }
  }, [category, categories]);

  // Stock efectivo para esta caja = el mismo que muestra el badge
  // (stock de la tienda − reservado en otras cajas). `undefined` = desconocido.
  const effectiveStock = useCallback(
    (p: CatalogProduct): number | undefined =>
      availableStock?.[p.id] ?? p.stock_details?.tienda ?? p.stock,
    [availableStock],
  );

  const filtered = useMemo(() => {
    let list = kindFiltered;
    if (category !== "Todos") list = list.filter(p => p.category === category);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    }
    // Productos sin stock (0) al final del listado (QA Ruben + Joel 2026-05-30).
    // Sort estable (ES2019): conserva el orden original dentro de cada grupo.
    return [...list].sort((a, b) => {
      const aOut = effectiveStock(a) === 0 ? 1 : 0;
      const bOut = effectiveStock(b) === 0 ? 1 : 0;
      return aOut - bOut;
    });
  }, [kindFiltered, query, category, effectiveStock]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const kindLabelPlural = kind === "tomos" ? "tomos" : "productos";

  const handleSelect = useCallback((p: CatalogProduct, level: Level = "a") => {
    // No asignado a esta tienda → nunca se vende; abre "Agregar stock" si hay
    // callback. Bloquea onSelect siempre (defensivo, aunque falte onAddStock).
    if (p.is_assigned === false) {
      if (onAddStock) { onAddStock(p); onClose(); }
      return;
    }
    onSelect(p, level);
    onClose();
  }, [onSelect, onClose, onAddStock]);

  const getQty = (id: string) => quantities[id] ?? 1;
  const getLevel = (id: string) => selectedLevels[id] ?? "a";

  const setQty = (id: string, val: number) =>
    setQuantities(prev => ({ ...prev, [id]: Math.min(20, Math.max(1, val)) }));

  const setLevel = (id: string, level: Level) =>
    setSelectedLevels(prev => ({ ...prev, [id]: level }));

  const handleAgregar = useCallback((p: CatalogProduct) => {
    if (p.is_assigned === false) {
      if (onAddStock) { onAddStock(p); onClose(); }
      return;
    }
    const level = getLevel(p.id);
    const qty   = getQty(p.id);
    onSelect(p, level, qty);
    onClose();
  }, [onSelect, onClose, onAddStock, quantities, selectedLevels]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "var(--td-popup-bg)",
      backdropFilter: "blur(24px)",
      display: "flex", flexDirection: "column",
    }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 20px",
        borderBottom: "1px solid var(--td-panel-border)",
        background: "var(--td-panel-bg)",
        flexShrink: 0,
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <LayoutGrid size={16} color="#E0221A" />
        </div>

        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "var(--td-text-hi)", letterSpacing: "-0.01em" }}>{title}</p>
          <p style={{ margin: 0, fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            {filtered.length.toLocaleString()} {kindLabelPlural}{query ? " encontrados" : ""}
          </p>
        </div>

        {/* Search */}
        <div style={{ position: "relative", width: 300 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--td-text-ghost)", pointerEvents: "none" }} />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Nombre, SKU o categoría..."
            style={{
              width: "100%", boxSizing: "border-box",
              background: "var(--td-input-bg)",
              border: "1px solid var(--td-input-border)",
              borderRadius: 12, outline: "none",
              padding: "9px 14px 9px 36px",
              fontSize: 12, fontWeight: 700,
              color: "var(--td-input-text)",
            }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--td-text-lo)", display: "flex" }}>
              <X size={13} />
            </button>
          )}
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            style={{
              height: 36, padding: "0 14px", borderRadius: 10, flexShrink: 0,
              background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)",
              cursor: isRefreshing ? "default" : "pointer", display: "flex",
              alignItems: "center", gap: 6, color: "var(--td-text-lo)",
              fontSize: 11, fontWeight: 900, textTransform: "uppercase",
              letterSpacing: "0.08em", opacity: isRefreshing ? 0.5 : 1,
            }}
            title="Buscar nuevos productos"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            Actualizar
          </button>
        )}

        <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--td-text-lo)" }}>
          <X size={16} />
        </button>
      </div>

      {/* ── Category pills ──────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 8, padding: "10px 20px",
        overflowX: "auto", flexShrink: 0,
        borderBottom: "1px solid var(--td-panel-border)",
        background: "var(--td-panel-bg)",
      }}
        className="no-scrollbar"
      >
        {([
          { id: "productos" as const, label: `Productos · ${products.filter(p => !isTomo(p)).length}` },
          { id: "tomos" as const, label: `Tomos · ${products.filter(p => isTomo(p)).length}` },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setKind(tab.id)}
            style={{
              flexShrink: 0,
              padding: "7px 14px", borderRadius: 999,
              fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em",
              cursor: "pointer", transition: "all 0.15s",
              background: kind === tab.id ? "linear-gradient(135deg,#BB1100,#E0221A)" : "var(--td-card-bg)",
              border: kind === tab.id ? "1px solid rgba(224,34,26,0.4)" : "1px solid var(--td-card-border)",
              color: kind === tab.id ? "#fff" : "var(--td-text-lo)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {categories.length > 2 && (
        <div style={{
          display: "flex", gap: 6, padding: "10px 20px",
          overflowX: "auto", flexShrink: 0,
          borderBottom: "1px solid var(--td-panel-border)",
          background: "var(--td-panel-bg)",
        }}
          className="no-scrollbar"
        >
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                flexShrink: 0,
                padding: "5px 12px", borderRadius: 20,
                fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em",
                cursor: "pointer", transition: "all 0.15s",
                background: category === cat ? "linear-gradient(135deg,#BB1100,#E0221A)" : "var(--td-card-bg)",
                border: category === cat ? "1px solid rgba(224,34,26,0.4)" : "1px solid var(--td-card-border)",
                color: category === cat ? "#fff" : "var(--td-text-lo)",
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* ── Card grid ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {paginated.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, opacity: 0.3 }}>
            <Package size={40} color="var(--td-text-lo)" />
            <p style={{ color: "var(--td-text-lo)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", margin: 0 }}>
              Sin {kindLabelPlural}
            </p>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
            gap: 10,
          }}>
            {paginated.map(p => {
              const totalStock = p.stock_details?.tienda ?? p.stock;
              // Stock efectivo para esta caja = stock − reservado en otras cajas.
              const stock    = availableStock?.[p.id] ?? totalStock;
              // No asignado a esta tienda → badge ámbar en vez de "Agotado".
              const badge    = p.is_assigned === false
                ? { label: "No asignado", color: "#FFFFFF", bg: "#F59E0B" }
                : stockBadge(stock);
              const isCashOnly = p.payment_restriction === "cash_only";
              const hasStock = stock === undefined || stock > 0;
              const otherCajaReservations = reservedByMesa?.[p.id] ?? [];

              // Collect active price levels (always include "a", add b-e if > 0)
              const activePrices = PRICE_META.filter(m => {
                const val = p[m.key] as number | undefined;
                return m.level === "a" || (val && val > 0);
              });

              if (preventaMode) {
                // ── Preventa card ──────────────────────────────────────────────
                const cardQty   = getQty(p.id);
                const cardLevel = getLevel(p.id);
                const activeMeta = PRICE_META.find(m => m.level === cardLevel) ?? PRICE_META[0];

                return (
                  <div
                    key={p.id}
                    style={{
                      borderRadius: 14,
                      background: "var(--td-card-bg)",
                      border: "1px solid var(--td-card-border)",
                      overflow: "hidden",
                      display: "flex", flexDirection: "column",
                      transition: "border-color 0.15s",
                      opacity: hasStock ? 1 : 0.5,
                      // Sin stock → escala de gris para identificar a simple vista
                      // que no tenemos el producto (QA Ruben 2026-05-30).
                      filter: hasStock ? "none" : "grayscale(1)",
                      position: "relative",
                    }}
                  >
                    {/* Image / franja compacta sin foto */}
                    <CardMedia image={p.image} badge={badge} isCashOnly={isCashOnly} volume={p.volume_number} />

                    {/* Name + SKU */}
                    <div style={{ padding: "8px 10px 4px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                      <p style={{
                        margin: 0, fontSize: 11, fontWeight: 800, lineHeight: 1.25,
                        color: "var(--td-text-hi)",
                        display: "-webkit-box", WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical", overflow: "hidden",
                      }}>{p.name}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                        {p.volume_number != null && <VolumePill volume={p.volume_number} />}
                        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: "var(--td-text-ghost)", fontFamily: "monospace", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.sku}</p>
                      </div>
                      <PromoPills promos={p.active_promotions} />
                      {otherCajaReservations.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
                          {otherCajaReservations.map(r => (
                            <span
                              key={r.mesaName}
                              title={`${r.qty} unidad(es) ya en ${r.mesaName}`}
                              style={{
                                fontSize: 8, fontWeight: 900, padding: "2px 5px", borderRadius: 5,
                                color: "#F59E0B", background: "rgba(245,158,11,0.12)",
                                border: "1px solid rgba(245,158,11,0.25)",
                                textTransform: "uppercase", letterSpacing: "0.04em",
                              }}
                            >
                              {r.qty} en {r.mesaName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── Preventa: price level selector (highlighted when active) ── */}
                    <div style={{
                      padding: "4px 6px 4px",
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 3,
                    }}>
                      {activePrices.map(({ key, level, label, color, hoverBg, hoverBorder }) => {
                        const price      = p[key] as number;
                        const isSelected = cardLevel === level;
                        return (
                          <button
                            key={level}
                            onClick={e => { e.stopPropagation(); setLevel(p.id, level); }}
                            style={{
                              padding: "5px 4px", borderRadius: 8,
                              textAlign: "center",
                              background: isSelected ? "rgba(245,158,11,0.15)" : "transparent",
                              border: isSelected ? "1px solid rgba(245,158,11,0.4)" : "1px solid transparent",
                              cursor: "pointer",
                              transition: "background 0.1s, border-color 0.1s",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                            }}
                            onMouseEnter={e => {
                              if (isSelected) return;
                              const b = e.currentTarget as HTMLButtonElement;
                              b.style.background = hoverBg;
                              b.style.borderColor = hoverBorder;
                            }}
                            onMouseLeave={e => {
                              if (isSelected) return;
                              const b = e.currentTarget as HTMLButtonElement;
                              b.style.background = "transparent";
                              b.style.borderColor = "transparent";
                            }}
                          >
                            <span style={{ fontSize: 7, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color, opacity: 0.7, lineHeight: 1.2 }}>{label}</span>
                            <span style={{ fontSize: level === "a" ? 12 : 11, fontWeight: 900, color, lineHeight: 1.3 }}>{fmt(price)}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* ── Quantity stepper ── */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "4px 10px 6px",
                    }}>
                      <button
                        onClick={e => { e.stopPropagation(); setQty(p.id, cardQty - 1); }}
                        style={{
                          width: 28, height: 28, borderRadius: 7,
                          background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)",
                          cursor: cardQty <= 1 ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: cardQty <= 1 ? "var(--td-text-ghost)" : "var(--td-text-md)",
                          fontSize: 14, fontWeight: 900, lineHeight: 1,
                          flexShrink: 0,
                        }}
                        disabled={cardQty <= 1}
                      >
                        −
                      </button>

                      <span style={{
                        minWidth: 28, textAlign: "center",
                        fontSize: 12, fontWeight: 900,
                        color: "var(--td-text-hi)",
                      }}>
                        ×{cardQty}
                      </span>

                      <button
                        onClick={e => { e.stopPropagation(); setQty(p.id, cardQty + 1); }}
                        style={{
                          width: 28, height: 28, borderRadius: 7,
                          background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)",
                          cursor: cardQty >= 20 ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: cardQty >= 20 ? "var(--td-text-ghost)" : "var(--td-text-md)",
                          fontSize: 14, fontWeight: 900, lineHeight: 1,
                          flexShrink: 0,
                        }}
                        disabled={cardQty >= 20}
                      >
                        +
                      </button>
                    </div>

                    {/* ── Agregar button ── */}
                    <div style={{ padding: "0 8px 8px" }}>
                      <button
                        onClick={e => { e.stopPropagation(); handleAgregar(p); }}
                        style={{
                          width: "100%",
                          padding: "7px 10px", borderRadius: 9,
                          background: "rgba(245,158,11,0.15)",
                          border: "1px solid rgba(245,158,11,0.4)",
                          color: "#F59E0B",
                          cursor: "pointer",
                          fontSize: 10, fontWeight: 900,
                          textTransform: "uppercase", letterSpacing: "0.1em",
                          transition: "background 0.12s, border-color 0.12s",
                        }}
                        onMouseEnter={e => {
                          const b = e.currentTarget as HTMLButtonElement;
                          b.style.background = "rgba(245,158,11,0.25)";
                          b.style.borderColor = "rgba(245,158,11,0.65)";
                        }}
                        onMouseLeave={e => {
                          const b = e.currentTarget as HTMLButtonElement;
                          b.style.background = "rgba(245,158,11,0.15)";
                          b.style.borderColor = "rgba(245,158,11,0.4)";
                        }}
                      >
                        Agregar → Preventa
                      </button>
                    </div>
                  </div>
                );
              }

              // ── Normal card ──────────────────────────────────────────────────
              return (
                <div
                  key={p.id}
                  onClick={() => handleSelect(p, "a")}
                  style={{
                    borderRadius: 14,
                    background: "var(--td-card-bg)",
                    border: "1px solid var(--td-card-border)",
                    cursor: "pointer",
                    overflow: "hidden",
                    display: "flex", flexDirection: "column",
                    transition: "border-color 0.15s, transform 0.1s",
                    opacity: hasStock ? 1 : 0.5,
                    // Sin stock → escala de gris (QA Ruben 2026-05-30).
                    filter: hasStock ? "none" : "grayscale(1)",
                    position: "relative",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(224,34,26,0.35)";
                    (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "var(--td-card-border)";
                    (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                  }}
                >
                  {/* Image / franja compacta sin foto */}
                  <CardMedia image={p.image} badge={badge} isCashOnly={isCashOnly} volume={p.volume_number} />

                  {/* Name + SKU */}
                  <div style={{ padding: "10px 12px 6px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <p style={{
                      margin: 0, fontSize: 14, fontWeight: 900, lineHeight: 1.25,
                      color: "var(--td-text-hi)",
                      display: "-webkit-box", WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}>{p.name}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                      {p.volume_number != null && <VolumePill volume={p.volume_number} />}
                      <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: "var(--td-text-ghost)", fontFamily: "monospace", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.sku}</p>
                    </div>
                    <PromoPills promos={p.active_promotions} />
                  </div>

                  {/* ── Prices: filas grandes como Preventas ─────────────────── */}
                  <div style={{
                    padding: "2px 10px 10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 7,
                  }}>
                    {activePrices.map(({ key, level, label, color, hoverBg, hoverBorder }) => {
                      const price = p[key] as number;
                      const rgb = PRICE_LEVEL_RGB[level];
                      return (
                        <button
                          key={level}
                          onClick={e => { e.stopPropagation(); handleSelect(p, level); }}
                          style={{
                            padding: "8px 12px", borderRadius: 10,
                            textAlign: "left",
                            background: `rgba(${rgb},0.10)`,
                            border: `1px solid rgba(${rgb},0.32)`,
                            cursor: "pointer",
                            transition: "background 0.1s, border-color 0.1s",
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                          }}
                          onMouseEnter={e => {
                            const b = e.currentTarget as HTMLButtonElement;
                            b.style.background = hoverBg;
                            b.style.borderColor = hoverBorder;
                          }}
                          onMouseLeave={e => {
                            const b = e.currentTarget as HTMLButtonElement;
                            b.style.background = `rgba(${rgb},0.10)`;
                            b.style.borderColor = `rgba(${rgb},0.32)`;
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color, lineHeight: 1.2 }}>
                            {label}
                          </span>
                          <span style={{ fontSize: 16, fontWeight: 900, color, lineHeight: 1.1 }}>{fmt(price)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px",
          borderTop: "1px solid var(--td-panel-border)",
          background: "var(--td-panel-bg)",
          flexShrink: 0,
        }}>
          <button
            disabled={safePage <= 1}
            onClick={() => setPage(p => p - 1)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 16px", borderRadius: 10,
              background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)",
              color: safePage <= 1 ? "var(--td-text-ghost)" : "var(--td-text-md)",
              cursor: safePage <= 1 ? "not-allowed" : "pointer",
              fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em",
            }}
          >
            <ChevronLeft size={13} /> Anterior
          </button>

          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--td-text-ghost)" }}>
            {safePage} / {totalPages}
          </span>

          <button
            disabled={safePage >= totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 16px", borderRadius: 10,
              background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)",
              color: safePage >= totalPages ? "var(--td-text-ghost)" : "var(--td-text-md)",
              cursor: safePage >= totalPages ? "not-allowed" : "pointer",
              fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em",
            }}
          >
            Siguiente <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
