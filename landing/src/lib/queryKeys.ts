export const queryKeys = {
  products: {
    all: ['products'] as const,
    list: (params?: Record<string, unknown>) => ['products', 'list', params ?? {}] as const,
    detail: (id: number) => ['products', 'detail', id] as const,
  },
  customers: {
    all: ['customers'] as const,
    list: (params?: Record<string, unknown>) => ['customers', 'list', params ?? {}] as const,
    detail: (id: number) => ['customers', 'detail', id] as const,
  },
  stores: {
    all: ['stores'] as const,
    list: () => ['stores', 'list'] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: () => ['categories', 'list'] as const,
  },
  suppliers: {
    all: ['suppliers'] as const,
    list: () => ['suppliers', 'list'] as const,
  },
  reports: {
    all: ['reports'] as const,
    sales: (params?: Record<string, unknown>) => ['reports', 'sales', params ?? {}] as const,
    inventory: (params?: Record<string, unknown>) => ['reports', 'inventory', params ?? {}] as const,
    cash: (params?: Record<string, unknown>) => ['reports', 'cash', params ?? {}] as const,
    preSales: (params?: Record<string, unknown>) => ['reports', 'pre-sales', params ?? {}] as const,
    customers: (params?: Record<string, unknown>) => ['reports', 'customers', params ?? {}] as const,
    topProducts: (params?: Record<string, unknown>) => ['reports', 'top-products', params ?? {}] as const,
  },
  transfers: {
    all: ['transfers'] as const,
    list: (params?: Record<string, unknown>) => ['transfers', 'list', params ?? {}] as const,
  },
  inventory: {
    all: ['inventory'] as const,
    byProduct: (productId: number) => ['inventory', 'byProduct', productId] as const,
  },
  salesDrafts: {
    all: ['salesDrafts'] as const,
    reservedStock: (storeId?: number | null) => ['salesDrafts', 'reservedStock', storeId ?? 0] as const,
    expiring: () => ['salesDrafts', 'expiring'] as const,
  },
  preSaleCatalogs: {
    all: ['preSaleCatalogs'] as const,
    list: (params?: Record<string, unknown>) => ['preSaleCatalogs', 'list', params ?? {}] as const,
  },
  preSaleOrders: {
    all: ['preSaleOrders'] as const,
    list: (params?: Record<string, unknown>) => ['preSaleOrders', 'list', params ?? {}] as const,
  },
  sales: {
    all: ['sales'] as const,
    list: (params?: Record<string, unknown>) => ['sales', 'list', params ?? {}] as const,
  },
  users: {
    all: ['users'] as const,
    list: () => ['users', 'list'] as const,
  },
  roles: {
    all: ['roles'] as const,
    list: () => ['roles', 'list'] as const,
  },
  paymentMethods: {
    all: ['paymentMethods'] as const,
    list: () => ['paymentMethods', 'list'] as const,
  },
  systemSettings: {
    all: ['systemSettings'] as const,
    map: () => ['systemSettings', 'map'] as const,
    exchangeRate: () => ['systemSettings', 'exchangeRate'] as const,
  },
  mangas: {
    all: ['mangas'] as const,
    list: (params?: Record<string, unknown>) => ['mangas', 'list', params ?? {}] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (params?: { unread_only?: boolean }) => ['notifications', 'list', params ?? {}] as const,
  },
  // Historial del día — sales + presales agregados, scope por tienda.
  // Cache persistente (IndexedDB) para que la apertura del modal sea instantánea
  // y un refetch en background traiga lo nuevo tras cada checkout/cancelación.
  historial: {
    all: ['historial'] as const,
    // La fecha LOCAL va en la key: al cruzar la medianoche la key cambia y se
    // refetchea solo, sin que el cache persistido (IndexedDB) del día anterior
    // —típicamente vacío— enmascare las ventas del día nuevo. Bug 2026-06-04:
    // abrir caja de noche + vender pasada la medianoche dejaba la venta
    // "invisible" en el historial del día anterior cacheado.
    today: (storeId?: number | null, date?: string) =>
      ['historial', 'today', storeId ?? 0, date ?? ''] as const,
  },
} as const
