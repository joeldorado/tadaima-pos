import { useMemo, useState } from "react";
import { AlertTriangle, Search, Phone, Mail } from "lucide-react";
import { useAuth } from "@tadaima/auth";
import { usePreSaleOrdersQuery } from "@/hooks/queries/usePreSales";
import { PreSalesSkeleton } from "./PreSalesSkeleton";
import type { PreSaleOrder } from "@tadaima/api";

/**
 * Panel de "Vencidos" — folios cuya fecha límite de retiro ya pasó y aún
 * tienen status activo (pending o ready). Útil para que cualquier persona
 * de la tienda (cajero/gerente/admin) pueda contactar al cliente y resolver.
 *
 * Backend ya soporta status=expired; aquí también detectamos pickup_deadline
 * pasada con status pending/ready para cubrir el caso en que el cron de
 * expiración aún no haya corrido.
 */
export function PreSaleVencidosPanel() {
  const { user } = useAuth();
  const isAdmin = user?.roles?.some(r =>
    ["admin", "super_admin", "owner", "dueño"].includes(r.toLowerCase())
  ) ?? false;
  const storeId = !isAdmin ? user?.store_id ?? undefined : undefined;
  const [search, setSearch] = useState("");

  // Traemos pending + ready + expired y filtramos vencidos client-side.
  const ordersQuery = usePreSaleOrdersQuery(
    { per_page: 200, status: "pending,ready,expired", ...(storeId ? { store_id: storeId } : {}) },
    { enabled: !!user }
  );
  const orders: PreSaleOrder[] = ordersQuery.data?.data ?? [];

  const filtered = useMemo(() => {
    const now = new Date();
    const q = search.trim().toLowerCase();
    return orders.filter(o => {
      // expirado por status O por pickup_deadline pasada
      const expiredByStatus = o.status === "expired";
      const expiredByDate = !!o.pickup_deadline
        && (o.status === "pending" || o.status === "ready")
        && new Date(o.pickup_deadline) < now;
      if (!expiredByStatus && !expiredByDate) return false;
      if (!q) return true;
      return o.code.toLowerCase().includes(q)
        || (o.customer?.name ?? "").toLowerCase().includes(q)
        || (o.customer?.phone ?? "").includes(q);
    }).sort((a, b) => {
      const aDate = a.pickup_deadline ? new Date(a.pickup_deadline).getTime() : 0;
      const bDate = b.pickup_deadline ? new Date(b.pickup_deadline).getTime() : 0;
      return aDate - bDate; // más vencido primero
    });
  }, [orders, search]);

  if (ordersQuery.isPending) {
    return <PreSalesSkeleton variant="rows" />;
  }

  const fmtMoney = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
  const daysOverdue = (deadline: string): number => {
    const diff = Date.now() - new Date(deadline).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderRadius: 14,
        background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)",
      }}>
        <Search size={14} style={{ color: "var(--td-text-lo)" }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por folio, cliente, teléfono…"
          className="flex-1 bg-transparent outline-none text-xs"
          style={{ color: "var(--td-text-hi)" }}
        />
        <span style={{ fontSize: 9, fontWeight: 900, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          {filtered.length} {filtered.length === 1 ? "vencido" : "vencidos"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ opacity: 0.5 }}>
          <AlertTriangle size={36} style={{ color: "var(--td-text-ghost)" }} />
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--td-text-md)" }}>
            Sin folios vencidos en tu tienda
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(o => {
            const overdueDays = o.pickup_deadline ? daysOverdue(o.pickup_deadline) : 0;
            const isLiquidated = (o.balance ?? 0) <= 0;
            return (
              <div
                key={o.id}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 18px", borderRadius: 16,
                  background: "var(--td-card-bg)",
                  border: "1px solid rgba(220,38,38,0.25)",
                }}
              >
                <div style={{
                  flexShrink: 0,
                  width: 44, height: 44, borderRadius: 12,
                  background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <AlertTriangle size={18} color="#DC2626" />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: "var(--td-text-hi)" }}>
                      {o.code}
                    </span>
                    {isLiquidated ? (
                      <span style={{ fontSize: 8, fontWeight: 900, padding: "1px 6px", borderRadius: 6, background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Liquidado
                      </span>
                    ) : (
                      <span style={{ fontSize: 8, fontWeight: 900, padding: "1px 6px", borderRadius: 6, background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Saldo {fmtMoney(o.balance ?? 0)}
                      </span>
                    )}
                    {overdueDays > 0 && (
                      <span style={{ fontSize: 8, fontWeight: 900, padding: "1px 6px", borderRadius: 6, background: "#DC2626", color: "#fff", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        {overdueDays} {overdueDays === 1 ? "día" : "días"} vencido
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--td-text-md)" }}>
                      {o.customer?.name ?? "Sin cliente"}
                    </span>
                    {o.customer?.phone && (
                      <a
                        href={`tel:${o.customer.phone}`}
                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--td-text-ghost)", textDecoration: "none" }}
                      >
                        <Phone size={9} />
                        {o.customer.phone}
                      </a>
                    )}
                    {o.customer?.email && (
                      <a
                        href={`mailto:${o.customer.email}`}
                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--td-text-ghost)", textDecoration: "none" }}
                      >
                        <Mail size={9} />
                        {o.customer.email}
                      </a>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Total
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 900, color: "var(--td-text-hi)" }}>
                    {fmtMoney(o.total ?? 0)}
                  </p>
                  {o.pickup_deadline && (
                    <p style={{ margin: "2px 0 0", fontSize: 9, color: "var(--td-text-ghost)" }}>
                      Retiro: {new Date(o.pickup_deadline).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
