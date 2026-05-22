import { useMemo, useState } from "react";
import { Search, Package, Calendar, Loader2 } from "lucide-react";
import { useAuth } from "@tadaima/auth";
import { usePreSaleCatalogsQuery } from "@/hooks/queries/usePreSales";
import { ImageWithFallback } from "@/components/figma/ImageWithFallback";
import { storageUrl } from "@tadaima/api";
import type { PreSaleCatalog } from "@tadaima/api";

/**
 * Vista read-only para cajeros: lista los catálogos PUBLISHED disponibles
 * en SU tienda con su stock asignado (store_limits[active_store].limit_qty -
 * reserved_by_store[active_store]).
 *
 * Sin botones de edición. Si el cajero quiere reservar uno, abre Caja y usa
 * el modal Preventas → Disponibles.
 */
export function PreSaleAvailableCatalogsPanel() {
  const { user } = useAuth();
  const storeId = user?.store_id ?? null;

  const catalogsQuery = usePreSaleCatalogsQuery({ per_page: 200 });
  const catalogs: PreSaleCatalog[] = catalogsQuery.data?.data ?? [];
  const [search, setSearch] = useState("");

  // Filtro: solo published + scoped a la tienda del cajero (debe tener
  // store_limits entry con limit_qty > 0). Sin store_id → vacío.
  const filtered = useMemo(() => {
    if (!storeId) return [];
    const q = search.trim().toLowerCase();
    return catalogs.filter(c => {
      if (c.status !== "published") return false;
      const sl = c.store_limits?.find(x => x.store_id === storeId);
      if (!sl || sl.limit_qty <= 0) return false;
      if (q && !c.product_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalogs, search, storeId]);

  if (catalogsQuery.isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: "var(--td-text-ghost)" }}>
        <Loader2 size={28} className="animate-spin" />
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase" }}>Cargando catálogos…</p>
      </div>
    );
  }

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
          placeholder="Buscar producto…"
          className="flex-1 bg-transparent outline-none text-xs"
          style={{ color: "var(--td-text-hi)" }}
        />
        <span style={{ fontSize: 9, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          {filtered.length} {filtered.length === 1 ? "disponible" : "disponibles"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ opacity: 0.5 }}>
          <Package size={36} style={{ color: "var(--td-text-ghost)" }} />
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--td-text-md)" }}>
            Sin catálogos publicados para tu tienda
          </p>
          <p style={{ fontSize: 10, color: "var(--td-text-ghost)", maxWidth: 360, textAlign: "center" }}>
            Cuando el admin asigne stock de preventa a tu sucursal, aparecerán aquí. Mientras tanto puedes cobrarlos desde Caja → Preventas.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {filtered.map(c => {
            const sl = c.store_limits?.find(x => x.store_id === storeId);
            const limit = sl?.limit_qty ?? 0;
            const reserved = storeId != null ? (c.reserved_by_store?.[String(storeId)] ?? 0) : 0;
            const remaining = Math.max(0, limit - reserved);
            const isOut = remaining <= 0;
            const imgSrc = c.image_url ?? (c.image_path ? storageUrl(c.image_path) : null);

            return (
              <div
                key={c.id}
                style={{
                  display: "flex", flexDirection: "column", gap: 10,
                  padding: 14, borderRadius: 18,
                  background: "var(--td-card-bg)",
                  border: `1px solid ${isOut ? "rgba(220,38,38,0.25)" : "var(--td-card-border)"}`,
                  opacity: isOut ? 0.7 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--td-text-ghost)" }}>
                    {c.category?.name ?? "Preventa"}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 900, padding: "2px 8px", borderRadius: 999,
                    background: isOut ? "#DC2626" : "rgba(245,158,11,0.15)",
                    color: isOut ? "#fff" : "#f59e0b",
                    border: `1px solid ${isOut ? "rgba(220,38,38,0.5)" : "rgba(245,158,11,0.3)"}`,
                  }}>
                    {isOut ? "Agotado" : `${remaining} disponibles`}
                  </span>
                </div>

                {imgSrc && (
                  <div style={{ aspectRatio: "16 / 10", borderRadius: 12, overflow: "hidden", background: "rgba(0,0,0,0.2)" }}>
                    <ImageWithFallback src={imgSrc} className="w-full h-full object-cover" />
                  </div>
                )}

                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "var(--td-text-hi)", lineHeight: 1.3 }}>
                  {c.product_name}
                </p>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Precio
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 15, fontWeight: 900, color: "var(--td-text-hi)" }}>
                      ${(c.price_1 ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Anticipo
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 800, color: "#10b981" }}>
                      ${(c.advance_payment ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {(c.arrival_date || c.pickup_deadline) && (
                  <div style={{ display: "flex", gap: 12, paddingTop: 8, borderTop: "1px solid var(--td-divider)" }}>
                    {c.arrival_date && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Calendar size={10} style={{ color: "var(--td-text-ghost)" }} />
                        <span style={{ fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Llega {new Date(c.arrival_date).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    )}
                    {c.pickup_deadline && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Calendar size={10} style={{ color: "#f59e0b" }} />
                        <span style={{ fontSize: 9, color: "#f59e0b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Retiro {new Date(c.pickup_deadline).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
