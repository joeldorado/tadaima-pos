import { useCallback, useEffect, useState } from 'react'
import { ApiRequestError, fetchCatalog, type UsListing } from '../lib/api'
import type { UsCategory } from '../lib/constants'

export type CatalogState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly listings: readonly UsListing[] }

interface UseCatalogResult {
  readonly state: CatalogState
  readonly reload: () => void
}

/** Loads the public catalog (optionally scoped to one category), with retry. */
export function useCatalog(category?: UsCategory): UseCatalogResult {
  const [state, setState] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    fetchCatalog(category ? { category } : {})
      .then((listings) => {
        if (!cancelled) setState({ status: 'ready', listings })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message =
          error instanceof ApiRequestError
            ? error.message
            : 'Something went wrong while loading the catalog.'
        setState({ status: 'error', message })
      })

    return () => {
      cancelled = true
    }
  }, [category, attempt])

  const reload = useCallback(() => setAttempt((count) => count + 1), [])

  return { state, reload }
}
