interface MediaPlaceholderIconProps {
  readonly size?: number
}

/**
 * Noren (la cortina de la entrada de una tienda japonesa) — el mismo dibujo que
 * el favicon. Se usa donde un producto no tiene foto: en la tarjeta del
 * catálogo con leyenda, y suelto en miniaturas chicas como el carrito.
 */
export function MediaPlaceholderIcon({ size = 44 }: MediaPlaceholderIconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6 10q18 4.5 36 0l-1.5 6.5H41L39 42h-4.4l-1.8-25.5H15.2L13.4 42H9l-2-25.5H7.5L6 10Z" />
      <rect x="11" y="21" width="26" height="4" />
    </svg>
  )
}

export function MediaPlaceholder() {
  return (
    <div className="product-placeholder" aria-hidden="true">
      <MediaPlaceholderIcon />
      <span>Photo coming soon</span>
    </div>
  )
}
