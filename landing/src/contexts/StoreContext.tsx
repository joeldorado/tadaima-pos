import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from '@tadaima/auth'
import { getStores, getProducts } from '@tadaima/api'
import type { Store } from '@tadaima/api'

interface StoreContextValue {
  activeStore: Store | null
  stores: Store[]
  setActiveStore: (store: Store) => void
  isLoading: boolean
  /** Re-fetch stores from API (call after creating/editing a store) */
  refreshStores: () => Promise<void>
  /** Total product count — used to gate Caja access */
  productCount: number
  /** Re-fetch product count (call after creating/deleting a product) */
  refreshProductCount: () => Promise<void>
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { user } = useAuth()
  const [stores, setStores] = useState<Store[]>([])
  const [activeStore, setActiveStore] = useState<Store | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [productCount, setProductCount] = useState(0)

  const fetchStores = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const list = await getStores({ active: true })
      // Admins and owners see all stores; users with an assigned store see only theirs
      const adminRoles = ['admin', 'super_admin', 'owner', 'dueño']
      const userIsAdmin = user.roles?.some(r => adminRoles.includes(r.toLowerCase()))
      const visible = (!userIsAdmin && user.store_id != null)
        ? list.filter(s => s.id === user.store_id)
        : list
      setStores(visible)
      // Auto-select only when there's exactly one option (single-store cashier)
      // Admins with multiple stores must pick explicitly in Caja
      if (visible.length === 1 && visible[0] !== undefined) {
        setActiveStore(prev => prev ?? visible[0]!)
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  const fetchProductCount = useCallback(async () => {
    if (!user) return
    try {
      const paginated = await getProducts()
      setProductCount(paginated.total)
    } catch {
      // Silently fail
    }
  }, [user?.id])

  // Initial load
  useEffect(() => {
    if (!user) {
      setStores([])
      setActiveStore(null)
      setProductCount(0)
      return
    }
    void fetchStores()
    void fetchProductCount()
  }, [user?.id])

  const refreshStores = useCallback(async () => {
    await fetchStores()
  }, [fetchStores])

  const refreshProductCount = useCallback(async () => {
    await fetchProductCount()
  }, [fetchProductCount])

  return (
    <StoreContext.Provider value={{
      activeStore, stores, setActiveStore, isLoading,
      refreshStores,
      productCount, refreshProductCount,
    }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useActiveStore(): StoreContextValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useActiveStore must be used inside StoreProvider')
  return ctx
}
