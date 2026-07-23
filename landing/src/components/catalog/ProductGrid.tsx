import { ShoppingBag } from "lucide-react"
import type { GlobalCatalogItem } from "@tadaima/api"
import { ProductCard } from "./ProductCard"
import { secondaryBtnStyle } from "./catalogUi"

const DISPLAY = "'Space Grotesk', system-ui, sans-serif"

/**
 * Cuerpo del Catálogo Online (Catálogo v4): encabezado de contexto + productos
 * + "Cargar más". Extraído de OnlineCatalogPage para que los tres layouts lo
 * compartan en vez de duplicar grid, animación y estado vacío.
 *
 * Dos variantes:
 *  - "grid"    → cuadrícula pareja de 2→5 columnas (clásico y menú lateral)
 *  - "masonry" → columnas CSS con tarjetas de alto libre (layout Revista).
 *    Se usa `columns` y no `grid-template-rows: masonry` porque eso último
 *    todavía es experimental y no lo soporta Safari.
 */

export interface ProductCardConfig {
  showPrice: boolean
  showStock: boolean
  showDescription: boolean
  cartEnabled: boolean
  onAdd: (item: GlobalCatalogItem) => void
}

interface ProductGridProps {
  items: GlobalCatalogItem[]
  cardProps: ProductCardConfig
  heading: string
  emptyLabel: string
  variant?: "grid" | "masonry"
  hasMorePages: boolean
  loadingMore: boolean
  remaining: number
  onLoadMore: () => void
}

const GRID_CLASS = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
const MASONRY_CLASS = "columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3"

export function ProductGrid({
  items,
  cardProps,
  heading,
  emptyLabel,
  variant = "grid",
  hasMorePages,
  loadingMore,
  remaining,
  onLoadMore,
}: ProductGridProps) {
  const isMasonry = variant === "masonry"

  return (
    <>
      <h2
        className="text-sm font-black uppercase tracking-widest mb-3"
        style={{ fontFamily: DISPLAY, color: "var(--td-text-hi)" }}
      >
        {heading}
      </h2>

      {items.length === 0 ? (
        <div
          className="mt-4 rounded-3xl p-8 text-center"
          style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}
        >
          <ShoppingBag size={28} className="mx-auto mb-3" style={{ color: "var(--td-text-ghost)" }} />
          <p className="text-sm font-black uppercase tracking-[0.2em]" style={{ color: "var(--td-text-md)" }}>
            {emptyLabel}
          </p>
        </div>
      ) : (
        <div className={isMasonry ? MASONRY_CLASS : GRID_CLASS}>
          {items.map((item, i) => (
            <div
              key={item.id}
              className={`td-fadeup${isMasonry ? " mb-3 break-inside-avoid" : ""}`}
              style={{ animation: "tdFadeUp 0.35s ease-out both", animationDelay: `${Math.min(i, 12) * 30}ms` }}
            >
              <ProductCard
                item={item}
                {...cardProps}
                imageAspect={isMasonry ? "natural" : "square"}
              />
            </div>
          ))}
        </div>
      )}

      {/* Cargar más (v2.0): antes había tope silencioso de 100 productos */}
      {hasMorePages && items.length > 0 && (
        <div className="mt-8 text-center">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest cursor-pointer transition-all hover:brightness-125 disabled:opacity-50"
            style={secondaryBtnStyle}
          >
            {loadingMore ? "Cargando…" : `Cargar más productos (${remaining} restantes)`}
          </button>
        </div>
      )}
    </>
  )
}
