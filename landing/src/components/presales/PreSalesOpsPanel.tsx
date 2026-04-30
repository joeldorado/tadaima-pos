import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { getPreSales, expirePreSaleToInventory, deletePreSale } from "@tadaima/api";
import type { PreSale as ApiPreSale } from "@tadaima/api";
import { useAuth } from "@tadaima/auth";
import { useActiveStore } from "@/contexts/StoreContext";
import { ArrivalModal } from "./ArrivalModal";
import { ProductFormModal } from "./ProductFormModal";
import { NewPreSaleModal } from "./NewPreSaleModal";
import { EditPreSaleModal } from "./EditPreSaleModal";
import { AdminStoreFilter } from "./AdminStoreFilter";
import {
  Package, Plus, Loader2, ArrowLeftRight, ClipboardList,
  Pencil, Trash2, Search, ChevronLeft, ChevronRight, X, AlertTriangle, Users,
} from "lucide-react";

const GLASS_MD: React.CSSProperties = {
  background: "var(--td-card-bg)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid var(--td-card-border)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
};
const GLASS: React.CSSProperties = {
  background: "var(--td-panel-bg)",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  border: "1px solid var(--td-panel-border)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)",
};
const RED   = "var(--td-red)";
const RED_G = "var(--td-red-g)";
const TP    = "var(--td-text-hi)";
const TS    = "var(--td-text-md)";
const TM    = "var(--td-text-lo)";
const PAGE_SIZE = 10;

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n || 0);

