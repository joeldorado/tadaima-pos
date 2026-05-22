import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { PreSaleOrder, PreSaleOrderStatus } from "@tadaima/api";
import { useAuth } from "@tadaima/auth";
import { useActiveStore } from "@/contexts/StoreContext";
import { useQueryClient } from "@tanstack/react-query";
import { usePreSaleOrdersQuery } from "@/hooks/queries/usePreSales";
import { queryKeys } from "@/lib/queryKeys";
import {
  Search, Loader2, RefreshCw, ChevronLeft, ChevronRight,
  Package, User, Calendar, Banknote, Clock, CheckCircle2,
  XCircle, PackageCheck, AlertTriangle, AlertCircle,
} from "lucide-react";

const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n ?? 0);

const STATUS_META: Record<PreSaleOrderStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  pending:   { label: "Pendiente",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  Icon: Clock },
  ready:     { label: "Listo",      color: "#34d399", bg: "rgba(52,211,153,0.12)",  Icon: PackageCheck },
  delivered: { label: "Entregado",  color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  Icon: CheckCircle2 },
  expired:   { label: "Vencido",    color: "#f87171", bg: "rgba(248,113,113,0.12)", Icon: AlertTriangle },
  cancelled: { label: "Cancelado",  color: "#9ca3af", bg: "rgba(156,163,175,0.12)", Icon: XCircle },
};

const PAGE_SIZE = 15;

