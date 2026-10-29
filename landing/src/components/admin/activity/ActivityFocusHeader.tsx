import { Package, User as UserIcon, X } from "lucide-react";
import type { ActivityEvent, ActivitySummary } from "@tadaima/api";
import { StoreStockBreakdown } from "@/components/inventory/StoreStockBreakdown";
import { groupStyle, productTypeLabel } from "@/lib/activityFormat";
import { cardStyle, labelClass } from "./activityUi";

interface Props {
  productId: number | null;
  userId: number | null;
  /** Para sacar nombre/SKU sin otra petición. */
  sampleEvents: ActivityEvent[];
  summary: ActivitySummary | undefined;
  userName: string | null;
  onClearProduct: () => void;
  onClearUser: () => void;
}

/**
 * Encabezado cuando el feed está fijado a UN producto (ficha + stock actual
 * por tienda) o a UNA persona (conteo por tipo). Es la respuesta directa a
 * "¿qué ha pasado con este producto?" / "¿qué hizo este cajero?".
 */
export function ActivityFocusHeader({ productId, userId, sampleEvents, summary, userName, onClearProduct, onClearUser }: Props) {
  if (productId === null && userId === null) return null;

  const product = productId !== null ? sampleEvents.find((e) => e.product?.id === productId)?.product ?? null : null;

  return (
    <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: productId !== null && userId !== null ? "1fr 1fr" : "1fr" }}>
      {productId !== null && (
        <div className="p-3 flex flex-col gap-2" style={cardStyle}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.35)" }}>
              <Package size={16} color="#A78BFA" />
            </div>
            <div className="min-w-0 flex-1">
              <span className={labelClass} style={{ color: "var(--td-text-lo)" }}>Historial del producto</span>
              <p className="text-sm font-black truncate" style={{ color: "var(--td-text-hi)" }}>
                {product?.name ?? `Producto #${productId}`}
                {product?.deleted && <span className="ml-2 text-[9px] font-black uppercase" style={{ color: "#f87171" }}>borrado</span>}
              </p>
              <p className="font-mono text-[10px]" style={{ color: "var(--td-text-lo)" }}>
                {product?.sku ?? "—"}{productTypeLabel(product?.type) ? ` · ${productTypeLabel(product?.type)}` : ""}
                {summary ? ` · ${summary.totals.events.toLocaleString("es-MX")} eventos en el rango` : ""}
              </p>
            </div>
            <button type="button" onClick={onClearProduct} aria-label="Quitar producto" className="rounded-lg p-1 hover:bg-white/10" style={{ color: "var(--td-text-lo)" }}>
              <X size={14} />
            </button>
          </div>
          {!product?.deleted && (
            <div className="rounded-xl p-2" style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-divider)" }}>
              <span className={labelClass} style={{ color: "var(--td-text-lo)" }}>Stock actual por tienda</span>
              <StoreStockBreakdown productId={productId} />
            </div>
          )}
        </div>
      )}

      {userId !== null && (
        <div className="p-3 flex flex-col gap-2" style={cardStyle}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.35)" }}>
              <UserIcon size={16} color="#34D399" />
            </div>
            <div className="min-w-0 flex-1">
              <span className={labelClass} style={{ color: "var(--td-text-lo)" }}>Historial de la persona</span>
              <p className="text-sm font-black truncate" style={{ color: "var(--td-text-hi)" }}>{userName ?? `Usuario #${userId}`}</p>
              <p className="text-[10px]" style={{ color: "var(--td-text-lo)" }}>
                {summary ? `${summary.totals.events.toLocaleString("es-MX")} eventos en el rango` : ""}
              </p>
            </div>
            <button type="button" onClick={onClearUser} aria-label="Quitar persona" className="rounded-lg p-1 hover:bg-white/10" style={{ color: "var(--td-text-lo)" }}>
              <X size={14} />
            </button>
          </div>
          {summary && summary.by_group.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {summary.by_group.map((g) => {
                const s = groupStyle(g.group);
                return (
                  <span key={g.group} className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: `rgba(${s.rgb},0.14)`, color: s.color, border: `1px solid ${s.color}44` }}>
                    {s.label} · {g.count.toLocaleString("es-MX")}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
