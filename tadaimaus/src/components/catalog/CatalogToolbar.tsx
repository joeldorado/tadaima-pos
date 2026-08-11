import type { SortOption } from '../../lib/sortFilter'
import { SortDropdown } from './SortDropdown'

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  )
}

interface CatalogToolbarProps {
  /** `null` while loading/erroring — hides the count. */
  readonly count: number | null
  readonly search: string
  readonly onSearchChange: (value: string) => void
  /** Used in the search placeholder/aria-label, e.g. "Figures" or "products". */
  readonly searchLabel: string
  readonly sortBy: SortOption
  readonly onSortChange: (value: SortOption) => void
}

/** Search + item count + Sort by, shared between Home and category pages. */
export function CatalogToolbar({
  count,
  search,
  onSearchChange,
  searchLabel,
  sortBy,
  onSortChange,
}: CatalogToolbarProps) {
  return (
    <div className="catalog-toolbar">
      <div className="catalog-search" role="search">
        <SearchIcon />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={`Search ${searchLabel}…`}
          aria-label={`Search ${searchLabel}`}
        />
        {search !== '' && (
          <button
            type="button"
            className="catalog-search-clear"
            aria-label="Clear search"
            onClick={() => onSearchChange('')}
          >
            ×
          </button>
        )}
      </div>

      <div className="catalog-toolbar-end">
        {count !== null && count > 0 && (
          <p className="page-count">
            {count} {count === 1 ? 'item' : 'items'}
          </p>
        )}
        <SortDropdown value={sortBy} onChange={onSortChange} />
      </div>
    </div>
  )
}
