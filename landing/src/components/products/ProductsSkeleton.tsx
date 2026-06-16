/**
 * Skeleton del catálogo de Productos. Se muestra SOLO en la primera carga real
 * (sin cache en IndexedDB). En vez de tapar todo con un spinner full-screen,
 * pinta la estructura de la página (toolbar + buscador + grid/tabla) con
 * bloques pulsantes → da sensación de carga progresiva, no de "se trabó".
 *
 * Las cargas siguientes son instantáneas (React Query sirve del cache 24h).
 */

interface ProductsSkeletonProps {
  /** 'grid' = tarjetas, 'list' = filas de tabla. Respeta la vista del usuario. */
  viewMode: "grid" | "list";
  bgGrad: string;
}

const shimmer = "animate-pulse rounded-2xl";
const block = (extra: string) => `${shimmer} ${extra}`;
const SURFACE = "var(--td-surface-soft)";
const SURFACE_MUTED = "var(--td-surface-muted)";
const SURFACE_STRONG = "var(--td-surface-strong)";

export function ProductsSkeleton({ viewMode, bgGrad }: ProductsSkeletonProps) {
  return (
    <div className="min-h-screen p-6 md:p-8" style={{ background: bgGrad }} aria-busy="true" aria-label="Cargando catálogo">
      {/* Header: título + KPIs */}
      <div className="flex flex-wrap items-center gap-4 mb-8">
        <div className="flex-1 min-w-[200px] space-y-2">
          <div className={block("h-7 w-48")} style={{ background: SURFACE }} />
          <div className={block("h-3 w-64")} style={{ background: SURFACE }} />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className={block("h-12 w-28")} style={{ background: SURFACE }} />
        ))}
      </div>

      {/* Tabs Productos / Tomos */}
      <div className="flex gap-3 mb-6">
        <div className={block("h-9 w-32")} style={{ background: SURFACE }} />
        <div className={block("h-9 w-32")} style={{ background: SURFACE }} />
      </div>

      {/* Buscador + toggle de vista */}
      <div className="flex items-center gap-4 mb-6">
        <div className={block("h-12 flex-1")} style={{ background: SURFACE }} />
        <div className={block("h-12 w-40")} style={{ background: SURFACE }} />
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-[32px] overflow-hidden" style={{ background: SURFACE }}>
              <div className="aspect-square animate-pulse" style={{ background: SURFACE_MUTED }} />
              <div className="p-4 space-y-2">
                <div className={block("h-4 w-3/4")} style={{ background: SURFACE_STRONG }} />
                <div className={block("h-3 w-1/2")} style={{ background: SURFACE }} />
                <div className={block("h-5 w-1/3 mt-3")} style={{ background: SURFACE_STRONG }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: SURFACE }}>
              <div className={`${shimmer} h-12 w-12 shrink-0`} style={{ background: SURFACE_STRONG }} />
              <div className="flex-1 space-y-2">
                <div className={block("h-4 w-1/3")} style={{ background: SURFACE_STRONG }} />
                <div className={block("h-3 w-1/4")} style={{ background: SURFACE }} />
              </div>
              <div className={block("h-6 w-20")} style={{ background: SURFACE_STRONG }} />
              <div className={block("h-6 w-16")} style={{ background: SURFACE }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
