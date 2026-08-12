// Endpoints AUTENTICADOS de la CUENTA del cliente de la tienda (guard `us`
// del backend — tokens de UsCustomer, independientes del panel de admin).
//
// La cuenta se CREA en el checkout (lib/api.ts placeOrder con password); aquí
// vive el login de regreso (email O teléfono), "My Orders" y Settings.
import { request } from './http'

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface Customer {
  readonly id: number
  readonly name: string
  readonly email: string
  readonly phone: string
  readonly address: string | null
  readonly city: string | null
  readonly state: string | null
  readonly zip: string | null
  readonly country: string | null
}

export type CustomerOrderStatus = 'new' | 'contacted' | 'completed' | 'cancelled'

export interface CustomerOrderItem {
  readonly id: number
  readonly name: string
  /** Snapshot congelado al comprar. */
  readonly price_usd: number
  readonly quantity: number
  readonly line_total_usd: number
}

export interface OrderShipping {
  readonly address: string | null
  readonly city: string | null
  readonly state: string | null
  readonly zip: string | null
  readonly country: string | null
}

export interface CustomerOrder {
  readonly id: number
  /** Folio tipo "TUS-000001". */
  readonly order_number: string
  readonly status: CustomerOrderStatus
  readonly total_usd: number
  readonly created_at: string
  readonly shipping: OrderShipping
  readonly items: readonly CustomerOrderItem[]
}

interface CustomerLoginResponse {
  readonly token: string
  readonly customer: Customer
}

// ── Shapes crudos + mappers ──────────────────────────────────────────────────

const ORDER_STATUSES: readonly CustomerOrderStatus[] = ['new', 'contacted', 'completed', 'cancelled']

function toStatus(value: string): CustomerOrderStatus {
  return ORDER_STATUSES.includes(value as CustomerOrderStatus)
    ? (value as CustomerOrderStatus)
    : 'new'
}

function toNumber(value: string | number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

interface RawCustomerOrderItem {
  readonly id: number
  readonly name: string
  /** El backend serializa decimal(10,2) como string ("12.00"). */
  readonly price_usd: string | number
  readonly quantity: number
  readonly line_total_usd: string | number
}

interface RawCustomerOrder {
  readonly id: number
  readonly order_number: string
  readonly status: string
  readonly total_usd: string | number
  readonly created_at: string
  readonly shipping?: Partial<OrderShipping>
  readonly items?: readonly RawCustomerOrderItem[]
}

export function mapCustomerOrder(raw: RawCustomerOrder): CustomerOrder {
  return {
    id: raw.id,
    order_number: raw.order_number,
    status: toStatus(raw.status),
    total_usd: toNumber(raw.total_usd),
    created_at: raw.created_at,
    shipping: {
      address: raw.shipping?.address ?? null,
      city: raw.shipping?.city ?? null,
      state: raw.shipping?.state ?? null,
      zip: raw.shipping?.zip ?? null,
      country: raw.shipping?.country ?? null,
    },
    items: (raw.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      price_usd: toNumber(item.price_usd),
      quantity: item.quantity,
      line_total_usd: toNumber(item.line_total_usd),
    })),
  }
}

// ── Endpoints ────────────────────────────────────────────────────────────────

/** POST /us/auth/login — identifier acepta email O teléfono. */
export async function customerLogin(
  identifier: string,
  password: string,
): Promise<CustomerLoginResponse> {
  return await request<CustomerLoginResponse>('/us/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })
}

/** GET /us/account/me — valida el token guardado al recargar. */
export async function fetchCustomerMe(): Promise<Customer> {
  return await request<Customer>('/us/account/me', { auth: true, as: 'customer' })
}

/** Tope del backend: sin paginación, corta en 100 (más nuevos primero). */
export const MY_ORDERS_CAP = 100

/** GET /us/account/orders — SOLO los pedidos del cliente autenticado. */
export async function fetchMyOrders(): Promise<readonly CustomerOrder[]> {
  const data = await request<readonly RawCustomerOrder[]>('/us/account/orders', {
    auth: true,
    as: 'customer',
  })
  return Array.isArray(data) ? data.map(mapCustomerOrder) : []
}

export interface CustomerProfileInput {
  readonly name: string
  readonly phone: string
  readonly address: string
  readonly city: string
  readonly state: string
  readonly zip: string
  readonly country: string
}

/** PUT /us/account/profile — el email NO se edita (es la llave de la cuenta). */
export async function updateCustomerProfile(input: CustomerProfileInput): Promise<Customer> {
  return await request<Customer>('/us/account/profile', {
    method: 'PUT',
    auth: true,
    as: 'customer',
    body: JSON.stringify(input),
  })
}

/** PUT /us/account/password — al cambiar, el backend revoca las otras sesiones. */
export async function changeCustomerPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await request<unknown>('/us/account/password', {
    method: 'PUT',
    auth: true,
    as: 'customer',
    body: JSON.stringify({ current_password: currentPassword, password: newPassword }),
  })
}

/** POST /us/account/logout — revoca el token actual del lado del servidor. */
export async function customerLogout(): Promise<void> {
  await request<unknown>('/us/account/logout', { method: 'POST', auth: true, as: 'customer' })
}
