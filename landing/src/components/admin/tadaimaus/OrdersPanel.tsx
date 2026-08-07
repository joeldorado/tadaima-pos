import { Fragment, useState } from "react";
import type { CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, Mail, Phone, RefreshCw,
} from "lucide-react";
import { listUsOrders, updateUsOrderStatus } from "@tadaima/api";
import type { UsOrder, UsOrderStatus } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";
import { errMsg, fmtUsd } from "./usFormat";

const STATUS_META: Record<UsOrderStatus, { label: string; color: string; bg: string }> = {
  new:       { label: "Nuevo",      color: "#FF8A80", bg: "rgba(224,34,26,0.14)" },
  contacted: { label: "Contactado", color: "#fbbf24", bg: "rgba(245,158,11,0.14)" },
  completed: { label: "Completado", color: "#34D399", bg: "rgba(16,185,129,0.14)" },
  cancelled: { label: "Cancelado",  color: "#9CA3AF", bg: "rgba(156,163,175,0.14)" },
};

const STATUS_ORDER: UsOrderStatus[] = ["new", "contacted", "completed", "cancelled"];

const FILTER_CHIPS: { value: UsOrderStatus | ""; label: string }[] = [
  { value: "",          label: "Todos" },
  { value: "new",       label: "Nuevos" },
  { value: "contacted", label: "Contactados" },
  { value: "completed", label: "Completados" },
  { value: "cancelled", label: "Cancelados" },
];

const selectStyle: CSSProperties = {
  background: "var(--td-input-bg)",
  border: "1px solid var(--td-input-border)",
  borderRadius: 8,
  color: "var(--td-input-text)",
  outline: "none",
  padding: "5px 8px",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
};

const pageBtnStyle: CSSProperties = {
  background: "var(--td-card-bg)",
  border: "1px solid var(--td-card-border)",
  borderRadius: 8,
  padding: "6px 8px",
  cursor: "pointer",
  color: "var(--td-text-md)",
};

/**
 * TadaimaUS · Pedidos — pedidos dummy de la tienda US (sin cobro online):
 * folio US-XXXXX, datos de contacto con mailto:/tel:, total USD, badge de
 * status, filtro por chips, fila expandible con los items y selector de
 * status (confirmación al cancelar). Cambiar status refresca el badge del aside.
 */
