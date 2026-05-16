import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { broadcastQueryClient } from '@tanstack/query-broadcast-client-experimental'
import { get, set, del } from 'idb-keyval'

const ONE_DAY_MS = 24 * 60 * 60_000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // gcTime must be >= persist maxAge or persisted data is garbage-collected
      // before it can be restored. We persist for 24h, so gcTime matches.
      gcTime: ONE_DAY_MS,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})

/**
 * IndexedDB persister via idb-keyval. Storage limit is hundreds of MB instead
 * of localStorage's 5-10 MB. With ~8000 products in the catalog the serialized
 * cache is ~12 MB, well beyond localStorage but trivial for IndexedDB.
 *
 * On mount, new tabs read the cache from here so Caja 2/3/4/5 don't re-fetch
 * products/catalogs/TC that Caja 1 already has.
 */
const CACHE_KEY = 'tadaima-rq-cache'
export const queryPersister = createAsyncStoragePersister({
  storage: {
    getItem: async (key: string) => (await get(key)) ?? null,
    setItem: async (key: string, value: string) => { await set(key, value) },
    removeItem: async (key: string) => { await del(key) },
  },
  key: CACHE_KEY,
  throttleTime: 1000,
})

/**
 * Broadcast invalidations and mutations across tabs via BroadcastChannel.
 * When Caja 1 sells a product, Caja 2/3/4/5 see the stock update in <100ms.
 */
if (typeof window !== 'undefined') {
  broadcastQueryClient({
    queryClient,
    broadcastChannel: 'tadaima-rq',
  })
}
