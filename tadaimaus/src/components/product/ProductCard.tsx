import { useState } from 'react'
import type { UsListing } from '../../lib/api'
import { categoryLabel } from '../../lib/constants'
import { formatUsd } from '../../lib/format'
import { MediaPlaceholder } from './MediaPlaceholder'

interface ProductCardProps {
  readonly listing: UsListing
  /**
   * Badge de categoría sobre la imagen. Solo aporta cuando el grid mezcla
   * categorías (home / búsqueda): dentro de una categoría todas las cartas
   * dirían lo mismo y se vuelve ruido.
   */
  readonly showCategory?: boolean
}

/**
 * Carta del grid, al estilo del sitio original: imagen + nombre + precio
 * centrados, sin marco y SIN "Add to cart" — se compra desde la ficha, que es
 * donde vive el selector de cantidad. Toda la carta es un solo enlace.
 */
export function ProductCard({ listing, showCategory = true }: ProductCardProps) {
  const [imageFailed, setImageFailed] = useState(false)

  const showImage = listing.image_url !== null && listing.image_url !== '' && !imageFailed

  return (
    <article className="product-card">
      <a className="product-media" href={`#/product/${listing.id}`} tabIndex={-1} aria-hidden="true">
        {showImage ? (
          <img
            src={listing.image_url ?? ''}
            alt=""
            width={480}
            height={480}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <MediaPlaceholder />
        )}
        {showCategory && (
          <span className="product-chip">{categoryLabel(listing.category)}</span>
        )}
      </a>

      <div className="product-body">
        <h3 className="product-name">
          <a href={`#/product/${listing.id}`}>{listing.name}</a>
        </h3>
        <span className="product-price">{formatUsd(listing.price_usd)}</span>
      </div>
    </article>
  )
}
