import { useState } from "react";
import { Globe, Inbox, PackageCheck } from "lucide-react";
import { PublishedPanel } from "./tadaimaus/PublishedPanel";
import { OrdersPanel } from "./tadaimaus/OrdersPanel";

type SubTab = "publicados" | "pedidos";

const SUB_TABS: { id: SubTab; label: string; icon: typeof Globe }[] = [
  { id: "publicados", label: "Publicados", icon: PackageCheck },
  { id: "pedidos",    label: "Pedidos",    icon: Inbox },
];

/**
 * TadaimaUS — módulo admin de la tienda US (tadaimaus.com, precios USD).
 * Shell con sub-tabs (molde: settings/CatalogTab):
 *  - Publicados: buscar productos del POS y publicarlos con precio en dólares;
 *    tabla de publicados con precio editable, visibilidad y stock.
 *  - Pedidos: pedidos dummy de la tienda US (folio US-XXXXX) con cambio de status.
 */
export function TabTadaimaUS() {
  const [subTab, setSubTab] = useState<SubTab>("publicados");

  return (
    <div className="space-y-6">
      {/* Encabezado del módulo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(0,136,203,0.12)", border: "1px solid rgba(0,136,203,0.30)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Globe size={18} color="#38BDF8" />
        </div>
        <div>
          <h2 style={{ color: "var(--td-text-hi)", fontSize: 16, fontWeight: 900, margin: 0 }}>TadaimaUS</h2>
          <p style={{ color: "var(--td-text-lo)", fontSize: 10, margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Tienda US · precios en dólares · pedidos sin cobro online
          </p>
        </div>
      </div>

      {/* Barra de sub-tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {SUB_TABS.map(({ id, label, icon: Icon }) => {
          const active = subTab === id;
          return (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
              style={active
                ? { background: "linear-gradient(135deg, #BB1100 0%, #E0221A 100%)", color: "#fff", boxShadow: "0 0 20px rgba(224,34,26,0.25)" }
                : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }}
            >
              <Icon size={13} />
              {label}
            </button>
          );
        })}
      </div>

      {subTab === "publicados" && <PublishedPanel />}
      {subTab === "pedidos" && <OrdersPanel />}
    </div>
  );
}