export function OrdersPanel() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<UsOrderStatus | "">("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);

  const params = { ...(status ? { status } : {}), page };
  const ordersQuery = useQuery({
    queryKey: queryKeys.usStore.orders(params),
    queryFn: () => listUsOrders(params),
    retry: 1,
  });
  const orders = ordersQuery.data?.data ?? [];
  const pagination = ordersQuery.data?.pagination;

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: number; next: UsOrderStatus }) => updateUsOrderStatus(id, next),
    onSuccess: (order) => {
      toast.success(`${order.code}: ${STATUS_META[order.status]?.label ?? order.status}`);
      // Lista + badge del aside (new-count) — todo cuelga de usStore.all.
      void qc.invalidateQueries({ queryKey: queryKeys.usStore.all });
    },
    onError: (e) => toast.error(errMsg(e, "No se pudo cambiar el status")),
  });

  const changeStatus = (order: UsOrder, next: UsOrderStatus) => {
    if (next === order.status || statusMutation.isPending) return;
    if (next === "cancelled" && !window.confirm(`¿Cancelar el pedido ${order.code}? Esta acción no avisa al cliente.`)) {
      return;
    }
    statusMutation.mutate({ id: order.id, next });
  };

  return (
    <div className="space-y-4">
      {/* Filtro por status */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTER_CHIPS.map((chip) => {
          const active = status === chip.value;
          return (
            <button
              key={chip.value || "all"}
              onClick={() => { setStatus(chip.value); setPage(1); setExpanded(null); }}
              className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
              style={active
                ? { background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.35)", color: "#FF8A80" }
                : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
        {ordersQuery.isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={18} className="animate-spin" style={{ color: "var(--td-text-lo)" }} />
          </div>
        ) : ordersQuery.isError ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <AlertTriangle size={24} color="#fbbf24" />
            <p className="text-xs font-bold text-center m-0" style={{ color: "var(--td-text-md)" }}>
              No se pudieron cargar los pedidos de la tienda US.
            </p>
            <button
              onClick={() => void ordersQuery.refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest cursor-pointer"
              style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-text-md)" }}
            >
              <RefreshCw size={11} />
              Reintentar
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 opacity-40">
            <Inbox size={26} />
            <p className="text-xs font-bold uppercase tracking-widest m-0">
              {status ? "Sin pedidos con este status" : "Aún no hay pedidos"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead style={{ background: "rgba(0,0,0,0.2)" }}>
                <tr className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                  <th className="text-left py-2 px-3 w-8"></th>
                  <th className="text-left py-2 px-3">Folio</th>
                  <th className="text-left py-2 px-3">Cliente</th>
                  <th className="text-left py-2 px-3">Contacto</th>
                  <th className="text-right py-2 px-3">Total USD</th>
                  <th className="text-left py-2 px-3">Fecha</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-left py-2 px-3">Cambiar</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const isOpen = expanded === order.id;
                  const meta = STATUS_META[order.status] ?? { label: order.status, color: "#aaa", bg: "transparent" };
                  const isSaving = statusMutation.isPending && statusMutation.variables?.id === order.id;
                  return (
                    <Fragment key={order.id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : order.id)}
                        className="border-t cursor-pointer hover:bg-white/[0.02]"
                        style={{ borderColor: "var(--td-divider)" }}
                      >
                        <td className="py-2 px-3">
                          <ChevronRight size={12} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", color: isOpen ? "#FF8A80" : "var(--td-text-lo)" }} />
                        </td>
                        <td className="py-2 px-3 font-black" style={{ color: "var(--td-text-hi)" }}>{order.code}</td>
                        <td className="py-2 px-3" style={{ color: "var(--td-text-md)" }}>{order.customer_name}</td>
                        <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col gap-0.5">
                            {order.customer_email && (
                              <a href={`mailto:${order.customer_email}`} className="inline-flex items-center gap-1 hover:underline" style={{ color: "#38BDF8" }}>
                                <Mail size={10} /> {order.customer_email}
                              </a>
                            )}
                            {order.customer_phone && (
                              <a href={`tel:${order.customer_phone}`} className="inline-flex items-center gap-1 hover:underline" style={{ color: "#38BDF8" }}>
                                <Phone size={10} /> {order.customer_phone}
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-black" style={{ color: "var(--td-text-hi)" }}>{fmtUsd(order.total_usd)}</td>
                        <td className="py-2 px-3" style={{ color: "var(--td-text-md)" }}>
                          {new Date(order.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-[9px] font-black uppercase tracking-wider rounded-full px-2 py-0.5" style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33` }}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1.5">
                            <select
                              value={order.status}
                              onChange={(e) => changeStatus(order, e.target.value as UsOrderStatus)}
                              disabled={isSaving}
                              style={selectStyle}
                              aria-label={`Cambiar status de ${order.code}`}
                            >
                              {STATUS_ORDER.map((s) => (
                                <option key={s} value={s}>{STATUS_META[s].label}</option>
                              ))}
                            </select>
                            {isSaving && <Loader2 size={11} className="animate-spin" style={{ color: "var(--td-text-lo)" }} />}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr style={{ background: "rgba(0,0,0,0.18)" }}>
                          <td colSpan={8} className="px-6 py-3">
                            {order.notes && (
                              <p className="text-xs mb-3 m-0" style={{ color: "var(--td-text-md)" }}>
                                <span className="font-black uppercase tracking-widest text-[9px] mr-2" style={{ color: "var(--td-text-lo)" }}>Notas</span>
                                {order.notes}
                              </p>
                            )}
                            <p className="text-[9px] font-black uppercase tracking-widest mb-2 mt-0" style={{ color: "var(--td-text-lo)" }}>
                              Items del pedido (precio congelado)
                            </p>
                            <div className="rounded-xl overflow-hidden" style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-divider)" }}>
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr style={{ color: "var(--td-text-lo)" }}>
                                    <th className="text-left py-1.5 px-3 text-[9px] font-black uppercase tracking-widest">Producto</th>
                                    <th className="text-right py-1.5 px-3 text-[9px] font-black uppercase tracking-widest">Qty</th>
                                    <th className="text-right py-1.5 px-3 text-[9px] font-black uppercase tracking-widest">Precio USD</th>
                                    <th className="text-right py-1.5 px-3 text-[9px] font-black uppercase tracking-widest">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(order.items ?? []).map((item, idx) => (
                                    <tr key={idx} className="border-t" style={{ borderColor: "var(--td-divider)" }}>
                                      <td className="py-1.5 px-3" style={{ color: "var(--td-text-hi)" }}>{item.name}</td>
                                      <td className="py-1.5 px-3 text-right" style={{ color: "var(--td-text-md)" }}>{item.quantity}</td>
                                      <td className="py-1.5 px-3 text-right" style={{ color: "var(--td-text-md)" }}>{fmtUsd(item.unit_price_usd)}</td>
                                      <td className="py-1.5 px-3 text-right font-black" style={{ color: "var(--td-text-hi)" }}>
                                        {fmtUsd((Number(item.unit_price_usd) || 0) * item.quantity)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginación */}
      {pagination && pagination.last_page > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={pageBtnStyle}>
            <ChevronLeft size={12} />
          </button>
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
            {pagination.current_page} / {pagination.last_page}
          </span>
          <button onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))} disabled={page >= pagination.last_page} style={pageBtnStyle}>
            <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
