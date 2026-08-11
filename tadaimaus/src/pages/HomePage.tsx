import { useEffect, useMemo, useState } from 'react'
import { CategoryFilterList } from '../components/catalog/CategoryFilterList'
import { CatalogToolbar } from '../components/catalog/CatalogToolbar'
import { PriceRangeSlider } from '../components/catalog/PriceRangeSlider'
import { HeroSlider } from '../components/hero/HeroSlider'
import { MarqueeBand } from '../components/home/MarqueeBand'
import { PromoBanner } from '../components/home/PromoBanner'
import { ProductGrid } from '../components/product/ProductGrid'
import { type CatalogState, useCatalog } from '../hooks/useCatalog'
import { useDebounced } from '../hooks/useDebounced'
import { useReveal } from '../hooks/useReveal'
import { FEATURED_CATEGORIES, type UsCategory } from '../lib/constants'
import { filterByPriceRange, priceBounds, sortListings, type SortOption } from '../lib/sortFilter'

export function HomePage() {
  const [category, setCategory] = useState<UsCategory | undefined>(undefined)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [priceRange, setPriceRange] = useState<readonly [number, number]>([0, 0])

  const { state, reload } = useCatalog(category, debouncedSearch)

  const bounds = useMemo(
    () => priceBounds(state.status === 'ready' ? state.listings : []),
    [state],
  )

  // Reset the selected range whenever the underlying data range changes
  // (new category/search) — a stale $50–$150 selection must not silently
  // empty out a category whose real max is $30.
  useEffect(() => {
    setPriceRange(bounds)
  }, [bounds])

  const filteredState: CatalogState = useMemo(() => {
    if (state.status !== 'ready') return state
    const [min, max] = priceRange
    return {
      status: 'ready',
      listings: sortListings(filterByPriceRange(state.listings, min, max), sortBy),
    }
  }, [state, priceRange, sortBy])

  const count = filteredState.status === 'ready' ? filteredState.listings.length : null

  const shop = useReveal<HTMLElement>()
  const categories = useReveal<HTMLElement>()

  return (
    <>
      <HeroSlider />

      <section
        ref={shop.ref}
        className={`section reveal${shop.isRevealed ? ' is-revealed' : ''}`}
        aria-labelledby="shop-heading"
      >
        <div className="container container-wide">
          <header className="section-head">
            <p className="section-kicker">Shop</p>
            <h2 id="shop-heading" className="section-title">
              The full shelf
            </h2>
          </header>

          <div className="catalog-layout">
            <aside>
              <CategoryFilterList activeCategory={category} onSelect={setCategory} />
              <PriceRangeSlider bounds={bounds} value={priceRange} onChange={setPriceRange} />
            </aside>

            <div>
              <CatalogToolbar
                count={count}
                search={search}
                onSearchChange={setSearch}
                searchLabel="products"
                sortBy={sortBy}
                onSortChange={setSortBy}
              />
              <ProductGrid
                state={filteredState}
                onRetry={reload}
                searchTerm={debouncedSearch}
                showCategory={category === undefined}
              />
            </div>
          </div>
        </div>
      </section>

      <MarqueeBand />

      <section
        ref={categories.ref}
        className={`section section-alt reveal${
          categories.isRevealed ? ' is-revealed' : ''
        }`}
        aria-labelledby="categories-heading"
      >
        <div className="container">
          <header className="section-head">
            <p className="section-kicker">Browse</p>
            <h2 id="categories-heading" className="section-title">
              Pick your aisle
            </h2>
          </header>

          <div className="category-tiles">
            {FEATURED_CATEGORIES.map((tileCategory) => (
              <a
                key={tileCategory.slug}
                className="category-tile"
                href={`#/${tileCategory.slug}`}
              >
                <span className="category-tile-label">{tileCategory.label}</span>
                <span className="category-tile-blurb">{tileCategory.blurb}</span>
                <span className="category-tile-cta" aria-hidden="true">
                  Shop {tileCategory.label} →
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <PromoBanner />
    </>
  )
}
