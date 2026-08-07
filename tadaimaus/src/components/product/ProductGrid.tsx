import type { CatalogState } from '../../hooks/useCatalog'
import { ProductCard } from './ProductCard'

const SKELETON_COUNT = 8

function SkeletonCard() {
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
  /** Optional cap (e.g. featured section on home). */
  readonly limit?: number
}

export function ProductGrid({ state, onRetry, limit }: ProductGridProps) {
  if (state.status === 'loading') {
    return (
      <div className="product-grid" aria-busy="true" aria-label="Loading products">
        {Array.from({ length: limit ?? SKELETON_COUNT }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="catalog-notice" role="status">
        <p className="catalog-notice-jp" lang="ja" aria-hidden="true">
          ごめんなさい
        </p>
        <p className="catalog-notice-title">We hit a snag</p>
        <p className="catalog-notice-copy">{state.message}</p>
        <button type="button" className="btn btn-ghost-dark" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  }

  const listings = limit !== undefined ? state.listings.slice(0, limit) : state.listings

  if (listings.length === 0) {
    return (
      <div className="catalog-notice" role="status">
        <p className="catalog-notice-jp" lang="ja" aria-hidden="true">
          準備中
        </p>
        <p className="catalog-notice-title">New items coming soon — check back!</p>
        <p className="catalog-notice-copy">
          We are restocking this shelf right now. Follow us or come back in a few
          days to see what arrived from Japan.
        </p>
      </div>
    )
  }

  return (
    <div className="product-grid">
      {listings.map((listing) => (
        <ProductCard key={listing.id} listing={listing} />
      ))}
    </div>
  )
}
