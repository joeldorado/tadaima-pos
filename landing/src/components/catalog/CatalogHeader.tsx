import { ChevronDown, Search, X } from "lucide-react"
import { CategoryList } from "./CategoryList"
import { CATALOG_CONTAINER, CATALOG_CONTAINER_WIDE, PILL_CLASS, pillStyle, type SortMode, type TypeFilter } from "./catalogUi"

const DISPLAY = "'Space Grotesk', system-ui, sans-serif"

/**
 * Header sticky del Catálogo Online (Catálogo v3) — versión SLIM.
 *
 * Antes: 3 filas apiladas (logo/buscador · tabs+categorías · orden+promo) que
 * comían mucha pantalla (queja de Joel). Ahora 2 filas compactas:
 *  1. logo chico + micro-título + buscador inline (también en móvil)
 *  2. UNA fila scrolleable: tabs · categorías · select de orden · Con promo
 * El orden pasó de 4 chips a un <select> nativo — mismo poder, ~70% menos ancho.
 */

export interface CatalogTab {
  key: TypeFilter
  label: string
  count: number
}

interface CatalogHeaderProps {
  showSearch: boolean
  searchInput: string
  onSearchInput: (value: string) => void
  onClearSearch: () => void
  tabs: CatalogTab[]
  typeFilter: TypeFilter
  onTypeFilter: (key: TypeFilter) => void
  categories: { name: string; count: number }[]
  categoryFilter: string | null
  onCategoryFilter: (name: string | null) => void
  sortMode: SortMode
  onSortMode: (mode: SortMode) => void
  /** Solo con destacados reales se ofrece el orden "Destacados". */
  hasFeatured: boolean
  hasAnyPromo: boolean
  promoOnly: boolean
  onPromoOnly: () => void
  /** Layout menú lateral: las categorías viven en el aside a partir de lg. */
  hideCategoriesOnDesktop?: boolean
  /** Layout menú lateral: contenedor ancho para alinear con el cuerpo. */
  wide?: boolean
}

export function CatalogHeader({
  showSearch,
  searchInput,
  onSearchInput,
  onClearSearch,
  tabs,
  typeFilter,
  onTypeFilter,
  categories,
  categoryFilter,
  onCategoryFilter,
  sortMode,
  onSortMode,
  hasFeatured,
  hasAnyPromo,
  promoOnly,
  onPromoOnly,
  hideCategoriesOnDesktop = false,
  wide = false,
}: CatalogHeaderProps) {
  const sortOptions: { key: SortMode; label: string }[] = [
    ...(hasFeatured ? [{ key: "featured" as const, label: "Destacados" }] : []),
    { key: "new", label: "Más nuevos" },
    { key: "price_asc", label: "Precio ↑" },
    { key: "price_desc", label: "Precio ↓" },
    { key: "name", label: "A-Z" },
  ]

  return (
    <div
      className="sticky top-0 z-30"
      style={{
        background: "var(--cat-bar-bg, rgba(11,8,13,0.82))",
        backdropFilter: "blur(18px) saturate(150%)",
        WebkitBackdropFilter: "blur(18px) saturate(150%)",
        borderBottom: "1px solid var(--td-panel-border)",
      }}
    >
      <div className={`${wide ? CATALOG_CONTAINER_WIDE : CATALOG_CONTAINER} py-2.5`}>
        {/* Fila 1: logo compacto + título + buscador inline (flex-1) */}
        <div className="flex items-center gap-3">
          <div
            className="shrink-0"
            style={{ background: "#fff", borderRadius: 11, padding: "4px 8px", border: "1px solid rgba(204,34,0,0.18)", boxShadow: "0 0 18px var(--cat-glow, rgba(204,34,0,0.45)), 0 3px 10px rgba(0,0,0,0.35)" }}
          >
            <img src="/tadaima-logo.jpeg" alt="Tadaima" style={{ height: 30, display: "block", borderRadius: 5 }} />
          </div>
          <div className="min-w-0 shrink-0">
            <p className="text-[8px] font-black uppercase tracking-[0.28em]" style={{ color: "var(--cat-accent-text, #FF8A80)" }}>
              Tienda en Línea
            </p>
            <h1 className="text-base font-black leading-tight" style={{ fontFamily: DISPLAY, color: "var(--td-text-hi)", letterSpacing: "-0.01em" }}>
              Catálogo
            </h1>
          </div>

          {showSearch && (
            <div className="relative flex-1 min-w-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--td-text-ghost)" }} />
              <input
                value={searchInput}
                onChange={(e) => onSearchInput(e.target.value)}
                placeholder="Buscar producto…"
                className="w-full rounded-2xl pl-9 pr-8 py-2 text-sm font-bold outline-none transition-colors"
                style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-input-text)" }}
              />
              {searchInput && (
                <button
                  aria-label="Limpiar búsqueda"
                  onClick={onClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg cursor-pointer hover:brightness-150 transition"
                  style={{ color: "var(--td-text-lo)" }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Fila 2: UNA fila scrolleable — tabs · categorías · orden · promo */}
        <div className="td-chiprow flex items-center gap-2 mt-2.5 overflow-x-auto -mx-4 px-4 pb-0.5">
          {tabs.length > 1 && tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => onTypeFilter(t.key)}
              className={PILL_CLASS}
              style={pillStyle(typeFilter === t.key)}
            >
              {t.label} <span style={{ opacity: 0.65 }}>· {t.count}</span>
            </button>
          ))}

          {/* Con menú lateral las categorías se ocultan SOLO en lg+: en móvil el
              aside no existe, así que aquí siguen siendo la única forma de
              filtrar. Es CSS puro, sin media query en JS. */}
          {categories.length > 1 && (
            <div className={`contents ${hideCategoriesOnDesktop ? "lg:hidden" : ""}`}>
              {tabs.length > 1 && (
                <span aria-hidden className="shrink-0 w-px h-5 mx-0.5" style={{ background: "var(--td-divider)" }} />
              )}
              <CategoryList
                categories={categories}
                categoryFilter={categoryFilter}
                onCategoryFilter={onCategoryFilter}
              />
            </div>
          )}

          <span aria-hidden className="shrink-0 w-px h-5 mx-0.5" style={{ background: "var(--td-divider)" }} />

          {/* Orden: select nativo compacto (antes 4 chips) */}
          <span className="relative shrink-0">
            <select
              aria-label="Ordenar por"
              value={sortMode}
              onChange={(e) => onSortMode(e.target.value as SortMode)}
              className="appearance-none pl-3 pr-7 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer outline-none"
              style={{ background: "var(--td-surface-muted)", border: "1px solid var(--td-divider)", color: "var(--td-text-md)" }}
            >
              {sortOptions.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--td-text-ghost)" }} />
          </span>

          {hasAnyPromo && (
            <button onClick={onPromoOnly} className={PILL_CLASS} style={pillStyle(promoOnly, "good")}>
              Con promo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
