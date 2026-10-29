import { Activity, Boxes, Package, Users } from "lucide-react";
import type { ActivitySummary } from "@tadaima/api";
import { groupStyle } from "@/lib/activityFormat";
import { cardStyle, labelClass } from "./activityUi";

interface Props {
  summary: ActivitySummary | undefined;
  isLoading: boolean;
  onPickUser: (userId: number) => void;
  onPickProduct: (productId: number) => void;
}

const fmt = (n: number) => n.toLocaleString("es-MX");

/**
 * Tarjetas de resumen del rango filtrado: totales, quién más movió y los
 * productos más tocados. Clic en una persona o producto = aplica el filtro.
 */
export function ActivitySummaryCards({ summary, isLoading, onPickUser, onPickProduct }: Props) {
  const stock = summary?.by_group.find((g) => g.group === "stock")?.count ?? 0;
  const usersActive = summary?.by_user.filter((u) => u.user).length ?? 0;
  const productsTouched = summary?.top_products.length ?? 0;
  const dim = isLoading ? 0.5 : 1;

  const tiles = [
    { icon: Activity, label: "Eventos", value: summary ? fmt(summary.totals.events) : "—", color: "#FF6B4A" },
    { icon: Boxes, label: "Movimientos de stock", value: summary ? fmt(stock) : "—", color: "#60A5FA" },
    { icon: Users, label: "Usuarios activos", value: summary ? fmt(usersActive) : "—", color: "#34D399" },
    { icon: Package, label: "Productos tocados (top)", value: summary ? fmt(productsTouched) : "—", color: "#A78BFA" },
  ];

  return (
    <div className="flex flex-col gap-3 mb-3" style={{ opacity: dim, transition: "opacity .2s" }}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
      {tiles.map((t) => (
        <div key={t.label} className="p-3 flex flex-col gap-1" style={cardStyle}>
          <div className="flex items-center gap-2">
            <t.icon size={13} color={t.color} />
            <span className={labelClass} style={{ color: "var(--td-text-lo)" }}>{t.label}</span>
          </div>
          <span className="text-2xl font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>{t.value}</span>
        </div>
      ))}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
      <div className="p-3 flex flex-col gap-1.5 min-w-0" style={cardStyle}>
        <span className={labelClass} style={{ color: "var(--td-text-lo)" }}>Quién más movió</span>
        {(summary?.by_user ?? []).slice(0, 5).map((row, i) => (
          <button
            key={row.user?.id ?? `sys-${i}`}
            type="button"
            disabled={!row.user}
            onClick={() => row.user && onPickUser(row.user.id)}
            className="flex items-center justify-between gap-2 text-left text-[11px] hover:underline disabled:no-underline"
            style={{ color: "var(--td-text-md)" }}
          >
            <span className="truncate">{row.user?.name ?? "Sistema"}</span>
            <span className="font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>{fmt(row.count)}</span>
          </button>
        ))}
        {summary && summary.by_user.length === 0 && <span className="text-[11px]" style={{ color: "var(--td-text-lo)" }}>Sin actividad</span>}
      </div>

      <div className="p-3 flex flex-col gap-1.5 min-w-0" style={cardStyle}>
        <span className={labelClass} style={{ color: "var(--td-text-lo)" }}>Productos más tocados</span>
        {(summary?.top_products ?? []).slice(0, 5).map((row) => (
          <button
            key={row.product.id}
            type="button"
            onClick={() => onPickProduct(row.product.id)}
            className="flex items-center justify-between gap-2 text-left text-[11px] hover:underline"
            style={{ color: "var(--td-text-md)" }}
            title={row.product.sku ?? undefined}
          >
            <span className="truncate">
              {row.product.name}
              {row.product.deleted && <span className="ml-1 text-[9px] font-black uppercase" style={{ color: groupStyle("sistema").color }}>borrado</span>}
            </span>
            <span className="font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>{fmt(row.count)}</span>
          </button>
        ))}
        {summary && summary.top_products.length === 0 && <span className="text-[11px]" style={{ color: "var(--td-text-lo)" }}>Sin productos</span>}
      </div>
      </div>
    </div>
  );
}
