import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { getPreSaleCatalogs, getPreSaleOrders } from "@tadaima/api";
import type { PreSaleCatalog, PreSaleOrder } from "@tadaima/api";
import {
  Truck, ChevronDown, ChevronRight, Loader2,
  MessageCircle, Mail, Phone, CheckSquare, Square,
  Megaphone,
} from "lucide-react";

const GLASS: React.CSSProperties = {
  background: "var(--td-panel-bg)",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  border: "1px solid var(--td-panel-border)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)",
};
const CARD: React.CSSProperties = {
  background: "var(--td-card-bg)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid var(--td-card-border)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
};

const TP = "var(--td-text-hi)";
const TS = "var(--td-text-md)";
const TM = "var(--td-text-lo)";
const AMBER = "#F59E0B";

const fmt = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" });

function deadlineInfo(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  const color = days <= 0 ? "#EF4444" : days <= 2 ? "#F97316" : days <= 5 ? AMBER : "#22C55E";
  const label = days <= 0 ? "Venció" : days === 1 ? "Mañana" : `${days} días`;
  return { date: fmt.format(d), days, color, label };
}

function waMsg(customerName: string, folio: string, product: string, deadline: string | null) {
  const dlPart = deadline ? ` Tienes hasta el ${fmt.format(new Date(deadline))} para recogerlo.` : "";
  return encodeURIComponent(
    `Hola ${customerName} 👋, tu preventa *${folio}* de *${product}* ya llegó y está lista para recoger.${dlPart} ¡Te esperamos!`
  );
}

interface CatalogRowProps {
  catalog: PreSaleCatalog;
}

