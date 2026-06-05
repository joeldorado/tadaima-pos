/**
 * Skeleton para los paneles de Preventas (folios, catálogos, disponibles,
 * vencidos). Reemplaza el spinner "Cargando…" en la primera carga sin cache →
 * sensación de carga progresiva, igual que en Productos. Las cargas siguientes
 * son instantáneas (React Query sirve del cache).
 */

interface PreSalesSkeletonProps {
  /** 'cards' = catálogos (grid de tarjetas); 'rows' = folios/vencidos (lista). */
  variant: "cards" | "rows";
}

const shimmer = "animate-pulse rounded-2xl";
const SURFACE = "rgba(255,255,255,0.05)";
const SURFACE_HI = "rgba(255,255,255,0.08)";

export function PreSalesSkeleton({ variant }: PreSalesSkeletonProps) {
  return (
    <div aria-busy="true" aria-label="Cargando preventas">
      {/* Barra de búsqueda / filtros */}
      <div className="flex items-center gap-3 mb-5">
        <div className={`${shimmer} h-11 flex-1`} style={{ background: SURFACE }} />
        <div className={`${shimmer} h-11 w-28`} style={{ background: SURFACE }} />
      </div>

      {variant === "cards" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-[28px] overflow-hidden" style={{ background: SURFACE }}>
              <div className="aspect-square animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
              <div className="p-4 space-y-2">
                <div className={`${shimmer} h-4 w-3/4`} style={{ background: SURFACE_HI }} />
                <div className={`${shimmer} h-3 w-1/2`} style={{ background: SURFACE }} />
                <div className={`${shimmer} h-5 w-1/3 mt-3`} style={{ background: SURFACE_HI }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: SURFACE }}>
              <div className={`${shimmer} h-10 w-20 shrink-0`} style={{ background: SURFACE_HI }} />
              <div className="flex-1 space-y-2">
                <div className={`${shimmer} h-4 w-1/3`} style={{ background: SURFACE_HI }} />
                <div className={`${shimmer} h-3 w-1/4`} style={{ background: SURFACE }} />
              </div>
              <div className={`${shimmer} h-6 w-24`} style={{ background: SURFACE_HI }} />
              <div className={`${shimmer} h-7 w-20`} style={{ background: SURFACE }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
