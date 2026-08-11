import { useEffect, useMemo, useState } from 'react'
import { CategoryFilterList } from '../components/catalog/CategoryFilterList'
import { CatalogToolbar } from '../components/catalog/CatalogToolbar'
import { PriceRangeSlider } from '../components/catalog/PriceRangeSlider'
import { ProductGrid } from '../components/product/ProductGrid'
import { type CatalogState, useCatalog } from '../hooks/useCatalog'
import { useDebounced } from '../hooks/useDebounced'
import { SHOP_CATEGORIES, type UsCategory } from '../lib/constants'
import { filterByPriceRange, priceBounds, sortListings, type SortOption } from '../lib/sortFilter'
import { navigateTo } from '../lib/routes'

interface CategoryPageProps {
  readonly category: UsCategory
}

export function CategoryPage({ category }: CategoryPageProps) {
  const meta = SHOP_CATEGORIES.find((entry) => entry.slug === category)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [priceRange, setPriceRange] = useState<readonly [number, number]>([0, 0])

  const { state, reload } = useCatalog(category, debouncedSearch)

  const bounds = useMemo(
    () => priceBounds(state.status === 'ready' ? state.listings : []),
    [state],
  )

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

  return (
    <div className="container container-wide section">
      <header className="page-head">
        <p className="section-kicker">Category</p>
        <h1 className="page-title">{meta?.label ?? category}</h1>
        {meta !== undefined && <p className="page-sub">{meta.blurb}</p>}
      </header>

      <div className="catalog-layout">
        <aside>
          <CategoryFilterList
            activeCategory={category}
            onSelect={(nextCategory) =>
              navigateTo(
                nextCategory === undefined
                  ? { page: 'home' }
                  : { page: 'category', category: nextCategory },
              )
            }
          />
          <PriceRangeSlider bounds={bounds} value={priceRange} onChange={setPriceRange} />
        </aside>

        <div>
          <CatalogToolbar
            count={count}
            search={search}
            onSearchChange={setSearch}
            searchLabel={meta?.label ?? 'products'}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
          <ProductGrid
            state={filteredState}
            onRetry={reload}
            searchTerm={debouncedSearch}
            showCategory={false}
          />
        </div>
      </div>
    </div>
  )
}
