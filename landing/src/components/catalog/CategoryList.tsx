import { PILL_CLASS, pillStyle } from "./catalogUi"

/**
 * Lista de categorías del Catálogo Online (Catálogo v4).
 *
 * Extraída del header para que el layout "menú lateral" pueda pintarla como
 * columna sin duplicar la lógica de conteos y selección. Dos formas, mismo
 * comportamiento:
 *  - "chips"  → fila horizontal scrolleable (header, y móvil de todos los layouts)
 *  - "column" → lista vertical (aside del layout menú lateral)
 */

export interface CatalogCategory {
  name: string
  count: number
}

interface CategoryListProps {
  categories: CatalogCategory[]
  categoryFilter: string | null
  onCategoryFilter: (name: string | null) => void
  variant?: "chips" | "column"
}

export function CategoryList({
  categories,
  categoryFilter,
  onCategoryFilter,
  variant = "chips",
}: CategoryListProps) {
  // Con una sola categoría el filtro no aporta nada.
  if (categories.length <= 1) return null

  const toggle = (name: string) => onCategoryFilter(categoryFilter === name ? null : name)

  if (variant === "column") {
    return (
      <ul className="flex flex-col gap-1">
        <li>
          <button
            onClick={() => onCategoryFilter(null)}
            className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest cursor-pointer transition-all"
            style={pillStyle(categoryFilter === null)}
          >
            Todas
          </button>
        </li>
        {categories.map((c) => (
          <li key={c.name}>
            <button
              onClick={() => toggle(c.name)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest cursor-pointer transition-all"
              style={pillStyle(categoryFilter === c.name)}
            >
              <span className="truncate">{c.name}</span>
              <span style={{ opacity: 0.6 }}>{c.count}</span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <button
        onClick={() => onCategoryFilter(null)}
        className={PILL_CLASS}
        style={pillStyle(categoryFilter === null)}
      >
        Todas
      </button>
      {categories.map((c) => (
        <button
          key={c.name}
          onClick={() => toggle(c.name)}
          className={PILL_CLASS}
          style={pillStyle(categoryFilter === c.name)}
        >
          {c.name} <span style={{ opacity: 0.6 }}>· {c.count}</span>
        </button>
      ))}
    </>
  )
}
