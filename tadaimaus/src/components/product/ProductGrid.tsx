import { useEffect, useState } from 'react'
import type { CatalogState } from '../../hooks/useCatalog'
import { ProductCard } from './ProductCard'

const SKELETON_COUNT = 12
// 3 filas completas en el grid de 6 columnas (el original carga de 20 en 20).
const PAGE_SIZE = 18

export function SkeletonCard() {
  return (
    <div className="product-card is-skeleton" aria-hidden="true">
      <div className="skeleton-media" />
      <div className="product-body">
        <div className="skeleton-line" />
        <div className="skeleton-line is-short" />
      </div>
    </div>
  )
}

interface ProductGridProps {
  readonly state: CatalogState
  readonly onRetry: () => void
  /** Active search — switches the empty state to "no results". */
  readonly searchTerm?: string
  /** Badge de categoría en las cartas — solo útil si el grid mezcla categorías. */
  readonly showCategory?: boolean
}

export function ProductGrid({
  state,
  onRetry,
  searchTerm,
  showCategory = true,
}: ProductGridProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Every new fetch (category/search change, sort/price change upstream, or a
  // manual retry) produces a new `state` reference — reset pagination then.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [state])

  if (state.status === 'loading') {
    return (
      <div className="product-grid" aria-busy="true" aria-label="Loading products">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="catalog-notice" role="status">
        <p className="catalog-notice-title">We hit a snag</p>
        <p className="catalog-notice-copy">{state.message}</p>
        <button type="button" className="btn btn-ghost-dark" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  }

  const listings = state.listings

  if (listings.length === 0) {
    if (searchTerm !== undefined && searchTerm.trim() !== '') {
      return (
        <div className="catalog-notice" role="status">
          <p className="catalog-notice-title">
            No results for &ldquo;{searchTerm.trim()}&rdquo;
          </p>
          <p className="catalog-notice-copy">
            Try a different name or browse the full shelf — new grails land every
            week.
          </p>
        </div>
      )
    }

    return (
      <div className="catalog-notice" role="status">
        <p className="catalog-notice-title">New items coming soon — check back!</p>
        <p className="catalog-notice-copy">
          We are restocking this shelf right now. Follow us or come back in a few
          days to see what arrived.
        </p>
      </div>
    )
  }

  const visibleListings = listings.slice(0, visibleCount)

  return (
    <>
      <div className="product-grid">
        {visibleListings.map((listing) => (
          <ProductCard key={listing.id} listing={listing} showCategory={showCategory} />
        ))}
      </div>

      {visibleCount < listings.length && (
        <div className="load-more">
          <button
            type="button"
            className="btn btn-ghost-dark"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Load more
          </button>
        </div>
      )}
    </>
  )
}