function CatalogRow({ catalog }: CatalogRowProps) {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<PreSaleOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [notified, setNotified] = useState<Set<number>>(new Set());

  const dl = deadlineInfo(catalog.pickup_deadline);

  const load = useCallback(async () => {
    if (orders.length > 0) return;
    setLoading(true);
    try {
      const res = await getPreSaleOrders({ catalog_id: catalog.id, per_page: 200 });
      setOrders(res.data.filter(o => o.status !== "cancelled"));
    } catch {
      toast.error("No se pudieron cargar los folios");
    } finally {
      setLoading(false);
    }
  }, [catalog.id, orders.length]);

  const toggle = () => {
    if (!open) void load();
    setOpen(v => !v);
  };

  const toggleNotified = (orderId: number) =>
    setNotified(prev => {
      const next = new Set(prev);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });

  const pending = orders.filter(o => o.status !== "delivered");
  const allNotified = pending.length > 0 && pending.every(o => notified.has(o.id));

  return (
    <div style={{ ...CARD, borderRadius: 16, overflow: "hidden" }}>
      {/* Header row */}
      <button
        onClick={toggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "14px 16px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <Truck size={14} style={{ color: AMBER, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: TP, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {catalog.product_name}
          </div>
          <div style={{ fontSize: 10, color: TM, marginTop: 2 }}>
            {catalog.reserved_count ?? 0} apartado{(catalog.reserved_count ?? 0) !== 1 ? "s" : ""}
            {catalog.supplier ? ` · ${catalog.supplier.name}` : ""}
          </div>
        </div>

        {dl && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: dl.color }}>{dl.date}</div>
            <div style={{ fontSize: 9, color: dl.color, fontWeight: 700 }}>{dl.label}</div>
          </div>
        )}

        {allNotified && (
          <span style={{ fontSize: 9, fontWeight: 900, padding: "2px 8px", borderRadius: 99, background: "rgba(34,197,94,0.1)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.2)", whiteSpace: "nowrap" }}>
            Todos notificados
          </span>
        )}

        {open ? <ChevronDown size={14} style={{ color: TM, flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: TM, flexShrink: 0 }} />}
      </button>

      {/* Expanded customer list */}
      {open && (
        <div style={{ borderTop: "1px solid var(--td-panel-border)", padding: "8px 12px 12px" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
              <Loader2 size={18} className="animate-spin" style={{ color: TM }} />
            </div>
          ) : orders.length === 0 ? (
            <p style={{ fontSize: 11, color: TM, textAlign: "center", padding: 16, margin: 0 }}>Sin folios registrados</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {orders.map(order => {
                const isNotified = notified.has(order.id);
                const cust = order.customer;
                const phone = cust?.phone?.replace(/\D/g, "") ?? "";
                const wa = phone
                  ? `https://wa.me/52${phone}?text=${waMsg(cust?.name ?? "", order.code, catalog.product_name, catalog.pickup_deadline)}`
                  : null;

                return (
                  <div
                    key={order.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", borderRadius: 10,
                      background: isNotified ? "rgba(34,197,94,0.04)" : "var(--td-panel-bg)",
                      border: `1px solid ${isNotified ? "rgba(34,197,94,0.2)" : "var(--td-panel-border)"}`,
                      transition: "all 0.15s",
                    }}
                  >
                    {/* Checkbox notificado — pendiente de wire-up al backend (sin persistencia hoy) */}
                    {/* <button
                      onClick={() => toggleNotified(order.id)}
                      title={isNotified ? "Marcar como no notificado" : "Marcar como notificado"}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}
                    >
                      {isNotified
                        ? <CheckSquare size={16} style={{ color: "#22C55E" }} />
                        : <Square size={16} style={{ color: TM }} />
                      }
                    </button> */}

                    {/* Info cliente */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: isNotified ? "#22C55E" : TP, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cust?.name ?? "Sin cliente"}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: TM }}>{order.code}</span>
                        {cust?.phone && (
                          <span style={{ fontSize: 9, color: TM, display: "flex", alignItems: "center", gap: 3 }}>
                            <Phone size={8} />{cust.phone}
                          </span>
                        )}
                        {cust?.email && (
                          <span style={{ fontSize: 9, color: TM, display: "flex", alignItems: "center", gap: 3 }}>
                            <Mail size={8} />{cust.email}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <span style={{
                      fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 99,
                      color: order.status === "delivered" ? "#22C55E" : order.status === "ready" ? AMBER : TS,
                      background: order.status === "delivered" ? "rgba(34,197,94,0.08)" : order.status === "ready" ? "rgba(245,158,11,0.08)" : "var(--td-card-bg)",
                      border: `1px solid ${order.status === "delivered" ? "rgba(34,197,94,0.2)" : order.status === "ready" ? "rgba(245,158,11,0.2)" : "var(--td-panel-border)"}`,
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {order.status === "delivered" ? "Entregado" : order.status === "ready" ? "Listo" : "Pendiente"}
                    </span>

                    {/* WhatsApp */}
                    {wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        title={`WhatsApp a ${cust?.name}`}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                          background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.25)",
                          color: "#25D366", textDecoration: "none",
                        }}
                      >
                        <MessageCircle size={14} />
                      </a>
                    ) : (
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--td-card-bg)", border: "1px solid var(--td-panel-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Phone size={12} style={{ color: TM }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PreSaleDifusionPanel() {
  const [catalogs, setCatalogs] = useState<PreSaleCatalog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPreSaleCatalogs({ status: "arrived", per_page: 200 })
      .then(res => setCatalogs(res.data))
      .catch(() => toast.error("Error al cargar catálogos"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ ...GLASS, borderRadius: 24, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Megaphone size={18} style={{ color: AMBER }} />
        <div>
          <span style={{ fontSize: 14, fontWeight: 900, color: TP }}>Difusión — Notificar clientes</span>
          <p style={{ margin: 0, fontSize: 10, color: TM, marginTop: 2 }}>Catálogos llegados · Avisa a cada cliente que puede pasar por su preventa</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Loader2 size={24} className="animate-spin" style={{ color: TM }} />
        </div>
      ) : catalogs.length === 0 ? (
        <p style={{ fontSize: 12, color: TM, textAlign: "center", padding: 40, margin: 0 }}>
          No hay catálogos llegados pendientes de notificación
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {catalogs.map(cat => <CatalogRow key={cat.id} catalog={cat} />)}
        </div>
      )}
    </div>
  );
}
