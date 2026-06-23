import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { PreSalesSkeleton } from "./PreSalesSkeleton";
import { updatePreSaleCatalogStatus, storageUrl } from "@tadaima/api";
import type { PreSaleCatalog, PreSaleCatalogStatus } from "@tadaima/api";
import { useQueryClient } from "@tanstack/react-query";
import { usePreSaleCatalogsQuery } from "@/hooks/queries/usePreSales";
import { queryKeys } from "@/lib/queryKeys";
import {
  Package, Plus, Loader2, Search, X, ChevronLeft, ChevronRight,
  BookOpen, CheckCircle2, Archive, Ban, Pencil, Truck, Boxes, AlertTriangle, Star,
  ChevronsUpDown, ChevronUp, ChevronDown, MoreHorizontal,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  flexRender,
  type ColumnDef, type SortingState, type CellContext,
} from "@tanstack/react-table";
import { AnimatePresence } from "motion/react";
import { NewPreSaleCatalogModal } from "./NewPreSaleCatalogModal";
import { CatalogToProductModal } from "./CatalogToProductModal";
import { CatalogHistoryModal } from "./CatalogHistoryModal";

const GLASS: React.CSSProperties = {
  background: "var(--td-panel-bg)", backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  border: "1px solid var(--td-panel-border)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)",
};
const GLASS_MD: React.CSSProperties = {
  background: "var(--td-card-bg)", backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid var(--td-card-border)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
};

const RED = "var(--td-red)";
const TP  = "var(--td-text-hi)";
const TS  = "var(--td-text-md)";
const TM  = "var(--td-text-lo)";
const PAGE = 10;

const fmt = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n);

const STATUS_CFG: Record<PreSaleCatalogStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft:     { label: "Borrador",   color: TM,        bg: "var(--td-card-bg)",       icon: <BookOpen     size={10} /> },
  published: { label: "Publicado",  color: "#22C55E",  bg: "rgba(34,197,94,0.08)",   icon: <CheckCircle2 size={10} /> },
  arrived:   { label: "Llegó",      color: "#F59E0B",  bg: "rgba(245,158,11,0.08)",  icon: <Truck        size={10} /> },
  closed:    { label: "Cerrado",    color: "#3B82F6",  bg: "rgba(59,130,246,0.08)",  icon: <Archive      size={10} /> },
  cancelled: { label: "Cancelado",  color: "#EF4444",  bg: "rgba(239,68,68,0.08)",   icon: <Ban          size={10} /> },
  completed: { label: "Completado", color: "#A78BFA",  bg: "rgba(167,139,250,0.08)", icon: <Star         size={10} /> },
};

const NEXT_STATUSES: Partial<Record<PreSaleCatalogStatus, { to: PreSaleCatalogStatus; label: string; highlight?: boolean; onlyWhenComplete?: boolean }[]>> = {
  draft:     [{ to: "published", label: "Publicar" },                                                                     { to: "cancelled", label: "Cancelar" }],
  published: [{ to: "arrived",   label: "Producto llegó", highlight: true }, { to: "closed", label: "Cerrar" },           { to: "cancelled", label: "Cancelar" }],
  arrived:   [{ to: "completed", label: "Completar ciclo", highlight: true, onlyWhenComplete: true },                     { to: "cancelled", label: "Cancelar" }],
  closed:    [{ to: "cancelled", label: "Cancelar" }],
};

const ACTION_INFO: Partial<Record<PreSaleCatalogStatus, { key: string; title: string; description: string; actionLabel: string }>> = {
  arrived:   { key: "catalog_arrived",  title: "¿El producto ya llegó?",       actionLabel: "Sí, ya llegó",   description: "Todos los folios pendientes pasarán a 'Listo' automáticamente para que los clientes puedan liquidar en caja." },
  closed:    { key: "catalog_close",    title: "Cerrar catálogo",              actionLabel: "Cerrar",          description: "Ya no se podrán crear nuevos folios. Los existentes continúan y pueden liquidarse normalmente." },
  cancelled: { key: "catalog_cancel",   title: "Cancelar catálogo",            actionLabel: "Cancelar todo",   description: "Todos los folios pendientes y listos serán cancelados. Esta acción no puede revertirse." },
  published: { key: "catalog_publish",  title: "Publicar catálogo",            actionLabel: "Publicar",        description: "El catálogo estará visible para los cajeros y podrán crear folios de preventa." },
  completed: { key: "catalog_complete", title: "Completar ciclo de preventa",  actionLabel: "Sí, completar",   description: "El catálogo se marcará como completado y desaparecerá de Caja y difusión. Solo visible como historial en Proveedores." },
};

