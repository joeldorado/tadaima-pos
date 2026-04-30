import { useState, useEffect } from "react";
import { getPreSaleOrders } from "@tadaima/api";
import type { PreSaleCatalog, PreSaleOrder, PreSaleOrderStatus } from "@tadaima/api";
import {
  X, Loader2, User, Calendar, CheckCircle2, Clock,
  PackageCheck, AlertTriangle, XCircle, Star, Package,
} from "lucide-react";

const GLASS: React.CSSProperties = {
  background: "var(--td-panel-bg)", backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  border: "1px solid var(--td-panel-border)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
};

const TP = "var(--td-text-hi)";
const TS = "var(--td-text-md)";
const TM = "var(--td-text-lo)";

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n ?? 0);

const STATUS_META: Record<PreSaleOrderStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  pending:   { label: "Pendiente",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  Icon: Clock },
  ready:     { label: "Listo",      color: "#34d399", bg: "rgba(52,211,153,0.12)",  Icon: PackageCheck },
  delivered: { label: "Entregado",  color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  Icon: CheckCircle2 },
  expired:   { label: "Vencido",    color: "#f87171", bg: "rgba(248,113,113,0.12)", Icon: AlertTriangle },
  cancelled: { label: "Cancelado",  color: "#9ca3af", bg: "rgba(156,163,175,0.12)", Icon: XCircle },
};

interface Props {
  catalog: PreSaleCatalog;
  onClose: () => void;
}

export function CatalogHistoryModal({ catalog, onClose }: Props) {
  const [orders, setOrders] = useState<PreSaleOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPreSaleOrders({ catalog_id: catalog.id, per_page: 200 })
      .then(res => setOrders(res.data))
      .finally(() => setLoading(false));
  }, [catalog.id]);

  const totalRecaudado = orders.reduce((s, o) => s + (o.paid_amount ?? 0), 0);
  const entregados = orders.filter(o => o.status === "delivered").length;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ ...GLASS, borderRadius: 22, width: "100%", maxWidth: 720, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--td-panel-border)", display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Star size={18} color="#A78BFA" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: TP }}>{catalog.product_name}</p>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: TM }}>#{String(catalog.id).padStart(5, "0")} · Historial de folios</p>
          </div>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: TM, display: "flex" }}>
            <X size={16} />
          </button>
        </div>

        {/* Stats */}
        {!loading && orders.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, borderBottom: "1px solid var(--td-panel-border)" }}>
            {[
              { label: "Folios", value: String(orders.length) },
              { label: "Entregados", value: String(entregados), color: "#60a5fa" },
              { label: "Unidades", value: String(orders.reduce((s, o) => s + (o.items?.reduce((si, i) => si + i.quantity, 0) ?? 0), 0)) },
              { label: "Total recaudado", value: fmt(totalRecaudado), color: "#34d399" },
            ].map(stat => (
              <div key={stat.label} style={{ padding: "12px 16px", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: stat.color ?? TP }}>{stat.value}</p>
                <p style={{ margin: "2px 0 0", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: TM }}>{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <Loader2 size={22} className="animate-spin" style={{ margin: "0 auto", color: TM }} />
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <Package size={32} style={{ margin: "0 auto 10px", color: TM, display: "block" }} />
              <p style={{ margin: 0, fontSize: 12, color: TM }}>Sin folios registrados</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--td-panel-border)", position: "sticky", top: 0, background: "var(--td-panel-bg)" }}>
                  {["Folio", "Cliente", "Cant.", "Total", "Pagado", "Saldo", "Estado", "Fecha"].map(h => (
                    <th key={h} style={{ padding: "9px 14px", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order, idx) => {
                  const meta = STATUS_META[order.status];
                  const Icon = meta.Icon;
                  const qty = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
                  const balance = order.balance ?? 0;
                  return (
                    <tr
                      key={order.id}
                      style={{ borderBottom: "1px solid var(--td-panel-border)", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)" }}
                    >
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 12, fontWeight: 900, color: TP }}>{order.code}</span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <User size={11} color={TM} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: TS, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {order.customer?.name ?? "—"}
                          </span>
                        </div>
                        {order.customer?.phone && (
                          <span style={{ fontSize: 10, color: TM, marginLeft: 17 }}>{order.customer.phone}</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: TP }}>{qty}</span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: TP }}>{fmt(order.total)}</span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#34d399" }}>{fmt(order.paid_amount)}</span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: balance > 0 ? "#fbbf24" : "#34d399" }}>
                          {balance > 0 ? fmt(balance) : "Liquidado"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, fontSize: 9, fontWeight: 900, color: meta.color, background: meta.bg, border: `1px solid ${meta.color}22`, whiteSpace: "nowrap" }}>
                          <Icon size={9} />{meta.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <Calendar size={10} color={TM} />
                          <span style={{ fontSize: 11, color: TM }}>
                            {new Date(order.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" })}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
