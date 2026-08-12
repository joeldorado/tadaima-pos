import { useCallback, useEffect, useRef, useState } from 'react'
import { useDebounced } from '../hooks/useDebounced'
import {
  deleteListing,
  listListings,
  updateListing,
  LISTINGS_CAP,
  type AdminListing,
} from '../lib/adminApi'
import { SHOP_CATEGORIES, type UsCategory } from '../lib/constants'
import { ApiRequestError } from '../lib/http'
import { BanIcon, EyeIcon, EyeOffIcon, ImageIcon, PencilIcon, PlusIcon, TrashIcon } from './icons'
import { ListingModal } from './ListingModal'

type PanelState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly listings: readonly AdminListing[] }

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

/**
 * Precio editable en la propia celda: es el campo que más se toca y abrir el
 * modal para cambiar un número sería un paso de más. Commit en blur o Enter,
 * Escape revierte al valor del servidor.
 */
function PriceCell({
  listing,
  onCommit,
}: {
  readonly listing: AdminListing
  readonly onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(listing.price_usd.toFixed(2))
  // Escape hace blur, y el blur dispara commit(). Sin esta bandera el commit
  // correría con el borrador descartado y guardaría justo lo que se canceló.
  const isCancelling = useRef(false)

  // Si el valor del servidor cambia por fuera (recarga, rollback), se refleja.
  useEffect(() => {
    setDraft(listing.price_usd.toFixed(2))
  }, [listing.price_usd])

  const commit = (): void => {
    if (isCancelling.current) {
      isCancelling.current = false
      setDraft(listing.price_usd.toFixed(2))
      return
    }

    const parsed = Number.parseFloat(draft)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(listing.price_usd.toFixed(2))
      return
    }
    const rounded = Math.round(parsed * 100) / 100
    if (rounded === listing.price_usd) {
      setDraft(rounded.toFixed(2))
      return
    }
    onCommit(rounded)
  }

  return (
    <input
      className="admin-cell-input"
      type="number"
      min="0.01"
      step="0.01"
      inputMode="decimal"
      value={draft}
      aria-label={`Price for ${listing.name}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          isCancelling.current = true
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function ListingsPanel() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [state, setState] = useState<PanelState>({ status: 'loading' })
  const [actionError, setActionError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminListing | null>(null)
  const [isModalOpen, setModalOpen] = useState(false)

  const load = useCallback(async (term: string): Promise<void> => {
    setState({ status: 'loading' })
    try {
      const listings = await listListings(term)
      setState({ status: 'ready', listings })
    } catch (loadError: unknown) {
      setState({
        status: 'error',
        message: errorMessage(loadError, 'The items could not be loaded.'),
      })
    }
  }, [])

  useEffect(() => {
    void load(debouncedSearch)
  }, [load, debouncedSearch])

  const reload = useCallback((): void => {
    void load(debouncedSearch)
  }, [load, debouncedSearch])

  /**
   * Cambios de una sola celda: se pintan de inmediato y se revierten si el
   * servidor los rechaza. Recargar la tabla entera por un toggle se sentiría
   * lento y perdería la posición del scroll.
   */
  const patch = useCallback(
    async (
      listing: AdminListing,
      changes: Partial<Pick<AdminListing, 'price_usd' | 'category' | 'visible' | 'sold_out'>>,
    ): Promise<void> => {
      setActionError(null)
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              listings: current.listings.map((item) =>
                item.id === listing.id ? { ...item, ...changes } : item,
              ),
            }
          : current,
      )
      try {
        const saved = await updateListing(listing.id, changes)
        setState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                listings: current.listings.map((item) =>
                  item.id === saved.id ? saved : item,
                ),
              }
            : current,
        )
      } catch (patchError: unknown) {
        setActionError(errorMessage(patchError, 'The change could not be saved.'))
        setState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                listings: current.listings.map((item) =>
                  item.id === listing.id ? listing : item,
                ),
              }
            : current,
        )
      }
    },
    [],
  )

  const remove = useCallback(
    async (listing: AdminListing): Promise<void> => {
      const confirmed = window.confirm(
        `Delete "${listing.name}"? It will disappear from the store. Past orders keep their copy.`,
      )
      if (!confirmed) return

      setActionError(null)
      try {
        await deleteListing(listing.id)
        setState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                listings: current.listings.filter((item) => item.id !== listing.id),
              }
            : current,
        )
      } catch (deleteError: unknown) {
        setActionError(errorMessage(deleteError, 'The item could not be deleted.'))
      }
    },
    [],
  )

  const openNew = (): void => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (listing: AdminListing): void => {
    setEditing(listing)
    setModalOpen(true)
  }

  const count = state.status === 'ready' ? state.listings.length : null

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Items</h1>
          {count !== null && (
            <p className="admin-head-count">
              {count} {count === 1 ? 'item' : 'items'} in the store
            </p>
          )}
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={openNew}>
          <PlusIcon size={13} /> New item
        </button>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search">
          <label className="admin-label" htmlFor="admin-listing-search">
            Search
          </label>
          <input
            id="admin-listing-search"
            className="admin-input"
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {actionError !== null && (
        <p className="admin-error" role="alert">
          {actionError}
        </p>
      )}

      <div className="admin-card">
        {state.status === 'loading' && (
          <div className="admin-state">
            <div className="admin-spinner" />
            Loading items…
          </div>
        )}

        {state.status === 'error' && (
          <div className="admin-state" role="alert">
            <p className="admin-state-title">We hit a snag</p>
            <p>{state.message}</p>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={reload}>
              Try again
            </button>
          </div>
        )}

        {state.status === 'ready' && state.listings.length === 0 && (
          <div className="admin-state">
            <p className="admin-state-title">
              {debouncedSearch.trim() === '' ? 'No items yet' : 'No matches'}
            </p>
            <p>
              {debouncedSearch.trim() === ''
                ? 'Add your first item and it will show up in the store right away.'
                : `Nothing matches “${debouncedSearch.trim()}”.`}
            </p>
          </div>
        )}

        {state.status === 'ready' && state.listings.length > 0 && (
          <>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Photo</span>
                    </th>
                    <th scope="col">Name</th>
                    <th scope="col">Category</th>
                    <th scope="col">Price (USD)</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.listings.map((listing) => (
                    <tr
                      key={listing.id}
                      className={listing.visible ? undefined : 'admin-row-hidden'}
                    >
                      <td>
                        {listing.image_url !== null ? (
                          <img className="admin-thumb" src={listing.image_url} alt="" />
                        ) : (
                          <div className="admin-thumb admin-thumb-empty">
                            <ImageIcon size={18} />
                          </div>
                        )}
                      </td>

                      <td className="admin-cell-name">
                        {listing.name}
                        {listing.description !== null && listing.description !== '' && (
                          <span className="admin-cell-desc">{listing.description}</span>
                        )}
                      </td>

                      <td>
                        <select
                          className="admin-cell-select"
                          value={listing.category}
                          aria-label={`Category for ${listing.name}`}
                          onChange={(event) =>
                            void patch(listing, {
                              category: event.target.value as UsCategory,
                            })
                          }
                        >
                          {SHOP_CATEGORIES.map((option) => (
                            <option key={option.slug} value={option.slug}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <PriceCell
                          listing={listing}
                          onCommit={(price_usd) => void patch(listing, { price_usd })}
                        />
                        <span className="sr-only">{usd.format(listing.price_usd)}</span>
                      </td>

                      <td>
                        {/* Prioridad: Hidden > Sold out (manual) > Out of stock
                            (calculado) > Live. */}
                        {!listing.visible ? (
                          <span className="admin-badge admin-badge-neutral">Hidden</span>
                        ) : listing.sold_out ? (
                          <span className="admin-badge admin-badge-warn">Sold out</span>
                        ) : !listing.in_stock ? (
                          <span className="admin-badge admin-badge-warn">Out of stock</span>
                        ) : (
                          <span className="admin-badge admin-badge-ok">Live</span>
                        )}
                      </td>

                      <td>
                        <div className="admin-cell-actions">
                          <button
                            type="button"
                            className="admin-icon-btn"
                            onClick={() => void patch(listing, { visible: !listing.visible })}
                            aria-label={
                              listing.visible
                                ? `Hide ${listing.name} from the store`
                                : `Show ${listing.name} in the store`
                            }
                            title={listing.visible ? 'Hide from the store' : 'Show in the store'}
                          >
                            {listing.visible ? <EyeIcon /> : <EyeOffIcon />}
                          </button>
                          <button
                            type="button"
                            className={`admin-icon-btn${listing.sold_out ? ' is-soldout' : ''}`}
                            onClick={() => void patch(listing, { sold_out: !listing.sold_out })}
                            aria-label={
                              listing.sold_out
                                ? `Mark ${listing.name} as available`
                                : `Mark ${listing.name} as sold out`
                            }
                            title={listing.sold_out ? 'Mark as available' : 'Mark as sold out'}
                          >
                            <BanIcon />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            onClick={() => openEdit(listing)}
                            aria-label={`Edit ${listing.name}`}
                            title="Edit"
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn is-danger"
                            onClick={() => void remove(listing)}
                            aria-label={`Delete ${listing.name}`}
                            title="Delete"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* El backend no pagina: corta en LISTINGS_CAP. Se avisa en vez de
                truncar en silencio y hacer creer que eso es todo. */}
            {state.listings.length >= LISTINGS_CAP && (
              <p className="admin-notice">
                Showing the first {LISTINGS_CAP} items. Use the search box to narrow
                things down.
              </p>
            )}
          </>
        )}
      </div>

      {isModalOpen && (
        <ListingModal
          listing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            reload()
          }}
        />
      )}
    </>
  )
}
