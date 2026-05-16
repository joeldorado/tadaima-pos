import { useState } from "react";
import { usePreSaleOrdersQuery } from "@/hooks/queries/usePreSales";
import { useAuth } from "@tadaima/auth";
import { PreSaleCatalogsPanel } from "@/components/presales/PreSaleCatalogsPanel";
import { PreSaleOrdersPanel } from "@/components/presales/PreSaleOrdersPanel";
import { PreSaleDifusionPanel } from "@/components/presales/PreSaleDifusionPanel";

const T = {
  bgGrad: "var(--td-page-bg)",
  textPrimary: "var(--td-text-hi)",
  textSecondary: "var(--td-text-md)",
  redBright: "#FF4422",
};

type AdminTab = "folios" | "difusion" | "catalogos";

export function PreSalesPage() {
  const { user } = useAuth();
  const isAdmin = user?.roles?.some(r =>
    ["admin", "super_admin", "owner", "dueño"].includes(r.toLowerCase())
  ) ?? false;

  const [adminTab, setAdminTab] = useState<AdminTab>("folios");

  const storeId = !isAdmin && user?.store_id ? user.store_id : undefined;
  const pendingQuery = usePreSaleOrdersQuery(
    { status: "pending", per_page: 1, ...(storeId ? { store_id: storeId } : {}) },
    { enabled: !!user }
  );
  const readyQuery = usePreSaleOrdersQuery(
    { status: "ready", per_page: 1, ...(storeId ? { store_id: storeId } : {}) },
    { enabled: !!user }
  );
  const pCount = pendingQuery.data?.pagination.total ?? 0;
  const rCount = readyQuery.data?.pagination.total ?? 0;
  const foliosPendingCount: number | null =
    pendingQuery.isPending || readyQuery.isPending ? null : pCount + rCount;

  const tabs: ReadonlyArray<{ id: AdminTab; label: string; adminOnly: boolean }> = [
    { id: "catalogos", label: "Catálogos", adminOnly: true },
    { id: "folios", label: "Folios", adminOnly: false },
    { id: "difusion", label: "Difusión", adminOnly: false },
  ];

  return (
    <div className="h-full overflow-y-auto p-8 space-y-8 no-scrollbar" style={{ background: T.bgGrad }}>

      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", color: T.textPrimary }}>
            Preventas <span style={{ color: T.redBright }}>Tadaima</span>
          </h1>
          <div style={{ display: "flex", padding: 4, borderRadius: 12, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", background: isAdmin ? "#CC2200" : "transparent", color: isAdmin ? "#fff" : "rgba(255,255,255,0.3)" }}>Admin</span>
            <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", background: !isAdmin ? "#CC2200" : "transparent", color: !isAdmin ? "#fff" : "rgba(255,255,255,0.3)" }}>Vendedor</span>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.textSecondary }}>Gestión de catálogos y folios de preventa</p>
      </div>

      {/* Tab navigation */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.filter(t => !t.adminOnly || isAdmin).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setAdminTab(id)}
            style={{
              padding: "10px 22px",
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              cursor: "pointer",
              border: "1px solid",
              background: adminTab === id
                ? "linear-gradient(135deg, #CC2200 0%, #FF4422 100%)"
                : "rgba(255,255,255,0.05)",
              borderColor: adminTab === id
                ? "rgba(255,120,90,0.3)"
                : "var(--td-panel-border)",
              color: adminTab === id ? "#fff" : "var(--td-text-lo)",
              boxShadow: adminTab === id ? "0 0 20px rgba(204,34,0,0.3)" : "none",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {label}
              {id === "folios" && foliosPendingCount !== null && foliosPendingCount > 0 && (
                <span style={{
                  background: adminTab === "folios" ? "rgba(255,255,255,0.25)" : "#E0221A",
                  color: "#fff",
                  borderRadius: 9999,
                  fontSize: 9,
                  fontWeight: 900,
                  padding: "1px 6px",
                  lineHeight: "16px",
                  minWidth: 18,
                  textAlign: "center",
                }}>
                  {foliosPendingCount}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {adminTab === "folios" && <PreSaleOrdersPanel />}
      {adminTab === "difusion" && <PreSaleDifusionPanel />}
      {isAdmin && adminTab === "catalogos" && <PreSaleCatalogsPanel />}
    </div>
  );
}
