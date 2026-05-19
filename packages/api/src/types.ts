// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: number
  name: string
  email: string
  phone: string | null
  active: boolean
  can_view_cost: boolean
  company_id: number | null
  store_id: number | null
  /** Loaded when store relation is eager-loaded (login / me) */
  store: { id: number; name: string } | null
  /** Role names from model_has_roles — e.g. ["admin"] */
  roles: string[]
  created_at: string
}

export interface AuthResponse {
  token: string
  user: User
}

// ─── Products ─────────────────────────────────────────────────────────────────

export interface Product {
  id: number
  name: string
  sku: string
  barcode: string | null
  description: string | null
  cost: number
  active: boolean
  category_id: number | null
  category: { id: number; name: string } | null
  /** Prices nested object — always present (nulls when not set) */
  prices: {
    price_1: number | null
    price_2: number | null
    price_3: number | null
    price_4: number | null
    price_5: number | null
  }
  allow_cash: boolean
  allow_card: boolean
  /** Sum of all warehouse quantities (precomputed by backend via withSum) */
  stock_total: number
  images: Array<{ id: number; image_path: string; url: string; sort_order: number }>
  created_at: string
  updated_at: string
}

export interface CreateProductInput {
  name: string
  sku: string
  cost?: number
  active?: boolean
  allow_cash?: boolean
  allow_card?: boolean
  prices?: {
    price_1?: number
    price_2?: number
    price_3?: number
    price_4?: number
    price_5?: number
  }
}

export interface UpdateProductInput {
  name?: string
  sku?: string
  barcode?: string
  description?: string
  cost?: number
  active?: boolean
  allow_cash?: boolean
  allow_card?: boolean
  category_id?: number | null
  prices?: {
    price_1?: number
    price_2?: number
    price_3?: number
    price_4?: number
    price_5?: number
  }
}

// ─── Stores & Warehouses ──────────────────────────────────────────────────────

export interface Store {
  id: number
  company_id: number
  name: string
  address: string | null
  phone: string | null
  email: string | null
  manager_id: number | null
  active: boolean
}

export interface Warehouse {
  id: number
  company_id: number
  store_id: number | null
  name: string
  type: 'central' | 'store'
  description: string | null
  active: boolean
  store: { id: number; name: string } | null
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: number
  product_id: number
  warehouse_id: number
  quantity: number
  warehouse: {
    id: number
    name: string
    type: 'central' | 'store'
    store: { id: number; name: string } | null
  } | null
}

