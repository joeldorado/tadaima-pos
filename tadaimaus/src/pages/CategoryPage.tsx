import { ProductGrid } from '../components/product/ProductGrid'
import { useCatalog } from '../hooks/useCatalog'
import { SHOP_CATEGORIES, type UsCategory } from '../lib/constants'

interface CategoryPageProps {
  readonly category: UsCategory
}

export function CategoryPage({ category }: CategoryPageProps) {
  const meta = SHOP_CATEGORIES.find((entry) => entry.slug === category)
  const { state, reload } = useCatalog(category)
  const count = state.status === 'ready' ? state.listings.length : null

  return (
    <div className="container section">
      <header className="page-head">
        <p className="section-kicker">
          <span lang="ja">{meta?.jpLabel ?? category}</span> Category
        </p>
        <h1 className="page-title">{meta?.label ?? category}</h1>
        {meta !== undefined && <p className="page-sub">{meta.blurb}</p>}
        {count !== null && count > 0 && (
          <p className="page-count">
            {count} {count === 1 ? 'item' : 'items'}
          </p>
        )}
      </header>

      <ProductGrid state={state} onRetry={reload} />
    </div>
  )
}
