import { type MouseEvent, useState } from 'react'
import { MediaPlaceholder } from '../components/product/MediaPlaceholder'
import { useCatalog } from '../hooks/useCatalog'
import { categoryLabel, MAX_LINE_QUANTITY } from '../lib/constants'
import { formatUsd } from '../lib/format'
import { navigateTo } from '../lib/routes'
import { useCart } from '../store/CartContext'

interface ProductPageProps {
  readonly id: number
}

function handleZoomMove(event: MouseEvent<HTMLDivElement>): void {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * 100
  const y = ((event.clientY - rect.top) / rect.height) * 100
  event.currentTarget.style.setProperty('--zoom-x', `${x}%`)
  event.currentTarget.style.setProperty('--zoom-y', `${y}%`)
}

export function ProductPage({ id }: ProductPageProps) {
  const { state, reload } = useCatalog()
  const { addItem } = useCart()
  const [imageFailed, setImageFailed] = useState(false)
  const [quantity, setQuantity] = useState(1)

  if (state.status === 'loading') {
    return (
      <div className="container section">
        <div className="product-detail product-detail-skeleton" aria-busy="true" aria-label="Loading product">
          <div className="product-detail-media skeleton-media" />
          <div className="product-detail-info">
            <div className="skeleton-line is-short" />
            <div className="skeleton-line" />
            <div className="skeleton-line is-short" />
          </div>
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="container section">
        <div className="catalog-notice" role="status">
          <p className="catalog-notice-title">We hit a snag</p>
          <p className="catalog-notice-copy">{state.message}</p>
          <button type="button" className="btn btn-ghost-dark" onClick={reload}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  const listing = state.listings.find((item) => item.id === id)

  if (listing === undefined) {
    return (
      <div className="container section">
        <div className="catalog-notice" role="status">
          <p className="catalog-notice-title">Product not found</p>
          <p className="catalog-notice-copy">
            This item may have sold out or the link is out of date.
          </p>
          <a className="btn btn-ghost-dark" href="#/">
            Back to the shop
          </a>
        </div>
      </div>
    )
  }

  const siblings = state.listings.filter((item) => item.category === listing.category)
  const index = siblings.findIndex((item) => item.id === listing.id)
  const prev = index > 0 ? siblings[index - 1] : undefined
  const next = index < siblings.length - 1 ? siblings[index + 1] : undefined

  const showImage = listing.image_url !== null && listing.image_url !== '' && !imageFailed

  return (
    <div className="container section">
      <div className="product-detail-top">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <ol>
            <li>
              <a href="#/">Home</a>
            </li>
            <li>
              <a href={`#/${listing.category}`}>{categoryLabel(listing.category)}</a>
            </li>
            <li aria-current="page">{listing.name}</li>
          </ol>
        </nav>

        <div className="product-detail-nav">
          <button
            type="button"
            className="product-detail-nav-arrow"
            disabled={prev === undefined}
            onClick={() => prev !== undefined && navigateTo({ page: 'product', id: prev.id })}
          >
            ← Previous
          </button>
          <span className="product-detail-nav-sep" aria-hidden="true" />
          <button
            type="button"
            className="product-detail-nav-arrow"
            disabled={next === undefined}
            onClick={() => next !== undefined && navigateTo({ page: 'product', id: next.id })}
          >
            Next →
          </button>
        </div>
      </div>

      <div className="product-detail">
        <div
          className="product-detail-media product-detail-zoom"
          onMouseMove={handleZoomMove}
        >
          {showImage ? (
            <img
              src={listing.image_url ?? ''}
              alt={listing.name}
              width={800}
              height={800}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <MediaPlaceholder />
          )}
        </div>

        <div className="product-detail-info">
          <h1 className="product-detail-title">{listing.name}</h1>
          {listing.description !== null && listing.description !== '' && (
            <p className="product-detail-desc">{listing.description}</p>
          )}
          <p className="product-detail-price">{formatUsd(listing.price_usd)}</p>

          <div className="product-detail-buy">
            <span className="product-detail-qty-label" id="qty-label">
              Quantity
            </span>
            <div className="qty-stepper" role="group" aria-labelledby="qty-label">
              <button
                type="button"
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <output aria-live="polite">{quantity}</output>
              <button
                type="button"
                onClick={() =>
                  setQuantity((current) => Math.min(MAX_LINE_QUANTITY, current + 1))
                }
                disabled={quantity >= MAX_LINE_QUANTITY}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => addItem(listing, quantity)}
            >
              Add to cart
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
