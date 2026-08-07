import { useEffect, useState } from 'react'
import { parseRoute, type Route } from '../lib/routes'

/** Current route derived from location.hash; re-renders on hashchange. */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))

  useEffect(() => {
    const handleHashChange = (): void => {
      setRoute(parseRoute(window.location.hash))
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return route
}