export interface UpdateInventoryInput {
  quantity: number
  notes?: string
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

// ─── Customers ───────────────────────────────────────────────────────────────

export interface Customer {
  id: number
  external_member_id: string | null
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  loyalty_tier: string | null
  /** Alias de loyalty_tier — el backend siempre lo incluye */
  tier: string
  points: number
  credit_balance: number
  created_at: string
  updated_at: string
}

export interface CreateCustomerInput {
  name: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  external_member_id?: string
  loyalty_tier?: string
}

export interface UpdateCustomerInput {
  name?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
}

export interface GetCustomersParams {
  search?: string
  page?: number
  per_page?: number
}

// ─── Sales (detail) ───────────────────────────────────────────────────────────

export interface SaleItemDetail {
  id: number
  product_id: number
  quantity: number
  price: number
  total: number
  product: { id: number; name: string; sku: string } | null
  created_at: string
}

export interface SalePaymentDetail {
  id: number
  payment_method_id: number
  terminal_id: number | null
  amount: number
  commission_amount: number
  payment_method: { id: number; name: string } | null
  created_at: string
}

export interface SaleDetail {
  id: number
  store_id: number | null
  user_id: number | null
  customer_id: number | null
  draft_id: number | null
  subtotal: number
  discount: number
  total: number
  commission_amount: number
  status: string
  customer: { id: number; name: string; tier: string | null } | null
  items: SaleItemDetail[]
  payments: SalePaymentDetail[]
  sold_at: string
  created_at: string
}

export interface GetSalesParams {
  store_id?: number
  from?: string
  to?: string
  status?: string
  per_page?: number
  page?: number
}

// ─── Drafts ───────────────────────────────────────────────────────────────────

export interface Draft {
  id: number
  status: 'open' | 'suspended' | 'completed' | 'cancelled'
  /** Subtotal calculado en backend (suma de items.total). Solo presente si items se cargaron. */
  subtotal?: number | null
  items_count?: number | null
  /** Presente cuando GET /sales-drafts/{id} (show) eager-carga items.product. */
  items?: DraftItem[]
  expires_at?: string | null
  warned_at?: string | null
  created_at: string
}

export type DraftPriceLevel = 'a' | 'b' | 'c'

export interface AddDraftItemInput {
  product_id: number
  quantity: number
  price: number
  price_level: DraftPriceLevel
}

export interface UpdateDraftItemInput {
  quantity: number
  price: number
  price_level: DraftPriceLevel
}

export interface DraftItem {
  id: number
  draft_id: number
  product_id: number
  quantity: number
  price: number
  price_level: DraftPriceLevel
}

// ─── Sales ────────────────────────────────────────────────────────────────────

export interface SalePayment {
  /** ID from payment_methods table: 1=Efectivo, 2=Tarjeta débito, 3=Tarjeta crédito, 4=Transferencia */
  payment_method_id: number
  amount: number
  terminal_id?: number
}

/**
 * Checkout payload. Soporta dos modos (ADR-014):
 *   A) Legacy: `draft_id` apunta a un draft ya creado en backend con items.
 *   B) Direct: `items` + `store_id` + `register_session_id` (+ `customer_id`)
 *      cuando el carrito vive solo en frontend hasta el cobro.
 */
export interface SaleDirectItem {
  product_id: number
  quantity: number
  price: number
  price_level?: 'a' | 'b' | 'c'
}
export interface CreateSaleInput {
  draft_id?: number
  discount?: number
  payments: SalePayment[]
  // Modo B (direct checkout)
  items?: SaleDirectItem[]
  store_id?: number
  register_session_id?: number
  customer_id?: number | null
}

export interface Sale {
  id: number
  draft_id: number
  total: number
  status: 'completed'
  created_at: string
}

// ─── Layaways (Apartados) ─────────────────────────────────────────────────────

export type LayawayStatus = 'active' | 'paid' | 'delivered' | 'cancelled' | 'expired'

export interface LayawayPayment {
  id: number
  layaway_id: number
  amount: number
  payment_method_id: number | null
  payment_method: { id: number; name: string } | null
  notes: string | null
  created_at: string | null
}

export interface LayawayLog {
  id: number
  layaway_id: number
  action: string
  user_id: number
  notes: string | null
  created_at: string
}

export interface Layaway {
  id: number
  code: string
  store_id: number
  user_id: number
  customer_id: number
  product_id: number
  warehouse_id: number | null
  quantity: number
  price: number
  total: number
  down_payment: number
  status: LayawayStatus
  expires_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  /** Computed — present when payments relation is loaded */
  paid_amount: number | null
  balance: number | null
  product: { id: number; name: string; sku: string } | null
  customer: { id: number; name: string; phone: string | null; email: string | null } | null
  payments: LayawayPayment[] | null
  logs: LayawayLog[] | null
}

export interface LayawayListResponse {
  data: Layaway[]
  pagination: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
}

export interface CreateLayawayPayload {
  store_id: number
  customer_id: number
  product_id: number
  warehouse_id?: number
  quantity?: number
  price?: number
  down_payment: number
  payment_method_id?: number
  expires_at?: string
  notes?: string
}

export interface UpdateLayawayPayload {
  notes?: string
  expires_at?: string | null
}

export interface AddLayawayPaymentPayload {
  amount: number
  payment_method_id?: number
  notes?: string
}

export interface LayawayPaymentResponse {
  payment: LayawayPayment
  paid_amount: number
  balance: number
  status: LayawayStatus
}

// ─── Points / Loyalty ────────────────────────────────────────────────────────

export interface PointTransaction {
  id: number
  customer_id: number
  points: number
  reason: string
  reference_type: 'pre_sale' | 'sale'
  reference_id: number
  created_at: string
}

export interface AwardPointsInput {
  customer_id: number
  amount: number
  reason: string
  reference_type: 'pre_sale' | 'sale'
  reference_id: number
}

export interface AwardPointsResult {
  customer_id: number
  points_awarded: number
  new_total: number
}

// ─── External Card Lookup (stub for Tadaima loyalty integration) ──────────────

export interface ExternalCardLookup {
  external_member_id: string
  name: string
  email: string
  phone: string | null
  estatus?: string | null
  vigencia?: string | null
  nivel?: string | null
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: number
  user_id: number
  type: 'presale_ready' | string
  reference_id: number | null
  message: string
  read_at: string | null
  created_at: string
}

// ─── Pre-Sale Phase 2 inputs ──────────────────────────────────────────────────

export interface AssignInventoryInput {
  quantities: Array<{ store_id: number; quantity: number }>
  pickup_deadline: string
  arrival_date?: string
}

export interface CreateProductFromPreSaleInput {
  sku: string
  name?: string
  cost?: number
  category_id?: number
  price_1: number
  price_2?: number
  price_3?: number
  price_4?: number
  price_5?: number
  warehouse_quantities: Array<{ warehouse_id: number; quantity: number }>
}

export interface ExpireToInventoryInput {
  warehouse_id: number
}

// ─── Pre-Sale Catalogs (nuevo esquema) ───────────────────────────────────────

export type PreSaleCatalogStatus = 'draft' | 'published' | 'arrived' | 'closed' | 'cancelled' | 'completed'

export interface PreSaleCatalogStoreLimit {
  store_id: number
  limit_qty: number
}

export interface PreSaleCatalog {
  id: number
  status: PreSaleCatalogStatus
  product_name: string
  image_path: string | null
  image_url?: string | null
  store_limits?: PreSaleCatalogStoreLimit[]
  cost: number | null
  margin_percent: number | null
  price_1: number | null
  price_2: number | null
  price_3: number | null
  price_4: number | null
  price_5: number | null
  advance_payment: number
  preorder_limit: number | null
  arrival_date: string | null
  pickup_deadline: string | null
  created_at: string
  updated_at: string
  category: { id: number; name: string } | null
  supplier: { id: number; name: string } | null
  product: { id: number; name: string } | null
  created_by: { id: number; name: string } | null
  /** Computed — requires orderItems relation loaded */
  reserved_count: number | null
  /** All non-cancelled orders — never decreases after liquidation */
  sold_count: number | null
  /** Orders already delivered/liquidated */
  delivered_count: number | null
}

export interface PreSaleCatalogListResponse {
  data: PreSaleCatalog[]
  pagination: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
}

export interface CreatePreSaleCatalogInput {
  product_name: string
  category_id?: number
  supplier_id?: number
  product_id?: number
  cost?: number
  margin_percent?: number
  price_1: number
  price_2?: number
  price_3?: number
  price_4?: number
  price_5?: number
  advance_payment?: number
  preorder_limit?: number
  arrival_date?: string
  pickup_deadline?: string
  status?: 'draft' | 'published'
}

export interface UpdatePreSaleCatalogInput {
  product_name?: string
  category_id?: number | null
  supplier_id?: number | null
  product_id?: number | null
  cost?: number | null
  margin_percent?: number | null
  price_1?: number
  price_2?: number | null
  price_3?: number | null
  price_4?: number | null
  price_5?: number | null
  advance_payment?: number | null
  preorder_limit?: number | null
  arrival_date?: string | null
  pickup_deadline?: string | null
}

export interface UpdatePreSaleCatalogStatusInput {
  status: PreSaleCatalogStatus
}

export interface GetPreSaleCatalogsParams {
  status?: PreSaleCatalogStatus
  category_id?: number
  supplier_id?: number
  per_page?: number
  page?: number
}

// ─── Pre-Sale Orders / Folios (nuevo esquema) ─────────────────────────────────

export type PreSaleOrderStatus = 'pending' | 'ready' | 'delivered' | 'expired' | 'cancelled'

export interface PreSaleOrderItem {
  id: number
  pre_sale_catalog_id: number
  product_id: number | null
  quantity: number
  price_level: number
  unit_price: number
  subtotal: number
  status: 'pending' | 'delivered'
  delivered_at: string | null
  created_at: string
  catalog: { id: number; product_name: string; image_path: string | null; status: PreSaleCatalogStatus | null; pickup_deadline: string | null } | null
}

export interface PreSaleOrderPayment {
  id: number
  amount: number
  notes: string | null
  created_at: string
  payment_method: { id: number; name: string } | null
  cashier: { id: number; name: string } | null
}

export interface PreSaleOrderLog {
  id: number
  from_status: PreSaleOrderStatus | null
  to_status: PreSaleOrderStatus
  notes: string | null
  created_at: string
  user: { id: number; name: string } | null
}

export interface PreSaleOrder {
  id: number
  code: string
  status: PreSaleOrderStatus
  linked_sale_id: number | null
  pickup_deadline: string | null
  notes: string | null
  created_at: string
  updated_at: string
  store: { id: number; name: string } | null
  user: { id: number; name: string } | null
  customer: { id: number; name: string; email: string | null; phone: string | null } | null
  /** Present when items relation is loaded */
  items: PreSaleOrderItem[] | null
  /** Present when payments relation is loaded */
  payments: PreSaleOrderPayment[] | null
  /** Computed — requires items relation */
  total: number | null
  /** Computed — requires payments relation */
  paid_amount: number | null
  /** Computed — requires both relations */
  balance: number | null
}

export interface PreSaleOrderListResponse {
  data: PreSaleOrder[]
  pagination: {
    total: number
    per_page: number
    current_page: number
    last_page: number
  }
}

export interface GetPreSaleOrdersParams {
  store_id?: number
  customer_id?: number
  catalog_id?: number
  status?: PreSaleOrderStatus | string  // supports CSV e.g. "pending,ready"
  code?: string
  from?: string
  to?: string
  per_page?: number
  page?: number
}

export interface CreatePreSaleOrderInput {
  store_id: number
  customer_id: number
  items: Array<{
    catalog_id: number
    quantity: number
    price_level: 1 | 2 | 3 | 4 | 5
  }>
  advance_amount?: number
  payment_method_id?: number
  linked_sale_id?: number
  notes?: string
}

export interface AddPreSaleOrderPaymentInput {
  amount: number
  payment_method_id?: number
  notes?: string
}

export interface UpdatePreSaleOrderStatusInput {
  status: 'ready' | 'delivered' | 'expired' | 'cancelled'
  pickup_deadline?: string
  notes?: string
}

// ─── Manga / Librería ─────────────────────────────────────────────────────────

export interface Manga {
  id: number
  name: string
  volume_number: number | null
  editorial: string | null
  code: string | null
  genre: string | null
  public_price: number
  profit_margin_percent: number
  cost: number
  active: boolean
  price_1: number | null
  price_2: number | null
  price_3: number | null
  price_4: number | null
  price_5: number | null
  stock: number
  image_url: string | null
  created_at: string
  updated_at: string
}

export interface MangaInventoryItem {
  id: number
  manga_id: number
  warehouse_id: number
  quantity: number
  warehouse: {
    id: number
    name: string
    type: 'central' | 'store'
    store: { id: number; name: string } | null
  } | null
}

export interface CreateMangaInput {
  name: string
  volume_number?: number | null
  editorial?: string | null
  code?: string | null
  genre?: string | null
  public_price: number
  profit_margin_percent: number
  active?: boolean
  price_1?: number | null
  price_2?: number | null
  price_3?: number | null
  price_4?: number | null
  price_5?: number | null
  stock?: number
}

export interface UpdateMangaInput {
  name?: string
  volume_number?: number | null
  editorial?: string | null
  code?: string | null
  genre?: string | null
  public_price?: number
  profit_margin_percent?: number
  active?: boolean
  price_1?: number | null
  price_2?: number | null
  price_3?: number | null
  price_4?: number | null
  price_5?: number | null
}

// ─── API Error ────────────────────────────────────────────────────────────────

export interface ApiError {
  message: string
  errors?: Record<string, string[]>
}
