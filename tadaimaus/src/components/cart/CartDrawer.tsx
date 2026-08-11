import { useEffect } from 'react'
import { MAX_LINE_QUANTITY } from '../../lib/constants'
import { formatUsd } from '../../lib/format'
import { useCart } from '../../store/CartContext'
import { MediaPlaceholderIcon } from '../product/MediaPlaceholder'

export function CartDrawer() {
  const { lines, subtotal, isDrawerOpen, closeDrawer, setQuantity, removeItem } =
    useCart()

  // Esc closes; body scroll locks while open.
  useEffect(() => {
    if (!isDrawerOpen) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [isDrawerOpen, closeDrawer])

  return (
    <div
      className={`drawer-root${isDrawerOpen ? ' is-open' : ''}`}
      inert={!isDrawerOpen}
    >
      <div className="drawer-backdrop" onClick={closeDrawer} aria-hidden="true" />

      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Shopping cart">
        <header className="drawer-head">
          <div>
            <h2>Your cart</h2>
          </div>
          <button
            type="button"
            className="drawer-close"
            onClick={closeDrawer}
            aria-label="Close cart"
          >
            ×
          </button>
        </header>

        {lines.length === 0 ? (
          <div className="drawer-empty">
            <p className="drawer-empty-title">Your cart is empty</p>
            <p className="drawer-empty-copy">
              Add some figures, manga or TCG and they will show up here.
            </p>
            <a className="btn btn-primary" href="#/figures" onClick={closeDrawer}>
              Start shopping
            </a>
          </div>
        ) : (
          <>
            <ul className="drawer-lines">
              {lines.map((line) => (
                <li key={line.listingId} className="drawer-line">
                  <div className="drawer-line-media" aria-hidden="true">
                    {line.imageUrl !== null && line.imageUrl !== '' ? (
                      <img src={line.imageUrl} alt="" width={72} height={72} loading="lazy" />
                    ) : (
                      <span className="drawer-line-noimg">
                        <MediaPlaceholderIcon size={28} />
                      </span>
                    )}
                  </div>

                  <div className="drawer-line-info">
                    <p className="drawer-line-name">{line.name}</p>
                    <p className="drawer-line-price">{formatUsd(line.priceUsd)} each</p>

                    <div className="drawer-line-controls">
                      <div
                        className="qty-stepper"
                        role="group"
                        aria-label={`Quantity for ${line.name}`}
                      >
                        <button
                          type="button"
                          onClick={() => setQuantity(line.listingId, line.quantity - 1)}
                          disabled={line.quantity <= 1}
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span aria-live="polite">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setQuantity(line.listingId, line.quantity + 1)}
                          disabled={line.quantity >= MAX_LINE_QUANTITY}
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        className="drawer-line-remove"
                        onClick={() => removeItem(line.listingId)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <p className="drawer-line-total">
                    {formatUsd(line.priceUsd * line.quantity)}
                  </p>
                </li>
              ))}
            </ul>

            <footer className="drawer-foot">
              <div className="drawer-subtotal">
                <span>Subtotal</span>
                <span className="drawer-subtotal-amount">{formatUsd(subtotal)}</span>
              </div>
              <a
                className="btn btn-primary btn-block"
                href="#/checkout"
                onClick={closeDrawer}
              >
                Checkout
              </a>
            </footer>
          </>
        )}
      </aside>
    </div>
  )
}