// ─── Column meta typing ───────────────────────────────────────────────────────
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    tdStyle?: React.CSSProperties;
    thExtra?: React.ReactNode;
  }
}

// ─── Small components ─────────────────────────────────────────────────────────
function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (dir === "asc")  return <ChevronUp   size={10} style={{ opacity: 0.9, flexShrink: 0 }} />;
  if (dir === "desc") return <ChevronDown size={10} style={{ opacity: 0.9, flexShrink: 0 }} />;
  return <ChevronsUpDown size={10} style={{ opacity: 0.3, flexShrink: 0 }} />;
}

function StatusBadge({ status }: { status: PreSaleCatalogStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, fontSize: 9, fontWeight: 900, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}22` }}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// Pill numérica para las columnas Apartados / Liquidados. Atenuada en 0.
function CountPill({ value, color }: { value: number; color: string }) {
  const active = value > 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 32, padding: "3px 10px", borderRadius: 8,
      fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums",
      color: active ? color : TM,
      background: active ? `${color}14` : "transparent",
      border: `1px solid ${active ? `${color}33` : "transparent"}`,
    }}>
      {value}
    </span>
  );
}

// ─── Menú de acciones (Radix dropdown) ─────────────────────────────────────────
// Reemplaza la fila de 3-4 botones por un solo dropdown accesible (teclado +
// portal a body para que el overflow de la tabla no lo recorte). Estilos glass
// con los tokens --td-* del proyecto para que combine con el panel.
const MENU_CONTENT_STYLE: React.CSSProperties = {
  minWidth: 190, padding: 6, borderRadius: 14, zIndex: 9999,
  background: "var(--td-popup-bg)",
  border: "1px solid var(--td-panel-border)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
};
const MENU_SEP_STYLE: React.CSSProperties = { height: 1, background: "var(--td-panel-border)", margin: "5px 4px" };

function MenuItem({ icon, label, color, highlight, disabled, onSelect }: {
  icon: React.ReactNode; label: string; color?: string; highlight?: boolean; disabled?: boolean; onSelect?: () => void;
}) {
  const fg = color ?? TS;
  const setHover = (el: HTMLElement, on: boolean) => {
    if (disabled || highlight) return;
    el.style.background = on ? "var(--td-card-bg)" : "transparent";
  };
  return (
    <DropdownMenu.Item
      disabled={!!disabled}
      onSelect={() => onSelect?.()}
      style={{
        display: "flex", alignItems: "center", gap: 9,
        padding: "8px 10px", borderRadius: 9, fontSize: 12, fontWeight: 800,
        color: highlight ? "#000" : fg,
        background: highlight ? (color ?? TS) : "transparent",
        border: highlight ? `1px solid ${color ?? TS}` : "1px solid transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1, outline: "none", userSelect: "none",
      }}
      onMouseEnter={e => setHover(e.currentTarget, true)}
      onMouseLeave={e => setHover(e.currentTarget, false)}
      onFocus={e => setHover(e.currentTarget, true)}
      onBlur={e => setHover(e.currentTarget, false)}
    >
      {icon}{label}
    </DropdownMenu.Item>
  );
}

function CatalogActionsMenu({ catalog: c, isBusy, onEdit, onConvert, onHistory, onTransition }: {
  catalog: PreSaleCatalog; isBusy: boolean;
  onEdit: () => void; onConvert: () => void; onHistory: () => void;
  onTransition: (to: PreSaleCatalogStatus) => void;
}) {
  const isComplete = (c.sold_count ?? 0) > 0 && (c.sold_count ?? 0) === (c.delivered_count ?? 0);
  const nextOpts   = (NEXT_STATUSES[c.status] ?? []).filter(o => !o.onlyWhenComplete || isComplete);
  const hasSales   = (c.sold_count ?? 0) > 0;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          disabled={isBusy}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9,
            fontSize: 11, fontWeight: 800, cursor: isBusy ? "not-allowed" : "pointer",
            border: "1px solid var(--td-panel-border)", background: "var(--td-card-bg)", color: TS,
            opacity: isBusy ? 0.5 : 1,
          }}
        >
          {isBusy ? <Loader2 size={12} className="animate-spin" /> : <MoreHorizontal size={13} />}
          Acciones
          <ChevronDown size={11} style={{ opacity: 0.6 }} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} style={MENU_CONTENT_STYLE}>
          <MenuItem icon={<Pencil size={13} />} label="Editar" onSelect={onEdit} />
          {c.product === null ? (
            <MenuItem icon={<Boxes size={13} />} label="Crear producto" color="#818CF8" onSelect={onConvert} />
          ) : (
            <MenuItem icon={<Boxes size={13} />} label="En inventario" color="#22C55E" disabled />
          )}
          {(nextOpts.length > 0 || hasSales) && <DropdownMenu.Separator style={MENU_SEP_STYLE} />}
          {nextOpts.map(opt => (
            <MenuItem
              key={opt.to}
              icon={STATUS_CFG[opt.to].icon}
              label={opt.label}
              color={STATUS_CFG[opt.to].color}
              highlight={opt.highlight ?? false}
              onSelect={() => onTransition(opt.to)}
            />
          ))}
          {hasSales && (
            <MenuItem icon={<Star size={13} />} label="Ver ventas" color="#A78BFA" onSelect={onHistory} />
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ConfirmModal({ title, description, actionLabel, actionColor, storageKey, onConfirm, onCancel }: {
  title: string; description: string; actionLabel: string; actionColor: string; storageKey: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  const [dontShow, setDontShow] = useState(false);
  const confirm = () => { if (dontShow) localStorage.setItem(`td_confirm_skip_${storageKey}`, "1"); onConfirm(); };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}>
      <div style={{ ...GLASS, borderRadius: 22, padding: 28, width: 380, maxWidth: "92vw" }}>
        <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: `${actionColor}18`, border: `1px solid ${actionColor}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <AlertTriangle size={18} color={actionColor} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: TP }}>{title}</p>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: TS, lineHeight: 1.55 }}>{description}</p>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: TM, marginBottom: 22, userSelect: "none" }}>
          <input type="checkbox" checked={dontShow} onChange={e => setDontShow(e.target.checked)} style={{ accentColor: RED, cursor: "pointer" }} />
          No mostrar de nuevo
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "8px 18px", borderRadius: 10, border: "1px solid var(--td-panel-border)", background: "transparent", color: TS, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>No, regresar</button>
          <button onClick={confirm}  style={{ padding: "8px 20px", borderRadius: 10, border: `1px solid ${actionColor}66`, background: actionColor, color: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>{actionLabel}</button>
        </div>
      </div>
    </div>
  );
}

