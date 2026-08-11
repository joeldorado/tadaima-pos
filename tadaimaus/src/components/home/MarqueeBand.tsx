// "Tadaima" y "Okaeri" se quedan: son el nombre de la marca en romaji, no
// texto japonés que el cliente tenga que descifrar.
const MARQUEE_ITEMS = ['Tadaima', 'Okaeri', 'Welcome home'] as const

/**
 * Banda vermilion en loop infinito (patrón Binabox). El track se duplica y la
 * animación recorre -50%: cuando la primera copia sale, la segunda ya está en
 * su lugar — loop seamless. Decorativa: aria-hidden.
 */
export function MarqueeBand() {
  const sequence = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]

  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {[0, 1].map((copy) => (
          <div className="marquee-group" key={copy}>
            {sequence.map((item, itemIndex) => (
              <span className="marquee-item" key={`${copy}-${itemIndex}`}>
                {item}
                <span className="marquee-sep">·</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
