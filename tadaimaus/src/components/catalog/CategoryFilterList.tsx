import { SHOP_CATEGORIES, type UsCategory } from '../../lib/constants'

interface CategoryFilterListProps {
  readonly activeCategory: UsCategory | undefined
  readonly onSelect: (category: UsCategory | undefined) => void
}

/** Vertical category list for the "Filter by" sidebar (Home + category pages). */
export function CategoryFilterList({ activeCategory, onSelect }: CategoryFilterListProps) {
  return (
    <div className="category-filter">
      <h3 className="catalog-filter-heading">Category</h3>
      <ul className="category-filter-list">
        <li>
          <button
            type="button"
            className={`category-filter-item${activeCategory === undefined ? ' is-active' : ''}`}
            aria-pressed={activeCategory === undefined}
            onClick={() => onSelect(undefined)}
          >
            All
          </button>
        </li>
        {SHOP_CATEGORIES.map((category) => (
          <li key={category.slug}>
            <button
              type="button"
              className={`category-filter-item${
                activeCategory === category.slug ? ' is-active' : ''
              }`}
              aria-pressed={activeCategory === category.slug}
              onClick={() => onSelect(category.slug)}
            >
              {category.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