function CompletedBlockModal({ catalog, onClose }: { catalog: PreSaleCatalog; onClose: () => void }) {
  const count = catalog.delivered_count ?? catalog.sold_count ?? 0;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}>
      <div style={{ ...GLASS, borderRadius: 22, padding: 28, width: 360, maxWidth: "92vw", textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <CheckCircle2 size={26} color="#22C55E" />
        </div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: TP }}>Todas las unidades ya fueron entregadas</p>
        <p style={{ margin: "8px 0 22px", fontSize: 12, color: TS, lineHeight: 1.55 }}>
          <strong style={{ color: TP }}>"{catalog.product_name}"</strong> tiene {count}/{catalog.preorder_limit ?? count} unidades entregadas.
          En lugar de cancelar, usa <strong style={{ color: "#A78BFA" }}>★ Completar ciclo</strong> para cerrar correctamente esta preventa.
        </p>
        <button onClick={onClose} style={{ padding: "9px 28px", borderRadius: 10, border: "1px solid rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.12)", color: "#22C55E", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>Entendido</button>
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────
export function PreSaleCatalogsPanel({ restrictedStoreId = null }: { restrictedStoreId?: number | null }) {
  const queryClient = useQueryClient();
  // Polling casi-live 20s (solo con la ventana enfocada) — el panel mostraba
  // stock/apartados viejos tras cancelar/vender en Caja, sobre todo multi-ventana
  // (QA 2026-06-15). Mismo patrón que Caja y Ventas.
  const catalogsQuery = usePreSaleCatalogsQuery({ per_page: 200 }, { refetchIntervalMs: 20_000 });
  const catalogs: PreSaleCatalog[] = catalogsQuery.data?.data ?? [];
  const loading = catalogsQuery.isPending;
  // Refetch en background con data en pantalla (los contadores vendidos /
  // reservados pueden estar actualizándose) — se señala sin tapar la tabla.
  const isRefreshing = catalogsQuery.isFetching && !loading;
  const invalidateCatalogs = () => queryClient.invalidateQueries({ queryKey: queryKeys.preSaleCatalogs.all });
  const [showNew, setShowNew]     = useState(false);
  const [editCatalog, setEditCatalog]       = useState<PreSaleCatalog | null>(null);
  const [convertCatalog, setConvertCatalog] = useState<PreSaleCatalog | null>(null);
  const [historyCatalog, setHistoryCatalog] = useState<PreSaleCatalog | null>(null);
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState<PreSaleCatalogStatus | "all">("all");
  const [sorting, setSorting]     = useState<SortingState>([]);
  const [transitioning, setTrans] = useState<number | null>(null);
  const [confirmPending, setConfirmPending] = useState<{ catalog: PreSaleCatalog; to: PreSaleCatalogStatus } | null>(null);
  const [blockedCatalog, setBlockedCatalog] = useState<PreSaleCatalog | null>(null);

  useEffect(() => {
    if (catalogsQuery.error) toast.error("Error al cargar catálogos");
  }, [catalogsQuery.error]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return catalogs.filter(c => {
      const matchStatus = statusFilter === "all" || c.status === statusFilter;
      const matchSearch = !q || c.product_name.toLowerCase().includes(q) || c.category?.name.toLowerCase().includes(q) || c.supplier?.name.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [catalogs, search, statusFilter]);

  const requestTransition = (catalog: PreSaleCatalog, to: PreSaleCatalogStatus) => {
    if (to === "cancelled" && (catalog.sold_count ?? 0) > 0 && (catalog.sold_count ?? 0) === (catalog.delivered_count ?? 0)) {
      setBlockedCatalog(catalog); return;
    }
    const info = ACTION_INFO[to];
    if (info && localStorage.getItem(`td_confirm_skip_${info.key}`) !== "1") {
      setConfirmPending({ catalog, to });
    } else {
      void handleTransition(catalog, to);
    }
  };

  const handleTransition = async (catalog: PreSaleCatalog, to: PreSaleCatalogStatus) => {
    setTrans(catalog.id);
    try {
      await updatePreSaleCatalogStatus(catalog.id, { status: to });
      void invalidateCatalogs();
      toast.success(`"${catalog.product_name}" → ${STATUS_CFG[to].label}`);
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? "Error al actualizar");
    } finally {
      setTrans(null);
    }
  };

  const counts = useMemo(() => ({
    all:       catalogs.length,
    draft:     catalogs.filter(c => c.status === "draft").length,
    published: catalogs.filter(c => c.status === "published").length,
    closed:    catalogs.filter(c => c.status === "closed").length,
  }), [catalogs]);

  // Stock vendible por tienda. tope = store_limits.limit_qty (NO baja, es el
  // máximo). disponible = tope − reservados (apartados pending/ready) — esto es
  // lo que baja al vender, idéntico a Caja (PreSaleAvailableCatalogsPanel).
  // Gerente → su tienda; admin → suma entre tiendas. null = sin asignar.
  const stockInfo = (c: PreSaleCatalog): { limit: number; available: number } | null => {
    const limits = c.store_limits ?? [];
    if (limits.length === 0) return null;
    const reservedByStore = c.reserved_by_store ?? {};
    if (restrictedStoreId != null) {
      const sl = limits.find(x => x.store_id === restrictedStoreId);
      if (!sl) return null;
      const reserved = reservedByStore[String(restrictedStoreId)] ?? 0;
      return { limit: sl.limit_qty, available: Math.max(0, sl.limit_qty - reserved) };
    }
    const limit    = limits.reduce((s, x) => s + x.limit_qty, 0);
    const reserved = Object.values(reservedByStore).reduce((s, n) => s + n, 0);
    return { limit, available: Math.max(0, limit - reserved) };
  };

  // Apartados (pending/ready). Gerente → SOLO su tienda (reserved_by_store);
  // admin → total entre tiendas. Antes el gerente veía el global (p.ej. 27 = suma
  // de las 3 tiendas) cuando su tienda solo tenía 1 apartado.
  const reservedForRow = (c: PreSaleCatalog): number => {
    if (restrictedStoreId != null) return c.reserved_by_store?.[String(restrictedStoreId)] ?? 0;
    return c.reserved_count ?? Math.max(0, (c.sold_count ?? 0) - (c.delivered_count ?? 0));
  };

  // Liquidados (entregados). Gerente → SOLO su tienda (delivered_by_store);
  // admin → total. Sin delivered_by_store cae al global (compat).
  const deliveredForRow = (c: PreSaleCatalog): number => {
    if (restrictedStoreId != null) return c.delivered_by_store?.[String(restrictedStoreId)] ?? 0;
    return c.delivered_count ?? 0;
  };

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<PreSaleCatalog>[]>(() => {
    const cols: ColumnDef<PreSaleCatalog>[] = [
    {
      id: "product",
      header: "Producto",
      accessorFn: r => r.product_name,
      meta: { tdStyle: { padding: "12px 14px" } },
      cell: ({ row: { original: c } }: CellContext<PreSaleCatalog, unknown>) => {
        const imgSrc = c.image_url ?? (c.image_path ? storageUrl(c.image_path) : null);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {imgSrc && (
              <img
                src={imgSrc}
                alt={c.product_name}
                loading="lazy"
                decoding="async"
                style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: "1px solid rgba(255,255,255,0.08)" }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: TP }}>{c.product_name}</div>
              <div style={{ fontSize: 9, color: TM, marginTop: 2 }}>#{String(c.id).padStart(5, "0")}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: "category",
      header: "Categoría / Proveedor",
      accessorFn: r => r.category?.name ?? "",
      meta: { tdStyle: { padding: "12px 14px" } },
      cell: ({ row: { original: c } }: CellContext<PreSaleCatalog, unknown>) => (
        <>
          <div style={{ fontSize: 11, color: TS }}>{c.category?.name ?? "—"}</div>
          <div style={{ fontSize: 10, color: TM }}>{c.supplier?.name ?? "Sin proveedor"}</div>
        </>
      ),
    },
    {
      id: "price",
      header: "Anticipo · Precio",
      accessorFn: r => r.advance_payment ?? 0,
      meta: { tdStyle: { padding: "12px 14px" } },
      cell: ({ row: { original: c } }: CellContext<PreSaleCatalog, unknown>) => (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, color: TP }}>{fmt(c.advance_payment)}</div>
          <div style={{ fontSize: 10, color: TM }}>Precio: {fmt(c.price_1)}</div>
        </>
      ),
    },
    {
      id: "limit",
      header: "Límite de unidades",
      // null = sin límite → al final del orden ascendente.
      accessorFn: r => r.preorder_limit ?? Number.MAX_SAFE_INTEGER,
      meta: { tdStyle: { padding: "12px 14px", textAlign: "center" as const } },
      cell: ({ row: { original: c } }: CellContext<PreSaleCatalog, unknown>) => (
        c.preorder_limit != null ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: TP, fontVariantNumeric: "tabular-nums" }}>{c.preorder_limit}</span>
        ) : (
          <span style={{ fontSize: 10, color: TM }}>Sin límite</span>
        )
      ),
    },
    {
      id: "stock",
      header: () => (
        <>
          <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: TM }}>Unidades</div>
          <div style={{ fontSize: 7, fontWeight: 700, color: TM, opacity: 0.6, marginTop: 1, letterSpacing: "0.06em" }}>disponible · tope</div>
        </>
      ),
      // -1 = sin asignar → al fondo del orden ascendente.
      accessorFn: r => stockInfo(r)?.available ?? -1,
      meta: { tdStyle: { padding: "12px 14px", textAlign: "center" as const } },
      cell: ({ row: { original: c } }: CellContext<PreSaleCatalog, unknown>) => {
        const info = stockInfo(c);
        if (info == null) {
          return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 8, fontSize: 10, fontWeight: 800, color: "#DC2626", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)" }}>
              <AlertTriangle size={9} />Sin asignar
            </span>
          );
        }
        const out = info.available <= 0;
        return (
          <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: out ? "#DC2626" : "#3B82F6" }}>{info.available}</span>
            <span style={{ color: TM, fontWeight: 500 }}> / {info.limit}</span>
          </span>
        );
      },
    },
    {
      id: "reserved",
      header: "Apartados",
      // Apartados reales = folios pending/ready (solo anticipo, sin liquidar).
      // Por tienda para el gerente (ver reservedForRow).
      accessorFn: r => reservedForRow(r),
      meta: { tdStyle: { padding: "12px 14px", textAlign: "center" as const } },
      cell: ({ row: { original: c } }: CellContext<PreSaleCatalog, unknown>) => (
        <CountPill value={reservedForRow(c)} color="#F59E0B" />
      ),
    },
    {
      id: "delivered",
      header: "Liquidados",
      accessorFn: r => deliveredForRow(r),
      meta: { tdStyle: { padding: "12px 14px", textAlign: "center" as const } },
      cell: ({ row: { original: c } }: CellContext<PreSaleCatalog, unknown>) => (
        <CountPill value={deliveredForRow(c)} color="#22C55E" />
      ),
    },
    {
      id: "status",
      header: "Status",
      accessorFn: r => r.status,
      meta: { tdStyle: { padding: "12px 14px" } },
      cell: ({ row: { original: c } }: CellContext<PreSaleCatalog, unknown>) => <StatusBadge status={c.status} />,
    },
    {
      id: "actions",
      header: "Acciones",
      enableSorting: false,
      meta: { tdStyle: { padding: "12px 14px" } },
      cell: ({ row: { original: c } }: CellContext<PreSaleCatalog, unknown>) => {
        const isBusy = transitioning === c.id;

        if (c.status === "completed") {
          return (
            <button onClick={() => setHistoryCatalog(c)} style={{ padding: "6px 12px", borderRadius: 9, fontSize: 11, fontWeight: 800, cursor: "pointer", border: "1px solid rgba(167,139,250,0.35)", background: "rgba(167,139,250,0.08)", color: "#A78BFA", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Star size={11} />Ver historial
            </button>
          );
        }

        return (
          <CatalogActionsMenu
            catalog={c}
            isBusy={isBusy}
            onEdit={() => setEditCatalog(c)}
            onConvert={() => setConvertCatalog(c)}
            onHistory={() => setHistoryCatalog(c)}
            onTransition={to => requestTransition(c, to)}
          />
        );
      },
    },
    ];
    // Gerente: oculta "Límite de unidades" (preorder_limit es un campo GLOBAL, no
    // per-tienda → su límite real es el "tope" de Stock). Admin sí lo ve.
    return cols.filter(col => !(col.id === "limit" && restrictedStoreId != null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitioning, restrictedStoreId]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE } },
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount     = table.getPageCount();

  // Reset to page 0 when filter/search changes
  useEffect(() => { table.setPageIndex(0); }, [search, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Package size={18} color={RED} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ color: TP, fontSize: 16, fontWeight: 900, margin: 0 }}>Catálogos de Preventa</h2>
          <p style={{ color: TM, fontSize: 10, margin: 0, fontWeight: 600 }}>
            {counts.published} publicados · {counts.draft} borradores · {counts.closed} cerrados
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#CC2200,#FF4422)", color: "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 16px rgba(204,34,0,0.35)" }}
        >
          <Plus size={13} />Nuevo Catálogo
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={12} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: TM, pointerEvents: "none" }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, categoría, proveedor…"
            style={{ width: "100%", padding: "8px 32px 8px 30px", borderRadius: 12, border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)", color: TP, fontSize: 11, fontWeight: 600, outline: "none", boxSizing: "border-box" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: TM, display: "flex" }}>
              <X size={12} />
            </button>
          )}
        </div>
        {(["all", "draft", "published", "arrived", "completed", "closed", "cancelled"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            style={{
              padding: "6px 12px", borderRadius: 10, fontSize: 10, fontWeight: 800, cursor: "pointer",
              border: `1px solid ${statusFilter === s ? (s === "all" ? "var(--td-panel-border)" : STATUS_CFG[s as PreSaleCatalogStatus].color) : "var(--td-panel-border)"}`,
              background: statusFilter === s ? (s === "all" ? "var(--td-card-bg)" : STATUS_CFG[s as PreSaleCatalogStatus].bg) : "transparent",
              color: statusFilter === s ? (s === "all" ? TS : STATUS_CFG[s as PreSaleCatalogStatus].color) : TM,
            }}
          >
            {s === "all" ? `Todos (${counts.all})` : STATUS_CFG[s as PreSaleCatalogStatus].label}
          </button>
        ))}
        {/* Señal de refetch en background — los contadores (vendidos/reservados)
            en pantalla pueden ser los anteriores hasta que termine. */}
        {isRefreshing && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 10, fontSize: 10, fontWeight: 800, background: "rgba(255,170,0,0.1)", border: "1px solid rgba(255,170,0,0.3)", color: "#FFAA00", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
            <Loader2 size={11} className="animate-spin" />
            Actualizando…
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <PreSalesSkeleton variant="cards" />
      ) : filtered.length === 0 ? (
        <div style={{ ...GLASS_MD, borderRadius: 16, padding: "32px 20px", textAlign: "center", color: TM, fontSize: 12 }}>
          Sin catálogos{search ? " con ese filtro" : ""}
        </div>
      ) : (
        <div style={{ ...GLASS, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ maxHeight: "calc(100vh - 360px)", overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} style={{ borderBottom: "1px solid var(--td-panel-border)", background: "var(--td-popup-bg)" }}>
                  {hg.headers.map(header => {
                    const canSort = header.column.getCanSort();
                    const sorted  = header.column.getIsSorted();
                    const isCenter = ["limit", "stock", "reserved", "delivered"].includes(header.column.id);
                    return (
                      <th
                        key={header.id}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        style={{
                          padding: "10px 14px",
                          fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: TM,
                          textAlign: isCenter ? "center" : "left",
                          cursor: canSort ? "pointer" : "default",
                          userSelect: "none",
                          whiteSpace: "nowrap",
                          background: "var(--td-popup-bg)",
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: isCenter ? "center" : "flex-start" }}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && <SortIcon dir={sorted} />}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, idx) => (
                <tr
                  key={row.id}
                  style={{ borderBottom: "1px solid var(--td-panel-border)", background: idx % 2 !== 0 ? "rgba(255,255,255,0.012)" : "transparent" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--td-panel-bg)")}
                  onMouseLeave={e => (e.currentTarget.style.background = idx % 2 !== 0 ? "rgba(255,255,255,0.012)" : "transparent")}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} style={cell.column.columnDef.meta?.tdStyle ?? { padding: "12px 14px" }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--td-panel-border)" }}>
              <span style={{ fontSize: 10, color: TM }}>{filtered.length} catálogo{filtered.length !== 1 ? "s" : ""}</span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--td-panel-border)", background: "transparent", color: !table.getCanPreviousPage() ? TM : TS, cursor: !table.getCanPreviousPage() ? "not-allowed" : "pointer" }}>
                  <ChevronLeft size={12} />
                </button>
                <span style={{ fontSize: 11, color: TS, padding: "4px 8px" }}>{pageIndex + 1} / {pageCount}</span>
                <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--td-panel-border)", background: "transparent", color: !table.getCanNextPage() ? TM : TS, cursor: !table.getCanNextPage() ? "not-allowed" : "pointer" }}>
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {confirmPending && (() => {
        const info  = ACTION_INFO[confirmPending.to];
        const color = STATUS_CFG[confirmPending.to].color;
        return info ? (
          <ConfirmModal
            key="confirm"
            title={info.title} description={info.description} actionLabel={info.actionLabel}
            actionColor={color} storageKey={info.key}
            onCancel={() => setConfirmPending(null)}
            onConfirm={() => { setConfirmPending(null); void handleTransition(confirmPending.catalog, confirmPending.to); }}
          />
        ) : null;
      })()}

      {blockedCatalog && (
        <CompletedBlockModal catalog={blockedCatalog} onClose={() => setBlockedCatalog(null)} />
      )}

      <AnimatePresence>
        {showNew && (
          <NewPreSaleCatalogModal
            restrictedStoreId={restrictedStoreId}
            onClose={() => setShowNew(false)}
            onSuccess={_catalog => { void invalidateCatalogs(); setShowNew(false); }}
          />
        )}
        {editCatalog && (
          <NewPreSaleCatalogModal
            catalog={editCatalog}
            restrictedStoreId={restrictedStoreId}
            onClose={() => setEditCatalog(null)}
            onSuccess={updated => {
              void invalidateCatalogs();
              setEditCatalog(null);
              toast.success(`"${updated.product_name}" actualizado`);
            }}
          />
        )}
        {historyCatalog && (
          <CatalogHistoryModal catalog={historyCatalog} onClose={() => setHistoryCatalog(null)} />
        )}
        {convertCatalog && (
          <CatalogToProductModal
            catalog={convertCatalog}
            onClose={() => setConvertCatalog(null)}
            onSuccess={_productId => {
              void invalidateCatalogs();
              setConvertCatalog(null);
              toast.success("Producto creado y vinculado al catálogo");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
