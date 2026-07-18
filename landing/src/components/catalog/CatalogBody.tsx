import type { CatalogLayoutSlug } from "@tadaima/api"
import { CategoryList, type CatalogCategory } from "./CategoryList"
import { ProductGrid, type ProductCardConfig } from "./ProductGrid"
import { CATALOG_CONTAINER, CATALOG_CONTAINER_WIDE } from "./catalogUi"
import type { GlobalCatalogItem } from "@tadaima/api"

const DISPLAY = "'Space Grotesk', system-ui, sans-serif"

/**
 * Los tres acomodos del Catálogo Online (Catálogo v4). Van juntos a propósito:
 * las tres variantes son la misma composición con distinto envoltorio, y
 * partirlas en archivos separados escondería lo poco que realmente cambia.
 *
 *  - classic  → cuerpo centrado + cuadrícula pareja (el de siempre)
 *  - sidebar  → aside de categorías + productos, contenedor ancho.
 *               El aside es `hidden lg:block` y el header oculta sus chips de
 *               categoría solo en lg+, así que EN CELULAR queda exactamente el
 *               layout clásico, sin una segunda rama de render.
 *  - masonry  → mismo cuerpo centrado, tarjetas de alto libre
 */

interface CatalogBodyProps {
  layout: CatalogLayoutSlug
  items: GlobalCatalogItem[]
  cardProps: ProductCardConfig
  heading: string
  emptyLabel: string
  hasMorePages: boolean
  loadingMore: boolean
  remaining: number
  onLoadMore: () => void
  categories: CatalogCategory[]
  categoryFilter: string | null
  onCategoryFilter: (name: string | null) => void
}

export function CatalogBody({
  layout,
  items,
  cardProps,
  heading,
  emptyLabel,
  hasMorePages,
  loadingMore,
  remaining,
  onLoadMore,
  categories,
  categoryFilter,
  onCategoryFilter,
}: CatalogBodyProps) {
  const grid = (
    <ProductGrid
      items={items}
      cardProps={cardProps}
      heading={heading}
      emptyLabel={emptyLabel}
      variant={layout === "masonry" ? "masonry" : "grid"}
      hasMorePages={hasMorePages}
      loadingMore={loadingMore}
      remaining={remaining}
      onLoadMore={onLoadMore}
    />
  )

  if (layout === "sidebar") {
    return (
      <div className={`relative z-10 ${CATALOG_CONTAINER_WIDE} pt-4 pb-10 lg:flex lg:gap-7`}>
        <aside className="hidden lg:block w-56 shrink-0">
          {/* top-28 deja libre el header sticky (2 filas ≈ 106px). */}
          <div className="sticky top-28">
            <p
              className="text-[10px] font-black uppercase tracking-[0.22em] mb-2.5 px-1"
              style={{ fontFamily: DISPLAY, color: "var(--cat-accent-text, #FF8A80)" }}
            >
              Categorías
            </p>
            <CategoryList
              categories={categories}
              categoryFilter={categoryFilter}
              onCategoryFilter={onCategoryFilter}
              variant="column"
            />
          </div>
        </aside>
        <main className="min-w-0 flex-1">{grid}</main>
      </div>
    )
  }

  return <div className={`relative z-10 ${CATALOG_CONTAINER} pt-4 pb-10`}>{grid}</div>
}