function Btn({ onClick, children, variant = "ghost", disabled = false, style = {} }: {
  onClick?: () => void; children: React.ReactNode;
  variant?: "red" | "ghost" | "outline" | "danger"; disabled?: boolean; style?: React.CSSProperties;
}) {
  const styles: Record<string, React.CSSProperties> = {
    red:     { background: RED_G, color: "#fff", border: "1px solid rgba(255,80,50,0.3)", borderRadius: 10, padding: "6px 14px", fontSize: 11, fontWeight: 900, cursor: "pointer", opacity: disabled ? 0.4 : 1 },
    ghost:   { background: "var(--td-panel-bg)", color: TS, border: "1px solid var(--td-panel-border)", borderRadius: 10, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
    outline: { background: "transparent", color: TS, border: "1px solid var(--td-input-border)", borderRadius: 10, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
    danger:  { background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: disabled ? 0.4 : 1 },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...styles[variant], ...style }}>{children}</button>;
}

// ── Delete confirmation modal ─────────────────────────────────────────────────
function DeleteConfirmModal({ preSale, onConfirm, onCancel, loading }: {
  preSale: ApiPreSale;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div style={{ position: "relative", background: "var(--td-panel-bg)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 24, padding: "28px 28px 24px", width: "100%", maxWidth: 420, boxShadow: "0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(239,68,68,0.1)" }}>
        {/* Icon */}
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <AlertTriangle size={24} color="#EF4444" />
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 900, color: TP, margin: "0 0 6px" }}>
          Eliminar preventa
        </h3>
        <p style={{ fontSize: 13, fontWeight: 700, color: TS, margin: "0 0 16px", fontFamily: "monospace" }}>
          {preSale.product_name}
          <span style={{ fontSize: 10, color: TM, marginLeft: 8, fontWeight: 600 }}>{preSale.code}</span>
        </p>

        {/* Warning list */}
        <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 14, padding: "12px 14px", marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: "#EF4444", margin: "0 0 8px" }}>
            Esta acción eliminará permanentemente:
          </p>
          {[
            "Todos los ítems de la preventa",
            "Todos los pagos / anticipos registrados",
            "El historial de movimientos (logs)",
            "Los pagos asociados en caja",
            "Cualquier vínculo con clientes",
          ].map(line => (
            <div key={line} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#EF4444", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: TS, fontWeight: 600 }}>{line}</span>
            </div>
          ))}
          <p style={{ fontSize: 10, color: TM, margin: "10px 0 0", fontWeight: 600 }}>
            No se puede deshacer.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: "11px 0", borderRadius: 14, border: "1px solid var(--td-panel-border)", background: "transparent", color: TS, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{ flex: 1, padding: "11px 0", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#DC2626,#EF4444)", color: "#fff", fontSize: 12, fontWeight: 900, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: loading ? 0.7 : 1, boxShadow: "0 4px 16px rgba(239,68,68,0.35)" }}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {loading ? "Eliminando…" : "Sí, eliminar todo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Smart table for active pre-sales ─────────────────────────────────────────
function ActiveTable({
  rows,
  onEdit,
  onArrival,
  onCreate,
  onDelete,
}: {
  rows: ApiPreSale[];
  onEdit: (ps: ApiPreSale) => void;
  onArrival: (ps: ApiPreSale) => void;
  onCreate: (ps: ApiPreSale) => void;
  onDelete: (id: number) => Promise<void>;
}) {
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState<"all" | "live" | "ready" | "paused">("all");
  const [page, setPage]           = useState(1);
  const [deletingId, setDeletingId]             = useState<number | null>(null);
  const [confirmTarget, setConfirmTarget]       = useState<ApiPreSale | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(ps => {
      const matchStatus = statusFilter === "all" || ps.status === statusFilter;
      const matchSearch = !q
        || ps.product_name.toLowerCase().includes(q)
        || ps.code?.toLowerCase().includes(q)
        || ps.supplier?.name.toLowerCase().includes(q)
        || String(ps.id).includes(q);
      return matchStatus && matchSearch;
    });
  }, [rows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const handleDelete = async (ps: ApiPreSale) => {
    setDeletingId(ps.id);
    try {
      await onDelete(ps.id);
      setConfirmTarget(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={12} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: TM, pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, código, proveedor…"
            style={{ width: "100%", padding: "8px 32px 8px 30px", borderRadius: 12, border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)", color: TP, fontSize: 11, fontWeight: 600, outline: "none", boxSizing: "border-box" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: TM, display: "flex" }}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Status filter pills */}
        {([
          { value: "all",    label: "Todas",    active: "var(--td-card-bg)",      border: "var(--td-panel-border)", color: TS },
          { value: "live",   label: "Abiertas", active: "rgba(34,197,94,0.1)",   border: "#22C55E",                color: "#22C55E" },
          { value: "ready",  label: "Listas",   active: "rgba(59,130,246,0.1)",  border: "#3B82F6",                color: "#3B82F6" },
          { value: "paused", label: "Pausadas", active: "rgba(245,158,11,0.1)",  border: "#F59E0B",                color: "#F59E0B" },
        ] as const).map(s => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            style={{ padding: "7px 14px", borderRadius: 99, fontSize: 10, fontWeight: 900, cursor: "pointer", border: "1px solid", transition: "all 0.15s",
              background: statusFilter === s.value ? s.active : "transparent",
              borderColor: statusFilter === s.value ? s.border : "var(--td-input-border)",
              color: statusFilter === s.value ? s.color : TM,
            }}
          >
            {s.label}
          </button>
        ))}

        <span style={{ fontSize: 10, color: TM, fontWeight: 700, whiteSpace: "nowrap" }}>
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div style={{ ...GLASS_MD, borderRadius: 16, overflow: "hidden" }}>
        {paginated.length === 0 ? (
          <div style={{ padding: "28px 20px", textAlign: "center", color: TM, fontSize: 12 }}>
            Sin resultados para "{search}"
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--td-card-border)" }}>
                {["#", "Producto", "Estado", "Apartados", "Precio A", "Anticipo", "Recaudado", "Plazo", "Acciones"].map(h => (
                  <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: TM, whiteSpace: "nowrap" as const }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((ps, i) => (
                <tr
                  key={ps.id}
                  style={{ borderBottom: i < paginated.length - 1 ? "1px solid var(--td-card-border)" : "none", transition: "background 0.12s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--td-panel-bg)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "10px 14px", fontSize: 10, fontWeight: 900, color: TM, fontFamily: "monospace", whiteSpace: "nowrap" as const }}>
                    #{String(ps.id).padStart(6, "0")}
                  </td>
                  <td style={{ padding: "10px 14px", maxWidth: 220 }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: TP, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{ps.product_name}</p>
                    {ps.supplier && <p style={{ fontSize: 9, color: TM, margin: "1px 0 0", fontWeight: 600 }}>{ps.supplier.name}</p>}
                  </td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" as const }}>
                    <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 9, fontWeight: 900,
                      background: ps.status === "ready" ? "rgba(59,130,246,0.1)" : ps.status === "paused" ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.08)",
                      color:      ps.status === "ready" ? "#3B82F6"              : ps.status === "paused" ? "#F59E0B"              : "#22C55E",
                    }}>
                      {ps.status === "ready" ? "Lista" : ps.status === "paused" ? "Pausada" : "Abierta"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" as const }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Users size={11} style={{ color: TM, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 900, color: (ps.payments?.length ?? 0) > 0 ? TP : TM }}>
                        {ps.payments?.length ?? 0}
                      </span>
                      {ps.reserved_quantity > 0 && (
                        <span style={{ fontSize: 9, color: TM, fontWeight: 600 }}>
                          /{ps.reserved_quantity} uds
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 800, color: TP, whiteSpace: "nowrap" as const }}>
                    {ps.price_1 != null ? fmt(ps.price_1) : <span style={{ color: TM }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700, color: TS, whiteSpace: "nowrap" as const }}>
                    {ps.advance_payment != null ? fmt(ps.advance_payment) : <span style={{ color: TM }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" as const }}>
                    {(ps.paid_amount ?? 0) > 0
                      ? <span style={{ fontSize: 12, fontWeight: 800, color: "#22C55E" }}>{fmt(ps.paid_amount ?? 0)}</span>
                      : <span style={{ fontSize: 11, color: TM }}>—</span>
                    }
                  </td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" as const }}>
                    {ps.pickup_deadline
                      ? (() => {
                          const d    = new Date(ps.pickup_deadline + "T00:00:00");
                          const now  = new Date(); now.setHours(0,0,0,0);
                          const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
                          const overdue = diff < 0;
                          const soon    = diff >= 0 && diff <= 3;
                          const color   = overdue ? "#EF4444" : soon ? "#F59E0B" : TS;
                          return (
                            <div>
                              <span style={{ fontSize: 11, fontWeight: 800, color }}>
                                {d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                              </span>
                              <span style={{ display: "block", fontSize: 9, fontWeight: 700, color: overdue ? "#EF4444" : soon ? "#F59E0B" : TM }}>
                                {overdue ? `Vencida ${Math.abs(diff)}d` : diff === 0 ? "Hoy" : `${diff}d`}
                              </span>
                            </div>
                          );
                        })()
                      : <span style={{ color: TM, fontSize: 11 }}>—</span>
                    }
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", alignItems: "center" }}>
                      <Btn variant="danger" onClick={() => setConfirmTarget(ps)} style={{ padding: "5px 8px", display: "flex", alignItems: "center" }}>
                        <Trash2 size={11} />
                      </Btn>
                      <Btn variant="outline" onClick={() => onEdit(ps)} style={{ padding: "5px 8px", display: "flex", alignItems: "center" }}>
                        <Pencil size={11} />
                      </Btn>
                      <Btn variant="ghost" onClick={() => onArrival(ps)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", fontSize: 10 }}>
                        <Package size={11} />Llegó
                      </Btn>
                      {ps.inventory_pushed && ps.product_id ? (
                        <Btn variant="outline" onClick={() => onCreate(ps)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", fontSize: 10, color: "#818cf8", borderColor: "rgba(99,102,241,0.35)" }}>
                          <Pencil size={11} />Editar Prod.
                        </Btn>
                      ) : !ps.inventory_pushed ? (
                        <Btn variant="red" onClick={() => onCreate(ps)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", fontSize: 10 }}>
                          <Plus size={11} />Alta
                        </Btn>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginator */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage === 1}
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--td-input-border)", background: "transparent", color: safePage === 1 ? TM : TS, cursor: safePage === 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: safePage === 1 ? 0.4 : 1 }}
          >
            <ChevronLeft size={14} />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              onClick={() => setPage(n)}
              style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid", fontSize: 11, fontWeight: 800, cursor: "pointer", transition: "all 0.12s",
                background: n === safePage ? RED_G : "transparent",
                borderColor: n === safePage ? "rgba(255,80,50,0.3)" : "var(--td-input-border)",
                color: n === safePage ? "#fff" : TM,
              }}
            >
              {n}
            </button>
          ))}

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--td-input-border)", background: "transparent", color: safePage === totalPages ? TM : TS, cursor: safePage === totalPages ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: safePage === totalPages ? 0.4 : 1 }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {confirmTarget && (
        <DeleteConfirmModal
          preSale={confirmTarget}
          loading={deletingId === confirmTarget.id}
          onConfirm={() => handleDelete(confirmTarget)}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function PreSalesOpsPanel() {
  const { user }                          = useAuth();
  const { stores }                        = useActiveStore();
  const isAdmin                           = user?.roles?.some(r => ["admin","super_admin","owner","dueño"].includes(r.toLowerCase())) ?? false;
  const [storeFilter, setStoreFilter]     = useState<number | "all">("all");

  const [preSales, setPreSales]           = useState<ApiPreSale[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showNew, setShowNew]             = useState(false);
  const [editTarget, setEditTarget]       = useState<ApiPreSale | null>(null);
  const [arrivalTarget, setArrivalTarget] = useState<ApiPreSale | null>(null);
  const [createTarget, setCreateTarget]   = useState<ApiPreSale | null>(null);
  const [expiringId, setExpiringId]       = useState<number | null>(null);

  // For non-admins use their assigned store automatically
  const effectiveStoreId: number | undefined = isAdmin
    ? (storeFilter === "all" ? undefined : storeFilter)
    : (user?.store_id ?? undefined);

  useEffect(() => {
    setLoading(true);
    getPreSales({ per_page: 200, store_id: effectiveStoreId })
      .then(res => setPreSales(res.data))
      .catch(() => toast.error("Error al cargar preventas"))
      .finally(() => setLoading(false));
  }, [effectiveStoreId]);

  const active  = preSales.filter(p => ["live", "ready", "paused"].includes(p.status));
  const expired = preSales.filter(p => p.status === "expired");

  const handleExpire = async (ps: ApiPreSale, warehouseId: number) => {
    setExpiringId(ps.id);
    try {
      const updated = await expirePreSaleToInventory(ps.id, { warehouse_id: warehouseId });
      setPreSales(prev => prev.map(p => p.id === updated.id ? updated : p));
      toast.success("Stock movido a inventario real");
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Error al expirar");
    } finally {
      setExpiringId(null);
    }
  };

  const handleDelete = async (id: number) => {
    const ps = preSales.find(p => p.id === id);
    try {
      await deletePreSale(id);
      setPreSales(prev => prev.filter(p => p.id !== id));
      toast.success(`"${ps?.product_name}" eliminada — todos los datos borrados`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "No se pudo eliminar la preventa");
      throw err;
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: TM }}>
        <Loader2 size={28} className="animate-spin" style={{ margin: "0 auto" }} />
      </div>
    );
  }

  return (
    <div>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ClipboardList size={18} color={RED} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ color: TP, fontSize: 16, fontWeight: 900, margin: 0 }}>Operaciones de Preventas</h2>
          <p style={{ color: TM, fontSize: 10, margin: 0, fontWeight: 600 }}>Marcar llegadas · Dar de alta · Expirar stock</p>
        </div>
        {isAdmin && stores.length > 1 && (
          <AdminStoreFilter value={storeFilter} onChange={setStoreFilter} />
        )}
        <Btn variant="red" onClick={() => setShowNew(true)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "8px 16px" }}>
          <Plus size={13} />Nueva Preventa
        </Btn>
      </div>

      {/* Activas / Listas */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: TM, marginBottom: 12 }}>
          Activas / Listas — {active.length} preventa{active.length !== 1 ? "s" : ""}
        </p>
        {active.length === 0 ? (
          <div style={{ ...GLASS_MD, borderRadius: 16, padding: "24px 20px", textAlign: "center", color: TM, fontSize: 12 }}>
            Sin preventas activas
          </div>
        ) : (
          <ActiveTable
            rows={active}
            onEdit={setEditTarget}
            onArrival={setArrivalTarget}
            onCreate={setCreateTarget}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* Vencidas */}
      {expired.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#8B5CF6", marginBottom: 12 }}>
            Vencidas — {expired.length} sin recoger
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {expired.map(ps => (
              <div key={ps.id} style={{ ...GLASS, borderRadius: 16, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: TM, fontFamily: "monospace" }}>
                      #{String(ps.id).padStart(6, "0")}
                    </span>
                    <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 9, fontWeight: 900, background: "rgba(139,92,246,0.1)", color: "#8B5CF6" }}>
                      Vencida
                    </span>
                  </div>
                  <p style={{ color: TP, fontWeight: 800, fontSize: 13, margin: 0 }}>{ps.product_name}</p>
                  <p style={{ color: TM, fontSize: 10, margin: "2px 0 0 0" }}>
                    {ps.customer?.name ?? "Sin cliente"} · Reservado: {ps.reserved_quantity} uds.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <Btn variant="outline" onClick={() => setEditTarget(ps)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 10px" }}>
                    <Pencil size={11} />
                  </Btn>
                  <Btn
                    variant="outline"
                    onClick={() => handleExpire(ps, 1)}
                    disabled={expiringId === ps.id}
                    style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}
                  >
                    {expiringId === ps.id ? <Loader2 size={12} className="animate-spin" /> : <ArrowLeftRight size={12} />}
                    Mover a inventario
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editTarget && (
        <EditPreSaleModal
          preSale={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={updated => {
            setPreSales(prev => prev.map(p => p.id === updated.id ? updated : p));
            setEditTarget(null);
          }}
        />
      )}
      {showNew && (
        <NewPreSaleModal
          onClose={() => setShowNew(false)}
          onSuccess={ps => {
            setPreSales(prev => [ps, ...prev]);
            setShowNew(false);
            toast.success(`Preventa ${ps.code} creada`);
          }}
        />
      )}
      {arrivalTarget && (
        <ArrivalModal
          preSale={arrivalTarget}
          onClose={() => setArrivalTarget(null)}
          onSuccess={updated => {
            setPreSales(prev => prev.map(p => p.id === updated.id ? updated : p));
            setArrivalTarget(null);
          }}
        />
      )}
      {createTarget && (
        <ProductFormModal
          preSale={createTarget}
          onClose={() => setCreateTarget(null)}
          onSuccess={(productId, updatedPreSale) => {
            setPreSales(prev => prev.map(p => {
              if (p.id !== createTarget.id) return p;
              return updatedPreSale
                ? updatedPreSale
                : { ...p, inventory_pushed: true, product_id: productId };
            }));
            setCreateTarget(null);
          }}
        />
      )}
    </div>
  );
}
