import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  getPreSaleCatalogs, updatePreSaleCatalogStatus,
} from "@tadaima/api";
import type { PreSaleCatalog, PreSaleCatalogStatus } from "@tadaima/api";
import {
  Package, Plus, Loader2, Search, X, ChevronLeft, ChevronRight,
  BookOpen, CheckCircle2, Archive, Ban, Pencil, Truck, Boxes, AlertTriangle, Star,
  ChevronsUpDown, ChevronUp, ChevronDown,
} from "lucide-react";
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
export function PreSaleCatalogsPanel() {
  const [catalogs, setCatalogs]   = useState<PreSaleCatalog[]>([]);
  const [loading, setLoading]     = useState(true);
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

  const load = () => {
    setLoading(true);
    getPreSaleCatalogs({ per_page: 200 })
      .then(res => setCatalogs(res.data))
      .catch(() => toast.error("Error al cargar catálogos"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

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
      const updated = await updatePreSaleCatalogStatus(catalog.id, { status: to });
      setCatalogs(prev => prev.map(c => c.id === updated.id ? updated : c));
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

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<PreSaleCatalog>[]>(() => [
    {
      id: "product",
      header: "Producto",
      accessorFn: r => r.product_name,
      meta: { tdStyle: { padding: "12px 14px" } },
      cell: ({ row: { original: c } }: CellContext<PreSaleCatalog, unknown>) => (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, color: TP }}>{c.product_name}</div>
          <div style={{ fontSize: 9, color: TM, marginTop: 2 }}>#{String(c.id).padStart(5, "0")}</div>
        </>
      ),
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
      header: "P1 / Anticipo",
      accessorFn: r => r.price_1 ?? 0,
      meta: { tdStyle: { padding: "12px 14px" } },
      cell: ({ row: { original: c } }: CellContext<PreSaleCatalog, unknown>) => (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, color: TP }}>{fmt(c.price_1)}</div>
          <div style={{ fontSize: 10, color: TM }}>Anticipo: {fmt(c.advance_payment)}</div>
        </>
      ),
    },
    {
      id: "progress",
      header: () => (
        <>
          <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: TM }}>Límite</div>
          <div style={{ fontSize: 7, fontWeight: 700, color: TM, opacity: 0.6, marginTop: 1, letterSpacing: "0.06em" }}>vendidos · entregados · límite</div>
        </>
      ),
      accessorFn: r => r.sold_count ?? 0,
      meta: { tdStyle: { padding: "12px 14px", textAlign: "center" as const } },
      cell: ({ row: { original: c } }: CellContext<PreSaleCatalog, unknown>) => (
        c.preorder_limit ? (
          <span style={{ fontSize: 12, fontWeight: 800, color: TP, fontVariantNumeric: "tabular-nums" }}>
            {c.sold_count ?? 0}
            <span style={{ color: TM, fontWeight: 500 }}> / </span>
            <span style={{ color: "#22C55E" }}>{c.delivered_count ?? 0}</span>
            <span style={{ color: TM, fontWeight: 500 }}> / {c.preorder_limit}</span>
          </span>
        ) : (
          <span style={{ fontSize: 10, color: TM }}>—</span>
        )
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
        const isComplete = (c.sold_count ?? 0) > 0 && (c.sold_count ?? 0) === (c.delivered_count ?? 0);
        const nextOpts   = (NEXT_STATUSES[c.status] ?? []).filter(o => !o.onlyWhenComplete || isComplete);
        const isBusy     = transitioning === c.id;

        if (c.status === "completed") {
          return (
            <button onClick={() => setHistoryCatalog(c)} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 10, fontWeight: 800, cursor: "pointer", border: "1px solid rgba(167,139,250,0.35)", background: "rgba(167,139,250,0.08)", color: "#A78BFA", display: "flex", alignItems: "center", gap: 5 }}>
              <Star size={9} />Ver historial
            </button>
          );
        }

        return (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setEditCatalog(c)} style={{ padding: "4px 10px", borderRadius: 8, fontSize: 10, fontWeight: 800, cursor: "pointer", border: "1px solid var(--td-panel-border)", background: "var(--td-card-bg)", color: TS, display: "flex", alignItems: "center", gap: 4 }}>
              <Pencil size={9} />Editar
            </button>

            {c.product === null ? (
              <button onClick={() => setConvertCatalog(c)} style={{ padding: "5px 12px", borderRadius: 8, fontSize: 10, fontWeight: 800, cursor: "pointer", border: "1px solid rgba(99,102,241,0.5)", background: "rgba(99,102,241,0.12)", color: "#818CF8", display: "flex", alignItems: "center", gap: 4, boxShadow: "0 0 10px rgba(99,102,241,0.2)" }}>
                <Boxes size={9} />Crear producto
              </button>
            ) : (
              <span title={c.product ? `Producto: ${c.product.name}` : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 10, fontWeight: 800, border: "1px solid rgba(34,197,94,0.25)", background: "rgba(34,197,94,0.08)", color: "#22C55E", cursor: "default" }}>
                <Boxes size={9} />En inventario
              </span>
            )}

            {nextOpts.map(opt => (
              <button
                key={opt.to}
                disabled={isBusy}
                onClick={() => requestTransition(c, opt.to)}
                style={{
                  padding: opt.highlight ? "5px 12px" : "4px 10px", borderRadius: 8, fontSize: 10, fontWeight: 800,
                  cursor: isBusy ? "not-allowed" : "pointer",
                  border: `1px solid ${STATUS_CFG[opt.to].color}${opt.highlight ? "99" : "44"}`,
                  background: opt.highlight ? STATUS_CFG[opt.to].color : STATUS_CFG[opt.to].bg,
                  color: opt.highlight ? "#000" : STATUS_CFG[opt.to].color,
                  opacity: isBusy ? 0.5 : 1,
                  display: "flex", alignItems: "center", gap: 4,
                  boxShadow: opt.highlight ? `0 0 12px ${STATUS_CFG[opt.to].color}55` : "none",
                }}
              >
                {isBusy ? <Loader2 size={9} className="animate-spin" /> : STATUS_CFG[opt.to].icon}
                {opt.label}
              </button>
            ))}

            {(c.sold_count ?? 0) > 0 && (
              <button onClick={() => setHistoryCatalog(c)} style={{ padding: "4px 10px", borderRadius: 8, fontSize: 10, fontWeight: 800, cursor: "pointer", border: "1px solid rgba(167,139,250,0.35)", background: "rgba(167,139,250,0.08)", color: "#A78BFA", display: "flex", alignItems: "center", gap: 5 }}>
                <Star size={9} />Ventas
              </button>
            )}

            {nextOpts.length === 0 && (c.sold_count ?? 0) === 0 && (
              <span style={{ fontSize: 10, color: TM }}>—</span>
            )}
          </div>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [transitioning]);

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
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: TM }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...GLASS_MD, borderRadius: 16, padding: "32px 20px", textAlign: "center", color: TM, fontSize: 12 }}>
          Sin catálogos{search ? " con ese filtro" : ""}
        </div>
      ) : (
        <div style={{ ...GLASS, borderRadius: 18, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} style={{ borderBottom: "1px solid var(--td-panel-border)" }}>
                  {hg.headers.map(header => {
                    const canSort = header.column.getCanSort();
                    const sorted  = header.column.getIsSorted();
                    const isCenter = header.column.id === "progress";
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
            onClose={() => setShowNew(false)}
            onSuccess={catalog => { setCatalogs(prev => [catalog, ...prev]); setShowNew(false); }}
          />
        )}
        {editCatalog && (
          <NewPreSaleCatalogModal
            catalog={editCatalog}
            onClose={() => setEditCatalog(null)}
            onSuccess={updated => {
              setCatalogs(prev => prev.map(c => c.id === updated.id ? updated : c));
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
            onSuccess={productId => {
              setCatalogs(prev => prev.map(c =>
                c.id === convertCatalog.id ? { ...c, product: { id: productId, name: c.product_name } } : c
              ));
              setConvertCatalog(null);
              toast.success("Producto creado y vinculado al catálogo");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
