import { useState } from 'react'
import type { UsListing } from '../../lib/api'
import { SHOP_CATEGORIES } from '../../lib/constants'
import { formatUsd } from '../../lib/format'
import { useCart } from '../../store/CartContext'

function categoryLabel(slug: string): string {
  const match = SHOP_CATEGORIES.find((category) => category.slug === slug)
  return match ? match.label : 'Goods'
}

function MediaPlaceholder() {
  return (
    <div className="product-placeholder" aria-hidden="true">
      <svg
        viewBox="0 0 48 48"
        width="44"
        height="44"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M6 10q18 4.5 36 0l-1.5 6.5H41L39 42h-4.4l-1.8-25.5H15.2L13.4 42H9l-2-25.5H7.5L6 10Z" />
        <rect x="11" y="21" width="26" height="4" />
      </svg>
      <span>Photo coming soon</span>
    </div>
  )
}

interface ProductCardProps {
  readonly listing: UsListing
}

export function ProductCard({ listing }: ProductCardProps) {
  const { addItem } = useCart()
  const [imageFailed, setImageFailed] = useState(false)

  const showImage = listing.image_url !== null && listing.image_url !== '' && !imageFailed

  return (
    <article className="product-card">
      <div className="product-media">
        {showImage ? (
          <img
            src={listing.image_url ?? ''}
            alt={listing.name}
            width={480}
            height={480}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <MediaPlaceholder />
        )}
        <span className="product-chip">{categoryLabel(listing.category)}</span>
      </div>

      <div className="product-body">
        <h3 className="product-name">{listing.name}</h3>
        {listing.description !== null && listing.description !== '' && (
          <p className="product-desc">{listing.description}</p>
        )}
        <div className="product-foot">
          <span className="product-price">{formatUsd(listing.price_usd)}</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => addItem(listing)}
          >
            Add to cart
          </button>
        </div>
      </div>
    </article>
  )
}