export function PreSaleOrdersPanel() {
  const { user } = useAuth();
  const { stores } = useActiveStore();
  const isAdmin = user?.roles?.includes("admin") || user?.roles?.includes("gerente");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PreSaleOrderStatus | "all">("all");
  const [storeFilter, setStoreFilter] = useState<number | "all">("all");
  const [page, setPage] = useState(1);

  const queryClient = useQueryClient();
  const params: Record<string, unknown> = { per_page: PAGE_SIZE, page };
  if (statusFilter !== "all") params.status = statusFilter;
  if (!isAdmin && user?.store_id) params.store_id = user.store_id;
  else if (isAdmin && storeFilter !== "all") params.store_id = storeFilter;
  if (search.trim()) params.code = search.trim();

  const ordersQuery = usePreSaleOrdersQuery(params as Parameters<typeof usePreSaleOrdersQuery>[0]);
  const orders: PreSaleOrder[] = ordersQuery.data?.data ?? [];
  const total = ordersQuery.data?.pagination.total ?? 0;
  const loading = ordersQuery.isPending;
  const fetchOrders = () => queryClient.invalidateQueries({ queryKey: queryKeys.preSaleOrders.all });

  useEffect(() => {
    if (ordersQuery.error) toast.error("No se pudieron cargar los folios");
  }, [ordersQuery.error]);

  const lastPage = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-5">

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Buscar folio…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="bg-white/[0.05] border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm font-bold text-white placeholder:text-white/25 outline-none focus:border-white/20 transition-all w-44"
          />
        </div>

        {/* Status filter */}
        <div className="flex gap-1 flex-wrap">
          {(["all", "pending", "ready", "delivered", "expired", "cancelled"] as const).map(s => {
            const meta = s !== "all" ? STATUS_META[s] : null;
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border"
                style={{
                  background: active ? (meta?.bg ?? "rgba(224,34,26,0.2)") : "rgba(255,255,255,0.04)",
                  color: active ? (meta?.color ?? "#E0221A") : "rgba(255,255,255,0.3)",
                  borderColor: active ? (meta?.color ?? "#E0221A") + "55" : "rgba(255,255,255,0.08)",
                }}
              >
                {s === "all" ? "Todos" : meta?.label}
              </button>
            );
          })}
        </div>

        {/* Store filter — admin only */}
        {isAdmin && stores.length > 1 && (
          <select
            value={storeFilter}
            onChange={e => { setStoreFilter(e.target.value === "all" ? "all" : Number(e.target.value)); setPage(1); }}
            className="bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none"
          >
            <option value="all">Todas las tiendas</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        <button
          onClick={() => void fetchOrders()}
          className="ml-auto p-2 rounded-xl bg-white/[0.04] border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all"
          title="Actualizar"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/[0.07] overflow-hidden" style={{ background: "var(--td-card-bg)" }}>
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <Loader2 size={20} className="animate-spin text-white/30" />
            <span className="text-sm text-white/30 font-bold">Cargando folios…</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Package size={36} className="text-white/15" />
            <p className="text-sm font-black text-white/25 uppercase tracking-widest">Sin folios</p>
            <p className="text-[11px] text-white/20">Los apartados de catálogo aparecerán aquí</p>
          </div>
        ) : (
          <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 360px)" }}>
          <table className="w-full text-left border-collapse">
            <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
              <tr className="border-b border-white/[0.06]" style={{ background: "var(--td-popup-bg)" }}>
                {["Folio", "Cliente", "Productos", "Total", "Anticipo", "Pendiente", "Estado", "Tienda", "Fecha"].map(h => (
                  <th key={h} className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-white/30" style={{ background: "var(--td-popup-bg)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((order, idx) => {
                const meta = STATUS_META[order.status];
                const Icon = meta.Icon;
                const balance = order.balance ?? 0;
                return (
                  <tr
                    key={order.id}
                    className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                    style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}
                  >
                    {/* Folio */}
                    <td className="px-4 py-3">
                      <span className="font-black text-white text-sm tracking-wide">{order.code}</span>
                    </td>

                    {/* Cliente */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User size={12} className="text-white/30 shrink-0" />
                        <span className="text-sm font-bold text-white/80 truncate max-w-[130px]">
                          {order.customer?.name ?? "—"}
                        </span>
                      </div>
                      {order.customer?.phone && (
                        <span className="text-[10px] text-white/30 ml-5">{order.customer.phone}</span>
                      )}
                    </td>

                    {/* Productos */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {(order.items ?? []).slice(0, 3).map(item => {
                          const dl = item.catalog?.pickup_deadline;
                          const delivered = item.status === 'delivered';
                          const expired = !delivered && !!dl &&
                            item.catalog?.status !== 'cancelled' &&
                            item.catalog?.status !== 'closed' &&
                            new Date(dl) < todayStart();
                          const nameColor = delivered ? "#60a5fa"
                            : expired ? "#EF4444"
                            : "#fbbf24";
                          return (
                            <div key={item.id} className="flex items-center gap-1 max-w-[200px]">
                              {delivered && <CheckCircle2 size={9} className="shrink-0" style={{ color: "#60a5fa" }} />}
                              {!delivered && expired && <AlertCircle size={9} className="shrink-0" style={{ color: "#EF4444" }} />}
                              {!delivered && !expired && <Clock size={9} className="shrink-0" style={{ color: "#fbbf24" }} />}
                              <span className="text-[11px] font-bold truncate" style={{ color: nameColor }}>
                                {item.quantity}× {item.catalog?.product_name ?? `Catálogo #${item.pre_sale_catalog_id}`}
                              </span>
                              {expired && (
                                <span className="text-[9px] font-black shrink-0" style={{ color: "#EF4444" }}>
                                  · {new Date(dl!).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {(order.items?.length ?? 0) > 3 && (
                          <span className="text-[10px] text-white/30">+{(order.items?.length ?? 0) - 3} más</span>
                        )}
                      </div>
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-black text-white">{fmt(order.total)}</span>
                    </td>

                    {/* Anticipo */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-emerald-400">{fmt(order.paid_amount)}</span>
                    </td>

                    {/* Pendiente */}
                    <td className="px-4 py-3">
                      <span className={`text-sm font-bold ${balance > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {balance > 0 ? fmt(balance) : "Liquidado"}
                      </span>
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        <Icon size={10} />
                        {meta.label}
                      </span>
                    </td>

                    {/* Tienda */}
                    <td className="px-4 py-3">
                      <span className="text-[11px] text-white/40 font-bold">{order.store?.name ?? "—"}</span>
                    </td>

                    {/* Fecha */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={11} className="text-white/25 shrink-0" />
                        <span className="text-[11px] text-white/40">
                          {new Date(order.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" })}
                        </span>
                      </div>
                      {order.pickup_deadline && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Banknote size={11} className="text-white/25 shrink-0" />
                          <span className="text-[10px] text-amber-400/70">
                            Hasta {new Date(order.pickup_deadline).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-white/30 font-bold">{total} folio{total !== 1 ? "s" : ""}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-4 py-2 text-sm font-black text-white/60">{page} / {lastPage}</span>
            <button
              disabled={page === lastPage}
              onClick={() => setPage(p => p + 1)}
              className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
