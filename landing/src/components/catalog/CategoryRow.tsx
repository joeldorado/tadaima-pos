import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
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
 * v2.0: cards de ancho fluido (clamp), flechas ‹ › en desktop cuando hay
 * overflow y máscara de gradiente como affordance de "hay más".
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
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 8)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }, [])

  useEffect(() => {
    updateArrows()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener("scroll", updateArrows, { passive: true })
    window.addEventListener("resize", updateArrows)
    return () => {
      el.removeEventListener("scroll", updateArrows)
      window.removeEventListener("resize", updateArrows)
    }
  }, [updateArrows, items.length])

  const scrollByCards = (dir: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" })
  }

  if (items.length === 0) return null

  const arrowStyle: React.CSSProperties = {
    background: "var(--td-popup-bg)",
    border: "1px solid var(--td-panel-border)",
    color: "var(--td-text-hi)",
    boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
  }

  return (
    <section className="mt-7">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2
          className="text-sm font-black uppercase tracking-widest"
          style={{ color: "var(--td-text-hi)", fontFamily: DISPLAY }}
        >
          {title} <span style={{ color: "var(--td-text-ghost)" }}>· {items.length}</span>
        </h2>
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest cursor-pointer hover:brightness-125 transition"
            style={{ color: "#FF8A80" }}
          >
            Ver todo <ChevronRight size={14} />
          </button>
        )}
      </div>

      <div className="relative">
        <div
          ref={scrollerRef}
          className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.15) transparent",
            // Affordance "hay más": desvanecer el borde con contenido oculto.
            WebkitMaskImage: `linear-gradient(to right, ${canLeft ? "transparent, black 36px" : "black, black"}, black calc(100% - 36px), ${canRight ? "transparent" : "black"})`,
            maskImage: `linear-gradient(to right, ${canLeft ? "transparent, black 36px" : "black, black"}, black calc(100% - 36px), ${canRight ? "transparent" : "black"})`,
          }}
        >
          {items.map((item) => (
            <div key={item.id} className="snap-start shrink-0" style={{ width: "clamp(158px, 17vw, 210px)" }}>
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

        {/* Flechas solo en pantallas con puntero fino (desktop) y con overflow */}
        {canLeft && (
          <button
            aria-label={`Anteriores de ${title}`}
            onClick={() => scrollByCards(-1)}
            className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 items-center justify-center rounded-full cursor-pointer hover:brightness-125 transition z-10"
            style={arrowStyle}
          >
            <ChevronLeft size={16} />
          </button>
        )}
        {canRight && (
          <button
            aria-label={`Siguientes de ${title}`}
            onClick={() => scrollByCards(1)}
            className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-9 h-9 items-center justify-center rounded-full cursor-pointer hover:brightness-125 transition z-10"
            style={arrowStyle}
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </section>
  )
}
