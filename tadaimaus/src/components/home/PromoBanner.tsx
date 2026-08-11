import { useReveal } from '../../hooks/useReveal'

/** Bloque promocional estilo Binabox: ink oscuro, corner-brackets y CTA. */
export function PromoBanner() {
  const { ref, isRevealed } = useReveal<HTMLElement>()

  return (
    <section
      ref={ref}
      className={`promo-banner reveal${isRevealed ? ' is-revealed' : ''}`}
      aria-labelledby="promo-heading"
    >
      <div className="container promo-banner-inner">
        <div className="promo-banner-copy">
          <p className="promo-banner-kicker">Limited stock</p>
          <h2 id="promo-heading">
            Grails land <span className="promo-banner-accent">weekly</span>
          </h2>
          <p className="promo-banner-sub">
            Booster boxes, prize figures and box sets — once they sell out, they
            are gone. Catch them while they are on the shelf.
          </p>
        </div>
        <div className="promo-banner-actions">
          <a className="btn btn-primary" href="#/tcg">
            Explore TCG
          </a>
          <a className="btn btn-ghost" href="#/figures">
            New figures
          </a>
        </div>
      </div>
    </section>
  )
}
