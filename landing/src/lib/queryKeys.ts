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
} as const
