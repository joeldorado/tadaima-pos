/**
 * Skeleton para los reportes (Ventas, Inventario, Productos, Clientes, Cortes).
 * Reemplaza el spinner centrado en la primera carga / cambio de filtro o tab.
 * Pinta KPIs + un bloque grande (gráfico o tabla) con shimmer → sensación de
 * carga progresiva, igual que Productos/Preventas/Ventas. Las revisitas dentro
 * del staleTime son instantáneas (React Query sirve del cache).
 */

const shimmer = "animate-pulse rounded-2xl";
const SURFACE = "rgba(255,255,255,0.05)";
const SURFACE_HI = "rgba(255,255,255,0.08)";

export function ReportsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando reporte">
      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl p-5 space-y-3" style={{ background: SURFACE }}>
            <div className={`${shimmer} h-3 w-24`} style={{ background: SURFACE_HI }} />
            <div className={`${shimmer} h-8 w-32`} style={{ background: SURFACE_HI }} />
            <div className={`${shimmer} h-2.5 w-20`} style={{ background: SURFACE }} />
          </div>
        ))}
      </div>

      {/* Bloque grande: gráfico / tabla */}
      <div className="rounded-2xl p-5" style={{ background: SURFACE }}>
        <div className={`${shimmer} h-4 w-40 mb-5`} style={{ background: SURFACE_HI }} />
        <div className="space-y-2.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className={`${shimmer} h-3 w-20 shrink-0`} style={{ background: SURFACE_HI }} />
              <div className={`${shimmer} h-7`} style={{ background: SURFACE_HI, width: `${90 - i * 9}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
