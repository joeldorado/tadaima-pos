import { Hero } from '../components/hero/Hero'
import { ProductGrid } from '../components/product/ProductGrid'
import { useCatalog } from '../hooks/useCatalog'
import { FEATURED_COUNT, SHOP_CATEGORIES } from '../lib/constants'

export function HomePage() {
  const { state, reload } = useCatalog()

  return (
    <>
      <Hero />

      <section className="section" aria-labelledby="featured-heading">
        <div className="container">
          <header className="section-head">
            <p className="section-kicker">
              <span lang="ja">注目商品</span> Featured
            </p>
            <h2 id="featured-heading" className="section-title">
              Fresh off the shelf
            </h2>
          </header>
          <ProductGrid state={state} onRetry={reload} limit={FEATURED_COUNT} />
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="categories-heading">
        <div className="container">
          <header className="section-head">
            <p className="section-kicker">
              <span lang="ja">カテゴリー</span> Browse
            </p>
            <h2 id="categories-heading" className="section-title">
              Pick your aisle
            </h2>
          </header>

          <div className="category-tiles">
            {SHOP_CATEGORIES.map((category) => (
              <a key={category.slug} className="category-tile" href={`#/${category.slug}`}>
                <span className="category-tile-jp" lang="ja" aria-hidden="true">
                  {category.jpLabel}
                </span>
                <span className="category-tile-label">{category.label}</span>
                <span className="category-tile-blurb">{category.blurb}</span>
                <span className="category-tile-cta" aria-hidden="true">
                  Shop {category.label} →
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="welcome-band" aria-labelledby="welcome-heading">
        <span className="welcome-band-watermark" lang="ja" aria-hidden="true">
          ただいま
        </span>
        <div className="container welcome-band-inner">
          <h2 id="welcome-heading">
            <em lang="ja">Tadaima</em> means &ldquo;I&rsquo;m home.&rdquo;
          </h2>
          <p>
            <em lang="ja">Okaeri</em> is the warm reply: &ldquo;welcome back.&rdquo;
            That is how we treat every collector who walks through our door — and
            every order that leaves our shelves. Small shop, big heart, straight
            from Japan to the USA.
          </p>
        </div>
      </section>
    </>
  )
}
