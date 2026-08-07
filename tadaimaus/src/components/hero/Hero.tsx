import { BRAND } from '../../lib/constants'

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <img
        className="hero-bg"
        src={BRAND.heroUrl}
        alt=""
        width={1920}
        height={1080}
        loading="eager"
        fetchPriority="high"
      />
      <div className="hero-overlay" aria-hidden="true" />

      <div className="hero-content container">
        <p className="hero-kicker">
          <span lang="ja">おかえりなさい</span>
          <span className="hero-kicker-divider" aria-hidden="true" />
          Welcome home
        </p>
        <h1 id="hero-heading">
          Your anime store
          <br />
          in the <span className="hero-accent">USA</span>
        </h1>
        <p className="hero-tagline">
          Figures, manga and trading card games — hand-picked in Japan, shipped
          from our shelves to your door. Welcome home!
        </p>
        <div className="hero-actions">
          <a className="btn btn-primary" href="#/figures">
            Shop figures
          </a>
          <a className="btn btn-ghost" href="#/tcg">
            Browse TCG
          </a>
        </div>
      </div>
    </section>
  )
}
