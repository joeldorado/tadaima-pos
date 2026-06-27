import { ChevronRight } from "lucide-react"
import type { GlobalCatalogItem } from "@tadaima/api"
import { ProductCard } from "./ProductCard"

const DISPLAY = "'Space Grotesk', system-ui, sans-serif"

interface CategoryRowProps {
  title: string
  items: GlobalCatalogItem[]
  showPrice: boolean
  showStock: boolean
  showDescription: boolean
  cartEnabled: boolean
  onAdd: (item: GlobalCatalogItem) => void
  onWhatsAppClick?: ((item: GlobalCatalogItem) => void) | undefined
  onSeeAll?: (() => void) | undefined
}

/**
 * Fila horizontal scrollable de una categoría (estilo Netflix). El scroll
 * horizontal está contenido en la fila; la página sigue scrolleando vertical.
 * scroll-snap para que las tarjetas se alineen al deslizar.
 */
export function CategoryRow({
  title,
  items,
  showPrice,
  showStock,
  showDescription,
  cartEnabled,
  onAdd,
  onWhatsAppClick,
  onSeeAll,
}: CategoryRowProps) {
  if (items.length === 0) return null

  return (
    <section className="mt-7">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2
          className="text-sm font-black uppercase tracking-widest"
          style={{ color: "var(--td-text-hi)", fontFamily: DISPLAY }}
        >
          {title} <span style={{ color: "var(--td-text-ghost)" }}>· {items.length}</span>
        </h2>
        {onSeeAll && items.length > 2 && (
          <button
            onClick={onSeeAll}
            className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest cursor-pointer hover:brightness-125 transition"
            style={{ color: "#FF8A80" }}
          >
            Ver todo <ChevronRight size={14} />
          </button>
        )}
      </div>

      <div
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}
      >
        {items.map((item) => (
          <div key={item.id} className="snap-start shrink-0 w-[158px]">
            <ProductCard
              item={item}
              showPrice={showPrice}
              showStock={showStock}
              showDescription={showDescription}
              cartEnabled={cartEnabled}
              onAdd={onAdd}
              onWhatsAppClick={onWhatsAppClick}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
